import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Decimal } from 'decimal.js';

// Configure Decimal.js for financial precision
Decimal.set({
  precision: 50,        // High precision for financial calculations
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,       // Exponential notation threshold
  toExpPos: 30,
  maxE: 9e15,          // Maximum exponent
  minE: -9e15,         // Minimum exponent
  modulo: Decimal.ROUND_HALF_UP,
});

export interface LmsrState {
  liquidityParam: Decimal;  // b parameter
  quantityYes: Decimal;     // q_yes
  quantityNo: Decimal;      // q_no
}

export interface PriceInfo {
  priceYes: Decimal;        // Current price for YES outcome
  priceNo: Decimal;         // Current price for NO outcome
  totalProbability: Decimal; // Should always be ~1.0
}

export interface QuoteInfo {
  outcome: 'YES' | 'NO';
  shares: Decimal;
  startPrice: Decimal;      // Price before trade
  endPrice: Decimal;        // Price after trade
  costCents: number;        // Total cost in cents
  avgPrice: Decimal;        // Average price paid
  maxCostCents: number;     // Maximum possible cost (for validation)
  priceImpact: Decimal;     // Price change from trade
}

export interface TradeExecution {
  shares: Decimal;
  costCents: number;
  newQuantityYes: Decimal;
  newQuantityNo: Decimal;
  priceAfter: PriceInfo;
}

@Injectable()
export class LmsrService {
  private readonly logger = new Logger(LmsrService.name);

  // Mathematical constants
  private readonly ZERO = new Decimal(0);
  private readonly ONE = new Decimal(1);
  private readonly MIN_LIQUIDITY = new Decimal(1);  // Minimum b parameter
  private readonly MAX_LIQUIDITY = new Decimal(10000); // Maximum b parameter
  private readonly MIN_SHARES = new Decimal('0.01'); // Minimum trade size
  private readonly MAX_SHARES = new Decimal(1000000); // Maximum trade size

  /**
   * LMSR Cost Function: C(q) = b * ln(exp(q_yes/b) + exp(q_no/b))
   * This is the core LMSR formula that determines market state cost
   */
  calculateCostFunction(state: LmsrState): Decimal {
    try {
      const { liquidityParam: b, quantityYes: qYes, quantityNo: qNo } = state;
      
      // Validate inputs
      this.validateLmsrState(state);
      
      // Calculate exp(q_yes/b) and exp(q_no/b)
      const expYes = this.safeExp(qYes.div(b));
      const expNo = this.safeExp(qNo.div(b));
      
      // C(q) = b * ln(exp(q_yes/b) + exp(q_no/b))
      const sumExp = expYes.plus(expNo);
      const lnSum = this.safeLn(sumExp);
      const cost = b.mul(lnSum);
      
      this.logger.debug(`Cost function: b=${b}, qYes=${qYes}, qNo=${qNo}, cost=${cost}`);
      
      return cost;
    } catch (error) {
      this.logger.error('Error calculating cost function:', error);
      throw new BadRequestException('Failed to calculate market cost function');
    }
  }

  /**
   * Calculate current market prices
   * p_yes = exp(q_yes/b) / (exp(q_yes/b) + exp(q_no/b))
   * p_no = exp(q_no/b) / (exp(q_yes/b) + exp(q_no/b))
   */
  calculatePrices(state: LmsrState): PriceInfo {
    try {
      const { liquidityParam: b, quantityYes: qYes, quantityNo: qNo } = state;
      
      this.validateLmsrState(state);
      
      // Calculate exponentials
      const expYes = this.safeExp(qYes.div(b));
      const expNo = this.safeExp(qNo.div(b));
      const sumExp = expYes.plus(expNo);
      
      // Calculate prices
      const priceYes = expYes.div(sumExp);
      const priceNo = expNo.div(sumExp);
      const totalProbability = priceYes.plus(priceNo);
      
      // Validate price bounds [0, 1]
      if (priceYes.lt(this.ZERO) || priceYes.gt(this.ONE) || 
          priceNo.lt(this.ZERO) || priceNo.gt(this.ONE)) {
        throw new Error(`Invalid price bounds: pYes=${priceYes}, pNo=${priceNo}`);
      }
      
      // Validate total probability ≈ 1
      if (totalProbability.sub(this.ONE).abs().gt(new Decimal('0.0001'))) {
        this.logger.warn(`Total probability deviation: ${totalProbability}`);
      }
      
      return {
        priceYes,
        priceNo,
        totalProbability,
      };
    } catch (error) {
      this.logger.error('Error calculating prices:', error);
      throw new BadRequestException('Failed to calculate market prices');
    }
  }

