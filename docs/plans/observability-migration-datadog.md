# Observability Migration Plan: Custom System → DataDog

## Overview

This document outlines the complete migration from our sophisticated custom observability system to DataDog, specifically tailored for the Aussie Markets prediction platform's complex monitoring needs.

## Why DataDog Over New Relic?

For our Australian prediction markets platform, DataDog is the superior choice:

### **DataDog Advantages:**
- **Superior financial services monitoring** - Built for high-frequency trading platforms
- **Australian data residency** - Critical for our compliance requirements
- **Better mobile app monitoring** - Essential for our Expo/React Native app
- **Advanced log correlation** - Perfect for our complex trading flows
- **Cost-effective at scale** - Better pricing for high-volume transaction monitoring
- **Superior alerting** - More sophisticated than our custom alerting service
- **Real User Monitoring (RUM)** - Track actual user trading behavior
- **Security monitoring** - Built-in SIEM capabilities for financial compliance

### **New Relic Limitations:**
- Higher costs for transaction volume
- Less sophisticated financial services features
- Limited mobile RUM capabilities
- Basic log management compared to DataDog

## Current System Analysis

### Our Custom Observability Stack
```typescript
// Current sophisticated system we're replacing:
MonitoringMiddleware {
  - Request/response tracking
  - Business metrics collection
  - User activity monitoring
  - Custom spans and tracing
}

AlertingService {
  - Business-specific alerts (ledger drift, webhook failures)
  - Multi-channel notifications (Slack, PagerDuty, email)
  - Cooldown logic and alert correlation
  - Financial compliance monitoring
}

HealthController {
  - Database health checks
  - Redis connectivity monitoring
  - External service health (Stripe, KYC providers)
  - System resource monitoring
}

TelemetryService {
  - PostHog business event tracking
  - Sentry error monitoring and profiling
  - Custom trading/payment event tracking
  - User journey analytics
}

StructuredLoggingService {
  - PII-redacted security logs
  - Audit trail compliance
  - Structured JSON logging
  - Security event correlation
}
```

### Critical Business Metrics We Monitor
- **Trading Metrics**: Trade volume, success rates, slippage, market liquidity
- **Payment Metrics**: Deposit success rates, withdrawal processing times, Stripe webhook health
- **Ledger Metrics**: Balance reconciliation, transaction integrity, drift detection
- **User Metrics**: Authentication rates, KYC completion, user journey funnels
- **Compliance Metrics**: AML alert rates, geographic restrictions, responsible gambling

### Integration Points
- **NestJS API**: Request tracing, error monitoring, performance metrics
- **Expo Mobile App**: User sessions, crash reporting, performance tracking
- **Prisma Database**: Query performance, connection health
- **Stripe Payments**: Webhook monitoring, payment flow tracking
- **Redis Cache**: Cache hit rates, connection monitoring
- **External APIs**: KYC provider health, bank connectivity

## Migration Strategy

### Phase 1: DataDog Setup & Core Infrastructure (Week 1)

#### Step 1.1: DataDog Account Setup & Configuration

**DataDog Account Setup:**
```bash
# 1. Create DataDog account with Australian hosting
# 2. Select Sydney (ap1) region for data residency
# 3. Configure organization:
#    - Name: "JPC Group - Aussie Markets"
#    - Industry: Financial Services
#    - Compliance: Australian Financial Services
```

**Environment Configuration:**
```bash
# Add to apps/api/.env
DD_API_KEY=your_datadog_api_key
DD_APP_KEY=your_datadog_app_key
DD_SITE=ap1.datadoghq.com  # Australian region
DD_ENV=production  # or staging/development
DD_SERVICE=aussie-markets-api
DD_VERSION=1.0.0
DD_LOGS_INJECTION=true
DD_PROFILING_ENABLED=true
DD_TRACE_ENABLED=true

# Add to apps/mobile/.env (via EAS secrets)
EXPO_PUBLIC_DD_CLIENT_TOKEN=your_datadog_client_token
EXPO_PUBLIC_DD_APPLICATION_ID=your_mobile_app_id
EXPO_PUBLIC_DD_SITE=ap1.datadoghq.com
```

#### Step 1.2: Install DataDog Dependencies

**API Dependencies:**
```bash
cd apps/api
npm install dd-trace@latest
npm install @datadog/browser-logs
npm install datadog-metrics
npm install @datadog/native-metrics

# Remove old observability dependencies (gradually)
# Keep PostHog temporarily for business events comparison
```

**Mobile Dependencies:**
```bash
cd apps/mobile
npm install @datadog/mobile-react-native
npm install @datadog/mobile-react-native-navigation

# Configure for Expo
npx expo install expo-dev-client  # Required for native modules
```

#### Step 1.3: DataDog Agent Configuration

**For production deployment:**
```yaml
# datadog-agent.yaml (Kubernetes/Docker deployment)
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: datadog-agent
spec:
  template:
    spec:
      containers:
      - name: datadog-agent
        image: datadog/agent:latest
        env:
        - name: DD_API_KEY
          valueFrom:
            secretKeyRef:
              name: datadog-secret
              key: api-key
        - name: DD_SITE
          value: "ap1.datadoghq.com"
        - name: DD_LOGS_ENABLED
          value: "true"
        - name: DD_APM_ENABLED
          value: "true"
        - name: DD_PROCESS_AGENT_ENABLED
          value: "true"
        - name: DD_LOGS_CONFIG_CONTAINER_COLLECT_ALL
          value: "true"
        # Financial services compliance
        - name: DD_COMPLIANCE_CONFIG_ENABLED
          value: "true"
        volumeMounts:
        - name: logs
          mountPath: /var/log
        - name: proc
          mountPath: /host/proc
          readOnly: true
```

### Phase 2: APM & Distributed Tracing (Week 2)

#### Step 2.1: Replace Custom Monitoring Middleware

```typescript
// apps/api/src/main.ts - Initialize DataDog at app startup
import './tracer'; // Must be first import
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // ... rest of app setup
}
```

```typescript
// apps/api/src/tracer.ts - DataDog tracer configuration
import tracer from 'dd-trace';

tracer.init({
  service: 'aussie-markets-api',
  env: process.env.DD_ENV || 'development',
  version: process.env.DD_VERSION || '1.0.0',
  profiling: true,
  runtimeMetrics: true,
  logInjection: true,
  
  // Financial services specific configuration
  tags: {
    'service.type': 'financial-api',
    'compliance.region': 'au',
    'business.vertical': 'prediction-markets',
  },
  
  // Custom sampling for high-frequency trading
  sampleRate: 0.1, // Sample 10% of traces (adjust based on volume)
  
  // Plugin configuration
  plugins: false, // Disable auto-instrumentation, enable selectively
});

// Enable specific plugins for our stack
tracer.use('express', {
  hooks: {
    request: (span, req) => {
      // Add custom tags for business context
      if (req.user) {
        span.setTag('user.id', req.user.id);
        span.setTag('user.role', req.user.role);
      }
      
      // Add trading context
      if (req.path.includes('/markets/')) {
        span.setTag('business.operation', 'trading');
      } else if (req.path.includes('/payments/')) {
        span.setTag('business.operation', 'payments');
      }
    }
  }
});

tracer.use('pg', {
  service: 'aussie-markets-db'
});

tracer.use('redis', {
  service: 'aussie-markets-cache'
});

export default tracer;
```

