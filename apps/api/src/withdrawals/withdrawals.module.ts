import { Module } from '@nestjs/common';
import { WithdrawalsController, AdminWithdrawalsController } from './withdrawals.controller';
import { WithdrawalService } from './services/withdrawal.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerModule } from '../ledger/ledger.module';
import { KycModule } from '../kyc/kyc.module';
import { ResponsibleGamblingService } from '../responsible-gambling/responsible-gambling.service';
import { AmlService } from '../aml/aml.service';

@Module({
  imports: [
    LedgerModule,
    KycModule,
  ],
  controllers: [WithdrawalsController, AdminWithdrawalsController],
  providers: [
    WithdrawalService,
    PrismaService,
    ResponsibleGamblingService,
    AmlService,
  ],
  exports: [WithdrawalService],
})
export class WithdrawalsModule {}
