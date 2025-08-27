import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { OrderBook, OrderBookEntry } from '../types/market';

interface OrderBookProps {
  orderBook: OrderBook;
  selectedSide: 'YES' | 'NO';
  onPriceSelect?: (price: number) => void;
}

export default function OrderBookComponent({ orderBook, selectedSide, onPriceSelect }: OrderBookProps) {
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');

  const formatPrice = (price: number) => {
    return `${Math.round(price * 100)}¢`;
  };

  const formatShares = (shares: number) => {
    if (shares >= 1000) {
      return `${(shares / 1000).toFixed(1)}K`;
    }
    return shares.toString();
  };

  const renderOrderEntry = ({ item, index }: { item: OrderBookEntry; index: number }) => (
    <TouchableOpacity 
      style={[
        styles.orderRow,
        activeTab === 'buy' ? styles.buyRow : styles.sellRow
      ]}
      onPress={() => onPriceSelect?.(item.price)}
    >
      <Text style={styles.priceText}>{formatPrice(item.price)}</Text>
      <Text style={styles.sharesText}>{formatShares(item.shares)}</Text>
      <View 
        style={[
          styles.depthBar,
          { 
            width: `${Math.min((item.shares / 5000) * 100, 100)}%`,
            backgroundColor: activeTab === 'buy' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)'
          }
        ]} 
      />
    </TouchableOpacity>
  );

  const currentOrders = selectedSide === 'YES' ? orderBook.yes : orderBook.no;
  const displayOrders = activeTab === 'buy' ? currentOrders.buy : currentOrders.sell;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Order Book - {selectedSide}</Text>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'buy' && styles.activeTab]}
            onPress={() => setActiveTab('buy')}
          >
            <Text style={[styles.tabText, activeTab === 'buy' && styles.activeTabText]}>
              Buy Orders
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'sell' && styles.activeTab]}
            onPress={() => setActiveTab('sell')}
          >
            <Text style={[styles.tabText, activeTab === 'sell' && styles.activeTabText]}>
              Sell Orders
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tableHeader}>
        <Text style={styles.columnHeader}>Price</Text>
        <Text style={styles.columnHeader}>Shares</Text>
      </View>

      <FlatList
        data={displayOrders}
        renderItem={renderOrderEntry}
        keyExtractor={(item, index) => `${item.price}-${index}`}
        style={styles.ordersList}
        showsVerticalScrollIndicator={false}
      />

      {/* Market Depth Summary */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Best {activeTab === 'buy' ? 'Bid' : 'Ask'}:</Text>
          <Text style={styles.summaryValue}>
            {displayOrders.length > 0 ? formatPrice(displayOrders[0].price) : 'N/A'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Volume:</Text>
          <Text style={styles.summaryValue}>
            {formatShares(displayOrders.reduce((sum, order) => sum + order.shares, 0))}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Spread:</Text>
          <Text style={styles.summaryValue}>
            {currentOrders.sell.length > 0 && currentOrders.buy.length > 0
              ? `${Math.round((currentOrders.sell[0].price - currentOrders.buy[0].price) * 100)}¢`
              : 'N/A'
            }
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  columnHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  ordersList: {
    maxHeight: 200,
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'relative',
  },
  buyRow: {
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  sellRow: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF5722',
  },
  priceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  sharesText: {
    fontSize: 14,
    color: '#666666',
  },
  depthBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  summaryContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000000',
  },
}); 