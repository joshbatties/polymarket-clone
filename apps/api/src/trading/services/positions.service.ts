import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketsService } from '../../markets/services/markets.service';
import { LmsrService } from '../../markets/services/lmsr.service';
import { Position, Trade, Market, TradeSide, Outcome } from '@prisma/client';

export interface PositionWithMarket {
  position: Position;
  market: Market & {
    currentPrices?: {
      priceYes: number;
      priceNo: number;
    };
  };
  pnl: {
    unrealizedPnL: number;
    unrealizedPnLFormatted: string;
    percentageChange: number;
    percentageChangeFormatted: string;
    currentValue: number;
    currentValueFormatted: string;
    costBasis: number;
    costBasisFormatted: string;
  };
}

export interface TradeWithMarket {
  trade: Trade;
  market: {
    id: string;
    slug: string;
    title: string;
    category: string;
    status: string;
  };
}

export interface PortfolioSummary {
  totalPositions: number;
  totalValue: number;
  totalValueFormatted: string;
  totalPnL: number;
  totalPnLFormatted: string;
  totalPnLPercentage: number;
  totalPnLPercentageFormatted: string;
  cashBalance: number;
  cashBalanceFormatted: string;
  totalNetWorth: number;
  totalNetWorthFormatted: string;
}

export interface PositionFilters {
  status?: 'open' | 'closed';
  marketCategory?: string;
  outcome?: 'YES' | 'NO';
  minValue?: number;
  sortBy?: 'value' | 'pnl' | 'percentage' | 'recent';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface TradeFilters {
  marketId?: string;
  outcome?: 'YES' | 'NO';
  side?: 'BUY' | 'SELL';
  fromDate?: Date;
  toDate?: Date;
  sortBy?: 'timestamp' | 'value' | 'shares';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketsService: MarketsService,
    private readonly lmsrService: LmsrService,
  ) {}

