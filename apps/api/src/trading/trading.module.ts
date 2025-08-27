import { Module } from '@nestjs/common';
import { TradingController } from './trading.controller';
import { TradingService } from './services/trading.service';
import { PositionsService } from './services/positions.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerModule } from '../ledger/ledger.module';
import { MarketsModule } from '../markets/markets.module';
import { ResponsibleGamblingService } from '../responsible-gambling/responsible-gambling.service';
import { AmlService } from '../aml/aml.service';

@Module({
  imports: [LedgerModule, MarketsModule],
  controllers: [TradingController],
  providers: [
    TradingService,
    PositionsService,
    PrismaService,
    ResponsibleGamblingService,
    AmlService,
  ],
  exports: [TradingService, PositionsService],
})
export class TradingModule {}
