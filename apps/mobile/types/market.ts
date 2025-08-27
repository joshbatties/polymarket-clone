export interface Market {
  id: string;
  question: string;
  description: string;
  category: MarketCategory;
  volume: number;
  yesPrice: number;
  noPrice: number;
  endDate: Date;
  imageUrl?: string;
  tags: string[];
  totalShares: number;
  resolved: boolean;
  outcome?: 'YES' | 'NO';
  createdBy?: string;
  resolutionSource?: string;
  createdAt?: Date;
}

export interface Position {
  id: string;
  marketId: string;
  market: Market;
  side: 'YES' | 'NO';
  shares: number;
  avgPrice: number;
  totalCost: number;
  currentValue: number;
  pnl: number;
  pnlPercentage: number;
}

export interface Trade {
  id: string;
  marketId: string;
  market: Market;
  side: 'YES' | 'NO';
  action: 'BUY' | 'SELL';
  shares: number;
  price: number;
  totalCost: number;
  timestamp: Date;
}

export type MarketCategory = 
  | 'Politics'
  | 'Sports'
  | 'Crypto'
  | 'Business'
  | 'Science'
  | 'Entertainment'
  | 'Other';

export interface UserProfile {
  id: string;
  username: string;
  totalPortfolioValue: number;
  totalPnl: number;
  totalPnlPercentage: number;
  totalVolume: number;
  marketsTraded: number;
  winRate: number;
}

export interface OrderBookEntry {
  price: number;
  shares: number;
}

export interface OrderBook {
  yes: {
    buy: OrderBookEntry[];
    sell: OrderBookEntry[];
  };
  no: {
    buy: OrderBookEntry[];
    sell: OrderBookEntry[];
  };
}

export interface Notification {
  id: string;
  type: 'trade_executed' | 'price_alert' | 'market_resolved' | 'market_ending' | 'general';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  marketId?: string | null;
}

export interface PricePoint {
  timestamp: Date;
  yesPrice: number;
  noPrice: number;
  volume: number;
}

export interface OrderRequest {
  marketId: string;
  side: 'YES' | 'NO';
  action: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  shares?: number;
  amount?: number;
  limitPrice?: number;
}

export interface MarketFilter {
  category?: MarketCategory | 'All';
  sortBy: 'volume' | 'endDate' | 'trending' | 'newest';
  searchQuery?: string;
  onlyWatchlist?: boolean;
}

export interface CreateMarketRequest {
  question: string;
  description: string;
  category: MarketCategory;
  endDate: Date;
  tags: string[];
  imageUrl?: string;
  resolutionSource?: string;
} 