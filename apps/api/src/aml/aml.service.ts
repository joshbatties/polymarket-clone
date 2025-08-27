import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AmlEventType, AmlEventStatus } from '@prisma/client';

interface TransactionAnalysis {
  isHighRisk: boolean;
  riskScore: number;
  reasons: string[];
  suggestedAction: 'APPROVE' | 'REVIEW' | 'BLOCK';
}

interface UserTradingPattern {
  totalDepositsToday: number;
  totalDepositsThisWeek: number;
  depositCount24h: number;
  largestDeposit24h: number;
  averageTradeSize: number;
  totalPnL: number;
  winRate: number;
  tradingFrequency: number;
}

@Injectable()
export class AmlService {
  private readonly logger = new Logger(AmlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Monitor deposit transactions for AML compliance
   */
  async monitorDeposit(
    userId: string,
    amountCents: number,
    paymentMethod: string,
    ipAddress?: string,
    metadata?: any
  ): Promise<TransactionAnalysis> {
    this.logger.log(`Monitoring deposit: User ${userId}, Amount ${amountCents}`);

    const userPattern = await this.analyzeUserTradingPattern(userId);
    const analysis = await this.analyzeTransaction(userId, amountCents, 'DEPOSIT', userPattern, metadata);

    // Log AML event if high risk
    if (analysis.isHighRisk || analysis.riskScore > 50) {
      await this.logAmlEvent(
        userId,
        this.getEventTypeForTransaction('DEPOSIT', analysis),
        analysis.suggestedAction === 'BLOCK' ? AmlEventStatus.REJECTED : AmlEventStatus.PENDING,
        `Deposit monitoring: ${analysis.reasons.join(', ')}`,
        analysis.riskScore,
        amountCents,
        {
          paymentMethod,
          ipAddress,
          userPattern,
          analysis,
          ...metadata,
        }
      );
    }

    return analysis;
  }

  /**
   * Monitor withdrawal transactions for AML compliance
   */
  async monitorWithdrawal(
    userId: string,
    amountCents: number,
    destinationAccount: string,
    ipAddress?: string,
    metadata?: any
  ): Promise<TransactionAnalysis> {
    this.logger.log(`Monitoring withdrawal: User ${userId}, Amount ${amountCents}`);

    const userPattern = await this.analyzeUserTradingPattern(userId);
    const analysis = await this.analyzeTransaction(userId, amountCents, 'WITHDRAWAL', userPattern, metadata);

    // Always log withdrawal events for audit trail
    await this.logAmlEvent(
      userId,
      AmlEventType.WITHDRAWAL_REVIEW,
      analysis.suggestedAction === 'APPROVE' ? AmlEventStatus.APPROVED : AmlEventStatus.PENDING,
      `Withdrawal monitoring: ${analysis.reasons.join(', ') || 'Standard review'}`,
      analysis.riskScore,
      amountCents,
      {
        destinationAccount,
        ipAddress,
        userPattern,
        analysis,
        ...metadata,
      }
    );

    return analysis;
  }

  /**
   * Monitor trading activity for unusual patterns
   */
  async monitorTradingActivity(
    userId: string,
    marketId: string,
    tradeAmountCents: number,
    pnlCents: number,
    metadata?: any
  ): Promise<TransactionAnalysis> {
    const userPattern = await this.analyzeUserTradingPattern(userId);
    
    const reasons: string[] = [];
    let riskScore = 0;

    // Check for unusual P&L
    if (Math.abs(pnlCents) > this.configService.get('AML_UNUSUAL_PNL_THRESHOLD', 100000)) { // $1000
      reasons.push('Unusual P&L amount');
      riskScore += 30;
    }

    // Check trading frequency
    if (userPattern.tradingFrequency > this.configService.get('AML_HIGH_FREQUENCY_THRESHOLD', 50)) {
      reasons.push('High frequency trading detected');
      riskScore += 25;
    }

    // Check win rate patterns
    if (userPattern.winRate > 0.9 && userPattern.totalPnL > 50000) { // 90% win rate with >$500 total profit
      reasons.push('Unusually high win rate');
      riskScore += 40;
    }

    const isHighRisk = riskScore > 50;
    const suggestedAction = riskScore > 80 ? 'BLOCK' : riskScore > 50 ? 'REVIEW' : 'APPROVE';

    if (isHighRisk) {
      await this.logAmlEvent(
        userId,
        AmlEventType.UNUSUAL_PNL,
        suggestedAction === 'BLOCK' ? AmlEventStatus.REJECTED : AmlEventStatus.PENDING,
        `Trading monitoring: ${reasons.join(', ')}`,
        riskScore,
        tradeAmountCents,
        {
          marketId,
          pnlCents,
          userPattern,
          ...metadata,
        }
      );
    }

    return {
      isHighRisk,
      riskScore,
      reasons,
      suggestedAction: suggestedAction as any,
    };
  }

  /**
   * Get pending AML events that require manual review
   */
  async getPendingReviews(limit = 50, offset = 0) {
    const events = await this.prisma.amlEvent.findMany({
      where: {
        status: AmlEventStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            kycProfile: {
              select: {
                status: true,
                fullName: true,
                amlRiskScore: true,
              },
            },
          },
        },
      },
      orderBy: [
        { riskScore: 'desc' },
        { createdAt: 'asc' },
      ],
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.amlEvent.count({
      where: { status: AmlEventStatus.PENDING },
    });

    return { events, total };
  }

  /**
   * Approve or reject an AML event
   */
  async reviewAmlEvent(
    eventId: string,
    reviewerId: string,
    decision: 'APPROVE' | 'REJECT' | 'ESCALATE',
    notes?: string
  ) {
    const status = decision === 'APPROVE' ? AmlEventStatus.APPROVED :
                  decision === 'REJECT' ? AmlEventStatus.REJECTED :
                  AmlEventStatus.ESCALATED;

    await this.prisma.amlEvent.update({
      where: { id: eventId },
      data: {
        status,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });

    this.logger.log(`AML event ${eventId} ${decision.toLowerCase()}ed by ${reviewerId}`);
  }

  private async analyzeUserTradingPattern(userId: string): Promise<UserTradingPattern> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get deposit history
    const deposits = await this.prisma.ledgerEntry.findMany({
      where: {
        userId,
        entryType: 'DEPOSIT',
        timestamp: { gte: oneWeekAgo },
      },
    });

    const depositsToday = deposits.filter(d => d.timestamp >= oneDayAgo);
    const totalDepositsToday = depositsToday.reduce((sum, d) => sum + Number(d.amountCents), 0);
    const totalDepositsThisWeek = deposits.reduce((sum, d) => sum + Number(d.amountCents), 0);
    const largestDeposit24h = Math.max(...depositsToday.map(d => Number(d.amountCents)), 0);

    // Get trading activity
    const trades = await this.prisma.trade.findMany({
      where: {
        userId,
        timestamp: { gte: oneWeekAgo },
      },
    });

    const tradesLast24h = trades.filter(t => t.timestamp >= oneDayAgo);
    const averageTradeSize = trades.length > 0 ? 
      trades.reduce((sum, t) => sum + Number(t.costCents), 0) / trades.length : 0;

    // Calculate P&L from positions
    const positions = await this.prisma.position.findMany({
      where: { userId },
      include: { market: { include: { lmsrState: true } } },
    });

    // Simplified P&L calculation (would need current market prices for accuracy)
    const totalPnL = positions.reduce((sum, pos) => {
      const invested = Number(pos.totalInvested);
      const realized = Number(pos.realizedPnl);
      return sum + realized;
    }, 0);

    // Calculate win rate from completed trades
    const winningTrades = trades.filter(t => {
      // This is simplified - in reality we'd need to check if the position was profitable
      return Number(t.costCents) > 0; // Placeholder logic
    });
    const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;

    return {
      totalDepositsToday,
      totalDepositsThisWeek,
      depositCount24h: depositsToday.length,
      largestDeposit24h,
      averageTradeSize,
      totalPnL,
      winRate,
      tradingFrequency: tradesLast24h.length,
    };
  }

  private async analyzeTransaction(
    userId: string,
    amountCents: number,
    type: 'DEPOSIT' | 'WITHDRAWAL',
    userPattern: UserTradingPattern,
    metadata?: any
  ): Promise<TransactionAnalysis> {
    const reasons: string[] = [];
    let riskScore = 0;

    // Amount-based checks
    const largeTransactionThreshold = this.configService.get('AML_LARGE_TRANSACTION_THRESHOLD', 500000); // $5000
    if (amountCents > largeTransactionThreshold) {
      reasons.push('Large transaction amount');
      riskScore += 30;
    }

    // Velocity checks for deposits
    if (type === 'DEPOSIT') {
      const rapidDepositThreshold = this.configService.get('AML_RAPID_DEPOSIT_THRESHOLD', 300000); // $3000/day
      if (userPattern.totalDepositsToday + amountCents > rapidDepositThreshold) {
        reasons.push('Rapid deposit pattern');
        riskScore += 25;
      }

      if (userPattern.depositCount24h >= 5) {
        reasons.push('High frequency deposits');
        riskScore += 20;
      }

      // Check if this deposit is significantly larger than usual
      if (userPattern.largestDeposit24h > 0 && amountCents > userPattern.largestDeposit24h * 3) {
        reasons.push('Unusually large deposit');
        riskScore += 15;
      }
    }

    // Withdrawal-specific checks
    if (type === 'WITHDRAWAL') {
      // Check if withdrawal is larger than recent deposits
      if (amountCents > userPattern.totalDepositsThisWeek * 1.5) {
        reasons.push('Withdrawal exceeds recent deposits');
        riskScore += 25;
      }

      // Check for immediate withdrawal after deposit
      if (userPattern.depositCount24h > 0 && userPattern.totalDepositsToday > 0) {
        reasons.push('Quick withdrawal after deposit');
        riskScore += 20;
      }
    }

    // User behavior checks
    if (userPattern.tradingFrequency > 20) {
      reasons.push('High trading activity');
      riskScore += 10;
    }

    // Determine action based on risk score
    let suggestedAction: 'APPROVE' | 'REVIEW' | 'BLOCK';
    if (riskScore >= 80) {
      suggestedAction = 'BLOCK';
    } else if (riskScore >= 50) {
      suggestedAction = 'REVIEW';
    } else {
      suggestedAction = 'APPROVE';
    }

    return {
      isHighRisk: riskScore > 50,
      riskScore,
      reasons,
      suggestedAction,
    };
  }

  private getEventTypeForTransaction(
    transactionType: 'DEPOSIT' | 'WITHDRAWAL',
    analysis: TransactionAnalysis
  ): AmlEventType {
    if (transactionType === 'DEPOSIT') {
      if (analysis.reasons.includes('Large transaction amount')) {
        return AmlEventType.LARGE_DEPOSIT;
      }
      if (analysis.reasons.includes('Rapid deposit pattern') || analysis.reasons.includes('High frequency deposits')) {
        return AmlEventType.RAPID_DEPOSITS;
      }
    }

    return AmlEventType.MANUAL_REVIEW;
  }

  private async logAmlEvent(
    userId: string,
    eventType: AmlEventType,
    status: AmlEventStatus,
    description: string,
    riskScore: number,
    amountCents?: number,
    metadata?: any
  ) {
    await this.prisma.amlEvent.create({
      data: {
        userId,
        eventType,
        status,
        description,
        riskScore,
        amountCents: amountCents ? BigInt(amountCents) : null,
        metadata,
      },
    });

    this.logger.log(`AML event logged: ${eventType} for user ${userId} (Risk: ${riskScore})`);
  }

  /**
   * Log withdrawal request for AML monitoring
   */
  async logWithdrawalRequest(userId: string, amountCents: number, bankAccountId: string): Promise<void> {
    await this.logAmlEvent(
      userId,
      AmlEventType.WITHDRAWAL_REVIEW,
      AmlEventStatus.PENDING,
      `Withdrawal request: ${amountCents} cents to bank account ${bankAccountId}`,
      20, // Base risk score for withdrawal requests
      amountCents, // Amount in cents
      {
        bankAccountId,
        platform: 'web',
        eventTimestamp: new Date().toISOString(),
      }
    );
  }
}
