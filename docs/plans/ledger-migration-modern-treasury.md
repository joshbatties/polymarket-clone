# Ledger Migration Plan: Custom Double-Entry → Modern Treasury

## Overview

This document outlines the complete migration from our custom double-entry ledger system to Modern Treasury, specifically tailored for the Aussie Markets prediction platform's complex financial operations.

## Why Modern Treasury Over Increase?

For our Australian prediction markets platform, Modern Treasury is the superior choice:

### **Modern Treasury Advantages:**
- **Australian operations support** - Critical for our AUD-focused platform
- **Complex transaction modeling** - Perfect for our multi-party trading system
- **Built-in reconciliation** - Replaces our custom Stripe reconciliation
- **Ledger-as-a-Service** - Battle-tested double-entry accounting
- **Real-time balance tracking** - Essential for live trading
- **Advanced API capabilities** - Better integration with our LMSR system
- **Compliance features** - AML transaction monitoring built-in

### **Increase Limitations:**
- Primarily US-focused (limited AUD support)
- Simpler use cases (not built for prediction markets)
- Less sophisticated transaction modeling
- Limited reconciliation capabilities

## Current System Analysis

### Our Custom Ledger Implementation
```typescript
// Current structure we're replacing
LedgerEntry {
  transactionId: string       // Groups related entries
  accountId: string          // WalletAccount reference  
  counterAccountId: string   // Double-entry counterpart
  amountCents: bigint        // Signed amount
  entryType: LedgerEntryType // DEPOSIT, TRADE, FEE, etc.
  metadata: Json             // Trade details, external refs
}

WalletAccount {
  accountType: string        // user_cash, custody_cash, fee_revenue
  availableCents: bigint     // Available balance
  pendingCents: bigint       // Pending transactions
}
```

### Integration Points to Migrate
- **Trading System**: Multi-entry transactions for each trade
- **Payment Processing**: Stripe deposit/withdrawal flows  
- **Market Operations**: LMSR liquidity management
- **Reconciliation**: Daily Stripe balance matching
- **Reporting**: P&L calculations, user statements
- **Compliance**: AML transaction monitoring

### Transaction Volume Analysis
- **Estimated Daily Transactions**: 1,000-5,000 (MVP → Scale)
- **Peak Trading Periods**: Market close events
- **Transaction Types**: 60% Trades, 25% Deposits, 10% Withdrawals, 5% Fees
- **Average Transaction Value**: $50 AUD

## Migration Strategy

### Phase 1: Modern Treasury Setup & Architecture (Week 1)

#### Step 1.1: Account Setup & Configuration

**Modern Treasury Account Setup:**
```bash
# 1. Create Modern Treasury account
# 2. Complete KYB (Know Your Business) verification
# 3. Configure organization settings:
#    - Legal name: "JPC Group Trading Pty Ltd" 
#    - Country: Australia
#    - Currency: AUD (primary)
#    - Industry: Financial Services
```

**API Configuration:**
```bash
# Add to apps/api/.env
MODERN_TREASURY_API_KEY=mt_live_...
MODERN_TREASURY_ORGANIZATION_ID=org_...
MODERN_TREASURY_WEBHOOK_SECRET=whsec_...
MODERN_TREASURY_BASE_URL=https://app.moderntreasury.com
```

#### Step 1.2: Chart of Accounts Design

**Account Structure Mapping:**
```typescript
// Modern Treasury Account Types → Our Current System
const ACCOUNT_MAPPING = {
  // User accounts (one per user)
  'user_cash': 'external_account',        // User wallet balances
  
  // System accounts (single instances)
  'custody_cash': 'internal_account',     // House cash holdings
  'fee_revenue': 'internal_account',      // Platform fees collected
  'market_liquidity': 'internal_account', // LMSR liquidity pools
  'pending_trades': 'internal_account',   // Trade settlement
  'pending_deposits': 'internal_account', // Stripe pending
  'pending_withdrawals': 'internal_account', // Withdrawal queue
  
  // Compliance accounts
  'aml_hold': 'internal_account',         // AML investigation holds
  'responsible_gambling': 'internal_account', // Self-exclusion funds
};
```

#### Step 1.3: Install Dependencies & Setup

```bash
cd apps/api
npm install modern-treasury
npm install --save-dev @types/node

# Remove old ledger dependencies (no longer needed)
# Keep Prisma for user data, but remove ledger tables later
```

