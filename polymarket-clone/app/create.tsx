import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MarketCategory } from '../types/market';
import { router } from 'expo-router';

const categories: MarketCategory[] = ['Politics', 'Sports', 'Crypto', 'Business', 'Science', 'Entertainment'];

export default function CreateMarketScreen() {
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MarketCategory>('Business');
  const [endDate, setEndDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days from now
  const [tags, setTags] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [resolutionSource, setResolutionSource] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!question.trim()) {
      Alert.alert('Error', 'Please enter a market question');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a market description');
      return;
    }

    if (endDate <= new Date()) {
      Alert.alert('Error', 'End date must be in the future');
      return;
    }

    setIsSubmitting(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      const newMarket = {
        id: `user_${Date.now()}`,
        question: question.trim(),
        description: description.trim(),
        category,
        volume: 0,
        yesPrice: 0.5,
        noPrice: 0.5,
        endDate,
        imageUrl: imageUrl.trim() || undefined,
        tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
        totalShares: 0,
        resolved: false,
        createdBy: 'CurrentUser',
        resolutionSource: resolutionSource.trim(),
        createdAt: new Date(),
      };

      Alert.alert(
        'Market Created!', 
        'Your market has been successfully created and is now live for trading.',
        [
          {
            text: 'View Market',
            onPress: () => {
              router.push(`/${newMarket.id}`);
            }
          },
          {
            text: 'Create Another',
            onPress: () => {
              // Reset form
              setQuestion('');
              setDescription('');
              setCategory('Business');
              setEndDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
              setTags('');
              setImageUrl('');
              setResolutionSource('');
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to create market. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDatePress = () => {
    // For web/development, just show a simple date picker
    const dateString = prompt('Enter end date (YYYY-MM-DD):', endDate.toISOString().split('T')[0]);
    if (dateString) {
      const newDate = new Date(dateString);
      if (newDate > new Date()) {
        setEndDate(newDate);
      }
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Market</Text>
            <Text style={styles.subtitle}>
              Create a prediction market for others to trade on
            </Text>
          </View>

          {/* Question */}
          <View style={styles.section}>
            <Text style={styles.label}>Market Question *</Text>
            <TextInput
              style={styles.input}
              value={question}
              onChangeText={setQuestion}
              placeholder="Will Bitcoin reach $100,000 by end of 2024?"
              placeholderTextColor="#8E8E93"
              multiline
              numberOfLines={3}
            />
            <Text style={styles.helper}>
              Make it clear, specific, and answerable with Yes or No
            </Text>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.label}>Market Description *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Provide detailed resolution criteria and context for your market..."
              placeholderTextColor="#8E8E93"
              multiline
              numberOfLines={5}
            />
            <Text style={styles.helper}>
              Include clear resolution criteria and any important context
            </Text>
          </View>

          {/* Category */}
          <View style={styles.section}>
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.categoryContainer}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryButton,
                      category === cat && styles.categoryButtonActive
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[
                      styles.categoryText,
                      category === cat && styles.categoryTextActive
                    ]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* End Date */}
          <View style={styles.section}>
            <Text style={styles.label}>End Date</Text>
            <TouchableOpacity 
              style={styles.dateButton}
              onPress={handleDatePress}
            >
              <Ionicons name="calendar" size={20} color="#007AFF" />
              <Text style={styles.dateText}>{formatDate(endDate)}</Text>
              <Ionicons name="chevron-down" size={20} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          {/* Tags */}
          <View style={styles.section}>
            <Text style={styles.label}>Tags</Text>
            <TextInput
              style={styles.input}
              value={tags}
              onChangeText={setTags}
              placeholder="Bitcoin, Crypto, Price Prediction"
              placeholderTextColor="#8E8E93"
            />
            <Text style={styles.helper}>
              Separate tags with commas to help users find your market
            </Text>
          </View>

          {/* Image URL */}
          <View style={styles.section}>
            <Text style={styles.label}>Image URL (Optional)</Text>
            <TextInput
              style={styles.input}
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="https://example.com/image.png"
              placeholderTextColor="#8E8E93"
              keyboardType="url"
            />
            <Text style={styles.helper}>
              Add an image to make your market more engaging
            </Text>
          </View>

          {/* Resolution Source */}
          <View style={styles.section}>
            <Text style={styles.label}>Resolution Source</Text>
            <TextInput
              style={styles.input}
              value={resolutionSource}
              onChangeText={setResolutionSource}
              placeholder="CoinMarketCap, official announcement, etc."
              placeholderTextColor="#8E8E93"
            />
            <Text style={styles.helper}>
              Specify where the resolution data will come from
            </Text>
          </View>

          {/* Market Preview */}
          <View style={styles.previewSection}>
            <Text style={styles.previewTitle}>Market Preview</Text>
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <View style={styles.previewCategory}>
                  <Text style={styles.previewCategoryText}>{category}</Text>
                  <View style={styles.previewCommunityBadge}>
                    <Ionicons name="person" size={8} color="#4CAF50" />
                    <Text style={styles.previewCommunityText}>Community</Text>
                  </View>
                </View>
                <Text style={styles.previewVolume}>$0</Text>
              </View>
              <Text style={styles.previewQuestion} numberOfLines={3}>
                {question || 'Your market question will appear here...'}
              </Text>
              <View style={styles.previewPrices}>
                <View style={styles.previewPriceButton}>
                  <Text style={styles.previewPriceLabel}>YES</Text>
                  <Text style={styles.previewPriceValue}>50¢</Text>
                </View>
                <View style={styles.previewPriceButton}>
                  <Text style={styles.previewPriceLabel}>NO</Text>
                  <Text style={styles.previewPriceValue}>50¢</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Text style={styles.submitButtonText}>Creating Market...</Text>
            ) : (
              <>
                <Ionicons name="add-circle" size={20} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>Create Market</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    lineHeight: 22,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#000000',
    textAlignVertical: 'top',
  },
  textArea: {
    height: 100,
  },
  helper: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
    lineHeight: 16,
  },
  categoryContainer: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    minWidth: 80,
    alignItems: 'center',
  },
  categoryButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  dateText: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    marginLeft: 8,
  },
  previewSection: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewCategory: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewCategoryText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  previewCommunityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  previewCommunityText: {
    fontSize: 9,
    color: '#4CAF50',
    fontWeight: '600',
    marginLeft: 2,
  },
  previewVolume: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  previewQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 22,
    marginBottom: 16,
  },
  previewPrices: {
    flexDirection: 'row',
    gap: 8,
  },
  previewPriceButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  previewPriceLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    color: '#666666',
  },
  previewPriceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginTop: 32,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bottomPadding: {
    height: 40,
  },
}); 