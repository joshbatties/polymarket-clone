import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StructuredLoggingService } from './logging.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [StructuredLoggingService],
  exports: [StructuredLoggingService],
})
export class LoggingModule {}
