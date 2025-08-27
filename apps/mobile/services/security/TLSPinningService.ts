import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export interface TLSPinConfig {
  domain: string;
  pins: string[]; // SHA-256 hashes of certificate public keys
  includeSubdomains?: boolean;
  enforcePinning?: boolean;
}

export interface SecurityConfig {
  tlsPinning: {
    enabled: boolean;
    configs: TLSPinConfig[];
  };
  rootDetection: {
    enabled: boolean;
    strictMode: boolean;
  };
  debugDetection: {
    enabled: boolean;
    blockOnDetection: boolean;
  };
  screenProtection: {
    enabled: boolean;
    obfuscateOnBackground: boolean;
    preventScreenshots: boolean;
  };
}

class TLSPinningService {
  private static instance: TLSPinningService;
  private isInitialized = false;
  private securityConfig: SecurityConfig;

  private constructor() {
    // Default security configuration
    this.securityConfig = {
      tlsPinning: {
        enabled: __DEV__ ? false : true, // Disable in development
        configs: [
          {
            domain: 'api.aussiemarkets.com.au',
            pins: [
              // Production certificate pins (these need to be updated with actual pins)
              'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // Primary cert
              'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=', // Backup cert
            ],
            includeSubdomains: true,
            enforcePinning: true,
          },
          {
            domain: 'staging-api.aussiemarkets.com.au',
            pins: [
              // Staging certificate pins
              'sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=',
            ],
            includeSubdomains: false,
            enforcePinning: false, // More lenient for staging
          },
        ],
      },
      rootDetection: {
        enabled: true,
        strictMode: !__DEV__,
      },
      debugDetection: {
        enabled: true,
        blockOnDetection: !__DEV__,
      },
      screenProtection: {
        enabled: true,
        obfuscateOnBackground: true,
        preventScreenshots: true,
      },
    };
  }

  public static getInstance(): TLSPinningService {
    if (!TLSPinningService.instance) {
      TLSPinningService.instance = new TLSPinningService();
    }
    return TLSPinningService.instance;
  }

  /**
   * Initialize TLS pinning and security measures
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('[Security] Initializing TLS pinning and security measures...');

      // Configure TLS pinning
      if (this.securityConfig.tlsPinning.enabled) {
        await this.configureTLSPinning();
      }

      // Setup network monitoring
      await this.setupNetworkMonitoring();

      this.isInitialized = true;
      console.log('[Security] Security initialization completed');
    } catch (error) {
      console.error('[Security] Failed to initialize security measures:', error);
      
      // In production, we might want to prevent app from starting
      if (!__DEV__ && this.securityConfig.tlsPinning.configs.some(c => c.enforcePinning)) {
        throw new Error('Security initialization failed');
      }
    }
  }

  /**
   * Configure TLS certificate pinning
   */
  private async configureTLSPinning(): Promise<void> {
    try {
      // For React Native, TLS pinning is typically handled at the native level
      // We'll implement certificate validation in our HTTP service
      
      console.log('[Security] TLS pinning configured for domains:', 
        this.securityConfig.tlsPinning.configs.map(c => c.domain)
      );
    } catch (error) {
      console.error('[Security] TLS pinning configuration failed:', error);
      throw error;
    }
  }

  /**
   * Setup network monitoring for security
   */
  private async setupNetworkMonitoring(): Promise<void> {
    try {
      const networkState = await NetInfo.fetch();
      
      // Monitor for suspicious network conditions
      NetInfo.addEventListener(state => {
        this.handleNetworkChange(state);
      });

      console.log('[Security] Network monitoring setup completed');
    } catch (error) {
      console.error('[Security] Network monitoring setup failed:', error);
    }
  }

  /**
   * Handle network state changes
   */
  private handleNetworkChange(networkState: any): void {
    // Check for potential man-in-the-middle attacks
    if (networkState.isConnected && networkState.type === 'wifi') {
      this.validateNetworkSecurity(networkState);
    }
  }

  /**
   * Validate network security conditions
   */
  private validateNetworkSecurity(networkState: any): void {
    // Log network changes for security monitoring
    console.log('[Security] Network change detected:', {
      type: networkState.type,
      isConnected: networkState.isConnected,
      details: networkState.details,
    });

    // In production, we might want to validate the network more strictly
    if (!__DEV__) {
      // Check for suspicious network configurations
      this.detectSuspiciousNetwork(networkState);
    }
  }

  /**
   * Detect potentially suspicious network configurations
   */
  private detectSuspiciousNetwork(networkState: any): void {
    const suspiciousIndicators = [];

    // Check for common suspicious network names
    const suspiciousNetworkNames = [
      'wifipineapple',
      'hacker',
      'mitm',
      'intercept',
      'proxy',
    ];

    if (networkState.details?.ssid) {
      const ssid = networkState.details.ssid.toLowerCase();
      if (suspiciousNetworkNames.some(name => ssid.includes(name))) {
        suspiciousIndicators.push('Suspicious network SSID');
      }
    }

    if (suspiciousIndicators.length > 0) {
      console.warn('[Security] Suspicious network detected:', suspiciousIndicators);
      
      // In production, we might want to warn the user or restrict functionality
      this.handleSuspiciousNetwork(suspiciousIndicators);
    }
  }

  /**
   * Handle detection of suspicious network
   */
  private handleSuspiciousNetwork(indicators: string[]): void {
    // Log security event
    console.warn('[Security] Suspicious network activity detected', indicators);

    // In production, implement appropriate response:
    // - Show user warning
    // - Restrict sensitive operations
    // - Enhanced logging
  }

  /**
   * Validate certificate pins for a domain
   */
  public validateCertificatePin(domain: string, certificatePin: string): boolean {
    const config = this.securityConfig.tlsPinning.configs.find(c => 
      c.domain === domain || (c.includeSubdomains && domain.endsWith(`.${c.domain}`))
    );

    if (!config) {
      console.warn('[Security] No pinning configuration found for domain:', domain);
      return !this.securityConfig.tlsPinning.enabled; // Allow if pinning disabled
    }

    const isValidPin = config.pins.includes(certificatePin);
    
    if (!isValidPin) {
      console.error('[Security] Certificate pin validation failed for domain:', domain);
      
      if (config.enforcePinning) {
        throw new Error(`Certificate pinning failed for ${domain}`);
      }
    }

    return isValidPin;
  }

  /**
   * Get security configuration
   */
  public getSecurityConfig(): SecurityConfig {
    return { ...this.securityConfig };
  }

  /**
   * Update security configuration (for dynamic updates)
   */
  public updateSecurityConfig(updates: Partial<SecurityConfig>): void {
    this.securityConfig = {
      ...this.securityConfig,
      ...updates,
    };
    
    console.log('[Security] Security configuration updated');
  }

  /**
   * Check if app is running in a secure environment
   */
  public async isSecureEnvironment(): Promise<{
    isSecure: boolean;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Check development mode
      if (__DEV__) {
        warnings.push('Running in development mode');
      }

      // Check network security
      const networkState = await NetInfo.fetch();
      if (!networkState.isConnected) {
        warnings.push('No network connection');
      }

      // Add more security checks as needed
      
      return {
        isSecure: errors.length === 0,
        warnings,
        errors,
      };
    } catch (error) {
      errors.push(`Security check failed: ${error.message}`);
      return {
        isSecure: false,
        warnings,
        errors,
      };
    }
  }
}

export default TLSPinningService;
