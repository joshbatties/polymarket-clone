import { Platform, NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import DeviceInfo from 'react-native-device-info';

export interface RootDetectionResult {
  isRooted: boolean;
  isJailbroken: boolean;
  detectionMethods: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

class RootDetectionService {
  private static instance: RootDetectionService;
  
  // Known root/jailbreak indicators
  private readonly rootIndicators = {
    android: {
      files: [
        '/system/app/Superuser.apk',
        '/sbin/su',
        '/system/bin/su',
        '/system/xbin/su',
        '/data/local/xbin/su',
        '/data/local/bin/su',
        '/system/sd/xbin/su',
        '/system/bin/failsafe/su',
        '/data/local/su',
        '/su/bin/su',
        '/system/xbin/daemonsu',
        '/system/etc/init.d/99SuperSUDaemon',
        '/dev/com.koushikdutta.superuser.daemon/',
        '/system/app/Kinguser.apk',
        '/system/app/KingUser.apk',
        '/cache/su',
        '/data/su',
        '/dev/su',
      ],
      packages: [
        'com.noshufou.android.su',
        'com.noshufou.android.su.elite',
        'eu.chainfire.supersu',
        'com.koushikdutta.superuser',
        'com.thirdparty.superuser',
        'com.yellowes.su',
        'com.topjohnwu.magisk',
        'com.kingroot.kinguser',
        'com.kingo.root',
        'com.smmarya.rootgenius',
        'com.ramdroid.appquarantine',
        'com.devadvance.rootcloak',
        'com.devadvance.rootcloakplus',
        'de.robv.android.xposed.installer',
        'com.saurik.substrate',
        'com.zachspong.temprootremovejb',
        'com.amphoras.hidemyroot',
        'com.amphoras.hidemyrootadfree',
        'com.formyhm.hidemyroot',
        'me.phh.superuser',
        'eu.chainfire.supersu.pro',
        'com.kingouser.com',
      ],
      buildTags: ['test-keys'],
    },
    ios: {
      files: [
        '/Applications/Cydia.app',
        '/Library/MobileSubstrate/MobileSubstrate.dylib',
        '/bin/bash',
        '/usr/sbin/sshd',
        '/etc/apt',
        '/private/var/lib/apt/',
        '/private/var/lib/cydia',
        '/private/var/mobile/Library/SBSettings/Themes',
        '/Library/MobileSubstrate/DynamicLibraries/LiveClock.plist',
        '/usr/libexec/ssh-keysign',
        '/var/cache/apt',
        '/var/lib/cydia',
        '/var/log/syslog',
        '/bin/sh',
        '/etc/ssh/sshd_config',
        '/usr/libexec/sftp-server',
        '/usr/bin/ssh',
        '/Library/MobileSubstrate/DynamicLibraries/Veency.plist',
        '/private/var/lib/apt',
        '/Applications/FakeCarrier.app',
        '/Applications/Icy.app',
        '/Applications/IntelliScreen.app',
        '/Applications/MxTube.app',
        '/Applications/RockApp.app',
        '/Applications/SBSettings.app',
        '/Applications/WinterBoard.app',
        '/Applications/blackra1n.app',
      ],
      urlSchemes: [
        'cydia://',
        'undecimus://',
        'sileo://',
        'zbra://',
        'filza://',
        'activator://',
      ],
    },
  };

  private constructor() {}

  public static getInstance(): RootDetectionService {
    if (!RootDetectionService.instance) {
      RootDetectionService.instance = new RootDetectionService();
    }
    return RootDetectionService.instance;
  }

  /**
   * Perform comprehensive root/jailbreak detection
   */
  public async detectRootJailbreak(): Promise<RootDetectionResult> {
    const detectionMethods: string[] = [];
    let isRooted = false;
    let isJailbroken = false;

    try {
      if (Platform.OS === 'android') {
        const androidResult = await this.detectAndroidRoot();
        isRooted = androidResult.isDetected;
        detectionMethods.push(...androidResult.methods);
      } else if (Platform.OS === 'ios') {
        const iosResult = await this.detectiOSJailbreak();
        isJailbroken = iosResult.isDetected;
        detectionMethods.push(...iosResult.methods);
      }

      const riskLevel = this.calculateRiskLevel(detectionMethods);
      const recommendations = this.getRecommendations(isRooted || isJailbroken);

      return {
        isRooted,
        isJailbroken,
        detectionMethods,
        riskLevel,
        recommendations,
      };
    } catch (error) {
      console.error('[Security] Root/Jailbreak detection failed:', error);
      return {
        isRooted: false,
        isJailbroken: false,
        detectionMethods: ['detection_failed'],
        riskLevel: 'medium',
        recommendations: ['Unable to verify device security'],
      };
    }
  }

  /**
   * Detect Android root
   */
  private async detectAndroidRoot(): Promise<{ isDetected: boolean; methods: string[] }> {
    const methods: string[] = [];
    let isDetected = false;

    try {
      // Check for root management apps
      const hasRootApps = await this.checkForRootApps();
      if (hasRootApps) {
        methods.push('root_management_apps');
        isDetected = true;
      }

      // Check for su binary
      const hasSuBinary = await this.checkForSuBinary();
      if (hasSuBinary) {
        methods.push('su_binary');
        isDetected = true;
      }

      // Check build tags
      const hasSuspiciousBuildTags = await this.checkBuildTags();
      if (hasSuspiciousBuildTags) {
        methods.push('suspicious_build_tags');
        isDetected = true;
      }

      // Check for Magisk (modern root method)
      const hasMagisk = await this.checkForMagisk();
      if (hasMagisk) {
        methods.push('magisk_detected');
        isDetected = true;
      }

      // Check system properties
      const hasSuspiciousProps = await this.checkSystemProperties();
      if (hasSuspiciousProps) {
        methods.push('suspicious_system_properties');
        isDetected = true;
      }

    } catch (error) {
      console.error('[Security] Android root detection error:', error);
      methods.push('detection_error');
    }

    return { isDetected, methods };
  }

  /**
   * Detect iOS jailbreak
   */
  private async detectiOSJailbreak(): Promise<{ isDetected: boolean; methods: string[] }> {
    const methods: string[] = [];
    let isDetected = false;

    try {
      // Check for jailbreak files
      const hasJailbreakFiles = await this.checkForJailbreakFiles();
      if (hasJailbreakFiles) {
        methods.push('jailbreak_files');
        isDetected = true;
      }

      // Check for Cydia and other jailbreak apps
      const hasJailbreakApps = await this.checkForJailbreakApps();
      if (hasJailbreakApps) {
        methods.push('jailbreak_applications');
        isDetected = true;
      }

      // Check URL schemes
      const hasJailbreakSchemes = await this.checkJailbreakUrlSchemes();
      if (hasJailbreakSchemes) {
        methods.push('jailbreak_url_schemes');
        isDetected = true;
      }

      // Check sandbox integrity
      const sandboxCompromised = await this.checkSandboxIntegrity();
      if (sandboxCompromised) {
        methods.push('sandbox_compromised');
        isDetected = true;
      }

      // Check for dynamic library injection
      const hasDylibInjection = await this.checkDynamicLibraryInjection();
      if (hasDylibInjection) {
        methods.push('dylib_injection');
        isDetected = true;
      }

    } catch (error) {
      console.error('[Security] iOS jailbreak detection error:', error);
      methods.push('detection_error');
    }

    return { isDetected, methods };
  }

  /**
   * Check for root management applications
   */
  private async checkForRootApps(): Promise<boolean> {
    try {
      // This would typically be implemented at the native level
      // For React Native, we can check if we can execute certain commands
      
      const deviceInfo = await DeviceInfo.getSystemName();
      
      // Check for known root app package names
      for (const packageName of this.rootIndicators.android.packages) {
        try {
          // This is a simplified check - in a real implementation,
          // you'd use native modules to check installed packages
          const result = await this.checkPackageExists(packageName);
          if (result) {
            return true;
          }
        } catch (error) {
          // Continue checking other packages
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for su binary existence
   */
  private async checkForSuBinary(): Promise<boolean> {
    try {
      for (const path of this.rootIndicators.android.files) {
        try {
          const exists = await RNFS.exists(path);
          if (exists) {
            return true;
          }
        } catch (error) {
          // File system access might be restricted, continue checking
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check build tags for test-keys
   */
  private async checkBuildTags(): Promise<boolean> {
    try {
      const buildTags = await DeviceInfo.getBuildId();
      return this.rootIndicators.android.buildTags.some(tag => 
        buildTags.toLowerCase().includes(tag)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for Magisk installation
   */
  private async checkForMagisk(): Promise<boolean> {
    try {
      // Check for Magisk-specific files and properties
      const magiskPaths = [
        '/sbin/.magisk',
        '/system/framework/libmagisk.so',
        '/cache/.magisk',
      ];

      for (const path of magiskPaths) {
        try {
          const exists = await RNFS.exists(path);
          if (exists) {
            return true;
          }
        } catch (error) {
          // Continue checking
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check system properties for suspicious values
   */
  private async checkSystemProperties(): Promise<boolean> {
    try {
      // This would typically require native implementation
      // For now, we'll do basic checks available through React Native
      
      const isEmulator = await DeviceInfo.isEmulator();
      const deviceId = await DeviceInfo.getUniqueId();
      
      // Generic emulator/test device indicators
      if (isEmulator || deviceId === 'unknown') {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for jailbreak files on iOS
   */
  private async checkForJailbreakFiles(): Promise<boolean> {
    try {
      for (const path of this.rootIndicators.ios.files) {
        try {
          const exists = await RNFS.exists(path);
          if (exists) {
            return true;
          }
        } catch (error) {
          // iOS restricts file system access, but errors might indicate restrictions
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for jailbreak applications
   */
  private async checkForJailbreakApps(): Promise<boolean> {
    try {
      // On iOS, we can't directly check installed apps
      // But we can try to open known jailbreak app URL schemes
      return await this.checkJailbreakUrlSchemes();
    } catch (error) {
      return false;
    }
  }

  /**
   * Check jailbreak URL schemes
   */
  private async checkJailbreakUrlSchemes(): Promise<boolean> {
    try {
      // This would require native implementation to actually test URL schemes
      // For now, we'll return false as a placeholder
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check sandbox integrity
   */
  private async checkSandboxIntegrity(): Promise<boolean> {
    try {
      // Try to write to locations outside the app sandbox
      const testPaths = [
        '/private/var/mobile/test.txt',
        '/usr/bin/test.txt',
        '/private/test.txt',
      ];

      for (const path of testPaths) {
        try {
          await RNFS.writeFile(path, 'test', 'utf8');
          // If we can write, sandbox might be compromised
          await RNFS.unlink(path); // Clean up
          return true;
        } catch (error) {
          // Expected behavior - sandbox is working
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for dynamic library injection
   */
  private async checkDynamicLibraryInjection(): Promise<boolean> {
    try {
      // This would typically require native implementation
      // For now, return false as placeholder
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Helper method to check if package exists (simplified)
   */
  private async checkPackageExists(packageName: string): Promise<boolean> {
    // This is a placeholder - actual implementation would require native modules
    return false;
  }

  /**
   * Calculate risk level based on detection methods
   */
  private calculateRiskLevel(methods: string[]): 'low' | 'medium' | 'high' {
    if (methods.length === 0) {
      return 'low';
    }

    const highRiskMethods = [
      'root_management_apps',
      'su_binary',
      'jailbreak_applications',
      'sandbox_compromised',
      'dylib_injection',
    ];

    if (methods.some(method => highRiskMethods.includes(method))) {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Get security recommendations
   */
  private getRecommendations(isCompromised: boolean): string[] {
    if (!isCompromised) {
      return ['Device appears secure'];
    }

    return [
      'Device security may be compromised',
      'Consider using a secure, unmodified device',
      'Some app features may be restricted',
      'Ensure you trust all installed applications',
    ];
  }
}

export default RootDetectionService;
