import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WatchlistButtonProps {
  marketId: string;
  isWatched: boolean;
  onToggle: (marketId: string, isWatched: boolean) => void;
  size?: number;
  color?: string;
}

export default function WatchlistButton({ 
  marketId, 
  isWatched, 
  onToggle, 
  size = 20,
  color = '#FFD700'
}: WatchlistButtonProps) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    try {
      onToggle(marketId, !isWatched);
      Alert.alert(
        isWatched ? 'Removed from Watchlist' : 'Added to Watchlist',
        isWatched 
          ? 'This market has been removed from your watchlist'
          : 'This market has been added to your watchlist'
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to update watchlist');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handlePress}
      disabled={loading}
    >
      <Ionicons
        name={isWatched ? 'star' : 'star-outline'}
        size={size}
        color={isWatched ? color : '#CCCCCC'}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
}); 