### Phase 2: Modern Treasury Integration Layer (Week 2)

#### Step 2.1: Create Modern Treasury Service

```typescript
// apps/api/src/ledger-mt/modern-treasury.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ModernTreasury } from 'modern-treasury';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ModernTreasuryService {
  private readonly logger = new Logger(ModernTreasuryService.name);
  private readonly client: ModernTreasury;

  constructor(private readonly configService: ConfigService) {
    this.client = new ModernTreasury({
      apiKey: this.configService.get('MODERN_TREASURY_API_KEY'),
      organizationId: this.configService.get('MODERN_TREASURY_ORGANIZATION_ID'),
      baseURL: this.configService.get('MODERN_TREASURY_BASE_URL'),
    });
  }

  async createUserAccount(userId: string, userEmail: string) {
    return this.client.externalAccounts.create({
      name: `User Account - ${userEmail}`,
      counterpartyId: await this.getOrCreateUserCounterparty(userId, userEmail),
      accountType: 'checking',
      metadata: {
        userId,
        userEmail,
        accountType: 'user_cash',
        platform: 'aussie-markets',
      },
    });
  }

  async postTransaction(request: ModernTreasuryTransactionRequest) {
    return this.client.transactions.create({
      amount: request.amountCents,
      currency: 'AUD',
      direction: request.direction, // 'credit' | 'debit'
      internalAccountId: request.internalAccountId,
      externalAccountId: request.externalAccountId,
      description: request.description,
      metadata: {
        ...request.metadata,
        idempotencyKey: request.idempotencyKey,
        platform: 'aussie-markets',
      },
    });
  }

  async createLedgerTransaction(request: LedgerTransactionRequest) {
    return this.client.ledgerTransactions.create({
      description: request.description,
      effectiveDate: new Date().toISOString(),
      ledgerEntries: request.entries.map(entry => ({
        ledgerAccountId: entry.accountId,
        direction: entry.direction,
        amount: entry.amountCents,
        metadata: entry.metadata,
      })),
      metadata: {
        idempotencyKey: request.idempotencyKey,
        source: 'aussie-markets',
        transactionType: request.transactionType,
      },
    });
  }

  async getAccountBalance(accountId: string) {
    return this.client.ledgerAccountBalances.retrieve(accountId);
  }

  async reconcileWithStripe(date: Date) {
    // Modern Treasury's built-in reconciliation
    return this.client.reconciliation.create({
      externalAccountId: await this.getStripeAccountId(),
      reconciliationDate: date.toISOString(),
      currency: 'AUD',
    });
  }
}
```

#### Step 2.2: Create Adapter Layer

```typescript
// apps/api/src/ledger-mt/ledger-adapter.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ModernTreasuryService } from './modern-treasury.service';
import { PrismaService } from '../prisma/prisma.service';

// Adapter to maintain same interface as old LedgerService
@Injectable()
export class LedgerAdapterService {
  private readonly logger = new Logger(LedgerAdapterService.name);

  constructor(
    private readonly mtService: ModernTreasuryService,
    private readonly prisma: PrismaService,
  ) {}

  // Keep same interface as old LedgerService for minimal code changes
  async postTransaction(request: TransactionRequest): Promise<LedgerTransaction> {
    // Validate entries balance to zero (same as before)
    this.validateTransactionEntries(request.entries);

    // Convert to Modern Treasury format
    const mtRequest = await this.convertToMTFormat(request);

    // Execute in Modern Treasury
    const mtTransaction = await this.mtService.createLedgerTransaction(mtRequest);

    // Return in same format as old system
    return {
      transactionId: mtTransaction.id,
      entries: request.entries,
      timestamp: new Date(),
    };
  }

  async getUserBalance(userId: string): Promise<{ availableCents: number; pendingCents: number }> {
    const userAccount = await this.getUserMTAccount(userId);
    const balance = await this.mtService.getAccountBalance(userAccount.id);
    
    return {
      availableCents: balance.availableBalance.amount,
      pendingCents: balance.pendingBalance.amount,
    };
  }

  private async convertToMTFormat(request: TransactionRequest) {
    const entries = [];
    
    for (const entry of request.entries) {
      const mtAccount = await this.mapAccountToMT(entry.accountId);
      entries.push({
        accountId: mtAccount.id,
        direction: entry.amountCents > 0 ? 'credit' : 'debit',
        amountCents: Math.abs(Number(entry.amountCents)),
        metadata: {
          ...entry.metadata,
          originalAccountId: entry.accountId,
          entryType: entry.entryType,
          userId: entry.userId,
        },
      });
    }

    return {
      entries,
      description: `Transaction: ${request.entries[0]?.description || 'Unknown'}`,
      idempotencyKey: request.idempotencyKey,
      transactionType: request.entries[0]?.entryType,
    };
  }
}
```

