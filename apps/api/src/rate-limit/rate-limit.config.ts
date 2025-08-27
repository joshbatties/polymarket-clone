import { RateLimitOptions } from './rate-limit.guard';

// Predefined rate limit configurations
export const RateLimitConfigs = {
  // Authentication endpoints - stricter limits
  AUTH_LOGIN: {
    points: 5, // 5 attempts
    duration: 900, // per 15 minutes
    message: 'Too many login attempts. Please try again in 15 minutes.',
  } as RateLimitOptions,

  AUTH_REGISTER: {
    points: 3, // 3 registrations  
    duration: 3600, // per hour
    message: 'Too many registration attempts. Please try again in 1 hour.',
  } as RateLimitOptions,

  AUTH_REFRESH: {
    points: 10, // 10 refreshes
    duration: 300, // per 5 minutes  
    message: 'Too many token refresh attempts. Please try again in 5 minutes.',
  } as RateLimitOptions,

  // Trading endpoints - moderate limits
  TRADING_EXECUTE: {
    points: 20, // 20 trades
    duration: 60, // per minute
    message: 'Trading rate limit exceeded. Please wait before placing another trade.',
  } as RateLimitOptions,

  TRADING_QUOTE: {
    points: 100, // 100 quotes
    duration: 60, // per minute
    message: 'Quote request limit exceeded. Please wait before requesting more quotes.',
  } as RateLimitOptions,

  // Payment endpoints - very strict
  PAYMENT_DEPOSIT: {
    points: 5, // 5 deposits
    duration: 300, // per 5 minutes
    message: 'Deposit limit exceeded. Please wait before making another deposit.',
  } as RateLimitOptions,

  PAYMENT_WITHDRAWAL: {
    points: 3, // 3 withdrawals
    duration: 3600, // per hour
    message: 'Withdrawal limit exceeded. Please wait before requesting another withdrawal.',
  } as RateLimitOptions,

  // General API endpoints
  API_GENERAL: {
    points: 100, // 100 requests
    duration: 60, // per minute
    message: 'API rate limit exceeded. Please slow down your requests.',
  } as RateLimitOptions,

  API_STRICT: {
    points: 20, // 20 requests
    duration: 60, // per minute
    message: 'Rate limit exceeded for this endpoint.',
  } as RateLimitOptions,

  // Admin endpoints - more lenient for internal use
  ADMIN_GENERAL: {
    points: 200, // 200 requests
    duration: 60, // per minute
    message: 'Admin API rate limit exceeded.',
  } as RateLimitOptions,

  // Email/verification endpoints
  EMAIL_SEND: {
    points: 3, // 3 emails
    duration: 300, // per 5 minutes
    message: 'Email sending rate limit exceeded. Please wait before requesting another email.',
  } as RateLimitOptions,

  // KYC endpoints
  KYC_SUBMISSION: {
    points: 5, // 5 submissions
    duration: 3600, // per hour
    message: 'KYC submission rate limit exceeded. Please wait before submitting again.',
  } as RateLimitOptions,
};

// Helper functions for custom key generators
export const RateLimitKeyGenerators = {
  // Rate limit by user ID only (ignore IP)
  byUserId: (req: any) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return `user:${userId}`;
  },

  // Rate limit by IP only (ignore user)  
  byIp: (req: any) => {
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    return `ip:${ip}`;
  },

  // Rate limit by user ID with IP fallback
  byUserOrIp: (req: any) => {
    const userId = req.user?.id;
    if (userId) {
      return `user:${userId}`;
    }
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    return `ip:${ip}`;
  },

  // Rate limit by email (for registration/login)
  byEmail: (req: any) => {
    const email = req.body?.email;
    if (!email) {
      throw new Error('Email not provided');
    }
    return `email:${email.toLowerCase()}`;
  },

  // Custom rate limit by endpoint + user
  byEndpointAndUser: (endpoint: string) => (req: any) => {
    const userId = req.user?.id;
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const identifier = userId ? `user:${userId}` : `ip:${ip}`;
    return `${endpoint}:${identifier}`;
  },
};




