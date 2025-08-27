import { Module } from '@nestjs/common';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountService } from './services/bank-account.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [BankAccountsController],
  providers: [BankAccountService, PrismaService],
  exports: [BankAccountService],
})
export class BankAccountsModule {}