  /**
   * Calculate cost to buy a certain number of shares
   * Cost = C(q_yes + Δ, q_no) - C(q_yes, q_no) for YES
   * Cost = C(q_yes, q_no + Δ) - C(q_yes, q_no) for NO
   */
  calculateBuyCost(
    state: LmsrState, 
    outcome: 'YES' | 'NO', 
    shares: Decimal
  ): QuoteInfo {
    try {
      this.validateTradeInputs(shares, outcome);
      
      const startPrice = this.calculatePrices(state);
      const currentStartPrice = outcome === 'YES' ? startPrice.priceYes : startPrice.priceNo;
      
      // Calculate current cost
      const currentCost = this.calculateCostFunction(state);
      
      // Calculate new state after buying shares
      const newState: LmsrState = {
        liquidityParam: state.liquidityParam,
        quantityYes: outcome === 'YES' ? state.quantityYes.plus(shares) : state.quantityYes,
        quantityNo: outcome === 'NO' ? state.quantityNo.plus(shares) : state.quantityNo,
      };
      
      // Calculate new cost
      const newCost = this.calculateCostFunction(newState);
      const tradeCost = newCost.minus(currentCost);
      
      // Calculate end price
      const endPrice = this.calculatePrices(newState);
      const currentEndPrice = outcome === 'YES' ? endPrice.priceYes : endPrice.priceNo;
      
      // Calculate average price and price impact
      const avgPrice = tradeCost.div(shares);
      const priceImpact = currentEndPrice.minus(currentStartPrice);
      
      // Convert to cents (multiply by 100)
      const costCents = tradeCost.mul(100).toNumber();
      
      // Calculate maximum possible cost (when price goes to 1.0)
      const maxCostCents = shares.mul(100).toNumber();
      
      // Validate cost bounds
      if (tradeCost.lt(this.ZERO)) {
        throw new Error(`Negative trade cost: ${tradeCost}`);
      }
      
      if (avgPrice.lt(this.ZERO) || avgPrice.gt(this.ONE)) {
        throw new Error(`Invalid average price: ${avgPrice}`);
      }
      
      const quote: QuoteInfo = {
        outcome,
        shares,
        startPrice: currentStartPrice,
        endPrice: currentEndPrice,
        costCents,
        avgPrice,
        maxCostCents,
        priceImpact,
      };
      
      this.logger.debug(`Buy quote: ${JSON.stringify({
        outcome,
        shares: shares.toString(),
        startPrice: currentStartPrice.toString(),
        endPrice: currentEndPrice.toString(),
        costCents,
        avgPrice: avgPrice.toString(),
      })}`);
      
      return quote;
    } catch (error) {
      this.logger.error('Error calculating buy cost:', error);
      throw new BadRequestException(`Failed to calculate buy cost: ${error.message}`);
    }
  }

