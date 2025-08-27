import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLoggingService } from '../logging/logging.service';

export interface ChaosConfig {
  enabled: boolean;
  failureRate: number; // 0-1, percentage of requests to fail
  latencyInjection: {
    enabled: boolean;
    minDelay: number; // milliseconds
    maxDelay: number; // milliseconds
    probability: number; // 0-1
  };
  databaseChaos: {
    enabled: boolean;
    connectionFailures: boolean;
    transactionFailures: boolean;
    timeouts: boolean;
  };
  networkChaos: {
    enabled: boolean;
    simulateTimeouts: boolean;
    simulateConnections: boolean;
  };
}

export interface ChaosEvent {
  type: 'latency' | 'failure' | 'timeout' | 'corruption';
  timestamp: Date;
  duration?: number;
  details: string;
  affected: string;
}

@Injectable()
export class ChaosTestingService {
  private readonly logger = new Logger(ChaosTestingService.name);
  private config: ChaosConfig;
  private events: ChaosEvent[] = [];
  private isEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly loggingService: StructuredLoggingService,
  ) {
    this.isEnabled = this.configService.get('NODE_ENV') === 'test' || 
                     this.configService.get('CHAOS_TESTING_ENABLED') === 'true';

    this.config = {
      enabled: this.isEnabled,
      failureRate: parseFloat(this.configService.get('CHAOS_FAILURE_RATE', '0.1')),
      latencyInjection: {
        enabled: true,
        minDelay: 100,
        maxDelay: 2000,
        probability: 0.2,
      },
      databaseChaos: {
        enabled: true,
        connectionFailures: true,
        transactionFailures: true,
        timeouts: true,
      },
      networkChaos: {
        enabled: true,
        simulateTimeouts: true,
        simulateConnections: true,
      },
    };
  }

  /**
   * Inject random latency to simulate network delays
   */
  async injectLatency(operation: string): Promise<void> {
    if (!this.shouldInjectChaos('latency')) {
      return;
    }

    const delay = this.getRandomDelay();
    const startTime = Date.now();

    this.logger.warn(`[Chaos] Injecting ${delay}ms latency for ${operation}`);

    await this.delay(delay);

    this.recordChaosEvent({
      type: 'latency',
      timestamp: new Date(startTime),
      duration: delay,
      details: `Injected ${delay}ms latency`,
      affected: operation,
    });
  }

  /**
   * Simulate random failures
   */
  async injectFailure(operation: string, errorType: 'network' | 'database' | 'service' = 'service'): Promise<void> {
    if (!this.shouldInjectChaos('failure')) {
      return;
    }

    this.recordChaosEvent({
      type: 'failure',
      timestamp: new Date(),
      details: `Simulated ${errorType} failure`,
      affected: operation,
    });

    const errors = {
      network: new Error('Simulated network failure'),
      database: new Error('Simulated database failure'),
      service: new Error('Simulated service failure'),
    };

    this.logger.error(`[Chaos] Injecting ${errorType} failure for ${operation}`);
    throw errors[errorType];
  }

  /**
   * Simulate database connection issues
   */
  async injectDatabaseChaos(operation: string): Promise<void> {
    if (!this.config.databaseChaos.enabled || !this.shouldInjectChaos('failure')) {
      return;
    }

    const chaosTypes = [
      'connection_timeout',
      'transaction_rollback',
      'deadlock',
      'constraint_violation',
    ];

    const chaosType = chaosTypes[Math.floor(Math.random() * chaosTypes.length)];

    this.recordChaosEvent({
      type: 'failure',
      timestamp: new Date(),
      details: `Database chaos: ${chaosType}`,
      affected: operation,
    });

    this.logger.error(`[Chaos] Injecting database chaos (${chaosType}) for ${operation}`);

    switch (chaosType) {
      case 'connection_timeout':
        throw new Error('Database connection timeout');
      case 'transaction_rollback':
        throw new Error('Transaction was rolled back');
      case 'deadlock':
        throw new Error('Deadlock detected');
      case 'constraint_violation':
        throw new Error('Constraint violation');
    }
  }

  /**
   * Simulate network timeouts
   */
  async injectNetworkTimeout(operation: string): Promise<void> {
    if (!this.config.networkChaos.enabled || !this.shouldInjectChaos('timeout')) {
      return;
    }

    this.recordChaosEvent({
      type: 'timeout',
      timestamp: new Date(),
      details: 'Simulated network timeout',
      affected: operation,
    });

    this.logger.error(`[Chaos] Injecting network timeout for ${operation}`);

    // Simulate timeout by waiting longer than typical timeout threshold
    await this.delay(30000);
    throw new Error('Network timeout');
  }

  /**
   * Corrupt data to test error handling
   */
  async injectDataCorruption(data: any, operation: string): Promise<any> {
    if (!this.shouldInjectChaos('corruption')) {
      return data;
    }

    this.recordChaosEvent({
      type: 'corruption',
      timestamp: new Date(),
      details: 'Injected data corruption',
      affected: operation,
    });

    this.logger.warn(`[Chaos] Injecting data corruption for ${operation}`);

    // Various corruption strategies
    const corruptionTypes = [
      'missing_field',
      'wrong_type',
      'invalid_value',
      'extra_field',
      'null_value',
    ];

    const corruption = corruptionTypes[Math.floor(Math.random() * corruptionTypes.length)];

    switch (corruption) {
      case 'missing_field':
        // Remove a random field
        if (typeof data === 'object' && data !== null) {
          const keys = Object.keys(data);
          if (keys.length > 0) {
            const keyToRemove = keys[Math.floor(Math.random() * keys.length)];
            const corrupted = { ...data };
            delete corrupted[keyToRemove];
            return corrupted;
          }
        }
        break;

      case 'wrong_type':
        // Change a field to wrong type
        if (typeof data === 'object' && data !== null) {
          const keys = Object.keys(data);
          if (keys.length > 0) {
            const keyToCorrupt = keys[Math.floor(Math.random() * keys.length)];
            return {
              ...data,
              [keyToCorrupt]: 'corrupted_string_value',
            };
          }
        }
        break;

      case 'invalid_value':
        // Set invalid values
        if (typeof data === 'object' && data !== null) {
          return {
            ...data,
            amount: -999999, // Invalid negative amount
            currency: 'INVALID_CURRENCY',
            id: '', // Empty ID
          };
        }
        break;

      case 'extra_field':
        // Add unexpected fields
        if (typeof data === 'object' && data !== null) {
          return {
            ...data,
            maliciousScript: '<script>alert("xss")</script>',
            sqlInjection: "'; DROP TABLE users; --",
          };
        }
        break;

      case 'null_value':
        // Set required fields to null
        if (typeof data === 'object' && data !== null) {
          const keys = Object.keys(data);
          if (keys.length > 0) {
            const keyToNullify = keys[Math.floor(Math.random() * keys.length)];
            return {
              ...data,
              [keyToNullify]: null,
            };
          }
        }
        break;
    }

    return data;
  }

  /**
   * Test webhook duplicate delivery scenarios
   */
  async simulateDuplicateDelivery(
    webhookHandler: (payload: any) => Promise<any>,
    payload: any,
    duplicateCount: number = 3,
  ): Promise<any[]> {
    this.logger.warn(`[Chaos] Simulating ${duplicateCount} duplicate webhook deliveries`);

    const promises = Array(duplicateCount).fill(null).map(async (_, index) => {
      try {
        // Add slight delays to simulate real-world timing
        if (index > 0) {
          await this.delay(Math.random() * 1000);
        }
        
        return await webhookHandler(payload);
      } catch (error) {
        return { error: error.message, index };
      }
    });

    const results = await Promise.allSettled(promises);
    
    this.recordChaosEvent({
      type: 'corruption',
      timestamp: new Date(),
      details: `Simulated ${duplicateCount} duplicate deliveries`,
      affected: 'webhook_handler',
    });

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : result.reason
    );
  }

  /**
   * Test out-of-order event delivery
   */
  async simulateOutOfOrderEvents(
    webhookHandler: (payload: any) => Promise<any>,
    payloads: any[],
  ): Promise<any[]> {
    this.logger.warn(`[Chaos] Simulating out-of-order event delivery for ${payloads.length} events`);

    // Shuffle the payloads to simulate out-of-order delivery
    const shuffledPayloads = [...payloads].sort(() => Math.random() - 0.5);

    const promises = shuffledPayloads.map(async (payload, index) => {
      try {
        // Add random delays
        await this.delay(Math.random() * 2000);
        return await webhookHandler(payload);
      } catch (error) {
        return { error: error.message, payload: payload.id };
      }
    });

    const results = await Promise.all(promises);

    this.recordChaosEvent({
      type: 'corruption',
      timestamp: new Date(),
      details: `Simulated out-of-order delivery for ${payloads.length} events`,
      affected: 'webhook_handler',
    });

    return results;
  }

  /**
   * Simulate partial failures in batch operations
   */
  async simulatePartialFailures<T>(
    operations: (() => Promise<T>)[],
    failureRate: number = 0.3,
  ): Promise<Array<T | Error>> {
    this.logger.warn(`[Chaos] Simulating partial failures with ${failureRate * 100}% failure rate`);

    const results = await Promise.allSettled(
      operations.map(async (operation, index) => {
        if (Math.random() < failureRate) {
          this.logger.error(`[Chaos] Simulating failure for operation ${index}`);
          throw new Error(`Simulated failure for operation ${index}`);
        }
        return operation();
      })
    );

    this.recordChaosEvent({
      type: 'failure',
      timestamp: new Date(),
      details: `Simulated partial failures (${failureRate * 100}% rate) for ${operations.length} operations`,
      affected: 'batch_operations',
    });

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : new Error(result.reason)
    );
  }

  /**
   * Test idempotency under chaos conditions
   */
  async testIdempotencyWithChaos(
    operation: (idempotencyKey: string) => Promise<any>,
    idempotencyKey: string,
    attempts: number = 5,
  ): Promise<{
    results: any[];
    allIdentical: boolean;
    errors: Error[];
  }> {
    this.logger.warn(`[Chaos] Testing idempotency with chaos for ${attempts} attempts`);

    const results: any[] = [];
    const errors: Error[] = [];

    for (let i = 0; i < attempts; i++) {
      try {
        // Inject various chaos scenarios
        await this.injectLatency(`idempotency_test_${i}`);
        
        if (Math.random() < 0.3) {
          await this.injectDatabaseChaos(`idempotency_test_${i}`);
        }

        const result = await operation(idempotencyKey);
        results.push(result);
      } catch (error) {
        errors.push(error);
        
        // Retry after chaos-induced failure
        try {
          const retryResult = await operation(idempotencyKey);
          results.push(retryResult);
        } catch (retryError) {
          errors.push(retryError);
        }
      }
    }

    // Check if all successful results are identical
    const successfulResults = results.filter(r => r !== null && r !== undefined);
    const allIdentical = successfulResults.length > 1 && 
      successfulResults.every(result => 
        JSON.stringify(result) === JSON.stringify(successfulResults[0])
      );

    this.recordChaosEvent({
      type: 'corruption',
      timestamp: new Date(),
      details: `Idempotency test: ${successfulResults.length} successful, ${errors.length} errors, identical: ${allIdentical}`,
      affected: 'idempotency_system',
    });

    return {
      results: successfulResults,
      allIdentical,
      errors,
    };
  }

  /**
   * Get chaos testing statistics
   */
  getChaosStatistics(): {
    eventsCount: number;
    eventsByType: Record<string, number>;
    recentEvents: ChaosEvent[];
    config: ChaosConfig;
  } {
    const eventsByType = this.events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const recentEvents = this.events
      .filter(event => Date.now() - event.timestamp.getTime() < 3600000) // Last hour
      .slice(-20); // Last 20 events

    return {
      eventsCount: this.events.length,
      eventsByType,
      recentEvents,
      config: this.config,
    };
  }

  /**
   * Clear chaos events history
   */
  clearChaosHistory(): void {
    this.events = [];
    this.logger.log('[Chaos] Cleared chaos events history');
  }

  /**
   * Enable/disable chaos testing
   */
  setChaosEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.logger.log(`[Chaos] Chaos testing ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update chaos configuration
   */
  updateConfig(updates: Partial<ChaosConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.log('[Chaos] Configuration updated', updates);
  }

  // Private helper methods

  private shouldInjectChaos(type: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    return Math.random() < this.config.failureRate;
  }

  private getRandomDelay(): number {
    const { minDelay, maxDelay } = this.config.latencyInjection;
    return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private recordChaosEvent(event: ChaosEvent): void {
    this.events.push(event);
    
    // Keep only last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }

    // Log to structured logging
    this.loggingService.logSecurityEvent({
      event: 'chaos_testing',
      outcome: 'success',
      metadata: event,
    });
  }
}

export default ChaosTestingService;
