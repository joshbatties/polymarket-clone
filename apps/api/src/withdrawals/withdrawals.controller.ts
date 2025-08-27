import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WithdrawalService } from './services/withdrawal.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { ApproveWithdrawalDto, RejectWithdrawalDto } from './dto/admin-withdrawal-action.dto';
import { Withdrawal, UserRole } from '@prisma/client';

@Controller('withdrawals')
@UseGuards(JwtAuthGuard)
export class WithdrawalsController {
  constructor(private readonly withdrawalService: WithdrawalService) {}

  /**
   * Create a new withdrawal request
   */
  @Post()
  async createWithdrawal(
    @Request() req: any,
    @Body() createWithdrawalDto: CreateWithdrawalDto,
  ): Promise<Withdrawal> {
    return this.withdrawalService.createWithdrawal(req.user.userId, createWithdrawalDto);
  }

  /**
   * Get user's withdrawal history
   */
  @Get()
  async getUserWithdrawals(
    @Request() req: any,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<Withdrawal[]> {
    return this.withdrawalService.getUserWithdrawals(req.user.userId, limit);
  }

  /**
   * Get a specific withdrawal
   */
  @Get(':id')
  async getWithdrawal(@Param('id') withdrawalId: string): Promise<Withdrawal> {
    return this.withdrawalService.getWithdrawal(withdrawalId);
  }
}

@Controller('admin/withdrawals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminWithdrawalsController {
  constructor(private readonly withdrawalService: WithdrawalService) {}

  /**
   * Get pending withdrawals for admin review
   */
  @Get('pending')
  async getPendingWithdrawals(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<Withdrawal[]> {
    return this.withdrawalService.getPendingWithdrawals(limit);
  }

  /**
   * Get a specific withdrawal (admin view)
   */
  @Get(':id')
  async getWithdrawal(@Param('id') withdrawalId: string): Promise<Withdrawal> {
    return this.withdrawalService.getWithdrawal(withdrawalId);
  }

  /**
   * Approve a withdrawal
   */
  @Post(':id/approve')
  async approveWithdrawal(
    @Request() req: any,
    @Param('id') withdrawalId: string,
    @Body() approveDto: ApproveWithdrawalDto,
  ): Promise<Withdrawal> {
    return this.withdrawalService.approveWithdrawal(withdrawalId, req.user.userId, approveDto);
  }

  /**
   * Reject a withdrawal
   */
  @Post(':id/reject')
  async rejectWithdrawal(
    @Request() req: any,
    @Param('id') withdrawalId: string,
    @Body() rejectDto: RejectWithdrawalDto,
  ): Promise<Withdrawal> {
    return this.withdrawalService.rejectWithdrawal(withdrawalId, req.user.userId, rejectDto);
  }
}
