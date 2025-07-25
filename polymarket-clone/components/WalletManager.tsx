import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TradingService, UserBalance } from '../services/tradingService';

interface WalletManagerProps {
  visible: boolean;
  onClose: () => void;
  onBalanceUpdate?: (balance: UserBalance) => void;
}

interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  timestamp: Date;
  description: string;
}

// Mock transactions history
const mockTransactions: Transaction[] = [
  {
    id: 'txn_1',
    type: 'deposit',
    amount: 500,
    status: 'completed',
    timestamp: new Date('2024-01-20'),
    description: 'Bank transfer deposit',
  },
  {
    id: 'txn_2',
    type: 'deposit',
    amount: 500,
    status: 'completed',
    timestamp: new Date('2024-01-15'),
    description: 'Initial deposit',
  },
];

export default function WalletManager({ visible, onClose, onBalanceUpdate }: WalletManagerProps) {
  const [activeTab, setActiveTab] = useState<'balance' | 'deposit' | 'withdraw' | 'history'>('balance');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [userBalance, setUserBalance] = useState<UserBalance>({ available: 0, inOrders: 0, total: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);

  useEffect(() => {
    if (visible) {
      updateBalance();
    }
  }, [visible]);

  const updateBalance = () => {
    const balance = TradingService.getUserBalance();
    setUserBalance(balance);
    onBalanceUpdate?.(balance);
  };

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (amount < 10) {
      Alert.alert('Error', 'Minimum deposit amount is $10');
      return;
    }

    if (amount > 10000) {
      Alert.alert('Error', 'Maximum deposit amount is $10,000');
      return;
    }

    setIsProcessing(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Add transaction
      const newTransaction: Transaction = {
        id: `txn_${Date.now()}`,
        type: 'deposit',
        amount,
        status: 'completed',
        timestamp: new Date(),
        description: 'Bank transfer deposit',
      };

      setTransactions(prev => [newTransaction, ...prev]);

      // Update balance (simplified - in real app this would be done by backend)
      const currentBalance = TradingService.getUserBalance();
      (TradingService as any).userBalance.available += amount;
      (TradingService as any).userBalance.total += amount;

      updateBalance();

      Alert.alert(
        'Deposit Successful',
        `$${amount.toFixed(2)} has been added to your account.`,
        [{ text: 'OK', onPress: () => setDepositAmount('') }]
      );
    } catch (error) {
      Alert.alert('Error', 'Deposit failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (amount < 10) {
      Alert.alert('Error', 'Minimum withdrawal amount is $10');
      return;
    }

    if (amount > userBalance.available) {
      Alert.alert('Error', 'Insufficient available balance');
      return;
    }

    setIsProcessing(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Add transaction
      const newTransaction: Transaction = {
        id: `txn_${Date.now()}`,
        type: 'withdrawal',
        amount,
        status: 'completed',
        timestamp: new Date(),
        description: 'Bank transfer withdrawal',
      };

      setTransactions(prev => [newTransaction, ...prev]);

      // Update balance
      (TradingService as any).userBalance.available -= amount;
      (TradingService as any).userBalance.total -= amount;

      updateBalance();

      Alert.alert(
        'Withdrawal Successful',
        `$${amount.toFixed(2)} has been withdrawn from your account.`,
        [{ text: 'OK', onPress: () => setWithdrawAmount('') }]
      );
    } catch (error) {
      Alert.alert('Error', 'Withdrawal failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderBalance = () => (
    <View style={styles.tabContent}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceTitle}>Total Balance</Text>
        <Text style={styles.balanceAmount}>${userBalance.total.toFixed(2)}</Text>
        
        <View style={styles.balanceBreakdown}>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Available for Trading</Text>
            <Text style={styles.balanceValue}>${userBalance.available.toFixed(2)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>In Active Orders</Text>
            <Text style={styles.balanceValue}>${userBalance.inOrders.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => setActiveTab('deposit')}
        >
          <Ionicons name="add-circle" size={24} color="#4CAF50" />
          <Text style={styles.actionText}>Deposit</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => setActiveTab('withdraw')}
        >
          <Ionicons name="remove-circle" size={24} color="#FF5722" />
          <Text style={styles.actionText}>Withdraw</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons name="list" size={24} color="#007AFF" />
          <Text style={styles.actionText}>History</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderDeposit = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Deposit Funds</Text>
      <Text style={styles.tabSubtitle}>Add money to your trading account</Text>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Deposit Amount ($)</Text>
        <TextInput
          style={styles.amountInput}
          value={depositAmount}
          onChangeText={setDepositAmount}
          placeholder="0.00"
          keyboardType="numeric"
          placeholderTextColor="#8E8E93"
        />
        <Text style={styles.inputHelper}>Minimum: $10 • Maximum: $10,000</Text>
      </View>

      <View style={styles.paymentMethods}>
        <Text style={styles.sectionTitle}>Payment Method</Text>
        <TouchableOpacity style={styles.paymentMethod}>
          <Ionicons name="card" size={24} color="#007AFF" />
          <View style={styles.paymentInfo}>
            <Text style={styles.paymentName}>Bank Transfer</Text>
            <Text style={styles.paymentDescription}>1-3 business days • No fees</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, (!depositAmount || isProcessing) && styles.disabledButton]}
        onPress={handleDeposit}
        disabled={!depositAmount || isProcessing}
      >
        <Text style={styles.submitButtonText}>
          {isProcessing ? 'Processing...' : `Deposit $${parseFloat(depositAmount || '0').toFixed(2)}`}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderWithdraw = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Withdraw Funds</Text>
      <Text style={styles.tabSubtitle}>
        Available to withdraw: ${userBalance.available.toFixed(2)}
      </Text>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Withdrawal Amount ($)</Text>
        <TextInput
          style={styles.amountInput}
          value={withdrawAmount}
          onChangeText={setWithdrawAmount}
          placeholder="0.00"
          keyboardType="numeric"
          placeholderTextColor="#8E8E93"
        />
        <Text style={styles.inputHelper}>
          Minimum: $10 • Maximum: ${userBalance.available.toFixed(2)}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.maxButton}
        onPress={() => setWithdrawAmount(userBalance.available.toFixed(2))}
      >
        <Text style={styles.maxButtonText}>Withdraw All Available</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.submitButton, (!withdrawAmount || isProcessing) && styles.disabledButton]}
        onPress={handleWithdraw}
        disabled={!withdrawAmount || isProcessing}
      >
        <Text style={styles.submitButtonText}>
          {isProcessing ? 'Processing...' : `Withdraw $${parseFloat(withdrawAmount || '0').toFixed(2)}`}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderHistory = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Transaction History</Text>
      
      <ScrollView style={styles.transactionsList}>
        {transactions.map((transaction) => (
          <View key={transaction.id} style={styles.transactionItem}>
            <View style={styles.transactionIcon}>
              <Ionicons 
                name={transaction.type === 'deposit' ? 'add-circle' : 'remove-circle'} 
                size={24} 
                color={transaction.type === 'deposit' ? '#4CAF50' : '#FF5722'} 
              />
            </View>
            <View style={styles.transactionDetails}>
              <Text style={styles.transactionDescription}>{transaction.description}</Text>
              <Text style={styles.transactionDate}>{formatDate(transaction.timestamp)}</Text>
            </View>
            <View style={styles.transactionAmount}>
              <Text style={[
                styles.transactionAmountText,
                transaction.type === 'deposit' ? styles.positiveAmount : styles.negativeAmount
              ]}>
                {transaction.type === 'deposit' ? '+' : '-'}${transaction.amount.toFixed(2)}
              </Text>
              <Text style={styles.transactionStatus}>{transaction.status}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Wallet</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#000000" />
          </TouchableOpacity>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'balance' && styles.activeTab]}
            onPress={() => setActiveTab('balance')}
          >
            <Text style={[styles.tabText, activeTab === 'balance' && styles.activeTabText]}>
              Balance
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'deposit' && styles.activeTab]}
            onPress={() => setActiveTab('deposit')}
          >
            <Text style={[styles.tabText, activeTab === 'deposit' && styles.activeTabText]}>
              Deposit
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'withdraw' && styles.activeTab]}
            onPress={() => setActiveTab('withdraw')}
          >
            <Text style={[styles.tabText, activeTab === 'withdraw' && styles.activeTabText]}>
              Withdraw
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'history' && styles.activeTab]}
            onPress={() => setActiveTab('history')}
          >
            <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
              History
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'balance' && renderBalance()}
        {activeTab === 'deposit' && renderDeposit()}
        {activeTab === 'withdraw' && renderWithdraw()}
        {activeTab === 'history' && renderHistory()}
      </View>
    </Modal>
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  tab: {
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
  tabContent: {
    flex: 1,
    padding: 20,
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  balanceTitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 20,
  },
  balanceBreakdown: {
    gap: 12,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666666',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    alignItems: 'center',
    padding: 16,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    marginTop: 8,
  },
  tabTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  tabSubtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
  },
  inputHelper: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
  },
  paymentMethods: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  paymentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  paymentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  paymentDescription: {
    fontSize: 14,
    color: '#666666',
    marginTop: 2,
  },
  maxButton: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  maxButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  transactionsList: {
    flex: 1,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  transactionIcon: {
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
  },
  transactionDate: {
    fontSize: 14,
    color: '#666666',
    marginTop: 2,
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  transactionAmountText: {
    fontSize: 16,
    fontWeight: '600',
  },
  positiveAmount: {
    color: '#4CAF50',
  },
  negativeAmount: {
    color: '#FF5722',
  },
  transactionStatus: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
}); 