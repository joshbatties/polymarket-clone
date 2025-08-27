import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  Body,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationCronService } from './reconciliation-cron.service';
import { ReconciliationReport, ReconciliationStatus, UserRole } from '@prisma/client';

@Controller('admin/reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ReconciliationController {
  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly reconciliationCronService: ReconciliationCronService,
  ) {}

  /**
   * Get reconciliation reports with optional filtering
   */
  @Get('reports')
  async getReconciliationReports(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: ReconciliationStatus,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<ReconciliationReport[]> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return this.reconciliationService.getReconciliationReports(start, end, status, limit);
  }

  /**
   * Get a specific reconciliation report
   */
  @Get('reports/:id')
  async getReconciliationReport(@Param('id') reportId: string): Promise<ReconciliationReport | null> {
    return this.reconciliationService.getReconciliationReport(reportId);
  }

  /**
   * Get reconciliation report by date
   */
  @Get('reports/date/:date')
  async getReconciliationReportByDate(@Param('date') dateStr: string): Promise<ReconciliationReport | null> {
    const date = new Date(dateStr);
    return this.reconciliationService.getReconciliationReportByDate(date);
  }

  /**
   * Manually trigger reconciliation for a specific date
   */
  @Post('run')
  async runManualReconciliation(@Body() body: { date?: string }): Promise<ReconciliationReport> {
    const date = body.date ? new Date(body.date) : new Date();
    date.setHours(0, 0, 0, 0);
    
    const report = await this.reconciliationService.runDailyReconciliation(date);
    return report;
  }

  /**
   * Run reconciliation for yesterday (most common manual case)
   */
  @Post('run-yesterday')
  async runYesterdayReconciliation(): Promise<ReconciliationReport> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    return this.reconciliationService.runDailyReconciliation(yesterday);
  }
}
