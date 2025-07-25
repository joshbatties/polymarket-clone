import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Position } from '../types/market';
import { TradingService, UserBalance } from '../services/tradingService';
import WalletManager from '../components/WalletManager';

export default function PortfolioScreen() {
  const [activeTab, setActiveTab] = useState<'positions' | 'performance'>('positions');
  const [showWallet, setShowWallet] = useState(false);
  const [userBalance, setUserBalance] = useState<UserBalance>({ available: 0, inOrders: 0, total: 0 });
  const [positions, setPositions] = useState<Position[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    updateData();
  }, [refreshKey]);

  const updateData = () => {
    // Update positions with current market prices
    TradingService.updateAllPositions();
    
    // Get latest data
    const balance = TradingService.getUserBalance();
    const userPositions = TradingService.getUserPositions();
    
    setUserBalance(balance);
    setPositions(userPositions);
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatPercentage = (percentage: number) => {
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(2)}%`;
  };

  const getTotalPortfolioValue = () => {
    return positions.reduce((total, position) => total + position.currentValue, 0) + userBalance.available;
  };

  const getTotalPnL = () => {
    return positions.reduce((total, position) => total + position.pnl, 0);
  };

  const getTotalPnLPercentage = () => {
    const totalCost = positions.reduce((total, position) => total + position.totalCost, 0);
    if (totalCost === 0) return 0;
    return (getTotalPnL() / totalCost) * 100;
  };

  const getWinRate = () => {
    if (positions.length === 0) return 0;
    const winningPositions = positions.filter(p => p.pnl > 0).length;
    return (winningPositions / positions.length) * 100;
  };

  const renderPosition = ({ item }: { item: Position }) => (
    <View style={styles.positionCard}>
      <View style={styles.positionHeader}>
        <Text style={styles.positionQuestion} numberOfLines={2}>
          {item.market.question}
        </Text>
        <View style={[styles.sideIndicator, item.side === 'YES' ? styles.yesSide : styles.noSide]}>
          <Text style={styles.sideText}>{item.side}</Text>
        </View>
      </View>
      
      <View style={styles.positionStats}>
        <View style={styles.statGroup}>
          <Text style={styles.statLabel}>Shares</Text>
          <Text style={styles.statValue}>{item.shares.toLocaleString()}</Text>
        </View>
        <View style={styles.statGroup}>
          <Text style={styles.statLabel}>Avg Price</Text>
          <Text style={styles.statValue}>{formatCurrency(item.avgPrice)}</Text>
        </View>
        <View style={styles.statGroup}>
          <Text style={styles.statLabel}>Current Value</Text>
          <Text style={styles.statValue}>{formatCurrency(item.currentValue)}</Text>
        </View>
        <View style={styles.statGroup}>
          <Text style={styles.statLabel}>P&L</Text>
          <Text style={[
            styles.statValue,
            item.pnl >= 0 ? styles.positiveValue : styles.negativeValue
          ]}>
            {formatCurrency(item.pnl)}
          </Text>
        </View>
      </View>
      
      <View style={styles.positionFooter}>
        <Text style={styles.totalCost}>
          Total Cost: {formatCurrency(item.totalCost)}
        </Text>
        <Text style={[
          styles.pnlPercentage,
          item.pnlPercentage >= 0 ? styles.positiveValue : styles.negativeValue
        ]}>
          {formatPercentage(item.pnlPercentage)}
        </Text>
      </View>
    </View>
  );

  const PerformanceCard = ({ title, value, subtitle, trend }: {
    title: string;
    value: string;
    subtitle?: string;
    trend?: 'up' | 'down' | 'neutral';
  }) => (
    <View style={styles.performanceCard}>
      <Text style={styles.performanceLabel}>{title}</Text>
      <View style={styles.performanceValueContainer}>
        <Text style={[
          styles.performanceValue,
          trend === 'up' ? styles.positiveValue : 
          trend === 'down' ? styles.negativeValue : styles.neutralValue
        ]}>
          {value}
        </Text>
        {trend && trend !== 'neutral' && (
          <Ionicons 
            name={trend === 'up' ? 'trending-up' : 'trending-down'} 
            size={16} 
            color={trend === 'up' ? '#4CAF50' : '#FF5722'} 
          />
        )}
      </View>
      {subtitle && (
        <Text style={styles.performanceSubtitle}>{subtitle}</Text>
      )}
    </View>
  );

  const renderPerformance = () => {
    const totalValue = getTotalPortfolioValue();
    const totalPnL = getTotalPnL();
    const totalPnLPercentage = getTotalPnLPercentage();
    const winRate = getWinRate();

    return (
      <ScrollView style={styles.performanceScroll}>
        <View style={styles.performanceContainer}>
          <View style={styles.performanceGrid}>
            <PerformanceCard
              title="Portfolio Value"
              value={formatCurrency(totalValue)}
              trend="neutral"
            />
            <PerformanceCard
              title="Total P&L"
              value={formatCurrency(totalPnL)}
              subtitle={formatPercentage(totalPnLPercentage)}
              trend={totalPnL >= 0 ? 'up' : 'down'}
            />
            <PerformanceCard
              title="Active Positions"
              value={positions.length.toString()}
              subtitle={`${positions.filter(p => p.pnl > 0).length} winning`}
              trend="neutral"
            />
            <PerformanceCard
              title="Win Rate"
              value={`${winRate.toFixed(1)}%`}
              trend={winRate >= 50 ? 'up' : winRate >= 30 ? 'neutral' : 'down'}
            />
            <PerformanceCard
              title="Available Cash"
              value={formatCurrency(userBalance.available)}
              subtitle="Ready to trade"
              trend="neutral"
            />
            <PerformanceCard
              title="In Orders"
              value={formatCurrency(userBalance.inOrders)}
              subtitle="Pending trades"
              trend="neutral"
            />
          </View>
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* Portfolio Summary */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.portfolioValue}>
              {formatCurrency(getTotalPortfolioValue())}
            </Text>
            <Text style={styles.portfolioLabel}>Portfolio Value</Text>
          </View>
          <View style={styles.pnlContainer}>
            <Text style={[
              styles.pnlValue,
              getTotalPnL() >= 0 ? styles.positiveValue : styles.negativeValue
            ]}>
              {formatCurrency(getTotalPnL())}
            </Text>
            <Text style={[
              styles.pnlPercentage,
              getTotalPnLPercentage() >= 0 ? styles.positiveValue : styles.negativeValue
            ]}>
              {formatPercentage(getTotalPnLPercentage())}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.walletButton}
            onPress={() => setShowWallet(true)}
          >
            <Ionicons name="wallet" size={20} color="#007AFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryStats}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatCurrency(userBalance.available)}</Text>
            <Text style={styles.statLabel}>Available Cash</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{positions.length}</Text>
            <Text style={styles.statLabel}>Active Positions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{getWinRate().toFixed(0)}%</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'positions' && styles.activeTab]}
          onPress={() => setActiveTab('positions')}
        >
          <Text style={[styles.tabText, activeTab === 'positions' && styles.activeTabText]}>
            Positions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'performance' && styles.activeTab]}
          onPress={() => setActiveTab('performance')}
        >
          <Text style={[styles.tabText, activeTab === 'performance' && styles.activeTabText]}>
            Performance
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'positions' ? (
        positions.length > 0 ? (
          <FlatList
            data={positions}
            renderItem={renderPosition}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.positionsList}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="trending-up" size={64} color="#CCCCCC" />
            <Text style={styles.emptyTitle}>No Positions Yet</Text>
            <Text style={styles.emptySubtitle}>
              Start trading on prediction markets to see your positions here
            </Text>
          </View>
        )
      ) : (
        renderPerformance()
      )}

      {/* Wallet Manager Modal */}
      <WalletManager
        visible={showWallet}
        onClose={() => setShowWallet(false)}
        onBalanceUpdate={(balance) => {
          setUserBalance(balance);
          setRefreshKey(prev => prev + 1);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  summaryContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  portfolioValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000000',
  },
  portfolioLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  pnlContainer: {
    alignItems: 'flex-end',
  },
  pnlValue: {
    fontSize: 20,
    fontWeight: '600',
  },
  pnlPercentage: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  positiveValue: {
    color: '#4CAF50',
  },
  negativeValue: {
    color: '#FF5722',
  },
  quickStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickStatText: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  positionsList: {
    padding: 16,
  },
  positionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  positionHeader: {
    marginBottom: 12,
  },
  positionQuestion: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 18,
    marginBottom: 8,
  },
  sideIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  yesSide: {
    backgroundColor: '#E8F5E8',
  },
  noSide: {
    backgroundColor: '#FFEBEE',
  },
  sideText: {
    fontSize: 12,
    fontWeight: '600',
  },
  positionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statGroup: {
    alignItems: 'center',
  },
  positionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalCost: {
    fontSize: 12,
    color: '#8E8E93',
  },
  statLabel: {
    fontSize: 10,
    color: '#8E8E93',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  performanceScroll: {
    padding: 16,
  },
  performanceContainer: {
    flex: 1,
  },
  performanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  performanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    width: '48%',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  performanceLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  performanceValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  performanceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  neutralValue: {
    color: '#8E8E93',
  },
  performanceSubtitle: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 4,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  walletButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 5,
    textAlign: 'center',
      },
 }); 