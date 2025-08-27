import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export interface BusinessEvent {
  event: string;
  userId?: string;
  distinctId?: string;
  properties?: Record<string, any>;
  timestamp?: Date;
}

export interface TradeEvent extends BusinessEvent {
  event: 'trade_executed' | 'trade_quote_requested' | 'trade_failed';
  properties: {
    marketId: string;
    outcome: 'yes' | 'no';
    shares: number;
    costCents: number;
    tradingFee: number;
    slippage?: number;
    errorReason?: string;
  };
}

export interface PaymentEvent extends BusinessEvent {
  event: 'deposit_initiated' | 'deposit_completed' | 'deposit_failed' | 'withdrawal_requested' | 'withdrawal_completed';
  properties: {
    amountCents: number;
    currency: string;
    paymentMethod: 'stripe' | 'bank_transfer';
    stripePaymentIntentId?: string;
    errorReason?: string;
  };
}

export interface UserEvent extends BusinessEvent {
  event: 'user_registered' | 'user_verified_email' | 'user_login' | 'kyc_started' | 'kyc_completed' | 'kyc_failed';
  properties: {
    userAgent?: string;
    ipAddress?: string;
    kycProvider?: string;
    verificationLevel?: 'basic' | 'enhanced';
    errorReason?: string;
  };
}

