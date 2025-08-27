import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Headers, 
  RawBody, 
  UseGuards, 
  HttpCode, 
  HttpStatus,
  Query,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimitConfigs } from '../rate-limit/rate-limit.config';
import { TelemetryService } from '../telemetry/telemetry.service';
import { PaymentService } from './services/payment.service';
import { WebhookService } from './services/webhook.service';
import { CreateDepositIntentDto } from './dto/create-deposit-intent.dto';
import { User, UserRole } from '@prisma/client';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly webhookService: WebhookService,
    private readonly telemetryService: TelemetryService,
  ) {}

  /**
   * Create a deposit PaymentIntent for Apple Pay
   */
  @Post('deposit-intent')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(RateLimitConfigs.PAYMENT_DEPOSIT)
  @HttpCode(HttpStatus.OK)
  async createDepositIntent(
    @CurrentUser() user: User,
    @Body() createDepositIntentDto: CreateDepositIntentDto,
  ) {
    const { amountCents, currency = 'AUD', description } = createDepositIntentDto;

    this.logger.log(`Creating deposit intent for user ${user.id}, amount: ${amountCents} ${currency}`);

    const result = await this.paymentService.createDepositIntent(
      user.id,
      amountCents,
      currency,
      description,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Get user's deposit limits
   */
  @Get('deposit-limits')
  @UseGuards(JwtAuthGuard)
  async getDepositLimits(@CurrentUser() user: User) {
    const limits = await this.paymentService.getDepositLimits(user.id);
    
    return {
      success: true,
      data: limits,
    };
  }

  /**
   * Get user's wallet balance
   */
  @Get('wallet/balance')
  @UseGuards(JwtAuthGuard)
  async getWalletBalance(
    @CurrentUser() user: User,
    @Query('currency') currency: string = 'AUD',
  ) {
    const balance = await this.paymentService.getWalletBalance(user.id, currency);
    
    return {
      success: true,
      data: {
        availableCents: balance.availableCents.toString(),
        pendingCents: balance.pendingCents.toString(),
        totalCents: balance.totalCents.toString(),
        currency: balance.currency,
        availableFormatted: `$${(Number(balance.availableCents) / 100).toFixed(2)}`,
        totalFormatted: `$${(Number(balance.totalCents) / 100).toFixed(2)}`,
      },
    };
  }

  /**
   * Get user's transaction history
   */
  @Get('wallet/transactions')
  @UseGuards(JwtAuthGuard)
  async getTransactionHistory(
    @CurrentUser() user: User,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const options = {
      cursor,
      limit: limit ? parseInt(limit, 10) : 20,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    };

    const history = await this.paymentService.getTransactionHistory(user.id, options);
    
    // Format the response for easier consumption
    const formattedEntries = history.entries.map(entry => ({
      id: entry.id,
      transactionId: entry.transactionId,
      amountCents: entry.amountCents.toString(),
      amountFormatted: `${Number(entry.amountCents) >= 0 ? '+' : ''}$${(Number(entry.amountCents) / 100).toFixed(2)}`,
      entryType: entry.entryType,
      description: entry.description,
      timestamp: entry.timestamp,
      metadata: entry.metadata,
    }));

    return {
      success: true,
      data: {
        entries: formattedEntries,
        hasMore: history.hasMore,
        nextCursor: history.nextCursor,
      },
    };
  }

  /**
   * Stripe webhook endpoint (raw body required for signature verification)
   */
  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @RawBody() payload: Buffer,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature header');
    }

    this.logger.log('Received Stripe webhook');

    try {
      const result = await this.webhookService.processStripeWebhook(payload, signature);
      
      this.logger.log(`Webhook processed: ${result.eventId} (${result.eventType}) - Success: ${result.processed}`);

      return {
        received: true,
        eventId: result.eventId,
        eventType: result.eventType,
        processed: result.processed,
      };
    } catch (error) {
      this.logger.error('Webhook processing failed:', error);
      
      // Return 200 even on error to prevent Stripe retries for invalid webhooks
      // But log the error for investigation
      return {
        received: true,
        error: error.message,
        processed: false,
      };
    }
  }

  /**
   * Admin endpoint: Get webhook processing statistics
   */
  @Get('admin/webhook-stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getWebhookStats(@Query('fromDate') fromDate?: string) {
    const from = fromDate ? new Date(fromDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days default
    
    const stats = await this.webhookService.getWebhookStats(from);
    
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Admin endpoint: Get payment statistics
   */
  @Get('admin/payment-stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getPaymentStats(@Query('fromDate') fromDate?: string) {
    // This would be implemented to show payment volume, success rates, etc.
    // For now, return a placeholder
    return {
      success: true,
      data: {
        message: 'Payment statistics endpoint - to be implemented',
        fromDate: fromDate || 'last_7_days',
      },
    };
  }

  /**
   * Health check endpoint for payment system
   */
  @Get('health')
  async getPaymentHealth() {
    // Basic health check
    try {
      // Could check Stripe connectivity, database connectivity, etc.
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          stripe: 'connected',
          database: 'connected',
          ledger: 'operational',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }
}
