import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
// TelemetryService removed for simplification
import { AlertingService } from './alerting.service';
import { MonitoringMiddleware } from './monitoring.middleware';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { LoggingModule } from '../logging/logging.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    ScheduleModule,
    LoggingModule,
  ],
  controllers: [HealthController],
  providers: [
    AlertingService,
    MonitoringMiddleware,
    PrismaService,
  ],
  exports: [
    AlertingService,
    MonitoringMiddleware,
  ],
})
export class ObservabilityModule {}