### Phase 3: Update Trading Integration (Week 3)

#### Step 3.1: Modify Trading Service

```typescript
// apps/api/src/trading/services/trading.service.ts (updated)

// Replace old ledger import
// import { LedgerService } from '../../ledger/ledger.service';
import { LedgerAdapterService } from '../../ledger-mt/ledger-adapter.service';

@Injectable()
export class TradingService {
  constructor(
    // Replace LedgerService with LedgerAdapterService
    private readonly ledgerService: LedgerAdapterService,
    // ... other dependencies remain the same
  ) {}

  // executeLedgerTransactions method stays EXACTLY the same
  // This is the power of the adapter pattern - no trading code changes needed!
  private async executeLedgerTransactions(
    userId: string,
    costCents: number,
    feeCents: number,
    idempotencyKey: string,
    tx: any
  ): Promise<void> {
    // This code doesn't change - adapter handles Modern Treasury conversion
    const tradeEntries = [
      {
        accountId: userCashAccount.id,
        counterAccountId: custodyCashAccount.id,
        userId,
        amountCents: BigInt(-totalCostCents),
        currency: 'AUD',
        entryType: LedgerEntryType.TRADE,
        description: `Trade execution - total cost including fees`,
        metadata: { /* same as before */ },
      },
      // ... rest of entries unchanged
    ];

    // Same interface - adapter converts to Modern Treasury behind the scenes
    await this.ledgerService.postTransaction({
      entries: tradeEntries,
      idempotencyKey: `trade_payment_${idempotencyKey}`,
    });
  }
}
```

#### Step 3.2: Update Payment Integration

```typescript
// apps/api/src/payments/services/payment.service.ts (updated)

import { LedgerAdapterService } from '../../ledger-mt/ledger-adapter.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly ledgerService: LedgerAdapterService, // Changed from LedgerService
    // ... other services unchanged
  ) {}

  async processDepositSuccess(paymentIntent: any): Promise<void> {
    // Deposit ledger entries - same format as before
    const depositEntries = [
      {
        accountId: userCashAccount.id,
        counterAccountId: custodyCashAccount.id,
        userId: paymentIntent.metadata.userId,
        amountCents: BigInt(paymentIntent.amount),
        entryType: LedgerEntryType.DEPOSIT,
        description: `Stripe deposit: ${paymentIntent.id}`,
        metadata: {
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId: paymentIntent.charges.data[0]?.id,
        },
      },
      // ... counter entry
    ];

    // Same interface - works transparently with Modern Treasury
    await this.ledgerService.postTransaction({
      entries: depositEntries,
      idempotencyKey: `deposit_${paymentIntent.id}`,
    });
  }
}
```

### Phase 4: Data Migration & Account Setup (Week 4)

#### Step 4.1: Create Migration Scripts

