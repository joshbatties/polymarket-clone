import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BankAccountService } from './services/bank-account.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { BankAccount } from '@prisma/client';

@Controller('bank-accounts')
@UseGuards(JwtAuthGuard)
export class BankAccountsController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  /**
   * Create a new bank account for the authenticated user
   */
  @Post()
  async createBankAccount(
    @Request() req: any,
    @Body() createBankAccountDto: CreateBankAccountDto,
  ): Promise<BankAccount> {
    return this.bankAccountService.createBankAccount(req.user.userId, createBankAccountDto);
  }

  /**
   * Get all bank accounts for the authenticated user
   */
  @Get()
  async getUserBankAccounts(@Request() req: any): Promise<BankAccount[]> {
    return this.bankAccountService.getUserBankAccounts(req.user.userId);
  }

  /**
   * Get a specific bank account
   */
  @Get(':id')
  async getBankAccount(@Request() req: any, @Param('id') bankAccountId: string): Promise<BankAccount> {
    return this.bankAccountService.getBankAccount(req.user.userId, bankAccountId);
  }

  /**
   * Set a bank account as primary
   */
  @Put(':id/primary')
  async setPrimaryBankAccount(@Request() req: any, @Param('id') bankAccountId: string): Promise<BankAccount> {
    return this.bankAccountService.setPrimaryBankAccount(req.user.userId, bankAccountId);
  }

  /**
   * Initiate bank account verification
   */
  @Post(':id/verify')
  async initiateVerification(
    @Request() req: any,
    @Param('id') bankAccountId: string,
  ): Promise<{ verificationId: string }> {
    return this.bankAccountService.initiateAccountVerification(req.user.userId, bankAccountId);
  }

  /**
   * Delete a bank account
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBankAccount(@Request() req: any, @Param('id') bankAccountId: string): Promise<void> {
    return this.bankAccountService.deleteBankAccount(req.user.userId, bankAccountId);
  }
}
