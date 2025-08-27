import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ResponsibleGamblingStatus } from '@prisma/client';

interface DepositLimitsCheck {
  allowed: boolean;
  dailyRemaining: number;
  weeklyRemaining: number;
  reason?: string;
}

interface RGStatusCheck {
  canTrade: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  status: ResponsibleGamblingStatus;
  restrictions?: {
    selfExclusionEndAt?: Date;
    coolingOffEndAt?: Date;
  };
}

@Injectable()
export class ResponsibleGamblingService {
  private readonly logger = new Logger(ResponsibleGamblingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if user can make a deposit based on their limits
   */
  async checkDepositLimits(userId: string, amountCents: number): Promise<DepositLimitsCheck> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        dailyDepositLimitCents: true,
        weeklyDepositLimitCents: true,
        rgStatus: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check RG status first
    const rgCheck = await this.checkRGStatus(userId);
    if (!rgCheck.canDeposit) {
      return {
        allowed: false,
        dailyRemaining: 0,
        weeklyRemaining: 0,
        reason: `Cannot deposit: ${rgCheck.status}`,
      };
    }

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart.getTime() - ((dayStart.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);

    // Get recent deposits
    const [dailyDeposits, weeklyDeposits] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: {
          userId,
          entryType: 'DEPOSIT',
          timestamp: { gte: dayStart },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: {
          userId,
          entryType: 'DEPOSIT',
          timestamp: { gte: weekStart },
        },
        _sum: { amountCents: true },
      }),
    ]);

    const dailyTotal = Number(dailyDeposits._sum.amountCents || 0);
    const weeklyTotal = Number(weeklyDeposits._sum.amountCents || 0);

    // Use system defaults if user hasn't set custom limits
    const defaultDailyLimit = this.configService.get('RG_DEFAULT_DAILY_LIMIT_CENTS', 100000); // $1000
    const defaultWeeklyLimit = this.configService.get('RG_DEFAULT_WEEKLY_LIMIT_CENTS', 500000); // $5000

    const dailyLimit = Number(user.dailyDepositLimitCents || defaultDailyLimit);
    const weeklyLimit = Number(user.weeklyDepositLimitCents || defaultWeeklyLimit);

    const dailyRemaining = Math.max(0, dailyLimit - dailyTotal);
    const weeklyRemaining = Math.max(0, weeklyLimit - weeklyTotal);

    // Check if this deposit would exceed limits
    if (amountCents > dailyRemaining) {
      return {
        allowed: false,
        dailyRemaining,
        weeklyRemaining,
        reason: 'Deposit would exceed daily limit',
      };
    }

    if (amountCents > weeklyRemaining) {
      return {
        allowed: false,
        dailyRemaining,
        weeklyRemaining,
        reason: 'Deposit would exceed weekly limit',
      };
    }

    return {
      allowed: true,
      dailyRemaining: dailyRemaining - amountCents,
      weeklyRemaining: weeklyRemaining - amountCents,
    };
  }

  /**
   * Check user's responsible gambling status
   */
  async checkRGStatus(userId: string): Promise<RGStatusCheck> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        rgStatus: true,
        selfExcludedAt: true,
        selfExclusionEndAt: true,
        coolingOffEndAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const now = new Date();

    // Check if self-exclusion has expired
    if (user.rgStatus === ResponsibleGamblingStatus.SELF_EXCLUDED) {
      if (user.selfExclusionEndAt && now > user.selfExclusionEndAt) {
        // Auto-expire self-exclusion
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            rgStatus: ResponsibleGamblingStatus.ACTIVE,
            selfExcludedAt: null,
            selfExclusionEndAt: null,
          },
        });

        user.rgStatus = ResponsibleGamblingStatus.ACTIVE;
      }
    }

    // Check if cooling-off has expired
    if (user.rgStatus === ResponsibleGamblingStatus.COOLING_OFF) {
      if (user.coolingOffEndAt && now > user.coolingOffEndAt) {
        // Auto-expire cooling-off
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            rgStatus: ResponsibleGamblingStatus.ACTIVE,
            coolingOffEndAt: null,
          },
        });

        user.rgStatus = ResponsibleGamblingStatus.ACTIVE;
      }
    }

    const isActive = user.rgStatus === ResponsibleGamblingStatus.ACTIVE;

    return {
      canTrade: isActive,
      canDeposit: isActive,
      canWithdraw: isActive, // Allow withdrawals even during restrictions
      status: user.rgStatus,
      restrictions: {
        selfExclusionEndAt: user.selfExclusionEndAt || undefined,
        coolingOffEndAt: user.coolingOffEndAt || undefined,
      },
    };
  }

  /**
   * Set deposit limits for a user
   */
  async setDepositLimits(
    userId: string,
    dailyLimitCents?: number,
    weeklyLimitCents?: number
  ) {
    // Validate limits
    if (dailyLimitCents !== undefined && dailyLimitCents < 0) {
      throw new BadRequestException('Daily limit cannot be negative');
    }

    if (weeklyLimitCents !== undefined && weeklyLimitCents < 0) {
      throw new BadRequestException('Weekly limit cannot be negative');
    }

    if (dailyLimitCents && weeklyLimitCents && dailyLimitCents > weeklyLimitCents) {
      throw new BadRequestException('Daily limit cannot exceed weekly limit');
    }

    // Maximum limits for safety
    const maxDailyLimit = this.configService.get('RG_MAX_DAILY_LIMIT_CENTS', 1000000); // $10,000
    const maxWeeklyLimit = this.configService.get('RG_MAX_WEEKLY_LIMIT_CENTS', 5000000); // $50,000

    if (dailyLimitCents && dailyLimitCents > maxDailyLimit) {
      throw new BadRequestException(`Daily limit cannot exceed $${maxDailyLimit / 100}`);
    }

    if (weeklyLimitCents && weeklyLimitCents > maxWeeklyLimit) {
      throw new BadRequestException(`Weekly limit cannot exceed $${maxWeeklyLimit / 100}`);
    }

    const updateData: any = {};
    if (dailyLimitCents !== undefined) {
      updateData.dailyDepositLimitCents = dailyLimitCents;
    }
    if (weeklyLimitCents !== undefined) {
      updateData.weeklyDepositLimitCents = weeklyLimitCents;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    this.logger.log(`Deposit limits updated for user ${userId}: daily=${dailyLimitCents}, weekly=${weeklyLimitCents}`);
  }

  /**
   * Initiate self-exclusion for a user
   */
  async selfExclude(userId: string, durationDays: number) {
    if (durationDays < 1) {
      throw new BadRequestException('Self-exclusion duration must be at least 1 day');
    }

    const maxDuration = this.configService.get('RG_MAX_SELF_EXCLUSION_DAYS', 365); // 1 year max
    if (durationDays > maxDuration) {
      throw new BadRequestException(`Self-exclusion cannot exceed ${maxDuration} days`);
    }

    const now = new Date();
    const endAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        rgStatus: ResponsibleGamblingStatus.SELF_EXCLUDED,
        selfExcludedAt: now,
        selfExclusionEndAt: endAt,
        coolingOffEndAt: null, // Clear any cooling-off
      },
    });

    this.logger.log(`User ${userId} self-excluded for ${durationDays} days until ${endAt.toISOString()}`);

    return {
      success: true,
      exclusionEndAt: endAt,
      message: `Self-exclusion active until ${endAt.toLocaleDateString()}`,
    };
  }

  /**
   * Initiate cooling-off period for a user
   */
  async coolingOff(userId: string, durationHours: number) {
    if (durationHours < 1) {
      throw new BadRequestException('Cooling-off duration must be at least 1 hour');
    }

    const maxHours = this.configService.get('RG_MAX_COOLING_OFF_HOURS', 168); // 1 week max
    if (durationHours > maxHours) {
      throw new BadRequestException(`Cooling-off cannot exceed ${maxHours} hours`);
    }

    const now = new Date();
    const endAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        rgStatus: ResponsibleGamblingStatus.COOLING_OFF,
        coolingOffEndAt: endAt,
      },
    });

    this.logger.log(`User ${userId} cooling-off for ${durationHours} hours until ${endAt.toISOString()}`);

    return {
      success: true,
      coolingOffEndAt: endAt,
      message: `Cooling-off active until ${endAt.toLocaleString()}`,
    };
  }

  /**
   * Get user's current RG settings and status
   */
  async getRGSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        dailyDepositLimitCents: true,
        weeklyDepositLimitCents: true,
        rgStatus: true,
        selfExcludedAt: true,
        selfExclusionEndAt: true,
        coolingOffEndAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const limitsCheck = await this.checkDepositLimits(userId, 0);

    return {
      status: user.rgStatus,
      limits: {
        dailyLimitCents: user.dailyDepositLimitCents,
        weeklyLimitCents: user.weeklyDepositLimitCents,
        dailyRemaining: limitsCheck.dailyRemaining,
        weeklyRemaining: limitsCheck.weeklyRemaining,
      },
      restrictions: {
        selfExcludedAt: user.selfExcludedAt,
        selfExclusionEndAt: user.selfExclusionEndAt,
        coolingOffEndAt: user.coolingOffEndAt,
      },
    };
  }

  /**
   * Validate that a user can perform a trading action
   */
  async validateTradingAction(userId: string, actionType: 'TRADE' | 'DEPOSIT' | 'WITHDRAW'): Promise<void> {
    const rgStatus = await this.checkRGStatus(userId);

    switch (actionType) {
      case 'TRADE':
        if (!rgStatus.canTrade) {
          throw new ForbiddenException(`Trading not allowed: ${rgStatus.status}`);
        }
        break;
      case 'DEPOSIT':
        if (!rgStatus.canDeposit) {
          throw new ForbiddenException(`Deposits not allowed: ${rgStatus.status}`);
        }
        break;
      case 'WITHDRAW':
        if (!rgStatus.canWithdraw) {
          throw new ForbiddenException(`Withdrawals not allowed: ${rgStatus.status}`);
        }
        break;
    }
  }
}