```typescript
// apps/api/src/scripts/migrate-to-modern-treasury.ts
import { PrismaClient } from '@prisma/client';
import { ModernTreasuryService } from '../ledger-mt/modern-treasury.service';

const prisma = new PrismaClient();

async function migrateToModernTreasury() {
  console.log('Starting migration to Modern Treasury...');

  // Step 1: Create system accounts in Modern Treasury
  await createSystemAccounts();

  // Step 2: Migrate user accounts
  await migrateUserAccounts();

  // Step 3: Recreate balances (reconciliation)
  await recreateBalances();

  // Step 4: Verify data integrity
  await verifyMigration();

  console.log('Migration completed successfully!');
}

async function createSystemAccounts() {
  const systemAccounts = [
    { name: 'Custody Cash', type: 'custody_cash' },
    { name: 'Fee Revenue', type: 'fee_revenue' },
    { name: 'Market Liquidity Pool', type: 'market_liquidity' },
    { name: 'Pending Trades', type: 'pending_trades' },
    { name: 'AML Hold Account', type: 'aml_hold' },
  ];

  for (const account of systemAccounts) {
    const mtAccount = await mtService.createInternalAccount({
      name: account.name,
      accountType: account.type,
      currency: 'AUD',
      metadata: {
        platform: 'aussie-markets',
        accountCategory: 'system',
        created: new Date().toISOString(),
      },
    });

    // Store mapping for later use
    await prisma.accountMapping.create({
      data: {
        legacyAccountType: account.type,
        modernTreasuryAccountId: mtAccount.id,
        accountCategory: 'system',
      },
    });
  }
}

async function migrateUserAccounts() {
  // Get all users with wallet accounts
  const users = await prisma.user.findMany({
    include: {
      walletAccounts: {
        where: { accountType: 'user_cash' },
      },
    },
  });

  for (const user of users) {
    // Create user account in Modern Treasury
    const mtAccount = await mtService.createUserAccount(user.id, user.email);

    // Set initial balance based on current wallet
    const currentBalance = user.walletAccounts[0]?.availableCents || 0;
    if (currentBalance > 0) {
      await mtService.createBalanceAdjustment({
        accountId: mtAccount.id,
        amount: Number(currentBalance),
        description: `Migration balance for user ${user.email}`,
        metadata: {
          migrationId: uuidv4(),
          originalBalance: currentBalance.toString(),
          migrationDate: new Date().toISOString(),
        },
      });
    }

    console.log(`Migrated user: ${user.email} with balance: $${Number(currentBalance) / 100}`);
  }
}

async function recreateBalances() {
  // Calculate system account balances from ledger history
  const systemBalances = await prisma.ledgerEntry.groupBy({
    by: ['accountId'],
    _sum: {
      amountCents: true,
    },
    where: {
      account: {
        accountType: {
          in: ['custody_cash', 'fee_revenue', 'market_liquidity'],
        },
      },
    },
  });

  // Set system account balances in Modern Treasury
  for (const balance of systemBalances) {
    const mapping = await prisma.accountMapping.findFirst({
      where: { legacyAccountType: balance.accountId },
    });

    if (mapping && balance._sum.amountCents) {
      await mtService.createBalanceAdjustment({
        accountId: mapping.modernTreasuryAccountId,
        amount: Number(balance._sum.amountCents),
        description: 'Migration balance adjustment',
        metadata: {
          migrationSource: 'ledger_reconciliation',
          originalSum: balance._sum.amountCents.toString(),
        },
      });
    }
  }
}

async function verifyMigration() {
  // Verify total balances match
  const legacyTotal = await prisma.ledgerEntry.aggregate({
    _sum: { amountCents: true },
    where: {
      account: { accountType: 'user_cash' },
    },
  });

  const mtTotal = await mtService.getTotalUserBalances();

  if (Math.abs(Number(legacyTotal._sum.amountCents) - mtTotal) > 100) { // Allow $1 tolerance
    throw new Error(`Balance mismatch: Legacy ${legacyTotal._sum.amountCents} vs MT ${mtTotal}`);
  }

  console.log('✅ Balance verification passed');
}
```

#### Step 4.2: Create Account Mapping Table

```sql
-- Migration: 001_add_modern_treasury_mapping.sql
CREATE TABLE "account_mapping" (
  id SERIAL PRIMARY KEY,
  legacy_account_id VARCHAR(255),
  legacy_account_type VARCHAR(50) NOT NULL,
  modern_treasury_account_id VARCHAR(255) NOT NULL,
  account_category VARCHAR(50) NOT NULL, -- 'user' | 'system'
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(legacy_account_id),
  UNIQUE(modern_treasury_account_id)
);

CREATE INDEX account_mapping_legacy_type_idx ON account_mapping(legacy_account_type);
CREATE INDEX account_mapping_mt_id_idx ON account_mapping(modern_treasury_account_id);
```

### Phase 5: Replace Reconciliation System (Week 5)

#### Step 5.1: Modern Treasury Reconciliation

