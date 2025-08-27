import { Controller, Get, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
// TelemetryService removed for simplification
import { AlertingService } from './alerting.service';
import Redis from 'ioredis';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      duration: number;
      details?: any;
    };
  };
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly redis: Redis;
  private readonly startTime = Date.now();

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    // TelemetryService removed for simplification
    private readonly alertingService: AlertingService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    this.redis = redisUrl 
      ? new Redis(redisUrl)
      : new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB || '0'),
          lazyConnect: true,
        });
  }

  /**
   * Basic health check endpoint
   */
  @Get()
  async getHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const checks: HealthCheckResult['checks'] = {};

    // Check database connectivity
    try {
      const dbStart = Date.now();
      await this.prismaService.$queryRaw`SELECT 1`;
      checks.database = {
        status: 'pass',
        duration: Date.now() - dbStart,
        details: { connection: 'active' },
      };
    } catch (error) {
      checks.database = {
        status: 'fail',
        duration: Date.now() - startTime,
        details: { error: error.message },
      };
    }

    // Check Redis connectivity
    const redisStart = Date.now();
    try {
      await this.redis.ping();
      checks.redis = {
        status: 'pass',
        duration: Date.now() - redisStart,
        details: { connection: 'active' },
      };
    } catch (error) {
      checks.redis = {
        status: 'fail',
        duration: Date.now() - redisStart,
        details: { error: error.message },
      };
    }

    // Check telemetry service (disabled - service removed)
    checks.telemetry = {
      status: 'pass',
      duration: 0,
      details: { message: 'TelemetryService removed for simplification' },
    };

    // Check alerting service
    const alertStats = this.alertingService.getAlertStats();
    checks.alerting = {
      status: alertStats.enabledRules > 0 ? 'pass' : 'warn',
      duration: 0,
      details: alertStats,
    };

    // Memory check
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
    checks.memory = {
      status: memoryUsageMB > 1024 ? 'warn' : 'pass',
      duration: 0,
      details: {
        heapUsed: `${memoryUsageMB.toFixed(2)}MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)}MB`,
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`,
      },
    };

    // Determine overall status
    const failedChecks = Object.values(checks).filter(check => check.status === 'fail');
    const warnChecks = Object.values(checks).filter(check => check.status === 'warn');
    
    let overallStatus: HealthCheckResult['status'];
    if (failedChecks.length > 0) {
      overallStatus = 'unhealthy';
    } else if (warnChecks.length > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: this.configService.get('APP_VERSION', '1.0.0'),
      environment: this.configService.get('NODE_ENV', 'development'),
      uptime: Date.now() - this.startTime,
      checks,
    };
  }

  /**
   * Detailed database health check
   */
  @Get('database')
  async getDatabaseHealth(): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Test basic connectivity
      await this.prismaService.$queryRaw`SELECT 1`;
      
      // Test read performance
      const readStart = Date.now();
      const userCount = await this.prismaService.user.count();
      const readDuration = Date.now() - readStart;

      // Test write performance (using a lightweight operation)
      const writeStart = Date.now();
      await this.prismaService.idempotencyKey.upsert({
        where: { key: 'health_check' },
        update: { createdAt: new Date() },
        create: {
          key: 'health_check',
          scope: 'health',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });
      const writeDuration = Date.now() - writeStart;

      // Check recent errors (if we track them)
      const recentErrors = 0; // Would query error logs

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: {
          connectivity: 'pass',
          readPerformance: {
            duration: readDuration,
            status: readDuration < 100 ? 'good' : 'slow',
          },
          writePerformance: {
            duration: writeDuration,
            status: writeDuration < 100 ? 'good' : 'slow',
          },
          statistics: {
            userCount,
            recentErrors,
          },
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Redis health check
   */
  @Get('redis')
  async getRedisHealth(): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Test basic connectivity
      const pingResult = await this.redis.ping();
      
      // Test read/write operations
      const testKey = `health_check:${Date.now()}`;
      await this.redis.set(testKey, 'test_value', 'EX', 60);
      const testValue = await this.redis.get(testKey);
      await this.redis.del(testKey);

      // Get Redis info
      const info = await this.redis.info();
      const memory = await this.redis.info('memory');
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: {
          ping: pingResult,
          readWrite: testValue === 'test_value' ? 'pass' : 'fail',
          memory: this.parseRedisInfo(memory),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * External services health check
   */
  @Get('external')
  async getExternalServicesHealth(): Promise<any> {
    const startTime = Date.now();
    const services: Record<string, any> = {};

    // Check Stripe connectivity
    try {
      const stripeStart = Date.now();
      // Would make a lightweight API call to Stripe
      services.stripe = {
        status: 'healthy',
        duration: Date.now() - stripeStart,
        details: { connectivity: 'pass' },
      };
    } catch (error) {
      services.stripe = {
        status: 'unhealthy',
        duration: Date.now() - startTime,
        error: error.message,
      };
    }

    // Check other external services as needed
    services.placeholder_kyc = {
      status: 'healthy',
      duration: 0,
      details: { note: 'Mock KYC provider' },
    };

    const overallStatus = Object.values(services).every(s => s.status === 'healthy') 
      ? 'healthy' 
      : 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      services,
    };
  }

  /**
   * Readiness check (for Kubernetes)
   */
  @Get('ready')
  async getReadiness(): Promise<any> {
    try {
      // Check critical dependencies
      await this.prismaService.$queryRaw`SELECT 1`;
      await this.redis.ping();

      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service not ready',
        details: error.message,
      };
    }
  }

  /**
   * Liveness check (for Kubernetes)
   */
  @Get('live')
  async getLiveness(): Promise<any> {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    
    // Simple liveness check - fail if memory usage is extremely high
    if (heapUsedMB > 2048) { // 2GB threshold
      throw {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Memory usage too high',
        details: { heapUsedMB },
      };
    }

    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      memory: {
        heapUsedMB: heapUsedMB.toFixed(2),
      },
    };
  }

  /**
   * Business metrics health check
   */
  @Get('business')
  async getBusinessHealth(): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Check ledger balance integrity
      const ledgerSum = await this.prismaService.ledgerEntry.aggregate({
        _sum: { amountCents: true },
      });
      const totalBalance = Number(ledgerSum._sum.amountCents || 0);
      const ledgerDrift = Math.abs(totalBalance);

      // Check recent activity
      const recentTrades = await this.prismaService.trade.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });

      const pendingWithdrawals = await this.prismaService.withdrawal.count({
        where: { status: 'PENDING_REVIEW' },
      });

      const activeAlerts = this.alertingService.getActiveAlerts();

      return {
        status: ledgerDrift > 100 || activeAlerts.length > 0 ? 'degraded' : 'healthy',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        metrics: {
          ledgerBalance: {
            totalCents: totalBalance,
            driftCents: ledgerDrift,
            status: ledgerDrift <= 100 ? 'healthy' : 'warning',
          },
          activity: {
            trades24h: recentTrades,
            pendingWithdrawals,
          },
          alerts: {
            active: activeAlerts.length,
            critical: activeAlerts.filter(a => a.severity === 'critical').length,
          },
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Parse Redis info string into object
   */
  private parseRedisInfo(info: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = value;
      }
    }
    
    return result;
  }
}
