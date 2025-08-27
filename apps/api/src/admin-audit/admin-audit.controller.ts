import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminAuditService } from './admin-audit.service';
import { AuditAction } from '@prisma/client';

@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  /**
   * Get audit logs with filtering
   * GET /admin/audit/logs
   */
  @Get('logs')
  @HttpCode(HttpStatus.OK)
  async getAuditLogs(
    @Query('userId') userId?: string,
    @Query('resource') resource?: string,
    @Query('action') action?: AuditAction,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 100,
    @Query('offset', new ParseIntPipe({ optional: true })) offset: number = 0,
  ) {
    const filters: any = {};

    if (userId) filters.userId = userId;
    if (resource) filters.resource = resource;
    if (action) filters.action = action;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    const result = await this.adminAuditService.getAuditLogs(filters, limit, offset);

    return {
      success: true,
      data: {
        logs: result.logs,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: offset + limit < result.total,
        },
      },
    };
  }

  /**
   * Get audit log summary statistics
   * GET /admin/audit/summary
   */
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  async getAuditSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const summary = await this.adminAuditService.getAuditSummary(start, end);

    return {
      success: true,
      data: summary,
    };
  }

  /**
   * Verify audit log integrity
   * GET /admin/audit/logs/:id/verify
   */
  @Get('logs/:id/verify')
  @HttpCode(HttpStatus.OK)
  async verifyAuditLog(@Param('id') auditLogId: string) {
    const isValid = await this.adminAuditService.verifyAuditLogIntegrity(auditLogId);

    return {
      success: true,
      data: {
        auditLogId,
        isValid,
        message: isValid ? 'Audit log integrity verified' : 'Audit log integrity check failed',
      },
    };
  }
}
