import { Module } from '@nestjs/common';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AdminAuditController],
  providers: [AdminAuditService, PrismaService],
  exports: [AdminAuditService],
})
export class AdminAuditModule {}
