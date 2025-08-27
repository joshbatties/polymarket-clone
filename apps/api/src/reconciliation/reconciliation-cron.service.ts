import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReconciliationService } from './reconciliation.service';

@Injectable()
export class ReconciliationCronService {
  private readonly logger = new Logger(ReconciliationCronService.name);

  constructor(private readonly reconciliationService: ReconciliationService) {}

  /**
   * Run daily reconciliation at 6 AM every day
   * This ensures we have a full day's data from the previous day
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runDailyReconciliation() {
    try {
      // Run reconciliation for the previous day
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0); // Start of day

      this.logger.log('Starting scheduled daily reconciliation');
      
      const report = await this.reconciliationService.runDailyReconciliation(yesterday);
      
      if (report.discrepancyCount === 0) {
        this.logger.log(`✅ Daily reconciliation completed successfully: 0 differences`);
      } else {
        this.logger.warn(`⚠️ Daily reconciliation completed with ${report.discrepancyCount} discrepancies - manual review required`);
      }
    } catch (error) {
      this.logger.error(`❌ Daily reconciliation failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Run weekly summary reconciliation on Sundays at 7 AM
   */
  @Cron('0 7 * * 0') // Every Sunday at 7 AM
  async runWeeklyReconciliationSummary() {
    try {
      this.logger.log('Starting weekly reconciliation summary');
      
      // Get reconciliation reports for the past week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const reports = await this.reconciliationService.getReconciliationReports(
        weekAgo,
        new Date(),
        undefined,
        7
      );

      const totalDiscrepancies = reports.reduce((sum, report) => sum + report.discrepancyCount, 0);
      const completedReports = reports.filter(r => r.status === 'COMPLETED').length;
      const failedReports = reports.filter(r => r.status === 'FAILED').length;

      this.logger.log(`📊 Weekly reconciliation summary:`);
      this.logger.log(`  - Total reports: ${reports.length}`);
      this.logger.log(`  - Completed: ${completedReports}`);
      this.logger.log(`  - Failed: ${failedReports}`);
      this.logger.log(`  - Total discrepancies: ${totalDiscrepancies}`);

      if (failedReports > 0 || totalDiscrepancies > 0) {
        this.logger.warn(`⚠️ Weekly summary indicates issues - please review reconciliation reports`);
      }
    } catch (error) {
      this.logger.error(`❌ Weekly reconciliation summary failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Manual trigger for reconciliation (useful for testing or one-off runs)
   */
  async manualReconciliation(date?: Date): Promise<void> {
    const targetDate = date || new Date();
    targetDate.setHours(0, 0, 0, 0);

    this.logger.log(`Starting manual reconciliation for ${targetDate.toISOString().split('T')[0]}`);
    
    try {
      const report = await this.reconciliationService.runDailyReconciliation(targetDate);
      this.logger.log(`Manual reconciliation completed with ${report.discrepancyCount} discrepancies`);
    } catch (error) {
      this.logger.error(`Manual reconciliation failed: ${error.message}`);
      throw error;
    }
  }
}
