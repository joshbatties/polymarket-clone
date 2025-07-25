import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Market, MarketCategory } from '../types/market';
import { mockMarkets, trendingTopics, recentSearches, mockWatchlist } from '../data/mockData';
import MarketCard from '../components/MarketCard';

const categories: MarketCategory[] = ['Politics', 'Sports', 'Crypto', 'Business', 'Science', 'Entertainment'];

const getCategoryIcon = (category: MarketCategory) => {
  switch (category) {
    case 'Politics':
      return 'shield-outline' as const;
    case 'Sports':
      return 'basketball-outline' as const;
    case 'Crypto':
      return 'logo-bitcoin' as const;
    case 'Business':
      return 'briefcase-outline' as const;
    case 'Science':
      return 'flask-outline' as const;
    case 'Entertainment':
      return 'film-outline' as const;
    default:
      return 'grid-outline' as const;
  }
};

export default function MarketsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MarketCategory | 'All'>('All');
  const [sortBy, setSortBy] = useState<'volume' | 'endDate' | 'trending'>('volume');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(mockWatchlist);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  const handleWatchlistToggle = (marketId: string, isWatched: boolean) => {
    setWatchlist(prev => 
      isWatched 
        ? [...prev, marketId]
        : prev.filter(id => id !== marketId)
    );
  };

  const filteredMarkets = mockMarkets
    .filter((market) => {
      const matchesSearch = market.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          market.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === 'All' || market.category === selectedCategory;
      const matchesWatchlist = !showWatchlistOnly || watchlist.includes(market.id);
      return matchesSearch && matchesCategory && matchesWatchlist;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'volume':
          return b.volume - a.volume;
        case 'endDate':
          return a.endDate.getTime() - b.endDate.getTime();
        case 'trending':
          return b.yesPrice - a.yesPrice;
        default:
          return 0;
      }
    });

  const renderMarket = ({ item }: { item: Market }) => (
    <MarketCard 
      market={item} 
      isWatched={watchlist.includes(item.id)}
      onWatchlistToggle={handleWatchlistToggle}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* Search Bar at Top */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search markets..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setShowSearchSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 200)}
          placeholderTextColor="#8E8E93"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <Ionicons name="close-circle" size={16} color="#CCCCCC" />
          </TouchableOpacity>
        )}
      </View>

      {/* Search Suggestions */}
      {showSearchSuggestions && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>Trending</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trendingContainer}>
            {trendingTopics.map((topic, index) => (
              <TouchableOpacity
                key={index}
                style={styles.trendingTag}
                onPress={() => {
                  setSearchQuery(topic);
                  setShowSearchSuggestions(false);
                }}
              >
                <Ionicons name="trending-up" size={10} color="#FF9800" />
                <Text style={styles.trendingText}>{topic}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          {recentSearches.length > 0 && (
            <>
              <Text style={styles.suggestionsTitle}>Recent</Text>
              {recentSearches.slice(0, 2).map((search, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.recentItem}
                  onPress={() => {
                    setSearchQuery(search);
                    setShowSearchSuggestions(false);
                  }}
                >
                  <Ionicons name="time" size={14} color="#8E8E93" />
                  <Text style={styles.recentText}>{search}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      )}

      {/* Categories Section */}
      <View style={styles.categoriesSection}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoryContainer}
          contentContainerStyle={styles.categoryContent}
        >
          <TouchableOpacity
            style={[styles.categoryButton, selectedCategory === 'All' && styles.categoryButtonActive]}
            onPress={() => setSelectedCategory('All')}
          >
            <Ionicons 
              name="grid-outline" 
              size={12} 
              color={selectedCategory === 'All' ? '#FFFFFF' : '#007AFF'} 
              style={styles.categoryIcon}
            />
            <Text style={[styles.categoryText, selectedCategory === 'All' && styles.categoryTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.categoryButton, showWatchlistOnly && styles.categoryButtonActive]}
            onPress={() => setShowWatchlistOnly(!showWatchlistOnly)}
          >
            <Ionicons 
              name={showWatchlistOnly ? 'star' : 'star-outline'} 
              size={12} 
              color={showWatchlistOnly ? '#FFFFFF' : '#007AFF'} 
              style={styles.categoryIcon}
            />
            <Text style={[styles.categoryText, showWatchlistOnly && styles.categoryTextActive]}>
              Watchlist
            </Text>
          </TouchableOpacity>
          
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              style={[styles.categoryButton, selectedCategory === category && styles.categoryButtonActive]}
              onPress={() => setSelectedCategory(category)}
            >
              <Ionicons 
                name={getCategoryIcon(category)} 
                size={12} 
                color={selectedCategory === category ? '#FFFFFF' : '#007AFF'} 
                style={styles.categoryIcon}
              />
              <Text style={[styles.categoryText, selectedCategory === category && styles.categoryTextActive]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sorting Section */}
      <View style={styles.sortingSection}>
        <View style={styles.sortContainer}>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'volume' && styles.sortButtonActive]}
            onPress={() => setSortBy('volume')}
          >
            <Text style={[styles.sortText, sortBy === 'volume' && styles.sortTextActive]}>
              Volume
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'trending' && styles.sortButtonActive]}
            onPress={() => setSortBy('trending')}
          >
            <Text style={[styles.sortText, sortBy === 'trending' && styles.sortTextActive]}>
              Trending
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'endDate' && styles.sortButtonActive]}
            onPress={() => setSortBy('endDate')}
          >
            <Text style={[styles.sortText, sortBy === 'endDate' && styles.sortTextActive]}>
              Ending
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Markets List */}
      <FlatList
        data={filteredMarkets}
        renderItem={renderMarket}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.marketsList}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  categoriesSection: {
    backgroundColor: '#FFFFFF',
    paddingTop: 16,
    paddingBottom: 8,
  },
  sortingSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 24,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#000000',
  },

  categoryContainer: {
    paddingHorizontal: 16,
  },
  categoryContent: {
    paddingHorizontal: 0,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    minWidth: 60,
  },
  categoryIcon: {
    marginRight: 3,
  },
  categoryButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryText: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '500',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  sortContainer: {
    flexDirection: 'row',
  },
  sortButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  sortButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  sortText: {
    fontSize: 10,
    color: '#007AFF',
    fontWeight: '500',
  },
  sortTextActive: {
    color: '#FFFFFF',
  },
  marketsList: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    backgroundColor: '#F8F9FA',
  },
  clearButton: {
    padding: 4,
  },
  suggestionsContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 2,
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 6,
  },
  trendingContainer: {
    marginBottom: 10,
  },
  trendingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  trendingText: {
    fontSize: 10,
    color: '#FF9800',
    marginLeft: 3,
    fontWeight: '500',
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  recentText: {
    fontSize: 12,
    color: '#000000',
    marginLeft: 6,
  },

}); 