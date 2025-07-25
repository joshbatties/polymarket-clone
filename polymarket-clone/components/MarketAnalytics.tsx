import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Market } from '../types/market';
import { RealtimeService } from '../services/realtimeService';

interface MarketAnalyticsProps {
  market: Market;
  visible: boolean;
  onClose: () => void;
}

interface PricePoint {
  timestamp: Date;
  yesPrice: number;
  noPrice: number;
  volume: number;
}

interface AnalyticsData {
  priceHistory: PricePoint[];
  volumeProfile: { price: number; volume: number }[];
  tradingStats: {
    avgYesPrice: number;
    avgNoPrice: number;
    priceVolatility: number;
    volumeWeightedPrice: number;
    marketDepth: number;
    spread: number;
  };
  marketSentiment: {
    bullishPercent: number;
    bearishPercent: number;
    neutralPercent: number;
  };
}

const screenWidth = Dimensions.get('window').width;
const chartWidth = screenWidth - 40;
const chartHeight = 200;

export default function MarketAnalytics({ market, visible, onClose }: MarketAnalyticsProps) {
  const [timeframe, setTimeframe] = useState<'1H' | '4H' | '1D' | '1W'>('1D');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'price' | 'volume'>('price');

  useEffect(() => {
    if (visible) {
      generateAnalyticsData();
      
      // Subscribe to real-time updates
      const unsubscribe = RealtimeService.subscribeToMarketUpdates((updates) => {
        const marketUpdate = updates.find(u => u.marketId === market.id);
        if (marketUpdate) {
          updateAnalyticsWithNewData(marketUpdate);
        }
      });

      return unsubscribe;
    }
  }, [visible, timeframe, market.id]);

  const generateAnalyticsData = () => {
    // Generate historical data based on timeframe
    const now = new Date();
    const dataPoints = getDataPointsForTimeframe(timeframe);
    const intervalMs = getIntervalForTimeframe(timeframe);

    const priceHistory: PricePoint[] = [];
    let currentYesPrice = market.yesPrice;
    let currentVolume = market.volume;

    for (let i = dataPoints; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * intervalMs);
      
      // Generate realistic price movement
      const volatility = 0.02;
      const priceChange = (Math.random() - 0.5) * volatility;
      currentYesPrice = Math.max(0.01, Math.min(0.99, currentYesPrice + priceChange));
      
      // Generate volume data
      const volumeChange = (Math.random() - 0.3) * 1000;
      currentVolume = Math.max(0, currentVolume + volumeChange);

      priceHistory.push({
        timestamp,
        yesPrice: currentYesPrice,
        noPrice: 1 - currentYesPrice,
        volume: currentVolume,
      });
    }

    // Calculate volume profile
    const volumeProfile = generateVolumeProfile(priceHistory);

    // Calculate trading statistics
    const tradingStats = calculateTradingStats(priceHistory);

    // Calculate market sentiment
    const marketSentiment = calculateMarketSentiment(priceHistory);

    setAnalyticsData({
      priceHistory,
      volumeProfile,
      tradingStats,
      marketSentiment,
    });
  };

  const updateAnalyticsWithNewData = (update: any) => {
    if (!analyticsData) return;

    const newDataPoint: PricePoint = {
      timestamp: update.timestamp,
      yesPrice: update.yesPrice,
      noPrice: update.noPrice,
      volume: update.volume,
    };

    const updatedHistory = [...analyticsData.priceHistory.slice(1), newDataPoint];
    const updatedStats = calculateTradingStats(updatedHistory);
    const updatedSentiment = calculateMarketSentiment(updatedHistory);

    setAnalyticsData({
      ...analyticsData,
      priceHistory: updatedHistory,
      tradingStats: updatedStats,
      marketSentiment: updatedSentiment,
    });
  };

  const getDataPointsForTimeframe = (tf: string): number => {
    switch (tf) {
      case '1H': return 60;
      case '4H': return 48;
      case '1D': return 24;
      case '1W': return 28;
      default: return 24;
    }
  };

  const getIntervalForTimeframe = (tf: string): number => {
    switch (tf) {
      case '1H': return 60 * 1000; // 1 minute
      case '4H': return 5 * 60 * 1000; // 5 minutes
      case '1D': return 60 * 60 * 1000; // 1 hour
      case '1W': return 6 * 60 * 60 * 1000; // 6 hours
      default: return 60 * 60 * 1000;
    }
  };

  const generateVolumeProfile = (history: PricePoint[]) => {
    const buckets: { [key: string]: number } = {};
    const bucketSize = 0.05; // 5 cent buckets

    history.forEach(point => {
      const bucket = Math.floor(point.yesPrice / bucketSize) * bucketSize;
      buckets[bucket.toFixed(2)] = (buckets[bucket.toFixed(2)] || 0) + point.volume;
    });

    return Object.entries(buckets)
      .map(([price, volume]) => ({ price: parseFloat(price), volume }))
      .sort((a, b) => a.price - b.price);
  };

  const calculateTradingStats = (history: PricePoint[]) => {
    if (history.length === 0) {
      return {
        avgYesPrice: 0,
        avgNoPrice: 0,
        priceVolatility: 0,
        volumeWeightedPrice: 0,
        marketDepth: 0,
        spread: 0,
      };
    }

    const avgYesPrice = history.reduce((sum, p) => sum + p.yesPrice, 0) / history.length;
    const avgNoPrice = history.reduce((sum, p) => sum + p.noPrice, 0) / history.length;
    
    // Calculate volatility (standard deviation)
    const yesVariance = history.reduce((sum, p) => sum + Math.pow(p.yesPrice - avgYesPrice, 2), 0) / history.length;
    const priceVolatility = Math.sqrt(yesVariance);

    // Volume weighted average price
    const totalVolume = history.reduce((sum, p) => sum + p.volume, 0);
    const volumeWeightedPrice = totalVolume > 0
      ? history.reduce((sum, p) => sum + p.yesPrice * p.volume, 0) / totalVolume
      : avgYesPrice;

    return {
      avgYesPrice,
      avgNoPrice,
      priceVolatility,
      volumeWeightedPrice,
      marketDepth: totalVolume,
      spread: 0.02, // Mock spread
    };
  };

  const calculateMarketSentiment = (history: PricePoint[]) => {
    if (history.length < 2) {
      return { bullishPercent: 50, bearishPercent: 50, neutralPercent: 0 };
    }

    let bullish = 0;
    let bearish = 0;
    let neutral = 0;

    for (let i = 1; i < history.length; i++) {
      const priceChange = history[i].yesPrice - history[i - 1].yesPrice;
      if (priceChange > 0.005) bullish++;
      else if (priceChange < -0.005) bearish++;
      else neutral++;
    }

    const total = bullish + bearish + neutral;
    return {
      bullishPercent: total > 0 ? (bullish / total) * 100 : 0,
      bearishPercent: total > 0 ? (bearish / total) * 100 : 0,
      neutralPercent: total > 0 ? (neutral / total) * 100 : 0,
    };
  };

  const renderChart = () => {
    if (!analyticsData || analyticsData.priceHistory.length === 0) {
      return (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.placeholderText}>Loading chart data...</Text>
        </View>
      );
    }

    const data = selectedMetric === 'price' 
      ? analyticsData.priceHistory.map(p => p.yesPrice)
      : analyticsData.priceHistory.map(p => p.volume);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    return (
      <View style={styles.chartContainer}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>
            {selectedMetric === 'price' ? 'YES Price' : 'Volume'} ({timeframe})
          </Text>
          <View style={styles.metricToggle}>
            <TouchableOpacity
              style={[styles.metricButton, selectedMetric === 'price' && styles.activeMetricButton]}
              onPress={() => setSelectedMetric('price')}
            >
              <Text style={[styles.metricButtonText, selectedMetric === 'price' && styles.activeMetricButtonText]}>
                Price
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.metricButton, selectedMetric === 'volume' && styles.activeMetricButton]}
              onPress={() => setSelectedMetric('volume')}
            >
              <Text style={[styles.metricButtonText, selectedMetric === 'volume' && styles.activeMetricButtonText]}>
                Volume
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.chart}>
          {/* Simple line chart visualization */}
          <LinearGradient
            colors={selectedMetric === 'price' ? ['#4CAF50', '#81C784'] : ['#007AFF', '#5856D6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.chartGradient}
          >
            <Text style={styles.chartText}>
              📊 {selectedMetric === 'price' ? 'Price Chart' : 'Volume Chart'}
            </Text>
            <Text style={styles.chartSubtext}>
              {selectedMetric === 'price' 
                ? `${(market.yesPrice * 100).toFixed(1)}¢ YES`
                : `${(market.volume / 1000).toFixed(0)}K Volume`
              }
            </Text>
          </LinearGradient>
        </View>

        {/* Chart indicators */}
        <View style={styles.chartIndicators}>
          <View style={styles.indicator}>
            <Text style={styles.indicatorValue}>
              {selectedMetric === 'price' ? `${(max * 100).toFixed(1)}¢` : `${(max / 1000).toFixed(0)}K`}
            </Text>
            <Text style={styles.indicatorLabel}>High</Text>
          </View>
          <View style={styles.indicator}>
            <Text style={styles.indicatorValue}>
              {selectedMetric === 'price' ? `${(min * 100).toFixed(1)}¢` : `${(min / 1000).toFixed(0)}K`}
            </Text>
            <Text style={styles.indicatorLabel}>Low</Text>
          </View>
          <View style={styles.indicator}>
            <Text style={styles.indicatorValue}>
              {selectedMetric === 'price' 
                ? `${(((max - min) / min) * 100).toFixed(1)}%`
                : `${((max - min) / 1000).toFixed(0)}K`
              }
            </Text>
            <Text style={styles.indicatorLabel}>Range</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderStats = () => {
    if (!analyticsData) return null;

    const { tradingStats, marketSentiment } = analyticsData;

    return (
      <View style={styles.statsContainer}>
        <Text style={styles.sectionTitle}>Trading Statistics</Text>
        
        <View style={styles.statsGrid}>
          <StatCard
            title="Avg YES Price"
            value={`${(tradingStats.avgYesPrice * 100).toFixed(1)}¢`}
            trend="neutral"
          />
          <StatCard
            title="Volatility"
            value={`${(tradingStats.priceVolatility * 100).toFixed(1)}%`}
            trend="neutral"
          />
          <StatCard
            title="VWAP"
            value={`${(tradingStats.volumeWeightedPrice * 100).toFixed(1)}¢`}
            trend="neutral"
          />
          <StatCard
            title="Spread"
            value={`${(tradingStats.spread * 100).toFixed(1)}¢`}
            trend="neutral"
          />
        </View>

        <View style={styles.sentimentContainer}>
          <Text style={styles.sectionTitle}>Market Sentiment</Text>
          <View style={styles.sentimentBar}>
            <View style={[styles.sentimentSegment, styles.bullishSegment, { flex: marketSentiment.bullishPercent }]}>
              <Text style={styles.sentimentText}>{marketSentiment.bullishPercent.toFixed(0)}%</Text>
            </View>
            <View style={[styles.sentimentSegment, styles.neutralSegment, { flex: marketSentiment.neutralPercent }]}>
              {marketSentiment.neutralPercent > 10 && (
                <Text style={styles.sentimentText}>{marketSentiment.neutralPercent.toFixed(0)}%</Text>
              )}
            </View>
            <View style={[styles.sentimentSegment, styles.bearishSegment, { flex: marketSentiment.bearishPercent }]}>
              <Text style={styles.sentimentText}>{marketSentiment.bearishPercent.toFixed(0)}%</Text>
            </View>
          </View>
          <View style={styles.sentimentLabels}>
            <Text style={styles.bullishLabel}>Bullish</Text>
            <Text style={styles.neutralLabel}>Neutral</Text>
            <Text style={styles.bearishLabel}>Bearish</Text>
          </View>
        </View>
      </View>
    );
  };

  const StatCard = ({ 
    title, 
    value, 
    trend 
  }: { 
    title: string; 
    value: string; 
    trend: 'up' | 'down' | 'neutral';
  }) => (
    <View style={styles.statCard}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Market Analytics</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {market.question}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#000000" />
        </TouchableOpacity>
      </View>

      {/* Timeframe Selector */}
      <View style={styles.timeframeContainer}>
        {(['1H', '4H', '1D', '1W'] as const).map((tf) => (
          <TouchableOpacity
            key={tf}
            style={[styles.timeframeButton, timeframe === tf && styles.activeTimeframeButton]}
            onPress={() => setTimeframe(tf)}
          >
            <Text style={[styles.timeframeButtonText, timeframe === tf && styles.activeTimeframeButtonText]}>
              {tf}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderChart()}
        {renderStats()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666666',
    marginTop: 2,
    maxWidth: 250,
  },
  timeframeContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  timeframeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#F0F0F0',
  },
  activeTimeframeButton: {
    backgroundColor: '#007AFF',
  },
  timeframeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  activeTimeframeButtonText: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  metricToggle: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: 2,
  },
  metricButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  activeMetricButton: {
    backgroundColor: '#007AFF',
  },
  metricButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  activeMetricButtonText: {
    color: '#FFFFFF',
  },
  chart: {
    height: chartHeight,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  chartGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  chartSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  chartPlaceholder: {
    height: chartHeight,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 16,
    color: '#666666',
  },
  chartIndicators: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  indicator: {
    alignItems: 'center',
  },
  indicatorValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  indicatorLabel: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  statsContainer: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    marginTop: 0,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  statTitle: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  sentimentContainer: {
    marginTop: 8,
  },
  sentimentBar: {
    flexDirection: 'row',
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  sentimentSegment: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bullishSegment: {
    backgroundColor: '#4CAF50',
  },
  neutralSegment: {
    backgroundColor: '#8E8E93',
  },
  bearishSegment: {
    backgroundColor: '#FF5722',
  },
  sentimentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sentimentLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bullishLabel: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  neutralLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  bearishLabel: {
    fontSize: 12,
    color: '#FF5722',
    fontWeight: '500',
  },
}); 