```typescript
// apps/api/src/reconciliation-mt/mt-reconciliation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ModernTreasuryService } from '../ledger-mt/modern-treasury.service';
import { StripeService } from '../payments/services/stripe.service';

@Injectable()
export class MTReconciliationService {
  private readonly logger = new Logger(MTReconciliationService.name);

  constructor(
    private readonly mtService: ModernTreasuryService,
    private readonly stripeService: StripeService,
  ) {}

  async runDailyReconciliation(date: Date) {
    this.logger.log(`Starting Modern Treasury reconciliation for ${date.toISOString()}`);

    // Modern Treasury handles most of this automatically
    const reconciliation = await this.mtService.reconcileWithStripe(date);

    // Get reconciliation report
    const report = await this.mtService.getReconciliationReport(reconciliation.id);

    // Check for discrepancies
    if (report.status === 'failed' || report.discrepancies.length > 0) {
      await this.handleDiscrepancies(report);
    }

    return {
      date,
      status: report.status,
      discrepancyCount: report.discrepancies.length,
      totalReconciled: report.totalReconciled,
      mtReconciliationId: reconciliation.id,
    };
  }

  private async handleDiscrepancies(report: any) {
    // Alert admin team
    this.logger.error(`Reconciliation discrepancies found:`, report.discrepancies);

    // Create admin notification
    // Send Slack alert
    // Log to monitoring system
  }
}
```

#### Step 5.2: Replace Reconciliation Controller

```typescript
// apps/api/src/reconciliation-mt/reconciliation.controller.ts
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { MTReconciliationService } from './mt-reconciliation.service';

@Controller('admin/reconciliation')
@UseGuards(ClerkAuthGuard, RolesGuard) // Assumes Clerk migration done
@Roles(UserRole.ADMIN)
export class ReconciliationController {
  constructor(
    private readonly reconciliationService: MTReconciliationService,
  ) {}

  @Post('run')
  async runReconciliation(@Body() body: { date?: string }) {
    const date = body.date ? new Date(body.date) : new Date();
    return this.reconciliationService.runDailyReconciliation(date);
  }

  @Get('reports')
  async getReconciliationReports() {
    // Get reports from Modern Treasury
    return this.reconciliationService.getRecentReports();
  }
}
```

### Phase 6: Update All Controllers & Services (Week 6)

#### Step 6.1: Controller Updates

**Replace across all controllers:**
```typescript
// Pattern for updating all financial operations

// Before (old pattern):
constructor(private readonly ledgerService: LedgerService) {}

// After (new pattern):
constructor(private readonly ledgerService: LedgerAdapterService) {}

// All method calls remain the same thanks to adapter pattern!
await this.ledgerService.postTransaction({ ... });
await this.ledgerService.getUserBalance(userId);
```

**Files to update:**
- `markets.controller.ts` - Market liquidity operations
- `payments.controller.ts` - Deposit/withdrawal flows
- `trading.controller.ts` - Trade execution (minimal changes)
- `withdrawals.controller.ts` - Withdrawal processing
- `admin.controller.ts` - Admin financial operations

#### Step 6.2: Service Updates

**Update module dependencies:**
```typescript
// apps/api/src/app.module.ts
import { LedgerMTModule } from './ledger-mt/ledger-mt.module';

@Module({
  imports: [
    // Remove: LedgerModule,
    LedgerMTModule, // Add Modern Treasury module
    // ... other modules
  ],
})
export class AppModule {}
```

**Create new module:**
```typescript
// apps/api/src/ledger-mt/ledger-mt.module.ts
import { Module } from '@nestjs/common';
import { ModernTreasuryService } from './modern-treasury.service';
import { LedgerAdapterService } from './ledger-adapter.service';

@Module({
  providers: [
    ModernTreasuryService,
    LedgerAdapterService,
  ],
  exports: [
    LedgerAdapterService, // Export as LedgerService replacement
  ],
})
export class LedgerMTModule {}
```

### Phase 7: Testing & Validation (Week 7)

#### Step 7.1: Comprehensive Test Suite

```typescript
// apps/api/src/ledger-mt/ledger-mt.e2e.spec.ts
describe('Modern Treasury Integration E2E', () => {
  it('should process deposit transactions', async () => {
    const depositResult = await request(app.getHttpServer())
      .post('/payments/deposit-intent')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amountCents: 10000 }) // $100
      .expect(201);

    // Verify balance updated in Modern Treasury
    const balance = await mtService.getAccountBalance(userAccountId);
    expect(balance.availableBalance.amount).toBe(10000);
  });

  it('should execute trades with proper ledger entries', async () => {
    await request(app.getHttpServer())
      .post(`/markets/${marketId}/trades`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        outcome: 'YES',
        shares: 10,
        idempotencyKey: 'test-trade-123',
      })
      .expect(201);

    // Verify all accounts updated correctly
    const userBalance = await mtService.getAccountBalance(userAccountId);
    const custodyBalance = await mtService.getAccountBalance(custodyAccountId);
    
    expect(userBalance.availableBalance.amount).toBeLessThan(10000); // Reduced by trade cost
    expect(custodyBalance.availableBalance.amount).toBeGreaterThan(0); // Increased by trade payment
  });

  it('should handle reconciliation correctly', async () => {
    const reconResult = await request(app.getHttpServer())
      .post('/admin/reconciliation/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(reconResult.body.discrepancyCount).toBe(0);
    expect(reconResult.body.status).toBe('completed');
  });
});
```

