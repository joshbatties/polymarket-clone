import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { PaymentService } from './payment.service';
import Stripe from 'stripe';

export interface WebhookProcessingResult {
  eventId: string;
  eventType: string;
  processed: boolean;
  result?: any;
  error?: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,
    private readonly paymentService: PaymentService,
  ) {
    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required for webhook processing');
    }
    
    this.webhookSecret = secret;

    this.logger.log('Webhook service initialized');
  }

  /**
   * Process Stripe webhook with signature verification
   */
  async processStripeWebhook(
    payload: string | Buffer,
    signature: string,
  ): Promise<WebhookProcessingResult> {
    let event: Stripe.Event;

    // Verify webhook signature
    try {
      event = this.stripeService.verifyWebhookSignature(payload, signature, this.webhookSecret);
      this.logger.log(`Webhook signature verified for event: ${event.id} (${event.type})`);
    } catch (error) {
      this.logger.error('Webhook signature verification failed:', error);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Check for duplicate processing using event ID as idempotency key
    const isDuplicate = await this.checkEventProcessed(event.id);
    if (isDuplicate) {
      this.logger.log(`Event ${event.id} already processed, skipping`);
      return {
        eventId: event.id,
        eventType: event.type,
        processed: true,
        result: 'duplicate_event_skipped',
      };
    }

    // Process the event based on type
    try {
      const result = await this.processEventByType(event);
      
      // Mark event as processed
      await this.markEventProcessed(event.id, event.type, result);

      this.logger.log(`Successfully processed webhook event: ${event.id} (${event.type})`);
      
      return {
        eventId: event.id,
        eventType: event.type,
        processed: true,
        result,
      };
    } catch (error) {
      this.logger.error(`Failed to process webhook event ${event.id}:`, error);
      
      // Mark event as failed for debugging
      await this.markEventFailed(event.id, event.type, error.message);

      return {
        eventId: event.id,
        eventType: event.type,
        processed: false,
        error: error.message,
      };
    }
  }

  /**
   * Process event based on its type
   */
  private async processEventByType(event: Stripe.Event): Promise<any> {
    switch (event.type) {
      case 'payment_intent.succeeded':
        return await this.handlePaymentIntentSucceeded(event);
        
      case 'payment_intent.payment_failed':
        return await this.handlePaymentIntentFailed(event);
        
      case 'payment_intent.canceled':
        return await this.handlePaymentIntentCanceled(event);
        
      case 'charge.dispute.created':
        return await this.handleChargeDisputeCreated(event);
        
      case 'payment_method.attached':
        return await this.handlePaymentMethodAttached(event);
        
      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`);
        return { message: `Event type ${event.type} not handled`, handled: false };
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentIntentSucceeded(event: Stripe.Event) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    this.logger.log(`Processing payment_intent.succeeded: ${paymentIntent.id}`);
    
    // Only process deposit payments (could have other types later)
    if (paymentIntent.metadata?.type !== 'deposit') {
      this.logger.log(`Skipping non-deposit payment: ${paymentIntent.id}`);
      return { message: 'Non-deposit payment, skipped' };
    }

    // Process the deposit through PaymentService
    const result = await this.paymentService.processPaymentSuccess(event);
    
    return result;
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentIntentFailed(event: Stripe.Event) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const lastPaymentError = paymentIntent.last_payment_error;
    
    this.logger.warn(`Payment failed: ${paymentIntent.id}, Error: ${lastPaymentError?.message}`);
    
    // Log the failure for monitoring
    // In the future, we might want to notify the user or take other actions
    
    return {
      message: 'Payment failure logged',
      paymentIntentId: paymentIntent.id,
      error: lastPaymentError?.message,
      errorCode: lastPaymentError?.code,
    };
  }

  /**
   * Handle canceled payment
   */
  private async handlePaymentIntentCanceled(event: Stripe.Event) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    this.logger.log(`Payment canceled: ${paymentIntent.id}`);
    
    // Log the cancellation
    return {
      message: 'Payment cancellation logged',
      paymentIntentId: paymentIntent.id,
    };
  }

  /**
   * Handle charge dispute (chargeback)
   */
  private async handleChargeDisputeCreated(event: Stripe.Event) {
    const dispute = event.data.object as Stripe.Dispute;
    
    this.logger.error(`Charge dispute created: ${dispute.id} for charge: ${dispute.charge}`);
    
    // This is critical - we need to handle chargebacks
    // For now, just log it, but in production we'd want to:
    // 1. Freeze the user account
    // 2. Create a negative ledger entry
    // 3. Notify administrators
    // 4. Potentially reverse the original deposit
    
    return {
      message: 'Dispute logged - manual review required',
      disputeId: dispute.id,
      chargeId: dispute.charge,
      amount: dispute.amount,
      reason: dispute.reason,
    };
  }

  /**
   * Handle payment method attachment
   */
  private async handlePaymentMethodAttached(event: Stripe.Event) {
    const paymentMethod = event.data.object as Stripe.PaymentMethod;
    
    this.logger.log(`Payment method attached: ${paymentMethod.id}`);
    
    // Could be used for saving payment methods for future use
    return {
      message: 'Payment method attachment logged',
      paymentMethodId: paymentMethod.id,
      type: paymentMethod.type,
    };
  }

  /**
   * Check if event has already been processed
   */
  private async checkEventProcessed(eventId: string): Promise<boolean> {
    const existing = await this.getEventRecord(eventId);
    return existing !== null;
  }

  /**
   * Mark event as successfully processed
   */
  private async markEventProcessed(eventId: string, eventType: string, result: any): Promise<void> {
    await this.storeEventRecord(eventId, eventType, 'processed', result);
  }

  /**
   * Mark event as failed
   */
  private async markEventFailed(eventId: string, eventType: string, error: string): Promise<void> {
    await this.storeEventRecord(eventId, eventType, 'failed', { error });
  }

  /**
   * Store event processing record using idempotency key table
   */
  private async storeEventRecord(
    eventId: string,
    eventType: string,
    status: 'processed' | 'failed',
    data: any,
  ): Promise<void> {
    try {
      const key = `stripe_webhook_${eventId}`;
      
      // Try to create the record
      await this.paymentService['prisma'].idempotencyKey.create({
        data: {
          key,
          scope: 'stripe_webhook',
          response: {
            eventId,
            eventType,
            status,
            data,
            processedAt: new Date().toISOString(),
          },
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });
    } catch (error) {
      // If it already exists, that's fine (race condition)
      if (error.code !== 'P2002') {
        this.logger.error(`Failed to store event record for ${eventId}:`, error);
      }
    }
  }

  /**
   * Get event processing record
   */
  private async getEventRecord(eventId: string): Promise<any> {
    try {
      const key = `stripe_webhook_${eventId}`;
      
      const record = await this.paymentService['prisma'].idempotencyKey.findUnique({
        where: { key },
      });
      
      return record?.response || null;
    } catch (error) {
      this.logger.error(`Failed to get event record for ${eventId}:`, error);
      return null;
    }
  }

  /**
   * Get webhook processing statistics (for monitoring)
   */
  async getWebhookStats(fromDate?: Date): Promise<{
    totalEvents: number;
    processedEvents: number;
    failedEvents: number;
    eventTypes: Record<string, number>;
  }> {
    try {
      const where: any = {
        scope: 'stripe_webhook',
      };

      if (fromDate) {
        where.createdAt = { gte: fromDate };
      }

      const records = await this.paymentService['prisma'].idempotencyKey.findMany({
        where,
        select: {
          response: true,
        },
      });

      const stats = {
        totalEvents: records.length,
        processedEvents: 0,
        failedEvents: 0,
        eventTypes: {} as Record<string, number>,
      };

      for (const record of records) {
        const data = record.response as any;
        
        if (data?.status === 'processed') {
          stats.processedEvents++;
        } else if (data?.status === 'failed') {
          stats.failedEvents++;
        }

        if (data?.eventType) {
          stats.eventTypes[data.eventType] = (stats.eventTypes[data.eventType] || 0) + 1;
        }
      }

      return stats;
    } catch (error) {
      this.logger.error('Failed to get webhook stats:', error);
      throw new BadRequestException('Failed to retrieve webhook statistics');
    }
  }
}