  /**
   * Calculate proceeds from selling shares
   * Proceeds = C(q_yes, q_no) - C(q_yes - Δ, q_no) for YES
   * Proceeds = C(q_yes, q_no) - C(q_yes, q_no - Δ) for NO
   */
  calculateSellProceeds(
    state: LmsrState,
    outcome: 'YES' | 'NO',
    shares: Decimal
  ): QuoteInfo {
    try {
      this.validateTradeInputs(shares, outcome);
      
      // Check if user has enough shares to sell
      const currentQuantity = outcome === 'YES' ? state.quantityYes : state.quantityNo;
      if (currentQuantity.lt(shares)) {
        throw new BadRequestException(`Insufficient ${outcome} shares to sell`);
      }
      
      const startPrice = this.calculatePrices(state);
      const currentStartPrice = outcome === 'YES' ? startPrice.priceYes : startPrice.priceNo;
      
      // Calculate current cost
      const currentCost = this.calculateCostFunction(state);
      
      // Calculate new state after selling shares
      const newState: LmsrState = {
        liquidityParam: state.liquidityParam,
        quantityYes: outcome === 'YES' ? state.quantityYes.minus(shares) : state.quantityYes,
        quantityNo: outcome === 'NO' ? state.quantityNo.minus(shares) : state.quantityNo,
      };
      
      // Calculate new cost
      const newCost = this.calculateCostFunction(newState);
      const tradeProceeds = currentCost.minus(newCost);
      
      // Calculate end price
      const endPrice = this.calculatePrices(newState);
      const currentEndPrice = outcome === 'YES' ? endPrice.priceYes : endPrice.priceNo;
      
      // Calculate average price and price impact
      const avgPrice = tradeProceeds.div(shares);
      const priceImpact = currentEndPrice.minus(currentStartPrice);
      
      // Convert to cents (multiply by 100)
      const proceedsCents = tradeProceeds.mul(100).toNumber();
      
      // For selling, max cost is 0 (you can't lose money selling)
      const maxCostCents = 0;
      
      return {
        outcome,
        shares,
        startPrice: currentStartPrice,
        endPrice: currentEndPrice,
        costCents: -proceedsCents, // Negative cost = proceeds
        avgPrice,
        maxCostCents,
        priceImpact,
      };
    } catch (error) {
      this.logger.error('Error calculating sell proceeds:', error);
      throw new BadRequestException(`Failed to calculate sell proceeds: ${error.message}`);
    }
  }

  /**
   * Execute a trade and return new market state
   */
  executeTrade(
    state: LmsrState,
    outcome: 'YES' | 'NO',
    shares: Decimal,
    isBuy: boolean = true
  ): TradeExecution {
    try {
      const quote = isBuy 
        ? this.calculateBuyCost(state, outcome, shares)
        : this.calculateSellProceeds(state, outcome, shares);
      
      const newState: LmsrState = {
        liquidityParam: state.liquidityParam,
        quantityYes: outcome === 'YES' 
          ? (isBuy ? state.quantityYes.plus(shares) : state.quantityYes.minus(shares))
          : state.quantityYes,
        quantityNo: outcome === 'NO' 
          ? (isBuy ? state.quantityNo.plus(shares) : state.quantityNo.minus(shares))
          : state.quantityNo,
      };
      
      const priceAfter = this.calculatePrices(newState);
      
      return {
        shares,
        costCents: quote.costCents,
        newQuantityYes: newState.quantityYes,
        newQuantityNo: newState.quantityNo,
        priceAfter,
      };
    } catch (error) {
      this.logger.error('Error executing trade:', error);
      throw new BadRequestException(`Failed to execute trade: ${error.message}`);
    }
  }

  /**
   * Initialize market with equal probabilities
   * Sets q_yes = q_no = 0 for 50/50 starting odds
   */
  initializeMarket(liquidityParam: Decimal): LmsrState {
    this.validateLiquidityParam(liquidityParam);
    
    return {
      liquidityParam,
      quantityYes: this.ZERO,
      quantityNo: this.ZERO,
    };
  }

  /**
   * Seed market with initial liquidity bias
   * Allows setting initial prices different from 50/50
   */
  seedMarket(
    liquidityParam: Decimal,
    initialPriceYes: Decimal
  ): LmsrState {
    this.validateLiquidityParam(liquidityParam);
    
    if (initialPriceYes.lt(this.ZERO) || initialPriceYes.gt(this.ONE)) {
      throw new BadRequestException('Initial price must be between 0 and 1');
    }
    
    const initialPriceNo = this.ONE.minus(initialPriceYes);
    
    // Calculate quantities to achieve target prices
    // If p_yes = exp(q_yes/b) / (exp(q_yes/b) + exp(q_no/b))
    // Then q_yes = b * ln(p_yes / p_no)
    if (initialPriceYes.equals(this.ZERO) || initialPriceNo.equals(this.ZERO)) {
      throw new BadRequestException('Initial prices cannot be exactly 0 or 1');
    }
    
    const ratio = initialPriceYes.div(initialPriceNo);
    const qYes = liquidityParam.mul(this.safeLn(ratio));
    const qNo = this.ZERO; // Reference point
    
    const state = {
      liquidityParam,
      quantityYes: qYes,
      quantityNo: qNo,
    };
    
    // Verify the seeded prices
    const actualPrices = this.calculatePrices(state);
    const priceDiff = actualPrices.priceYes.minus(initialPriceYes).abs();
    
    if (priceDiff.gt(new Decimal('0.001'))) {
      this.logger.warn(`Price seeding inaccuracy: target=${initialPriceYes}, actual=${actualPrices.priceYes}`);
    }
    
    return state;
  }

