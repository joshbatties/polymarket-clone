import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimitConfigs } from '../rate-limit/rate-limit.config';
import { TelemetryService } from '../telemetry/telemetry.service';
import { MarketsService } from './services/markets.service';
import { CreateMarketDto, SeedMarketDto, QuoteRequestDto } from './dto';
import { User, UserRole, MarketStatus } from '@prisma/client';

@Controller('markets')
export class MarketsController {
  private readonly logger = new Logger(MarketsController.name);

  constructor(
    private readonly marketsService: MarketsService,
    private readonly telemetryService: TelemetryService,
  ) {}

  /**
   * List markets with filtering and pagination
   * GET /markets?status=open&category=politics&search=election&cursor=abc&limit=20
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listMarkets(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('includeStats') includeStats?: string,
  ) {
    // Validate status parameter
    let marketStatus: MarketStatus | undefined;
    if (status) {
      if (!Object.values(MarketStatus).includes(status as MarketStatus)) {
        throw new BadRequestException(`Invalid status: ${status}. Must be one of: ${Object.values(MarketStatus).join(', ')}`);
      }
      marketStatus = status as MarketStatus;
    }

    // Validate and parse limit
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('Limit must be a number between 1 and 100');
    }

    const shouldIncludeStats = includeStats === 'true';

    try {
      const result = await this.marketsService.listMarkets({
        status: marketStatus,
        category,
        search,
        cursor,
        limit: parsedLimit,
        includeStats: shouldIncludeStats,
      });

      this.logger.log(`Listed ${result.markets.length} markets with filters: status=${status}, category=${category}, search=${search}`);

      return {
        success: true,
        data: {
          markets: result.markets.map(this.formatMarketResponse),
          pagination: {
            hasMore: result.hasMore,
            nextCursor: result.nextCursor,
            limit: parsedLimit,
          },
        },
      };
    } catch (error) {
      this.logger.error('Failed to list markets:', error);
      throw error;
    }
  }

  /**
   * Get market by ID
   * GET /markets/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getMarket(@Param('id') id: string) {
    if (!id || id.length < 1) {
      throw new BadRequestException('Market ID is required');
    }

    try {
      const market = await this.marketsService.getMarketById(id, true);

      if (!market) {
        throw new NotFoundException(`Market ${id} not found`);
      }

      this.logger.log(`Retrieved market: ${id}`);

      return {
        success: true,
        data: this.formatMarketResponse(market),
      };
    } catch (error) {
      this.logger.error(`Failed to get market ${id}:`, error);
      throw error;
    }
  }

  /**
   * Generate quote for market trading
   * POST /markets/:id/quote
   */
  @Post(':id/quote')
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitConfigs.TRADING_QUOTE)
  @HttpCode(HttpStatus.OK)
  async generateQuote(
    @Param('id') id: string,
    @Body() quoteRequest: QuoteRequestDto,
  ) {
    if (!id || id.length < 1) {
      throw new BadRequestException('Market ID is required');
    }

    const { outcome, shares, type = 'buy' } = quoteRequest;

    try {
      const quote = await this.marketsService.generateQuote(
        id,
        outcome,
        shares,
        type === 'buy'
      );

      this.logger.log(`Generated quote for market ${id}: ${outcome} ${shares} shares (${type})`);

      // Track quote request
      this.telemetryService.trackTradeEvent({
        event: 'trade_quote_requested',
        properties: {
          marketId: quote.marketId,
          outcome: quote.outcome.toLowerCase() as 'yes' | 'no',
          shares: quote.shares,
          costCents: quote.costCents,
          tradingFee: 0,
          slippage: quote.priceImpact,
        },
      });

      return {
        success: true,
        data: {
          quote: {
            marketId: quote.marketId,
            outcome: quote.outcome,
            shares: quote.shares,
            type,
            pricing: {
              startPrice: quote.startPrice,
              endPrice: quote.endPrice,
              avgPrice: quote.avgPrice,
              priceImpact: quote.priceImpact,
            },
            cost: {
              costCents: quote.costCents,
              costFormatted: this.formatCurrency(Math.abs(quote.costCents)),
              maxCostCents: quote.maxCostCents,
              maxCostFormatted: this.formatCurrency(quote.maxCostCents),
            },
            validation: {
              timestamp: quote.timestamp,
              ttl: quote.ttl,
              expiresAt: new Date(quote.timestamp.getTime() + quote.ttl * 1000),
              signature: quote.signature,
            },
          },
        },
      };
    } catch (error) {
      this.logger.error(`Failed to generate quote for market ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get market statistics
   * GET /markets/:id/stats
   */
  @Get(':id/stats')
  @HttpCode(HttpStatus.OK)
  async getMarketStats(@Param('id') id: string) {
    if (!id || id.length < 1) {
      throw new BadRequestException('Market ID is required');
    }

    try {
      const stats = await this.marketsService.getMarketStats(id);

      return {
        success: true,
        data: {
          volume: {
            totalCents: stats.totalVolumeCents,
            totalFormatted: this.formatCurrency(stats.totalVolumeCents),
          },
          activity: {
            totalTrades: stats.totalTrades,
            uniqueTraders: stats.uniqueTraders,
          },
          liquidity: {
            depthYes: stats.liquidity.depthYes,
            depthNo: stats.liquidity.depthNo,
            spread: stats.liquidity.spread,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get market stats for ${id}:`, error);
      throw error;
    }
  }

  /**
   * ADMIN ENDPOINTS
   */

  /**
   * Create a new market (Admin only)
   * POST /markets/admin/create
   */
  @Post('admin/create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createMarket(
    @CurrentUser() user: User,
    @Body() createMarketDto: CreateMarketDto,
  ) {
    try {
      const market = await this.marketsService.createMarket(createMarketDto, user.id);

      this.logger.log(`Admin ${user.email} created market: ${market.market.id} (${createMarketDto.slug})`);

      return {
        success: true,
        data: this.formatMarketResponse(market),
        message: 'Market created successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to create market:`, error);
      throw error;
    }
  }

  /**
   * Seed market with initial liquidity (Admin only)
   * POST /markets/admin/:id/seed
   */
  @Post('admin/:id/seed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async seedMarket(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() seedMarketDto: SeedMarketDto,
  ) {
    if (!id || id.length < 1) {
      throw new BadRequestException('Market ID is required');
    }

    try {
      const market = await this.marketsService.seedMarket(id, seedMarketDto);

      this.logger.log(`Admin ${user.email} seeded market ${id} with $${seedMarketDto.liquidityPoolCents/100} liquidity`);

      return {
        success: true,
        data: this.formatMarketResponse(market),
        message: `Market seeded with $${(seedMarketDto.liquidityPoolCents/100).toFixed(2)} liquidity`,
      };
    } catch (error) {
      this.logger.error(`Failed to seed market ${id}:`, error);
      throw error;
    }
  }

  /**
   * Resolve a market (Admin only)
   * POST /markets/admin/:id/resolve
   */
  @Post('admin/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async resolveMarket(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { outcome: 'YES' | 'NO' | 'INVALID'; resolutionNotes?: string },
  ) {
    if (!id || id.length < 1) {
      throw new BadRequestException('Market ID is required');
    }

    const { outcome, resolutionNotes } = body;

    if (!outcome || !['YES', 'NO', 'INVALID'].includes(outcome)) {
      throw new BadRequestException('Outcome must be YES, NO, or INVALID');
    }

    try {
      const result = await this.marketsService.resolveMarket(
        id,
        { outcome: outcome as 'YES' | 'NO', resolverNotes: resolutionNotes || '', sourceUrl: undefined },
        user.id,
        undefined, // IP address - we could get from request if needed
        undefined  // User agent - we could get from request if needed
      );

      this.logger.log(`Admin ${user.email} resolved market ${id} with outcome: ${outcome}`);

      return {
        success: true,
        data: {
          market: {
            id: result.market.id,
            slug: result.market.slug,
            title: result.market.title,
            status: result.market.status,
            resolutionOutcome: result.market.resolutionOutcome,
            resolutionNotes: result.market.resolutionNotes,
            resolvedAt: result.market.resolvedAt,
          },
          settlement: {
            totalWinners: result.settlement.totalWinners,
            totalPayoutCents: result.settlement.totalPayoutCents,
            totalSettlementFeeCents: result.settlement.totalSettlementFeeCents,
          },
        },
        message: `Market resolved with outcome: ${outcome}. ${result.settlement.totalWinners} winners paid out.`,
      };
    } catch (error) {
      this.logger.error(`Failed to resolve market ${id}:`, error);
      throw error;
    }
  }

  /**
   * Close a market to prevent new trades (Admin only)
   * POST /admin/markets/:id/close
   */
  @Post('admin/:id/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async closeMarket(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    if (!id || id.length < 1) {
      throw new BadRequestException('Market ID is required');
    }

    try {
      const market = await this.marketsService.closeMarket(
        id, 
        user.userId, 
        req.ip, 
        req.get('User-Agent')
      );

      this.logger.log(`Admin ${user.email} closed market ${id}`);

      return {
        success: true,
        data: {
          id: market.id,
          slug: market.slug,
          title: market.title,
          status: market.status,
          closeAt: market.closeAt,
        },
        message: 'Market closed successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to close market ${id}: ${error.message}`);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(`Failed to close market: ${error.message}`);
    }
  }

  /**
   * Get markets needing admin attention
   * GET /admin/markets/attention
   */
  @Get('admin/attention')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getMarketsNeedingAttention() {
    try {
      const markets = await this.marketsService.getMarketsNeedingAttention();
      
      return {
        success: true,
        data: markets,
        message: `Found ${markets.length} markets needing attention`,
      };
    } catch (error) {
      this.logger.error(`Failed to get markets needing attention: ${error.message}`);
      throw new InternalServerErrorException('Failed to get markets needing attention');
    }
  }

  /**
   * Get market resolution and settlement status
   * GET /markets/:id/resolution-status
   */
  @Get(':id/resolution-status')
  @HttpCode(HttpStatus.OK)
  async getMarketResolutionStatus(@Param('id') id: string) {
    if (!id || id.length < 1) {
      throw new BadRequestException('Market ID is required');
    }

    try {
      const status = await this.marketsService.getMarketResolutionStatus(id);
      
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      this.logger.error(`Failed to get resolution status for market ${id}: ${error.message}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to get market resolution status');
    }
  }

  /**
   * Private helper methods
   */

  private formatMarketResponse(marketWithLmsr: any) {
    const { market, lmsrState, currentPrices } = marketWithLmsr;

    return {
      id: market.id,
      slug: market.slug,
      title: market.title,
      description: market.description,
      category: market.category,
      imageUrl: market.imageUrl,
      status: market.status,
      outcomeType: market.outcomeType,
      
      // Trading parameters
      tradingLimits: {
        minTradeCents: Number(market.minTradeCents),
        maxTradeCents: market.maxTradeCents ? Number(market.maxTradeCents) : null,
        minTradeFormatted: this.formatCurrency(Number(market.minTradeCents)),
        maxTradeFormatted: market.maxTradeCents ? this.formatCurrency(Number(market.maxTradeCents)) : null,
      },

      // Market metrics
      metrics: {
        totalVolumeCents: Number(market.totalVolumeCents),
        totalVolumeFormatted: this.formatCurrency(Number(market.totalVolumeCents)),
        liquidityPoolCents: Number(market.liquidityPoolCents),
        liquidityPoolFormatted: this.formatCurrency(Number(market.liquidityPoolCents)),
      },

      // Current prices
      prices: currentPrices ? {
        yes: currentPrices.priceYes,
        no: currentPrices.priceNo,
        yesPercent: Math.round(currentPrices.priceYes * 100),
        noPercent: Math.round(currentPrices.priceNo * 100),
        totalProbability: currentPrices.totalProbability,
      } : null,

      // LMSR configuration
      lmsr: lmsrState ? {
        liquidityParam: lmsrState.liquidityParam,
        quantityYes: lmsrState.quantityYes,
        quantityNo: lmsrState.quantityNo,
        lastUpdated: lmsrState.updatedAt,
      } : null,

      // Important dates
      timeline: {
        createdAt: market.createdAt,
        updatedAt: market.updatedAt,
        openAt: market.openAt,
        closeAt: market.closeAt,
        resolveAt: market.resolveAt,
        resolvedAt: market.resolvedAt,
      },

      // Resolution info (if resolved)
      resolution: market.resolutionOutcome ? {
        outcome: market.resolutionOutcome,
        notes: market.resolutionNotes,
        sourceUrl: market.resolutionSourceUrl,
        resolvedAt: market.resolvedAt,
      } : null,

      // Creator info
      creator: market.creator ? {
        id: market.creator.id,
        name: `${market.creator.firstName || ''} ${market.creator.lastName || ''}`.trim() || 'Anonymous',
      } : null,

      // Recent activity (if included)
      ...(market.trades && {
        recentTrades: market.trades.map((trade: any) => ({
          id: trade.id,
          shares: trade.shares,
          costCents: Number(trade.costCents),
          costFormatted: this.formatCurrency(Number(trade.costCents)),
          timestamp: trade.timestamp,
        })),
      }),

      // Position count (if included)
      ...(market.positions && {
        activePositions: market.positions.length,
      }),

      // Trade count (if included)
      ...(market._count && {
        totalTrades: market._count.trades,
        totalPositions: market._count.positions,
      }),
    };
  }

  private formatCurrency(cents: number): string {
    const dollars = Math.abs(cents) / 100;
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${dollars.toFixed(2)}`;
  }
}
