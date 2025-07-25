import { Market, Trade, Position, OrderRequest, OrderBookEntry } from '../types/market';
import { mockMarkets, mockPositions, mockTrades, mockOrderBooks } from '../data/mockData';

export interface TradeResult {
  success: boolean;
  trade?: Trade;
  error?: string;
  newPosition?: Position;
  updatedBalance?: number;
}

export interface UserBalance {
  available: number;
  inOrders: number;
  total: number;
}

// Mock user balance
let userBalance: UserBalance = {
  available: 1000,
  inOrders: 0,
  total: 1000,
};

// Mock user positions storage
let userPositions: Position[] = [...mockPositions];

// Mock user trades storage
let userTrades: Trade[] = [...mockTrades];

export class TradingService {
  static async executeOrder(orderRequest: OrderRequest): Promise<TradeResult> {
    try {
      const market = mockMarkets.find(m => m.id === orderRequest.marketId);
      if (!market) {
        return { success: false, error: 'Market not found' };
      }

      const currentPrice = orderRequest.side === 'YES' ? market.yesPrice : market.noPrice;
      
      // Calculate trade details
      let shares: number;
      let totalCost: number;
      let executionPrice: number;

      if (orderRequest.orderType === 'MARKET') {
        if (orderRequest.amount) {
          // Amount-based order
          shares = Math.floor(orderRequest.amount / currentPrice);
          totalCost = shares * currentPrice;
          executionPrice = currentPrice;
        } else if (orderRequest.shares) {
          // Shares-based order
          shares = orderRequest.shares;
          totalCost = shares * currentPrice;
          executionPrice = currentPrice;
        } else {
          return { success: false, error: 'Must specify either amount or shares' };
        }
      } else {
        // LIMIT order
        if (!orderRequest.limitPrice || !orderRequest.shares) {
          return { success: false, error: 'Limit orders require both price and shares' };
        }
        shares = orderRequest.shares;
        executionPrice = orderRequest.limitPrice;
        totalCost = shares * executionPrice;
      }

      // Validate sufficient balance for buy orders
      if (orderRequest.action === 'BUY' && totalCost > userBalance.available) {
        return { success: false, error: 'Insufficient balance' };
      }

      // Validate user has shares for sell orders
      if (orderRequest.action === 'SELL') {
        const existingPosition = userPositions.find(
          p => p.marketId === orderRequest.marketId && p.side === orderRequest.side
        );
        if (!existingPosition || existingPosition.shares < shares) {
          return { success: false, error: 'Insufficient shares to sell' };
        }
      }

      // Create trade record
      const trade: Trade = {
        id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        marketId: orderRequest.marketId,
        market,
        side: orderRequest.side,
        action: orderRequest.action,
        shares,
        price: executionPrice,
        totalCost,
        timestamp: new Date(),
      };

      // Update user balance
      if (orderRequest.action === 'BUY') {
        userBalance.available -= totalCost;
      } else {
        userBalance.available += totalCost;
      }
      userBalance.total = userBalance.available + userBalance.inOrders;

      // Update or create position
      const updatedPosition = this.updatePosition(orderRequest, trade);

      // Add trade to history
      userTrades.unshift(trade);

      // Update market volume and share count
      market.volume += totalCost;
      if (orderRequest.action === 'BUY') {
        market.totalShares += shares;
      }

      // Simulate slight price movement based on trade
      this.updateMarketPrices(market, orderRequest.side, orderRequest.action, shares);

      return {
        success: true,
        trade,
        newPosition: updatedPosition,
        updatedBalance: userBalance.available,
      };
    } catch (error) {
      return { success: false, error: 'Trade execution failed' };
    }
  }

  private static updatePosition(orderRequest: OrderRequest, trade: Trade): Position {
    const existingPositionIndex = userPositions.findIndex(
      p => p.marketId === orderRequest.marketId && p.side === orderRequest.side
    );

    if (existingPositionIndex >= 0) {
      // Update existing position
      const position = userPositions[existingPositionIndex];
      
      if (orderRequest.action === 'BUY') {
        const totalShares = position.shares + trade.shares;
        const totalCost = position.totalCost + trade.totalCost;
        const newAvgPrice = totalCost / totalShares;

        position.shares = totalShares;
        position.avgPrice = newAvgPrice;
        position.totalCost = totalCost;
      } else {
        // SELL
        position.shares -= trade.shares;
        position.totalCost -= trade.shares * position.avgPrice;
        
        // Remove position if no shares left
        if (position.shares <= 0) {
          userPositions.splice(existingPositionIndex, 1);
          return position;
        }
      }

      // Recalculate current value and P&L
      const currentPrice = orderRequest.side === 'YES' 
        ? trade.market.yesPrice 
        : trade.market.noPrice;
      
      position.currentValue = position.shares * currentPrice;
      position.pnl = position.currentValue - position.totalCost;
      position.pnlPercentage = position.totalCost > 0 
        ? (position.pnl / position.totalCost) * 100 
        : 0;

      return position;
    } else if (orderRequest.action === 'BUY') {
      // Create new position
      const currentPrice = orderRequest.side === 'YES' 
        ? trade.market.yesPrice 
        : trade.market.noPrice;

      const newPosition: Position = {
        id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        marketId: orderRequest.marketId,
        market: trade.market,
        side: orderRequest.side,
        shares: trade.shares,
        avgPrice: trade.price,
        totalCost: trade.totalCost,
        currentValue: trade.shares * currentPrice,
        pnl: (trade.shares * currentPrice) - trade.totalCost,
        pnlPercentage: trade.totalCost > 0 
          ? (((trade.shares * currentPrice) - trade.totalCost) / trade.totalCost) * 100 
          : 0,
      };

      userPositions.push(newPosition);
      return newPosition;
    }

    throw new Error('Invalid trade action');
  }

