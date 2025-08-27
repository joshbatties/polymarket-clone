import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';
import { LedgerModule } from './ledger/ledger.module';
import { PaymentsModule } from './payments/payments.module';
import { MarketsModule } from './markets/markets.module';
import { TradingModule } from './trading/trading.module';
import { KycModule } from './kyc/kyc.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { ComplianceModule } from './compliance/compliance.module';
import { AdminAuditModule } from './admin-audit/admin-audit.module';
import { CryptoModule } from './crypto/crypto.module';
import { LoggingModule } from './logging/logging.module';
import { ObservabilityModule } from './observability/observability.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { PrismaService } from './prisma/prisma.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    MailModule,
    LedgerModule,
    PaymentsModule,
    MarketsModule,
    TradingModule,
    KycModule,
    BankAccountsModule,
    WithdrawalsModule,
    ReconciliationModule,
    ComplianceModule,
    AdminAuditModule,
    CryptoModule,
    LoggingModule,
    ObservabilityModule,
    RateLimitModule,
    TelemetryModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
  exports: [PrismaService],
})
export class AppModule {}