#### Step 7.2: Data Integrity Validation

```typescript
// apps/api/src/scripts/validate-migration.ts
async function validateMigration() {
  console.log('🔍 Validating Modern Treasury migration...');

  // Test 1: Balance consistency
  await validateBalances();

  // Test 2: Transaction history
  await validateTransactionHistory();

  // Test 3: Account mappings
  await validateAccountMappings();

  // Test 4: Live transaction flow
  await validateLiveTransactions();

  console.log('✅ Migration validation completed successfully');
}

async function validateBalances() {
  const users = await prisma.user.findMany({
    include: { walletAccounts: true },
  });

  for (const user of users) {
    const legacyBalance = user.walletAccounts
      .filter(acc => acc.accountType === 'user_cash')
      .reduce((sum, acc) => sum + Number(acc.availableCents), 0);

    const mtBalance = await mtService.getUserBalance(user.id);

    if (Math.abs(legacyBalance - mtBalance.availableCents) > 1) { // 1 cent tolerance
      throw new Error(`Balance mismatch for user ${user.email}: Legacy=${legacyBalance}, MT=${mtBalance.availableCents}`);
    }
  }

  console.log('✅ Balance validation passed');
}
```

### Phase 8: Cleanup & Go-Live (Week 8)

#### Step 8.1: Remove Legacy Code

```bash
# Remove old ledger system
rm -rf apps/api/src/ledger/
rm -rf apps/api/src/reconciliation/

# Update Prisma schema to remove ledger tables
# (Keep user tables, remove ledger_entries, reconciliation_reports)
```

#### Step 8.2: Database Schema Cleanup

```sql
-- Migration: 002_remove_legacy_ledger.sql
-- ⚠️ ONLY run after confirming Modern Treasury is working perfectly

-- Remove ledger tables (backup first!)
DROP TABLE IF EXISTS "ledger_entries";
DROP TABLE IF EXISTS "reconciliation_reports";

-- Remove wallet account columns we no longer need
ALTER TABLE "wallet_accounts" DROP COLUMN IF EXISTS "available_cents";
ALTER TABLE "wallet_accounts" DROP COLUMN IF EXISTS "pending_cents";

-- Keep wallet_accounts table for account type tracking
-- Modern Treasury account IDs will be stored in account_mapping
```

#### Step 8.3: Update Documentation

```typescript
// Update API documentation
// apps/api/src/main.ts - Swagger setup

const config = new DocumentBuilder()
  .setTitle('Aussie Markets API')
  .setDescription('Powered by Modern Treasury ledger system')
  .setVersion('2.0.0') // Bump version for MT migration
  .build();
```

### Phase 9: Production Deployment & Monitoring (Week 9)

#### Step 9.1: Staged Deployment

```yaml
# deployment/staging-mt.yaml
environment: staging
features:
  modern_treasury: true
  legacy_ledger: false
  
validation:
  - balance_checks: enabled
  - transaction_monitoring: enabled
  - reconciliation_alerts: enabled

deployment:
  strategy: blue_green
  canary_percentage: 10
  rollback_threshold: 1_error_per_1000_requests
```

#### Step 9.2: Production Monitoring

```typescript
// apps/api/src/monitoring/mt-monitoring.service.ts
@Injectable()
export class MTMonitoringService {
  async monitorLedgerHealth() {
    // Check Modern Treasury API status
    const mtStatus = await this.mtService.healthCheck();
    
    // Verify recent transactions
    const recentTxns = await this.mtService.getRecentTransactions(5);
    
    // Check balance consistency
    await this.validateRandomUserBalances(10);
    
    return {
      status: 'healthy',
      modernTreasuryApi: mtStatus,
      recentTransactionCount: recentTxns.length,
      lastReconciliation: await this.getLastReconciliationStatus(),
    };
  }

  @Cron('0 */5 * * * *') // Every 5 minutes
  async performHealthChecks() {
    try {
      await this.monitorLedgerHealth();
    } catch (error) {
      // Alert on any ledger issues
      await this.alertingService.sendCriticalAlert({
        title: 'Modern Treasury Ledger Issue',
        message: error.message,
        severity: 'critical',
      });
    }
  }
}
```

