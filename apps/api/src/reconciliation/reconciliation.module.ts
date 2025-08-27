import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationCronService } from './reconciliation-cron.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    ScheduleModule.forRoot(), // Enable cron jobs
    PaymentsModule, // For StripeService
  ],
  controllers: [ReconciliationController],
  providers: [
    ReconciliationService,
    ReconciliationCronService,
    PrismaService,
  ],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
