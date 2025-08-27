import { AuthService } from './authService';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001') + '/api/v1';

export interface Trade {
  id: string;
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  shares: string;
  fillPrice: number;
  cost: {
    costCents: number;
    costFormatted: string;
    feeCents: number;
    feeFormatted: string;
    totalCostCents: number;
    totalCostFormatted: string;
  };
  timestamp: string;
}

export interface Position {
  yesShares: number;
  noShares: number;
  totalShares: number;
  avgCostCents: number;
  avgCostFormatted: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecuteTradeRequest {
  outcome: 'YES' | 'NO';
  shares?: number;
  maxSpendCents?: number;
  quoteSignature?: string;
  idempotencyKey: string;
}

export interface TradeResult {
  trade: Trade;
  position: Position;
  balance: {
    cashCents: number;
    cashFormatted: string;
  };
  market: {
    newPrices: {
      yes: number;
      no: number;
      yesPercent: number;
      noPercent: number;
    };
    newVolumeCents: number;
    newVolumeFormatted: string;
  };
}

class TradingServiceClass {
  private accessToken: string | null = null;

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

  async executeTrade(marketId: string, tradeRequest: ExecuteTradeRequest): Promise<TradeResult> {
    try {
      const response = await this.makeRequest(`/markets/${marketId}/trades`, {
        method: 'POST',
        body: JSON.stringify(tradeRequest),
      });

      return response.data;
    } catch (error: any) {
      console.error(`Failed to execute trade for market ${marketId}:`, error);
      throw new Error(error.message || 'Failed to execute trade');
    }
  }

  generateIdempotencyKey(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  formatCurrency(cents: number): string {
    const dollars = Math.abs(cents) / 100;
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${dollars.toFixed(2)}`;
  }
}

export const TradingService = new TradingServiceClass();