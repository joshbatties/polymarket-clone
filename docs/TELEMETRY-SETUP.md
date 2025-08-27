# 🔍 **Telemetry & Analytics Setup**

## 🎯 **Overview**

We've implemented a comprehensive telemetry system using **PostHog** (product analytics) and **Sentry** (error tracking) to replace the custom telemetry solution.

## 🏗️ **Architecture**

### **TelemetryService** (`src/telemetry/telemetry.service.ts`)
- **PostHog Integration**: User behavior tracking, feature flags, A/B testing
- **Sentry Integration**: Error tracking, performance monitoring, alerting
- **Automatic Privacy Protection**: No PII sent to external services
- **Graceful Degradation**: Falls back gracefully if services are unavailable

### **Key Features**
- ✅ **Business Event Tracking**: Trades, payments, user actions
- ✅ **Error Tracking**: Automatic error capture with context
- ✅ **Performance Monitoring**: Request timing and slow operation detection
- ✅ **Feature Flags**: A/B testing and gradual rollouts
- ✅ **Business Metrics**: Custom financial metrics tracking

## 🚀 **Setup Instructions**

### **1. PostHog Setup**
1. **Sign up** at [posthog.com](https://posthog.com) or self-host
2. **Create a project** and get your API key
3. **Add to environment**:
   ```bash
   POSTHOG_API_KEY=phc_your-api-key-here
   POSTHOG_HOST=https://app.posthog.com  # or your self-hosted URL
   ```

### **2. Sentry Setup**
1. **Sign up** at [sentry.io](https://sentry.io)
2. **Create a project** (Node.js/NestJS)
3. **Get your DSN** and add to environment:
   ```bash
   SENTRY_DSN=https://your-dsn@sentry.io/project-id
   ```

### **3. Environment Variables**
Add to your `apps/api/.env` file:
```bash
# Telemetry & Analytics
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
POSTHOG_API_KEY=phc_your-posthog-api-key
POSTHOG_HOST=https://app.posthog.com
```

## 📊 **Tracked Events**

### **Trading Events**
- `trade_executed` - Successful trade completion
- `trade_quote_requested` - Quote generation requests
- `trade_failed` - Failed trade attempts with error context

### **Payment Events**
- `deposit_initiated` - Stripe payment intent created
- `deposit_completed` - Successful deposit processing
- `deposit_failed` - Failed deposit attempts
- `withdrawal_requested` - User withdrawal requests
- `withdrawal_completed` - Processed withdrawals

### **User Events**
- `user_registered` - New user sign-ups
- `user_login` - User authentication
- `user_verified_email` - Email verification completion
- `kyc_started` - KYC process initiation
- `kyc_completed` - KYC verification completion

### **Market Events**
- `market_created` - New market creation
- `market_resolved` - Market resolution
- `market_settled` - Market settlement completion
- `liquidity_added` - Market liquidity additions

## 🔧 **Usage Examples**

### **Manual Event Tracking**
```typescript
// In any controller or service
constructor(private readonly telemetryService: TelemetryService) {}

// Track a business event
this.telemetryService.trackTradeEvent({
  event: 'trade_executed',
  userId: user.id,
  properties: {
    marketId: 'market_123',
    outcome: 'yes',
    shares: 100,
    costCents: 5000,
    tradingFee: 40,
  },
});

// Track an error
this.telemetryService.captureError(error, {
  operation: 'trade_execution',
  marketId: 'market_123',
}, user.id);

// Track performance
const startTime = Date.now();
// ... operation ...
this.telemetryService.trackPerformance('trade_execution', Date.now() - startTime);
```

### **Feature Flags**
```typescript
// Check if a feature is enabled for a user
const enableNewUI = await this.telemetryService.getFeatureFlag(
  'new_trading_ui', 
  user.id, 
  false // default value
);

if (enableNewUI) {
  // Show new UI
}
```

### **Automatic Tracking**
Events are **automatically tracked** via middleware:
- ✅ **HTTP Request Performance**: All API endpoint timing
- ✅ **Error Capture**: Unhandled exceptions with full context
- ✅ **Authentication Events**: Login/registration via URL detection
- ✅ **Rate Limit Violations**: Failed requests due to rate limiting

## 📈 **Benefits Over Custom Solution**

### **PostHog Advantages**
- ✅ **Proven Analytics Platform**: Used by thousands of companies
- ✅ **Rich Dashboards**: Pre-built and custom analytics views
- ✅ **User Journey Tracking**: Funnels, cohorts, retention analysis
- ✅ **Feature Flags**: A/B testing with statistical significance
- ✅ **Session Replay**: Debug user issues visually
- ✅ **GDPR Compliant**: Built-in privacy controls

### **Sentry Advantages**
- ✅ **Industry Standard**: Trusted by financial companies
- ✅ **Advanced Error Tracking**: Stack traces, breadcrumbs, context
- ✅ **Performance Monitoring**: Database queries, API calls
- ✅ **Release Tracking**: Monitor deployments and regressions
- ✅ **Alerting**: Real-time notifications for critical issues
- ✅ **Security**: SOC 2 compliant, enterprise-grade

### **Cost Savings**
- ❌ **No Custom Maintenance**: No need to build/maintain custom solutions
- ❌ **No Infrastructure Costs**: Hosted services with generous free tiers
- ❌ **No Engineering Time**: Focus on business features, not telemetry
- ✅ **Faster Time to Market**: Immediate insights without custom development

## 🛡️ **Privacy & Security**

### **Data Protection**
- **No PII in Telemetry**: Email addresses, IP addresses filtered out
- **User ID Only**: Anonymous tracking with user IDs for correlation
- **Configurable**: Can be disabled entirely with environment variables
- **GDPR Compliant**: Both PostHog and Sentry offer GDPR compliance tools

### **Financial Data Protection**
- **No Sensitive Data**: Trading amounts aggregated, no individual trades
- **Error Context**: Errors captured without exposing user financial details
- **Audit Trail**: All telemetry events logged locally for compliance

## 🚦 **Production Readiness**

### **Monitoring**
```typescript
// Built-in health checks
GET /api/v1/health  // Includes telemetry service status
```

### **Performance**
- **Minimal Overhead**: Async event tracking, no request blocking
- **Circuit Breaker**: Fails gracefully if external services are down
- **Batch Processing**: Events sent in batches for efficiency

### **Alerting**
- **Sentry Alerts**: Immediate notifications for errors/performance issues
- **PostHog Insights**: Business metric thresholds and anomalies
- **Custom Dashboards**: Real-time monitoring of trading activity

## 🔄 **Migration from Old System**

The new telemetry system **replaces** the old custom TelemetryService:
- ✅ **Removed**: Custom telemetry implementation
- ✅ **Kept**: All existing logging and audit trails
- ✅ **Enhanced**: Better error tracking and business insights
- ✅ **Simplified**: Less code to maintain, more features

## 📞 **Support**

For telemetry issues:
1. **Check Service Status**: `/api/v1/health` endpoint
2. **View Logs**: Application logs show telemetry initialization
3. **PostHog Support**: Excellent documentation and community
4. **Sentry Support**: Enterprise support available for financial applications

---

## 🎉 **Next Steps**

1. **Set up accounts** on PostHog and Sentry
2. **Add environment variables** to your `.env` file
3. **Deploy and monitor** - you'll immediately see insights!
4. **Create dashboards** for your specific business metrics
5. **Set up alerts** for critical trading/payment issues




