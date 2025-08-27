import { Market } from '../types/market';
import { NotificationService } from './notificationService';
import { TradingService } from './tradingService';

interface PriceUpdate {
  marketId: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  timestamp: Date;
}

interface MarketUpdateCallback {
  (updates: PriceUpdate[]): void;
}

interface VolumeUpdateCallback {
  (marketId: string, newVolume: number): void;
}

interface OrderBookUpdateCallback {
  (marketId: string, orderBook: any): void;
}

// Real-time update subscribers
let marketUpdateSubscribers: MarketUpdateCallback[] = [];
let volumeUpdateSubscribers: VolumeUpdateCallback[] = [];
let orderBookUpdateSubscribers: OrderBookUpdateCallback[] = [];

// Market data cache
let marketDataCache: Map<string, PriceUpdate> = new Map();

// Simulation intervals
let priceUpdateInterval: ReturnType<typeof setInterval> | null = null;
let volumeUpdateInterval: ReturnType<typeof setInterval> | null = null;
let orderBookUpdateInterval: ReturnType<typeof setInterval> | null = null;

export class RealtimeService {
  static isConnected = false;
  static reconnectAttempts = 0;
  static maxReconnectAttempts = 5;

  // Subscription management
  static subscribeToMarketUpdates(callback: MarketUpdateCallback): () => void {
    marketUpdateSubscribers.push(callback);
    
    return () => {
      marketUpdateSubscribers = marketUpdateSubscribers.filter(sub => sub !== callback);
    };
  }

  static subscribeToVolumeUpdates(callback: VolumeUpdateCallback): () => void {
    volumeUpdateSubscribers.push(callback);
    
    return () => {
      volumeUpdateSubscribers = volumeUpdateSubscribers.filter(sub => sub !== callback);
    };
  }

  static subscribeToOrderBookUpdates(callback: OrderBookUpdateCallback): () => void {
    orderBookUpdateSubscribers.push(callback);
    
    return () => {
      orderBookUpdateSubscribers = orderBookUpdateSubscribers.filter(sub => sub !== callback);
    };
  }

