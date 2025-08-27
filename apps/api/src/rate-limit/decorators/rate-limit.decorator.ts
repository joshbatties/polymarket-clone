import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  name?: string;
  limit?: number;
  ttl?: number; // Time to live in milliseconds
  skipIf?: (context: any) => boolean;
  message?: string;
}

/**
 * Apply rate limiting to an endpoint
 */
export function RateLimit(options: RateLimitOptions = {}) {
  const decorators = [];
  
  // Set metadata for the custom throttler guard
  decorators.push(SetMetadata(RATE_LIMIT_KEY, options));
  
  // Apply NestJS throttler if limit and ttl are specified
  if (options.limit && options.ttl) {
    decorators.push(
      Throttle({
        [options.name || 'default']: {
          limit: options.limit,
          ttl: options.ttl,
        },
      })
    );
  }
  
  return applyDecorators(...decorators);
}

/**
 * Apply authentication rate limiting (5 attempts per 15 minutes)
 */
export const AuthRateLimit = () =>
  RateLimit({
    name: 'auth',
    limit: 5,
    ttl: 15 * 60 * 1000, // 15 minutes
    message: 'Too many authentication attempts. Please try again later.',
  });

/**
 * Apply deposit rate limiting (10 deposits per hour)
 */
export const DepositRateLimit = () =>
  RateLimit({
    name: 'deposit',
    limit: 10,
    ttl: 60 * 60 * 1000, // 1 hour
    message: 'Too many deposit requests. Please wait before making another deposit.',
  });

/**
 * Apply trading rate limiting (50 trades per minute)
 */
export const TradeRateLimit = () =>
  RateLimit({
    name: 'trade',
    limit: 50,
    ttl: 60 * 1000, // 1 minute
    message: 'Too many trade requests. Please wait before placing another trade.',
  });

/**
 * Apply withdrawal rate limiting (5 withdrawals per hour)
 */
export const WithdrawalRateLimit = () =>
  RateLimit({
    name: 'withdrawal',
    limit: 5,
    ttl: 60 * 60 * 1000, // 1 hour
    message: 'Too many withdrawal requests. Please wait before requesting another withdrawal.',
  });

/**
 * Apply strict rate limiting for sensitive operations
 */
export const StrictRateLimit = () =>
  RateLimit({
    name: 'strict',
    limit: 3,
    ttl: 10 * 60 * 1000, // 10 minutes
    message: 'Too many requests for this sensitive operation.',
  });

/**
 * Apply API rate limiting (100 requests per minute)
 */
export const ApiRateLimit = () =>
  RateLimit({
    name: 'api',
    limit: 100,
    ttl: 60 * 1000, // 1 minute
    message: 'API rate limit exceeded. Please reduce your request frequency.',
  });

/**
 * Skip rate limiting for certain conditions
 */
export const SkipRateLimitIf = (condition: (context: any) => boolean) =>
  RateLimit({
    skipIf: condition,
  });

/**
 * Apply admin rate limiting (higher limits for admin users)
 */
export const AdminRateLimit = () =>
  RateLimit({
    name: 'admin',
    limit: 500,
    ttl: 60 * 1000, // 1 minute
    message: 'Admin rate limit exceeded.',
  });
