import { AuthService } from './authService';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001') + '/api/v1';

export interface MarketPrice {
  yes: number;
  no: number;
  yesPercent: number;
  noPercent: number;
  totalProbability: number;
}

export interface Market {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  imageUrl?: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'RESOLVED';
  outcomeType: 'BINARY';
  
  tradingLimits: {
    minTradeCents: number;
    maxTradeCents?: number;
    minTradeFormatted: string;
    maxTradeFormatted?: string;
  };

  metrics: {
    totalVolumeCents: number;
    totalVolumeFormatted: string;
    liquidityPoolCents: number;
    liquidityPoolFormatted: string;
  };

  prices?: MarketPrice;

  timeline: {
    createdAt: string;
    updatedAt: string;
    openAt?: string;
    closeAt: string;
    resolveAt?: string;
    resolvedAt?: string;
  };

  resolution?: {
    outcome: 'YES' | 'NO' | 'INVALID';
    notes?: string;
    sourceUrl?: string;
    resolvedAt: string;
  };

  creator?: {
    id: string;
    name: string;
  };

  recentTrades?: Array<{
    id: string;
    shares: string;
    costCents: number;
    costFormatted: string;
    timestamp: string;
  }>;

  totalTrades?: number;
  totalPositions?: number;
  activePositions?: number;
}

export interface MarketQuote {
  marketId: string;
  outcome: 'YES' | 'NO';
  shares: number;
  type: 'buy' | 'sell';
  pricing: {
    startPrice: number;
    endPrice: number;
    avgPrice: number;
    priceImpact: number;
  };
  cost: {
    costCents: number;
    costFormatted: string;
    maxCostCents: number;
    maxCostFormatted: string;
  };
  validation: {
    timestamp: string;
    ttl: number;
    expiresAt: string;
    signature: string;
  };
}

export interface MarketStats {
  volume: {
    totalCents: number;
    totalFormatted: string;
  };
  activity: {
    totalTrades: number;
    uniqueTraders: number;
  };
  liquidity: {
    depthYes: number;
    depthNo: number;
    spread: number;
  };
}

export interface MarketListOptions {
  status?: 'DRAFT' | 'OPEN' | 'CLOSED' | 'RESOLVED';
  category?: string;
  search?: string;
  cursor?: string;
  limit?: number;
  includeStats?: boolean;
}

export interface MarketListResponse {
  success: boolean;
  data: {
    markets: Market[];
    pagination: {
      hasMore: boolean;
      nextCursor: string | null;
      limit: number;
    };
  };
}

export interface MarketResponse {
  success: boolean;
  data: Market;
}

export interface QuoteResponse {
  success: boolean;
  data: {
    quote: MarketQuote;
  };
}

export interface StatsResponse {
  success: boolean;
  data: MarketStats;
}

class MarketsServiceClass {
  private accessToken: string | null = null;

  constructor() {
    // Subscribe to auth changes
    this.initializeFromAuth();
  }