  // Connection management
  static async connect(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🔄 Connecting to real-time market data...');
      
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Start data streams
      this.startPriceUpdates();
      this.startVolumeUpdates();
      this.startOrderBookUpdates();
      
      console.log('✅ Connected to real-time market data');
      
      // Notify about successful connection
      NotificationService.notifyGeneral(
        'Connected',
        'Real-time market data is now active'
      );
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to connect to real-time data:', error);
      return { success: false, error: 'Connection failed' };
    }
  }

  static disconnect(): void {
    console.log('🔌 Disconnecting from real-time market data...');
    
    this.isConnected = false;
    
    // Clear intervals
    if (priceUpdateInterval) {
      clearInterval(priceUpdateInterval);
      priceUpdateInterval = null;
    }
    
    if (volumeUpdateInterval) {
      clearInterval(volumeUpdateInterval);
      volumeUpdateInterval = null;
    }
    
    if (orderBookUpdateInterval) {
      clearInterval(orderBookUpdateInterval);
      orderBookUpdateInterval = null;
    }
    
    console.log('🔌 Disconnected from real-time market data');
  }

  static async reconnect(): Promise<{ success: boolean; error?: string }> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ Max reconnection attempts reached');
      return { success: false, error: 'Max reconnection attempts reached' };
    }

    this.reconnectAttempts++;
    console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    this.disconnect();
    
    // Wait before reconnecting with exponential backoff
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return this.connect();
  }

  // Price updates simulation
  private static startPriceUpdates(): void {
    priceUpdateInterval = setInterval(() => {
      if (!this.isConnected) return;

      const marketIds = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
      const updates: PriceUpdate[] = [];

      marketIds.forEach(marketId => {
        // Get current price or generate initial price
        const currentData = marketDataCache.get(marketId);
        let currentPrice = currentData?.yesPrice || 0.5;
        
        // Generate realistic price movement (small changes, mean-reverting)
        const volatility = 0.02; // 2% volatility
        const meanReversion = 0.1; // Strength of mean reversion to 0.5
        const priceChange = 
          (Math.random() - 0.5) * volatility - 
          (currentPrice - 0.5) * meanReversion * Math.random();
        
        const newYesPrice = Math.max(0.01, Math.min(0.99, currentPrice + priceChange));
        const newNoPrice = 1 - newYesPrice;
        
        // Simulate volume changes
        const volumeIncrease = Math.random() * 1000;
        const currentVolume = currentData?.volume || 100000;
        const newVolume = currentVolume + volumeIncrease;

        const update: PriceUpdate = {
          marketId,
          yesPrice: newYesPrice,
          noPrice: newNoPrice,
          volume: newVolume,
          timestamp: new Date(),
        };

        updates.push(update);
        marketDataCache.set(marketId, update);

        // Check price alerts
        NotificationService.checkPriceAlerts(marketId, newYesPrice, newNoPrice);
      });

      // Notify subscribers
      marketUpdateSubscribers.forEach(callback => {
        try {
          callback(updates);
        } catch (error) {
          console.error('Error in market update callback:', error);
        }
      });

    }, 3000); // Update every 3 seconds
  }

  // Volume updates simulation
  private static startVolumeUpdates(): void {
    volumeUpdateInterval = setInterval(() => {
      if (!this.isConnected) return;

      const marketIds = ['1', '2', '3', '4', '5', '6', '7', '8'];
      
      marketIds.forEach(marketId => {
        if (Math.random() < 0.3) { // 30% chance of volume update
          const volumeIncrease = Math.random() * 5000 + 100;
          const currentData = marketDataCache.get(marketId);
          const newVolume = (currentData?.volume || 100000) + volumeIncrease;
          
          // Update cache
          if (currentData) {
            currentData.volume = newVolume;
            marketDataCache.set(marketId, currentData);
          }

          // Notify subscribers
          volumeUpdateSubscribers.forEach(callback => {
            try {
              callback(marketId, newVolume);
            } catch (error) {
              console.error('Error in volume update callback:', error);
            }
          });
        }
      });

    }, 5000); // Update every 5 seconds
  }

  // Order book updates simulation
  private static startOrderBookUpdates(): void {
    orderBookUpdateInterval = setInterval(() => {
      if (!this.isConnected) return;

      const marketIds = ['1', '2', '7', '8'];
      
      marketIds.forEach(marketId => {
        if (Math.random() < 0.4) { // 40% chance of order book update
          const currentData = marketDataCache.get(marketId);
          const currentPrice = currentData?.yesPrice || 0.5;
          
          // Generate realistic order book data
          const orderBook = this.generateOrderBook(currentPrice);
          
          // Notify subscribers
          orderBookUpdateSubscribers.forEach(callback => {
            try {
              callback(marketId, orderBook);
            } catch (error) {
              console.error('Error in order book update callback:', error);
            }
          });
        }
      });

    }, 4000); // Update every 4 seconds
  }

  private static generateOrderBook(centerPrice: number) {
    const spread = 0.02; // 2 cent spread
    const yesBidPrice = centerPrice - spread / 2;
    const yesAskPrice = centerPrice + spread / 2;
    const noBidPrice = (1 - centerPrice) - spread / 2;
    const noAskPrice = (1 - centerPrice) + spread / 2;

    return {
      yes: {
        buy: Array.from({ length: 5 }, (_, i) => ({
          price: Math.max(0.01, yesBidPrice - i * 0.01),
          shares: Math.floor(Math.random() * 3000) + 500,
        })),
        sell: Array.from({ length: 5 }, (_, i) => ({
          price: Math.min(0.99, yesAskPrice + i * 0.01),
          shares: Math.floor(Math.random() * 3000) + 500,
        })),
      },
      no: {
        buy: Array.from({ length: 5 }, (_, i) => ({
          price: Math.max(0.01, noBidPrice - i * 0.01),
          shares: Math.floor(Math.random() * 3000) + 500,
        })),
        sell: Array.from({ length: 5 }, (_, i) => ({
          price: Math.min(0.99, noAskPrice + i * 0.01),
          shares: Math.floor(Math.random() * 3000) + 500,
        })),
      },
    };
  }

  // Market event notifications
  static notifyMarketEvent(marketId: string, event: 'large_trade' | 'price_spike' | 'high_volume', data: any): void {
    if (!this.isConnected) return;

    let title = '';
    let message = '';

    switch (event) {
      case 'large_trade':
        title = 'Large Trade Alert';
        message = `${data.side} trade of ${data.shares} shares at ${(data.price * 100).toFixed(0)}¢`;
        break;
      case 'price_spike':
        title = 'Price Movement Alert';
        message = `${data.side} price moved ${data.changePercent > 0 ? '+' : ''}${data.changePercent.toFixed(1)}% to ${(data.newPrice * 100).toFixed(0)}¢`;
        break;
      case 'high_volume':
        title = 'High Volume Alert';
        message = `Trading volume increased by ${((data.volumeIncrease / data.previousVolume) * 100).toFixed(0)}%`;
        break;
    }

    NotificationService.addNotification({
      type: 'price_alert',
      title,
      message,
      marketId,
    });
  }

  // Data getters
  static getLatestPrice(marketId: string): PriceUpdate | null {
    return marketDataCache.get(marketId) || null;
  }

  static getAllLatestPrices(): Map<string, PriceUpdate> {
    return new Map(marketDataCache);
  }

  static getConnectionStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    lastUpdate?: Date;
  } {
    const latestUpdate = Array.from(marketDataCache.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      lastUpdate: latestUpdate?.timestamp,
    };
  }

  // Trading integration
  static async executeTrade(marketId: string, side: 'YES' | 'NO', action: 'BUY' | 'SELL', shares: number): Promise<void> {
    if (!this.isConnected) return;

    // Simulate immediate price impact
    const currentData = marketDataCache.get(marketId);
    if (currentData) {
      const priceImpact = (shares / 100000) * (action === 'BUY' ? 0.01 : -0.01);
      
      if (side === 'YES') {
        currentData.yesPrice = Math.max(0.01, Math.min(0.99, currentData.yesPrice + priceImpact));
        currentData.noPrice = 1 - currentData.yesPrice;
      } else {
        currentData.noPrice = Math.max(0.01, Math.min(0.99, currentData.noPrice + priceImpact));
        currentData.yesPrice = 1 - currentData.noPrice;
      }

      // Add volume
      currentData.volume += shares * currentData.yesPrice;
      currentData.timestamp = new Date();

      marketDataCache.set(marketId, currentData);

      // Notify about large trades
      if (shares > 1000) {
        this.notifyMarketEvent(marketId, 'large_trade', {
          side,
          action,
          shares,
          price: side === 'YES' ? currentData.yesPrice : currentData.noPrice,
        });
      }

      // Notify subscribers about price change
      marketUpdateSubscribers.forEach(callback => {
        try {
          callback([currentData]);
        } catch (error) {
          console.error('Error in market update callback:', error);
        }
      });
    }
  }

  // Initialize service
  static async initialize(): Promise<void> {
    console.log('🚀 Initializing RealtimeService...');
    
    // Auto-connect on initialization
    await this.connect();
    
    // Set up error handling and auto-reconnection
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.isConnected) {
          this.reconnect();
        }
      });

      window.addEventListener('offline', () => {
        this.disconnect();
        NotificationService.notifyGeneral(
          'Offline',
          'Real-time data temporarily unavailable'
        );
      });
    }

    console.log('✅ RealtimeService initialized');
  }

  // Cleanup
  static cleanup(): void {
    this.disconnect();
    marketUpdateSubscribers = [];
    volumeUpdateSubscribers = [];
    orderBookUpdateSubscribers = [];
    marketDataCache.clear();
  }
}

// Auto-initialize when service is imported
RealtimeService.initialize(); 