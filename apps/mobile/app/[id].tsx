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
import { MarketsService, Market, MarketQuote } from '../services/marketsService';
import { useAuthStore } from '../contexts/authStore';

export default function MarketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  
  // Trading state
  const [selectedOutcome, setSelectedOutcome] = useState<'YES' | 'NO'>('YES');
  const [tradeAmount, setTradeAmount] = useState('10.00');
  const [useShares, setUseShares] = useState(false); // Toggle between $ amount and shares
  const [currentQuote, setCurrentQuote] = useState<MarketQuote | null>(null);
  const [quoteTimer, setQuoteTimer] = useState<NodeJS.Timeout | null>(null);

  // Fetch market details
  const { 
    data: marketData, 
    isLoading: marketLoading, 
    error: marketError,
    refetch: refetchMarket 
  } = useQuery({
    queryKey: ['market', id],
    queryFn: () => MarketsService.getMarket(id!),
    enabled: !!id,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  // Fetch market stats
  const { data: statsData } = useQuery({
    queryKey: ['market-stats', id],
    queryFn: () => MarketsService.getMarketStats(id!),
    enabled: !!id,
    staleTime: 60000,
  });

  // Quote generation mutation
  const quoteMutation = useMutation({
    mutationFn: async (params: { outcome: 'YES' | 'NO'; shares: number }) => {
      return MarketsService.generateQuote(id!, params.outcome, params.shares, 'buy');
    },
    onSuccess: (data) => {
      setCurrentQuote(data.data.quote);
      
      // Set up quote expiry timer
      if (quoteTimer) {
        clearTimeout(quoteTimer);
      }
      
      const expiryInfo = MarketsService.getQuoteExpiry(data.data.quote);
      const timer = setTimeout(() => {
        setCurrentQuote(null);
      }, expiryInfo.expiresIn * 1000);
      
      setQuoteTimer(timer);
    },
    onError: (error) => {
      Alert.alert('Quote Error', error.message);
    },
  });

  useEffect(() => {
    return () => {
      if (quoteTimer) {
        clearTimeout(quoteTimer);
      }
    };
  }, [quoteTimer]);

  const market = marketData?.data;

  const handleGenerateQuote = () => {
    if (!isAuthenticated) {
      Alert.alert(
        'Authentication Required',
        'Please log in to generate trading quotes.',
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

    // Convert to shares if using dollar amount
    let shares;
    if (useShares) {
      shares = numericAmount;
    } else {
      // Approximate shares based on current price
      const currentPrice = selectedOutcome === 'YES' 
        ? market?.prices?.yes || 0.5 
        : market?.prices?.no || 0.5;
      shares = numericAmount / currentPrice;
    }

    if (market && market.tradingLimits) {
      const sharesValueCents = shares * 100; // Approximate value in cents
      
      if (sharesValueCents < market.tradingLimits.minTradeCents) {
        Alert.alert(
          'Minimum Trade',
          `Minimum trade is ${market.tradingLimits.minTradeFormatted}`
        );
        return;
      }

      if (market.tradingLimits.maxTradeCents && sharesValueCents > market.tradingLimits.maxTradeCents) {
        Alert.alert(
          'Maximum Trade',
          `Maximum trade is ${market.tradingLimits.maxTradeFormatted}`
        );
        return;
      }
    }

    quoteMutation.mutate({ outcome: selectedOutcome, shares });
  };

  const renderQuoteCard = () => {
    if (!currentQuote) return null;

    const expiryInfo = MarketsService.getQuoteExpiry(currentQuote);
    const isExpiring = expiryInfo.expiresIn <= 3; // Warn when 3 seconds left

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

        <View style={styles.quoteDetails}>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Outcome:</Text>
            <Text style={[styles.quoteValue, { color: selectedOutcome === 'YES' ? '#28a745' : '#dc3545' }]}>
              {selectedOutcome} ({currentQuote.shares.toFixed(2)} shares)
            </Text>
          </View>

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Price Range:</Text>
            <Text style={styles.quoteValue}>
              ${currentQuote.pricing.startPrice.toFixed(3)} → ${currentQuote.pricing.endPrice.toFixed(3)}
            </Text>
          </View>

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Average Price:</Text>
            <Text style={styles.quoteValue}>
              ${currentQuote.pricing.avgPrice.toFixed(3)}
            </Text>
          </View>

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Price Impact:</Text>
            <Text style={[
              styles.quoteValue,
              { color: Math.abs(currentQuote.pricing.priceImpact) > 0.05 ? '#dc3545' : '#28a745' }
            ]}>
              {currentQuote.pricing.priceImpact >= 0 ? '+' : ''}{(currentQuote.pricing.priceImpact * 100).toFixed(2)}%
            </Text>
          </View>

          <View style={[styles.quoteRow, styles.totalCostRow]}>
            <Text style={styles.totalCostLabel}>Total Cost:</Text>
            <Text style={styles.totalCostValue}>
              {currentQuote.cost.costFormatted}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.executeButton, expiryInfo.isExpired && styles.executeButtonDisabled]}
          disabled={expiryInfo.isExpired}
          onPress={() => Alert.alert('Trade Execution', 'Trade execution will be implemented in the next epoch')}
        >
          <Text style={styles.executeButtonText}>
            {expiryInfo.isExpired ? 'Quote Expired' : `Buy ${selectedOutcome} Shares`}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTradingPanel = () => (
    <View style={styles.tradingPanel}>
      <Text style={styles.tradingTitle}>Place Trade</Text>

      {/* Outcome Selection */}
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

      {/* Amount/Shares Toggle */}
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

      {/* Amount Input */}
      <View style={styles.amountContainer}>
        <Text style={styles.amountLabel}>
          {useShares ? 'Number of Shares' : 'Amount to Invest'}
        </Text>
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
        
        {market?.tradingLimits && (
          <Text style={styles.tradingLimits}>
            Min: {market.tradingLimits.minTradeFormatted}
            {market.tradingLimits.maxTradeFormatted && 
              ` • Max: ${market.tradingLimits.maxTradeFormatted}`
            }
          </Text>
        )}
      </View>

      {/* Generate Quote Button */}
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

      {renderQuoteCard()}
    </View>
  );

  const renderMarketInfo = () => (
    <View style={styles.marketInfo}>
      <Text style={styles.marketTitle}>{market?.title}</Text>
      <Text style={styles.marketDescription}>{market?.description}</Text>

      {market?.prices && (
        <View style={styles.pricesContainer}>
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>YES</Text>
            <Text style={[styles.priceValue, { color: '#28a745' }]}>
              {market.prices.yesPercent}%
            </Text>
            <Text style={styles.priceSubtext}>
              ${market.prices.yes.toFixed(3)}
            </Text>
          </View>
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>NO</Text>
            <Text style={[styles.priceValue, { color: '#dc3545' }]}>
              {market.prices.noPercent}%
            </Text>
            <Text style={styles.priceSubtext}>
              ${market.prices.no.toFixed(3)}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.marketMetrics}>
        <View style={styles.metricItem}>
          <Ionicons name="trending-up" size={16} color="#666" />
          <Text style={styles.metricLabel}>Volume</Text>
          <Text style={styles.metricValue}>{market?.metrics.totalVolumeFormatted}</Text>
        </View>
        <View style={styles.metricItem}>
          <Ionicons name="people" size={16} color="#666" />
          <Text style={styles.metricLabel}>Liquidity</Text>
          <Text style={styles.metricValue}>{market?.metrics.liquidityPoolFormatted}</Text>
        </View>
        <View style={styles.metricItem}>
          <Ionicons name="time" size={16} color="#666" />
          <Text style={styles.metricLabel}>Closes</Text>
          <Text style={styles.metricValue}>
            {market ? MarketsService.getTimeUntilClose(market.timeline.closeAt).formatted : 'Unknown'}
          </Text>
        </View>
      </View>

      {statsData?.data && (
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Market Statistics</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statsData.data.activity.totalTrades}</Text>
              <Text style={styles.statLabel}>Total Trades</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statsData.data.activity.uniqueTraders}</Text>
              <Text style={styles.statLabel}>Unique Traders</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{(statsData.data.liquidity.spread * 100).toFixed(1)}%</Text>
              <Text style={styles.statLabel}>Bid-Ask Spread</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );

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
          <Text style={styles.errorSubtitle}>
            {marketError?.message || 'Market not found'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetchMarket()}>
            <Text style={styles.retryButtonText}>Retry</Text>
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
        <Text style={styles.headerTitle}>Market Details</Text>
        <TouchableOpacity style={styles.shareButton}>
          <Ionicons name="share-outline" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderMarketInfo()}
        {market.status === 'OPEN' && (
          <View style={styles.tradingSection}>
            <TouchableOpacity
              style={styles.tradeButton}
              onPress={() => router.push(`/trade/${market.id}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="trending-up" size={20} color="white" />
              <Text style={styles.tradeButtonText}>Trade on this Market</Text>
            </TouchableOpacity>
          </View>
        )}
        {renderTradingPanel()}
      </ScrollView>
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
  shareButton: {
    padding: 4,
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
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#dc3545',
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    lineHeight: 28,
  },
  marketDescription: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20,
    marginBottom: 20,
  },
  pricesContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  priceCard: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginRight: 8,
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
    marginBottom: 2,
  },
  priceSubtext: {
    fontSize: 12,
    color: '#6c757d',
  },
  marketMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 4,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  statsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6c757d',
  },
  tradingPanel: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 16,
  },
  tradingTitle: {
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
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6c757d',
    marginHorizontal: 12,
  },
  amountContainer: {
    marginBottom: 20,
  },
  amountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
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
  tradingLimits: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 4,
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
  executeButton: {
    backgroundColor: '#28a745',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  executeButtonDisabled: {
    backgroundColor: '#6c757d',
  },
  executeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  tradingSection: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 16,
  },
  tradeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginLeft: 8,
  },
});