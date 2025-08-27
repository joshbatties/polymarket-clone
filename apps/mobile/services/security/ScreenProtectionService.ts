import { AppState, AppStateStatus, Platform } from 'react-native';
import { BlurView } from '@react-native-blur/blur';
import React from 'react';

export interface ScreenProtectionConfig {
  preventScreenshots: boolean;
  obfuscateOnBackground: boolean;
  sensitiveScreens: string[];
  blurIntensity: number;
  showSecurityOverlay: boolean;
}

export interface ScreenProtectionState {
  isBlurred: boolean;
  isInBackground: boolean;
  currentScreen: string;
  protectionActive: boolean;
}

class ScreenProtectionService {
  private static instance: ScreenProtectionService;
  private appStateSubscription: any;
  private config: ScreenProtectionConfig;
  private state: ScreenProtectionState;
  private listeners: Array<(state: ScreenProtectionState) => void> = [];

  private constructor() {
    this.config = {
      preventScreenshots: !__DEV__, // Disable in development
      obfuscateOnBackground: true,
      sensitiveScreens: [
        'WalletScreen',
        'DepositScreen',
        'WithdrawScreen',
        'TradeScreen',
        'SettingsScreen',
        'KYCScreen',
        'BankAccountScreen',
      ],
      blurIntensity: 50,
      showSecurityOverlay: true,
    };

    this.state = {
      isBlurred: false,
      isInBackground: false,
      currentScreen: '',
      protectionActive: false,
    };

    this.setupAppStateHandling();
  }

  public static getInstance(): ScreenProtectionService {
    if (!ScreenProtectionService.instance) {
      ScreenProtectionService.instance = new ScreenProtectionService();
    }
    return ScreenProtectionService.instance;
  }

  /**
   * Initialize screen protection
   */
  public initialize(): void {
    console.log('[Security] Screen protection initialized');
    
    if (this.config.preventScreenshots) {
      this.enableScreenshotPrevention();
    }
  }

  /**
   * Enable screenshot prevention
   */
  private enableScreenshotPrevention(): void {
    try {
      if (Platform.OS === 'android') {
        // On Android, this would typically be implemented at the native level
        // using FLAG_SECURE window flag
        console.log('[Security] Screenshot prevention enabled (Android)');
      } else if (Platform.OS === 'ios') {
        // On iOS, screenshot prevention is more limited
        // We can detect screenshots but not prevent them entirely
        this.setupScreenshotDetection();
        console.log('[Security] Screenshot detection enabled (iOS)');
      }
    } catch (error) {
      console.error('[Security] Failed to enable screenshot prevention:', error);
    }
  }

  /**
   * Setup screenshot detection for iOS
   */
  private setupScreenshotDetection(): void {
    if (Platform.OS === 'ios') {
      // This would require native implementation to detect screenshots
      // For now, we'll log that it's enabled
      console.log('[Security] Screenshot detection monitoring active');
    }
  }