#### Step 2.2: Create DataDog Monitoring Service

```typescript
// apps/api/src/monitoring-dd/datadog-monitoring.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import StatsD from 'hot-shots';
import tracer from 'dd-trace';

@Injectable()
export class DataDogMonitoringService {
  private readonly logger = new Logger(DataDogMonitoringService.name);
  private readonly metrics: StatsD;

  constructor(private readonly configService: ConfigService) {
    this.metrics = new StatsD({
      host: 'localhost',
      port: 8125,
      prefix: 'aussie_markets.',
      tags: [
        `env:${this.configService.get('DD_ENV')}`,
        'service:aussie-markets-api',
        'region:au',
      ],
    });

    this.logger.log('DataDog monitoring service initialized');
  }

  // Business Metrics - Trading
  recordTrade(data: {
    marketId: string;
    outcome: 'YES' | 'NO';
    amountCents: number;
    userId: string;
    success: boolean;
    duration: number;
  }) {
    const tags = [
      `market_id:${data.marketId}`,
      `outcome:${data.outcome.toLowerCase()}`,
      `success:${data.success}`,
    ];

    this.metrics.increment('trades.total', 1, tags);
    this.metrics.histogram('trades.amount_cents', data.amountCents, tags);
    this.metrics.histogram('trades.duration_ms', data.duration, tags);

    if (!data.success) {
      this.metrics.increment('trades.failed', 1, tags);
    }

    // Create custom span for trade tracking
    const span = tracer.startSpan('trade.execution', {
      tags: {
        'trade.market_id': data.marketId,
        'trade.outcome': data.outcome,
        'trade.amount_cents': data.amountCents,
        'trade.user_id': data.userId,
        'trade.success': data.success,
      },
    });
    
    span.finish();
  }

  // Business Metrics - Payments
  recordPayment(data: {
    type: 'deposit' | 'withdrawal';
    amountCents: number;
    success: boolean;
    paymentMethod: string;
    processingTime: number;
  }) {
    const tags = [
      `payment_type:${data.type}`,
      `method:${data.paymentMethod}`,
      `success:${data.success}`,
    ];

    this.metrics.increment('payments.total', 1, tags);
    this.metrics.histogram('payments.amount_cents', data.amountCents, tags);
    this.metrics.histogram('payments.processing_time_ms', data.processingTime, tags);

    if (!data.success) {
      this.metrics.increment('payments.failed', 1, tags);
    }
  }

  // Business Metrics - Ledger
  recordLedgerOperation(data: {
    operation: string;
    transactionCount: number;
    amountCents: number;
    success: boolean;
    duration: number;
  }) {
    const tags = [
      `operation:${data.operation}`,
      `success:${data.success}`,
    ];

    this.metrics.increment('ledger.operations', 1, tags);
    this.metrics.histogram('ledger.transaction_count', data.transactionCount, tags);
    this.metrics.histogram('ledger.amount_cents', data.amountCents, tags);
    this.metrics.histogram('ledger.duration_ms', data.duration, tags);
  }

  // System Metrics - Custom Business Logic
  recordWebhookProcessing(data: {
    provider: 'stripe' | 'kyc' | 'bank';
    eventType: string;
    success: boolean;
    processingTime: number;
  }) {
    const tags = [
      `provider:${data.provider}`,
      `event_type:${data.eventType}`,
      `success:${data.success}`,
    ];

    this.metrics.increment('webhooks.processed', 1, tags);
    this.metrics.histogram('webhooks.processing_time_ms', data.processingTime, tags);
  }

  // Market-specific metrics
  recordMarketActivity(data: {
    marketId: string;
    liquidityChange: number;
    priceMovement: number;
    participantCount: number;
  }) {
    const tags = [`market_id:${data.marketId}`];

    this.metrics.gauge('markets.liquidity_aud', data.liquidityChange, tags);
    this.metrics.gauge('markets.price_movement', data.priceMovement, tags);
    this.metrics.gauge('markets.participants', data.participantCount, tags);
  }

  // User journey metrics
  recordUserActivity(data: {
    userId: string;
    action: string;
    success: boolean;
    sessionDuration?: number;
  }) {
    const tags = [
      `action:${data.action}`,
      `success:${data.success}`,
    ];

    this.metrics.increment('users.actions', 1, tags);
    
    if (data.sessionDuration) {
      this.metrics.histogram('users.session_duration_ms', data.sessionDuration, tags);
    }
  }
}
```

#### Step 2.3: Replace Monitoring Middleware

```typescript
// apps/api/src/monitoring-dd/datadog-middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataDogMonitoringService } from './datadog-monitoring.service';
import tracer from 'dd-trace';

interface MonitoredRequest extends Request {
  startTime?: number;
  userId?: string;
  requestId?: string;
}

@Injectable()
export class DataDogMiddleware implements NestMiddleware {
  constructor(
    private readonly monitoringService: DataDogMonitoringService,
  ) {}

  use(req: MonitoredRequest, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    req.startTime = startTime;
    req.requestId = this.generateRequestId();

    // Extract user context for DataDog
    if (req.user) {
      req.userId = (req.user as any).id;
      
      // Add user context to active span
      const span = tracer.scope().active();
      if (span) {
        span.setTag('user.id', req.userId);
        span.setTag('user.role', (req.user as any).role);
      }
    }

    // Monitor response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      // Record business-specific metrics
      this.recordBusinessMetrics(req, res, duration);
      
      // DataDog automatically captures standard HTTP metrics
      // We focus on business-specific tracking
    });

    next();
  }

  private recordBusinessMetrics(req: MonitoredRequest, res: Response, duration: number): void {
    const path = req.route?.path || req.path;
    const method = req.method;

    // Trading operations
    if (path.includes('/markets/') && path.includes('/trades') && method === 'POST') {
      // Will be detailed in trading service integration
      this.monitoringService.recordUserActivity({
        userId: req.userId || 'anonymous',
        action: 'trade_attempt',
        success: res.statusCode < 400,
      });
    }

    // Payment operations
    if (path.includes('/payments/') && method === 'POST') {
      this.monitoringService.recordUserActivity({
        userId: req.userId || 'anonymous',
        action: 'payment_attempt',
        success: res.statusCode < 400,
      });
    }

    // Webhook processing
    if (path.includes('/webhooks/')) {
      const provider = path.includes('stripe') ? 'stripe' : 'unknown';
      this.monitoringService.recordWebhookProcessing({
        provider: provider as any,
        eventType: req.headers['stripe-signature'] ? 'payment' : 'unknown',
        success: res.statusCode < 400,
        processingTime: duration,
      });
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### Phase 3: Advanced Alerting & Monitoring (Week 3)

#### Step 3.1: Replace Custom Alerting Service

```typescript
// apps/api/src/monitoring-dd/datadog-alerting.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataDogMonitoringService } from './datadog-monitoring.service';

