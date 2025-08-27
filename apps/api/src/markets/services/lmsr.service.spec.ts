import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LmsrService, LmsrState } from './lmsr.service';
import { Decimal } from 'decimal.js';

describe('LmsrService', () => {
  let service: LmsrService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LmsrService],
    }).compile();

    service = module.get<LmsrService>(LmsrService);
  });

  describe('Mathematical Properties', () => {
    const testLiquidityParam = new Decimal(100);
    
    describe('Cost Function', () => {
      it('should calculate cost function correctly for initial state', () => {
        const state: LmsrState = {
          liquidityParam: testLiquidityParam,
          quantityYes: new Decimal(0),
          quantityNo: new Decimal(0),
        };

        const cost = service.calculateCostFunction(state);
        
        // For q_yes = q_no = 0: C(0,0) = b * ln(e^0 + e^0) = b * ln(2)
        const expectedCost = testLiquidityParam.mul(new Decimal(2).ln());
        
        expect(cost.minus(expectedCost).abs().toNumber()).toBeLessThan(0.0001);
      });

      it('should handle large quantities without overflow', () => {
        const state: LmsrState = {
          liquidityParam: new Decimal(100),
          quantityYes: new Decimal(1000),
          quantityNo: new Decimal(-500),
        };

        expect(() => service.calculateCostFunction(state)).not.toThrow();
      });

      it('should be monotonic in quantities', () => {
        const baseState: LmsrState = {
          liquidityParam: new Decimal(50),
          quantityYes: new Decimal(10),
          quantityNo: new Decimal(5),
        };

        const baseCost = service.calculateCostFunction(baseState);

        // Increasing q_yes should increase cost
        const increasedYesState = {
          ...baseState,
          quantityYes: baseState.quantityYes.plus(10),
        };
        const increasedYesCost = service.calculateCostFunction(increasedYesState);
        expect(increasedYesCost.gt(baseCost)).toBe(true);

        // Increasing q_no should increase cost
        const increasedNoState = {
          ...baseState,
          quantityNo: baseState.quantityNo.plus(10),
        };
        const increasedNoCost = service.calculateCostFunction(increasedNoState);
        expect(increasedNoCost.gt(baseCost)).toBe(true);
      });
    });

    describe('Price Functions', () => {
      it('should start with equal prices at initialization', () => {
        const state = service.initializeMarket(testLiquidityParam);
        const prices = service.calculatePrices(state);

        expect(prices.priceYes.toNumber()).toBeCloseTo(0.5, 4);
        expect(prices.priceNo.toNumber()).toBeCloseTo(0.5, 4);
        expect(prices.totalProbability.toNumber()).toBeCloseTo(1.0, 6);
      });

      it('should maintain price bounds [0, 1]', () => {
        const extremeStates = [
          {
            liquidityParam: new Decimal(10),
            quantityYes: new Decimal(1000),
            quantityNo: new Decimal(0),
          },
          {
            liquidityParam: new Decimal(10),
            quantityYes: new Decimal(0),
            quantityNo: new Decimal(1000),
          },
          {
            liquidityParam: new Decimal(10),
            quantityYes: new Decimal(-500),
            quantityNo: new Decimal(500),
          },
        ];

        extremeStates.forEach((state, index) => {
          const prices = service.calculatePrices(state);
          
          expect(prices.priceYes.gte(0)).toBe(true);
          expect(prices.priceYes.lte(1)).toBe(true);
          expect(prices.priceNo.gte(0)).toBe(true);
          expect(prices.priceNo.lte(1)).toBe(true);
          
          // Prices should sum to approximately 1
          const total = prices.priceYes.plus(prices.priceNo);
          expect(total.minus(1).abs().toNumber()).toBeLessThan(0.001);
        });
      });

      it('should be symmetric at equal quantities', () => {
        const symmetricStates = [
          { qYes: 0, qNo: 0 },
          { qYes: 10, qNo: 10 },
          { qYes: -5, qNo: -5 },
        ];

        symmetricStates.forEach(({ qYes, qNo }) => {
          const state: LmsrState = {
            liquidityParam: new Decimal(50),
            quantityYes: new Decimal(qYes),
            quantityNo: new Decimal(qNo),
          };

          const prices = service.calculatePrices(state);
          expect(prices.priceYes.toNumber()).toBeCloseTo(0.5, 4);
          expect(prices.priceNo.toNumber()).toBeCloseTo(0.5, 4);
        });
      });

      it('should respond correctly to quantity changes', () => {
        const baseState: LmsrState = {
          liquidityParam: new Decimal(100),
          quantityYes: new Decimal(0),
          quantityNo: new Decimal(0),
        };

        const basePrices = service.calculatePrices(baseState);

        // Increasing q_yes should increase p_yes
        const increasedYesState = {
          ...baseState,
          quantityYes: new Decimal(50),
        };
        const increasedYesPrices = service.calculatePrices(increasedYesState);
        expect(increasedYesPrices.priceYes.gt(basePrices.priceYes)).toBe(true);
        expect(increasedYesPrices.priceNo.lt(basePrices.priceNo)).toBe(true);

        // Increasing q_no should increase p_no
        const increasedNoState = {
          ...baseState,
          quantityNo: new Decimal(50),
        };
        const increasedNoPrices = service.calculatePrices(increasedNoState);
        expect(increasedNoPrices.priceNo.gt(basePrices.priceNo)).toBe(true);
        expect(increasedNoPrices.priceYes.lt(basePrices.priceYes)).toBe(true);
      });
    });

    describe('Buy Cost Calculations', () => {
      it('should calculate positive cost for buying shares', () => {
        const state = service.initializeMarket(new Decimal(100));
        
        const yesQuote = service.calculateBuyCost(state, 'YES', new Decimal(10));
        const noQuote = service.calculateBuyCost(state, 'NO', new Decimal(10));

        expect(yesQuote.costCents).toBeGreaterThan(0);
        expect(noQuote.costCents).toBeGreaterThan(0);
        expect(yesQuote.avgPrice.gt(0)).toBe(true);
        expect(noQuote.avgPrice.gt(0)).toBe(true);
      });

      it('should be monotonic - more shares cost more', () => {
        const state = service.initializeMarket(new Decimal(100));
        
        const smallQuote = service.calculateBuyCost(state, 'YES', new Decimal(5));
        const largeQuote = service.calculateBuyCost(state, 'YES', new Decimal(10));

        expect(largeQuote.costCents).toBeGreaterThan(smallQuote.costCents);
        expect(largeQuote.avgPrice.gte(smallQuote.avgPrice)).toBe(true);
      });

      it('should have increasing marginal cost (convexity)', () => {
        const state = service.initializeMarket(new Decimal(100));
        
        // Buy 5 shares starting from 0
        const firstBatch = service.calculateBuyCost(state, 'YES', new Decimal(5));
        
        // Execute first trade to get new state
        const trade1 = service.executeTrade(state, 'YES', new Decimal(5), true);
        const newState: LmsrState = {
          liquidityParam: state.liquidityParam,
          quantityYes: trade1.newQuantityYes,
          quantityNo: trade1.newQuantityNo,
        };
        
        // Buy another 5 shares from new state
        const secondBatch = service.calculateBuyCost(newState, 'YES', new Decimal(5));
        
        // Second batch should be more expensive per share
        expect(secondBatch.avgPrice.gt(firstBatch.avgPrice)).toBe(true);
      });

      it('should respect price impact calculations', () => {
        const state = service.initializeMarket(new Decimal(50)); // Lower liquidity = higher impact
        
        const smallTrade = service.calculateBuyCost(state, 'YES', new Decimal(1));
        const largeTrade = service.calculateBuyCost(state, 'YES', new Decimal(50));

        // Large trades should have higher price impact
        expect(largeTrade.priceImpact.abs().gt(smallTrade.priceImpact.abs())).toBe(true);
        
        // Price impact should be positive for YES trades (price increases)
        expect(largeTrade.priceImpact.gt(0)).toBe(true);
      });
    });

    describe('Sell Proceeds Calculations', () => {
      it('should calculate positive proceeds for selling shares', () => {
        // First, create a state where user has shares to sell
        const initialState = service.initializeMarket(new Decimal(100));
        const buyTrade = service.executeTrade(initialState, 'YES', new Decimal(20), true);
        
        const stateWithShares: LmsrState = {
          liquidityParam: initialState.liquidityParam,
          quantityYes: buyTrade.newQuantityYes,
          quantityNo: buyTrade.newQuantityNo,
        };

        const sellQuote = service.calculateSellProceeds(stateWithShares, 'YES', new Decimal(10));

        // Selling should give negative cost (positive proceeds)
        expect(sellQuote.costCents).toBeLessThan(0);
        expect(sellQuote.avgPrice.gt(0)).toBe(true);
      });

      it('should reject selling more shares than available', () => {
        const state: LmsrState = {
          liquidityParam: new Decimal(100),
          quantityYes: new Decimal(5), // Only 5 shares available
          quantityNo: new Decimal(0),
        };

        expect(() => {
          service.calculateSellProceeds(state, 'YES', new Decimal(10)); // Try to sell 10
        }).toThrow(BadRequestException);
      });
    });

    describe('Market Seeding', () => {
      it('should seed market with target initial price', () => {
        const targetPrices = [0.3, 0.7, 0.2, 0.8];
        
        targetPrices.forEach(targetPrice => {
          const seededState = service.seedMarket(new Decimal(100), new Decimal(targetPrice));
          const actualPrices = service.calculatePrices(seededState);
          
          expect(actualPrices.priceYes.toNumber()).toBeCloseTo(targetPrice, 3);
          expect(actualPrices.priceNo.toNumber()).toBeCloseTo(1 - targetPrice, 3);
        });
      });

      it('should reject invalid initial prices', () => {
        const invalidPrices = [-0.1, 1.1, 0, 1];
        
        invalidPrices.forEach(price => {
          expect(() => {
            service.seedMarket(new Decimal(100), new Decimal(price));
          }).toThrow(BadRequestException);
        });
      });
    });

    describe('Numerical Stability', () => {
      it('should handle very small liquidity parameters', () => {
        const smallB = new Decimal(1);
        const state = service.initializeMarket(smallB);
        
        expect(() => service.calculatePrices(state)).not.toThrow();
        expect(() => service.calculateBuyCost(state, 'YES', new Decimal(0.1))).not.toThrow();
      });

      it('should handle very large liquidity parameters', () => {
        const largeB = new Decimal(10000);
        const state = service.initializeMarket(largeB);
        
        expect(() => service.calculatePrices(state)).not.toThrow();
        expect(() => service.calculateBuyCost(state, 'YES', new Decimal(100))).not.toThrow();
      });

      it('should handle extreme quantity differences', () => {
        const state: LmsrState = {
          liquidityParam: new Decimal(100),
          quantityYes: new Decimal(1000),
          quantityNo: new Decimal(-1000),
        };

        const prices = service.calculatePrices(state);
        expect(prices.priceYes.gte(0)).toBe(true);
        expect(prices.priceYes.lte(1)).toBe(true);
        expect(prices.totalProbability.minus(1).abs().toNumber()).toBeLessThan(0.001);
      });

      it('should maintain precision with many small trades', () => {
        let state = service.initializeMarket(new Decimal(100));
        
        // Execute 100 small trades
        for (let i = 0; i < 100; i++) {
          const trade = service.executeTrade(state, 'YES', new Decimal(0.1), true);
          state = {
            liquidityParam: state.liquidityParam,
            quantityYes: trade.newQuantityYes,
            quantityNo: trade.newQuantityNo,
          };
        }

        const finalPrices = service.calculatePrices(state);
        expect(finalPrices.totalProbability.minus(1).abs().toNumber()).toBeLessThan(0.01);
      });
    });

    describe('Arbitrage and Consistency', () => {
      it('should satisfy no-arbitrage condition', () => {
        const state = service.initializeMarket(new Decimal(100));
        
        // Buy YES and NO shares with same amount
        const yesQuote = service.calculateBuyCost(state, 'YES', new Decimal(10));
        const noQuote = service.calculateBuyCost(state, 'NO', new Decimal(10));
        
        // Total cost should be approximately equal to the number of shares
        // (in cents, so 10 shares ≈ 1000 cents)
        const totalCost = yesQuote.costCents + noQuote.costCents;
        expect(Math.abs(totalCost - 1000)).toBeLessThan(100); // Within $1 tolerance
      });

      it('should have consistent buy/sell spreads', () => {
        // Create state with existing positions
        const initialState = service.initializeMarket(new Decimal(100));
        const trade = service.executeTrade(initialState, 'YES', new Decimal(20), true);
        
        const state: LmsrState = {
          liquidityParam: initialState.liquidityParam,
          quantityYes: trade.newQuantityYes,
          quantityNo: trade.newQuantityNo,
        };

        const buyQuote = service.calculateBuyCost(state, 'YES', new Decimal(1));
        const sellQuote = service.calculateSellProceeds(state, 'YES', new Decimal(1));

        // Buy price should be higher than sell price
        expect(buyQuote.avgPrice.gt(sellQuote.avgPrice)).toBe(true);
        
        // But not excessively so (spread should be reasonable)
        const spread = buyQuote.avgPrice.minus(sellQuote.avgPrice);
        expect(spread.lt(0.1)).toBe(true); // Less than 10% spread
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should reject invalid liquidity parameters', () => {
        expect(() => service.initializeMarket(new Decimal(0))).toThrow(BadRequestException);
        expect(() => service.initializeMarket(new Decimal(-10))).toThrow(BadRequestException);
        expect(() => service.initializeMarket(new Decimal(20000))).toThrow(BadRequestException);
      });

      it('should reject invalid trade sizes', () => {
        const state = service.initializeMarket(new Decimal(100));
        
        expect(() => service.calculateBuyCost(state, 'YES', new Decimal(0))).toThrow(BadRequestException);
        expect(() => service.calculateBuyCost(state, 'YES', new Decimal(-5))).toThrow(BadRequestException);
        expect(() => service.calculateBuyCost(state, 'YES', new Decimal(2000000))).toThrow(BadRequestException);
      });

      it('should reject invalid outcomes', () => {
        const state = service.initializeMarket(new Decimal(100));
        
        expect(() => service.calculateBuyCost(state, 'MAYBE' as any, new Decimal(1))).toThrow(BadRequestException);
      });

      it('should handle NaN and infinite values gracefully', () => {
        const invalidState: LmsrState = {
          liquidityParam: new Decimal(100),
          quantityYes: new Decimal(NaN),
          quantityNo: new Decimal(0),
        };

        expect(() => service.calculatePrices(invalidState)).toThrow(BadRequestException);
      });
    });
  });

  describe('Utility Functions', () => {
    it('should convert decimals to/from database strings correctly', () => {
      const testValues = [
        new Decimal('123.456789'),
        new Decimal('0.000001'),
        new Decimal('999999.999999'),
        new Decimal('-123.456'),
      ];

      testValues.forEach(value => {
        const dbString = service.toDbString(value);
        const recovered = service.fromDbString(dbString);
        expect(recovered.equals(value)).toBe(true);
      });
    });

    it('should convert decimals to API numbers with appropriate precision', () => {
      const testCases = [
        { value: new Decimal('0.123456789'), precision: 4, expected: 0.1235 },
        { value: new Decimal('0.999999'), precision: 3, expected: 1.000 },
        { value: new Decimal('123.456'), precision: 2, expected: 123.46 },
      ];

      testCases.forEach(({ value, precision, expected }) => {
        const result = service.toApiNumber(value, precision);
        expect(result).toBeCloseTo(expected, precision);
      });
    });

    it('should detect and handle overflow in API number conversion', () => {
      const largeValue = new Decimal('1e+400');
      expect(() => service.toApiNumber(largeValue)).toThrow(BadRequestException);
    });
  });

  describe('Market Depth Calculations', () => {
    it('should calculate market depth correctly', () => {
      const state = service.initializeMarket(new Decimal(100));
      const currentPrices = service.calculatePrices(state);
      
      // Calculate depth to move price by 5%
      const targetPrice = currentPrices.priceYes.plus(0.05);
      const depth = service.calculateMarketDepth(state, targetPrice, 'YES');
      
      expect(depth.gt(0)).toBe(true);
      
      // Verify that buying this amount actually moves price close to target
      const quote = service.calculateBuyCost(state, 'YES', depth);
      expect(quote.endPrice.minus(targetPrice.toNumber()).abs().toNumber()).toBeLessThan(0.01);
    });

    it('should return zero depth for same price', () => {
      const state = service.initializeMarket(new Decimal(100));
      const currentPrices = service.calculatePrices(state);
      
      const depth = service.calculateMarketDepth(state, currentPrices.priceYes, 'YES');
      expect(depth.toNumber()).toBeCloseTo(0, 6);
    });
  });
});