## Risk Assessment & Mitigation

### High-Risk Areas

1. **Data Migration Integrity**
   - **Risk**: Balance mismatches during migration
   - **Mitigation**: Extensive validation scripts, parallel running during transition
   - **Rollback**: Keep legacy system running for 30 days

2. **Trading System Disruption**
   - **Risk**: Trade execution failures during migration
   - **Mitigation**: Thorough testing, staged rollout, circuit breakers
   - **Rollback**: Feature flags to switch back to legacy instantly

3. **Reconciliation Gaps**
   - **Risk**: Missing transactions during cutover
   - **Mitigation**: Cutover during low-traffic window, manual reconciliation checks
   - **Rollback**: Modern Treasury transaction replay capabilities

### Low-Risk Areas

- **Modern Treasury API reliability** - Enterprise-grade SLA
- **Integration complexity** - Adapter pattern minimizes code changes
- **Performance impact** - Modern Treasury is faster than our custom system

## Cost-Benefit Analysis

### Implementation Costs
- **Development time**: 9 weeks × $10k/week = $90k
- **Modern Treasury setup**: $5k (implementation consulting)
- **Testing & validation**: $10k
- **Total one-time cost**: $105k

### Monthly Costs
- **Modern Treasury**: $2,000/month (based on transaction volume)
- **Reduced maintenance**: -$8,000/month (no custom ledger maintenance)
- **Reduced compliance burden**: -$3,000/month (built-in AML monitoring)
- **Net monthly savings**: $9,000/month

### ROI Timeline
- **Break-even**: 11.7 months
- **Year 1 net benefit**: $3k
- **Year 2+ net benefit**: $108k/year

### Additional Benefits
- **Reduced operational risk** - Battle-tested ledger system
- **Faster feature development** - No ledger maintenance overhead
- **Better compliance** - Built-in AML/regulatory features
- **Improved reliability** - 99.99% uptime SLA
- **Audit readiness** - Automated audit trails

## Success Metrics

### Technical Metrics
- **Transaction success rate**: >99.9% (up from ~99.5%)
- **Ledger processing time**: <100ms average (down from ~300ms)
- **Reconciliation accuracy**: 100% automated (up from 95% manual)
- **System maintenance time**: <2 hours/month (down from 20 hours/month)

### Business Metrics
- **Faster onboarding**: Users can trade immediately after deposit
- **Better user experience**: Real-time balance updates
- **Reduced customer support**: Fewer balance/transaction issues
- **Compliance confidence**: Automated AML monitoring

## Rollback Plan

If critical issues arise:

### Immediate Rollback (< 4 hours)
1. **Feature flag switch** - Revert to legacy ledger system
2. **Database restore** - Restore pre-migration backup
3. **API deployment** - Deploy previous version
4. **Balance reconciliation** - Manual balance adjustment if needed

### Data Recovery
- Modern Treasury data export capabilities
- Transaction replay from webhook logs
- Manual balance reconstruction if needed

## Post-Migration Monitoring

### Week 1-2: Intensive Monitoring
- **Real-time alerts** for any transaction failures
- **Daily balance reconciliation** between MT and our records  
- **User support monitoring** for balance-related issues

### Month 1-3: Standard Monitoring
- **Weekly reconciliation reports**
- **Monthly compliance reviews**
- **Quarterly performance assessments**

### Ongoing: Automated Monitoring
- **Automated daily reconciliation**
- **Real-time transaction monitoring**
- **Monthly cost/benefit reviews**

---

## Next Steps

1. **Get stakeholder approval** for 9-week timeline and $105k budget
2. **Set up Modern Treasury account** and complete KYB verification
3. **Schedule migration kickoff** and team training
4. **Begin Phase 1** implementation
5. **Weekly progress reviews** with stakeholders

This migration will transform our financial infrastructure from a maintenance burden into a competitive advantage, allowing us to focus on building great prediction markets instead of managing ledger systems.

**Expected Outcome:** World-class financial infrastructure that scales effortlessly with our Australian prediction markets platform.
