import TLSPinningService from './TLSPinningService';
import RootDetectionService, { RootDetectionResult } from './RootDetectionService';
import ScreenProtectionService from './ScreenProtectionService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

export interface SecurityStatus {
  overall: 'secure' | 'warning' | 'compromised';
  tlsPinning: {
    enabled: boolean;
    status: 'ok' | 'warning' | 'error';
  };
  deviceIntegrity: {
    status: 'secure' | 'compromised';
    rootDetection: RootDetectionResult;
  };
  screenProtection: {
    enabled: boolean;
    active: boolean;
  };
  lastCheck: Date;
  recommendations: string[];
}

export interface SecurityEvent {
  type: 'root_detected' | 'jailbreak_detected' | 'tls_pinning_failed' | 'screenshot_detected' | 'debug_detected';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata?: any;
  timestamp: Date;
}

export interface SecurityPolicy {
  blockOnRootDetection: boolean;
  blockOnJailbreakDetection: boolean;
  enforceStrictTLS: boolean;
  enableScreenProtection: boolean;
  logSecurityEvents: boolean;
  requireSecureEnvironment: boolean;
}

class SecurityManager {
  private static instance: SecurityManager;
  private isInitialized = false;
  private tlsPinningService: TLSPinningService;
  private rootDetectionService: RootDetectionService;
  private screenProtectionService: ScreenProtectionService;
  private securityPolicy: SecurityPolicy;
  private securityEvents: SecurityEvent[] = [];
  private lastSecurityCheck: Date | null = null;

  private constructor() {
    this.tlsPinningService = TLSPinningService.getInstance();
    this.rootDetectionService = RootDetectionService.getInstance();
    this.screenProtectionService = ScreenProtectionService.getInstance();

    // Default security policy
    this.securityPolicy = {
      blockOnRootDetection: !__DEV__, // More lenient in development
      blockOnJailbreakDetection: !__DEV__,
      enforceStrictTLS: true,
      enableScreenProtection: true,
      logSecurityEvents: true,
      requireSecureEnvironment: !__DEV__,
    };
  }