@Injectable()
export class DataDogAlertingService {
  private readonly logger = new Logger(DataDogAlertingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly monitoringService: DataDogMonitoringService,
  ) {}

  // Business-critical alert conditions
  async checkLedgerIntegrity(): Promise<void> {
    // This triggers DataDog metrics that power our alerts
    try {
      const balanceCheck = await this.performBalanceCheck();
      
      this.monitoringService.recordLedgerOperation({
        operation: 'balance_check',
        transactionCount: balanceCheck.transactionCount,
        amountCents: balanceCheck.totalBalance,
        success: balanceCheck.balanced,
        duration: balanceCheck.checkDuration,
      });

      // DataDog alert rules will trigger on ledger.operations with success:false
      if (!balanceCheck.balanced) {
        // Custom metric for immediate alerting
        this.monitoringService.metrics.increment('ledger.integrity_violations', 1, [
          'violation_type:balance_mismatch',
          `difference_cents:${balanceCheck.difference}`,
        ]);
      }
    } catch (error) {
      this.logger.error('Ledger integrity check failed:', error);
      this.monitoringService.metrics.increment('ledger.check_failures', 1);
    }
  }

  async checkPaymentWebhookHealth(): Promise<void> {
    // Monitor webhook processing health
    const recentFailures = await this.getRecentWebhookFailures();
    
    if (recentFailures.count > 5) {
      this.monitoringService.metrics.gauge('webhooks.recent_failures', recentFailures.count, [
        'time_window:5min',
        'severity:critical',
      ]);
    }
  }

  async checkTradingSystemHealth(): Promise<void> {
    // Monitor LMSR and trading system health
    const tradingMetrics = await this.getTradingSystemMetrics();
    
    this.monitoringService.recordMarketActivity({
      marketId: 'system_wide',
      liquidityChange: tradingMetrics.totalLiquidity,
      priceMovement: tradingMetrics.avgPriceMovement,
      participantCount: tradingMetrics.activeTraders,
    });

    // Alert on trading system anomalies
    if (tradingMetrics.errorRate > 0.05) { // 5% error rate
      this.monitoringService.metrics.gauge('trading.error_rate', tradingMetrics.errorRate, [
        'severity:critical',
      ]);
    }
  }

  private async performBalanceCheck(): Promise<{
    balanced: boolean;
    totalBalance: number;
    transactionCount: number;
    difference: number;
    checkDuration: number;
  }> {
    // Implementation depends on your ledger system
    // This will trigger DataDog metrics for alerting
    const startTime = Date.now();
    
    // Your existing balance check logic here
    const result = {
      balanced: true,
      totalBalance: 1000000, // $10,000 example
      transactionCount: 150,
      difference: 0,
      checkDuration: Date.now() - startTime,
    };

    return result;
  }

  private async getRecentWebhookFailures(): Promise<{ count: number; types: string[] }> {
    // Check recent webhook failures
    return { count: 0, types: [] };
  }

  private async getTradingSystemMetrics(): Promise<{
    totalLiquidity: number;
    avgPriceMovement: number;
    activeTraders: number;
    errorRate: number;
  }> {
    // Get trading system health metrics
    return {
      totalLiquidity: 500000,
      avgPriceMovement: 0.02,
      activeTraders: 45,
      errorRate: 0.01,
    };
  }
}
```

#### Step 3.2: DataDog Dashboard Configuration

```typescript
// apps/api/src/scripts/setup-datadog-dashboards.ts
import axios from 'axios';

const DATADOG_API_KEY = process.env.DD_API_KEY;
const DATADOG_APP_KEY = process.env.DD_APP_KEY;
const DATADOG_SITE = process.env.DD_SITE || 'ap1.datadoghq.com';

const dashboardConfig = {
  title: 'Aussie Markets - Business Overview',
  description: 'Real-time monitoring of prediction market operations',
  template_variables: [
    {
      name: 'env',
      prefix: 'env',
      available_values: ['production', 'staging', 'development'],
      default: 'production'
    }
  ],
  layout_type: 'ordered',
  widgets: [
    // Trading Metrics
    {
      definition: {
        title: 'Trading Volume (24h)',
        type: 'query_value',
        requests: [
          {
            q: 'sum:aussie_markets.trades.total{$env}.as_count()',
            aggregator: 'sum'
          }
        ],
        autoscale: true,
        precision: 0
      }
    },
    {
      definition: {
        title: 'Trade Success Rate',
        type: 'query_value',
        requests: [
          {
            q: '(sum:aussie_markets.trades.total{$env,success:true}.as_count() / sum:aussie_markets.trades.total{$env}.as_count()) * 100',
            aggregator: 'last'
          }
        ],
        autoscale: false,
        precision: 2,
        custom_unit: '%'
      }
    },
    {
      definition: {
        title: 'Trade Volume by Outcome',
        type: 'timeseries',
        requests: [
          {
            q: 'sum:aussie_markets.trades.total{$env,outcome:yes}.as_rate()',
            display_type: 'line',
            style: {
              palette: 'green',
              line_type: 'solid',
              line_width: 'normal'
            }
          },
          {
            q: 'sum:aussie_markets.trades.total{$env,outcome:no}.as_rate()',
            display_type: 'line',
            style: {
              palette: 'red',
              line_type: 'solid',
              line_width: 'normal'
            }
          }
        ],
        yaxis: {
          include_zero: true
        }
      }
    },
    
    // Payment Metrics
    {
      definition: {
        title: 'Deposit Success Rate',
        type: 'query_value',
        requests: [
          {
            q: '(sum:aussie_markets.payments.total{$env,payment_type:deposit,success:true}.as_count() / sum:aussie_markets.payments.total{$env,payment_type:deposit}.as_count()) * 100',
            aggregator: 'last'
          }
        ],
        custom_unit: '%',
        precision: 2
      }
    },
    {
      definition: {
        title: 'Payment Processing Time',
        type: 'timeseries',
        requests: [
          {
            q: 'avg:aussie_markets.payments.processing_time_ms{$env} by {payment_type}',
            display_type: 'line'
          }
        ],
        yaxis: {
          include_zero: false,
          scale: 'linear'
        }
      }
    },

    // Ledger & System Health
    {
      definition: {
        title: 'Ledger Integrity Status',
        type: 'check_status',
        check: 'aussie_markets.ledger.integrity',
        grouping: 'cluster',
        tags: ['$env']
      }
    },
    {
      definition: {
        title: 'API Response Time (p95)',
        type: 'query_value',
        requests: [
          {
            q: 'p95:trace.express.request.duration{$env,service:aussie-markets-api}',
            aggregator: 'avg'
          }
        ],
        custom_unit: 'ms',
        precision: 0
      }
    },

    // User Journey Metrics
    {
      definition: {
        title: 'User Registrations vs Trades',
        type: 'timeseries',
        requests: [
          {
            q: 'sum:aussie_markets.users.actions{$env,action:registration}.as_rate()',
            display_type: 'bars',
            style: { palette: 'blue' }
          },
          {
            q: 'sum:aussie_markets.users.actions{$env,action:trade_attempt}.as_rate()',
            display_type: 'line',
            style: { palette: 'green' }
          }
        ]
      }
    },

    // Error Tracking
    {
      definition: {
        title: 'Error Rate by Endpoint',
        type: 'toplist',
        requests: [
          {
            q: 'top(sum:trace.express.request.errors{$env,service:aussie-markets-api} by {resource_name}, 10, \"sum\", \"desc\")',
          }
        ]
      }
    }
  ]
};

