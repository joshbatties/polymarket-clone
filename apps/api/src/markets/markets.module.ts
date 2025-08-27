import { Module } from '@nestjs/common';
import { MarketsController } from './markets.controller';
import { MarketsService } from './services/markets.service';
import { LmsrService } from './services/lmsr.service';
import { SettlementService } from './services/settlement.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [MarketsController],
  providers: [
    MarketsService,
    LmsrService,
    SettlementService,
    AdminAuditService,
    PrismaService,
  ],
  exports: [MarketsService, LmsrService, SettlementService],
})
export class MarketsModule {}
