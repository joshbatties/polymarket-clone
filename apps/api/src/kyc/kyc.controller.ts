import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KycService } from './services/kyc.service';
import { StartKycDto } from './dto/start-kyc.dto';

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(private readonly kycService: KycService) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  async startKycVerification(
    @CurrentUser() user: any,
    @Body() startKycDto: StartKycDto,
  ) {
    this.logger.log(`Starting KYC verification for user ${user.id}`);
    
    try {
      const result = await this.kycService.startKycVerification(user.id, startKycDto);
      
      return {
        success: true,
        data: result,
        message: 'KYC verification initiated successfully',
      };
    } catch (error) {
      this.logger.error(`KYC start failed for user ${user.id}: ${error.message}`);
      throw error;
    }
  }

  @Get('status')
  async getKycStatus(@CurrentUser() user: any) {
    this.logger.log(`Fetching KYC status for user ${user.id}`);
    
    try {
      const status = await this.kycService.getKycStatus(user.id);
      
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      this.logger.error(`KYC status fetch failed for user ${user.id}: ${error.message}`);
      throw error;
    }
  }

  @Get('deposit-eligibility')
  async checkDepositEligibility(
    @CurrentUser() user: any,
    @Body('amountCents') amountCents: number,
  ) {
    try {
      const eligibility = await this.kycService.checkDepositEligibility(user.id, amountCents);
      
      return {
        success: true,
        data: eligibility,
      };
    } catch (error) {
      this.logger.error(`Deposit eligibility check failed for user ${user.id}: ${error.message}`);
      throw error;
    }
  }

  @Get('withdrawal-eligibility')
  async checkWithdrawalEligibility(
    @CurrentUser() user: any,
    @Body('amountCents') amountCents: number,
  ) {
    try {
      const eligibility = await this.kycService.checkWithdrawalEligibility(user.id, amountCents);
      
      return {
        success: true,
        data: eligibility,
      };
    } catch (error) {
      this.logger.error(`Withdrawal eligibility check failed for user ${user.id}: ${error.message}`);
      throw error;
    }
  }
}
