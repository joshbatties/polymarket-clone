import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { LedgerService, TransactionRequest } from './ledger.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { LedgerEntryType } from '@prisma/client';

@Controller('ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  /**
   * Post a new transaction (Admin only)
   */
  @Post('transactions')
  @Roles(UserRole.ADMIN)
  async postTransaction(@Body() request: TransactionRequest) {
    return this.ledgerService.postTransaction(request);
  }

  /**
   * Get transaction by ID
   */
  @Get('transactions/:id')
  @Roles(UserRole.ADMIN)
  async getTransaction(@Param('id') id: string) {
    return this.ledgerService.getTransaction(id);
  }

  /**
   * Get account ledger
   */
  @Get('accounts/:accountId/ledger')
  @Roles(UserRole.ADMIN)
  async getAccountLedger(
    @Param('accountId') accountId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('entryType') entryType?: LedgerEntryType,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const options = {
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
      entryType,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    };

    return this.ledgerService.getAccountLedger(accountId, options);
  }

  /**
   * Get account balance
   */
  @Get('accounts/:accountId/balance')
  @Roles(UserRole.ADMIN)
  async getAccountBalance(@Param('accountId') accountId: string) {
    return this.ledgerService.getAccountBalance(accountId);
  }

  /**
   * Clean up expired idempotency keys
   */
  @Post('cleanup/idempotency-keys')
  @Roles(UserRole.ADMIN)
  async cleanupExpiredIdempotencyKeys() {
    const count = await this.ledgerService.cleanupExpiredIdempotencyKeys();
    return { message: `Cleaned up ${count} expired idempotency keys` };
  }
}
