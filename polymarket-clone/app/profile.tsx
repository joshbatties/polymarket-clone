import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Switch,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AuthService, User, AuthState } from '../services/authService';
import { TradingService } from '../services/tradingService';
import { NotificationService } from '../services/notificationService';

export default function ProfileScreen() {
  const [authState, setAuthState] = useState<AuthState>(AuthService.getAuthState());
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Edit profile form
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  
  // Settings
  const [notifications, setNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const unsubscribe = AuthService.subscribe((newAuthState) => {
      setAuthState(newAuthState);
      if (newAuthState.user) {
        setEditUsername(newAuthState.user.username);
        setEditEmail(newAuthState.user.email);
        setNotifications(newAuthState.user.preferences.notifications);
        setEmailAlerts(newAuthState.user.preferences.emailAlerts);
        setDarkMode(newAuthState.user.preferences.darkMode);
      }
    });

    return unsubscribe;
  }, []);

  const user = authState.user;
  if (!user) {
    // Redirect to auth screen if not logged in
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.authPrompt}>
          <Ionicons name="person-circle" size={80} color="#CCCCCC" />
          <Text style={styles.authTitle}>Sign In Required</Text>
          <Text style={styles.authSubtitle}>
            Please sign in to view your profile and manage your account
          </Text>
          <TouchableOpacity 
            style={styles.authButton}
            onPress={() => router.push('/auth')}
          >
            <Text style={styles.authButtonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.browseButton}
            onPress={() => router.push('/')}
          >
            <Text style={styles.browseButtonText}>Browse Markets Instead</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const userStats = {
    totalVolume: TradingService.getUserTrades().reduce((sum, trade) => sum + trade.totalCost, 0),
    totalTrades: TradingService.getUserTrades().length,
    winRate: (() => {
      const positions = TradingService.getUserPositions();
      if (positions.length === 0) return 0;
      const winningPositions = positions.filter(p => p.pnl > 0).length;
      return (winningPositions / positions.length) * 100;
    })(),
    accountAge: Math.ceil((new Date().getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await AuthService.logout();
            router.replace('/auth');
          }
        }
      ]
    );
  };

  const handleEditProfile = async () => {
    if (!editUsername.trim() || !editEmail.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    const result = await AuthService.updateProfile({
      username: editUsername.trim(),
      email: editEmail.trim(),
    });

    setIsLoading(false);

    if (result.success) {
      setShowEditProfile(false);
      Alert.alert('Success', 'Profile updated successfully');
    } else {
      Alert.alert('Error', result.error || 'Failed to update profile');
    }
  };

  const handleWalletAction = (action: 'connect' | 'disconnect') => {
    if (action === 'connect') {
      Alert.alert(
        'Connect Wallet',
        'Choose a wallet to connect',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'MetaMask',
            onPress: async () => {
              const mockAddress = '0x' + Math.random().toString(16).substr(2, 40);
              const result = await AuthService.connectWallet({
                address: mockAddress,
                type: 'metamask',
              });
              if (result.success) {
                Alert.alert('Success', 'Wallet connected successfully');
              } else {
                Alert.alert('Error', result.error || 'Failed to connect wallet');
              }
            }
          }
        ]
      );
    } else {
      Alert.alert(
        'Disconnect Wallet',
        'Are you sure you want to disconnect your wallet?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            onPress: async () => {
              await AuthService.disconnectWallet();
              Alert.alert('Success', 'Wallet disconnected');
            }
          }
        ]
      );
    }
  };

  const handleVerifyEmail = async () => {
    const result = await AuthService.verifyEmail('mock_token');
    if (result.success) {
      Alert.alert('Success', 'Email verified successfully');
    } else {
      Alert.alert('Error', result.error || 'Verification failed');
    }
  };

  const ProfileStat = ({ label, value, icon }: { label: string; value: string; icon: string }) => (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={24} color="#007AFF" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const SettingRow = ({ 
    title, 
    subtitle, 
    icon, 
    onPress, 
    rightElement 
  }: { 
    title: string; 
    subtitle?: string; 
    icon: string; 
    onPress?: () => void;
    rightElement?: React.ReactNode;
  }) => (
    <TouchableOpacity style={styles.settingRow} onPress={onPress}>
      <View style={styles.settingLeft}>
        <Ionicons name={icon as any} size={24} color="#007AFF" />
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightElement || <Ionicons name="chevron-forward" size={20} color="#8E8E93" />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <LinearGradient
          colors={['#007AFF', '#5856D6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileHeader}
        >
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user.username.charAt(0).toUpperCase()}
              </Text>
            </View>
            {!user.isEmailVerified && (
              <TouchableOpacity style={styles.verifyBadge} onPress={handleVerifyEmail}>
                <Ionicons name="warning" size={16} color="#FF9500" />
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.username}>{user.username}</Text>
          <Text style={styles.email}>{user.email}</Text>
          
          {user.walletAddress && (
            <View style={styles.walletContainer}>
              <Ionicons name="wallet" size={16} color="rgba(255,255,255,0.8)" />
              <Text style={styles.walletText}>
                {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <ProfileStat
            label="Total Volume"
            value={`$${userStats.totalVolume.toLocaleString()}`}
            icon="trending-up"
          />
          <ProfileStat
            label="Total Trades"
            value={userStats.totalTrades.toString()}
            icon="swap-horizontal"
          />
          <ProfileStat
            label="Win Rate"
            value={`${userStats.winRate.toFixed(1)}%`}
            icon="trophy"
          />
          <ProfileStat
            label="Account Age"
            value={`${userStats.accountAge}d`}
            icon="calendar"
          />
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <SettingRow
            title="Edit Profile"
            subtitle="Update your username and email"
            icon="person"
            onPress={() => setShowEditProfile(true)}
          />
          
          <SettingRow
            title={user.walletAddress ? "Wallet Connected" : "Connect Wallet"}
            subtitle={user.walletAddress ? "Manage your wallet connection" : "Connect a crypto wallet"}
            icon="wallet"
            onPress={() => handleWalletAction(user.walletAddress ? 'disconnect' : 'connect')}
          />
          
          {!user.isEmailVerified && (
            <SettingRow
              title="Verify Email"
              subtitle="Verify your email address"
              icon="mail"
              onPress={handleVerifyEmail}
            />
          )}
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          
          <SettingRow
            title="Notifications"
            subtitle="Push notifications for trades and alerts"
            icon="notifications"
            rightElement={
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
              />
            }
          />
          
          <SettingRow
            title="Email Alerts"
            subtitle="Receive email notifications"
            icon="mail"
            rightElement={
              <Switch
                value={emailAlerts}
                onValueChange={setEmailAlerts}
                trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
              />
            }
          />
          
          <SettingRow
            title="Privacy Policy"
            icon="shield-checkmark"
            onPress={() => Alert.alert('Privacy Policy', 'This would open the privacy policy')}
          />
          
          <SettingRow
            title="Terms of Service"
            icon="document-text"
            onPress={() => Alert.alert('Terms of Service', 'This would open the terms of service')}
          />
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color="#FF3B30" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowEditProfile(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity 
              onPress={handleEditProfile}
              disabled={isLoading}
            >
              <Text style={[styles.modalSave, isLoading && styles.disabledText]}>
                {isLoading ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Username</Text>
              <TextInput
                style={styles.textInput}
                value={editUsername}
                onChangeText={setEditUsername}
                placeholder="Enter username"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.textInput}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="Enter email"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    paddingBottom: 20,
  },
  profileHeader: {
    paddingTop: 40,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  verifyBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  username: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 16,
  },
  walletContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  walletText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  statCard: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginHorizontal: 20,
    marginBottom: 12,
  },
  menuContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F0F8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
  },
  menuItemSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    marginLeft: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#000000',
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
     disabledText: {
     color: '#8E8E93',
   },
   authPrompt: {
     flex: 1,
     justifyContent: 'center',
     alignItems: 'center',
     padding: 40,
   },
   authTitle: {
     fontSize: 24,
     fontWeight: '700',
     color: '#000000',
     marginTop: 20,
     marginBottom: 10,
   },
   authSubtitle: {
     fontSize: 16,
     color: '#666666',
     textAlign: 'center',
     lineHeight: 22,
     marginBottom: 30,
   },
   authButton: {
     backgroundColor: '#007AFF',
     borderRadius: 12,
     paddingVertical: 16,
     paddingHorizontal: 32,
     marginBottom: 12,
   },
   authButtonText: {
     fontSize: 16,
     fontWeight: '600',
     color: '#FFFFFF',
   },
   browseButton: {
     backgroundColor: 'transparent',
     paddingVertical: 12,
     paddingHorizontal: 20,
   },
   browseButtonText: {
     fontSize: 14,
     color: '#007AFF',
     fontWeight: '500',
   },
 }); 