  private async initializeFromAuth() {
    try {
      // AuthService doesn't expose getAuthState or getAccessToken methods
      // This would be handled by the components using the auth store
      console.log('Markets service initialized');
    } catch (error) {
      console.warn('Failed to initialize markets service from auth:', error);
    }
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private async makeRequest(url: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * List markets with filtering and pagination
   */
  async listMarkets(options: MarketListOptions = {}): Promise<MarketListResponse> {
    try {
      const params = new URLSearchParams();
      
      if (options.status) params.append('status', options.status);
      if (options.category) params.append('category', options.category);
      if (options.search) params.append('search', options.search);
      if (options.cursor) params.append('cursor', options.cursor);
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.includeStats) params.append('includeStats', 'true');

      const queryString = params.toString();
      const url = `/markets${queryString ? `?${queryString}` : ''}`;

      return await this.makeRequest(url);
    } catch (error: any) {
      console.error('Failed to list markets:', error);
      throw new Error(error.message || 'Failed to load markets');
    }
  }

  /**
   * Get market by ID
   */
  async getMarket(id: string): Promise<MarketResponse> {
    try {
      return await this.makeRequest(`/markets/${id}`);
    } catch (error: any) {
      console.error(`Failed to get market ${id}:`, error);
      throw new Error(error.message || 'Failed to load market');
    }
  }

  /**
   * Generate quote for trading
   */
  async generateQuote(
    marketId: string,
    outcome: 'YES' | 'NO',
    shares: number,
    type: 'buy' | 'sell' = 'buy'
  ): Promise<QuoteResponse> {
    try {
      return await this.makeRequest(`/markets/${marketId}/quote`, {
        method: 'POST',
        body: JSON.stringify({
          outcome,
          shares,
          type,
        }),
      });
    } catch (error: any) {
      console.error(`Failed to generate quote for market ${marketId}:`, error);
      throw new Error(error.message || 'Failed to generate quote');
    }
  }

  /**
   * Get market statistics
   */
  async getMarketStats(marketId: string): Promise<StatsResponse> {
    try {
      return await this.makeRequest(`/markets/${marketId}/stats`);
    } catch (error: any) {
      console.error(`Failed to get stats for market ${marketId}:`, error);
      throw new Error(error.message || 'Failed to load market statistics');
    }
  }

  /**
   * Get markets by category
   */
  async getMarketsByCategory(category: string, limit: number = 10): Promise<Market[]> {
    try {
      const response = await this.listMarkets({
        category,
        status: 'OPEN',
        limit,
        includeStats: true,
      });
      return response.data.markets;
    } catch (error: any) {
      console.error(`Failed to get markets by category ${category}:`, error);
      throw new Error(error.message || 'Failed to load category markets');
    }
  }

  /**
   * Search markets
   */
  async searchMarkets(query: string, limit: number = 20): Promise<Market[]> {
    try {
      const response = await this.listMarkets({
        search: query,
        status: 'OPEN',
        limit,
      });
      return response.data.markets;
    } catch (error: any) {
      console.error(`Failed to search markets with query "${query}":`, error);
      throw new Error(error.message || 'Failed to search markets');
    }
  }

  /**
   * Get trending markets (most active)
   */
  async getTrendingMarkets(limit: number = 10): Promise<Market[]> {
    try {
      const response = await this.listMarkets({
        status: 'OPEN',
        limit,
        includeStats: true,
      });
      
      // Sort by volume (trending markets have higher volume)
      const sortedMarkets = response.data.markets.sort((a, b) => 
        b.metrics.totalVolumeCents - a.metrics.totalVolumeCents
      );
      
      return sortedMarkets;
    } catch (error: any) {
      console.error('Failed to get trending markets:', error);
      throw new Error(error.message || 'Failed to load trending markets');
    }
  }

  /**
   * Get recently created markets
   */
  async getRecentMarkets(limit: number = 10): Promise<Market[]> {
    try {
      const response = await this.listMarkets({
        status: 'OPEN',
        limit,
      });
      
      // Markets are already sorted by creation date (most recent first)
      return response.data.markets;
    } catch (error: any) {
      console.error('Failed to get recent markets:', error);
      throw new Error(error.message || 'Failed to load recent markets');
    }
  }

  /**
   * Format currency for display
   */
  formatCurrency(cents: number): string {
    const dollars = Math.abs(cents) / 100;
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${dollars.toFixed(2)}`;
  }

  /**
   * Format percentage for display
   */
  formatPercentage(decimal: number): string {
    return `${Math.round(decimal * 100)}%`;
  }

  /**
   * Calculate profit/loss for a position
   */
  calculatePnL(
    shares: number,
    avgCost: number,
    currentPrice: number,
    outcome: 'YES' | 'NO'
  ): {
    unrealizedPnL: number;
    unrealizedPnLFormatted: string;
    percentageChange: number;
    percentageChangeFormatted: string;
  } {
    const currentValue = shares * currentPrice;
    const totalCost = shares * avgCost;
    const unrealizedPnL = currentValue - totalCost;
    const percentageChange = totalCost > 0 ? (unrealizedPnL / totalCost) * 100 : 0;

    return {
      unrealizedPnL: unrealizedPnL * 100, // Convert to cents
      unrealizedPnLFormatted: this.formatCurrency(unrealizedPnL * 100),
      percentageChange,
      percentageChangeFormatted: `${percentageChange >= 0 ? '+' : ''}${percentageChange.toFixed(2)}%`,
    };
  }

  /**
   * Get time until market closes
   */
  getTimeUntilClose(closeAt: string): {
    timeRemaining: number; // milliseconds
    formatted: string;
    isClosingSoon: boolean; // Less than 24 hours
    isClosed: boolean;
  } {
    const now = new Date().getTime();
    const closeTime = new Date(closeAt).getTime();
    const timeRemaining = closeTime - now;
    const isClosed = timeRemaining <= 0;
    const isClosingSoon = timeRemaining > 0 && timeRemaining < 24 * 60 * 60 * 1000;

    let formatted = '';
    if (isClosed) {
      formatted = 'Closed';
    } else if (timeRemaining < 60 * 60 * 1000) { // Less than 1 hour
      const minutes = Math.floor(timeRemaining / (60 * 1000));
      formatted = `${minutes}m`;
    } else if (timeRemaining < 24 * 60 * 60 * 1000) { // Less than 24 hours
      const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
      formatted = `${hours}h`;
    } else {
      const days = Math.floor(timeRemaining / (24 * 60 * 60 * 1000));
      formatted = `${days}d`;
    }

    return {
      timeRemaining,
      formatted,
      isClosingSoon,
      isClosed,
    };
  }

  /**
   * Get market categories
   */
  getMarketCategories(): string[] {
    return [
      'Politics',
      'Technology',
      'Sports',
      'Entertainment',
      'Economics',
      'Science',
      'Crypto',
      'Climate',
      'Business',
      'Other',
    ];
  }

  /**
   * Validate quote before use
   */
  isQuoteValid(quote: MarketQuote): boolean {
    const now = new Date().getTime();
    const quoteTime = new Date(quote.validation.timestamp).getTime();
    const age = (now - quoteTime) / 1000; // seconds

    return age <= quote.validation.ttl;
  }

  /**
   * Get quote expiry info
   */
  getQuoteExpiry(quote: MarketQuote): {
    isExpired: boolean;
    expiresIn: number; // seconds
    expiresInFormatted: string;
  } {
    const now = new Date().getTime();
    const expiresAt = new Date(quote.validation.expiresAt).getTime();
    const expiresIn = Math.max(0, (expiresAt - now) / 1000);
    const isExpired = expiresIn <= 0;

    const expiresInFormatted = isExpired 
      ? 'Expired'
      : `${Math.ceil(expiresIn)}s`;

    return {
      isExpired,
      expiresIn,
      expiresInFormatted,
    };
  }
}

export const MarketsService = new MarketsServiceClass();
