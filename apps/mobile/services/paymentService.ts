import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { Alert } from 'react-native';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001') + '/api/v1';

export interface DepositIntentResponse {
  success: boolean;
  data: {
    clientSecret: string;
    paymentIntentId: string;
    amountCents: number;
    currency: string;
    publishableKey: string;
  };
}

export interface WalletBalance {
  success: boolean;
  data: {
    availableCents: string;
    pendingCents: string;
    totalCents: string;
    currency: string;
    availableFormatted: string;
    totalFormatted: string;
  };
}

export interface DepositLimits {
  success: boolean;
  data: {
    dailyLimitCents: number;
    dailyUsedCents: number;
    dailyRemainingCents: number;
    velocityLimitCents: number;
    velocityUsedCents: number;
    velocityRemainingCents: number;
    isAtLimit: boolean;
  };
}

export interface TransactionHistory {
  success: boolean;
  data: {
    entries: Array<{
      id: string;
      transactionId: string;
      amountCents: string;
      amountFormatted: string;
      entryType: string;
      description: string;
      timestamp: string;
      metadata: any;
    }>;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface ApplePayResult {
  success: boolean;
  paymentIntentId?: string;
  error?: string;
}

class PaymentServiceClass {
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  private async makeAuthenticatedRequest(url: string, options: RequestInit = {}) {
    if (!this.accessToken) {
      throw new Error('Not authenticated - access token required');
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a deposit intent for Apple Pay
   */
  async createDepositIntent(
    amountCents: number,
    currency: string = 'AUD',
    description?: string
  ): Promise<DepositIntentResponse> {
    try {
      const response = await this.makeAuthenticatedRequest('/payments/deposit-intent', {
        method: 'POST',
        body: JSON.stringify({
          amountCents,
          currency,
          description,
        }),
      });

      return response;
    } catch (error: any) {
      console.error('Failed to create deposit intent:', error);
      throw new Error(error.message || 'Failed to create payment');
    }
  }

  /**
   * Get user's wallet balance
   */
  async getWalletBalance(currency: string = 'AUD'): Promise<WalletBalance> {
    try {
      const response = await this.makeAuthenticatedRequest(
        `/payments/wallet/balance?currency=${currency}`
      );

      return response;
    } catch (error: any) {
      console.error('Failed to get wallet balance:', error);
      throw new Error(error.message || 'Failed to get balance');
    }
  }

  /**
   * Get user's deposit limits
   */
  async getDepositLimits(): Promise<DepositLimits> {
    try {
      const response = await this.makeAuthenticatedRequest('/payments/deposit-limits');

      return response;
    } catch (error: any) {
      console.error('Failed to get deposit limits:', error);
      throw new Error(error.message || 'Failed to get deposit limits');
    }
  }

  /**
   * Get user's transaction history
   */
  async getTransactionHistory(options: {
    cursor?: string;
    limit?: number;
    fromDate?: string;
    toDate?: string;
  } = {}): Promise<TransactionHistory> {
    try {
      const params = new URLSearchParams();
      if (options.cursor) params.append('cursor', options.cursor);
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.fromDate) params.append('fromDate', options.fromDate);
      if (options.toDate) params.append('toDate', options.toDate);

      const queryString = params.toString();
      const url = `/payments/wallet/transactions${queryString ? `?${queryString}` : ''}`;

      const response = await this.makeAuthenticatedRequest(url);

      return response;
    } catch (error: any) {
      console.error('Failed to get transaction history:', error);
      throw new Error(error.message || 'Failed to get transaction history');
    }
  }

  /**
   * Process Apple Pay payment
   */
  async processApplePayPayment(
    amountCents: number,
    currency: string = 'AUD',
    merchantIdentifier: string,
    countryCode: string = 'AU'
  ): Promise<ApplePayResult> {
    try {
      // Step 1: Create deposit intent
      console.log('Creating deposit intent for Apple Pay...');
      const depositIntent = await this.createDepositIntent(amountCents, currency);

      if (!depositIntent.success) {
        throw new Error('Failed to create deposit intent');
      }

      const { clientSecret, paymentIntentId } = depositIntent.data;

      // Step 2: This would be handled by the Apple Pay sheet in the component
      // We return the payment intent data for the UI to handle
      return {
        success: true,
        paymentIntentId,
      };
    } catch (error: any) {
      console.error('Apple Pay payment failed:', error);
      return {
        success: false,
        error: error.message || 'Payment failed',
      };
    }
  }

  /**
   * Format amount for display
   */
  formatAmount(amountCents: number | string, currency: string = 'AUD'): string {
    const amount = typeof amountCents === 'string' ? parseInt(amountCents, 10) : amountCents;
    const dollars = amount / 100;
    
    if (currency === 'AUD') {
      return `$${dollars.toFixed(2)} AUD`;
    }
    
    return `${dollars.toFixed(2)} ${currency}`;
  }

  /**
   * Validate deposit amount
   */
  validateDepositAmount(amountCents: number): { isValid: boolean; error?: string } {
    if (amountCents < 100) {
      return { isValid: false, error: 'Minimum deposit is $1.00 AUD' };
    }

    if (amountCents > 100000000) {
      return { isValid: false, error: 'Maximum deposit is $1,000,000.00 AUD' };
    }

    return { isValid: true };
  }

  /**
   * Check if Apple Pay is available
   */
  async isApplePayAvailable(): Promise<boolean> {
    try {
      // This would be handled by the useApplePay hook in the component
      // For now, we'll assume it's available on iOS
      return true;
    } catch (error) {
      console.error('Failed to check Apple Pay availability:', error);
      return false;
    }
  }

  /**
   * Get payment status (for debugging)
   */
  async getPaymentStatus(paymentIntentId: string): Promise<any> {
    try {
      // This would require an additional API endpoint
      // For now, we'll return a placeholder
      return {
        paymentIntentId,
        status: 'unknown',
        message: 'Payment status checking not implemented yet',
      };
    } catch (error: any) {
      console.error('Failed to get payment status:', error);
      throw new Error(error.message || 'Failed to get payment status');
    }
  }
}

export const PaymentService = new PaymentServiceClass();

// Helper hook for Stripe initialization
export const useStripeConfig = () => {
  // This will be set from environment or API call
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const merchantIdentifier = process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID || 'merchant.com.aussiemarkets';

  return {
    publishableKey,
    merchantIdentifier,
    countryCode: 'AU',
    currency: 'AUD',
  };
};

// Helper function for error handling
export const handlePaymentError = (error: any) => {
  console.error('Payment error:', error);
  
  let userMessage = 'Payment failed. Please try again.';
  
  if (error.message) {
    if (error.message.includes('limit')) {
      userMessage = 'Deposit limit exceeded. Please try a smaller amount.';
    } else if (error.message.includes('declined')) {
      userMessage = 'Payment was declined. Please check your payment method.';
    } else if (error.message.includes('network') || error.message.includes('timeout')) {
      userMessage = 'Network error. Please check your connection and try again.';
    } else if (error.message.includes('verify')) {
      userMessage = 'Please verify your email before making deposits.';
    }
  }

  Alert.alert('Payment Error', userMessage);
};
