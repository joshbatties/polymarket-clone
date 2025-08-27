import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LmsrService, LmsrState } from './lmsr.service';
import { SettlementService } from './settlement.service';
import { AdminAuditService } from '../../admin-audit/admin-audit.service';
import { Market, MarketStatus, MarketOutcomeType, Outcome, Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { ResolveMarketDto } from '../dto/resolve-market.dto';

export interface CreateMarketDto {
  slug: string;
  title: string;
  description: string;
  category: string;
  imageUrl?: string;
  liquidityParam: number;
  minTradeCents?: number;
  maxTradeCents?: number;
  openAt?: Date;
  closeAt: Date;
  resolveAt?: Date;
  resolutionSourceUrl?: string;
}

export interface SeedMarketDto {
  liquidityPoolCents: number;
  initialPriceYes?: number; // 0-1, defaults to 0.5
}

export interface MarketWithLmsr {
  market: Market;
  lmsrState: {
    liquidityParam: string;
    quantityYes: string;
    quantityNo: string;
    lastPriceYes: string;
    lastPriceNo: string;
    updatedAt: Date;
  } | null;
  currentPrices?: {
    priceYes: number;
    priceNo: number;
    totalProbability: number;
  };
}

export interface MarketQuote {
  outcome: 'YES' | 'NO';
  shares: number;
  startPrice: number;
  endPrice: number;
  costCents: number;
  avgPrice: number;
  maxCostCents: number;
  priceImpact: number;
  marketId: string;
  timestamp: Date;
  ttl: number; // Time to live in seconds
  signature: string; // HMAC signature for quote verification
}

export interface MarketListOptions {
  status?: MarketStatus;
  category?: string;
  search?: string;
  cursor?: string;
  limit?: number;
  includeStats?: boolean;
}

@Injectable()
export class MarketsService {
  private readonly logger = new Logger(MarketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lmsrService: LmsrService,
    private readonly settlementService: SettlementService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  /**
   * Create a new market
   */
  async createMarket(createMarketDto: CreateMarketDto, creatorId: string): Promise<MarketWithLmsr> {
    const {
      slug,
      title,
      description,
      category,
      imageUrl,
      liquidityParam,
      minTradeCents = 100, // $1.00 minimum
      maxTradeCents = 100000, // $1,000 maximum
      openAt,
      closeAt,
      resolveAt,
      resolutionSourceUrl,
    } = createMarketDto;

    // Validate inputs
    this.validateCreateMarketDto(createMarketDto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Check if slug already exists
        const existingMarket = await tx.market.findUnique({
          where: { slug },
        });

        if (existingMarket) {
          throw new BadRequestException(`Market with slug '${slug}' already exists`);
        }

        // Create market
        const market = await tx.market.create({
          data: {
            slug,
            title,
            description,
            category,
            imageUrl,
            outcomeType: MarketOutcomeType.BINARY,
            status: MarketStatus.DRAFT,
            minTradeCents: BigInt(minTradeCents),
            maxTradeCents: maxTradeCents ? BigInt(maxTradeCents) : null,
            totalVolumeCents: BigInt(0),
            liquidityPoolCents: BigInt(0),
            openAt,
            closeAt,
            resolveAt: resolveAt || closeAt,
            resolutionSourceUrl,
            creatorId,
          },
        });

        // Initialize LMSR state
        const initialLmsrState = this.lmsrService.initializeMarket(new Decimal(liquidityParam));
        
        const lmsrState = await tx.lmsrState.create({
          data: {
            marketId: market.id,
            liquidityParam: this.lmsrService.toDbString(initialLmsrState.liquidityParam),
            quantityYes: this.lmsrService.toDbString(initialLmsrState.quantityYes),
            quantityNo: this.lmsrService.toDbString(initialLmsrState.quantityNo),
            lastPriceYes: '0.5', // 50% initial price
            lastPriceNo: '0.5',
          },
        });

        this.logger.log(`Created market: ${market.id} (${slug})`);

        return {
          market,
          lmsrState: {
            liquidityParam: lmsrState.liquidityParam.toString(),
            quantityYes: lmsrState.quantityYes.toString(),
            quantityNo: lmsrState.quantityNo.toString(),
            lastPriceYes: lmsrState.lastPriceYes.toString(),
            lastPriceNo: lmsrState.lastPriceNo.toString(),
            updatedAt: lmsrState.updatedAt,
          },
          currentPrices: {
            priceYes: 0.5,
            priceNo: 0.5,
            totalProbability: 1.0,
          },
        };
      });
    } catch (error) {
      this.logger.error(`Failed to create market: ${error.message}`);
      throw error;
    }
  }

  /**
   * Seed market with initial liquidity
   */
  async seedMarket(marketId: string, seedMarketDto: SeedMarketDto): Promise<MarketWithLmsr> {
    const { liquidityPoolCents, initialPriceYes = 0.5 } = seedMarketDto;

    if (liquidityPoolCents < 1000) { // Minimum $10 liquidity
      throw new BadRequestException('Minimum liquidity is $10.00');
    }

    if (initialPriceYes < 0 || initialPriceYes > 1) {
      throw new BadRequestException('Initial price must be between 0 and 1');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Get market and LMSR state
        const market = await tx.market.findUnique({
          where: { id: marketId },
          include: { lmsrState: true },
        });

        if (!market) {
          throw new NotFoundException(`Market ${marketId} not found`);
        }

        if (!market.lmsrState) {
          throw new BadRequestException(`Market ${marketId} has no LMSR state`);
        }

        // Seed the LMSR state with initial price
        const liquidityParam = market.lmsrState.liquidityParam;
        const seededState = this.lmsrService.seedMarket(
          liquidityParam,
          new Decimal(initialPriceYes)
        );

        // Calculate actual prices after seeding
        const prices = this.lmsrService.calculatePrices(seededState);

        // Update LMSR state
        const updatedLmsrState = await tx.lmsrState.update({
          where: { marketId },
          data: {
            quantityYes: this.lmsrService.toDbString(seededState.quantityYes),
            quantityNo: this.lmsrService.toDbString(seededState.quantityNo),
            lastPriceYes: this.lmsrService.toDbString(prices.priceYes),
            lastPriceNo: this.lmsrService.toDbString(prices.priceNo),
          },
        });

        // Update market with liquidity pool
        const updatedMarket = await tx.market.update({
          where: { id: marketId },
          data: {
            liquidityPoolCents: BigInt(liquidityPoolCents),
            status: MarketStatus.OPEN, // Market becomes open after seeding
          },
        });

        this.logger.log(`Seeded market ${marketId} with $${liquidityPoolCents/100} liquidity, initial price: ${initialPriceYes}`);

        return {
          market: updatedMarket,
          lmsrState: {
            liquidityParam: updatedLmsrState.liquidityParam.toString(),
            quantityYes: updatedLmsrState.quantityYes.toString(),
            quantityNo: updatedLmsrState.quantityNo.toString(),
            lastPriceYes: updatedLmsrState.lastPriceYes.toString(),
            lastPriceNo: updatedLmsrState.lastPriceNo.toString(),
            updatedAt: updatedLmsrState.updatedAt,
          },
          currentPrices: {
            priceYes: this.lmsrService.toApiNumber(prices.priceYes),
            priceNo: this.lmsrService.toApiNumber(prices.priceNo),
            totalProbability: this.lmsrService.toApiNumber(prices.totalProbability),
          },
        };
      });
    } catch (error) {
      this.logger.error(`Failed to seed market ${marketId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get market by ID with current prices
   */
  async getMarketById(id: string, includeStats: boolean = true): Promise<MarketWithLmsr | null> {
    try {
      const market = await this.prisma.market.findUnique({
        where: { id },
        include: {
          lmsrState: true,
          creator: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          ...(includeStats && {
            trades: {
              select: {
                id: true,
                shares: true,
                costCents: true,
                timestamp: true,
              },
              orderBy: { timestamp: 'desc' },
              take: 10,
            },
            positions: {
              select: {
                userId: true,
                yesShares: true,
                noShares: true,
              },
              where: {
                OR: [
                  { yesShares: { gt: 0 } },
                  { noShares: { gt: 0 } },
                ],
              },
            },
          }),
        },
      });

      if (!market) {
        return null;
      }

      // Calculate current prices if LMSR state exists
      let currentPrices;
      if (market.lmsrState) {
        const lmsrState: LmsrState = {
          liquidityParam: market.lmsrState.liquidityParam,
          quantityYes: market.lmsrState.quantityYes,
          quantityNo: market.lmsrState.quantityNo,
        };

        const prices = this.lmsrService.calculatePrices(lmsrState);
        currentPrices = {
          priceYes: this.lmsrService.toApiNumber(prices.priceYes),
          priceNo: this.lmsrService.toApiNumber(prices.priceNo),
          totalProbability: this.lmsrService.toApiNumber(prices.totalProbability),
        };
      }

      return {
        market,
        lmsrState: market.lmsrState ? {
          liquidityParam: market.lmsrState.liquidityParam.toString(),
          quantityYes: market.lmsrState.quantityYes.toString(),
          quantityNo: market.lmsrState.quantityNo.toString(),
          lastPriceYes: market.lmsrState.lastPriceYes.toString(),
          lastPriceNo: market.lmsrState.lastPriceNo.toString(),
          updatedAt: market.lmsrState.updatedAt,
        } : null,
        currentPrices,
      };
    } catch (error) {
      this.logger.error(`Failed to get market ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * List markets with filtering and pagination
   */
  async listMarkets(options: MarketListOptions = {}): Promise<{
    markets: MarketWithLmsr[];
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const {
      status,
      category,
      search,
      cursor,
      limit = 20,
      includeStats = false,
    } = options;

    try {
      const where: Prisma.MarketWhereInput = {};

      if (status) {
        where.status = status;
      }

      if (category) {
        where.category = category;
      }

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
        ];
      }

      const markets = await this.prisma.market.findMany({
        where,
        include: {
          lmsrState: true,
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          ...(includeStats && {
            _count: {
              select: {
                trades: true,
                positions: true,
              },
            },
          }),
        },
        orderBy: [
          { status: 'asc' }, // Open markets first
          { createdAt: 'desc' },
        ],
        take: limit + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
      });

      const hasMore = markets.length > limit;
      const results = hasMore ? markets.slice(0, -1) : markets;
      const nextCursor = hasMore ? results[results.length - 1].id : null;

      // Calculate current prices for each market
      const marketsWithPrices: MarketWithLmsr[] = await Promise.all(
        results.map(async (market) => {
          let currentPrices;
          if (market.lmsrState) {
            try {
              const lmsrState: LmsrState = {
                liquidityParam: market.lmsrState.liquidityParam,
                quantityYes: market.lmsrState.quantityYes,
                quantityNo: market.lmsrState.quantityNo,
              };

              const prices = this.lmsrService.calculatePrices(lmsrState);
              currentPrices = {
                priceYes: this.lmsrService.toApiNumber(prices.priceYes),
                priceNo: this.lmsrService.toApiNumber(prices.priceNo),
                totalProbability: this.lmsrService.toApiNumber(prices.totalProbability),
              };
            } catch (error) {
              this.logger.error(`Failed to calculate prices for market ${market.id}: ${error.message}`);
              currentPrices = {
                priceYes: 0.5,
                priceNo: 0.5,
                totalProbability: 1.0,
              };
            }
          }

          return {
            market,
            lmsrState: market.lmsrState ? {
              liquidityParam: market.lmsrState.liquidityParam.toString(),
              quantityYes: market.lmsrState.quantityYes.toString(),
              quantityNo: market.lmsrState.quantityNo.toString(),
              lastPriceYes: market.lmsrState.lastPriceYes.toString(),
              lastPriceNo: market.lmsrState.lastPriceNo.toString(),
              updatedAt: market.lmsrState.updatedAt,
            } : null,
            currentPrices,
          };
        })
      );

      return {
        markets: marketsWithPrices,
        hasMore,
        nextCursor,
      };
    } catch (error) {
      this.logger.error(`Failed to list markets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a quote for buying/selling shares
   */
  async generateQuote(
    marketId: string,
    outcome: 'YES' | 'NO',
    shares: number,
    isBuy: boolean = true
  ): Promise<MarketQuote> {
    try {
      // Get market and LMSR state
      const market = await this.prisma.market.findUnique({
        where: { id: marketId },
        include: { lmsrState: true },
      });

      if (!market) {
        throw new NotFoundException(`Market ${marketId} not found`);
      }

      if (market.status !== MarketStatus.OPEN) {
        throw new BadRequestException(`Market ${marketId} is not open for trading`);
      }

      if (!market.lmsrState) {
        throw new BadRequestException(`Market ${marketId} has no LMSR state`);
      }

      // Validate trade size
      const sharesDecimal = new Decimal(shares);
      const minShares = Number(market.minTradeCents) / 100; // Convert cents to shares (approximate)
      
      if (shares < minShares) {
        throw new BadRequestException(`Minimum trade size is ${minShares} shares`);
      }

      // Build LMSR state
      const lmsrState: LmsrState = {
        liquidityParam: market.lmsrState.liquidityParam,
        quantityYes: market.lmsrState.quantityYes,
        quantityNo: market.lmsrState.quantityNo,
      };

      // Calculate quote
      const quote = isBuy 
        ? this.lmsrService.calculateBuyCost(lmsrState, outcome, sharesDecimal)
        : this.lmsrService.calculateSellProceeds(lmsrState, outcome, sharesDecimal);

      // Generate HMAC signature for quote verification
      const timestamp = new Date();
      const ttl = 10; // 10 seconds TTL
      const signature = await this.generateQuoteSignature({
        marketId,
        outcome,
        shares,
        costCents: quote.costCents,
        timestamp: timestamp.getTime(),
        ttl,
      });

      const marketQuote: MarketQuote = {
        outcome,
        shares,
        startPrice: this.lmsrService.toApiNumber(quote.startPrice),
        endPrice: this.lmsrService.toApiNumber(quote.endPrice),
        costCents: quote.costCents,
        avgPrice: this.lmsrService.toApiNumber(quote.avgPrice),
        maxCostCents: quote.maxCostCents,
        priceImpact: this.lmsrService.toApiNumber(quote.priceImpact),
        marketId,
        timestamp,
        ttl,
        signature,
      };

      this.logger.debug(`Generated quote for market ${marketId}: ${JSON.stringify({
        outcome,
        shares,
        costCents: quote.costCents,
        startPrice: marketQuote.startPrice,
        endPrice: marketQuote.endPrice,
      })}`);

      return marketQuote;
    } catch (error) {
      this.logger.error(`Failed to generate quote for market ${marketId}: ${error.message}`);
      throw error;
    }
  }



  /**
   * Validation helpers
   */
  private validateCreateMarketDto(dto: CreateMarketDto): void {
    if (!dto.slug || dto.slug.length < 3 || dto.slug.length > 100) {
      throw new BadRequestException('Slug must be between 3 and 100 characters');
    }

    if (!dto.title || dto.title.length < 5 || dto.title.length > 200) {
      throw new BadRequestException('Title must be between 5 and 200 characters');
    }

    if (!dto.description || dto.description.length < 10) {
      throw new BadRequestException('Description must be at least 10 characters');
    }

    if (!dto.category || dto.category.length < 2) {
      throw new BadRequestException('Category is required');
    }

    if (dto.liquidityParam < 1 || dto.liquidityParam > 10000) {
      throw new BadRequestException('Liquidity parameter must be between 1 and 10000');
    }

    if (dto.closeAt <= new Date()) {
      throw new BadRequestException('Close date must be in the future');
    }

    if (dto.openAt && dto.openAt >= dto.closeAt) {
      throw new BadRequestException('Open date must be before close date');
    }

    if (dto.resolveAt && dto.resolveAt < dto.closeAt) {
      throw new BadRequestException('Resolve date must be after close date');
    }

    // Validate slug format (alphanumeric, hyphens, underscores)
    if (!/^[a-z0-9-_]+$/.test(dto.slug)) {
      throw new BadRequestException('Slug can only contain lowercase letters, numbers, hyphens, and underscores');
    }
  }

  /**
   * Generate HMAC signature for quote verification
   */
  private async generateQuoteSignature(quoteData: {
    marketId: string;
    outcome: string;
    shares: number;
    costCents: number;
    timestamp: number;
    ttl: number;
  }): Promise<string> {
    const crypto = await import('crypto');
    const secret = process.env.QUOTE_SIGNING_SECRET || 'development-secret-key';
    
    const payload = JSON.stringify({
      marketId: quoteData.marketId,
      outcome: quoteData.outcome,
      shares: quoteData.shares,
      costCents: quoteData.costCents,
      timestamp: quoteData.timestamp,
      ttl: quoteData.ttl,
    });

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  /**
   * Verify quote signature
   */
  async verifyQuoteSignature(quote: MarketQuote): Promise<boolean> {
    const now = Date.now();
    const quoteAge = (now - quote.timestamp.getTime()) / 1000;

    // Check if quote has expired
    if (quoteAge > quote.ttl) {
      return false;
    }

    // Regenerate signature and compare
    const expectedSignature = await this.generateQuoteSignature({
      marketId: quote.marketId,
      outcome: quote.outcome,
      shares: quote.shares,
      costCents: quote.costCents,
      timestamp: quote.timestamp.getTime(),
      ttl: quote.ttl,
    });

    return expectedSignature === quote.signature;
  }

  /**
   * Get market statistics
   */
  async getMarketStats(marketId: string): Promise<{
    totalVolumeCents: number;
    totalTrades: number;
    uniqueTraders: number;
    liquidity: {
      depthYes: number;
      depthNo: number;
      spread: number;
    };
  }> {
    try {
      const market = await this.prisma.market.findUnique({
        where: { id: marketId },
        include: {
          lmsrState: true,
          trades: {
            select: {
              userId: true,
              costCents: true,
            },
          },
        },
      });

      if (!market) {
        throw new NotFoundException(`Market ${marketId} not found`);
      }

      const totalTrades = market.trades.length;
      const uniqueTraders = new Set(market.trades.map(t => t.userId)).size;
      const totalVolumeCents = Number(market.totalVolumeCents);

      // Calculate liquidity metrics
      let liquidity = {
        depthYes: 0,
        depthNo: 0,
        spread: 0,
      };

      if (market.lmsrState) {
        const lmsrState: LmsrState = {
          liquidityParam: market.lmsrState.liquidityParam,
          quantityYes: market.lmsrState.quantityYes,
          quantityNo: market.lmsrState.quantityNo,
        };

        const currentPrices = this.lmsrService.calculatePrices(lmsrState);
        
        // Calculate market depth at ±1% price levels
        const priceYesPlus1 = currentPrices.priceYes.plus(0.01);
        const priceYesMinus1 = currentPrices.priceYes.minus(0.01);
        
        if (priceYesPlus1.lte(1) && priceYesPlus1.gte(0)) {
          const depthYes = this.lmsrService.calculateMarketDepth(lmsrState, priceYesPlus1, 'YES');
          liquidity.depthYes = this.lmsrService.toApiNumber(depthYes);
        }

        if (priceYesMinus1.lte(1) && priceYesMinus1.gte(0)) {
          const depthNo = this.lmsrService.calculateMarketDepth(lmsrState, priceYesMinus1, 'NO');
          liquidity.depthNo = this.lmsrService.toApiNumber(depthNo);
        }

        // Calculate bid-ask spread (simplified)
        liquidity.spread = 0.02; // 2% default spread for LMSR
      }

      return {
        totalVolumeCents,
        totalTrades,
        uniqueTraders,
        liquidity,
      };
    } catch (error) {
      this.logger.error(`Failed to get market stats for ${marketId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close a market to prevent new trades (Admin only)
   */
  async closeMarket(
    marketId: string, 
    adminUserId: string, 
    ipAddress?: string, 
    userAgent?: string
  ): Promise<Market> {
    // Get current market state
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
    });

    if (!market) {
      throw new NotFoundException('Market not found');
    }

    if (market.status === MarketStatus.CLOSED || market.status === MarketStatus.RESOLVED) {
      throw new BadRequestException('Market is already closed or resolved');
    }

    if (market.status === MarketStatus.CANCELLED) {
      throw new BadRequestException('Cannot close a cancelled market');
    }

    const oldMarketData = { ...market };

    // Close the market
    const updatedMarket = await this.prisma.market.update({
      where: { id: marketId },
      data: {
        status: MarketStatus.CLOSED,
        closeAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Log the admin action
    await this.adminAuditService.logMarketClosure(
      adminUserId,
      marketId,
      oldMarketData,
      updatedMarket,
      ipAddress,
      userAgent
    );

    this.logger.log(`Market ${marketId} closed by admin ${adminUserId}`);
    return updatedMarket;
  }

  /**
   * Resolve a market with outcome and trigger settlement (Admin only)
   */
  async resolveMarket(
    marketId: string,
    resolveDto: ResolveMarketDto,
    adminUserId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ market: Market; settlement: any }> {
    const { outcome, resolverNotes, sourceUrl } = resolveDto;

    // Get current market state
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
    });

    if (!market) {
      throw new NotFoundException('Market not found');
    }

    if (market.status === MarketStatus.RESOLVED) {
      throw new BadRequestException('Market is already resolved');
    }

    if (market.status === MarketStatus.CANCELLED) {
      throw new BadRequestException('Cannot resolve a cancelled market');
    }

    if (market.status === MarketStatus.DRAFT) {
      throw new BadRequestException('Cannot resolve a draft market');
    }

    const oldMarketData = { ...market };

    // Resolve the market
    const resolvedMarket = await this.prisma.market.update({
      where: { id: marketId },
      data: {
        status: MarketStatus.RESOLVED,
        resolutionOutcome: outcome,
        resolutionNotes: resolverNotes,
        resolutionSourceUrl: sourceUrl,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Log the admin action
    await this.adminAuditService.logMarketResolution(
      adminUserId,
      marketId,
      { outcome, resolverNotes, sourceUrl },
      oldMarketData,
      ipAddress,
      userAgent
    );

    // Trigger automatic settlement
    this.logger.log(`Market ${marketId} resolved as ${outcome} by admin ${adminUserId}. Starting settlement...`);
    
    const settlement = await this.settlementService.settleMarket(
      resolvedMarket,
      outcome,
      adminUserId
    );

    this.logger.log(
      `Market ${marketId} settlement completed: ${settlement.totalWinners} winners, ${settlement.totalPayoutCents} cents paid out`
    );

    return {
      market: resolvedMarket,
      settlement,
    };
  }

  /**
   * Get market resolution status and settlement info
   */
  async getMarketResolutionStatus(marketId: string): Promise<any> {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      select: {
        id: true,
        title: true,
        status: true,
        resolutionOutcome: true,
        resolutionNotes: true,
        resolutionSourceUrl: true,
        resolvedAt: true,
        closeAt: true,
      },
    });

    if (!market) {
      throw new NotFoundException('Market not found');
    }

    let settlementInfo = null;
    if (market.status === MarketStatus.RESOLVED) {
      settlementInfo = await this.settlementService.getSettlementSummary(marketId);
    }

    return {
      market,
      settlement: settlementInfo,
    };
  }

  /**
   * Get markets that need admin attention (ready to close/resolve)
   */
  async getMarketsNeedingAttention(): Promise<any[]> {
    const now = new Date();

    // Markets that should be closed (past close time but still open)
    const marketsToClose = await this.prisma.market.findMany({
      where: {
        status: MarketStatus.OPEN,
        closeAt: { lte: now },
      },
      select: {
        id: true,
        title: true,
        status: true,
        closeAt: true,
        _count: {
          select: { trades: true, positions: true },
        },
      },
      orderBy: { closeAt: 'asc' },
    });

    // Markets that are closed but not resolved
    const marketsToResolve = await this.prisma.market.findMany({
      where: {
        status: MarketStatus.CLOSED,
      },
      select: {
        id: true,
        title: true,
        status: true,
        closeAt: true,
        resolveAt: true,
        _count: {
          select: { trades: true, positions: true },
        },
      },
      orderBy: { closeAt: 'asc' },
    });

    return [
      ...marketsToClose.map(m => ({ ...m, action: 'NEEDS_CLOSING' })),
      ...marketsToResolve.map(m => ({ ...m, action: 'NEEDS_RESOLUTION' })),
    ];
  }
}
