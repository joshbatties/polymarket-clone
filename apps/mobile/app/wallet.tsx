import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useStripe, StripeProvider } from '@stripe/stripe-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../contexts/authStore';
import { PaymentService, handlePaymentError, useStripeConfig } from '../services/paymentService';
import { format } from 'date-fns';

export default function WalletScreen() {
  const { publishableKey } = useStripeConfig();

  if (!publishableKey) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Stripe configuration missing</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <StripeProvider publishableKey={publishableKey} merchantIdentifier="merchant.com.aussiemarkets">
      <WalletContent />
    </StripeProvider>
  );
}

function WalletContent() {
  const { user, isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [isApplePaySupported, setIsApplePaySupported] = useState(false);

  // Check Apple Pay support manually
  useEffect(() => {
    const checkApplePaySupport = async () => {
      try {
        // For now, set to true on iOS simulator/device
        // In a real app, you'd use Stripe's Apple Pay detection
        setIsApplePaySupported(true);
      } catch (error) {
        setIsApplePaySupported(false);
      }
    };
    checkApplePaySupport();
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [depositAmount, setDepositAmount] = useState(5000); // $50.00 default

  // Set up payment service with auth token
  useEffect(() => {
    if (isAuthenticated && user) {
      // This would typically come from the auth store
      // PaymentService.setAccessToken(accessToken);
    }
  }, [isAuthenticated, user]);

  // Fetch wallet balance
  const { data: balanceData, isLoading: balanceLoading, error: balanceError } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: () => PaymentService.getWalletBalance(),
    enabled: isAuthenticated,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch deposit limits
  const { data: limitsData, isLoading: limitsLoading } = useQuery({
    queryKey: ['wallet', 'limits'],
    queryFn: () => PaymentService.getDepositLimits(),
    enabled: isAuthenticated,
  });

  // Fetch transaction history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['wallet', 'transactions'],
    queryFn: () => PaymentService.getTransactionHistory({ limit: 10 }),
    enabled: isAuthenticated,
  });

  // Apple Pay deposit mutation
  const depositMutation = useMutation({
    mutationFn: async (amountCents: number) => {
      try {
        // Create deposit intent
        const depositIntent = await PaymentService.createDepositIntent(amountCents);
        
        if (!depositIntent.success) {
          throw new Error('Failed to create deposit intent');
        }

        const { clientSecret } = depositIntent.data;

        // Initialize payment sheet
        const { error: initError } = await initPaymentSheet({
          merchantDisplayName: 'Aussie Markets',
          paymentIntentClientSecret: clientSecret,
          applePay: {
            merchantIdentifier: 'merchant.com.aussiemarkets',
            countryCode: 'AU',
            currencyCode: 'AUD',
            cartItems: [
              {
                label: 'Deposit to Wallet',
                amount: (amountCents / 100).toFixed(2),
                paymentType: 'Immediate',
              },
            ],
          },
          appearance: {
            colors: {
              primary: '#007AFF',
              background: '#FFFFFF',
              componentBackground: '#F7F7F7',
            },
          },
        });

        if (initError) {
          throw new Error(initError.message);
        }

        // Present payment sheet
        const { error: paymentError } = await presentPaymentSheet();

        if (paymentError) {
          if (paymentError.code === 'Canceled') {
            throw new Error('Payment was canceled');
          }
          throw new Error(paymentError.message);
        }

        return depositIntent.data;
      } catch (error: any) {
        console.error('Deposit failed:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      Alert.alert(
        'Payment Successful!',
        `Your deposit of ${PaymentService.formatAmount(data.amountCents)} will appear in your wallet shortly.`,
        [{ text: 'OK' }]
      );
      
      // Refresh wallet data
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (error: any) => {
      if (error.message !== 'Payment was canceled') {
        handlePaymentError(error);
      }
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['wallet'] });
    setRefreshing(false);
  };

  const handleDeposit = () => {
    if (!isApplePaySupported) {
      Alert.alert('Apple Pay Not Available', 'Apple Pay is not supported on this device.');
      return;
    }

    const validation = PaymentService.validateDepositAmount(depositAmount);
    if (!validation.isValid) {
      Alert.alert('Invalid Amount', validation.error);
      return;
    }

    // Check limits
    if (limitsData?.success && limitsData.data.isAtLimit) {
      Alert.alert(
        'Deposit Limit Reached',
        'You have reached your daily deposit limit. Please try again tomorrow.'
      );
      return;
    }

    if (limitsData?.success && depositAmount > limitsData.data.dailyRemainingCents) {
      Alert.alert(
        'Amount Exceeds Limit',
        `You can deposit up to ${PaymentService.formatAmount(limitsData.data.dailyRemainingCents)} more today.`
      );
      return;
    }

    depositMutation.mutate(depositAmount);
  };

  const quickAmounts = [1000, 2500, 5000, 10000, 25000]; // $10, $25, $50, $100, $250

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Please log in to view your wallet</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Wallet</Text>
          <TouchableOpacity onPress={handleRefresh} disabled={balanceLoading}>
            <Ionicons 
              name="refresh" 
              size={24} 
              color={balanceLoading ? "#ccc" : "#007AFF"} 
            />
          </TouchableOpacity>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          {balanceLoading ? (
            <ActivityIndicator size="large" color="#007AFF" />
          ) : balanceError ? (
            <Text style={styles.errorText}>Failed to load balance</Text>
          ) : (
            <>
              <Text style={styles.balanceAmount}>
                {balanceData?.data?.availableFormatted || '$0.00'}
              </Text>
              {balanceData?.data?.pendingCents !== '0' && (
                <Text style={styles.pendingAmount}>
                  Pending: ${(parseInt(balanceData.data.pendingCents) / 100).toFixed(2)}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Deposit Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Funds</Text>
          
          {/* Quick Amount Buttons */}
          <View style={styles.quickAmountsContainer}>
            {quickAmounts.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.quickAmountButton,
                  depositAmount === amount && styles.quickAmountButtonSelected,
                ]}
                onPress={() => setDepositAmount(amount)}
              >
                <Text
                  style={[
                    styles.quickAmountText,
                    depositAmount === amount && styles.quickAmountTextSelected,
                  ]}
                >
                  ${(amount / 100).toFixed(0)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Deposit Limits Info */}
          {limitsData?.success && (
            <View style={styles.limitsInfo}>
              <Text style={styles.limitsText}>
                Daily remaining: {PaymentService.formatAmount(limitsData.data.dailyRemainingCents)}
              </Text>
              <Text style={styles.limitsText}>
                Hourly remaining: {PaymentService.formatAmount(limitsData.data.velocityRemainingCents)}
              </Text>
            </View>
          )}

          {/* Apple Pay Button */}
          <TouchableOpacity
            style={[
              styles.applePayButton,
              (depositMutation.isPending || !isApplePaySupported) && styles.buttonDisabled,
            ]}
            onPress={handleDeposit}
            disabled={depositMutation.isPending || !isApplePaySupported}
          >
            {depositMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="logo-apple" size={24} color="white" />
                <Text style={styles.applePayButtonText}>
                  Pay ${(depositAmount / 100).toFixed(2)}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {!isApplePaySupported && (
            <Text style={styles.applePayNotSupported}>
              Apple Pay is not available on this device
            </Text>
          )}
        </View>

        {/* Transaction History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          
          {historyLoading ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : historyData?.success && historyData.data.entries.length > 0 ? (
            <View style={styles.transactionsList}>
              {historyData.data.entries.map((transaction) => (
                <View key={transaction.id} style={styles.transactionItem}>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionDescription}>
                      {transaction.description}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {format(new Date(transaction.timestamp), 'MMM dd, yyyy - h:mm a')}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.transactionAmount,
                      parseInt(transaction.amountCents) > 0
                        ? styles.transactionAmountPositive
                        : styles.transactionAmountNegative,
                    ]}
                  >
                    {transaction.amountFormatted}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noTransactions}>No transactions yet</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  balanceCard: {
    backgroundColor: 'white',
    margin: 20,
    padding: 30,
    borderRadius: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  balanceLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 5,
  },
  pendingAmount: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  section: {
    backgroundColor: 'white',
    margin: 20,
    marginTop: 0,
    padding: 20,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  quickAmountsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  quickAmountButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginBottom: 10,
    minWidth: 80,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  quickAmountButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  quickAmountText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  quickAmountTextSelected: {
    color: 'white',
  },
  limitsInfo: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  limitsText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  applePayButton: {
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  applePayButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  applePayNotSupported: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
  },
  transactionsList: {
    marginTop: 10,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
  },
  transactionDate: {
    fontSize: 14,
    color: '#666',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  transactionAmountPositive: {
    color: '#28a745',
  },
  transactionAmountNegative: {
    color: '#dc3545',
  },
  noTransactions: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
    marginTop: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#dc3545',
    fontSize: 16,
    textAlign: 'center',
  },
});
