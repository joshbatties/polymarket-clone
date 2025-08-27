import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
      typescript: true,
    });

    this.logger.log('Stripe service initialized');
  }

  /**
   * Create a PaymentIntent for Apple Pay deposits
   */
  async createDepositPaymentIntent(params: {
    amountCents: number;
    currency: string;
    userId: string;
    userEmail: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.PaymentIntent> {
    const { amountCents, currency, userId, userEmail, description, metadata = {} } = params;

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountCents,
        currency: currency.toLowerCase(),
        customer: undefined, // We could create/link Stripe customers later
        description: description || `Deposit for ${userEmail}`,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never', // Mobile app context
        },
        // Enable Apple Pay specifically
        payment_method_types: ['card'],
        metadata: {
          userId,
          userEmail,
          type: 'deposit',
          platform: 'aussie-markets',
          ...metadata,
        },
        // Configure for Australian market
        setup_future_usage: undefined, // One-time payment
        confirmation_method: 'automatic',
        capture_method: 'automatic',
      });

      this.logger.log(`Created PaymentIntent: ${paymentIntent.id} for user ${userId}, amount: ${amountCents} ${currency}`);
      
      return paymentIntent;
    } catch (error) {
      this.logger.error(`Failed to create PaymentIntent for user ${userId}:`, error);
      throw new BadRequestException(`Payment setup failed: ${error.message}`);
    }
  }

  /**
   * Retrieve a PaymentIntent by ID
   */
  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      this.logger.error(`Failed to retrieve PaymentIntent ${paymentIntentId}:`, error);
      throw new BadRequestException(`Payment not found: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature from Stripe
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    endpointSecret: string,
  ): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, endpointSecret);
    } catch (error) {
      this.logger.error('Webhook signature verification failed:', error);
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  /**
   * Create a refund for a PaymentIntent
   */
  async createRefund(params: {
    paymentIntentId: string;
    amountCents?: number;
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    metadata?: Record<string, string>;
  }): Promise<Stripe.Refund> {
    const { paymentIntentId, amountCents, reason = 'requested_by_customer', metadata = {} } = params;

    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amountCents,
        reason,
        metadata: {
          platform: 'aussie-markets',
          ...metadata,
        },
      });

      this.logger.log(`Created refund: ${refund.id} for PaymentIntent: ${paymentIntentId}`);
      
      return refund;
    } catch (error) {
      this.logger.error(`Failed to create refund for PaymentIntent ${paymentIntentId}:`, error);
      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }

  /**
   * List recent PaymentIntents for a user (for debugging/admin)
   */
  async listPaymentIntentsForUser(userId: string, limit: number = 10): Promise<Stripe.PaymentIntent[]> {
    try {
      const paymentIntents = await this.stripe.paymentIntents.list({
        limit,
        expand: ['data.charges'],
      });

      // Filter by user metadata
      return paymentIntents.data.filter(pi => pi.metadata?.userId === userId);
    } catch (error) {
      this.logger.error(`Failed to list PaymentIntents for user ${userId}:`, error);
      throw new BadRequestException(`Failed to retrieve payment history: ${error.message}`);
    }
  }

  /**
   * Get Stripe account information
   */
  async getAccountInfo(): Promise<Stripe.Account> {
    try {
      return await this.stripe.accounts.retrieve();
    } catch (error) {
      this.logger.error('Failed to retrieve Stripe account info:', error);
      throw new BadRequestException(`Account info retrieval failed: ${error.message}`);
    }
  }

  /**
   * Check if Apple Pay is enabled for the account
   */
  async checkApplePayAvailability(): Promise<boolean> {
    try {
      const account = await this.getAccountInfo();
      
      // Check if account supports Apple Pay
      // Note: This is a simplified check - in practice you'd also verify domain validation
      return account.capabilities?.card_payments === 'active';
    } catch (error) {
      this.logger.warn('Could not verify Apple Pay availability:', error);
      return false;
    }
  }

  /**
   * Get publishable key for frontend
   */
  getPublishableKey(): string {
    const publishableKey = this.configService.get<string>('STRIPE_PUBLISHABLE_KEY');
    
    if (!publishableKey) {
      throw new Error('STRIPE_PUBLISHABLE_KEY is required');
    }

    return publishableKey;
  }

  /**
   * Extract payment metadata for ledger integration
   */
  extractPaymentMetadata(paymentIntent: Stripe.PaymentIntent): {
    userId: string;
    userEmail: string;
    amountCents: number;
    currency: string;
    paymentIntentId: string;
    chargeId?: string;
    paymentMethodType?: string;
  } {
    const charge = (paymentIntent as any).charges?.data?.[0];
    
    return {
      userId: paymentIntent.metadata?.userId || '',
      userEmail: paymentIntent.metadata?.userEmail || '',
      amountCents: paymentIntent.amount,
      currency: paymentIntent.currency.toUpperCase(),
      paymentIntentId: paymentIntent.id,
      chargeId: charge?.id,
      paymentMethodType: charge?.payment_method_details?.type,
    };
  }
}
