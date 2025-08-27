import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../contexts/authStore';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { token: urlToken } = useLocalSearchParams<{ token?: string }>();
  const [verificationToken, setVerificationToken] = useState(urlToken || '');
  const [email, setEmail] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  
  const { verifyEmail, resendVerification } = useAuthStore();

  // Auto-verify if token is provided in URL
  useEffect(() => {
    if (urlToken) {
      handleVerifyEmail(urlToken);
    }
  }, [urlToken]);

  const handleVerifyEmail = async (token?: string) => {
    const tokenToVerify = token || verificationToken.trim();
    
    if (!tokenToVerify) {
      Alert.alert('Error', 'Please enter your verification token');
      return;
    }

    setIsVerifying(true);
    
    try {
      await verifyEmail(tokenToVerify);
      
      Alert.alert(
        'Email Verified! ✅',
        'Your email has been successfully verified. You can now log in to your account.',
        [
          {
            text: 'Continue to Login',
            onPress: () => router.replace('/auth'),
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        'Verification Failed',
        error instanceof Error ? error.message : 'Please check your token and try again'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    setIsResending(true);
    
    try {
      await resendVerification(email.toLowerCase().trim());
      
      Alert.alert(
        'Verification Email Sent',
        'We\'ve sent a new verification email to your inbox. Please check your email and follow the instructions.'
      );
    } catch (error) {
      Alert.alert(
        'Failed to Send Email',
        error instanceof Error ? error.message : 'Please try again later'
      );
    } finally {
      setIsResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.subtitle}>
            We've sent a verification link to your email address. 
            You can either click the link or enter the verification token below.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Verification Token</Text>
            <TextInput
              style={styles.input}
              value={verificationToken}
              onChangeText={setVerificationToken}
              placeholder="Enter verification token"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={3}
            />
            <Text style={styles.hint}>
              Copy and paste the token from your email
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, (!verificationToken || isVerifying) && styles.buttonDisabled]}
            onPress={() => handleVerifyEmail()}
            disabled={!verificationToken || isVerifying}
          >
            {isVerifying ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Verify Email</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.resendSection}>
            <Text style={styles.resendTitle}>Didn't receive the email?</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email address"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
              />
            </View>

            <TouchableOpacity
              style={[styles.secondaryButton, (!email || isResending) && styles.buttonDisabled]}
              onPress={handleResendVerification}
              disabled={!email || isResending}
            >
              {isResending ? (
                <ActivityIndicator color="#007AFF" />
              ) : (
                <Text style={styles.secondaryButtonText}>Resend Verification Email</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={() => router.push('/auth')}>
              <Text style={styles.linkText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#007AFF',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#d1d5db',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#6b7280',
  },
  resendSection: {
    marginBottom: 24,
  },
  resendTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    marginTop: 16,
  },
  linkText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
});
