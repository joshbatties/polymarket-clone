import { Injectable, Logger, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SecurityLogData {
  event: string;
  userId?: string;
  userEmail?: string; // Only log email hash for security
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  outcome: 'success' | 'failure' | 'blocked';
  metadata?: Record<string, any>;
  timestamp?: Date;
}

export interface AuditLogData {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Date;
}

@Injectable()
export class StructuredLoggingService implements LoggerService {
  private readonly logger = new Logger(StructuredLoggingService.name);
  private readonly environment: string;
  private readonly logLevel: string;
  private readonly redactFields = [
    'password',
    'passwordHash',
    'email', // Only log email hash
    'documentNumber',
    'fullName', // PII
    'address',
    'phoneNumber',
    'accountNumber',
    'bsb',
    'token',
    'secret',
    'key',
  ];

  constructor(private readonly configService: ConfigService) {
    this.environment = this.configService.get<string>('NODE_ENV', 'development');
    this.logLevel = this.configService.get<string>('LOG_LEVEL', 'info');
  }

  /**
   * Log security events with structured format
   */
  logSecurityEvent(data: SecurityLogData): void {
    const sanitizedData = this.sanitizeLogData({
      ...data,
      timestamp: data.timestamp || new Date(),
      environment: this.environment,
      logType: 'security',
    });

    switch (data.outcome) {
      case 'success':
        this.logger.log(JSON.stringify(sanitizedData));
        break;
      case 'failure':
        this.logger.warn(JSON.stringify(sanitizedData));
        break;
      case 'blocked':
        this.logger.error(JSON.stringify(sanitizedData));
        break;
    }
  }

  /**
   * Log audit events for compliance
   */
  logAuditEvent(data: AuditLogData): void {
    const sanitizedData = this.sanitizeLogData({
      ...data,
      timestamp: data.timestamp || new Date(),
      environment: this.environment,
      logType: 'audit',
    });

    this.logger.log(JSON.stringify(sanitizedData));
  }

  /**
   * Log API requests (without PII)
   */
  logApiRequest(data: {
    method: string;
    url: string;
    statusCode: number;
    responseTime: number;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): void {
    const sanitizedData = this.sanitizeLogData({
      ...data,
      timestamp: new Date(),
      environment: this.environment,
      logType: 'api',
    });

    if (data.statusCode >= 400) {
      this.logger.warn(JSON.stringify(sanitizedData));
    } else {
      this.logger.log(JSON.stringify(sanitizedData));
    }
  }

  /**
   * Log business events (trading, payments, etc.)
   */
  logBusinessEvent(data: {
    event: string;
    userId?: string;
    amount?: number;
    currency?: string;
    marketId?: string;
    outcome?: string;
    metadata?: Record<string, any>;
  }): void {
    const sanitizedData = this.sanitizeLogData({
      ...data,
      timestamp: new Date(),
      environment: this.environment,
      logType: 'business',
    });

    this.logger.log(JSON.stringify(sanitizedData));
  }

  /**
   * Log errors with context
   */
  logError(error: Error, context?: Record<string, any>): void {
    const sanitizedData = this.sanitizeLogData({
      error: {
        name: error.name,
        message: error.message,
        stack: this.environment === 'development' ? error.stack : undefined,
      },
      context: context || {},
      timestamp: new Date(),
      environment: this.environment,
      logType: 'error',
    });

    this.logger.error(JSON.stringify(sanitizedData));
  }

  /**
   * Standard Logger interface methods
   */
  log(message: any, context?: string): any {
    return this.logger.log(message, context);
  }

  error(message: any, trace?: string, context?: string): any {
    return this.logger.error(message, trace, context);
  }

  warn(message: any, context?: string): any {
    return this.logger.warn(message, context);
  }

  debug(message: any, context?: string): any {
    return this.logger.debug(message, context);
  }

  verbose(message: any, context?: string): any {
    return this.logger.verbose(message, context);
  }

  /**
   * Remove PII and sensitive data from logs
   */
  private sanitizeLogData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeLogData(item));
    }

    const sanitized: any = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      // Redact sensitive fields
      if (this.redactFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Special handling for email - hash it
      if (lowerKey === 'email' && typeof value === 'string') {
        sanitized[key + 'Hash'] = this.hashEmail(value);
        continue;
      }

      // Recursively sanitize nested objects
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeLogData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Hash email for logging purposes (preserves some identification without PII)
   */
  private hashEmail(email: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(email).digest('hex').substring(0, 16);
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'log', 'debug', 'verbose'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex <= currentLevelIndex;
  }

  /**
   * Get request metadata for logging
   */
  static getRequestMetadata(request: any): {
    ipAddress: string;
    userAgent: string;
    userId?: string;
  } {
    return {
      ipAddress: this.getClientIP(request),
      userAgent: request.get('User-Agent') || 'unknown',
      userId: request.user?.id,
    };
  }

  /**
   * Extract client IP address from request
   */
  private static getClientIP(request: any): string {
    const xForwardedFor = request.get('X-Forwarded-For');
    const xRealIp = request.get('X-Real-IP');
    const cfConnectingIp = request.get('CF-Connecting-IP');
    
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim();
    }
    
    if (xRealIp) {
      return xRealIp;
    }
    
    if (cfConnectingIp) {
      return cfConnectingIp;
    }
    
    return request.ip || request.connection?.remoteAddress || '127.0.0.1';
  }
}