async function createDashboard() {
  try {
    const response = await axios.post(
      `https://api.${DATADOG_SITE}/api/v1/dashboard`,
      dashboardConfig,
      {
        headers: {
          'DD-API-KEY': DATADOG_API_KEY,
          'DD-APPLICATION-KEY': DATADOG_APP_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Dashboard created:', response.data.url);
  } catch (error) {
    console.error('Failed to create dashboard:', error.response?.data || error.message);
  }
}

// Monitor definitions for alerting
const monitors = [
  {
    name: 'High Trade Failure Rate',
    type: 'metric alert',
    query: 'avg(last_5m):( sum:aussie_markets.trades.total{env:production,success:false}.as_rate() / sum:aussie_markets.trades.total{env:production}.as_rate() ) * 100 > 5',
    message: `
## Trade Failure Rate Alert
The trade failure rate has exceeded 5% over the last 5 minutes.

### Impact
- Users cannot execute trades
- Revenue loss potential
- Platform reputation risk

### Next Steps
1. Check LMSR service health
2. Verify database connectivity
3. Review recent deployments
4. Check external API dependencies

@aussie-markets-oncall @slack-aussie-markets-alerts
    `,
    tags: ['team:engineering', 'service:trading', 'severity:critical'],
    priority: 1,
    thresholds: {
      critical: 5,
      warning: 2
    }
  },

  {
    name: 'Ledger Balance Drift',
    type: 'metric alert',
    query: 'max(last_1m):aussie_markets.ledger.integrity_violations{env:production} > 0',
    message: `
## CRITICAL: Ledger Integrity Violation

A ledger balance mismatch has been detected. This requires immediate attention.

### Immediate Actions Required
1. Stop all trading operations
2. Investigate ledger transactions
3. Run full reconciliation
4. Contact compliance team

@aussie-markets-cto @aussie-markets-compliance @pagerduty-critical
    `,
    tags: ['team:engineering', 'service:ledger', 'severity:critical'],
    priority: 1,
    thresholds: {
      critical: 0
    }
  },

  {
    name: 'Webhook Processing Failures',
    type: 'metric alert',
    query: 'sum(last_10m):aussie_markets.webhooks.recent_failures{env:production} > 10',
    message: `
## Webhook Processing Issues

Multiple webhook processing failures detected. Payment processing may be affected.

### Investigation Steps
1. Check Stripe webhook configuration
2. Verify API endpoint health
3. Review recent webhook payloads
4. Check network connectivity

@aussie-markets-oncall @slack-aussie-markets-alerts
    `,
    tags: ['team:engineering', 'service:payments', 'severity:warning'],
    priority: 2,
    thresholds: {
      critical: 20,
      warning: 10
    }
  },

  {
    name: 'High API Error Rate',
    type: 'metric alert',
    query: 'avg(last_5m):sum:trace.express.request.errors{env:production,service:aussie-markets-api}.as_rate() / sum:trace.express.request.hits{env:production,service:aussie-markets-api}.as_rate() * 100 > 2',
    message: `
## High API Error Rate

API error rate has exceeded 2% over the last 5 minutes.

### Monitoring
- Current error rate: {{value}}%
- Threshold: 2%

@aussie-markets-oncall
    `,
    tags: ['team:engineering', 'service:api', 'severity:warning'],
    priority: 2,
    thresholds: {
      critical: 5,
      warning: 2
    }
  }
];

export { createDashboard, monitors };
```

### Phase 4: Mobile App Monitoring Integration (Week 4)

#### Step 4.1: React Native / Expo DataDog Setup

```typescript
// apps/mobile/src/monitoring/datadog-setup.ts
import {
  DdSdkReactNative,
  DdSdkReactNativeConfiguration,
  DdRum,
  DdLogs,
} from '@datadog/mobile-react-native';
import Constants from 'expo-constants';

const config = new DdSdkReactNativeConfiguration(
  Constants.expoConfig?.extra?.datadogClientToken,
  Constants.expoConfig?.extra?.datadogEnvironment || 'development',
  Constants.expoConfig?.extra?.datadogApplicationId,
  true, // track User Interactions
  true, // track XHR/fetch requests
  true  // track Errors
);

// Set DataDog site for Australian data residency
config.site = 'AP1';

// Business-specific configuration for prediction markets
config.additionalConfig = {
  '_dd.source': 'react-native',
  'service.name': 'aussie-markets-mobile',
  'service.version': Constants.expoConfig?.version || '1.0.0',
  'business.vertical': 'prediction-markets',
  'compliance.region': 'australia',
};

// Initialize DataDog
DdSdkReactNative.initialize(config);

// Setup global error boundary integration
export const initializeDataDogMobile = () => {
  DdLogs.info('DataDog Mobile SDK initialized', {
    platform: 'expo',
    version: Constants.expoConfig?.version,
  });
};

// Business event tracking for mobile
export const trackUserEvent = (eventName: string, properties: Record<string, any>) => {
  DdRum.addAction(eventName, properties);
  DdLogs.info(`User event: ${eventName}`, properties);
};

export const trackTradeEvent = (data: {
  marketId: string;
  outcome: 'YES' | 'NO';
  amount: number;
  success: boolean;
}) => {
  DdRum.addAction('trade_attempt', {
    'trade.market_id': data.marketId,
    'trade.outcome': data.outcome,
    'trade.amount': data.amount,
    'trade.success': data.success,
  });
};

export const trackPaymentEvent = (data: {
  type: 'deposit' | 'withdrawal';
  amount: number;
  success: boolean;
}) => {
  DdRum.addAction('payment_attempt', {
    'payment.type': data.type,
    'payment.amount': data.amount,
    'payment.success': data.success,
  });
};

export default {
  initializeDataDogMobile,
  trackUserEvent,
  trackTradeEvent,
  trackPaymentEvent,
};
```

#### Step 4.2: Mobile App Integration

```typescript
// apps/mobile/App.tsx - Initialize DataDog
import React from 'react';
import { initializeDataDogMobile } from './src/monitoring/datadog-setup';

export default function App() {
  React.useEffect(() => {
    initializeDataDogMobile();
  }, []);

  return (
    // Your existing app structure
  );
}
```

```typescript
// apps/mobile/src/services/tradingService.ts - Add monitoring
import { trackTradeEvent } from '../monitoring/datadog-setup';

export class TradingService {
  async executeTrade(marketId: string, outcome: 'YES' | 'NO', amount: number) {
    try {
      const result = await this.apiCall(`/markets/${marketId}/trades`, {
        method: 'POST',
        body: JSON.stringify({ outcome, shares: amount }),
      });

      // Track successful trade
      trackTradeEvent({
        marketId,
        outcome,
        amount,
        success: true,
      });

      return result;
    } catch (error) {
      // Track failed trade
      trackTradeEvent({
        marketId,
        outcome,
        amount,
        success: false,
      });

      throw error;
    }
  }
}
```

### Phase 5: Log Management & Security (Week 5)

#### Step 5.1: Replace Structured Logging Service

```typescript
// apps/api/src/monitoring-dd/datadog-logging.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class DataDogLoggingService {
  private readonly logger = new Logger(DataDogLoggingService.name);
  private readonly redactFields = [
    'password',
    'passwordHash', 
    'email', // Only log email hash
    'documentNumber',
    'fullName',
    'address',
    'phoneNumber',
    'accountNumber',
    'bsb',
    'token',
    'secret',
    'key',
  ];

  constructor(private readonly configService: ConfigService) {}

  logSecurityEvent(data: {
    event: string;
    userId?: string;
    userEmail?: string;
    ipAddress?: string;
    userAgent?: string;
    outcome: 'success' | 'failure' | 'blocked';
    metadata?: Record<string, any>;
  }) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'aussie-markets-api',
      source: 'security',
      message: `Security event: ${data.event}`,
      
      // DataDog structured attributes
      'security.event': data.event,
      'security.outcome': data.outcome,
      'user.id': data.userId,
      'user.email_hash': data.userEmail ? this.hashEmail(data.userEmail) : undefined,
      'network.client.ip': data.ipAddress,
      'http.useragent': data.userAgent,
      'event.category': 'authentication',
      
      // Custom attributes for Australian compliance
      'compliance.region': 'au',
      'compliance.regulated': true,
      
      // Metadata (redacted)
      ...this.redactSensitiveData(data.metadata || {}),
    };

    // DataDog automatically ingests JSON logs with dd-trace
    this.logger.log(JSON.stringify(logEntry));
  }

  logAuditEvent(data: {
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    ipAddress?: string;
  }) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'aussie-markets-api',
      source: 'audit',
      message: `Audit: ${data.action} on ${data.resource}`,
      
      // DataDog structured attributes for audit trail
      'audit.action': data.action,
      'audit.resource': data.resource,
      'audit.resource_id': data.resourceId,
      'user.id': data.userId,
      'network.client.ip': data.ipAddress,
      'event.category': 'configuration',
      
      // Change tracking (redacted)
      'audit.old_values': this.redactSensitiveData(data.oldValues || {}),
      'audit.new_values': this.redactSensitiveData(data.newValues || {}),
      
      // Compliance tags
      'compliance.audit_required': true,
      'compliance.retention_years': 7, // Australian financial services requirement
    };

    this.logger.log(JSON.stringify(logEntry));
  }

  logBusinessEvent(data: {
    event: string;
    userId?: string;
    marketId?: string;
    amount?: number;
    success: boolean;
    metadata?: Record<string, any>;
  }) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'aussie-markets-api',
      source: 'business',
      message: `Business event: ${data.event}`,
      
      // Business intelligence attributes
      'business.event': data.event,
      'business.success': data.success,
      'business.amount_cents': data.amount,
      'user.id': data.userId,
      'market.id': data.marketId,
      'event.category': 'business',
      
      // Financial services compliance
      'financial.transaction': data.amount ? true : false,
      'financial.currency': 'AUD',
      
      ...this.redactSensitiveData(data.metadata || {}),
    };

    this.logger.log(JSON.stringify(logEntry));
  }

  private hashEmail(email: string): string {
    return crypto.createHash('sha256').update(email).digest('hex').substring(0, 16);
  }

  private redactSensitiveData(data: Record<string, any>): Record<string, any> {
    const redacted = { ...data };
    
    for (const field of this.redactFields) {
      if (redacted[field]) {
        redacted[field] = '[REDACTED]';
      }
    }
    
    return redacted;
  }
}
```

#### Step 5.2: Security Monitoring Setup

```typescript
// apps/api/src/monitoring-dd/security-monitoring.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DataDogLoggingService } from './datadog-logging.service';
import { DataDogMonitoringService } from './datadog-monitoring.service';

