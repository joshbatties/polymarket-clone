import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { MarketsService, MarketQuote } from '../../services/marketsService';
import { TradingService, ExecuteTradeRequest } from '../../services/tradingService';
import { useAuthStore } from '../../contexts/authStore';

export default function TradeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  
  // Trading state
  const [selectedOutcome, setSelectedOutcome] = useState<'YES' | 'NO'>('YES');
  const [tradeAmount, setTradeAmount] = useState('10.00');
  const [useShares, setUseShares] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<MarketQuote | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [slippageWarning, setSlippageWarning] = useState(false);

  // Fetch market details
  const { 
    data: marketData, 
    isLoading: marketLoading, 
    error: marketError 
  } = useQuery({
    queryKey: ['market', id],
    queryFn: () => MarketsService.getMarket(id!),
    enabled: !!id,
    staleTime: 30000,
  });

  // Quote generation mutation
  const quoteMutation = useMutation({
    mutationFn: async (params: { outcome: 'YES' | 'NO'; shares: number }) => {
      return MarketsService.generateQuote(id!, params.outcome, params.shares, 'buy');
    },
    onSuccess: (data) => {
      setCurrentQuote(data.data.quote);
      
      // Check for high slippage
      const priceImpact = Math.abs(data.data.quote.priceImpact);
      setSlippageWarning(priceImpact > 0.05); // 5% slippage warning
    },
    onError: (error) => {
      Alert.alert('Quote Error', error.message);
    },
  });

  // Trade execution mutation
  const tradeMutation = useMutation({
    mutationFn: async (tradeRequest: ExecuteTradeRequest) => {
      return TradingService.executeTrade(id!, tradeRequest);
    },
    onSuccess: (result) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['market', id] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });

      Alert.alert(
        'Trade Successful!',
        `You bought ${result.trade.shares} ${result.trade.outcome} shares for ${result.trade.cost.totalCostFormatted}`,
        [
          {
            text: 'View Position',
            onPress: () => router.push('/portfolio'),
          },
          {
            text: 'OK',
            style: 'default',
          },
        ]
      );

      setShowConfirmation(false);
      setCurrentQuote(null);
    },
    onError: (error) => {
      Alert.alert('Trade Failed', error.message);
      setShowConfirmation(false);
    },
  });

  const market = marketData?.data;

  const handleGenerateQuote = () => {
    if (!isAuthenticated) {
      Alert.alert(
        'Authentication Required',
        'Please log in to trade.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log In', onPress: () => router.push('/auth') }
        ]
      );
      return;
    }

    const numericAmount = parseFloat(tradeAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    let shares;
    if (useShares) {
      shares = numericAmount;
    } else {
      const currentPrice = selectedOutcome === 'YES' 
        ? market?.prices?.yes || 0.5 
        : market?.prices?.no || 0.5;
      shares = numericAmount / currentPrice;
    }

    quoteMutation.mutate({ outcome: selectedOutcome, shares });
  };

  const handleConfirmTrade = async () => {
    if (!currentQuote) {
      Alert.alert('Error', 'No active quote available');
      return;
    }

    const isValid = MarketsService.isQuoteValid(currentQuote);
    if (!isValid) {
      Alert.alert('Quote Expired', 'Please generate a new quote');
      setCurrentQuote(null);
      return;
    }

    const tradeRequest: ExecuteTradeRequest = {
      outcome: selectedOutcome,
      shares: currentQuote.shares,
      quoteSignature: currentQuote.validation.signature,
      idempotencyKey: TradingService.generateIdempotencyKey(),
    };

    tradeMutation.mutate(tradeRequest);
  };

  const renderOutcomeSelection = () => (
    <View style={styles.outcomeSelection}>
      <TouchableOpacity
        style={[
          styles.outcomeButton,
          styles.yesButton,
          selectedOutcome === 'YES' && styles.outcomeButtonActive,
        ]}
        onPress={() => setSelectedOutcome('YES')}
      >
        <Text style={[
          styles.outcomeButtonText,
          selectedOutcome === 'YES' && styles.outcomeButtonTextActive,
        ]}>
          YES
        </Text>
        <Text style={[
          styles.outcomePrice,
          selectedOutcome === 'YES' && styles.outcomePriceActive,
        ]}>
          {market?.prices ? `${market.prices.yesPercent}%` : '50%'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.outcomeButton,
          styles.noButton,
          selectedOutcome === 'NO' && styles.outcomeButtonActive,
        ]}
        onPress={() => setSelectedOutcome('NO')}
      >
        <Text style={[
          styles.outcomeButtonText,
          selectedOutcome === 'NO' && styles.outcomeButtonTextActive,
        ]}>
          NO
        </Text>
        <Text style={[
          styles.outcomePrice,
          selectedOutcome === 'NO' && styles.outcomePriceActive,
        ]}>
          {market?.prices ? `${market.prices.noPercent}%` : '50%'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderAmountInput = () => (
    <View style={styles.amountSection}>
      <View style={styles.toggleContainer}>
        <Text style={styles.toggleLabel}>Amount ($)</Text>
        <Switch
          value={useShares}
          onValueChange={setUseShares}
          trackColor={{ false: '#767577', true: '#007AFF' }}
          thumbColor={useShares ? '#fff' : '#f4f3f4'}
        />
        <Text style={styles.toggleLabel}>Shares</Text>
      </View>

      <View style={styles.amountInputContainer}>
        {!useShares && <Text style={styles.currencySymbol}>$</Text>}
        <TextInput
          style={styles.amountInput}
          value={tradeAmount}
          onChangeText={setTradeAmount}
          placeholder={useShares ? '0' : '0.00'}
          keyboardType="decimal-pad"
          selectTextOnFocus
        />
      </View>
    </View>
  );

  const renderQuotePreview = () => {
    if (!currentQuote) return null;

    const expiryInfo = MarketsService.getQuoteExpiry(currentQuote);
    const isExpiring = expiryInfo.expiresIn <= 3;

    return (
      <View style={[styles.quoteCard, isExpiring && styles.quoteCardExpiring]}>
        <View style={styles.quoteHeader}>
          <Text style={styles.quoteTitle}>Quote Preview</Text>
          <View style={styles.quoteTimer}>
            <Ionicons 
              name="time-outline" 
              size={14} 
              color={isExpiring ? '#dc3545' : '#666'} 
            />
            <Text style={[styles.quoteTimerText, isExpiring && styles.quoteTimerExpiring]}>
              {expiryInfo.expiresInFormatted}
            </Text>
          </View>
        </View>

        {slippageWarning && (
          <View style={styles.slippageWarning}>
            <Ionicons name="warning" size={16} color="#ff9800" />
            <Text style={styles.slippageWarningText}>
              High price impact: {(currentQuote.priceImpact * 100).toFixed(2)}%
            </Text>
          </View>
        )}

        <View style={styles.quoteDetails}>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Shares:</Text>
            <Text style={styles.quoteValue}>{currentQuote.shares.toFixed(2)}</Text>
          </View>

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Avg Price:</Text>
            <Text style={styles.quoteValue}>${currentQuote.pricing.avgPrice.toFixed(3)}</Text>
          </View>

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Price Impact:</Text>
            <Text style={[
              styles.quoteValue,
              { color: Math.abs(currentQuote.pricing.priceImpact) > 0.05 ? '#dc3545' : '#28a745' }
            ]}>
              {(currentQuote.pricing.priceImpact * 100).toFixed(2)}%
            </Text>
          </View>

          <View style={[styles.quoteRow, styles.totalCostRow]}>
            <Text style={styles.totalCostLabel}>Total Cost:</Text>
            <Text style={styles.totalCostValue}>
              {currentQuote.cost.costFormatted}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderConfirmationModal = () => {
    if (!showConfirmation || !currentQuote) return null;

    return (
      <View style={styles.confirmationOverlay}>
        <View style={styles.confirmationModal}>
          <Text style={styles.confirmationTitle}>Confirm Trade</Text>
          
          <View style={styles.confirmationDetails}>
            <Text style={styles.confirmationText}>
              Buy {currentQuote.shares.toFixed(2)} {selectedOutcome} shares
            </Text>
            <Text style={styles.confirmationCost}>
              Total: {currentQuote.cost.costFormatted}
            </Text>
          </View>

          <View style={styles.confirmationButtons}>
            <TouchableOpacity
              style={[styles.confirmationButton, styles.cancelButton]}
              onPress={() => setShowConfirmation(false)}
              disabled={tradeMutation.isPending}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.confirmationButton, styles.confirmButton]}
              onPress={handleConfirmTrade}
              disabled={tradeMutation.isPending}
            >
              {tradeMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (marketLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading market...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (marketError || !market) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={64} color="#dc3545" />
          <Text style={styles.errorTitle}>Failed to load market</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.marketInfo}>
          <Text style={styles.marketTitle} numberOfLines={2}>
            {market.title}
          </Text>
          
          {market.prices && (
            <View style={styles.currentPrices}>
              <View style={styles.priceItem}>
                <Text style={styles.priceLabel}>YES</Text>
                <Text style={[styles.priceValue, { color: '#28a745' }]}>
                  {market.prices.yesPercent}%
                </Text>
              </View>
              <View style={styles.priceItem}>
                <Text style={styles.priceLabel}>NO</Text>
                <Text style={[styles.priceValue, { color: '#dc3545' }]}>
                  {market.prices.noPercent}%
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.tradingPanel}>
          <Text style={styles.sectionTitle}>Place Trade</Text>
          
          {renderOutcomeSelection()}
          {renderAmountInput()}

          <TouchableOpacity
            style={[styles.quoteButton, quoteMutation.isPending && styles.quoteButtonLoading]}
            onPress={handleGenerateQuote}
            disabled={quoteMutation.isPending}
          >
            {quoteMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.quoteButtonText}>Get Quote</Text>
            )}
          </TouchableOpacity>

          {renderQuotePreview()}

          {currentQuote && (
            <TouchableOpacity
              style={[styles.tradeButton, MarketsService.getQuoteExpiry(currentQuote).isExpired && styles.tradeButtonDisabled]}
              onPress={() => setShowConfirmation(true)}
              disabled={MarketsService.getQuoteExpiry(currentQuote).isExpired}
            >
              <Text style={styles.tradeButtonText}>
                {MarketsService.getQuoteExpiry(currentQuote).isExpired ? 'Quote Expired' : `Buy ${selectedOutcome} Shares`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {renderConfirmationModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#dc3545',
    marginTop: 16,
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  marketInfo: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 16,
  },
  marketTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
    lineHeight: 24,
  },
  currentPrices: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  priceItem: {
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6c757d',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  tradingPanel: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  outcomeSelection: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  outcomeButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginRight: 8,
    alignItems: 'center',
  },
  yesButton: {
    backgroundColor: '#f8fff9',
    borderColor: '#28a745',
  },
  noButton: {
    backgroundColor: '#fff8f8',
    borderColor: '#dc3545',
  },
  outcomeButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  outcomeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  outcomeButtonTextActive: {
    color: 'white',
  },
  outcomePrice: {
    fontSize: 14,
    fontWeight: '600',
  },
  outcomePriceActive: {
    color: 'white',
  },
  amountSection: {
    marginBottom: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6c757d',
    marginHorizontal: 12,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6c757d',
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    paddingVertical: 12,
  },
  quoteButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  quoteButtonLoading: {
    backgroundColor: '#6c757d',
  },
  quoteButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  quoteCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
    marginBottom: 20,
  },
  quoteCardExpiring: {
    borderColor: '#dc3545',
    backgroundColor: '#fff5f5',
  },
  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quoteTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  quoteTimer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quoteTimerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginLeft: 4,
  },
  quoteTimerExpiring: {
    color: '#dc3545',
  },
  slippageWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  slippageWarningText: {
    fontSize: 12,
    color: '#856404',
    marginLeft: 6,
    fontWeight: '600',
  },
  quoteDetails: {
    marginBottom: 16,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quoteLabel: {
    fontSize: 14,
    color: '#6c757d',
  },
  quoteValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  totalCostRow: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  totalCostLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  totalCostValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  tradeButton: {
    backgroundColor: '#28a745',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  tradeButtonDisabled: {
    backgroundColor: '#6c757d',
  },
  tradeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  confirmationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmationModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    marginHorizontal: 20,
    width: '90%',
  },
  confirmationTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
  },
  confirmationDetails: {
    alignItems: 'center',
    marginBottom: 24,
  },
  confirmationText: {
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 8,
  },
  confirmationCost: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  confirmationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  confirmationButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6c757d',
  },
  confirmButton: {
    backgroundColor: '#28a745',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
});
