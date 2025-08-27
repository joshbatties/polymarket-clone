import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerEntryType, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

export interface LedgerEntryRequest {
  accountId: string;
  counterAccountId: string;
  userId?: string;
  amountCents: bigint;
  entryType: LedgerEntryType;
  description: string;
  metadata?: Record<string, any>;
}

export interface TransactionRequest {
  entries: LedgerEntryRequest[];
  idempotencyKey: string;
  scope?: string;
}

export interface LedgerTransaction {
  transactionId: string;
  entries: LedgerEntryRequest[];
  timestamp: Date;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Post a double-entry transaction to the ledger with idempotency protection
   * 
   * @param request - Transaction request with entries and idempotency key
   * @returns Promise<LedgerTransaction> - The created transaction
   * @throws ConflictException if idempotency key already exists
   * @throws BadRequestException if entries don't balance or validation fails
   */
  async postTransaction(request: TransactionRequest): Promise<LedgerTransaction> {
    const { entries, idempotencyKey, scope = 'ledger' } = request;

    // Validate the transaction entries
    this.validateTransactionEntries(entries);

    // Check idempotency key and execute transaction atomically
    return await this.prisma.$transaction(
      async (tx) => {
        // Check if idempotency key already exists
        const existingKey = await tx.idempotencyKey.findUnique({
          where: { key: idempotencyKey },
        });

        if (existingKey) {
          if (existingKey.response) {
            // Return cached response for duplicate request
            return existingKey.response as unknown as LedgerTransaction;
          } else {
            throw new ConflictException(
              `Transaction with idempotency key ${idempotencyKey} already exists`
            );
          }
        }

        // Generate unique transaction ID
        const transactionId = uuidv4();
        const timestamp = new Date();

        // Create ledger entries
        const createdEntries = [];
        for (const entry of entries) {
          const ledgerEntry = await tx.ledgerEntry.create({
            data: {
              transactionId,
              accountId: entry.accountId,
              counterAccountId: entry.counterAccountId,
              userId: entry.userId,
              amountCents: entry.amountCents,
              entryType: entry.entryType,
              description: entry.description,
              metadata: entry.metadata || {},
              timestamp,
            },
          });
          createdEntries.push(ledgerEntry);
        }

        // Update wallet account balances
        await this.updateAccountBalances(tx, entries);

        // Create the transaction response
        const transaction: LedgerTransaction = {
          transactionId,
          entries,
          timestamp,
        };

        // Store idempotency key with response
        await tx.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            scope,
            response: transaction as any,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          },
        });

        this.logger.log(`Posted transaction ${transactionId} with ${entries.length} entries`);
        