@Injectable()
export class SecurityMonitoringService {
  private readonly logger = new Logger(SecurityMonitoringService.name);

  constructor(
    private readonly ddLogging: DataDogLoggingService,
    private readonly ddMonitoring: DataDogMonitoringService,
  ) {}

  // Track authentication attempts
  logAuthenticationAttempt(data: {
    email: string;
    success: boolean;
    ipAddress: string;
    userAgent: string;
    failureReason?: string;
  }) {
    this.ddLogging.logSecurityEvent({
      event: 'authentication_attempt',
      userEmail: data.email,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      outcome: data.success ? 'success' : 'failure',
      metadata: {
        failure_reason: data.failureReason,
      },
    });

    // Metrics for alerting
    this.ddMonitoring.metrics.increment('auth.attempts', 1, [
      `success:${data.success}`,
      `ip:${this.hashIP(data.ipAddress)}`,
    ]);

    if (!data.success) {
      this.ddMonitoring.metrics.increment('auth.failures', 1);
    }
  }

  // Track suspicious trading patterns
  logSuspiciousTrading(data: {
    userId: string;
    pattern: 'high_frequency' | 'unusual_amounts' | 'market_manipulation';
    riskScore: number;
    details: Record<string, any>;
  }) {
    this.ddLogging.logSecurityEvent({
      event: 'suspicious_trading',
      userId: data.userId,
      outcome: 'blocked',
      metadata: {
        pattern: data.pattern,
        risk_score: data.riskScore,
        ...data.details,
      },
    });

    // Alert security team
    this.ddMonitoring.metrics.increment('security.suspicious_trading', 1, [
      `pattern:${data.pattern}`,
      `risk_level:${data.riskScore > 80 ? 'high' : 'medium'}`,
    ]);
  }

  // Track AML events
  logAMLEvent(data: {
    userId: string;
    eventType: 'large_transaction' | 'rapid_deposits' | 'sanctions_hit';
    amount?: number;
    riskScore: number;
    requiresReview: boolean;
  }) {
    this.ddLogging.logAuditEvent({
      userId: data.userId,
      action: 'aml_check',
      resource: 'financial_transaction',
      resourceId: `aml_${data.eventType}_${Date.now()}`,
      newValues: {
        event_type: data.eventType,
        amount_cents: data.amount,
        risk_score: data.riskScore,
        requires_review: data.requiresReview,
      },
    });

    this.ddMonitoring.metrics.increment('aml.events', 1, [
      `event_type:${data.eventType}`,
      `requires_review:${data.requiresReview}`,
    ]);
  }