  /**
   * Calculate market depth (liquidity) at a given price level
   */
  calculateMarketDepth(state: LmsrState, targetPrice: Decimal, outcome: 'YES' | 'NO'): Decimal {
    const currentPrices = this.calculatePrices(state);
    const currentPrice = outcome === 'YES' ? currentPrices.priceYes : currentPrices.priceNo;
    
    if (targetPrice.equals(currentPrice)) {
      return this.ZERO;
    }
    
    // Binary search to find shares needed to reach target price
    let low = this.MIN_SHARES;
    let high = new Decimal(10000);
    let iterations = 0;
    const maxIterations = 50;
    const tolerance = new Decimal('0.0001');
    
    while (iterations < maxIterations && high.minus(low).gt(tolerance)) {
      const mid = low.plus(high).div(2);
      const quote = this.calculateBuyCost(state, outcome, mid);
      const resultPrice = quote.endPrice;
      
      if (resultPrice.lt(targetPrice)) {
        low = mid;
      } else {
        high = mid;
      }
      
      iterations++;
    }
    
    return low.plus(high).div(2);
  }

  /**
   * Validation helper methods
   */
  private validateLmsrState(state: LmsrState): void {
    if (!state.liquidityParam || !state.quantityYes || !state.quantityNo) {
      throw new BadRequestException('Invalid LMSR state: missing required fields');
    }
    
    this.validateLiquidityParam(state.liquidityParam);
    
    if (state.quantityYes.isNaN() || state.quantityNo.isNaN()) {
      throw new BadRequestException('Invalid LMSR state: NaN quantities');
    }
  }

  private validateLiquidityParam(b: Decimal): void {
    if (b.lt(this.MIN_LIQUIDITY) || b.gt(this.MAX_LIQUIDITY)) {
      throw new BadRequestException(
        `Liquidity parameter must be between ${this.MIN_LIQUIDITY} and ${this.MAX_LIQUIDITY}`
      );
    }
  }

  private validateTradeInputs(shares: Decimal, outcome: 'YES' | 'NO'): void {
    if (shares.lt(this.MIN_SHARES) || shares.gt(this.MAX_SHARES)) {
      throw new BadRequestException(
        `Shares must be between ${this.MIN_SHARES} and ${this.MAX_SHARES}`
      );
    }
    
    if (outcome !== 'YES' && outcome !== 'NO') {
      throw new BadRequestException('Outcome must be YES or NO');
    }
    
    if (shares.isNaN() || !shares.isFinite()) {
      throw new BadRequestException('Invalid shares amount');
    }
  }

  /**
   * Safe mathematical operations to prevent overflow/underflow
   */
  private safeExp(x: Decimal): Decimal {
    // Clamp to prevent overflow
    const maxExp = new Decimal(700); // ln(Number.MAX_VALUE) ≈ 709
    const clampedX = Decimal.max(Decimal.min(x, maxExp), maxExp.neg());
    return clampedX.exp();
  }

  private safeLn(x: Decimal): Decimal {
    if (x.lte(this.ZERO)) {
      throw new Error(`Cannot take logarithm of non-positive number: ${x}`);
    }
    return x.ln();
  }

  /**
   * Utility methods for external integration
   */
  
  /**
   * Convert Decimal to database-safe string
   */
  toDbString(value: Decimal): string {
    return value.toFixed();
  }

  /**
   * Convert database string to Decimal
   */
  fromDbString(value: string): Decimal {
    return new Decimal(value);
  }

  /**
   * Convert Decimal to API-safe number (with precision loss warning)
   */
  toApiNumber(value: Decimal, decimalPlaces: number = 8): number {
    const result = value.toDecimalPlaces(decimalPlaces).toNumber();
    
    if (!Number.isFinite(result)) {
      this.logger.warn(`Precision loss in toApiNumber: ${value} -> ${result}`);
      throw new BadRequestException('Number conversion resulted in infinity or NaN');
    }
    
    return result;
  }
}
