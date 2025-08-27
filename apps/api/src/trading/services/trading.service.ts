import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../../ledger/ledger.service';
import { MarketsService, MarketQuote } from '../../markets/services/markets.service';
import { LmsrService, LmsrState } from '../../markets/services/lmsr.service';
import { ConfigService } from '@nestjs/config';
import { ResponsibleGamblingService } from '../../responsible-gambling/responsible-gambling.service';
import { AmlService } from '../../aml/aml.service';
import { Market, MarketStatus, Trade, Position, TradeSide, Outcome, LedgerEntryType } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

export interface ExecuteTradeDto {
  outcome: 'YES' | 'NO';
  shares?: number;
  maxSpendCents?: number;
  quoteSignature?: string;
  idempotencyKey: string;
}

export interface TradeResult {
  trade: Trade;
  position: Position;
  fillPrice: number;
  totalCostCents: number;
  feeCents: number;
  newBalance: {
    userCashCents: number;
    totalShares: number;
    yesShares: number;
    noShares: number;
  };
  market: {
    newPrices: {
      priceYes: number;
      priceNo: number;
    };
    newVolumeCents: number;
  };
}

export interface TradeLimits {
  minTradeCents: number;
  maxTradeCents: number;
  maxPositionCents: number;
  dailyTradeLimitCents: number;
}

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly marketsService: MarketsService,
    private readonly lmsrService: LmsrService,
    private readonly configService: ConfigService,
    private readonly rgService: ResponsibleGamblingService,
    private readonly amlService: AmlService,
  ) {}

  /**
   * Execute a trade (buy or sell)
   */
  async executeTrade(
    marketId: string,
    userId: string,
    executeTradeDto: ExecuteTradeDto
  ): Promise<TradeResult> {
    const { outcome, shares, maxSpendCents, quoteSignature, idempotencyKey } = executeTradeDto;

    // Compliance checks before executing trade
    await this.validateTradeCompliance(userId, marketId, shares, maxSpendCents);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Validate idempotency key
        await this.validateIdempotencyKey(idempotencyKey, 'trade', tx);

        // 2. Get market and validate state
        const market = await this.getAndValidateMarket(marketId, tx);

        // 3. Validate trading limits
        await this.validateTradingLimits(market, userId, shares, maxSpendCents, tx);

        // 4. Determine trade parameters (shares or max spend)
        const tradeShares = await this.determineTradeShares(
          market, 
          outcome, 
          shares, 
          maxSpendCents, 
          quoteSignature
        );

        // 5. Get current LMSR state
        const lmsrState = await this.getCurrentLmsrState(market, tx);

        // 6. Calculate trade cost and fees
        const { costCents, feeCents, totalCostCents } = await this.calculateTradeCost(
          lmsrState, 
          outcome, 
          tradeShares
        );

        // 7. Validate user has sufficient funds
        await this.validateUserFunds(userId, totalCostCents, tx);

        // 8. Execute ledger transactions
        await this.executeLedgerTransactions(
          userId,
          costCents,
          feeCents,
          idempotencyKey,
          tx
        );

        // 9. Update LMSR state
        const newLmsrState = await this.updateLmsrState(
          market,
          lmsrState,
          outcome,
          tradeShares,
          tx
        );

        // 10. Create trade record
        const trade = await this.createTradeRecord(
          market,
          userId,
          outcome,
          tradeShares,
          costCents,
          feeCents,
          idempotencyKey,
          tx
        );

        // 11. Update or create position
        const position = await this.updateUserPosition(
          market,
          userId,
          outcome,
          tradeShares,
          costCents,
          tx
        );

        // 12. Update market volume
        await this.updateMarketVolume(market, totalCostCents, tx);

        // 13. Calculate results
        const fillPrice = costCents / (tradeShares.toNumber() * 100);
        const newPrices = this.lmsrService.calculatePrices(newLmsrState);
        const userBalance = await this.getUserBalance(userId, tx);

        this.logger.log(`Trade executed: User ${userId}, Market ${marketId}, ${outcome} ${tradeShares} shares for $${totalCostCents/100}`);

        return {
          trade,
          position,
          fillPrice,
          totalCostCents,
          feeCents,
          newBalance: {
            userCashCents: Number(userBalance.balance),
            totalShares: Number(position.yesShares) + Number(position.noShares),
            yesShares: Number(position.yesShares),
            noShares: Number(position.noShares),
          },
          market: {
            newPrices: {
              priceYes: this.lmsrService.toApiNumber(newPrices.priceYes),
              priceNo: this.lmsrService.toApiNumber(newPrices.priceNo),
            },
            newVolumeCents: Number(market.totalVolumeCents) + totalCostCents,
          },
        };
      }, {
        timeout: 10000, // 10 second timeout for trade execution
      });

    } catch (error) {
      this.logger.error(`Failed to execute trade: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user's trading limits
   */
  async getTradingLimits(userId: string): Promise<TradeLimits> {
    const config = {
      minTradeCents: this.configService.get<number>('MIN_TRADE_CENTS', 100), // $1.00
      maxTradeCents: this.configService.get<number>('MAX_TRADE_CENTS', 1000000), // $10,000
      maxPositionCents: this.configService.get<number>('MAX_POSITION_CENTS', 5000000), // $50,000
      dailyTradeLimitCents: this.configService.get<number>('DAILY_TRADE_LIMIT_CENTS', 10000000), // $100,000
    };

    return config;
  }

  /**
   * Calculate trade cost including fees
   */
  private async calculateTradeCost(
    lmsrState: LmsrState,
    outcome: 'YES' | 'NO',
    shares: Decimal
  ): Promise<{ costCents: number; feeCents: number; totalCostCents: number }> {
    // Calculate base cost using LMSR
    const quote = this.lmsrService.calculateBuyCost(lmsrState, outcome, shares);
    const costCents = Math.round(quote.costCents);

    // Calculate fee (configurable percentage)
    const feeRate = this.configService.get<number>('TRADING_FEE_RATE', 0.008); // 0.8% default
    const feeCents = Math.round(costCents * feeRate);

    const totalCostCents = costCents + feeCents;

    return { costCents, feeCents, totalCostCents };
  }

  /**
   * Validate quote signature and determine trade shares
   */
  private async determineTradeShares(
    market: Market,
    outcome: 'YES' | 'NO',
    shares?: number,
    maxSpendCents?: number,
    quoteSignature?: string
  ): Promise<Decimal> {
    if (shares && maxSpendCents) {
      throw new BadRequestException('Cannot specify both shares and maxSpendCents');
    }

    if (!shares && !maxSpendCents) {
      throw new BadRequestException('Must specify either shares or maxSpendCents');
    }

    if (shares) {
      // Validate quote signature for shares-based trade
      if (quoteSignature) {
        await this.validateQuoteSignature(market.id, outcome, shares, quoteSignature);
      }
      return new Decimal(shares);
    } else {
      // For maxSpendCents, calculate optimal shares within budget
      return this.calculateSharesForBudget(market, outcome, maxSpendCents!);
    }
  }

  /**
   * Calculate optimal shares for a given budget
   */
  private async calculateSharesForBudget(
    market: Market,
    outcome: 'YES' | 'NO',
    maxSpendCents: number
  ): Promise<Decimal> {
    const lmsrState = await this.getCurrentLmsrState(market);
    const feeRate = this.configService.get<number>('TRADING_FEE_RATE', 0.008);

    // Binary search to find optimal shares within budget
    let low = new Decimal('0.01');
    let high = new Decimal('10000');
    let bestShares = low;

    const maxIterations = 50;
    let iterations = 0;

    while (iterations < maxIterations && high.minus(low).gt(new Decimal('0.01'))) {
      const mid = low.plus(high).div(2);
      
      try {
        const quote = this.lmsrService.calculateBuyCost(lmsrState, outcome, mid);
        const costWithFees = quote.costCents * (1 + feeRate);

        if (costWithFees <= maxSpendCents) {
          bestShares = mid;
          low = mid.plus(new Decimal('0.01'));
        } else {
          high = mid.minus(new Decimal('0.01'));
        }
      } catch (error) {
        high = mid.minus(new Decimal('0.01'));
      }

      iterations++;
    }

    if (bestShares.lt(new Decimal('0.01'))) {
      throw new BadRequestException(`Insufficient budget: minimum cost is higher than $${maxSpendCents/100}`);
    }

    return bestShares;
  }

  /**
   * Validate quote signature
   */
  private async validateQuoteSignature(
    marketId: string,
    outcome: 'YES' | 'NO',
    shares: number,
    signature: string
  ): Promise<void> {
    try {
      // Create a temporary quote to validate against
      const tempQuote = await this.marketsService.generateQuote(marketId, outcome, shares, true);
      const isValid = await this.marketsService.verifyQuoteSignature(tempQuote);

      if (!isValid) {
        throw new BadRequestException('Invalid or expired quote signature');
      }
    } catch (error) {
      this.logger.warn(`Quote validation failed: ${error.message}`);
      throw new BadRequestException('Quote validation failed');
    }
  }

  /**
   * Execute ledger transactions for trade
   */
  private async executeLedgerTransactions(
    userId: string,
    costCents: number,
    feeCents: number,
    idempotencyKey: string,
    tx: any
  ): Promise<void> {
    const totalCostCents = costCents + feeCents;

    // Get user's cash account
    const userCashAccount = await tx.walletAccount.findFirst({
      where: {
        userId,
        accountType: 'USER_CASH',
        status: 'ACTIVE',
      },
    });

    if (!userCashAccount) {
      throw new BadRequestException('User cash account not found');
    }

    // Get system accounts
    const custodyCashAccount = await tx.walletAccount.findFirst({
      where: { accountType: 'CUSTODY_CASH', userId: null },
    });

    const feeRevenueAccount = await tx.walletAccount.findFirst({
      where: { accountType: 'FEE_REVENUE', userId: null },
    });

    if (!custodyCashAccount || !feeRevenueAccount) {
      throw new BadRequestException('System accounts not found');
    }

    // Ledger entries for trade cost
    const tradeEntries = [
      {
        accountId: userCashAccount.id,
        counterAccountId: custodyCashAccount.id,
        userId,
        amountCents: BigInt(-totalCostCents), // Debit user
        currency: 'AUD',
        entryType: LedgerEntryType.TRADE,
        description: `Trade execution - total cost including fees`,
        metadata: {
          tradeType: 'buy',
          costCents,
          feeCents,
          idempotencyKey,
        },
      },
      {
        accountId: custodyCashAccount.id,
        counterAccountId: userCashAccount.id,
        userId: undefined,
        amountCents: BigInt(totalCostCents), // Credit custody
        currency: 'AUD',
        entryType: LedgerEntryType.TRADE,
        description: `Trade execution - receive payment from user`,
        metadata: {
          tradeType: 'buy',
          userId,
          costCents,
          feeCents,
          idempotencyKey,
        },
      },
    ];

    // Execute trade payment ledger transaction
    await this.ledgerService.postTransaction({
      entries: tradeEntries,
      idempotencyKey: `trade_payment_${idempotencyKey}`,
    });

    // Separate ledger transaction for fee accounting
    if (feeCents > 0) {
      const feeEntries = [
        {
          accountId: custodyCashAccount.id,
          counterAccountId: feeRevenueAccount.id,
          userId: undefined,
          amountCents: BigInt(-feeCents), // Debit custody
          currency: 'AUD',
          entryType: LedgerEntryType.FEE,
          description: `Trading fee collection`,
          metadata: {
            feeCents,
            userId,
            idempotencyKey,
          },
        },
        {
          accountId: feeRevenueAccount.id,
          counterAccountId: custodyCashAccount.id,
          userId: undefined,
          amountCents: BigInt(feeCents), // Credit fee revenue
          currency: 'AUD',
          entryType: LedgerEntryType.FEE,
          description: `Trading fee revenue`,
          metadata: {
            feeCents,
            userId,
            idempotencyKey,
          },
        },
      ];

      await this.ledgerService.postTransaction({
        entries: feeEntries,
        idempotencyKey: `trade_fee_${idempotencyKey}`,
      });
    }
  }

  /**
   * Update user position
   */
  private async updateUserPosition(
    market: Market,
    userId: string,
    outcome: 'YES' | 'NO',
    shares: Decimal,
    costCents: number,
    tx: any
  ): Promise<Position> {
    const sharesAmount = shares.toNumber();

    // Find existing position
    let position = await tx.position.findUnique({
      where: {
        userId_marketId: {
          userId,
          marketId: market.id,
        },
      },
    });

    if (position) {
      // Update existing position
      const currentYesShares = Number(position.yesShares);
      const currentNoShares = Number(position.noShares);
      const currentAvgCostCents = Number(position.avgCostCents);
      const currentTotalShares = currentYesShares + currentNoShares;

      let newYesShares = currentYesShares;
      let newNoShares = currentNoShares;

      if (outcome === 'YES') {
        newYesShares += sharesAmount;
      } else {
        newNoShares += sharesAmount;
      }

      const newTotalShares = newYesShares + newNoShares;
      const totalCostCents = (currentTotalShares * currentAvgCostCents) + costCents;
      const newAvgCostCents = newTotalShares > 0 ? totalCostCents / newTotalShares : 0;

      position = await tx.position.update({
        where: {
          userId_marketId: {
            userId,
            marketId: market.id,
          },
        },
        data: {
          yesShares: newYesShares,
          noShares: newNoShares,
          avgCostCents: Math.round(newAvgCostCents),
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new position
      const avgCostCents = costCents / sharesAmount;

      position = await tx.position.create({
        data: {
          userId,
          marketId: market.id,
          yesShares: outcome === 'YES' ? sharesAmount : 0,
          noShares: outcome === 'NO' ? sharesAmount : 0,
          avgCostCents: Math.round(avgCostCents),
        },
      });
    }

    return position;
  }

  /**
   * Update LMSR state after trade
   */
  private async updateLmsrState(
    market: Market,
    currentState: LmsrState,
    outcome: 'YES' | 'NO',
    shares: Decimal,
    tx: any
  ): Promise<LmsrState> {
    // Execute the trade in LMSR
    const tradeResult = this.lmsrService.executeTrade(currentState, outcome, shares, true);
    const newPrices = this.lmsrService.calculatePrices({
      liquidityParam: currentState.liquidityParam,
      quantityYes: tradeResult.newQuantityYes,
      quantityNo: tradeResult.newQuantityNo,
    });

    // Update database
    await tx.lmsrState.update({
      where: { marketId: market.id },
      data: {
        quantityYes: this.lmsrService.toDbString(tradeResult.newQuantityYes),
        quantityNo: this.lmsrService.toDbString(tradeResult.newQuantityNo),
        lastPriceYes: this.lmsrService.toDbString(newPrices.priceYes),
        lastPriceNo: this.lmsrService.toDbString(newPrices.priceNo),
        updatedAt: new Date(),
      },
    });

    return {
      liquidityParam: currentState.liquidityParam,
      quantityYes: tradeResult.newQuantityYes,
      quantityNo: tradeResult.newQuantityNo,
    };
  }

  /**
   * Helper methods
   */
  private async validateIdempotencyKey(key: string, scope: string, tx: any): Promise<void> {
    try {
      await tx.idempotencyKey.create({
        data: {
          key,
          scope,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });
    } catch (error) {
      if (error.code === 'P2002') { // Unique constraint violation
        throw new BadRequestException('Duplicate trade request detected');
      }
      throw error;
    }
  }

  private async getAndValidateMarket(marketId: string, tx: any): Promise<Market> {
    const market = await tx.market.findUnique({
      where: { id: marketId },
      include: { lmsrState: true },
    });

    if (!market) {
      throw new NotFoundException(`Market ${marketId} not found`);
    }

    if (market.status !== MarketStatus.OPEN) {
      throw new ForbiddenException(`Market ${marketId} is not open for trading`);
    }

    if (!market.lmsrState) {
      throw new BadRequestException(`Market ${marketId} has no LMSR state`);
    }

    return market;
  }

  private async validateTradingLimits(
    market: Market,
    userId: string,
    shares?: number,
    maxSpendCents?: number,
    tx?: any
  ): Promise<void> {
    const limits = await this.getTradingLimits(userId);
    
    // Estimate trade cost for validation
    let estimatedCostCents = 0;
    if (shares) {
      estimatedCostCents = shares * 100; // Rough estimate: $1 per share max
    } else if (maxSpendCents) {
      estimatedCostCents = maxSpendCents;
    }

    if (estimatedCostCents < limits.minTradeCents) {
      throw new BadRequestException(`Trade size below minimum: $${limits.minTradeCents/100}`);
    }

    if (estimatedCostCents > limits.maxTradeCents) {
      throw new BadRequestException(`Trade size above maximum: $${limits.maxTradeCents/100}`);
    }

    // Check daily limits
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dailyVolume = await tx.trade.aggregate({
      where: {
        userId,
        timestamp: { gte: today },
      },
      _sum: { costCents: true },
    });

    const currentDailyVolume = Number(dailyVolume._sum.costCents || 0);
    if (currentDailyVolume + estimatedCostCents > limits.dailyTradeLimitCents) {
      throw new BadRequestException(`Daily trading limit exceeded: $${limits.dailyTradeLimitCents/100}`);
    }
  }

  private async getCurrentLmsrState(market: Market, tx?: any): Promise<LmsrState> {
    const client = tx || this.prisma;
    
    const lmsrState = await client.lmsrState.findUnique({
      where: { marketId: market.id },
    });

    if (!lmsrState) {
      throw new BadRequestException(`No LMSR state found for market ${market.id}`);
    }

    return {
      liquidityParam: this.lmsrService.fromDbString(lmsrState.liquidityParam),
      quantityYes: this.lmsrService.fromDbString(lmsrState.quantityYes),
      quantityNo: this.lmsrService.fromDbString(lmsrState.quantityNo),
    };
  }

  private async validateUserFunds(userId: string, totalCostCents: number, tx: any): Promise<void> {
    const userBalance = await this.getUserBalance(userId, tx);
    
    if (Number(userBalance.balance) < totalCostCents) {
      throw new BadRequestException(`Insufficient funds: need $${totalCostCents/100}, have $${Number(userBalance.balance)/100}`);
    }
  }

  private async getUserBalance(userId: string, tx?: any) {
    const client = tx || this.prisma;
    
    return await client.walletAccount.findFirst({
      where: {
        userId,
        accountType: 'USER_CASH',
        status: 'ACTIVE',
      },
      select: { balance: true },
    });
  }

  private async createTradeRecord(
    market: Market,
    userId: string,
    outcome: 'YES' | 'NO',
    shares: Decimal,
    costCents: number,
    feeCents: number,
    idempotencyKey: string,
    tx: any
  ): Promise<Trade> {
    return await tx.trade.create({
      data: {
        id: uuidv4(),
        marketId: market.id,
        userId,
        side: TradeSide.BUY,
        outcome: outcome === 'YES' ? Outcome.YES : Outcome.NO,
        shares: shares.toString(),
        costCents: BigInt(costCents),
        feeCents: BigInt(feeCents),
        fillPrice: costCents / shares.toNumber(),
        timestamp: new Date(),
        idempotencyKey,
      },
    });
  }

  private async updateMarketVolume(market: Market, additionalVolume: number, tx: any): Promise<void> {
    await tx.market.update({
      where: { id: market.id },
      data: {
        totalVolumeCents: {
          increment: BigInt(additionalVolume),
        },
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Validate compliance requirements for trading
   */
  private async validateTradeCompliance(
    userId: string,
    marketId: string,
    shares?: number,
    maxSpendCents?: number
  ): Promise<void> {
    // Check responsible gambling status
    await this.rgService.validateTradingAction(userId, 'TRADE');

    // Estimate trade amount for AML checks
    const estimatedAmount = maxSpendCents || (shares ? shares * 100 : 1000); // Rough estimate

    // Monitor trading activity for unusual patterns
    const amlAnalysis = await this.amlService.monitorTradingActivity(
      userId,
      marketId,
      estimatedAmount,
      0, // P&L will be calculated after trade
      {
        platform: 'web',
        action: 'trade',
        estimatedShares: shares,
        maxSpend: maxSpendCents,
      }
    );

    if (amlAnalysis.suggestedAction === 'BLOCK') {
      throw new ForbiddenException('Trading blocked for compliance review');
    }

    if (amlAnalysis.suggestedAction === 'REVIEW') {
      this.logger.warn(`Trade flagged for review: User ${userId}, Market ${marketId}, Risk ${amlAnalysis.riskScore}`);
    }
  }
}
