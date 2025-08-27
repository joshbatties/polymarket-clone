import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../../ledger/ledger.service';
import { KycService } from '../../kyc/services/kyc.service';
import { ResponsibleGamblingService } from '../../responsible-gambling/responsible-gambling.service';
import { AmlService } from '../../aml/aml.service';
import { CreateWithdrawalDto } from '../dto/create-withdrawal.dto';
import { ApproveWithdrawalDto, RejectWithdrawalDto } from '../dto/admin-withdrawal-action.dto';
import { Withdrawal, WithdrawalStatus, BankAccountStatus, LedgerEntryType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

interface WithdrawalLimits {
  dailyLimitCents: number;
  weeklyLimitCents: number;
  minimumAmountCents: number;
  maximumAmountCents: number;
}

interface StripePayoutResponse {
  id: string;
  status: string;
  arrival_date: number;
}

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);
  private readonly withdrawalLimits: WithdrawalLimits;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly kycService: KycService,
    private readonly rgService: ResponsibleGamblingService,
    private readonly amlService: AmlService,
    private readonly configService: ConfigService,
  ) {
    this.withdrawalLimits = {
      dailyLimitCents: parseInt(this.configService.get('WITHDRAWAL_DAILY_LIMIT_CENTS', '50000000')), // $500k default
      weeklyLimitCents: parseInt(this.configService.get('WITHDRAWAL_WEEKLY_LIMIT_CENTS', '200000000')), // $2M default
      minimumAmountCents: parseInt(this.configService.get('WITHDRAWAL_MIN_AMOUNT_CENTS', '100')), // $1 default
      maximumAmountCents: parseInt(this.configService.get('WITHDRAWAL_MAX_AMOUNT_CENTS', '10000000')), // $100k default
    };
  }

  async createWithdrawal(userId: string, createWithdrawalDto: CreateWithdrawalDto): Promise<Withdrawal> {
    const { amountCents, bankAccountId, currency = 'AUD' } = createWithdrawalDto;

    // Validate compliance requirements
    await this.validateWithdrawalCompliance(userId, amountCents);

    // Get or validate bank account
    const bankAccount = await this.getBankAccountForWithdrawal(userId, bankAccountId);

    // Check withdrawal limits
    await this.validateWithdrawalLimits(userId, amountCents);

    // Check user has sufficient balance
    await this.validateSufficientBalance(userId, amountCents, currency);

    return await this.prisma.$transaction(async (tx) => {
      // Lock user funds (move from available to pending)
      await this.lockUserFunds(userId, amountCents, currency, tx);

      // Create withdrawal record
      const withdrawal = await tx.withdrawal.create({
        data: {
          userId,
          bankAccountId: bankAccount.id,
          amountCents: BigInt(amountCents),
          currency,
          status: WithdrawalStatus.REQUESTED,
        },
        include: {
          bankAccount: true,
          user: true,
        },
      });

      // Log AML event for withdrawal request
      await this.amlService.logWithdrawalRequest(userId, amountCents, bankAccount.id);

      this.logger.log(`Withdrawal request created: ${withdrawal.id} for user ${userId}, amount: ${amountCents} cents`);
      return withdrawal;
    });
  }

  async getUserWithdrawals(userId: string, limit: number = 50): Promise<Withdrawal[]> {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      include: {
        bankAccount: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getWithdrawal(withdrawalId: string): Promise<Withdrawal> {
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: {
        bankAccount: true,
        user: true,
        reviewer: true,
      },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    return withdrawal;
  }

  async approveWithdrawal(
    withdrawalId: string,
    adminUserId: string,
    approveDto: ApproveWithdrawalDto,
  ): Promise<Withdrawal> {
    const withdrawal = await this.getWithdrawal(withdrawalId);

    if (withdrawal.status !== WithdrawalStatus.REQUESTED && withdrawal.status !== WithdrawalStatus.PENDING_REVIEW) {
      throw new BadRequestException('Withdrawal cannot be approved in current status');
    }

    // Process the payout via Stripe
    const payoutResult = await this.processStripePayout(withdrawal);

    return await this.prisma.$transaction(async (tx) => {
      // Update withdrawal status
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.PROCESSING,
          reviewedBy: adminUserId,
          reviewNotes: approveDto.reviewNotes,
          paymentRef: payoutResult.id,
          processedAt: new Date(),
        },
        include: {
          bankAccount: true,
          user: true,
        },
      });

      // Process ledger transaction: user_pending -> external_bank
      await this.processWithdrawalLedgerTransaction(withdrawal, tx);

      this.logger.log(`Withdrawal approved: ${withdrawalId} by admin ${adminUserId}`);
      return updatedWithdrawal;
    });
  }

  async rejectWithdrawal(
    withdrawalId: string,
    adminUserId: string,
    rejectDto: RejectWithdrawalDto,
  ): Promise<Withdrawal> {
    const withdrawal = await this.getWithdrawal(withdrawalId);

    if (withdrawal.status !== WithdrawalStatus.REQUESTED && withdrawal.status !== WithdrawalStatus.PENDING_REVIEW) {
      throw new BadRequestException('Withdrawal cannot be rejected in current status');
    }

    return await this.prisma.$transaction(async (tx) => {
      // Update withdrawal status
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.REJECTED,
          reviewedBy: adminUserId,
          reviewNotes: rejectDto.reviewNotes,
          processedAt: new Date(),
        },
        include: {
          bankAccount: true,
          user: true,
        },
      });

      // Unlock user funds (move from pending back to available)
      await this.unlockUserFunds(withdrawal.userId, Number(withdrawal.amountCents), withdrawal.currency, tx);

      this.logger.log(`Withdrawal rejected: ${withdrawalId} by admin ${adminUserId}`);
      return updatedWithdrawal;
    });
  }

  async getPendingWithdrawals(limit: number = 100): Promise<Withdrawal[]> {
    return this.prisma.withdrawal.findMany({
      where: {
        status: {
          in: [WithdrawalStatus.REQUESTED, WithdrawalStatus.PENDING_REVIEW],
        },
      },
      include: {
        bankAccount: true,
        user: true,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  private async validateWithdrawalCompliance(userId: string, amountCents: number): Promise<void> {
    // Check KYC status - must be approved for withdrawals
    const kycEligibility = await this.kycService.checkWithdrawalEligibility(userId, amountCents);
    if (!kycEligibility.allowed) {
      throw new ForbiddenException(kycEligibility.reason || 'KYC verification required for withdrawals');
    }

    // Check responsible gambling status
    await this.rgService.validateTradingAction(userId, 'WITHDRAW');

    // AML monitoring for withdrawal patterns
    const amlAnalysis = await this.amlService.monitorWithdrawal(
      userId,
      amountCents,
      'BANK_TRANSFER',
      undefined, // IP address would be passed from controller
      {
        platform: 'web',
        action: 'withdrawal_request',
      }
    );

    if (amlAnalysis.suggestedAction === 'BLOCK') {
      throw new ForbiddenException('Withdrawal blocked for compliance review');
    }
  }

  private async getBankAccountForWithdrawal(userId: string, bankAccountId?: string) {
    let bankAccount;

    if (bankAccountId) {
      bankAccount = await this.prisma.bankAccount.findFirst({
        where: {
          id: bankAccountId,
          userId,
          status: BankAccountStatus.VERIFIED,
        },
      });

      if (!bankAccount) {
        throw new BadRequestException('Invalid or unverified bank account');
      }
    } else {
      // Use primary bank account
      bankAccount = await this.prisma.bankAccount.findFirst({
        where: {
          userId,
          isPrimary: true,
          status: BankAccountStatus.VERIFIED,
        },
      });

      if (!bankAccount) {
        throw new BadRequestException('No verified primary bank account found');
      }
    }

    return bankAccount;
  }

  private async validateWithdrawalLimits(userId: string, amountCents: number): Promise<void> {
    // Check amount limits
    if (amountCents < this.withdrawalLimits.minimumAmountCents) {
      throw new BadRequestException(`Minimum withdrawal amount is ${this.withdrawalLimits.minimumAmountCents} cents`);
    }

    if (amountCents > this.withdrawalLimits.maximumAmountCents) {
      throw new BadRequestException(`Maximum withdrawal amount is ${this.withdrawalLimits.maximumAmountCents} cents`);
    }

    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyWithdrawals = await this.prisma.withdrawal.aggregate({
      where: {
        userId,
        createdAt: { gte: today },
        status: { notIn: [WithdrawalStatus.REJECTED, WithdrawalStatus.CANCELLED] },
      },
      _sum: { amountCents: true },
    });

    const dailyTotal = Number(dailyWithdrawals._sum.amountCents || 0) + amountCents;
    if (dailyTotal > this.withdrawalLimits.dailyLimitCents) {
      throw new BadRequestException('Daily withdrawal limit exceeded');
    }

    // Check weekly limit
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weeklyWithdrawals = await this.prisma.withdrawal.aggregate({
      where: {
        userId,
        createdAt: { gte: weekAgo },
        status: { notIn: [WithdrawalStatus.REJECTED, WithdrawalStatus.CANCELLED] },
      },
      _sum: { amountCents: true },
    });

    const weeklyTotal = Number(weeklyWithdrawals._sum.amountCents || 0) + amountCents;
    if (weeklyTotal > this.withdrawalLimits.weeklyLimitCents) {
      throw new BadRequestException('Weekly withdrawal limit exceeded');
    }
  }

  private async validateSufficientBalance(userId: string, amountCents: number, currency: string): Promise<void> {
    const userAccount = await this.prisma.walletAccount.findFirst({
      where: {
        userId,
        accountType: 'USER_CASH',
        currency,
      },
    });

    if (!userAccount) {
      throw new BadRequestException('User cash account not found');
    }

    if (Number(userAccount.availableCents) < amountCents) {
      throw new BadRequestException('Insufficient balance for withdrawal');
    }
  }

  private async lockUserFunds(userId: string, amountCents: number, currency: string, tx: any): Promise<void> {
    // Move funds from available to pending
    await tx.walletAccount.updateMany({
      where: {
        userId,
        accountType: 'USER_CASH',
        currency,
      },
      data: {
        availableCents: { decrement: BigInt(amountCents) },
        pendingCents: { increment: BigInt(amountCents) },
      },
    });
  }

  private async unlockUserFunds(userId: string, amountCents: number, currency: string, tx: any): Promise<void> {
    // Move funds from pending back to available
    await tx.walletAccount.updateMany({
      where: {
        userId,
        accountType: 'USER_CASH',
        currency,
      },
      data: {
        availableCents: { increment: BigInt(amountCents) },
        pendingCents: { decrement: BigInt(amountCents) },
      },
    });
  }

  private async processStripePayout(withdrawal: Withdrawal): Promise<StripePayoutResponse> {
    // TODO: Implement actual Stripe Connect Payout
    // This is a placeholder implementation
    
    const mockPayoutResponse: StripePayoutResponse = {
      id: `po_${Date.now()}`,
      status: 'pending',
      arrival_date: Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60), // 3 days from now
    };

    this.logger.log(`Mock Stripe payout initiated: ${mockPayoutResponse.id} for withdrawal ${withdrawal.id}`);
    return mockPayoutResponse;
  }

  private async processWithdrawalLedgerTransaction(withdrawal: Withdrawal, tx: any): Promise<void> {
    // Create ledger entries for the withdrawal
    const ledgerEntries = [
      {
        accountId: `user_cash_${withdrawal.userId}`,
        counterAccountId: 'external_bank',
        userId: undefined,
        amountCents: -BigInt(withdrawal.amountCents), // Debit from user pending
        entryType: LedgerEntryType.WITHDRAWAL,
        description: `Withdrawal to bank account ${withdrawal.bankAccountId}`,
        metadata: {
          withdrawalId: withdrawal.id,
          bankAccountId: withdrawal.bankAccountId,
          paymentRef: withdrawal.paymentRef,
        },
      },
      {
        accountId: 'external_bank',
        counterAccountId: `user_cash_${withdrawal.userId}`,
        userId: undefined,
        amountCents: BigInt(withdrawal.amountCents), // Credit to external bank
        entryType: LedgerEntryType.WITHDRAWAL,
        description: `Withdrawal from user ${withdrawal.userId}`,
        metadata: {
          withdrawalId: withdrawal.id,
          bankAccountId: withdrawal.bankAccountId,
          paymentRef: withdrawal.paymentRef,
        },
      },
    ];

    await this.ledgerService.postTransaction({
      entries: ledgerEntries,
      idempotencyKey: `withdrawal_${withdrawal.id}`,
    });
  }
}