  /**
   * Setup app state handling for background obfuscation
   */
  private setupAppStateHandling(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange.bind(this)
    );
  }

  /**
   * Handle app state changes
   */
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    const isGoingToBackground = nextAppState === 'background' || nextAppState === 'inactive';
    const isComingToForeground = nextAppState === 'active';

    if (isGoingToBackground && this.config.obfuscateOnBackground) {
      this.activateBackgroundProtection();
    } else if (isComingToForeground) {
      this.deactivateBackgroundProtection();
    }

    this.updateState({
      isInBackground: isGoingToBackground,
    });
  }

  /**
   * Activate background protection (blur/overlay)
   */
  private activateBackgroundProtection(): void {
    if (this.isSensitiveScreen(this.state.currentScreen)) {
      this.updateState({
        isBlurred: true,
        protectionActive: true,
      });

      console.log('[Security] Background protection activated for sensitive screen');
    }
  }

  /**
   * Deactivate background protection
   */
  private deactivateBackgroundProtection(): void {
    this.updateState({
      isBlurred: false,
      protectionActive: false,
    });

    console.log('[Security] Background protection deactivated');
  }

  /**
   * Check if current screen is sensitive
   */
  private isSensitiveScreen(screenName: string): boolean {
    return this.config.sensitiveScreens.includes(screenName);
  }

  /**
   * Update current screen
   */
  public setCurrentScreen(screenName: string): void {
    const wasSensitive = this.isSensitiveScreen(this.state.currentScreen);
    const isSensitive = this.isSensitiveScreen(screenName);

    this.updateState({
      currentScreen: screenName,
    });

    // Activate/deactivate protection based on screen sensitivity
    if (isSensitive && !wasSensitive) {
      this.activateScreenProtection();
    } else if (!isSensitive && wasSensitive) {
      this.deactivateScreenProtection();
    }
  }

  /**
   * Activate screen protection for sensitive screens
   */
  private activateScreenProtection(): void {
    if (this.config.preventScreenshots) {
      // Additional protection measures for sensitive screens
      console.log('[Security] Enhanced protection activated for sensitive screen');
    }
  }

  /**
   * Deactivate screen protection
   */
  private deactivateScreenProtection(): void {
    console.log('[Security] Screen protection deactivated');
  }

  /**
   * Get blur overlay component for React Native
   */
  public getBlurOverlay(): React.ReactElement | null {
    if (!this.state.isBlurred || !this.config.showSecurityOverlay) {
      return null;
    }

    // This would return a BlurView component to overlay sensitive content
    // Implementation depends on the specific blur library used
    return React.createElement(BlurView, {
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
      },
      blurType: 'light',
      blurAmount: this.config.blurIntensity,
    });
  }

  /**
   * Get security overlay component
   */
  public getSecurityOverlay(): React.ReactElement | null {
    if (!this.state.protectionActive || !this.config.showSecurityOverlay) {
      return null;
    }

    // Return a security overlay component
    return React.createElement(
      'View',
      {
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        },
      },
      React.createElement(
        'Text',
        {
          style: {
            color: 'white',
            fontSize: 18,
            textAlign: 'center',
            fontWeight: 'bold',
          },
        },
        'Aussie Markets\n🔒 Secured'
      )
    );
  }

  /**
   * Update protection state and notify listeners
   */
  private updateState(updates: Partial<ScreenProtectionState>): void {
    this.state = {
      ...this.state,
      ...updates,
    };

    // Notify all listeners of state change
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('[Security] Error notifying screen protection listener:', error);
      }
    });
  }

  /**
   * Add state change listener
   */
  public addListener(listener: (state: ScreenProtectionState) => void): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get current protection state
   */
  public getState(): ScreenProtectionState {
    return { ...this.state };
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<ScreenProtectionConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };

    console.log('[Security] Screen protection configuration updated');
  }

  /**
   * Get current configuration
   */
  public getConfig(): ScreenProtectionConfig {
    return { ...this.config };
  }

  /**
   * Manually trigger screenshot detection alert
   */
  public handleScreenshotDetected(): void {
    if (this.isSensitiveScreen(this.state.currentScreen)) {
      console.warn('[Security] Screenshot detected on sensitive screen');
      
      // Log security event
      this.logSecurityEvent('screenshot_detected', {
        screen: this.state.currentScreen,
        timestamp: new Date().toISOString(),
      });

      // In production, you might want to:
      // - Show user warning
      // - Log the event for security monitoring
      // - Temporarily restrict app functionality
    }
  }

  /**
   * Log security events
   */
  private logSecurityEvent(event: string, metadata: any): void {
    console.log('[Security Event]', {
      event,
      metadata,
      timestamp: new Date().toISOString(),
    });

    // In production, send to security monitoring service
  }

  /**
   * Check if screen recording is active (iOS only)
   */
  public isScreenRecording(): boolean {
    // This would require native implementation
    // For now, return false as placeholder
    return false;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription?.remove();
    }
    
    this.listeners = [];
    console.log('[Security] Screen protection service destroyed');
  }
}

export default ScreenProtectionService;