  private static updateMarketPrices(market: Market, side: 'YES' | 'NO', action: 'BUY' | 'SELL', shares: number) {
    // Simple price impact model
    const impactFactor = shares / market.totalShares * 0.1; // 10% max impact
    const priceChange = action === 'BUY' ? impactFactor : -impactFactor;

    if (side === 'YES') {
      market.yesPrice = Math.max(0.01, Math.min(0.99, market.yesPrice + priceChange));
      market.noPrice = 1 - market.yesPrice;
    } else {
      market.noPrice = Math.max(0.01, Math.min(0.99, market.noPrice + priceChange));
      market.yesPrice = 1 - market.noPrice;
    }
  }

  static getUserBalance(): UserBalance {
    return { ...userBalance };
  }

  static getUserPositions(): Position[] {
    return [...userPositions];
  }

  static getUserTrades(): Trade[] {
    return [...userTrades];
  }

  static async placeLimitOrder(orderRequest: OrderRequest): Promise<{ success: boolean; orderId?: string; error?: string }> {
    // Validate limit order
    if (!orderRequest.limitPrice || !orderRequest.shares) {
      return { success: false, error: 'Limit orders require both price and shares' };
    }

    const totalCost = orderRequest.shares * orderRequest.limitPrice;

    if (orderRequest.action === 'BUY' && totalCost > userBalance.available) {
      return { success: false, error: 'Insufficient balance' };
    }

    // Reserve funds for buy orders
    if (orderRequest.action === 'BUY') {
      userBalance.available -= totalCost;
      userBalance.inOrders += totalCost;
    }

    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add to order book (simplified)
    const orderBook = mockOrderBooks[orderRequest.marketId];
    if (orderBook) {
      const orders = orderRequest.side === 'YES' ? orderBook.yes : orderBook.no;
      const orderList = orderRequest.action === 'BUY' ? orders.buy : orders.sell;
      
      orderList.push({
        price: orderRequest.limitPrice,
        shares: orderRequest.shares,
      });

      // Sort orders
      if (orderRequest.action === 'BUY') {
        orderList.sort((a, b) => b.price - a.price); // Highest price first
      } else {
        orderList.sort((a, b) => a.price - b.price); // Lowest price first
      }
    }

    return { success: true, orderId };
  }

  static updateAllPositions() {
    // Update current values and P&L for all positions
    userPositions.forEach(position => {
      const market = mockMarkets.find(m => m.id === position.marketId);
      if (market) {
        const currentPrice = position.side === 'YES' ? market.yesPrice : market.noPrice;
        position.currentValue = position.shares * currentPrice;
        position.pnl = position.currentValue - position.totalCost;
        position.pnlPercentage = position.totalCost > 0 
          ? (position.pnl / position.totalCost) * 100 
          : 0;
      }
    });
  }

  static async resolveMarket(marketId: string, outcome: 'YES' | 'NO'): Promise<{ success: boolean; error?: string }> {
    const market = mockMarkets.find(m => m.id === marketId);
    if (!market) {
      return { success: false, error: 'Market not found' };
    }

    if (market.resolved) {
      return { success: false, error: 'Market already resolved' };
    }

    // Resolve market
    market.resolved = true;
    market.outcome = outcome;

    // Settle all positions in this market
    const marketPositions = userPositions.filter(p => p.marketId === marketId);
    
    marketPositions.forEach(position => {
      const winnings = position.side === outcome ? position.shares : 0;
      userBalance.available += winnings;
    });

    // Remove positions for resolved market
    userPositions = userPositions.filter(p => p.marketId !== marketId);

    userBalance.total = userBalance.available + userBalance.inOrders;

    return { success: true };
  }
} 