export interface MarketEvent extends BusinessEvent {
  event: 'market_created' | 'market_resolved' | 'market_settled' | 'liquidity_added';
  properties: {
    marketId: string;
    category: string;
    liquidityAmount?: number;
    resolutionOutcome?: 'yes' | 'no' | 'invalid';
    adminId?: string;
  };
}

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private posthog: PostHog | null = null;
  private sentryInitialized = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeServices();
  }

  async onModuleDestroy() {
    if (this.posthog) {
      await this.posthog.shutdown();
    }
    if (this.sentryInitialized) {
      await Sentry.close(2000);
    }
  }

  private async initializeServices() {
    // Initialize Sentry
    try {
      const sentryDsn = this.configService.get<string>('SENTRY_DSN');
      const environment = this.configService.get<string>('NODE_ENV', 'development');
      
      if (sentryDsn) {
        Sentry.init({
          dsn: sentryDsn,
          environment,
          integrations: [
            nodeProfilingIntegration(),
          ],
          profilesSampleRate: environment === 'production' ? 0.1 : 1.0,
          tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
          beforeSend: (event) => {
            // Don't send PII to Sentry
            if (event.user) {
              delete event.user.email;
              delete event.user.ip_address;
            }
            return event;
          },
        });

        this.sentryInitialized = true;
        this.logger.log('✅ Sentry initialized for error tracking');
      } else {
        this.logger.warn('⚠️ SENTRY_DSN not configured - error tracking disabled');
      }
    } catch (error) {
      this.logger.error('❌ Failed to initialize Sentry:', error);
    }

    // Initialize PostHog
    try {
      const posthogApiKey = this.configService.get<string>('POSTHOG_API_KEY');
      const posthogHost = this.configService.get<string>('POSTHOG_HOST', 'https://app.posthog.com');
      
      if (posthogApiKey) {
        this.posthog = new PostHog(posthogApiKey, {
          host: posthogHost,
          flushAt: 20,
          flushInterval: 10000,
        });

        this.logger.log('✅ PostHog initialized for product analytics');
      } else {
        this.logger.warn('⚠️ POSTHOG_API_KEY not configured - analytics disabled');
      }
    } catch (error) {
      this.logger.error('❌ Failed to initialize PostHog:', error);
    }
  }

  // === ERROR TRACKING ===
  
  captureError(error: Error, context?: Record<string, any>, userId?: string) {
    if (this.sentryInitialized) {
      Sentry.withScope((scope) => {
        if (userId) {
          scope.setUser({ id: userId });
        }
        if (context) {
          Object.entries(context).forEach(([key, value]) => {
            scope.setContext(key, value);
          });
        }
        Sentry.captureException(error);
      });
    }
    
    this.logger.error(`Error captured: ${error.message}`, error.stack, context);
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) {
    if (this.sentryInitialized) {
      Sentry.withScope((scope) => {
        if (context) {
          Object.entries(context).forEach(([key, value]) => {
            scope.setContext(key, value);
          });
        }
        Sentry.captureMessage(message, level);
      });
    }
    
    this.logger.log(`Message captured [${level}]: ${message}`, context);
  }

  // === BUSINESS EVENTS ===

  trackTradeEvent(event: TradeEvent) {
    this.trackEvent(event);
    
    // Additional business logic tracking
    if (event.event === 'trade_executed') {
      this.captureMessage('Trade executed successfully', 'info', {
        marketId: event.properties.marketId,
        volume: event.properties.costCents,
      });
    }
  }

  trackPaymentEvent(event: PaymentEvent) {
    this.trackEvent(event);
    
    // Track failed payments as potential issues
    if (event.event === 'deposit_failed' || event.properties.errorReason) {
      this.captureMessage('Payment event failed', 'warning', {
        event: event.event,
        amount: event.properties.amountCents,
        error: event.properties.errorReason,
      });
    }
  }

  trackUserEvent(event: UserEvent) {
    this.trackEvent(event);
    
    // Special handling for user lifecycle events
    if (event.event === 'user_registered') {
      this.identifyUser(event.userId!, {
        registeredAt: new Date().toISOString(),
      });
    }
  }

  trackMarketEvent(event: MarketEvent) {
    this.trackEvent(event);
  }

  // === CORE TRACKING METHODS ===

  trackEvent(event: BusinessEvent) {
    if (!this.posthog) return;

    try {
      this.posthog.capture({
        distinctId: event.distinctId || event.userId || 'anonymous',
        event: event.event,
        properties: {
          ...event.properties,
          timestamp: event.timestamp || new Date(),
          environment: this.configService.get('NODE_ENV'),
        },
      });
    } catch (error) {
      this.logger.error('Failed to track event:', error);
    }
  }

  identifyUser(userId: string, properties?: Record<string, any>) {
    if (!this.posthog) return;

    try {
      this.posthog.identify({
        distinctId: userId,
        properties: {
          ...properties,
          identifiedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to identify user:', error);
    }
  }

  // === FEATURE FLAGS ===

  async getFeatureFlag(key: string, userId: string, defaultValue: boolean = false): Promise<boolean> {
    if (!this.posthog) return defaultValue;

    try {
      const flag = await this.posthog.getFeatureFlag(key, userId);
      return flag === true;
    } catch (error) {
      this.logger.error('Failed to get feature flag:', error);
      return defaultValue;
    }
  }

  // === PERFORMANCE TRACKING ===

  trackPerformance(operationName: string, duration: number, context?: Record<string, any>) {
    this.trackEvent({
      event: 'performance_metric',
      properties: {
        operation: operationName,
        duration,
        ...context,
      },
    });

    // Log slow operations
    if (duration > 1000) {
      this.captureMessage(`Slow operation detected: ${operationName}`, 'warning', {
        duration,
        ...context,
      });
    }
  }

  // === BUSINESS METRICS ===

  trackBusinessMetric(metric: string, value: number, tags?: Record<string, string>) {
    this.trackEvent({
      event: 'business_metric',
      properties: {
        metric,
        value,
        tags,
        timestamp: new Date(),
      },
    });
  }

  // === REQUEST CONTEXT ===

  setRequestContext(userId?: string, sessionId?: string, ipAddress?: string) {
    if (this.sentryInitialized) {
      Sentry.withScope((scope) => {
        if (userId) {
          scope.setUser({ id: userId });
        }
        if (sessionId) {
          scope.setTag('session_id', sessionId);
        }
        if (ipAddress) {
          scope.setTag('ip_address', ipAddress);
        }
      });
    }
  }
}
