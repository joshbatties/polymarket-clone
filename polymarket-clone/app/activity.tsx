import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Trade } from '../types/market';
import { mockTrades } from '../data/mockData';

export default function ActivityScreen() {
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all');

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatPrice = (price: number) => {
    return `${Math.round(price * 100)}¢`;
  };

  const filteredTrades = mockTrades.filter(trade => {
    if (filter === 'all') return true;
    return trade.action.toLowerCase() === filter;
  });

  const renderTrade = ({ item }: { item: Trade }) => (
    <View style={styles.tradeCard}>
      <View style={styles.tradeHeader}>
        <View style={styles.tradeInfo}>
          <View style={styles.actionContainer}>
            <View style={[
              styles.actionBadge, 
              item.action === 'BUY' ? styles.buyBadge : styles.sellBadge
            ]}>
              <Text style={[
                styles.actionText, 
                item.action === 'BUY' ? styles.buyText : styles.sellText
              ]}>
                {item.action}
              </Text>
            </View>
            <View style={[
              styles.sideBadge, 
              item.side === 'YES' ? styles.yesBadge : styles.noBadge
            ]}>
              <Text style={[
                styles.sideText, 
                item.side === 'YES' ? styles.yesText : styles.noText
              ]}>
                {item.side}
              </Text>
            </View>
          </View>
          <Text style={styles.timestamp}>
            {format(item.timestamp, 'MMM dd, yyyy • h:mm a')}
          </Text>
        </View>
        <View style={styles.tradeValue}>
          <Text style={styles.totalCost}>{formatCurrency(item.totalCost)}</Text>
          <Text style={styles.shares}>{item.shares} shares</Text>
        </View>
      </View>
      
      <Text style={styles.marketQuestion} numberOfLines={2}>
        {item.market.question}
      </Text>
      
      <View style={styles.tradeDetails}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Price</Text>
          <Text style={styles.detailValue}>{formatPrice(item.price)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Category</Text>
          <Text style={styles.detailValue}>{item.market.category}</Text>
        </View>
      </View>
    </View>
  );

  const ActivitySummary = () => (
    <View style={styles.summaryContainer}>
      <View style={styles.summaryStats}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>12</Text>
          <Text style={styles.statLabel}>Total Trades</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>$615.00</Text>
          <Text style={styles.statLabel}>Total Volume</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>8</Text>
          <Text style={styles.statLabel}>Buy Orders</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>4</Text>
          <Text style={styles.statLabel}>Sell Orders</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ActivitySummary />
      
      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.activeFilter]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'buy' && styles.activeFilter]}
          onPress={() => setFilter('buy')}
        >
          <Text style={[styles.filterText, filter === 'buy' && styles.activeFilterText]}>
            Buy
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'sell' && styles.activeFilter]}
          onPress={() => setFilter('sell')}
        >
          <Text style={[styles.filterText, filter === 'sell' && styles.activeFilterText]}>
            Sell
          </Text>
        </TouchableOpacity>
      </View>

      {/* Trade List */}
      <FlatList
        data={filteredTrades}
        renderItem={renderTrade}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.tradesList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color="#CCCCCC" />
            <Text style={styles.emptyTitle}>No trades found</Text>
            <Text style={styles.emptySubtitle}>
              Your trading activity will appear here
            </Text>
          </View>
        }
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
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
  },
  activeFilter: {
    backgroundColor: '#007AFF',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
  tradesList: {
    padding: 16,
  },
  tradeCard: {
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
  tradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  tradeInfo: {
    flex: 1,
  },
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  buyBadge: {
    backgroundColor: '#E8F5E8',
  },
  sellBadge: {
    backgroundColor: '#FFEBEE',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  buyText: {
    color: '#4CAF50',
  },
  sellText: {
    color: '#FF5722',
  },
  sideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  yesBadge: {
    backgroundColor: '#E3F2FD',
  },
  noBadge: {
    backgroundColor: '#FFF3E0',
  },
  sideText: {
    fontSize: 12,
    fontWeight: '600',
  },
  yesText: {
    color: '#1976D2',
  },
  noText: {
    color: '#F57C00',
  },
  timestamp: {
    fontSize: 12,
    color: '#8E8E93',
  },
  tradeValue: {
    alignItems: 'flex-end',
  },
  totalCost: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  shares: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  marketQuestion: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 20,
    marginBottom: 12,
  },
  tradeDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 10,
    color: '#8E8E93',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000000',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666666',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 8,
  },
}); 