        return transaction;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000, // 10 seconds
      }
    );
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { transactionId },
      include: {
        account: true,
        counterAccount: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (entries.length === 0) {
      return null;
    }

    return {
      transactionId,
      entries,
      timestamp: entries[0].timestamp,
    };
  }

  /**
   * Get ledger entries for a specific account
   */
  async getAccountLedger(
    accountId: string,
    options: {
      cursor?: string;
      limit?: number;
      entryType?: LedgerEntryType;
      fromDate?: Date;
      toDate?: Date;
    } = {}
  ) {
    const { cursor, limit = 50, entryType, fromDate, toDate } = options;

    const where: Prisma.LedgerEntryWhereInput = {
      OR: [
        { accountId },
        { counterAccountId: accountId },
      ],
    };

    if (entryType) {
      where.entryType = entryType;
    }

    if (fromDate || toDate) {
      where.timestamp = {};
      if (fromDate) where.timestamp.gte = fromDate;
      if (toDate) where.timestamp.lte = toDate;
    }

    const entries = await this.prisma.ledgerEntry.findMany({
      where,
      include: {
        account: true,
        counterAccount: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit + 1, // Take one extra to check if there are more
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor
      }),
    });

    const hasMore = entries.length > limit;
    const results = hasMore ? entries.slice(0, -1) : entries;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return {
      entries: results,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: string) {
    const account = await this.prisma.walletAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new BadRequestException(`Account ${accountId} not found`);
    }

    return {
      accountId,
      availableCents: account.availableCents,
      pendingCents: account.pendingCents,
      totalCents: account.availableCents + account.pendingCents,
      currency: account.currency,
    };
  }

  /**
   * Validate that transaction entries follow double-entry rules
   */
  private validateTransactionEntries(entries: LedgerEntryRequest[]): void {
    if (!entries || entries.length === 0) {
      throw new BadRequestException('Transaction must have at least one entry');
    }

    if (entries.length < 2) {
      throw new BadRequestException('Double-entry transaction must have at least 2 entries');
    }

    // Calculate total amount - should sum to zero
    const totalAmount = entries.reduce((sum, entry) => sum + entry.amountCents, BigInt(0));

    if (totalAmount !== BigInt(0)) {
      throw new BadRequestException(
        `Transaction entries must sum to zero. Current sum: ${totalAmount.toString()}`
      );
    }

    // Validate each entry
    for (const entry of entries) {
      if (!entry.accountId) {
        throw new BadRequestException('Each entry must have an accountId');
      }

      if (!entry.counterAccountId) {
        throw new BadRequestException('Each entry must have a counterAccountId');
      }

      if (entry.accountId === entry.counterAccountId) {
        throw new BadRequestException('Account and counter account cannot be the same');
      }

      if (entry.amountCents === BigInt(0)) {
        throw new BadRequestException('Entry amount cannot be zero');
      }

      if (!entry.description || entry.description.trim().length === 0) {
        throw new BadRequestException('Each entry must have a description');
      }

      if (!Object.values(LedgerEntryType).includes(entry.entryType)) {
        throw new BadRequestException(`Invalid entry type: ${entry.entryType}`);
      }
    }

    this.logger.debug(`Validated transaction with ${entries.length} entries`);
  }

  /**
   * Update wallet account balances based on ledger entries
   */
  private async updateAccountBalances(
    tx: Prisma.TransactionClient,
    entries: LedgerEntryRequest[]
  ): Promise<void> {
    // Group entries by account to batch updates
    const accountUpdates = new Map<string, bigint>();

    for (const entry of entries) {
      // Update the main account
      const currentAmount = accountUpdates.get(entry.accountId) || BigInt(0);
      accountUpdates.set(entry.accountId, currentAmount + entry.amountCents);
    }

    // Apply balance updates
    for (const [accountId, amountChange] of accountUpdates) {
      await tx.walletAccount.update({
        where: { id: accountId },
        data: {
          availableCents: {
            increment: amountChange,
          },
          updatedAt: new Date(),
        },
      });
    }

    this.logger.debug(`Updated balances for ${accountUpdates.size} accounts`);
  }

  /**
   * Clean up expired idempotency keys (should be run as a scheduled job)
   */
  async cleanupExpiredIdempotencyKeys(): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired idempotency keys`);
    return result.count;
  }

  /**
   * Create a wallet account for a user or system account
   */
  async createWalletAccount(data: {
    userId?: string;
    accountType: string;
    currency?: string;
  }) {
    const { userId, accountType, currency = 'AUD' } = data;

    return await this.prisma.walletAccount.create({
      data: {
        userId,
        accountType,
        currency,
        availableCents: BigInt(0),
        pendingCents: BigInt(0),
      },
    });
  }

  /**
   * Helper method to create common transaction types
   */
  async createDepositTransaction(
    userAccountId: string,
    custodyAccountId: string,
    amountCents: bigint,
    idempotencyKey: string,
    metadata: Record<string, any> = {}
  ): Promise<LedgerTransaction> {
    return this.postTransaction({
      entries: [
        {
          accountId: userAccountId,
          counterAccountId: custodyAccountId,
          amountCents: amountCents,
          entryType: LedgerEntryType.DEPOSIT,
          description: `Deposit of ${(Number(amountCents) / 100).toFixed(2)} AUD`,
          metadata: { ...metadata, type: 'deposit' },
        },
        {
          accountId: custodyAccountId,
          counterAccountId: userAccountId,
          amountCents: -amountCents,
          entryType: LedgerEntryType.DEPOSIT,
          description: `Custody account debit for user deposit`,
          metadata: { ...metadata, type: 'deposit_custody' },
        },
      ],
      idempotencyKey,
      scope: 'deposit',
    });
  }
}
