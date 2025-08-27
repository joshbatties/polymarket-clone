import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TradingService } from '../services/tradingService';
import { useAuthStore } from '../contexts/authStore';

interface Position {
  position: {
    yesShares: number;
    noShares: number;
    totalShares: number;
    avgCostCents: number;
    avgCostFormatted: string;
  };
  market: {
    id: string;
    slug: string;
    title: string;
    category: string;
    status: string;
    currentPrices?: {
      yes: number;
      no: number;
      yesPercent: number;
      noPercent: number;
    };
  };
  pnl: {
    unrealizedPnL: number;
    unrealizedPnLFormatted: string;
    percentageChange: number;
    percentageChangeFormatted: string;
    currentValue: number;
    currentValueFormatted: string;
    costBasis: number;
    costBasisFormatted: string;
  };
}

interface Trade {
  trade: {
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
  };
  market: {
    id: string;
    slug: string;
    title: string;
    category: string;
    status: string;
  };
}

interface PortfolioSummary {
  totalPositions: number;
  totalValue: number;
  totalValueFormatted: string;
  totalPnL: number;
  totalPnLFormatted: string;
  totalPnLPercentage: number;
  totalPnLPercentageFormatted: string;
  cashBalance: number;
  cashBalanceFormatted: string;
  totalNetWorth: number;
  totalNetWorthFormatted: string;
}