  /**
   * Get user's positions with P&L calculations
   */
  async getUserPositions(userId: string, filters: PositionFilters = {}): Promise<{
    positions: PositionWithMarket[];
    total: number;
    summary: PortfolioSummary;
  }> {
    try {
      // Build where clause
      const where: any = {
        userId,
        OR: [
          { yesShares: { gt: 0 } },
          { noShares: { gt: 0 } },
        ],
      };

      if (filters.marketCategory) {
        where.market = {
          category: filters.marketCategory,
        };
      }

      if (filters.minValue) {
        // This would require a complex calculation, so we'll filter after fetching
      }

      // Fetch positions with market data
      const positions = await this.prisma.position.findMany({
        where,
        include: {
          market: {
            include: {
              lmsrState: true,
            },
          },
        },
        orderBy: this.buildPositionOrderBy(filters.sortBy, filters.sortOrder),
        take: filters.limit,
        skip: filters.offset,
      });

      // Calculate P&L for each position
      const positionsWithPnL = await Promise.all(
        positions.map(async (pos) => this.enrichPositionWithPnL(pos))
      );

      // Apply value-based filters
      let filteredPositions = positionsWithPnL;
      if (filters.minValue) {
        filteredPositions = positionsWithPnL.filter(p => p.pnl.currentValue >= filters.minValue!);
      }

      if (filters.outcome) {
        filteredPositions = positionsWithPnL.filter(p => {
          const hasYes = Number(p.position.yesShares) > 0;
          const hasNo = Number(p.position.noShares) > 0;
          
          if (filters.outcome === 'YES') return hasYes;
          if (filters.outcome === 'NO') return hasNo;
          return true;
        });
      }

      // Calculate portfolio summary
      const summary = await this.calculatePortfolioSummary(userId, filteredPositions);

      // Get total count for pagination
      const total = await this.prisma.position.count({
        where: {
          userId,
          OR: [
            { yesShares: { gt: 0 } },
            { noShares: { gt: 0 } },
          ],
        },
      });

      return {
        positions: filteredPositions,
        total,
        summary,
      };

    } catch (error) {
      this.logger.error(`Failed to get positions for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user's trade history
   */
  async getUserTrades(userId: string, filters: TradeFilters = {}): Promise<{
    trades: TradeWithMarket[];
    total: number;
  }> {
    try {
      // Build where clause
      const where: any = { userId };

      if (filters.marketId) {
        where.marketId = filters.marketId;
      }

      if (filters.outcome) {
        where.outcome = filters.outcome === 'YES' ? Outcome.YES : Outcome.NO;
      }

      if (filters.side) {
        where.side = filters.side === 'BUY' ? TradeSide.BUY : TradeSide.SELL;
      }

      if (filters.fromDate || filters.toDate) {
        where.timestamp = {};
        if (filters.fromDate) where.timestamp.gte = filters.fromDate;
        if (filters.toDate) where.timestamp.lte = filters.toDate;
      }

      // Fetch trades with market data
      const trades = await this.prisma.trade.findMany({
        where,
        include: {
          market: {
            select: {
              id: true,
              slug: true,
              title: true,
              category: true,
              status: true,
            },
          },
        },
        orderBy: this.buildTradeOrderBy(filters.sortBy, filters.sortOrder),
        take: filters.limit,
        skip: filters.offset,
      });

      // Transform for response
      const tradesWithMarket: TradeWithMarket[] = trades.map(trade => ({
        trade,
        market: trade.market,
      }));

      // Get total count for pagination
      const total = await this.prisma.trade.count({ where });

      return {
        trades: tradesWithMarket,
        total,
      };

    } catch (error) {
      this.logger.error(`Failed to get trades for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get position for specific market
   */
  async getUserPositionForMarket(userId: string, marketId: string): Promise<PositionWithMarket | null> {
    try {
      const position = await this.prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId,
            marketId,
          },
        },
        include: {
          market: {
            include: {
              lmsrState: true,
            },
          },
        },
      });

      if (!position) {
        return null;
      }

      return await this.enrichPositionWithPnL(position);

    } catch (error) {
      this.logger.error(`Failed to get position for user ${userId}, market ${marketId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
    try {
      const { summary } = await this.getUserPositions(userId);
      return summary;
    } catch (error) {
      this.logger.error(`Failed to get portfolio summary for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get trading statistics
   */
  async getTradingStats(userId: string, days: number = 30): Promise<{
    totalTrades: number;
    totalVolume: number;
    totalVolumeFormatted: string;
    totalFees: number;
    totalFeesFormatted: string;
    winRate: number;
    winRateFormatted: string;
    avgTradeSize: number;
    avgTradeSizeFormatted: string;
    profitableTrades: number;
    losingTrades: number;
    breakEvenTrades: number;
  }> {
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const trades = await this.prisma.trade.findMany({
        where: {
          userId,
          timestamp: { gte: fromDate },
        },
        include: {
          market: true,
        },
      });

      const totalTrades = trades.length;
      const totalVolume = trades.reduce((sum, trade) => sum + Number(trade.costCents), 0);
      const totalFees = trades.reduce((sum, trade) => sum + Number(trade.feeCents), 0);
      const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;

      // Calculate win/loss stats (simplified - would need position resolution data)
      const profitableTrades = 0; // Would calculate based on resolved positions
      const losingTrades = 0;
      const breakEvenTrades = 0;
      const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;

      return {
        totalTrades,
        totalVolume,
        totalVolumeFormatted: this.formatCurrency(totalVolume),
        totalFees,
        totalFeesFormatted: this.formatCurrency(totalFees),
        winRate,
        winRateFormatted: `${(winRate * 100).toFixed(1)}%`,
        avgTradeSize,
        avgTradeSizeFormatted: this.formatCurrency(avgTradeSize),
        profitableTrades,
        losingTrades,
        breakEvenTrades,
      };

    } catch (error) {
      this.logger.error(`Failed to get trading stats for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async enrichPositionWithPnL(position: any): Promise<PositionWithMarket> {
    const market = position.market;
    
    // Get current market prices
    let currentPrices = { priceYes: 0.5, priceNo: 0.5 };
    
    if (market.lmsrState) {
      try {
        const lmsrState = {
          liquidityParam: this.lmsrService.fromDbString(market.lmsrState.liquidityParam),
          quantityYes: this.lmsrService.fromDbString(market.lmsrState.quantityYes),
          quantityNo: this.lmsrService.fromDbString(market.lmsrState.quantityNo),
        };
        
        const prices = this.lmsrService.calculatePrices(lmsrState);
        currentPrices = {
          priceYes: this.lmsrService.toApiNumber(prices.priceYes),
          priceNo: this.lmsrService.toApiNumber(prices.priceNo),
        };
      } catch (error) {
        this.logger.warn(`Failed to calculate current prices for market ${market.id}: ${error.message}`);
      }
    }

    // Calculate P&L
    const yesShares = Number(position.yesShares);
    const noShares = Number(position.noShares);
    const avgCostCents = Number(position.avgCostCents);
    const totalShares = yesShares + noShares;

    const currentValue = (yesShares * currentPrices.priceYes + noShares * currentPrices.priceNo) * 100;
    const costBasis = totalShares * avgCostCents;
    const unrealizedPnL = currentValue - costBasis;
    const percentageChange = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

    return {
      position,
      market: {
        ...market,
        currentPrices,
      },
      pnl: {
        unrealizedPnL,
        unrealizedPnLFormatted: this.formatCurrency(unrealizedPnL),
        percentageChange,
        percentageChangeFormatted: `${percentageChange >= 0 ? '+' : ''}${percentageChange.toFixed(2)}%`,
        currentValue,
        currentValueFormatted: this.formatCurrency(currentValue),
        costBasis,
        costBasisFormatted: this.formatCurrency(costBasis),
      },
    };
  }

  private async calculatePortfolioSummary(
    userId: string, 
    positions: PositionWithMarket[]
  ): Promise<PortfolioSummary> {
    const totalPositions = positions.length;
    const totalValue = positions.reduce((sum, p) => sum + p.pnl.currentValue, 0);
    const totalCostBasis = positions.reduce((sum, p) => sum + p.pnl.costBasis, 0);
    const totalPnL = totalValue - totalCostBasis;
    const totalPnLPercentage = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

    // Get cash balance
    const cashAccount = await this.prisma.walletAccount.findFirst({
      where: {
        userId,
        accountType: 'USER_CASH',
        status: 'ACTIVE',
      },
    });

    const cashBalance = cashAccount ? Number(cashAccount.availableCents) : 0;
    const totalNetWorth = totalValue + cashBalance;

    return {
      totalPositions,
      totalValue,
      totalValueFormatted: this.formatCurrency(totalValue),
      totalPnL,
      totalPnLFormatted: this.formatCurrency(totalPnL),
      totalPnLPercentage,
      totalPnLPercentageFormatted: `${totalPnLPercentage >= 0 ? '+' : ''}${totalPnLPercentage.toFixed(2)}%`,
      cashBalance,
      cashBalanceFormatted: this.formatCurrency(cashBalance),
      totalNetWorth,
      totalNetWorthFormatted: this.formatCurrency(totalNetWorth),
    };
  }

  private buildPositionOrderBy(sortBy?: string, sortOrder: string = 'desc'): any {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
      case 'recent':
        return { updatedAt: order };
      case 'value':
        // Would need to calculate value in query - fallback to updated
        return { updatedAt: order };
      case 'pnl':
        // Would need to calculate P&L in query - fallback to updated
        return { updatedAt: order };
      default:
        return { updatedAt: order };
    }
  }

  private buildTradeOrderBy(sortBy?: string, sortOrder: string = 'desc'): any {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
      case 'timestamp':
        return { timestamp: order };
      case 'value':
        return { costCents: order };
      case 'shares':
        return { shares: order };
      default:
        return { timestamp: order };
    }
  }

  private formatCurrency(cents: number): string {
    const dollars = Math.abs(cents) / 100;
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${dollars.toFixed(2)}`;
  }
}
