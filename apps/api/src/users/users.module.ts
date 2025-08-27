import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { HashService } from '../auth/services/hash.service';

@Module({
  providers: [UsersService, PrismaService, HashService],
  exports: [UsersService],
})
export class UsersModule {}