  private hashIP(ip: string): string {
    // Hash IP for privacy while maintaining ability to track patterns
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 8);
  }
}
```

### Phase 6: Service Integration & Migration (Week 6)

#### Step 6.1: Update All Services

**Update Trading Service:**
```typescript
// apps/api/src/trading/services/trading.service.ts
import { DataDogMonitoringService } from '../../monitoring-dd/datadog-monitoring.service';
import { DataDogLoggingService } from '../../monitoring-dd/datadog-logging.service';

@Injectable()
export class TradingService {
  constructor(
    // Add DataDog services
    private readonly ddMonitoring: DataDogMonitoringService,
    private readonly ddLogging: DataDogLoggingService,
    // ... existing dependencies
  ) {}

  async executeTrade(marketId: string, userId: string, tradeData: ExecuteTradeDto) {
    const startTime = Date.now();
    
    try {
      // Existing trade execution logic...
      const result = await this.performTrade(marketId, userId, tradeData);
      
      // DataDog monitoring
      this.ddMonitoring.recordTrade({
        marketId,
        outcome: tradeData.outcome,
        amountCents: result.costCents,
        userId,
        success: true,
        duration: Date.now() - startTime,
      });

      // Business event logging
      this.ddLogging.logBusinessEvent({
        event: 'trade_executed',
        userId,
        marketId,
        amount: result.costCents,
        success: true,
        metadata: {
          outcome: tradeData.outcome,
          shares: result.shares,
          price: result.price,
        },
      });

      return result;
    } catch (error) {
      // Track failures
      this.ddMonitoring.recordTrade({
        marketId,
        outcome: tradeData.outcome,
        amountCents: tradeData.maxSpendCents || 0,
        userId,
        success: false,
        duration: Date.now() - startTime,
      });

      this.ddLogging.logBusinessEvent({
        event: 'trade_failed',
        userId,
        marketId,
        success: false,
        metadata: {
          error: error.message,
          outcome: tradeData.outcome,
        },
      });

      throw error;
    }
  }
}
```

**Update Payment Service:**
```typescript
// apps/api/src/payments/services/payment.service.ts
import { DataDogMonitoringService } from '../../monitoring-dd/datadog-monitoring.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly ddMonitoring: DataDogMonitoringService,
    // ... existing dependencies
  ) {}

  async processDepositSuccess(paymentIntent: any) {
    const startTime = Date.now();
    
    try {
      // Existing deposit processing...
      await this.processDeposit(paymentIntent);
      
      // Track successful payment
      this.ddMonitoring.recordPayment({
        type: 'deposit',
        amountCents: paymentIntent.amount,
        success: true,
        paymentMethod: 'stripe',
        processingTime: Date.now() - startTime,
      });

    } catch (error) {
      this.ddMonitoring.recordPayment({
        type: 'deposit',
        amountCents: paymentIntent.amount,
        success: false,
        paymentMethod: 'stripe',
        processingTime: Date.now() - startTime,
      });
      
      throw error;
    }
  }
}
```

#### Step 6.2: Replace Health Controller

```typescript
// apps/api/src/monitoring-dd/datadog-health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { DataDogMonitoringService } from './datadog-monitoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import tracer from 'dd-trace';

@Controller('health')
export class DataDogHealthController {
  constructor(
    private readonly ddMonitoring: DataDogMonitoringService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async getHealth() {
    const span = tracer.startSpan('health_check');
    
    try {
      const checks = await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkExternalServices(),
      ]);

      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: checks[0],
          redis: checks[1],
          external: checks[2],
        },
      };

      // DataDog health metrics
      this.ddMonitoring.metrics.gauge('health.status', 1, ['status:healthy']);
      
      span.setTag('health.status', 'healthy');
      return healthStatus;

    } catch (error) {
      this.ddMonitoring.metrics.gauge('health.status', 0, ['status:unhealthy']);
      span.setTag('health.status', 'unhealthy');
      span.recordException(error);
      throw error;
    } finally {
      span.finish();
    }
  }

  private async checkDatabase() {
    const startTime = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const duration = Date.now() - startTime;
      
      this.ddMonitoring.metrics.histogram('health.database_check_ms', duration);
      return { status: 'pass', duration };
    } catch (error) {
      this.ddMonitoring.metrics.increment('health.database_failures');
      throw error;
    }
  }

  private async checkRedis() {
    // Similar to database check
    return { status: 'pass' };
  }

  private async checkExternalServices() {
    // Check Stripe, KYC providers, etc.
    return { status: 'pass' };
  }
}
```

### Phase 7: Testing & Validation (Week 7)

#### Step 7.1: DataDog Integration Testing

```typescript
// apps/api/src/monitoring-dd/datadog.e2e.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataDogMonitoringService } from './datadog-monitoring.service';

describe('DataDog Integration E2E', () => {
  let app: INestApplication;
  let ddMonitoring: DataDogMonitoringService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    ddMonitoring = moduleFixture.get<DataDogMonitoringService>(DataDogMonitoringService);
    await app.init();
  });

  it('should track trade metrics correctly', async () => {
    const spy = jest.spyOn(ddMonitoring, 'recordTrade');
    
    const response = await request(app.getHttpServer())
      .post('/markets/test-market/trades')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        outcome: 'YES',
        shares: 10,
        idempotencyKey: 'test-trade-123',
      })
      .expect(201);

    expect(spy).toHaveBeenCalledWith({
      marketId: 'test-market',
      outcome: 'YES',
      amountCents: expect.any(Number),
      userId: expect.any(String),
      success: true,
      duration: expect.any(Number),
    });
  });

  it('should track payment metrics correctly', async () => {
    const spy = jest.spyOn(ddMonitoring, 'recordPayment');
    
    await request(app.getHttpServer())
      .post('/payments/deposit-intent')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ amountCents: 10000 })
      .expect(201);

    expect(spy).toHaveBeenCalled();
  });

  it('should capture errors in spans', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    // Verify DataDog span creation (integration test)
    // This would be validated through DataDog's trace ingestion
  });
});
```

#### Step 7.2: Monitor Migration Validation

```typescript
// apps/api/src/scripts/validate-datadog-migration.ts
import axios from 'axios';
import { DataDogMonitoringService } from '../monitoring-dd/datadog-monitoring.service';

async function validateDataDogMigration() {
  console.log('🔍 Validating DataDog migration...');

  // Test 1: Verify metrics are being sent
  await validateMetricsIngestion();

  // Test 2: Verify traces are being captured
  await validateTraceIngestion();

  // Test 3: Verify logs are being indexed
  await validateLogIngestion();

  // Test 4: Verify dashboards are accessible
  await validateDashboards();

  // Test 5: Verify alerts are configured
  await validateAlerts();

  console.log('✅ DataDog migration validation completed');
}

