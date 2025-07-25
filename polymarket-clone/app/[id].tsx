import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { Market, OrderRequest } from '../types/market';
import { mockMarkets, mockOrderBooks } from '../data/mockData';
import OrderBookComponent from '../components/OrderBook';
import { TradingService, UserBalance } from '../services/tradingService';
import { AuthService } from '../services/authService';

export default function MarketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedSide, setSelectedSide] = useState<'YES' | 'NO'>('YES');
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [isExecutingTrade, setIsExecutingTrade] = useState(false);
  const [userBalance, setUserBalance] = useState<UserBalance>({ available: 0, inOrders: 0, total: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const market = mockMarkets.find(m => m.id === id);

  useEffect(() => {
    // Update user balance
    const balance = TradingService.getUserBalance();
    setUserBalance(balance);
    
    // Update positions to reflect current market prices
    TradingService.updateAllPositions();
  }, [refreshKey]);

  if (!market) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: 'Market Not Found' }} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#FF5722" />
          <Text style={styles.errorText}>Market not found</Text>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(1)}M`;
    }
    return `$${(volume / 1000).toFixed(0)}K`;
  };

  const formatPrice = (price: number) => {
    return `${Math.round(price * 100)}¢`;
  };

  const calculateShares = () => {
    const amount = parseFloat(tradeAmount);
    if (!amount || amount <= 0) return 0;
    
    const price = orderType === 'LIMIT' && limitPrice 
      ? parseFloat(limitPrice)
      : (selectedSide === 'YES' ? market.yesPrice : market.noPrice);
    
    return Math.floor(amount / price);
  };

  const calculateCost = () => {
    const amount = parseFloat(tradeAmount);
    if (!amount || amount <= 0) return 0;
    
    if (orderType === 'LIMIT' && limitPrice) {
      const shares = calculateShares();
      return shares * parseFloat(limitPrice);
    }
    
    return amount;
  };

  const getMaxAmount = () => {
    if (tradeType === 'BUY') {
      return userBalance.available;
    } else {
      // For sell orders, find user's position in this market
      const positions = TradingService.getUserPositions();
      const position = positions.find(p => p.marketId === market.id && p.side === selectedSide);
      if (position) {
        const currentPrice = selectedSide === 'YES' ? market.yesPrice : market.noPrice;
        return position.shares * currentPrice;
      }
      return 0;
    }
  };

  const handleExecuteTrade = async () => {
    // Check if user is authenticated
    const currentAuthState = AuthService.getAuthState();
    if (!currentAuthState.isAuthenticated) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to start trading on prediction markets.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Sign In', 
            onPress: () => router.push('/auth')
          }
        ]
      );
      return;
    }

    if (!tradeAmount || parseFloat(tradeAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (orderType === 'LIMIT' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      Alert.alert('Error', 'Please enter a valid limit price');
      return;
    }

    setIsExecutingTrade(true);

    try {
      const orderRequest: OrderRequest = {
        marketId: market.id,
        side: selectedSide,
        action: tradeType,
        orderType,
        amount: parseFloat(tradeAmount),
        limitPrice: orderType === 'LIMIT' ? parseFloat(limitPrice) : undefined,
      };

      if (orderType === 'MARKET') {
        const result = await TradingService.executeOrder(orderRequest);
        
        if (result.success && result.trade) {
          Alert.alert(
            'Trade Executed!',
            `Successfully ${tradeType.toLowerCase()}ed ${result.trade.shares} ${selectedSide} shares for ${formatPrice(result.trade.price)} each.\n\nTotal: $${result.trade.totalCost.toFixed(2)}`,
            [
              {
                text: 'View Portfolio',
                onPress: () => router.push('/portfolio')
              },
              {
                text: 'Continue Trading',
                onPress: () => {
                  setTradeAmount('');
                  setLimitPrice('');
                  setRefreshKey(prev => prev + 1);
                }
              }
            ]
          );
        } else {
          Alert.alert('Trade Failed', result.error || 'Unknown error occurred');
        }
      } else {
        // Limit order
        const result = await TradingService.placeLimitOrder(orderRequest);
        
        if (result.success) {
          Alert.alert(
            'Limit Order Placed',
            `Your ${tradeType.toLowerCase()} order for ${calculateShares()} ${selectedSide} shares at ${formatPrice(parseFloat(limitPrice))} has been placed.`,
            [
              {
                text: 'OK',
                onPress: () => {
                  setTradeAmount('');
                  setLimitPrice('');
                  setRefreshKey(prev => prev + 1);
                }
              }
            ]
          );
        } else {
          Alert.alert('Order Failed', result.error || 'Unknown error occurred');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to execute trade. Please try again.');
    } finally {
      setIsExecutingTrade(false);
    }
  };

  const handlePriceSelect = (price: number) => {
    if (orderType === 'LIMIT') {
      setLimitPrice(price.toFixed(3));
    }
  };

  const daysUntilEnd = Math.ceil((market.endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  const getCategoryColor = (category: string) => {
    const colors = {
      Politics: '#FF6B6B',
      Sports: '#4ECDC4',
      Crypto: '#45B7D1',
      Business: '#96CEB4',
      Science: '#FFEAA7',
      Entertainment: '#DDA0DD',
      Other: '#95A5A6',
    };
    return colors[category as keyof typeof colors] || colors.Other;
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen 
        options={{ 
          title: market.question.length > 30 
            ? market.question.substring(0, 30) + '...' 
            : market.question 
        }} 
      />
      
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Market Header */}
        <View style={styles.header}>
          <Text style={styles.question}>{market.question}</Text>
          
          <View style={styles.marketStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatVolume(market.volume)}</Text>
              <Text style={styles.statLabel}>Volume</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{(market.totalShares / 1000000).toFixed(1)}M</Text>
              <Text style={styles.statLabel}>Shares</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{daysUntilEnd}</Text>
              <Text style={styles.statLabel}>Days Left</Text>
            </View>
          </View>

          {market.resolved && (
            <View style={styles.resolvedBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.resolvedText}>
                Resolved: {market.outcome} won
              </Text>
            </View>
          )}
        </View>

        {/* Current Prices */}
        <View style={styles.pricesContainer}>
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>YES</Text>
            <Text style={styles.priceValue}>{formatPrice(market.yesPrice)}</Text>
            <Text style={styles.priceChange}>
              {market.yesPrice > 0.5 ? '+' : ''}{((market.yesPrice - 0.5) * 100).toFixed(1)}%
            </Text>
          </View>
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>NO</Text>
            <Text style={styles.priceValue}>{formatPrice(market.noPrice)}</Text>
            <Text style={styles.priceChange}>
              {market.noPrice > 0.5 ? '+' : ''}{((market.noPrice - 0.5) * 100).toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* User Balance */}
        <View style={styles.balanceContainer}>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Available</Text>
            <Text style={styles.balanceValue}>${userBalance.available.toFixed(2)}</Text>
          </View>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>In Orders</Text>
            <Text style={styles.balanceValue}>${userBalance.inOrders.toFixed(2)}</Text>
          </View>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Total</Text>
            <Text style={styles.balanceValue}>${userBalance.total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Price Chart */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>Price Chart</Text>
          <View style={styles.chartContainer}>
            <LinearGradient
              colors={['#4CAF50', '#FF5722']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.chartGradient}
            >
              <Text style={styles.chartText}>📊 Interactive Chart Coming Soon</Text>
            </LinearGradient>
          </View>
        </View>

        {/* Order Book */}
        {mockOrderBooks[market.id] && (
          <OrderBookComponent
            orderBook={mockOrderBooks[market.id]}
            selectedSide={selectedSide}
            onPriceSelect={(price) => {
              const amount = (parseFloat(tradeAmount) || 100).toString();
              setTradeAmount(amount);
            }}
          />
        )}

        {/* Trading Interface */}
        {!market.resolved && (
          <View style={styles.tradingSection}>
          <Text style={styles.sectionTitle}>Trade</Text>
          
          {/* Trade Type Toggle */}
          <View style={styles.tradeTypeContainer}>
            <TouchableOpacity
              style={[styles.tradeTypeButton, tradeType === 'BUY' && styles.activeTradeType]}
              onPress={() => setTradeType('BUY')}
            >
              <Text style={[styles.tradeTypeText, tradeType === 'BUY' && styles.activeTradeTypeText]}>
                BUY
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tradeTypeButton, tradeType === 'SELL' && styles.activeTradeType]}
              onPress={() => setTradeType('SELL')}
            >
              <Text style={[styles.tradeTypeText, tradeType === 'SELL' && styles.activeTradeTypeText]}>
                SELL
              </Text>
            </TouchableOpacity>
          </View>

          {/* Order Type Selection */}
          <View style={styles.orderTypeContainer}>
            <TouchableOpacity
              style={[styles.orderTypeButton, orderType === 'MARKET' && styles.activeOrderType]}
              onPress={() => setOrderType('MARKET')}
            >
              <Text style={[styles.orderTypeText, orderType === 'MARKET' && styles.activeOrderTypeText]}>
                Market Order
              </Text>
              <Text style={styles.orderTypeSubtext}>Execute immediately</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.orderTypeButton, orderType === 'LIMIT' && styles.activeOrderType]}
              onPress={() => setOrderType('LIMIT')}
            >
              <Text style={[styles.orderTypeText, orderType === 'LIMIT' && styles.activeOrderTypeText]}>
                Limit Order
              </Text>
              <Text style={styles.orderTypeSubtext}>Set a specific price</Text>
            </TouchableOpacity>
          </View>

          {orderType === 'LIMIT' && (
            <View style={styles.limitPriceInputContainer}>
              <Text style={styles.inputLabel}>Limit Price ($)</Text>
              <TextInput
                style={styles.limitPriceInput}
                value={limitPrice}
                onChangeText={setLimitPrice}
                placeholder="0.00"
                keyboardType="numeric"
                placeholderTextColor="#8E8E93"
              />
            </View>
          )}

          {/* Side Selection */}
          <View style={styles.sideContainer}>
            <TouchableOpacity
              style={[styles.sideButton, selectedSide === 'YES' && styles.activeSide]}
              onPress={() => setSelectedSide('YES')}
            >
              <Text style={[styles.sideText, selectedSide === 'YES' && styles.activeSideText]}>
                YES {formatPrice(market.yesPrice)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sideButton, selectedSide === 'NO' && styles.activeSide]}
              onPress={() => setSelectedSide('NO')}
            >
              <Text style={[styles.sideText, selectedSide === 'NO' && styles.activeSideText]}>
                NO {formatPrice(market.noPrice)}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Amount ($)</Text>
            <TextInput
              style={styles.amountInput}
              value={tradeAmount}
              onChangeText={setTradeAmount}
              placeholder="0.00"
              keyboardType="numeric"
              placeholderTextColor="#8E8E93"
            />
            <View style={styles.quickAmountButtons}>
              {[25, 50, 100, 250].map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={styles.quickAmountButton}
                  onPress={() => setTradeAmount(amount.toString())}
                >
                  <Text style={styles.quickAmountText}>${amount}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Trade Summary */}
          {tradeAmount && parseFloat(tradeAmount) > 0 && (
            <View style={styles.tradeSummary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Shares:</Text>
                <Text style={styles.summaryValue}>{calculateShares()}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Cost:</Text>
                <Text style={styles.summaryValue}>${calculateCost().toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Avg Price:</Text>
                <Text style={styles.summaryValue}>
                  {formatPrice(selectedSide === 'YES' ? market.yesPrice : market.noPrice)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Est. Fees:</Text>
                <Text style={styles.summaryValue}>$0.00</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total:</Text>
                <Text style={styles.totalValue}>${calculateCost().toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Trade Button */}
          <TouchableOpacity 
            style={[styles.tradeButton, (!tradeAmount || parseFloat(tradeAmount) <= 0) && styles.disabledButton]}
            onPress={handleExecuteTrade}
            disabled={!tradeAmount || parseFloat(tradeAmount) <= 0 || isExecutingTrade}
          >
            <Text style={styles.tradeButtonText}>
              {isExecutingTrade 
                ? 'Processing...' 
                : `${tradeType} ${selectedSide} • ${calculateShares()} shares • $${calculateCost().toFixed(2)}`
              }
            </Text>
          </TouchableOpacity>

          {getMaxAmount() > 0 && (
            <TouchableOpacity 
              style={styles.maxButton}
              onPress={() => setTradeAmount(getMaxAmount().toFixed(2))}
            >
              <Text style={styles.maxButtonText}>
                Max: ${getMaxAmount().toFixed(2)}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        )}

        {/* Market Description */}
        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>About This Market</Text>
          <Text style={styles.description}>{market.description}</Text>
          
          {market.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {market.tags.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.marketInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Category:</Text>
              <Text style={styles.infoValue}>{market.category}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Ends:</Text>
              <Text style={styles.infoValue}>{format(market.endDate, 'MMM dd, yyyy')}</Text>
            </View>
            {market.resolutionSource && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Resolution Source:</Text>
                <Text style={styles.infoValue}>{market.resolutionSource}</Text>
              </View>
            )}
            {market.createdBy && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Created by:</Text>
                <Text style={styles.infoValue}>{market.createdBy}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Order Book */}
        <View style={styles.orderBookSection}>
          <Text style={styles.sectionTitle}>Order Book - {selectedSide}</Text>
          {mockOrderBooks[market.id] ? (
            <OrderBookComponent 
              orderBook={mockOrderBooks[market.id]}
              selectedSide={selectedSide}
              onPriceSelect={handlePriceSelect}
            />
          ) : (
            <Text style={styles.noDataText}>No order book data available</Text>
          )}
        </View>


      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    flex: 1,
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  question: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 32,
    marginBottom: 16,
  },
  marketStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  statLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  resolvedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  resolvedText: {
    fontSize: 14,
    color: '#4CAF50',
    marginLeft: 8,
  },
  pricesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  priceCard: {
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  priceChange: {
    fontSize: 12,
    color: '#4CAF50',
  },
  balanceContainer: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  balanceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666666',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  chartSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  chartContainer: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
  },
  chartGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  tradingSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
  },
  tradeTypeContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginBottom: 16,
  },
  tradeTypeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTradeType: {
    backgroundColor: '#007AFF',
  },
  tradeTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
  },
  activeTradeTypeText: {
    color: '#FFFFFF',
  },
  orderTypeContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginBottom: 16,
  },
  orderTypeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeOrderType: {
    backgroundColor: '#007AFF',
  },
  orderTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  activeOrderTypeText: {
    color: '#FFFFFF',
  },
  orderTypeSubtext: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  limitPriceInputContainer: {
    marginBottom: 16,
  },
  limitPriceInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  sideContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  sideButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E5EA',
    alignItems: 'center',
  },
  activeSide: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  sideText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
  },
  activeSideText: {
    color: '#007AFF',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 8,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  quickAmountButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  quickAmountButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  tradeSummary: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  totalRow: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  totalLabel: {
    fontSize: 14,
    color: '#666666',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  tradeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  tradeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tagsSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#FF5722',
    marginTop: 10,
  },
  backButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 25,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
     backButtonText: {
     color: '#FFFFFF',
     fontSize: 16,
     fontWeight: '600',
   },
   maxButton: {
     marginTop: 8,
     alignSelf: 'flex-end',
   },
   maxButtonText: {
     fontSize: 14,
     color: '#007AFF',
     fontWeight: '500',
   },
   descriptionSection: {
     backgroundColor: '#FFFFFF',
     padding: 20,
     marginTop: 8,
   },
   description: {
     fontSize: 16,
     color: '#666666',
     lineHeight: 24,
     marginBottom: 16,
   },

   marketInfo: {
     gap: 8,
   },
   infoRow: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
   },
   infoLabel: {
     fontSize: 14,
     color: '#666666',
   },
   infoValue: {
     fontSize: 14,
     color: '#000000',
     fontWeight: '500',
   },
   orderBookSection: {
     backgroundColor: '#FFFFFF',
     padding: 20,
     marginTop: 8,
   },
   noDataText: {
     fontSize: 14,
     color: '#8E8E93',
     textAlign: 'center',
     marginTop: 20,
   },
 }); 