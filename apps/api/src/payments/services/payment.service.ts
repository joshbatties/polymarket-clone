import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../../ledger/ledger.service';
import { StripeService } from './stripe.service';
import { UsersService } from '../../users/users.service';
import { KycService } from '../../kyc/services/kyc.service';
import { ResponsibleGamblingService } from '../../responsible-gambling/responsible-gambling.service';
import { AmlService } from '../../aml/aml.service';
import { LedgerEntryType } from '@prisma/client';
import Stripe from 'stripe';

export interface DepositIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  publishableKey: string;
}

export interface DepositLimits {
  dailyLimitCents: number;
  dailyUsedCents: number;
  dailyRemainingCents: number;
  velocityLimitCents: number;
  velocityUsedCents: number;
  velocityRemainingCents: number;
  isAtLimit: boolean;
}

export interface PaymentWebhookResult {
  processed: boolean;
  transactionId?: string;
  message: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  // Configurable limits
  private readonly dailyLimitCents: number;
  private readonly velocityLimitCents: number;
  private readonly velocityWindowHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly kycService: KycService,
    private readonly rgService: ResponsibleGamblingService,
    private readonly amlService: AmlService,
  ) {
    // Load deposit limits from config with sensible defaults
    this.dailyLimitCents = parseInt(this.configService.get('DEPOSIT_DAILY_LIMIT_CENTS', '1000000')); // $10,000 default
    this.velocityLimitCents = parseInt(this.configService.get('DEPOSIT_VELOCITY_LIMIT_CENTS', '500000')); // $5,000 default
    this.velocityWindowHours = parseInt(this.configService.get('DEPOSIT_VELOCITY_WINDOW_HOURS', '1')); // 1 hour default

    this.logger.log(`Payment service initialized with limits: Daily=$${this.dailyLimitCents/100}, Velocity=$${this.velocityLimitCents/100}/${this.velocityWindowHours}h`);
  }

  /**
   * Create a deposit PaymentIntent with limits checking
   */
  async createDepositIntent(
    userId: string,
    amountCents: number,
    currency: string = 'AUD',
    description?: string,
  ): Promise<DepositIntentResult> {
    this.logger.log(`Creating deposit intent for user ${userId}, amount: ${amountCents} ${currency}`);

    // Get user information
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException('Email must be verified before making deposits');
    }

    // Compliance checks
    await this.validateCompliance(userId, amountCents);

    // Check deposit limits
    await this.validateDepositLimits(userId, amountCents);

    // Ensure user has a cash account
    await this.ensureUserCashAccount(userId, currency);

    // Create Stripe PaymentIntent
    const paymentIntent = await this.stripeService.createDepositPaymentIntent({
      amountCents,
      currency,
      userId,
      userEmail: user.email,
      description: description || `Deposit to Aussie Markets wallet`,
      metadata: {
        userId,
        userEmail: user.email,
        type: 'deposit',
        amountCents: amountCents.toString(),
        currency,
      },
    });

    // Store payment intent reference for webhook processing
    await this.storePaymentIntentReference(paymentIntent.id, userId, amountCents, currency);

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      amountCents,
      currency,
      publishableKey: this.stripeService.getPublishableKey(),
    };
  }

  /**
   * Process successful payment webhook
   */
  async processPaymentSuccess(stripeEvent: Stripe.Event): Promise<PaymentWebhookResult> {
    const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
    const webhookId = `stripe_${stripeEvent.id}`;

    this.logger.log(`Processing payment success for PaymentIntent: ${paymentIntent.id}`);

    try {
      // Extract payment metadata
      const metadata = this.stripeService.extractPaymentMetadata(paymentIntent);
      
      if (!metadata.userId) {
        throw new BadRequestException('Missing userId in payment metadata');
      }

      // Get user and accounts
      const user = await this.usersService.findById(metadata.userId);
      if (!user) {
        throw new NotFoundException(`User ${metadata.userId} not found`);
      }

      const userCashAccount = await this.getUserCashAccount(metadata.userId, metadata.currency);
      const custodyCashAccount = await this.getCustodyCashAccount(metadata.currency);

      // Create ledger transaction with idempotency
      const transaction = await this.ledgerService.postTransaction({
        entries: [
          {
            accountId: userCashAccount.id,
            counterAccountId: custodyCashAccount.id,
            userId: metadata.userId,
            amountCents: BigInt(metadata.amountCents),
            entryType: LedgerEntryType.DEPOSIT,
            description: `Deposit via Stripe (${metadata.paymentMethodType || 'card'})`,
            metadata: {
              paymentIntentId: metadata.paymentIntentId,
              chargeId: metadata.chargeId,
              paymentMethodType: metadata.paymentMethodType,
              stripeEventId: stripeEvent.id,
              webhookId,
            },
          },
          {
            accountId: custodyCashAccount.id,
            counterAccountId: userCashAccount.id,
            amountCents: BigInt(-metadata.amountCents),
            entryType: LedgerEntryType.DEPOSIT,
            description: `Custody credit for user deposit`,
            metadata: {
              paymentIntentId: metadata.paymentIntentId,
              chargeId: metadata.chargeId,
              userId: metadata.userId,
              stripeEventId: stripeEvent.id,
              webhookId,
            },
          },
        ],
        idempotencyKey: webhookId,
        scope: 'stripe_webhook',
      });

      this.logger.log(`Successfully processed deposit: ${transaction.transactionId} for user ${metadata.userId}`);

      return {
        processed: true,
        transactionId: transaction.transactionId,
        message: `Deposit of ${metadata.amountCents/100} ${metadata.currency} processed successfully`,
      };

    } catch (error) {
      this.logger.error(`Failed to process payment success for ${paymentIntent.id}:`, error);
      
      // If this is an idempotency conflict, that's actually success (already processed)
      if (error.message?.includes('idempotency key')) {
        return {
          processed: true,
          message: 'Payment already processed (idempotency)',
        };
      }

      throw error;
    }
  }

  /**
   * Get deposit limits for a user
   */
  async getDepositLimits(userId: string): Promise<DepositLimits> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const velocityStart = new Date(now.getTime() - (this.velocityWindowHours * 60 * 60 * 1000));

    // Get daily deposits
    const dailyDeposits = await this.getDepositSum(userId, dayStart, now);
    
    // Get velocity window deposits
    const velocityDeposits = await this.getDepositSum(userId, velocityStart, now);

    const dailyRemainingCents = Math.max(0, this.dailyLimitCents - dailyDeposits);
    const velocityRemainingCents = Math.max(0, this.velocityLimitCents - velocityDeposits);

    return {
      dailyLimitCents: this.dailyLimitCents,
      dailyUsedCents: dailyDeposits,
      dailyRemainingCents,
      velocityLimitCents: this.velocityLimitCents,
      velocityUsedCents: velocityDeposits,
      velocityRemainingCents,
      isAtLimit: dailyRemainingCents === 0 || velocityRemainingCents === 0,
    };
  }

  /**
   * Get user's wallet balance
   */
  async getWalletBalance(userId: string, currency: string = 'AUD') {
    try {
      const account = await this.getUserCashAccount(userId, currency);
      return await this.ledgerService.getAccountBalance(account.id);
    } catch (error) {
      // If account doesn't exist, return zero balance
      if (error.message?.includes('not found')) {
        return {
          accountId: null,
          availableCents: BigInt(0),
          pendingCents: BigInt(0),
          totalCents: BigInt(0),
          currency,
        };
      }
      throw error;
    }
  }

  /**
   * Get user's transaction history
   */
  async getTransactionHistory(
    userId: string,
    options: {
      cursor?: string;
      limit?: number;
      entryType?: LedgerEntryType;
      fromDate?: Date;
      toDate?: Date;
    } = {}
  ) {
    try {
      const account = await this.getUserCashAccount(userId, 'AUD');
      return await this.ledgerService.getAccountLedger(account.id, options);
    } catch (error) {
      // If account doesn't exist, return empty history
      if (error.message?.includes('not found')) {
        return {
          entries: [],
          hasMore: false,
          nextCursor: null,
        };
      }
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private async validateDepositLimits(userId: string, amountCents: number): Promise<void> {
    const limits = await this.getDepositLimits(userId);

    if (amountCents > limits.dailyRemainingCents) {
      throw new ForbiddenException(
        `Deposit exceeds daily limit. Remaining: $${limits.dailyRemainingCents/100} AUD`
      );
    }

    if (amountCents > limits.velocityRemainingCents) {
      throw new ForbiddenException(
        `Deposit exceeds velocity limit. Remaining: $${limits.velocityRemainingCents/100} AUD in ${this.velocityWindowHours}h window`
      );
    }
  }

  private async validateCompliance(userId: string, amountCents: number): Promise<void> {
    // Check responsible gambling status and limits
    await this.rgService.validateTradingAction(userId, 'DEPOSIT');
    
    const rgLimitsCheck = await this.rgService.checkDepositLimits(userId, amountCents);
    if (!rgLimitsCheck.allowed) {
      throw new ForbiddenException(rgLimitsCheck.reason);
    }

    // Check KYC eligibility for deposits
    const kycEligibility = await this.kycService.checkDepositEligibility(userId, amountCents);
    if (!kycEligibility.allowed) {
      if (kycEligibility.requiresKyc) {
        throw new ForbiddenException('KYC verification required for this deposit amount');
      }
      throw new ForbiddenException(kycEligibility.reason);
    }

    // Perform AML monitoring
    const amlAnalysis = await this.amlService.monitorDeposit(
      userId,
      amountCents,
      'STRIPE',
      undefined, // IP address would be passed from controller
      {
        platform: 'web',
        source: 'apple_pay',
      }
    );

    if (amlAnalysis.suggestedAction === 'BLOCK') {
      throw new ForbiddenException('Deposit blocked for compliance review');
    }

    if (amlAnalysis.suggestedAction === 'REVIEW') {
      // Allow the deposit but flag for review
      this.logger.warn(`Deposit flagged for review: User ${userId}, Amount ${amountCents}, Risk ${amlAnalysis.riskScore}`);
    }
  }

  private async getDepositSum(userId: string, fromDate: Date, toDate: Date): Promise<number> {
    try {
      const account = await this.getUserCashAccount(userId, 'AUD');
      
      const result = await this.prisma.ledgerEntry.aggregate({
        where: {
          accountId: account.id,
          entryType: LedgerEntryType.DEPOSIT,
          amountCents: { gt: 0 }, // Only credits (positive amounts)
          timestamp: {
            gte: fromDate,
            lte: toDate,
          },
        },
        _sum: {
          amountCents: true,
        },
      });

      return Number(result._sum.amountCents || 0);
    } catch (error) {
      // If account doesn't exist, no deposits have been made
      if (error.message?.includes('not found')) {
        return 0;
      }
      throw error;
    }
  }

  private async ensureUserCashAccount(userId: string, currency: string) {
    try {
      return await this.getUserCashAccount(userId, currency);
    } catch (error) {
      if (error.message?.includes('not found')) {
        // Create the account
        return await this.ledgerService.createWalletAccount({
          userId,
          accountType: 'user_cash',
          currency,
        });
      }
      throw error;
    }
  }

  private async getUserCashAccount(userId: string, currency: string) {
    const account = await this.prisma.walletAccount.findUnique({
      where: {
        userId_accountType_currency: {
          userId,
          accountType: 'user_cash',
          currency,
        },
      },
    });

    if (!account) {
      throw new NotFoundException(`User cash account not found for user ${userId} in ${currency}`);
    }

    return account;
  }

  private async getCustodyCashAccount(currency: string) {
    const account = await this.prisma.walletAccount.findUnique({
      where: {
        userId_accountType_currency: {
          userId: null as any, // System custody account
          accountType: 'custody_cash',
          currency,
        },
      },
    });

    if (!account) {
      throw new NotFoundException(`Custody cash account not found for ${currency}`);
    }

    return account;
  }

  private async storePaymentIntentReference(
    paymentIntentId: string,
    userId: string,
    amountCents: number,
    currency: string,
  ) {
    // Store reference in database for webhook processing and audit trail
    // This could be a separate table, but for now we'll use metadata in an idempotency key
    await this.prisma.idempotencyKey.create({
      data: {
        key: `payment_intent_${paymentIntentId}`,
        scope: 'payment_intent',
        response: {
          paymentIntentId,
          userId,
          amountCents,
          currency,
          status: 'created',
          createdAt: new Date().toISOString(),
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });
  }
}
