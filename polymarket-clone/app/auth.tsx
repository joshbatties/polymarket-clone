import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthService, AuthState } from '../services/authService';

export default function AuthScreen() {
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [authState, setAuthState] = useState<AuthState>(AuthService.getAuthState());
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('demo@polymarket.com');
  const [loginPassword, setLoginPassword] = useState('demo123');
  
  // Signup form state
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');

  useEffect(() => {
    const unsubscribe = AuthService.subscribe((newAuthState) => {
      setAuthState(newAuthState);
      setIsLoading(newAuthState.isLoading);
      
      if (newAuthState.isAuthenticated) {
        router.replace('/');
      }
    });

    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    const result = await AuthService.login({
      email: loginEmail,
      password: loginPassword,
    });

    if (!result.success) {
      Alert.alert('Login Failed', result.error || 'Unknown error occurred');
    }
  };

  const handleSignup = async () => {
    const result = await AuthService.signup({
      email: signupEmail,
      password: signupPassword,
      confirmPassword: signupConfirmPassword,
      username: signupUsername,
    });

    if (!result.success) {
      Alert.alert('Signup Failed', result.error || 'Unknown error occurred');
    } else {
      Alert.alert('Account Created!', 'Welcome to PolyMarket Clone');
    }
  };

  const handleDemoLogin = async () => {
    const result = await AuthService.loginAsDemo();
    if (!result.success) {
      Alert.alert('Demo Login Failed', result.error || 'Unknown error occurred');
    }
  };

  const handleForgotPassword = () => {
    Alert.prompt(
      'Reset Password',
      'Enter your email address to receive reset instructions',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async (email) => {
            if (email) {
              const result = await AuthService.sendPasswordReset(email);
              if (result.success) {
                Alert.alert('Reset Sent', 'Check your email for reset instructions');
              } else {
                Alert.alert('Error', result.error || 'Failed to send reset email');
              }
            }
          }
        }
      ],
      'plain-text',
      '',
      'email-address'
    );
  };

  const connectWallet = (walletType: 'metamask' | 'walletconnect' | 'coinbase') => {
    Alert.alert(
      `Connect ${walletType.charAt(0).toUpperCase() + walletType.slice(1)}`,
      'This would open your wallet app in a real implementation',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Connect',
          onPress: () => {
            // Simulate wallet connection
            const mockAddress = '0x' + Math.random().toString(16).substr(2, 40);
            Alert.alert('Wallet Connected!', `Address: ${mockAddress.slice(0, 10)}...`);
          }
        }
      ]
    );
  };

  const renderLogin = () => (
    <View style={styles.formContainer}>
      <Text style={styles.welcomeText}>Welcome Back</Text>
      <Text style={styles.subtitleText}>Sign in to your account</Text>

      <View style={styles.inputContainer}>
        <Ionicons name="mail" size={20} color="#8E8E93" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder="Email"
          value={loginEmail}
          onChangeText={setLoginEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#8E8E93"
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed" size={20} color="#8E8E93" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder="Password"
          value={loginPassword}
          onChangeText={setLoginPassword}
          secureTextEntry
          placeholderTextColor="#8E8E93"
        />
      </View>

      <TouchableOpacity onPress={handleForgotPassword}>
        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.primaryButton, isLoading && styles.disabledButton]}
        onPress={handleLogin}
        disabled={isLoading}
      >
        <Text style={styles.primaryButtonText}>
          {isLoading ? 'Signing In...' : 'Sign In'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.demoButton}
        onPress={handleDemoLogin}
        disabled={isLoading}
      >
        <Text style={styles.demoButtonText}>
          🎮 Try Demo Account
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSignup = () => (
    <View style={styles.formContainer}>
      <Text style={styles.welcomeText}>Create Account</Text>
      <Text style={styles.subtitleText}>Join PolyMarket Clone today</Text>

      <View style={styles.inputContainer}>
        <Ionicons name="person" size={20} color="#8E8E93" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder="Username"
          value={signupUsername}
          onChangeText={setSignupUsername}
          autoCapitalize="none"
          placeholderTextColor="#8E8E93"
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="mail" size={20} color="#8E8E93" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder="Email"
          value={signupEmail}
          onChangeText={setSignupEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#8E8E93"
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed" size={20} color="#8E8E93" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder="Password"
          value={signupPassword}
          onChangeText={setSignupPassword}
          secureTextEntry
          placeholderTextColor="#8E8E93"
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed" size={20} color="#8E8E93" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder="Confirm Password"
          value={signupConfirmPassword}
          onChangeText={setSignupConfirmPassword}
          secureTextEntry
          placeholderTextColor="#8E8E93"
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, isLoading && styles.disabledButton]}
        onPress={handleSignup}
        disabled={isLoading}
      >
        <Text style={styles.primaryButtonText}>
          {isLoading ? 'Creating Account...' : 'Create Account'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.termsText}>
        By creating an account, you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <LinearGradient
            colors={['#007AFF', '#5856D6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <Text style={styles.logoText}>🎯</Text>
            <Text style={styles.appName}>PolyMarket Clone</Text>
            <Text style={styles.tagline}>Predict the Future</Text>
          </LinearGradient>

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'login' && styles.activeTab]}
              onPress={() => setActiveTab('login')}
            >
              <Text style={[styles.tabText, activeTab === 'login' && styles.activeTabText]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'signup' && styles.activeTab]}
              onPress={() => setActiveTab('signup')}
            >
              <Text style={[styles.tabText, activeTab === 'signup' && styles.activeTabText]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          {activeTab === 'login' ? renderLogin() : renderSignup()}

          {/* Wallet Connection */}
          <View style={styles.walletSection}>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or connect with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.walletButtons}>
              <TouchableOpacity
                style={styles.walletButton}
                onPress={() => connectWallet('metamask')}
              >
                <Text style={styles.walletButtonText}>🦊 MetaMask</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.walletButton}
                onPress={() => connectWallet('walletconnect')}
              >
                <Text style={styles.walletButtonText}>🔗 WalletConnect</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.walletButton}
                onPress={() => connectWallet('coinbase')}
              >
                <Text style={styles.walletButtonText}>🏦 Coinbase</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  logoText: {
    fontSize: 48,
    marginBottom: 10,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: -20,
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  formContainer: {
    padding: 20,
    marginTop: 20,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitleText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 30,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#007AFF',
    textAlign: 'right',
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  demoButton: {
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  demoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
  },
  termsText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 10,
  },
  walletSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E5EA',
  },
  dividerText: {
    fontSize: 14,
    color: '#8E8E93',
    paddingHorizontal: 16,
  },
  walletButtons: {
    gap: 12,
  },
  walletButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  walletButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
}); 