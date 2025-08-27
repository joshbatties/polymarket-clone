import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TelemetryService } from '../telemetry/telemetry.service';
import { StructuredLoggingService } from '../logging/logging.service';

interface MonitoredRequest extends Request {
  startTime?: number;
  userId?: string;
  requestId?: string;
}

@Injectable()
export class MonitoringMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MonitoringMiddleware.name);

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly loggingService: StructuredLoggingService,
  ) {}

  use(req: MonitoredRequest, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    req.startTime = startTime;
    req.requestId = this.generateRequestId();

    // Extract user info if available
    if (req.user) {
      req.userId = (req.user as any).id;
    }

    // Create span for request tracing (telemetry service removed)
    const span = {
      setTag: (...args: any[]) => {},
      setAttributes: (...args: any[]) => {},
      setStatus: (...args: any[]) => {},
      recordException: (...args: any[]) => {},
      end: (...args: any[]) => {},
      name: `${req.method} ${req.route?.path || req.path}`,
    };

    // Monitor response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      this.recordMetrics(req, res, duration);
      this.logRequest(req, res, duration);
      this.trackTelemetry(req, res, duration);
      
      if (span) {
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response_size': res.get('Content-Length'),
          'response.time_ms': duration,
        });
        
        if (res.statusCode >= 400) {
          span.setStatus({
            code: 2, // ERROR
            message: `HTTP ${res.statusCode}`,
          });
        }
        
        span.end();
      }
    });

    res.on('error', (error) => {
      if (span) {
        span.recordException(error);
        span.setStatus({
          code: 2, // ERROR
          message: error.message,
        });
        span.end();
      }
      
      this.logger.error(`Request error for ${req.method} ${req.url}:`, error);
    });

    next();
  }

  private recordMetrics(req: MonitoredRequest, res: Response, duration: number): void {
    try {
      // Record request duration
      // Telemetry service removed - using simple logging
      this.logger.debug(`Request completed: ${req.method} ${req.route?.path || req.path} - ${res.statusCode} (${duration}ms)`);

      // Record specific business metrics
      this.recordBusinessMetrics(req, res);
      
    } catch (error) {
      this.logger.error('Failed to record metrics:', error);
    }
  }

  private recordBusinessMetrics(req: MonitoredRequest, res: Response): void {
    const path = req.route?.path || req.path;
    const method = req.method;
    const userId = req.userId;

    // Authentication metrics
    if (path.includes('/auth/')) {
      const success = res.statusCode < 400;
      const authMethod = this.extractAuthMethod(path);
      // Telemetry service removed - using basic logging
      this.logger.debug(`Auth attempt: ${authMethod} - ${success ? 'success' : 'failure'} - user: ${userId}`);
    }

    // Webhook metrics
    if (path.includes('/webhooks/')) {
      if (res.statusCode >= 400) {
        const webhookType = this.extractWebhookType(path);
        // Telemetry service removed - using basic logging
        this.logger.warn(`Webhook failure: ${webhookType} - HTTP ${res.statusCode}`);
      }
    }

    // Trading metrics
    if (path.includes('/trades') && method === 'POST' && res.statusCode === 200) {
      // Extract trade info from response if available
      this.recordTradeMetrics(req, res);
    }
  }

  private recordTradeMetrics(req: MonitoredRequest, res: Response): void {
    try {
      // This would need to extract info from the response body
      // For now, we'll record basic trade occurrence
      const body = req.body;
      if (body && body.outcome && req.userId) {
        // We don't have access to the response body here, so we'll use a generic cost
        // Telemetry service removed - using basic logging
        this.logger.debug(`Trade executed: ${body.outcome} - $${(body.maxSpendCents || 1000) / 100} - user: ${req.userId} - market: ${req.params?.marketId || 'unknown'}`);
      }
    } catch (error) {
      this.logger.error('Failed to record trade metrics:', error);
    }
  }

  private logRequest(req: MonitoredRequest, res: Response, duration: number): void {
    try {
      const metadata = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime: duration,
        userAgent: req.get('User-Agent'),
        ipAddress: this.getClientIP(req),
        requestId: req.requestId,
        userId: req.userId,
        contentLength: res.get('Content-Length'),
      };

      this.loggingService.logApiRequest(metadata);
      
    } catch (error) {
      this.logger.error('Failed to log request:', error);
    }
  }

  private trackTelemetry(req: MonitoredRequest, res: Response, duration: number): void {
    try {
      // Set request context for error tracking
      this.telemetryService.setRequestContext(
        req.userId,
        req.requestId,
        this.getClientIP(req)
      );

      // Track performance metrics
      this.telemetryService.trackPerformance(`http_${req.method.toLowerCase()}`, duration, {
        method: req.method,
        path: req.route?.path || req.path,
        statusCode: res.statusCode,
        contentLength: res.get('Content-Length'),
        userAgent: req.get('User-Agent'),
      });

      // Track business metrics for errors
      if (res.statusCode >= 400) {
        this.telemetryService.trackBusinessMetric('http_errors', 1, {
          method: req.method,
          statusCode: res.statusCode.toString(),
          path: req.route?.path || req.path,
        });
      }

      // Track specific business events based on endpoints
      if (req.path.includes('/auth/login') && res.statusCode === 200) {
        this.telemetryService.trackUserEvent({
          event: 'user_login',
          userId: req.userId,
          properties: {
            userAgent: req.get('User-Agent'),
            ipAddress: this.getClientIP(req),
          },
        });
      }

      if (req.path.includes('/auth/register') && res.statusCode === 201) {
        this.telemetryService.trackUserEvent({
          event: 'user_registered',
          userId: req.userId,
          properties: {
            userAgent: req.get('User-Agent'),
            ipAddress: this.getClientIP(req),
          },
        });
      }

    } catch (error) {
      this.logger.error('Failed to track telemetry:', error);
    }
  }

  private extractAuthMethod(path: string): string {
    if (path.includes('/login')) return 'login';
    if (path.includes('/register')) return 'register';
    if (path.includes('/refresh')) return 'refresh';
    if (path.includes('/verify')) return 'verify';
    return 'unknown';
  }

  private extractWebhookType(path: string): string {
    if (path.includes('/stripe')) return 'stripe';
    if (path.includes('/kyc')) return 'kyc';
    return 'unknown';
  }

  private getClientIP(req: Request): string {
    const xForwardedFor = req.get('X-Forwarded-For');
    const xRealIp = req.get('X-Real-IP');
    const cfConnectingIp = req.get('CF-Connecting-IP');
    
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim();
    }
    
    if (xRealIp) {
      return xRealIp;
    }
    
    if (cfConnectingIp) {
      return cfConnectingIp;
    }
    
    return req.ip || req.connection?.remoteAddress || '127.0.0.1';
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Decorator to trace method execution
 */
export function Traced(operationName?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const className = target.constructor.name;
    const methodName = operationName || `${className}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      // Telemetry service removed - simple pass-through
      return method.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Decorator to monitor database operations
 */
export function MonitorDatabase(operation: string, table?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Telemetry service removed - simple pass-through with basic logging
      const startTime = Date.now();
      
      try {
        const result = await method.apply(this, args);
        const duration = Date.now() - startTime;
        
        // Simple debug logging instead of telemetry
        if (duration > 1000) { // Only log slow queries
          console.debug(`Slow DB operation: ${operation} on ${table} took ${duration}ms`);
        }
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`DB operation failed: ${operation} on ${table} (${duration}ms)`, error.message);
        throw error;
      }
    };

    return descriptor;
  };
}
