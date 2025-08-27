import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface RateLimitInfo {
  key: string;
  limit: number;
  remaining: number;
  resetTime: Date;
  blocked: boolean;
}

export interface RateLimitConfig {
  name: string;
  limit: number;
  window: number; // in seconds
  blockDuration?: number; // in seconds, optional
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis: Redis;
  private readonly keyPrefix = 'rate_limit:';

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    
    this.redis = redisUrl 
      ? new Redis(redisUrl)
      : new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB || '0'),
        });
  }

  /**
   * Check if a key is rate limited
   */
  async checkRateLimit(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitInfo> {
    const key = this.getRedisKey(identifier, config.name);
    
    try {
      // Use Redis sliding window algorithm
      const now = Date.now();
      const windowStart = now - (config.window * 1000);
      
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      
      // Remove old entries
      pipeline.zremrangebyscore(key, 0, windowStart);
      
      // Count current entries
      pipeline.zcard(key);
      
      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiration
      pipeline.expire(key, config.window);
      
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Pipeline execution failed');
      }
      
      const currentCount = (results[1][1] as number) || 0;
      const remaining = Math.max(0, config.limit - currentCount - 1);
      const blocked = currentCount >= config.limit;
      
      // If blocked and block duration is specified, set a block key
      if (blocked && config.blockDuration) {
        await this.setBlockKey(identifier, config.name, config.blockDuration);
      }
      
      return {
        key: identifier,
        limit: config.limit,
        remaining,
        resetTime: new Date(now + (config.window * 1000)),
        blocked,
      };
    } catch (error) {
      this.logger.error(`Rate limit check failed for ${identifier}:`, error);
      
      // Return permissive response on error
      return {
        key: identifier,
        limit: config.limit,
        remaining: config.limit,
        resetTime: new Date(Date.now() + (config.window * 1000)),
        blocked: false,
      };
    }
  }

  /**
   * Check if a key is currently blocked
   */
  async isBlocked(identifier: string, configName: string): Promise<boolean> {
    try {
      const blockKey = this.getBlockKey(identifier, configName);
      const exists = await this.redis.exists(blockKey);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Block check failed for ${identifier}:`, error);
      return false;
    }
  }

  /**
   * Manually block a key for a specific duration
   */
  async blockKey(
    identifier: string, 
    configName: string, 
    durationSeconds: number,
    reason?: string
  ): Promise<void> {
    try {
      await this.setBlockKey(identifier, configName, durationSeconds);
      
      this.logger.warn(
        `Manually blocked ${identifier} for ${durationSeconds}s`,
        { reason, configName }
      );
    } catch (error) {
      this.logger.error(`Failed to block ${identifier}:`, error);
    }
  }

  /**
   * Unblock a key
   */
  async unblockKey(identifier: string, configName: string): Promise<void> {
    try {
      const blockKey = this.getBlockKey(identifier, configName);
      await this.redis.del(blockKey);
      
      this.logger.log(`Unblocked ${identifier} for ${configName}`);
    } catch (error) {
      this.logger.error(`Failed to unblock ${identifier}:`, error);
    }
  }

  /**
   * Get current rate limit status without incrementing
   */
  async getRateLimitStatus(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitInfo> {
    const key = this.getRedisKey(identifier, config.name);
    
    try {
      const now = Date.now();
      const windowStart = now - (config.window * 1000);
      
      // Remove old entries and count current ones
      await this.redis.zremrangebyscore(key, 0, windowStart);
      const currentCount = await this.redis.zcard(key);
      
      const remaining = Math.max(0, config.limit - currentCount);
      const blocked = await this.isBlocked(identifier, config.name);
      
      return {
        key: identifier,
        limit: config.limit,
        remaining,
        resetTime: new Date(now + (config.window * 1000)),
        blocked,
      };
    } catch (error) {
      this.logger.error(`Rate limit status check failed for ${identifier}:`, error);
      
      return {
        key: identifier,
        limit: config.limit,
        remaining: config.limit,
        resetTime: new Date(Date.now() + (config.window * 1000)),
        blocked: false,
      };
    }
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetRateLimit(identifier: string, configName: string): Promise<void> {
    try {
      const key = this.getRedisKey(identifier, configName);
      const blockKey = this.getBlockKey(identifier, configName);
      
      await this.redis.del(key);
      await this.redis.del(blockKey);
      
      this.logger.log(`Reset rate limit for ${identifier}:${configName}`);
    } catch (error) {
      this.logger.error(`Failed to reset rate limit for ${identifier}:`, error);
    }
  }

  /**
   * Get rate limit statistics
   */
  async getRateLimitStats(configName: string): Promise<{
    totalKeys: number;
    blockedKeys: number;
    topOffenders: Array<{ key: string; count: number }>;
  }> {
    try {
      const pattern = `${this.keyPrefix}*:${configName}`;
      const keys = await this.redis.keys(pattern);
      
      const blockPattern = `${this.keyPrefix}block:*:${configName}`;
      const blockedKeys = await this.redis.keys(blockPattern);
      
      // Get top offenders (keys with highest counts)
      const topOffenders: Array<{ key: string; count: number }> = [];
      
      for (const key of keys.slice(0, 10)) { // Limit to top 10
        const count = await this.redis.zcard(key);
        if (count > 0) {
          const identifier = key.replace(`${this.keyPrefix}`, '').replace(`:${configName}`, '');
          topOffenders.push({ key: identifier, count });
        }
      }
      
      topOffenders.sort((a, b) => b.count - a.count);
      
      return {
        totalKeys: keys.length,
        blockedKeys: blockedKeys.length,
        topOffenders: topOffenders.slice(0, 5),
      };
    } catch (error) {
      this.logger.error(`Failed to get rate limit stats for ${configName}:`, error);
      return {
        totalKeys: 0,
        blockedKeys: 0,
        topOffenders: [],
      };
    }
  }

  private getRedisKey(identifier: string, configName: string): string {
    return `${this.keyPrefix}${identifier}:${configName}`;
  }

  private getBlockKey(identifier: string, configName: string): string {
    return `${this.keyPrefix}block:${identifier}:${configName}`;
  }

  private async setBlockKey(
    identifier: string, 
    configName: string, 
    durationSeconds: number
  ): Promise<void> {
    const blockKey = this.getBlockKey(identifier, configName);
    await this.redis.setex(blockKey, durationSeconds, '1');
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