export default function PortfolioScreen() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [selectedTab, setSelectedTab] = useState<'positions' | 'trades'>('positions');
  const [refreshing, setRefreshing] = useState(false);

  // Set access token when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // This would typically come from the auth store
      // TradingService.setAccessToken(accessToken);
    }
  }, [isAuthenticated]);

  // Fetch positions
  const { 
    data: positionsData, 
    isLoading: positionsLoading, 
    error: positionsError,
    refetch: refetchPositions 
  } = useQuery({
    queryKey: ['positions'],
    queryFn: () => TradingService.getPositions({ limit: 50 }),
    enabled: isAuthenticated,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Fetch trades
  const { 
    data: tradesData, 
    isLoading: tradesLoading, 
    error: tradesError,
    refetch: refetchTrades 
  } = useQuery({
    queryKey: ['trades'],
    queryFn: () => TradingService.getTrades({ limit: 50 }),
    enabled: isAuthenticated,
    staleTime: 30000,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchPositions(), refetchTrades()]);
    setRefreshing(false);
  };

  const handlePositionPress = (position: Position) => {
    router.push(`/${position.market.id}`);
  };

  const renderPortfolioSummary = (summary: PortfolioSummary) => (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Portfolio Summary</Text>
      
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Net Worth</Text>
          <Text style={styles.summaryValue}>{summary.totalNetWorthFormatted}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Cash</Text>
          <Text style={styles.summaryValue}>{summary.cashBalanceFormatted}</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total P&L</Text>
          <Text style={[
            styles.summaryValue,
            { color: summary.totalPnL >= 0 ? '#28a745' : '#dc3545' }
          ]}>
            {summary.totalPnLFormatted}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>% Change</Text>
          <Text style={[
            styles.summaryValue,
            { color: summary.totalPnLPercentage >= 0 ? '#28a745' : '#dc3545' }
          ]}>
            {summary.totalPnLPercentageFormatted}
          </Text>
        </View>
      </View>

      <View style={styles.summaryFooter}>
        <Text style={styles.summaryFooterText}>
          {summary.totalPositions} active positions
        </Text>
      </View>
    </View>
  );

  const renderPositionCard = ({ item: position }: { item: Position }) => (
    <TouchableOpacity
      style={styles.positionCard}
      onPress={() => handlePositionPress(position)}
      activeOpacity={0.7}
    >
      <View style={styles.positionHeader}>
        <View style={styles.categoryContainer}>
          <Text style={styles.categoryText}>{position.market.category}</Text>
        </View>
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(position.market.status) }]} />
          <Text style={styles.statusText}>{position.market.status}</Text>
        </View>
      </View>

      <Text style={styles.positionTitle} numberOfLines={2}>
        {position.market.title}
      </Text>

      <View style={styles.positionShares}>
        {position.position.yesShares > 0 && (
          <View style={styles.shareItem}>
            <Text style={styles.shareLabel}>YES</Text>
            <Text style={[styles.shareValue, { color: '#28a745' }]}>
              {position.position.yesShares.toFixed(0)} shares
            </Text>
          </View>
        )}
        {position.position.noShares > 0 && (
          <View style={styles.shareItem}>
            <Text style={styles.shareLabel}>NO</Text>
            <Text style={[styles.shareValue, { color: '#dc3545' }]}>
              {position.position.noShares.toFixed(0)} shares
            </Text>
          </View>
        )}
      </View>

      <View style={styles.positionMetrics}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Current Value</Text>
          <Text style={styles.metricValue}>{position.pnl.currentValueFormatted}</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>P&L</Text>
          <Text style={[
            styles.metricValue,
            { color: position.pnl.unrealizedPnL >= 0 ? '#28a745' : '#dc3545' }
          ]}>
            {position.pnl.unrealizedPnLFormatted}
          </Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>% Change</Text>
          <Text style={[
            styles.metricValue,
            { color: position.pnl.percentageChange >= 0 ? '#28a745' : '#dc3545' }
          ]}>
            {position.pnl.percentageChangeFormatted}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderTradeCard = ({ item }: { item: Trade }) => (
    <TouchableOpacity
      style={styles.tradeCard}
      activeOpacity={0.7}
    >
      <View style={styles.tradeHeader}>
        <View style={styles.tradeOutcome}>
          <Text style={[
            styles.tradeOutcomeText,
            { color: item.trade.outcome === 'YES' ? '#28a745' : '#dc3545' }
          ]}>
            {item.trade.side} {item.trade.outcome}
          </Text>
        </View>
        <Text style={styles.tradeTime}>
          {new Date(item.trade.timestamp).toLocaleDateString()}
        </Text>
      </View>

      <Text style={styles.tradeMarket} numberOfLines={1}>
        {item.market.title}
      </Text>

      <View style={styles.tradeDetails}>
        <View style={styles.tradeDetailItem}>
          <Text style={styles.tradeDetailLabel}>Shares</Text>
          <Text style={styles.tradeDetailValue}>{parseFloat(item.trade.shares).toFixed(2)}</Text>
        </View>
        <View style={styles.tradeDetailItem}>
          <Text style={styles.tradeDetailLabel}>Price</Text>
          <Text style={styles.tradeDetailValue}>${item.trade.fillPrice.toFixed(3)}</Text>
        </View>
        <View style={styles.tradeDetailItem}>
          <Text style={styles.tradeDetailLabel}>Total</Text>
          <Text style={styles.tradeDetailValue}>{item.trade.cost.totalCostFormatted}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderTabContent = () => {
    if (!isAuthenticated) {
      return (
        <View style={styles.authPrompt}>
          <Ionicons name="person-outline" size={64} color="#ccc" />
          <Text style={styles.authPromptTitle}>Sign in to view portfolio</Text>
          <Text style={styles.authPromptSubtitle}>
            Track your positions and trading performance
          </Text>
          <TouchableOpacity
            style={styles.authButton}
            onPress={() => router.push('/auth')}
          >
            <Text style={styles.authButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (selectedTab === 'positions') {
      if (positionsLoading) {
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading positions...</Text>
          </View>
        );
      }

      if (positionsError) {
        return (
          <View style={styles.errorContainer}>
            <Ionicons name="warning-outline" size={64} color="#dc3545" />
            <Text style={styles.errorTitle}>Failed to load positions</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetchPositions()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        );
      }

      const positions = positionsData?.positions || [];
      const summary = positionsData?.summary;

      if (positions.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <Ionicons name="briefcase-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No positions yet</Text>
            <Text style={styles.emptySubtitle}>
              Start trading to build your portfolio
            </Text>
            <TouchableOpacity
              style={styles.exploreButton}
              onPress={() => router.push('/index')}
            >
              <Text style={styles.exploreButtonText}>Explore Markets</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.tabContent}>
          {summary && renderPortfolioSummary(summary)}
          <FlatList
            data={positions}
            renderItem={renderPositionCard}
            keyExtractor={(item) => `${item.market.id}_position`}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          />
        </View>
      );
    } else {
      if (tradesLoading) {
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading trades...</Text>
          </View>
        );
      }

      if (tradesError) {
        return (
          <View style={styles.errorContainer}>
            <Ionicons name="warning-outline" size={64} color="#dc3545" />
            <Text style={styles.errorTitle}>Failed to load trades</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetchTrades()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        );
      }

      const trades = tradesData?.trades || [];

      if (trades.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <Ionicons name="swap-horizontal-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No trades yet</Text>
            <Text style={styles.emptySubtitle}>
              Your trading history will appear here
            </Text>
          </View>
        );
      }

      return (
        <FlatList
          data={trades}
          renderItem={renderTradeCard}
          keyExtractor={(item) => item.trade.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={styles.tradesList}
        />
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Portfolio</Text>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'positions' && styles.tabActive]}
          onPress={() => setSelectedTab('positions')}
        >
          <Text style={[styles.tabText, selectedTab === 'positions' && styles.tabTextActive]}>
            Positions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'trades' && styles.tabActive]}
          onPress={() => setSelectedTab('trades')}
        >
          <Text style={[styles.tabText, selectedTab === 'trades' && styles.tabTextActive]}>
            Trades
          </Text>
        </TouchableOpacity>
      </View>

      {renderTabContent()}
    </SafeAreaView>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'OPEN':
      return '#28a745';
    case 'CLOSED':
      return '#ffc107';
    case 'RESOLVED':
      return '#6c757d';
    default:
      return '#6c757d';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6c757d',
  },
  tabTextActive: {
    color: '#007AFF',
  },
  tabContent: {
    flex: 1,
    padding: 20,
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  summaryFooter: {
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  summaryFooterText: {
    fontSize: 12,
    color: '#6c757d',
  },
  positionCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  positionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryContainer: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976d2',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6c757d',
  },
  positionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
    lineHeight: 22,
  },
  positionShares: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  shareItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 8,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 80,
  },
  shareLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6c757d',
    marginBottom: 2,
  },
  shareValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  positionMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  tradesList: {
    padding: 20,
  },
  tradeCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tradeOutcome: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tradeOutcomeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tradeTime: {
    fontSize: 12,
    color: '#6c757d',
  },
  tradeMarket: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  tradeDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tradeDetailItem: {
    alignItems: 'center',
  },
  tradeDetailLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 4,
  },
  tradeDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
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
    backgroundColor: '#dc3545',
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6c757d',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 20,
  },
  exploreButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  exploreButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  authPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  authPromptTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  authPromptSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 20,
  },
  authButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  authButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});