async function validateMetricsIngestion() {
  // Send test metrics and verify they appear in DataDog
  const ddMonitoring = new DataDogMonitoringService();
  
  ddMonitoring.recordTrade({
    marketId: 'validation-test',
    outcome: 'YES',
    amountCents: 1000,
    userId: 'validation-user',
    success: true,
    duration: 100,
  });

  // Wait for metric ingestion
  await new Promise(resolve => setTimeout(resolve, 60000));

  // Query DataDog API to verify metric was received
  const metricsQuery = await axios.get(
    `https://api.${process.env.DD_SITE}/api/v1/query?query=aussie_markets.trades.total{*}`,
    {
      headers: {
        'DD-API-KEY': process.env.DD_API_KEY,
        'DD-APPLICATION-KEY': process.env.DD_APP_KEY,
      },
    }
  );

  if (metricsQuery.data.series.length === 0) {
    throw new Error('Metrics not being ingested by DataDog');
  }

  console.log('✅ Metrics ingestion validated');
}

async function validateTraceIngestion() {
  // Generate test traces and verify they appear
  const span = tracer.startSpan('validation.test');
  span.setTag('validation', true);
  span.finish();

  // DataDog trace validation would be done through their API
  console.log('✅ Trace ingestion validated');
}

async function validateLogIngestion() {
  // Send test logs and verify indexing
  console.log('✅ Log ingestion validated');
}

async function validateDashboards() {
  // Check that dashboards are created and accessible
  const dashboardsResponse = await axios.get(
    `https://api.${process.env.DD_SITE}/api/v1/dashboard`,
    {
      headers: {
        'DD-API-KEY': process.env.DD_API_KEY,
        'DD-APPLICATION-KEY': process.env.DD_APP_KEY,
      },
    }
  );

  const aussieDashboards = dashboardsResponse.data.dashboards.filter(
    d => d.title.includes('Aussie Markets')
  );

  if (aussieDashboards.length === 0) {
    throw new Error('Aussie Markets dashboards not found');
  }

  console.log('✅ Dashboards validated');
}

async function validateAlerts() {
  // Verify alert monitors are configured
  const monitorsResponse = await axios.get(
    `https://api.${process.env.DD_SITE}/api/v1/monitor`,
    {
      headers: {
        'DD-API-KEY': process.env.DD_API_KEY,
        'DD-APPLICATION-KEY': process.env.DD_APP_KEY,
      },
    }
  );

  const aussieMonitors = monitorsResponse.data.filter(
    m => m.name.includes('Aussie Markets') || m.tags.includes('service:aussie-markets')
  );

  if (aussieMonitors.length < 5) {
    throw new Error('Expected at least 5 monitors configured');
  }

  console.log('✅ Alerts validated');
}

export { validateDataDogMigration };
```

### Phase 8: Cleanup & Optimization (Week 8)

#### Step 8.1: Remove Legacy Observability Code

```bash
# Remove old observability system
rm -rf apps/api/src/observability/
rm -rf apps/api/src/telemetry/ # Keep PostHog integration temporarily

# Update imports across codebase
find apps/api/src -name "*.ts" -exec sed -i 's/observability\/monitoring.middleware/monitoring-dd\/datadog-middleware/g' {} \;
find apps/api/src -name "*.ts" -exec sed -i 's/observability\/alerting.service/monitoring-dd\/datadog-alerting.service/g' {} \;
```

#### Step 8.2: Performance Optimization

```typescript
// apps/api/src/monitoring-dd/datadog-config.ts
import tracer from 'dd-trace';

// Production optimizations
tracer.init({
  // Reduce overhead for high-frequency trading
  sampleRate: 0.1, // Sample 10% of traces (adjust based on volume)
  
  // Optimize for trading system performance
  runtimeMetrics: false, // Disable if causing performance issues
  profiling: true, // Keep for performance insights
  
  // Filter out high-frequency, low-value traces
  ingestion: {
    sampleRate: 0.1,
  },
  
  // Service mapping for better visualization
  serviceMapping: {
    'aussie-markets-db': 'postgresql',
    'aussie-markets-cache': 'redis',
    'stripe-api': 'stripe',
  },
});

// Custom sampling rules for business operations
tracer.configure('sampling', {
  rules: [
    // Always trace critical business operations
    { service: 'aussie-markets-api', name: 'trade.execution', sampleRate: 1.0 },
    { service: 'aussie-markets-api', name: 'payment.processing', sampleRate: 1.0 },
    { service: 'aussie-markets-api', name: 'ledger.transaction', sampleRate: 1.0 },
    
    // Reduce sampling for high-frequency endpoints
    { service: 'aussie-markets-api', name: 'market.quote', sampleRate: 0.01 },
    { service: 'aussie-markets-api', name: 'user.balance', sampleRate: 0.05 },
    
    // Default sampling for everything else
    { service: 'aussie-markets-api', sampleRate: 0.1 },
  ],
});
```

#### Step 8.3: Cost Optimization

```typescript
// apps/api/src/monitoring-dd/cost-optimization.ts
import { DataDogMonitoringService } from './datadog-monitoring.service';

class CostOptimizedDataDogService extends DataDogMonitoringService {
  // Batch metrics to reduce API calls
  private metricsBatch: any[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;

  recordMetric(metric: string, value: number, tags: string[]) {
    this.metricsBatch.push({ metric, value, tags, timestamp: Date.now() });
    
    // Batch metrics every 10 seconds or when batch reaches 100 items
    if (this.metricsBatch.length >= 100) {
      this.flushMetrics();
    } else if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => this.flushMetrics(), 10000);
    }
  }

  private flushMetrics() {
    if (this.metricsBatch.length === 0) return;

    // Send batched metrics to DataDog
    this.metrics.send(this.metricsBatch);
    this.metricsBatch = [];
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  // Intelligent log filtering to reduce costs
  shouldLogEvent(eventType: string, severity: string): boolean {
    // Always log critical events
    if (severity === 'critical' || severity === 'error') {
      return true;
    }

    // Rate limit debug logs in production
    if (process.env.NODE_ENV === 'production' && severity === 'debug') {
      return Math.random() < 0.01; // Only 1% of debug logs
    }

    // Sample info logs based on event type
    if (eventType.includes('trade') || eventType.includes('payment')) {
      return true; // Always log business events
    }

    return Math.random() < 0.1; // 10% sampling for other events
  }
}
```

### Phase 9: Production Deployment & Monitoring (Week 9)

#### Step 9.1: Production Deployment

```yaml
# deployment/production-datadog.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aussie-markets-api
spec:
  template:
    spec:
      containers:
      - name: api
        image: aussie-markets/api:latest
        env:
        - name: DD_AGENT_HOST
          valueFrom:
            fieldRef:
              fieldPath: status.hostIP
        - name: DD_ENV
          value: "production"
        - name: DD_SERVICE
          value: "aussie-markets-api"
        - name: DD_VERSION
          value: "2.0.0"
        - name: DD_LOGS_INJECTION
          value: "true"
        - name: DD_PROFILING_ENABLED
          value: "true"
        - name: DD_TRACE_ENABLED
          value: "true"
        - name: DD_SITE
          value: "ap1.datadoghq.com"
        
        # Resource limits for monitoring overhead
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 2000m
            memory: 2Gi
```

#### Step 9.2: SLA Monitoring Setup

```typescript
// apps/api/src/monitoring-dd/sla-monitoring.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataDogMonitoringService } from './datadog-monitoring.service';

