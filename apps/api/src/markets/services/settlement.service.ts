import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService, LedgerEntryRequest } from '../../ledger/ledger.service';
import { Market, Position, Outcome, LedgerEntryType, MarketStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';

interface SettlementResult {
  marketId: string;
  totalWinners: number;
  totalPayoutCents: number;
  totalSettlementFeeCents: number;
  winningPositions: SettlementPosition[];
}

interface SettlementPosition {
  userId: string;
  positionId: string;
  winningShares: number;
  payoutCents: number;
  settlementFeeCents: number;
}

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);
  private readonly settlementFeeRate: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly configService: ConfigService,
  ) {
    // Settlement fee as a percentage (e.g., 0.5% = 0.005)
    this.settlementFeeRate = parseFloat(this.configService.get('SETTLEMENT_FEE_RATE', '0.005'));
  }

  /**
   * Settle a resolved market by paying out winning positions
   */
  async settleMarket(market: Market, resolutionOutcome: Outcome, adminUserId: string): Promise<SettlementResult> {
    if (market.status !== MarketStatus.RESOLVED) {
      throw new BadRequestException('Market must be resolved before settlement');
    }

    this.logger.log(`Starting settlement for market ${market.id} with outcome ${resolutionOutcome}`);

    // Get all positions for this market
    const positions = await this.prisma.position.findMany({
      where: { marketId: market.id },
      include: { user: true },
    });

    if (positions.length === 0) {
      this.logger.log(`No positions found for market ${market.id}, skipping settlement`);
      return {
        marketId: market.id,
        totalWinners: 0,
        totalPayoutCents: 0,
        totalSettlementFeeCents: 0,
        winningPositions: [],
      };
    }

    return await this.prisma.$transaction(async (tx) => {
      const winningPositions: SettlementPosition[] = [];
      let totalPayoutCents = 0;
      let totalSettlementFeeCents = 0;

      // Process each position
      for (const position of positions) {
        const winningShares = this.calculateWinningShares(position, resolutionOutcome);
        
        if (winningShares > 0) {
          // Calculate payout: 1 AUD per winning share
          const grossPayoutCents = Math.floor(winningShares * 100); // Convert to cents
          const settlementFeeCents = Math.floor(grossPayoutCents * this.settlementFeeRate);
          const netPayoutCents = grossPayoutCents - settlementFeeCents;

          // Record winning position
          winningPositions.push({
            userId: position.userId,
            positionId: position.id,
            winningShares,
            payoutCents: netPayoutCents,
            settlementFeeCents,
          });

          totalPayoutCents += netPayoutCents;
          totalSettlementFeeCents += settlementFeeCents;

          // Create ledger entries for payout
          await this.createSettlementLedgerEntries(
            position.userId,
            market.id,
            netPayoutCents,
            settlementFeeCents,
            `Settlement payout for market: ${market.title}`,
            tx
          );

          this.logger.log(
            `Settling position ${position.id}: ${winningShares} shares = ${netPayoutCents} cents (fee: ${settlementFeeCents})`
          );
        }

        // Zero out the position (both winning and losing)
        await tx.position.update({
          where: { id: position.id },
          data: {
            yesShares: new Decimal(0),
            noShares: new Decimal(0),
            avgPriceYes: new Decimal(0),
            avgPriceNo: new Decimal(0),
            totalInvested: BigInt(0),
            realizedPnl: BigInt(Number(position.realizedPnl) + (winningShares > 0 ? totalPayoutCents : 0)),
          },
        });
      }

      // Update market settlement status
      await tx.market.update({
        where: { id: market.id },
        data: {
          status: MarketStatus.RESOLVED, // Ensure it stays resolved
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `Settlement completed for market ${market.id}: ${winningPositions.length} winners, ${totalPayoutCents} cents total payout`
      );

      return {
        marketId: market.id,
        totalWinners: winningPositions.length,
        totalPayoutCents,
        totalSettlementFeeCents,
        winningPositions,
      };
    });
  }

  /**
   * Calculate winning shares for a position based on resolution outcome
   */
  private calculateWinningShares(position: Position, resolutionOutcome: Outcome): number {
    if (resolutionOutcome === Outcome.YES) {
      return Number(position.yesShares);
    } else if (resolutionOutcome === Outcome.NO) {
      return Number(position.noShares);
    }
    return 0; // In case of other outcomes or errors
  }

  /**
   * Create ledger entries for settlement payout
   */
  private async createSettlementLedgerEntries(
    userId: string,
    marketId: string,
    payoutCents: number,
    settlementFeeCents: number,
    description: string,
    tx: any
  ): Promise<void> {
    const ledgerEntries: any[] = [
      // Credit user cash account with net payout
      {
        accountId: `user_cash_${userId}`,
        counterAccountId: 'custody_cash',
        userId,
        amountCents: BigInt(payoutCents),
        entryType: LedgerEntryType.SETTLEMENT,
        description,
        metadata: {
          marketId,
          settlementType: 'winning_payout',
          grossPayoutCents: payoutCents + settlementFeeCents,
          settlementFeeCents,
        },
      },
      // Debit custody cash
      {
        accountId: 'custody_cash',
        counterAccountId: `user_cash_${userId}`,
        userId: undefined,
        amountCents: -BigInt(payoutCents),
        entryType: LedgerEntryType.SETTLEMENT,
        description: `Settlement payout to user ${userId}`,
        metadata: {
          marketId,
          userId,
          payoutCents,
          settlementType: 'custody_debit',
          settlementFeeCents,
        },
      },
    ];

    // If there's a settlement fee, create entries for that too
    if (settlementFeeCents > 0) {
      const feeEntries: LedgerEntryRequest[] = [
        // Credit fee revenue account
        {
          accountId: 'fee_revenue',
          counterAccountId: 'custody_cash',
          userId: undefined,
          amountCents: BigInt(settlementFeeCents),
          entryType: LedgerEntryType.FEE,
          description: `Settlement fee for market ${marketId}`,
          metadata: {
            marketId,
            userId,
            settlementFeeCents,
            feeType: 'settlement_fee',
          },
        },
        // Additional debit from custody cash for fee
        {
          accountId: 'custody_cash',
          counterAccountId: 'fee_revenue',
          userId: undefined,
          amountCents: -BigInt(settlementFeeCents),
          entryType: LedgerEntryType.FEE,
          description: `Settlement fee collection for market ${marketId}`,
          metadata: {
            marketId,
            userId,
            settlementFeeCents,
            feeType: 'settlement_fee',
          },
        }
      ];
      ledgerEntries.push(...feeEntries);
    }

    // Post the ledger transaction
    await this.ledgerService.postTransaction({
      entries: ledgerEntries,
      idempotencyKey: `settlement_${marketId}_${userId}_${Date.now()}`,
    });
  }

  /**
   * Get settlement summary for a market
   */
  async getSettlementSummary(marketId: string): Promise<any> {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      include: {
        positions: {
          include: { user: true },
        },
      },
    });

    if (!market) {
      throw new BadRequestException('Market not found');
    }

    if (market.status !== MarketStatus.RESOLVED) {
      return {
        marketId,
        status: 'NOT_SETTLED',
        message: 'Market is not yet resolved',
      };
    }

    // Count settled positions (those with zero shares)
    const settledPositions = market.positions.filter(
      (p) => Number(p.yesShares) === 0 && Number(p.noShares) === 0
    );

    const totalPositions = market.positions.length;
    const isFullySettled = settledPositions.length === totalPositions;

    return {
      marketId,
      status: isFullySettled ? 'FULLY_SETTLED' : 'PARTIALLY_SETTLED',
      totalPositions,
      settledPositions: settledPositions.length,
      resolutionOutcome: market.resolutionOutcome,
      resolvedAt: market.resolvedAt,
    };
  }
}
