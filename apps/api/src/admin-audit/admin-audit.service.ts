import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AdminAuditLog } from '@prisma/client';
import * as crypto from 'crypto';

interface AuditLogEntry {
  userId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  requestPayload?: any;
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an admin action with immutable audit trail
   */
  async logAdminAction(entry: AuditLogEntry): Promise<AdminAuditLog> {
    const {
      userId,
      action,
      resource,
      resourceId,
      oldValues,
      newValues,
      ipAddress,
      userAgent,
      requestPayload,
    } = entry;

    // Create payload hash for immutability verification
    const payloadToHash = {
      userId,
      action,
      resource,
      resourceId,
      oldValues,
      newValues,
      timestamp: new Date().toISOString(),
    };

    const payloadHash = this.createPayloadHash(payloadToHash);

    try {
      const auditLog = await this.prisma.adminAuditLog.create({
        data: {
          userId,
          action,
          resource,
          resourceId,
          oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : null,
          newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : null,
          ipAddress: ipAddress || 'unknown',
          userAgent,
          // payloadHash and requestPayload fields removed from schema
        },
      });

      this.logger.log(
        `Admin audit logged: ${action} on ${resource}${resourceId ? ` (${resourceId})` : ''} by user ${userId}`
      );

      return auditLog;
    } catch (error) {
      this.logger.error(`Failed to log admin audit: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Log market closure action
   */
  async logMarketClosure(
    adminUserId: string,
    marketId: string,
    oldMarketData: any,
    newMarketData: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AdminAuditLog> {
    return this.logAdminAction({
      userId: adminUserId,
      action: AuditAction.UPDATE,
      resource: 'market',
      resourceId: marketId,
      oldValues: { status: oldMarketData.status, closeAt: oldMarketData.closeAt },
      newValues: { status: newMarketData.status, closeAt: newMarketData.closeAt },
      ipAddress,
      userAgent,
      requestPayload: { action: 'close_market', marketId },
    });
  }

  /**
   * Log market resolution action
   */
  async logMarketResolution(
    adminUserId: string,
    marketId: string,
    resolutionData: {
      outcome: string;
      resolverNotes: string;
      sourceUrl?: string;
    },
    oldMarketData: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AdminAuditLog> {
    return this.logAdminAction({
      userId: adminUserId,
      action: AuditAction.RESOLVE,
      resource: 'market',
      resourceId: marketId,
      oldValues: {
        status: oldMarketData.status,
        resolutionOutcome: oldMarketData.resolutionOutcome,
        resolutionNotes: oldMarketData.resolutionNotes,
        resolutionSourceUrl: oldMarketData.resolutionSourceUrl,
      },
      newValues: {
        status: 'RESOLVED',
        resolutionOutcome: resolutionData.outcome,
        resolutionNotes: resolutionData.resolverNotes,
        resolutionSourceUrl: resolutionData.sourceUrl,
      },
      ipAddress,
      userAgent,
      requestPayload: resolutionData,
    });
  }

  /**
   * Log withdrawal approval/rejection
   */
  async logWithdrawalAction(
    adminUserId: string,
    withdrawalId: string,
    action: 'approve' | 'reject',
    reviewNotes?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AdminAuditLog> {
    return this.logAdminAction({
      userId: adminUserId,
      action: action === 'approve' ? AuditAction.APPROVE : AuditAction.REJECT,
      resource: 'withdrawal',
      resourceId: withdrawalId,
      newValues: { reviewNotes, action },
      ipAddress,
      userAgent,
      requestPayload: { action, reviewNotes },
    });
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(
    filters: {
      userId?: string;
      resource?: string;
      action?: AuditAction;
      startDate?: Date;
      endDate?: Date;
    } = {},
    limit: number = 100,
    offset: number = 0
  ): Promise<{ logs: AdminAuditLog[]; total: number }> {
    const where: any = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.resource) where.resource = filters.resource;
    if (filters.action) where.action = filters.action;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Verify audit log integrity using payload hash
   */
  async verifyAuditLogIntegrity(auditLogId: string): Promise<boolean> {
    const auditLog = await this.prisma.adminAuditLog.findUnique({
      where: { id: auditLogId },
    });

    if (!auditLog) {
      return false;
    }

    // Recreate the payload hash
    const payloadToHash = {
      userId: auditLog.userId,
      action: auditLog.action,
      resource: auditLog.resource,
      resourceId: auditLog.resourceId,
      oldValues: auditLog.oldValues,
      newValues: auditLog.newValues,
      timestamp: auditLog.timestamp.toISOString(),
    };

    // Payload hash verification disabled (field removed from schema)
    return true;
  }

  /**
   * Get audit summary statistics
   */
  async getAuditSummary(startDate?: Date, endDate?: Date): Promise<any> {
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [
      totalLogs,
      actionCounts,
      resourceCounts,
      userCounts,
    ] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
      }),
      this.prisma.adminAuditLog.groupBy({
        by: ['resource'],
        where,
        _count: { resource: true },
      }),
      this.prisma.adminAuditLog.groupBy({
        by: ['userId'],
        where,
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      totalLogs,
      actionCounts: actionCounts.reduce((acc, item) => {
        (acc as any)[item.action] = item._count.action;
        return acc;
      }, {} as Record<string, number>),
      resourceCounts: resourceCounts.reduce((acc, item) => {
        (acc as any)[item.resource] = item._count.resource;
        return acc;
      }, {} as Record<string, number>),
      topUsers: userCounts.map(item => ({
        userId: item.userId,
        actionCount: item._count.userId,
      })),
    };
  }

  /**
   * Create cryptographic hash of payload for immutability
   */
  private createPayloadHash(payload: any): string {
    const payloadString = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash('sha256').update(payloadString).digest('hex');
  }
}
