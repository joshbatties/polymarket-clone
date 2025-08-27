import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentService } from './services/payment.service';
import { StripeService } from './services/stripe.service';
import { WebhookService } from './services/webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerModule } from '../ledger/ledger.module';
import { UsersModule } from '../users/users.module';
import { KycModule } from '../kyc/kyc.module';
import { ResponsibleGamblingService } from '../responsible-gambling/responsible-gambling.service';
import { AmlService } from '../aml/aml.service';

@Module({
  imports: [
    LedgerModule,
    UsersModule,
    KycModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PrismaService,
    PaymentService,
    StripeService,
    WebhookService,
    ResponsibleGamblingService,
    AmlService,
  ],
  exports: [PaymentService, StripeService],
})
export class PaymentsModule {}