  public static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager();
    }
    return SecurityManager.instance;
  }

  /**
   * Initialize all security services
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('[SecurityManager] Initializing security services...');

      // Initialize TLS pinning
      await this.tlsPinningService.initialize();

      // Initialize screen protection
      this.screenProtectionService.initialize();

      // Load security policy from storage
      await this.loadSecurityPolicy();

      // Perform initial security check
      await this.performSecurityCheck();

      this.isInitialized = true;
      console.log('[SecurityManager] Security initialization completed');
    } catch (error) {
      console.error('[SecurityManager] Security initialization failed:', error);
      
      // Log security event
      this.logSecurityEvent({
        type: 'debug_detected',
        severity: 'high',
        description: 'Security initialization failed',
        metadata: { error: error.message },
      });

      throw error;
    }
  }

  /**
   * Perform comprehensive security check
   */
  public async performSecurityCheck(): Promise<SecurityStatus> {
    try {
      console.log('[SecurityManager] Performing security check...');

      // Check TLS pinning
      const tlsStatus = await this.checkTLSPinningStatus();

      // Check device integrity
      const rootDetectionResult = await this.rootDetectionService.detectRootJailbreak();
      
      // Check screen protection
      const screenProtectionState = this.screenProtectionService.getState();

      // Determine overall security status
      const overall = this.calculateOverallStatus(tlsStatus, rootDetectionResult, screenProtectionState);

      // Generate recommendations
      const recommendations = this.generateRecommendations(rootDetectionResult, tlsStatus);

      const securityStatus: SecurityStatus = {
        overall,
        tlsPinning: tlsStatus,
        deviceIntegrity: {
          status: rootDetectionResult.isRooted || rootDetectionResult.isJailbroken ? 'compromised' : 'secure',
          rootDetection: rootDetectionResult,
        },
        screenProtection: {
          enabled: this.securityPolicy.enableScreenProtection,
          active: screenProtectionState.protectionActive,
        },
        lastCheck: new Date(),
        recommendations,
      };

      this.lastSecurityCheck = new Date();

      // Handle security policy violations
      await this.handleSecurityViolations(securityStatus);

      return securityStatus;
    } catch (error) {
      console.error('[SecurityManager] Security check failed:', error);
      
      return {
        overall: 'warning',
        tlsPinning: { enabled: false, status: 'error' },
        deviceIntegrity: { status: 'secure', rootDetection: this.getDefaultRootDetectionResult() },
        screenProtection: { enabled: false, active: false },
        lastCheck: new Date(),
        recommendations: ['Security check failed - please restart the app'],
      };
    }
  }

  /**
   * Check TLS pinning status
   */
  private async checkTLSPinningStatus(): Promise<{ enabled: boolean; status: 'ok' | 'warning' | 'error' }> {
    try {
      const securityConfig = this.tlsPinningService.getSecurityConfig();
      const securityEnvironment = await this.tlsPinningService.isSecureEnvironment();

      if (!securityConfig.tlsPinning.enabled) {
        return { enabled: false, status: 'warning' };
      }

      if (securityEnvironment.errors.length > 0) {
        return { enabled: true, status: 'error' };
      }

      if (securityEnvironment.warnings.length > 0) {
        return { enabled: true, status: 'warning' };
      }

      return { enabled: true, status: 'ok' };
    } catch (error) {
      return { enabled: false, status: 'error' };
    }
  }

  /**
   * Calculate overall security status
   */
  private calculateOverallStatus(
    tlsStatus: any,
    rootDetection: RootDetectionResult,
    screenProtection: any
  ): 'secure' | 'warning' | 'compromised' {
    // If device is rooted/jailbroken, it's compromised
    if (rootDetection.isRooted || rootDetection.isJailbroken) {
      return 'compromised';
    }

    // If TLS pinning has errors, it's a warning
    if (tlsStatus.status === 'error') {
      return 'warning';
    }

    // If any warnings exist, overall status is warning
    if (tlsStatus.status === 'warning' || rootDetection.riskLevel === 'medium') {
      return 'warning';
    }

    return 'secure';
  }

  /**
   * Generate security recommendations
   */
  private generateRecommendations(
    rootDetection: RootDetectionResult,
    tlsStatus: any
  ): string[] {
    const recommendations: string[] = [];

    if (rootDetection.isRooted || rootDetection.isJailbroken) {
      recommendations.push(...rootDetection.recommendations);
    }

    if (tlsStatus.status === 'error') {
      recommendations.push('Network security verification failed');
    }

    if (tlsStatus.status === 'warning') {
      recommendations.push('Network security has warnings');
    }

    if (recommendations.length === 0) {
      recommendations.push('Device security is optimal');
    }

    return recommendations;
  }

  /**
   * Handle security policy violations
   */
  private async handleSecurityViolations(status: SecurityStatus): Promise<void> {
    // Log security events
    if (status.deviceIntegrity.rootDetection.isRooted && this.securityPolicy.blockOnRootDetection) {
      this.logSecurityEvent({
        type: 'root_detected',
        severity: 'critical',
        description: 'Root access detected on device',
        metadata: status.deviceIntegrity.rootDetection,
      });
    }

    if (status.deviceIntegrity.rootDetection.isJailbroken && this.securityPolicy.blockOnJailbreakDetection) {
      this.logSecurityEvent({
        type: 'jailbreak_detected',
        severity: 'critical',
        description: 'Jailbreak detected on device',
        metadata: status.deviceIntegrity.rootDetection,
      });
    }

    // In production, implement blocking logic based on policy
    if (this.securityPolicy.requireSecureEnvironment && status.overall === 'compromised') {
      await this.handleCompromisedDevice(status);
    }
  }

  /**
   * Handle compromised device detection
   */
  private async handleCompromisedDevice(status: SecurityStatus): Promise<void> {
    console.warn('[SecurityManager] Compromised device detected');
    
    // In production, you might:
    // 1. Show security warning to user
    // 2. Restrict app functionality
    // 3. Log security event to backend
    // 4. Require additional authentication
    
    // For now, just log the event
    this.logSecurityEvent({
      type: 'root_detected',
      severity: 'critical',
      description: 'Device security compromised - app functionality may be restricted',
      metadata: status,
    });
  }

  /**
   * Log security event
   */
  private logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.securityEvents.push(securityEvent);
    
    console.log('[SecurityEvent]', securityEvent);

    // Keep only last 100 events
    if (this.securityEvents.length > 100) {
      this.securityEvents = this.securityEvents.slice(-100);
    }

    // In production, send to security monitoring service
    if (this.securityPolicy.logSecurityEvents) {
      this.sendSecurityEventToBackend(securityEvent);
    }
  }

  /**
   * Send security event to backend (placeholder)
   */
  private async sendSecurityEventToBackend(event: SecurityEvent): Promise<void> {
    try {
      // This would send the security event to your backend for monitoring
      console.log('[SecurityManager] Security event logged:', event.type);
    } catch (error) {
      console.error('[SecurityManager] Failed to send security event:', error);
    }
  }

  /**
   * Update security policy
   */
  public async updateSecurityPolicy(updates: Partial<SecurityPolicy>): Promise<void> {
    this.securityPolicy = {
      ...this.securityPolicy,
      ...updates,
    };

    await this.saveSecurityPolicy();
    console.log('[SecurityManager] Security policy updated');
  }

  /**
   * Load security policy from storage
   */
  private async loadSecurityPolicy(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('security_policy');
      if (stored) {
        this.securityPolicy = {
          ...this.securityPolicy,
          ...JSON.parse(stored),
        };
      }
    } catch (error) {
      console.error('[SecurityManager] Failed to load security policy:', error);
    }
  }

  /**
   * Save security policy to storage
   */
  private async saveSecurityPolicy(): Promise<void> {
    try {
      await AsyncStorage.setItem('security_policy', JSON.stringify(this.securityPolicy));
    } catch (error) {
      console.error('[SecurityManager] Failed to save security policy:', error);
    }
  }

  /**
   * Get security events
   */
  public getSecurityEvents(): SecurityEvent[] {
    return [...this.securityEvents];
  }

  /**
   * Get security policy
   */
  public getSecurityPolicy(): SecurityPolicy {
    return { ...this.securityPolicy };
  }

  /**
   * Set current screen for protection
   */
  public setCurrentScreen(screenName: string): void {
    this.screenProtectionService.setCurrentScreen(screenName);
  }

  /**
   * Get screen protection overlay
   */
  public getScreenProtectionOverlay(): React.ReactElement | null {
    return this.screenProtectionService.getSecurityOverlay();
  }

  /**
   * Check if app should be blocked due to security issues
   */
  public shouldBlockApp(): boolean {
    if (!this.lastSecurityCheck) {
      return false; // Don't block if we haven't checked yet
    }

    // Check if we have critical security violations
    const recentCriticalEvents = this.securityEvents.filter(event => 
      event.severity === 'critical' && 
      (Date.now() - event.timestamp.getTime()) < 5 * 60 * 1000 // Last 5 minutes
    );

    return recentCriticalEvents.length > 0 && this.securityPolicy.requireSecureEnvironment;
  }

  /**
   * Get device fingerprint for security monitoring
   */
  public async getDeviceFingerprint(): Promise<string> {
    try {
      const deviceId = await DeviceInfo.getUniqueId();
      const deviceModel = await DeviceInfo.getModel();
      const systemVersion = await DeviceInfo.getSystemVersion();
      const appVersion = await DeviceInfo.getVersion();

      return `${deviceId}-${deviceModel}-${systemVersion}-${appVersion}`;
    } catch (error) {
      console.error('[SecurityManager] Failed to generate device fingerprint:', error);
      return 'unknown';
    }
  }

  /**
   * Default root detection result for fallback
   */
  private getDefaultRootDetectionResult(): RootDetectionResult {
    return {
      isRooted: false,
      isJailbroken: false,
      detectionMethods: [],
      riskLevel: 'low',
      recommendations: ['Device appears secure'],
    };
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.screenProtectionService.destroy();
    this.securityEvents = [];
    this.isInitialized = false;
    console.log('[SecurityManager] Security manager destroyed');
  }
}

export default SecurityManager;
