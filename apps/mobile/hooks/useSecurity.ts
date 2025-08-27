import { useEffect, useState, useCallback } from 'react';
import { Alert, AppState } from 'react-native';
import SecurityManager, { SecurityStatus, SecurityEvent } from '../services/security/SecurityManager';

export interface UseSecurityOptions {
  autoInitialize?: boolean;
  showAlerts?: boolean;
  blockOnSecurity?: boolean;
}

export interface UseSecurityReturn {
  securityStatus: SecurityStatus | null;
  isSecurityInitialized: boolean;
  isLoading: boolean;
  securityEvents: SecurityEvent[];
  initializeSecurity: () => Promise<void>;
  performSecurityCheck: () => Promise<void>;
  setCurrentScreen: (screenName: string) => void;
  shouldBlockApp: boolean;
  error: string | null;
}

export const useSecurity = (options: UseSecurityOptions = {}): UseSecurityReturn => {
  const {
    autoInitialize = true,
    showAlerts = true,
    blockOnSecurity = !__DEV__,
  } = options;

  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);
  const [isSecurityInitialized, setIsSecurityInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [shouldBlockApp, setShouldBlockApp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const securityManager = SecurityManager.getInstance();

  /**
   * Initialize security services
   */
  const initializeSecurity = useCallback(async () => {
    if (isSecurityInitialized) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await securityManager.initialize();
      setIsSecurityInitialized(true);
      
      // Perform initial security check
      await performSecurityCheck();
      
      console.log('[useSecurity] Security initialization completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Security initialization failed';
      setError(errorMessage);
      console.error('[useSecurity] Security initialization failed:', error);
      
      if (showAlerts) {
        Alert.alert(
          'Security Warning',
          'App security initialization failed. Some features may be restricted.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSecurityInitialized, showAlerts]);

  /**
   * Perform security check
   */
  const performSecurityCheck = useCallback(async () => {
    if (!isSecurityInitialized) {
      return;
    }

    try {
      const status = await securityManager.performSecurityCheck();
      setSecurityStatus(status);
      
      const events = securityManager.getSecurityEvents();
      setSecurityEvents(events);
      
      const shouldBlock = securityManager.shouldBlockApp();
      setShouldBlockApp(shouldBlock && blockOnSecurity);

      // Handle security alerts
      if (showAlerts && status.overall === 'compromised') {
        Alert.alert(
          'Security Alert',
          'Device security may be compromised. Some features may be restricted.',
          [
            { text: 'Details', onPress: () => showSecurityDetails(status) },
            { text: 'Continue', style: 'cancel' },
          ]
        );
      }

      console.log('[useSecurity] Security check completed:', status.overall);
    } catch (error) {
      console.error('[useSecurity] Security check failed:', error);
      setError('Security check failed');
    }
  }, [isSecurityInitialized, showAlerts, blockOnSecurity]);

  /**
   * Show security details alert
   */
  const showSecurityDetails = (status: SecurityStatus) => {
    const details = [
      `Overall Status: ${status.overall}`,
      `Device Integrity: ${status.deviceIntegrity.status}`,
      `TLS Pinning: ${status.tlsPinning.enabled ? 'Enabled' : 'Disabled'}`,
      '',
      'Recommendations:',
      ...status.recommendations.map(rec => `• ${rec}`),
    ].join('\n');

    Alert.alert('Security Details', details, [{ text: 'OK' }]);
  };

  /**
   * Set current screen for protection
   */
  const setCurrentScreen = useCallback((screenName: string) => {
    if (isSecurityInitialized) {
      securityManager.setCurrentScreen(screenName);
    }
  }, [isSecurityInitialized]);

  /**
   * Handle app state changes
   */
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active' && isSecurityInitialized) {
        // Perform security check when app becomes active
        performSecurityCheck();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [isSecurityInitialized, performSecurityCheck]);

  /**
   * Auto-initialize security if enabled
   */
  useEffect(() => {
    if (autoInitialize && !isSecurityInitialized && !isLoading) {
      initializeSecurity();
    }
  }, [autoInitialize, isSecurityInitialized, isLoading, initializeSecurity]);

  /**
   * Periodic security checks
   */
  useEffect(() => {
    if (!isSecurityInitialized) {
      return;
    }

    // Perform security check every 5 minutes
    const interval = setInterval(() => {
      performSecurityCheck();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isSecurityInitialized, performSecurityCheck]);

  return {
    securityStatus,
    isSecurityInitialized,
    isLoading,
    securityEvents,
    initializeSecurity,
    performSecurityCheck,
    setCurrentScreen,
    shouldBlockApp,
    error,
  };
};

export default useSecurity;
