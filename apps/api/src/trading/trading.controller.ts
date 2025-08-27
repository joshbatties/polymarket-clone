import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimitConfigs } from '../rate-limit/rate-limit.config';
import { TelemetryService } from '../telemetry/telemetry.service';
import { TradingService } from './services/trading.service';
import { PositionsService, PositionFilters, TradeFilters } from './services/positions.service';
import { ExecuteTradeDto } from './dto/execute-trade.dto';
import { User } from '@prisma/client';

@Controller()
export class TradingController {
  private readonly logger = new Logger(TradingController.name);

  constructor(
    private readonly tradingService: TradingService,
    private readonly positionsService: PositionsService,
    private readonly telemetryService: TelemetryService,
  ) {}

  /**
   * Execute a trade
   * POST /markets/:id/trades
   */
  @Post('markets/:id/trades')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(RateLimitConfigs.TRADING_EXECUTE)
  @HttpCode(HttpStatus.CREATED)
  async executeTrade(
    @Param('id') marketId: string,
    @CurrentUser() user: User,
    @Body() executeTradeDto: ExecuteTradeDto,
  ) {
    if (!marketId || marketId.length < 1) {
      throw new BadRequestException('Market ID is required');
    }

    try {
      const result = await this.tradingService.executeTrade(
        marketId,
        user.id,
        executeTradeDto
      );

      this.logger.log(`Trade executed: User ${user.id}, Market ${marketId}, ${executeTradeDto.outcome} ${executeTradeDto.shares || 'budget'} shares`);

      return {
        success: true,
        data: {
          trade: {
            id: result.trade.id,
            marketId: result.trade.marketId,
            outcome: result.trade.outcome,
            side: result.trade.side,
            shares: result.trade.shares,
            fillPrice: result.fillPrice,
            cost: {
              costCents: Number(result.trade.costCents),
              costFormatted: this.formatCurrency(Number(result.trade.costCents)),
              feeCents: Number(result.trade.feeCents),
              feeFormatted: this.formatCurrency(Number(result.trade.feeCents)),
              totalCostCents: result.totalCostCents,
              totalCostFormatted: this.formatCurrency(result.totalCostCents),
            },
            timestamp: result.trade.timestamp,
          },
          position: {
            yesShares: Number(result.position.yesShares),
            noShares: Number(result.position.noShares),
            totalShares: result.newBalance.totalShares,
            avgPriceYes: Number(result.position.avgPriceYes),
            avgPriceNo: Number(result.position.avgPriceNo),
          },
          balance: {
            cashCents: result.newBalance.userCashCents,
            cashFormatted: this.formatCurrency(result.newBalance.userCashCents),
          },
          market: {
            newPrices: {
              yes: result.market.newPrices.priceYes,
              no: result.market.newPrices.priceNo,
              yesPercent: Math.round(result.market.newPrices.priceYes * 100),
              noPercent: Math.round(result.market.newPrices.priceNo * 100),
            },
            newVolumeCents: result.market.newVolumeCents,
            newVolumeFormatted: this.formatCurrency(result.market.newVolumeCents),
          },
        },
        message: `Successfully ${executeTradeDto.outcome === 'YES' ? 'bought YES' : 'bought NO'} shares`,
      };

    } catch (error) {
      this.logger.error(`Failed to execute trade for user ${user.id}, market ${marketId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's positions
   * GET /positions
   */
  @Get('positions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getUserPositions(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('outcome') outcome?: string,
    @Query('minValue') minValue?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      // Validate and parse filters
      const filters: PositionFilters = {};

      if (status && ['open', 'closed'].includes(status)) {
        filters.status = status as 'open' | 'closed';
      }

      if (category) {
        filters.marketCategory = category;
      }

      if (outcome && ['YES', 'NO'].includes(outcome)) {
        filters.outcome = outcome as 'YES' | 'NO';
      }

      if (minValue) {
        const parsedMinValue = parseFloat(minValue);
        if (!isNaN(parsedMinValue) && parsedMinValue >= 0) {
          filters.minValue = parsedMinValue * 100; // Convert to cents
        }
      }

      if (sortBy && ['value', 'pnl', 'percentage', 'recent'].includes(sortBy)) {
        filters.sortBy = sortBy as any;
      }

      if (sortOrder && ['asc', 'desc'].includes(sortOrder)) {
        filters.sortOrder = sortOrder as 'asc' | 'desc';
      }

      if (limit) {
        const parsedLimit = parseInt(limit, 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
          filters.limit = parsedLimit;
        }
      }

      if (offset) {
        const parsedOffset = parseInt(offset, 10);
        if (!isNaN(parsedOffset) && parsedOffset >= 0) {
          filters.offset = parsedOffset;
        }
      }

      const result = await this.positionsService.getUserPositions(user.id, filters);

      return {
        success: true,
        data: {
          positions: result.positions.map(p => this.formatPositionResponse(p)),
          pagination: {
            total: result.total,
            limit: filters.limit || 20,
            offset: filters.offset || 0,
          },
          summary: result.summary,
        },
      };

    } catch (error) {
      this.logger.error(`Failed to get positions for user ${user.id}:`, error);
      throw error;
    }
  }

  /**
   * Get user's trade history
   * GET /trades
   */
  @Get('trades')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getUserTrades(
    @CurrentUser() user: User,
    @Query('marketId') marketId?: string,
    @Query('outcome') outcome?: string,
    @Query('side') side?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      // Validate and parse filters
      const filters: TradeFilters = {};

      if (marketId) {
        filters.marketId = marketId;
      }

      if (outcome && ['YES', 'NO'].includes(outcome)) {
        filters.outcome = outcome as 'YES' | 'NO';
      }

      if (side && ['BUY', 'SELL'].includes(side)) {
        filters.side = side as 'BUY' | 'SELL';
      }

      if (fromDate) {
        const parsedFromDate = new Date(fromDate);
        if (!isNaN(parsedFromDate.getTime())) {
          filters.fromDate = parsedFromDate;
        }
      }

      if (toDate) {
        const parsedToDate = new Date(toDate);
        if (!isNaN(parsedToDate.getTime())) {
          filters.toDate = parsedToDate;
        }
      }

      if (sortBy && ['timestamp', 'value', 'shares'].includes(sortBy)) {
        filters.sortBy = sortBy as any;
      }

      if (sortOrder && ['asc', 'desc'].includes(sortOrder)) {
        filters.sortOrder = sortOrder as 'asc' | 'desc';
      }

      if (limit) {
        const parsedLimit = parseInt(limit, 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
          filters.limit = parsedLimit;
        }
      }

      if (offset) {
        const parsedOffset = parseInt(offset, 10);
        if (!isNaN(parsedOffset) && parsedOffset >= 0) {
          filters.offset = parsedOffset;
        }
      }

      const result = await this.positionsService.getUserTrades(user.id, filters);

      return {
        success: true,
        data: {
          trades: result.trades.map(t => this.formatTradeResponse(t)),
          pagination: {
            total: result.total,
            limit: filters.limit || 20,
            offset: filters.offset || 0,
          },
        },
      };

    } catch (error) {
      this.logger.error(`Failed to get trades for user ${user.id}:`, error);
      throw error;
    }
  }

  /**
   * Get portfolio summary
   * GET /portfolio/summary
   */
  @Get('portfolio/summary')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getPortfolioSummary(@CurrentUser() user: User) {
    try {
      const summary = await this.positionsService.getPortfolioSummary(user.id);

      return {
        success: true,
        data: summary,
      };

    } catch (error) {
      this.logger.error(`Failed to get portfolio summary for user ${user.id}:`, error);
      throw error;
    }
  }

  /**
   * Get position for specific market
   * GET /markets/:id/position
   */
  @Get('markets/:id/position')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMarketPosition(
    @Param('id') marketId: string,
    @CurrentUser() user: User,
  ) {
    if (!marketId || marketId.length < 1) {
      throw new BadRequestException('Market ID is required');
    }

    try {
      const position = await this.positionsService.getUserPositionForMarket(user.id, marketId);

      return {
        success: true,
        data: position ? this.formatPositionResponse(position) : null,
      };

    } catch (error) {
      this.logger.error(`Failed to get position for user ${user.id}, market ${marketId}:`, error);
      throw error;
    }
  }

  /**
   * Get trading statistics
   * GET /trading/stats
   */
  @Get('trading/stats')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getTradingStats(
    @CurrentUser() user: User,
    @Query('days') days?: string,
  ) {
    try {
      const daysParam = days ? parseInt(days, 10) : 30;
      const validDays = !isNaN(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

      const stats = await this.positionsService.getTradingStats(user.id, validDays);

      return {
        success: true,
        data: {
          ...stats,
          period: {
            days: validDays,
            from: new Date(Date.now() - validDays * 24 * 60 * 60 * 1000).toISOString(),
            to: new Date().toISOString(),
          },
        },
      };

    } catch (error) {
      this.logger.error(`Failed to get trading stats for user ${user.id}:`, error);
      throw error;
    }
  }

  /**
   * Get trading limits
   * GET /trading/limits
   */
  @Get('trading/limits')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getTradingLimits(@CurrentUser() user: User) {
    try {
      const limits = await this.tradingService.getTradingLimits(user.id);

      return {
        success: true,
        data: {
          minTrade: {
            cents: limits.minTradeCents,
            formatted: this.formatCurrency(limits.minTradeCents),
          },
          maxTrade: {
            cents: limits.maxTradeCents,
            formatted: this.formatCurrency(limits.maxTradeCents),
          },
          maxPosition: {
            cents: limits.maxPositionCents,
            formatted: this.formatCurrency(limits.maxPositionCents),
          },
          dailyLimit: {
            cents: limits.dailyTradeLimitCents,
            formatted: this.formatCurrency(limits.dailyTradeLimitCents),
          },
        },
      };

    } catch (error) {
      this.logger.error(`Failed to get trading limits for user ${user.id}:`, error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private formatPositionResponse(positionWithMarket: any) {
    const { position, market, pnl } = positionWithMarket;

    return {
      position: {
        yesShares: Number(position.yesShares),
        noShares: Number(position.noShares),
        totalShares: Number(position.yesShares) + Number(position.noShares),
        avgCostCents: Number(position.avgCostCents),
        avgCostFormatted: this.formatCurrency(Number(position.avgCostCents)),
        createdAt: position.createdAt,
        updatedAt: position.updatedAt,
      },
      market: {
        id: market.id,
        slug: market.slug,
        title: market.title,
        description: market.description,
        category: market.category,
        status: market.status,
        currentPrices: market.currentPrices ? {
          yes: market.currentPrices.priceYes,
          no: market.currentPrices.priceNo,
          yesPercent: Math.round(market.currentPrices.priceYes * 100),
          noPercent: Math.round(market.currentPrices.priceNo * 100),
        } : null,
        timeline: {
          closeAt: market.closeAt,
          resolveAt: market.resolveAt,
          resolvedAt: market.resolvedAt,
        },
      },
      pnl,
    };
  }

  private formatTradeResponse(tradeWithMarket: any) {
    const { trade, market } = tradeWithMarket;

    return {
      trade: {
        id: trade.id,
        outcome: trade.outcome,
        side: trade.side,
        shares: trade.shares,
        fillPrice: trade.fillPrice,
        cost: {
          costCents: Number(trade.costCents),
          costFormatted: this.formatCurrency(Number(trade.costCents)),
          feeCents: Number(trade.feeCents),
          feeFormatted: this.formatCurrency(Number(trade.feeCents)),
          totalCostCents: Number(trade.costCents) + Number(trade.feeCents),
          totalCostFormatted: this.formatCurrency(Number(trade.costCents) + Number(trade.feeCents)),
        },
        timestamp: trade.timestamp,
      },
      market: {
        id: market.id,
        slug: market.slug,
        title: market.title,
        category: market.category,
        status: market.status,
      },
    };
  }

  private formatCurrency(cents: number): string {
    const dollars = Math.abs(cents) / 100;
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${dollars.toFixed(2)}`;
  }
}
