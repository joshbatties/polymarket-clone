import 'reflect-metadata';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import Redis from 'ioredis';

export interface RateLimitOptions {
  points: number; // Number of requests
  duration: number; // Time window in seconds
  keyGenerator?: (req: Request) => string;
  message?: string;
}

export const RATE_LIMIT_KEY = 'RATE_LIMIT_OPTIONS';

export const RateLimit = (options: RateLimitOptions) => {
  return (target: any, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(RATE_LIMIT_KEY, options, descriptor?.value || target);
    return descriptor;
  };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private redis: Redis | null = null;
  private memoryStore: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    // Try to connect to Redis, but don't fail if it's not available
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL');
      
      if (redisUrl) {
        // Use Railway/cloud Redis URL
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
      } else {
        // Use individual host/port config for local development
        this.redis = new Redis({
          host: this.configService.get('REDIS_HOST', 'localhost'),
          port: parseInt(this.configService.get('REDIS_PORT', '6379')),
          password: this.configService.get('REDIS_PASSWORD'),
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
      }

      // Test connection
      this.redis.ping().then(() => {
        this.logger.log('✅ Redis connected - using Redis for rate limiting');
      }).catch((error) => {
        this.logger.warn('⚠️ Redis unavailable - using in-memory rate limiting', error.message);
        this.redis = null;
      });
    } catch (error) {
      this.logger.warn('⚠️ Redis configuration failed - using in-memory rate limiting');
      this.redis = null;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    if (!options) {
      return true; // No rate limiting applied
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = options.keyGenerator ? 
      options.keyGenerator(request) : 
      this.getDefaultKey(request);

    try {
      const result = this.redis ? 
        await this.checkRateLimitRedis(key, options) :
        await this.checkRateLimitMemory(key, options);
      
      if (!result.allowed) {
        const message = options.message || 
          `Rate limit exceeded. Try again in ${result.resetTime} seconds.`;
        
        this.logger.warn(`Rate limit exceeded for key: ${key}`);
        
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message,
            retryAfter: result.resetTime,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Add rate limit headers to response
      const response = context.switchToHttp().getResponse();
      response.set({
        'X-RateLimit-Limit': options.points.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(Date.now() + result.resetTime * 1000).toISOString(),
      });

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Rate limit check failed for key ${key}:`, error);
      // On any failure, allow the request through
      return true;
    }
  }

  private async checkRateLimitRedis(
    key: string, 
    options: RateLimitOptions
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    if (!this.redis) {
      throw new Error('Redis not available');
    }

    const redisKey = `rate_limit:${key}`;
    const now = Date.now();
    const windowStart = now - (options.duration * 1000);

    // Use Redis Lua script for atomic operations
    const script = `
      local key = KEYS[1]
      local window = tonumber(ARGV[1])
      local limit = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local duration = tonumber(ARGV[4])
      
      -- Remove expired entries
      redis.call('zremrangebyscore', key, 0, window)
      
      -- Count current requests
      local current = redis.call('zcard', key)
      
      if current < limit then
        -- Add current request
        redis.call('zadd', key, now, now)
        redis.call('expire', key, duration)
        return {1, limit - current - 1, duration}
      else
        -- Get oldest request to calculate reset time
        local oldest = redis.call('zrange', key, 0, 0, 'WITHSCORES')
        local resetTime = 0
        if oldest[2] then
          resetTime = math.ceil((tonumber(oldest[2]) + duration * 1000 - now) / 1000)
        end
        return {0, 0, resetTime}
      end
    `;

    const result = await this.redis.eval(
      script,
      1,
      redisKey,
      windowStart.toString(),
      options.points.toString(),
      now.toString(),
      options.duration.toString(),
    ) as [number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetTime: result[2],
    };
  }

  private async checkRateLimitMemory(
    key: string,
    options: RateLimitOptions
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - (options.duration * 1000);
    
    // Clean expired entries
    this.memoryStore.forEach((value, storeKey) => {
      if (value.resetTime < now) {
        this.memoryStore.delete(storeKey);
      }
    });

    const existing = this.memoryStore.get(key);
    
    if (!existing || existing.resetTime < now) {
      // Create new window
      this.memoryStore.set(key, {
        count: 1,
        resetTime: now + (options.duration * 1000),
      });
      
      return {
        allowed: true,
        remaining: options.points - 1,
        resetTime: options.duration,
      };
    }

    if (existing.count < options.points) {
      // Increment count
      existing.count++;
      this.memoryStore.set(key, existing);
      
      return {
        allowed: true,
        remaining: options.points - existing.count,
        resetTime: Math.ceil((existing.resetTime - now) / 1000),
      };
    }

    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: Math.ceil((existing.resetTime - now) / 1000),
    };
  }

  private getDefaultKey(request: Request): string {
    const ip = request.ip || 
               request.connection.remoteAddress || 
               request.socket.remoteAddress;
    
    // Include user ID if authenticated
    const userId = (request as any).user?.id;
    
    return userId ? `user:${userId}` : `ip:${ip}`;
  }
}