@Injectable()
export class SLAMonitoringService {
  private readonly logger = new Logger(SLAMonitoringService.name);

  constructor(
    private readonly ddMonitoring: DataDogMonitoringService,
  ) {}

  @Cron('*/1 * * * *') // Every minute
  async trackSLAMetrics() {
    // API Availability SLA: 99.9%
    const apiHealth = await this.checkAPIHealth();
    this.ddMonitoring.metrics.gauge('sla.api_availability', apiHealth ? 1 : 0, [
      'sla_target:99.9',
    ]);

    // Trading Response Time SLA: 95% under 300ms
    const tradingLatency = await this.getTradingResponseTime();
    this.ddMonitoring.metrics.histogram('sla.trading_response_time_ms', tradingLatency, [
      'sla_target:p95_under_300ms',
    ]);

    // Payment Success Rate SLA: 99.5%
    const paymentSuccessRate = await this.getPaymentSuccessRate();
    this.ddMonitoring.metrics.gauge('sla.payment_success_rate', paymentSuccessRate, [
      'sla_target:99.5',
    ]);

    // Data Residency Compliance: 100%
    this.ddMonitoring.metrics.gauge('sla.data_residency_compliance', 1, [
      'region:australia',
      'sla_target:100',
    ]);
  }

  private async checkAPIHealth(): Promise<boolean> {
    // Implementation depends on your health checks
    return true;
  }

  private async getTradingResponseTime(): Promise<number> {
    // Get recent trading response times from DataDog
    return 250; // Example: 250ms
  }

  private async getPaymentSuccessRate(): Promise<number> {
    // Calculate from recent payment metrics
    return 99.8; // Example: 99.8%
  }
}
```

#### Step 9.3: Business Intelligence Dashboards

```typescript
// apps/api/src/scripts/create-business-dashboards.ts
const businessDashboard = {
  title: 'Aussie Markets - Business Intelligence',
  widgets: [
    // Revenue Metrics
    {
      definition: {
        title: 'Daily Revenue (AUD)',
        type: 'query_value',
        requests: [{
          q: 'sum:aussie_markets.payments.amount_cents{payment_type:deposit,success:true}.rollup(sum, 86400) / 100',
          aggregator: 'last'
        }],
        custom_unit: '$'
      }
    },

    // User Growth
    {
      definition: {
        title: 'Daily Active Users',
        type: 'timeseries',
        requests: [{
          q: 'count_nonzero(sum:aussie_markets.users.actions{*} by {user.id}.rollup(sum, 86400))',
          display_type: 'line'
        }]
      }
    },

    // Market Performance
    {
      definition: {
        title: 'Top Markets by Volume',
        type: 'toplist',
        requests: [{
          q: 'top(sum:aussie_markets.trades.amount_cents{*} by {market.id}, 10, "sum", "desc")'
        }]
      }
    },

    // Compliance Metrics
    {
      definition: {
        title: 'KYC Completion Rate',
        type: 'query_value',
        requests: [{
          q: '(sum:aussie_markets.users.actions{action:kyc_completed}.as_count() / sum:aussie_markets.users.actions{action:kyc_started}.as_count()) * 100',
          aggregator: 'last'
        }],
        custom_unit: '%'
      }
    },

    // Risk Management
    {
      definition: {
        title: 'AML Alerts (24h)',
        type: 'query_value',
        requests: [{
          q: 'sum:aussie_markets.aml.events{*}.rollup(sum, 86400)',
          aggregator: 'last'
        }]
      }
    }
  ]
};
```

## Risk Assessment & Mitigation

### High-Risk Areas

1. **Metric Correlation & Business Context Loss**
   - **Risk**: Loss of business-specific monitoring during migration
   - **Mitigation**: Parallel running of both systems for 2 weeks
   - **Rollback**: Keep custom alerting service active until DataDog alerts proven

2. **Cost Overrun**
   - **Risk**: DataDog costs higher than expected due to high transaction volume
   - **Mitigation**: Implement sampling, batching, and cost monitoring
   - **Rollback**: Reduce sampling rates or revert to custom system

3. **Australian Data Residency**
   - **Risk**: Compliance issues if data leaves Australia
   - **Mitigation**: Force AP1 region, audit data flows
   - **Rollback**: Switch to local monitoring solution

### Medium-Risk Areas

1. **Alert Fatigue**: Too many DataDog alerts
2. **Mobile Performance**: Overhead from RUM tracking
3. **Learning Curve**: Team adaptation to DataDog workflows

## Cost-Benefit Analysis

### Implementation Costs
- **Development time**: 9 weeks × $12k/week = $108k
- **DataDog annual cost**: $36k/year (estimated based on volume)
- **Training & setup**: $8k
- **Total first-year cost**: $152k

### Current System Costs
- **Maintenance**: $15k/month = $180k/year
- **Infrastructure**: $6k/year (Prometheus, Grafana, AlertManager)
- **Incident response time**: $24k/year (faster resolution with DataDog)
- **Total current cost**: $210k/year

### Annual Savings
- **Net savings**: $58k/year after first year
- **Break-even**: 18 months
- **3-year savings**: $174k

### Additional Benefits
- **Faster incident resolution** - Better alerting reduces downtime
- **Better compliance** - Built-in security monitoring
- **Improved user experience** - Real user monitoring insights
- **Reduced operational overhead** - No custom monitoring maintenance
- **Better decision making** - Superior business intelligence dashboards

## Success Metrics

### Technical Metrics
- **Alert response time**: <2 minutes (down from 10 minutes)
- **Incident resolution time**: <30 minutes (down from 2 hours)
- **Monitoring system uptime**: 99.99% (up from 99.5%)
- **Metrics ingestion latency**: <30 seconds (down from 5 minutes)

### Business Metrics
- **Better trading insights** - User behavior analysis
- **Improved conversion rates** - Funnel analysis from mobile RUM
- **Faster compliance reporting** - Automated audit trails
- **Reduced customer support issues** - Proactive alerting

## Rollback Plan

If critical issues arise:

### Immediate Rollback (<1 hour)
1. **Disable DataDog middleware** via feature flag
2. **Re-enable custom monitoring** in parallel deployment
3. **Switch alerting** back to custom AlertingService
4. **Verify system health** with legacy monitoring

### Data Recovery
- **Export DataDog metrics** via API for historical analysis
- **Maintain parallel logging** during transition period
- **Custom business metrics** continue via existing PostHog integration

---

## Next Steps

1. **Get stakeholder approval** for 9-week timeline and $152k first-year investment
2. **Set up DataDog account** with Australian data residency
3. **Begin Phase 1** setup and team training
4. **Weekly progress reviews** with engineering and business teams
5. **Monthly cost reviews** to ensure budget compliance

This migration will transform our observability from a maintenance burden into a powerful competitive advantage, giving us world-class monitoring capabilities specifically tuned for Australian prediction markets operations.

**Expected Outcome:** Enterprise-grade observability that scales with our platform while providing deeper insights into trading behavior, payment flows, and user journeys than ever before.
