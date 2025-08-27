import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/services/stripe.service';
import { ReconciliationStatus, ReconciliationReport } from '@prisma/client';
import Stripe from 'stripe';

interface StripeBalanceData {
  depositsTotal: number;
  withdrawalsTotal: number;
  feesTotal: number;
  balanceEnd: number;
}

interface LedgerBalanceData {
  depositsTotal: number;
  withdrawalsTotal: number;
  feesTotal: number;
  balanceEnd: number;
}

interface ReconciliationDifferences {
  depositsDifference: number;
  withdrawalsDifference: number;
  feesDifference: number;
  balanceDifference: number;
  discrepancyCount: number;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Run daily reconciliation between Stripe and internal ledger
   */
  async runDailyReconciliation(reportDate: Date): Promise<ReconciliationReport> {
    const dateStr = reportDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    this.logger.log(`Starting daily reconciliation for ${dateStr}`);

    try {
      // Check if reconciliation already exists for this date
      const existingReport = await this.prisma.reconciliationReport.findUnique({
        where: { reportDate },
      });

      if (existingReport && existingReport.status === ReconciliationStatus.COMPLETED) {
        this.logger.log(`Reconciliation already completed for ${dateStr}`);
        return existingReport;
      }

      // Create or update reconciliation report
      let report = existingReport || await this.createReconciliationReport(reportDate);

      // Update status to in progress
      report = await this.prisma.reconciliationReport.update({
        where: { id: report.id },
        data: { status: ReconciliationStatus.IN_PROGRESS },
      });

      // Fetch Stripe data for the date
      const stripeData = await this.fetchStripeDataForDate(reportDate);

      // Fetch internal ledger data for the date
      const ledgerData = await this.fetchLedgerDataForDate(reportDate);

      // Calculate differences
      const differences = this.calculateDifferences(stripeData, ledgerData);

      // Update the reconciliation report
      const completedReport = await this.prisma.reconciliationReport.update({
        where: { id: report.id },
        data: {
          status: ReconciliationStatus.COMPLETED,
          stripeDepositsTotal: BigInt(stripeData.depositsTotal),
          stripeWithdrawalsTotal: BigInt(stripeData.withdrawalsTotal),
          stripeFeesTotal: BigInt(stripeData.feesTotal),
          stripeBalanceEnd: BigInt(stripeData.balanceEnd),
          ledgerDepositsTotal: BigInt(ledgerData.depositsTotal),
          ledgerWithdrawalsTotal: BigInt(ledgerData.withdrawalsTotal),
          ledgerFeesTotal: BigInt(ledgerData.feesTotal),
          ledgerBalanceEnd: BigInt(ledgerData.balanceEnd),
          depositsDifference: BigInt(differences.depositsDifference),
          withdrawalsDifference: BigInt(differences.withdrawalsDifference),
          feesDifference: BigInt(differences.feesDifference),
          balanceDifference: BigInt(differences.balanceDifference),
          discrepancyCount: differences.discrepancyCount,
          processedAt: new Date(),
          notes: differences.discrepancyCount > 0 ? 'Discrepancies found - requires review' : 'No discrepancies found',
        },
      });

      if (differences.discrepancyCount === 0) {
        this.logger.log(`✅ Reconciliation completed for ${dateStr}: 0 differences`);
      } else {
        this.logger.warn(`⚠️ Reconciliation completed for ${dateStr}: ${differences.discrepancyCount} discrepancies found`);
      }

      return completedReport;
    } catch (error) {
      this.logger.error(`Failed to run reconciliation for ${dateStr}: ${error.message}`);
      
      // Update status to failed if report exists
      const existingReport = await this.prisma.reconciliationReport.findUnique({
        where: { reportDate },
      });

      if (existingReport) {
        await this.prisma.reconciliationReport.update({
          where: { id: existingReport.id },
          data: {
            status: ReconciliationStatus.FAILED,
            notes: `Reconciliation failed: ${error.message}`,
            processedAt: new Date(),
          },
        });
      }

      throw error;
    }
  }

  /**
   * Get reconciliation reports with optional filtering
   */
  async getReconciliationReports(
    startDate?: Date,
    endDate?: Date,
    status?: ReconciliationStatus,
    limit: number = 30,
  ): Promise<ReconciliationReport[]> {
    const where: any = {};

    if (startDate || endDate) {
      where.reportDate = {};
      if (startDate) where.reportDate.gte = startDate;
      if (endDate) where.reportDate.lte = endDate;
    }

    if (status) {
      where.status = status;
    }

    return this.prisma.reconciliationReport.findMany({
      where,
      orderBy: { reportDate: 'desc' },
      take: limit,
    });
  }

  /**
   * Get a specific reconciliation report
   */
  async getReconciliationReport(reportId: string): Promise<ReconciliationReport | null> {
    return this.prisma.reconciliationReport.findUnique({
      where: { id: reportId },
    });
  }

  /**
   * Get reconciliation report by date
   */
  async getReconciliationReportByDate(reportDate: Date): Promise<ReconciliationReport | null> {
    return this.prisma.reconciliationReport.findUnique({
      where: { reportDate },
    });
  }

