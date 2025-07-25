import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Market } from '../types/market';
import { router } from 'expo-router';
import WatchlistButton from './WatchlistButton';

interface MarketCardProps {
  market: Market;
  isWatched?: boolean;
  onWatchlistToggle?: (marketId: string, isWatched: boolean) => void;
}

export default function MarketCard({ market, isWatched = false, onWatchlistToggle }: MarketCardProps) {
  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(1)}M`;
    }
    return `$${(volume / 1000).toFixed(0)}K`;
  };

  const formatPrice = (price: number) => {
    return `${Math.round(price * 100)}¢`;
  };

  const handlePress = () => {
    router.push(`/${market.id}`);
  };

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

  const daysUntilEnd = Math.ceil(
    (market.endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.categoryContainer}>
            <View 
              style={[
                styles.categoryDot, 
                { backgroundColor: getCategoryColor(market.category) }
              ]} 
            />
            <Text style={styles.categoryText}>{market.category}</Text>
            {market.createdBy && (
              <View style={styles.userCreatedBadge}>
                <Ionicons name="person" size={10} color="#4CAF50" />
                <Text style={styles.userCreatedText}>Community</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            <View style={styles.volumeContainer}>
              <Ionicons name="trending-up" size={12} color="#8E8E93" />
              <Text style={styles.volumeText}>{formatVolume(market.volume)}</Text>
            </View>
            {onWatchlistToggle && (
              <WatchlistButton
                marketId={market.id}
                isWatched={isWatched}
                onToggle={onWatchlistToggle}
                size={16}
              />
            )}
          </View>
        </View>

        {/* Question and Image */}
        <View style={styles.questionContainer}>
          <Text style={styles.question} numberOfLines={2}>
            {market.question}
          </Text>
          {market.imageUrl && (
            <Image source={{ uri: market.imageUrl }} style={styles.marketImage} />
          )}
        </View>

        {/* Tags */}
        <View style={styles.tagsContainer}>
          {market.tags.slice(0, 3).map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {/* Price Section */}
        <View style={styles.priceSection}>
          <View style={styles.priceContainer}>
            <TouchableOpacity style={[styles.priceButton, styles.yesButton]}>
              <Text style={styles.priceLabel}>YES</Text>
              <Text style={styles.priceValue}>{formatPrice(market.yesPrice)}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.priceButton, styles.noButton]}>
              <Text style={styles.priceLabel}>NO</Text>
              <Text style={styles.priceValue}>{formatPrice(market.noPrice)}</Text>
            </TouchableOpacity>
          </View>
          
          {/* Price Chart Indicator */}
          <View style={styles.chartContainer}>
            <LinearGradient
              colors={['#4CAF50', '#FF5722']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.chartGradient}
            >
              <View 
                style={[
                  styles.chartIndicator, 
                  { left: `${market.yesPrice * 100}%` }
                ]} 
              />
            </LinearGradient>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.endDateContainer}>
            <Ionicons name="time" size={12} color="#8E8E93" />
            <Text style={styles.endDateText}>
              {daysUntilEnd > 0 ? `${daysUntilEnd} days left` : 'Ended'}
            </Text>
          </View>
          <Text style={styles.sharesText}>
            {(market.totalShares / 1000000).toFixed(1)}M shares
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 1.5,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 3,
  },
  categoryText: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  volumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  volumeText: {
    fontSize: 10,
    color: '#8E8E93',
    marginLeft: 2,
    fontWeight: '500',
  },
  questionContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  question: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 16,
    marginRight: 8,
  },
  marketImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    flexShrink: 0,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  tag: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    marginRight: 3,
    marginBottom: 2,
  },
  tagText: {
    fontSize: 8,
    color: '#666666',
    fontWeight: '500',
  },
  priceSection: {
    marginBottom: 6,
  },
  priceContainer: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  priceButton: {
    flex: 1,
    padding: 6,
    borderRadius: 5,
    alignItems: 'center',
    marginHorizontal: 1,
  },
  yesButton: {
    backgroundColor: '#E8F5E8',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  noButton: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FF5722',
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginBottom: 0.5,
  },
  priceValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  chartContainer: {
    height: 2.5,
    borderRadius: 1.25,
    overflow: 'hidden',
    position: 'relative',
  },
  chartGradient: {
    flex: 1,
    flexDirection: 'row',
  },
  chartIndicator: {
    position: 'absolute',
    top: -1.25,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.25,
    borderColor: '#007AFF',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  endDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  endDateText: {
    fontSize: 10,
    color: '#8E8E93',
    marginLeft: 2,
  },
  sharesText: {
    fontSize: 10,
    color: '#8E8E93',
  },
  userCreatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    marginLeft: 4,
  },
  userCreatedText: {
    fontSize: 7,
    color: '#4CAF50',
    fontWeight: '600',
    marginLeft: 1,
  },
}); 