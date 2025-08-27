import { Injectable, SetMetadata } from '@nestjs/common';
import { TelemetryService, BusinessEvent } from './telemetry.service';

// Metadata keys for telemetry decorators
export const TRACK_EVENT_KEY = 'TRACK_EVENT';
export const TRACK_PERFORMANCE_KEY = 'TRACK_PERFORMANCE';

// === EVENT TRACKING DECORATORS ===

/**
 * Decorator to automatically track business events
 * @param eventName - The name of the event to track
 * @param getPropertiesFromArgs - Function to extract properties from method arguments
 */
export const TrackEvent = (
  eventName: string, 
  getPropertiesFromArgs?: (...args: any[]) => Record<string, any>
) => {
  return SetMetadata(TRACK_EVENT_KEY, {
    eventName,
    getPropertiesFromArgs,
  });
};

/**
 * Decorator to track performance metrics
 * @param operationName - Name of the operation being tracked
 */
export const TrackPerformance = (operationName?: string) => {
  return SetMetadata(TRACK_PERFORMANCE_KEY, { operationName });
};

// === SPECIFIC BUSINESS EVENT DECORATORS ===

/**
 * Track trade-related events
 */
export const TrackTrade = (eventType: 'quote' | 'execute' | 'fail') => {
  return TrackEvent(`trade_${eventType}`, (marketId, outcome, shares, cost) => ({
    marketId,
    outcome,
    shares,
    costCents: cost,
  }));
};

/**
 * Track payment-related events
 */
export const TrackPayment = (eventType: 'deposit' | 'withdrawal', status: 'initiated' | 'completed' | 'failed') => {
  return TrackEvent(`${eventType}_${status}`, (amountCents, currency, paymentMethod) => ({
    amountCents,
    currency,
    paymentMethod,
  }));
};

/**
 * Track user lifecycle events
 */
export const TrackUser = (eventType: 'register' | 'login' | 'verify_email' | 'kyc_start' | 'kyc_complete') => {
  return TrackEvent(`user_${eventType}`, (userId, ...extraProps) => ({
    userId,
    ...extraProps[0], // Additional properties object
  }));
};

/**
 * Track market management events
 */
export const TrackMarket = (eventType: 'create' | 'resolve' | 'settle') => {
  return TrackEvent(`market_${eventType}`, (marketId, category, ...extraProps) => ({
    marketId,
    category,
    ...extraProps[0],
  }));
};

// === TELEMETRY INTERCEPTOR ===

import { Injectable as InjectableDecorator, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@InjectableDecorator()
export class TelemetryInterceptor implements NestInterceptor {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    
    // Set request context for Sentry
    this.telemetryService.setRequestContext(
      userId,
      request.session?.id,
      request.ip
    );

    // Check for event tracking metadata
    const eventMetadata = this.reflector.get(TRACK_EVENT_KEY, context.getHandler());
    const performanceMetadata = this.reflector.get(TRACK_PERFORMANCE_KEY, context.getHandler());

    return next.handle().pipe(
      tap((result) => {
        const duration = Date.now() - startTime;

        // Track performance if decorator is present
        if (performanceMetadata) {
          const operationName = performanceMetadata.operationName || 
            `${context.getClass().name}.${context.getHandler().name}`;
          
          this.telemetryService.trackPerformance(operationName, duration, {
            controller: context.getClass().name,
            method: context.getHandler().name,
            statusCode: context.switchToHttp().getResponse().statusCode,
          });
        }

        // Track business event if decorator is present
        if (eventMetadata) {
          const args = context.getArgs();
          const properties = eventMetadata.getPropertiesFromArgs 
            ? eventMetadata.getPropertiesFromArgs(...args)
            : {};

          this.telemetryService.trackEvent({
            event: eventMetadata.eventName,
            userId,
            properties: {
              ...properties,
              duration,
              endpoint: `${request.method} ${request.path}`,
            },
          });
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;

        // Track error
        this.telemetryService.captureError(error, {
          controller: context.getClass().name,
          method: context.getHandler().name,
          endpoint: `${request.method} ${request.path}`,
          duration,
          userId,
        }, userId);

        // Track failed event if business event decorator is present
        if (eventMetadata) {
          const failedEventName = eventMetadata.eventName.replace(/_initiated|_completed/, '_failed');
          this.telemetryService.trackEvent({
            event: failedEventName,
            userId,
            properties: {
              errorMessage: error.message,
              errorType: error.constructor.name,
              duration,
              endpoint: `${request.method} ${request.path}`,
            },
          });
        }

        return throwError(() => error);
      })
    );
  }
}