  private async createReconciliationReport(reportDate: Date): Promise<ReconciliationReport> {
    return this.prisma.reconciliationReport.create({
      data: {
        reportDate,
        status: ReconciliationStatus.PENDING,
        stripeDepositsTotal: BigInt(0),
        stripeWithdrawalsTotal: BigInt(0),
        stripeFeesTotal: BigInt(0),
        stripeBalanceEnd: BigInt(0),
        ledgerDepositsTotal: BigInt(0),
        ledgerWithdrawalsTotal: BigInt(0),
        ledgerFeesTotal: BigInt(0),
        ledgerBalanceEnd: BigInt(0),
        depositsDifference: BigInt(0),
        withdrawalsDifference: BigInt(0),
        feesDifference: BigInt(0),
        balanceDifference: BigInt(0),
      },
    });
  }

  private async fetchStripeDataForDate(reportDate: Date): Promise<StripeBalanceData> {
    try {
      const stripe = this.stripeService['stripe']; // Access private stripe instance
      
      // Calculate date range (start of day to end of day)
      const startOfDay = new Date(reportDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(reportDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Convert to Unix timestamps
      const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
      const endTimestamp = Math.floor(endOfDay.getTime() / 1000);

      // Fetch balance transactions for the day
      const balanceTransactions = await stripe.balanceTransactions.list({
        created: {
          gte: startTimestamp,
          lte: endTimestamp,
        },
        limit: 100, // Adjust as needed
      });

      let depositsTotal = 0;
      let withdrawalsTotal = 0;
      let feesTotal = 0;

      // Process each transaction
      for (const transaction of balanceTransactions.data) {
        const amountCents = Math.abs(transaction.amount);

        switch (transaction.type) {
          case 'payment':
          case 'charge':
            depositsTotal += amountCents;
            break;
          case 'payout':
            withdrawalsTotal += amountCents;
            break;
          case 'stripe_fee':
          case 'application_fee':
            feesTotal += amountCents;
            break;
        }

        // Add fees from the transaction
        if (transaction.fee_details) {
          for (const fee of transaction.fee_details) {
            feesTotal += fee.amount;
          }
        }
      }

      // Get current Stripe balance
      const balance = await stripe.balance.retrieve();
      const balanceEnd = balance.available.reduce((total: number, bal: any) => total + bal.amount, 0);

      return {
        depositsTotal,
        withdrawalsTotal,
        feesTotal,
        balanceEnd,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Stripe data: ${error.message}`);
      throw error;
    }
  }

  private async fetchLedgerDataForDate(reportDate: Date): Promise<LedgerBalanceData> {
    try {
      // Calculate date range
      const startOfDay = new Date(reportDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(reportDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Aggregate deposits (credits to custody_cash from user deposits)
      const deposits = await this.prisma.ledgerEntry.aggregate({
        where: {
          accountId: 'custody_cash',
          entryType: 'DEPOSIT',
          timestamp: {
            gte: startOfDay,
            lte: endOfDay,
          },
          amountCents: { gt: 0 }, // Only positive amounts (credits)
        },
        _sum: { amountCents: true },
      });

      // Aggregate withdrawals (debits from custody_cash for withdrawals)
      const withdrawals = await this.prisma.ledgerEntry.aggregate({
        where: {
          accountId: 'custody_cash',
          entryType: 'WITHDRAWAL',
          timestamp: {
            gte: startOfDay,
            lte: endOfDay,
          },
          amountCents: { lt: 0 }, // Only negative amounts (debits)
        },
        _sum: { amountCents: true },
      });

      // Aggregate fees (credits to fee_revenue)
      const fees = await this.prisma.ledgerEntry.aggregate({
        where: {
          accountId: 'fee_revenue',
          entryType: 'FEE',
          timestamp: {
            gte: startOfDay,
            lte: endOfDay,
          },
          amountCents: { gt: 0 }, // Only positive amounts (credits)
        },
        _sum: { amountCents: true },
      });

      // Calculate current custody cash balance
      const custodyBalance = await this.prisma.ledgerEntry.aggregate({
        where: {
          accountId: 'custody_cash',
        },
        _sum: { amountCents: true },
      });

      return {
        depositsTotal: Number(deposits._sum?.amountCents || 0),
        withdrawalsTotal: Math.abs(Number(withdrawals._sum?.amountCents || 0)), // Make positive
        feesTotal: Number(fees._sum?.amountCents || 0),
        balanceEnd: Number(custodyBalance._sum.amountCents || 0),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch ledger data: ${error.message}`);
      throw error;
    }
  }

  private calculateDifferences(stripeData: StripeBalanceData, ledgerData: LedgerBalanceData): ReconciliationDifferences {
    const depositsDifference = stripeData.depositsTotal - ledgerData.depositsTotal;
    const withdrawalsDifference = stripeData.withdrawalsTotal - ledgerData.withdrawalsTotal;
    const feesDifference = stripeData.feesTotal - ledgerData.feesTotal;
    const balanceDifference = stripeData.balanceEnd - ledgerData.balanceEnd;

    // Count non-zero differences as discrepancies
    let discrepancyCount = 0;
    if (Math.abs(depositsDifference) > 0) discrepancyCount++;
    if (Math.abs(withdrawalsDifference) > 0) discrepancyCount++;
    if (Math.abs(feesDifference) > 0) discrepancyCount++;
    if (Math.abs(balanceDifference) > 0) discrepancyCount++;

    return {
      depositsDifference,
      withdrawalsDifference,
      feesDifference,
      balanceDifference,
      discrepancyCount,
    };
  }
}
