import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBankAccountDto } from '../dto/create-bank-account.dto';
import { BankAccount, BankAccountStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class BankAccountService {
  private readonly logger = new Logger(BankAccountService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createBankAccount(userId: string, createBankAccountDto: CreateBankAccountDto): Promise<BankAccount> {
    const { bankName, accountName, bsb, accountNumber } = createBankAccountDto;

    // Create a hash of the full account number for verification without storing it
    const accountNumberHash = this.hashAccountNumber(accountNumber);
    
    // Create masked account number (show last 4 digits)
    const maskedAccountNumber = this.maskAccountNumber(accountNumber);

    try {
      // Check if this bank account already exists for the user
      const existingAccount = await this.prisma.bankAccount.findFirst({
        where: {
          userId,
          bsb,
          accountNumberHash,
        },
      });

      if (existingAccount) {
        throw new ConflictException('Bank account already exists');
      }

      // If this is the user's first bank account, make it primary
      const existingAccountsCount = await this.prisma.bankAccount.count({
        where: { userId },
      });

      const isPrimary = existingAccountsCount === 0;

      const bankAccount = await this.prisma.bankAccount.create({
        data: {
          userId,
          bankName,
          accountName,
          bsb,
          maskedAccountNumber,
          accountNumberHash,
          isPrimary,
          status: BankAccountStatus.PENDING_VERIFICATION,
        },
      });

      this.logger.log(`Bank account created for user ${userId}: ${maskedAccountNumber}`);
      return bankAccount;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Failed to create bank account for user ${userId}: ${error.message}`);
      throw new BadRequestException('Failed to create bank account');
    }
  }

  async getUserBankAccounts(userId: string): Promise<BankAccount[]> {
    return this.prisma.bankAccount.findMany({
      where: { userId },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async getBankAccount(userId: string, bankAccountId: string): Promise<BankAccount> {
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: {
        id: bankAccountId,
        userId,
      },
    });

    if (!bankAccount) {
      throw new NotFoundException('Bank account not found');
    }

    return bankAccount;
  }

  async setPrimaryBankAccount(userId: string, bankAccountId: string): Promise<BankAccount> {
    const bankAccount = await this.getBankAccount(userId, bankAccountId);

    if (bankAccount.status !== BankAccountStatus.VERIFIED) {
      throw new BadRequestException('Bank account must be verified to set as primary');
    }

    await this.prisma.$transaction(async (tx) => {
      // Remove primary status from all user's bank accounts
      await tx.bankAccount.updateMany({
        where: { userId },
        data: { isPrimary: false },
      });

      // Set the selected account as primary
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { isPrimary: true },
      });
    });

    return this.getBankAccount(userId, bankAccountId);
  }

  async deleteBankAccount(userId: string, bankAccountId: string): Promise<void> {
    const bankAccount = await this.getBankAccount(userId, bankAccountId);

    // Check if there are any pending withdrawals for this account
    const pendingWithdrawals = await this.prisma.withdrawal.count({
      where: {
        bankAccountId,
        status: {
          in: ['REQUESTED', 'PENDING_REVIEW', 'APPROVED', 'PROCESSING'],
        },
      },
    });

    if (pendingWithdrawals > 0) {
      throw new BadRequestException('Cannot delete bank account with pending withdrawals');
    }

    await this.prisma.bankAccount.delete({
      where: { id: bankAccountId },
    });

    // If this was the primary account and user has other accounts, set another as primary
    if (bankAccount.isPrimary) {
      const remainingAccounts = await this.getUserBankAccounts(userId);
      if (remainingAccounts.length > 0) {
        await this.setPrimaryBankAccount(userId, remainingAccounts[0].id);
      }
    }

    this.logger.log(`Bank account deleted for user ${userId}: ${bankAccount.maskedAccountNumber}`);
  }

  async verifyBankAccount(bankAccountId: string): Promise<BankAccount> {
    const bankAccount = await this.prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
    });

    if (!bankAccount) {
      throw new NotFoundException('Bank account not found');
    }

    if (bankAccount.status === BankAccountStatus.VERIFIED) {
      return bankAccount;
    }

    return this.prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        status: BankAccountStatus.VERIFIED,
        verifiedAt: new Date(),
      },
    });
  }

  /**
   * Verify account ownership (placeholder for actual verification logic)
   * In production, this would integrate with bank verification services
   */
  async initiateAccountVerification(userId: string, bankAccountId: string): Promise<{ verificationId: string }> {
    const bankAccount = await this.getBankAccount(userId, bankAccountId);

    if (bankAccount.status === BankAccountStatus.VERIFIED) {
      throw new BadRequestException('Bank account is already verified');
    }

    // TODO: Integrate with actual bank verification service
    // For now, we'll simulate verification by auto-approving in development
    const verificationId = crypto.randomUUID();

    this.logger.log(`Bank verification initiated for account ${bankAccountId}: ${verificationId}`);

    // In development, automatically verify after a short delay
    if (process.env.NODE_ENV === 'development') {
      setTimeout(async () => {
        try {
          await this.verifyBankAccount(bankAccountId);
          this.logger.log(`Auto-verified bank account ${bankAccountId} in development mode`);
        } catch (error) {
          this.logger.error(`Failed to auto-verify bank account ${bankAccountId}: ${error.message}`);
        }
      }, 2000);
    }

    return { verificationId };
  }

  private hashAccountNumber(accountNumber: string): string {
    return crypto.createHash('sha256').update(accountNumber).digest('hex');
  }

  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) {
      return '*'.repeat(accountNumber.length);
    }
    const visibleDigits = accountNumber.slice(-4);
    const maskedDigits = '*'.repeat(accountNumber.length - 4);
    return maskedDigits + visibleDigits;
  }

  /**
   * Validate BSB format (Australian Bank State Branch)
   */
  private validateBSB(bsb: string): boolean {
    return /^\d{6}$/.test(bsb);
  }

  /**
   * Validate Australian account number format
   */
  private validateAccountNumber(accountNumber: string): boolean {
    return /^\d{4,20}$/.test(accountNumber);
  }
}
