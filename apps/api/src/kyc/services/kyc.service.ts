import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { KycProviderInterface, KycProviderType } from '../interfaces/kyc-provider.interface';
import { MockKycProvider } from '../providers/mock-kyc.provider';
import { StartKycDto } from '../dto/start-kyc.dto';
import { KycStatus, GeographicRestriction } from '@prisma/client';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private kycProvider: KycProviderInterface;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.initializeProvider();
  }

  private initializeProvider() {
    const providerType = (this.configService.get('KYC_PROVIDER') || 'MOCK') as KycProviderType;
    
    switch (providerType) {
      case KycProviderType.MOCK:
        this.kycProvider = new MockKycProvider({
          apiKey: 'mock-key',
          environment: 'sandbox',
        });
        break;
      case KycProviderType.ONFIDO:
        // TODO: Implement Onfido provider
        throw new Error('Onfido provider not yet implemented');
      case KycProviderType.SUMSUB:
        // TODO: Implement Sumsub provider
        throw new Error('Sumsub provider not yet implemented');
      default:
        throw new Error(`Unknown KYC provider: ${providerType}`);
    }

    this.logger.log(`Initialized KYC provider: ${providerType}`);
  }

  async startKycVerification(userId: string, startKycDto: StartKycDto) {
    this.logger.log(`Starting KYC verification for user ${userId}`);

    // Check if user already has a KYC profile
    const existingKyc = await this.prisma.kycProfile.findUnique({
      where: { userId },
    });

    if (existingKyc) {
      if (existingKyc.status === KycStatus.APPROVED) {
        throw new BadRequestException('User is already KYC verified');
      }
      if (existingKyc.status === KycStatus.UNDER_REVIEW) {
        throw new BadRequestException('KYC verification is already in progress');
      }
    }

    // Age verification
    const dateOfBirth = new Date(startKycDto.dateOfBirth);
    const age = this.calculateAge(dateOfBirth);
    
    if (age < 18) {
      throw new BadRequestException('Users must be 18 years or older');
    }

    // Geographic restriction check
    const isAustralian = startKycDto.country === 'AU' || 
                        startKycDto.citizenshipCountry === 'AU' || 
                        startKycDto.residencyCountry === 'AU';
    
    if (!isAustralian) {
      throw new BadRequestException('Service is only available to Australian residents');
    }

    // Start provider verification
    const providerResult = await this.kycProvider.initiateVerification(userId, {
      firstName: startKycDto.firstName,
      lastName: startKycDto.lastName,
      dateOfBirth,
      address: startKycDto.address,
      city: startKycDto.city,
      state: startKycDto.state,
      postcode: startKycDto.postcode,
      country: startKycDto.country,
      documentType: startKycDto.documentType,
    });

    // Perform sanctions check
    const sanctionsResult = await this.kycProvider.performSanctionsCheck(
      `${startKycDto.firstName} ${startKycDto.lastName}`,
      dateOfBirth,
      startKycDto.country
    );

    // Create or update KYC profile
    const kycData = {
      status: this.mapProviderStatusToPrisma(providerResult.status),
      fullName: `${startKycDto.firstName} ${startKycDto.lastName}`,
      dateOfBirth,
      address: startKycDto.address,
      city: startKycDto.city,
      state: startKycDto.state,
      postcode: startKycDto.postcode,
      country: startKycDto.country,
      documentType: startKycDto.documentType,
      documentNumber: startKycDto.documentNumber || providerResult.extractedData?.documentNumber,
      providerRef: providerResult.providerRef,
      providerType: this.configService.get('KYC_PROVIDER', 'MOCK'),
      
      // Age verification
      isAgeVerified: age >= 18,
      ageAtSubmission: age,
      
      // Geographic verification
      citizenshipCountry: startKycDto.citizenshipCountry || startKycDto.country,
      residencyCountry: startKycDto.residencyCountry || startKycDto.country,
      geoRestriction: isAustralian ? GeographicRestriction.ALLOWED : GeographicRestriction.BLOCKED,
      
      // AML checks
      sanctionsChecked: true,
      sanctionsMatch: sanctionsResult.isMatch,
      pepChecked: true,
      pepMatch: sanctionsResult.matches?.some(m => m.type === 'PEP') || false,
      amlRiskScore: sanctionsResult.riskScore,
      
      submittedAt: new Date(),
    };

    if (providerResult.status === 'APPROVED') {
      (kycData as any)['approvedAt'] = new Date();
    } else if (providerResult.status === 'REJECTED') {
      (kycData as any)['rejectedAt'] = new Date();
      (kycData as any)['reviewNotes'] = providerResult.reasonMessage;
    }

    const kycProfile = await this.prisma.kycProfile.upsert({
      where: { userId },
      update: kycData,
      create: {
        userId,
        ...kycData,
      },
    });

    // Log AML event if high risk
    if (sanctionsResult.riskScore > 50 || sanctionsResult.isMatch) {
      await this.logAmlEvent(
        userId,
        'SANCTIONS_CHECK',
        sanctionsResult.isMatch ? 'REJECTED' : 'PENDING',
        `Sanctions/PEP check: Risk score ${sanctionsResult.riskScore}`,
        sanctionsResult.riskScore,
        {
          matches: sanctionsResult.matches,
          kycSubmission: true,
        }
      );
    }

    return {
      status: kycProfile.status,
      providerRef: kycProfile.providerRef,
      requiresManualReview: sanctionsResult.isMatch || sanctionsResult.riskScore > 70,
      message: this.getStatusMessage(kycProfile.status, sanctionsResult.isMatch),
    };
  }

  async getKycStatus(userId: string) {
    const kycProfile = await this.prisma.kycProfile.findUnique({
      where: { userId },
      select: {
        status: true,
        providerRef: true,
        submittedAt: true,
        approvedAt: true,
        rejectedAt: true,
        reviewNotes: true,
        isAgeVerified: true,
        geoRestriction: true,
        sanctionsMatch: true,
        pepMatch: true,
        amlRiskScore: true,
      },
    });

    if (!kycProfile) {
      throw new NotFoundException('KYC profile not found');
    }

    // Check with provider for updated status if pending
    if (kycProfile.status === KycStatus.UNDER_REVIEW && kycProfile.providerRef) {
      try {
        const providerStatus = await this.kycProvider.checkVerificationStatus(kycProfile.providerRef);
        
        if (providerStatus.status !== 'PENDING' && providerStatus.status !== 'UNDER_REVIEW') {
          // Update status based on provider response
          const updatedKyc = await this.updateKycFromProvider(userId, providerStatus);
          return this.formatKycStatus(updatedKyc);
        }
      } catch (error) {
        this.logger.warn(`Failed to check provider status for ${kycProfile.providerRef}: ${error.message}`);
      }
    }

    return this.formatKycStatus(kycProfile);
  }

  async checkDepositEligibility(userId: string, amountCents: number): Promise<{
    allowed: boolean;
    reason?: string;
    requiresKyc: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { kycProfile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check responsible gambling status
    if (user.rgStatus === 'SELF_EXCLUDED') {
      return {
        allowed: false,
        reason: 'User is self-excluded from gambling',
        requiresKyc: false,
      };
    }

    if (user.rgStatus === 'COOLING_OFF') {
      return {
        allowed: false,
        reason: 'User is in cooling-off period',
        requiresKyc: false,
      };
    }

    // Check KYC requirements
    const depositThreshold = this.configService.get('KYC_DEPOSIT_THRESHOLD_CENTS', 50000); // $500 default
    
    if (amountCents > depositThreshold) {
      if (!user.kycProfile || user.kycProfile.status !== KycStatus.APPROVED) {
        return {
          allowed: false,
          reason: 'KYC verification required for deposits over threshold',
          requiresKyc: true,
        };
      }
    }

    return {
      allowed: true,
      requiresKyc: false,
    };
  }

  async checkWithdrawalEligibility(userId: string, amountCents: number): Promise<{
    allowed: boolean;
    reason?: string;
    requiresKyc: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { kycProfile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // KYC is always required for withdrawals
    if (!user.kycProfile || user.kycProfile.status !== KycStatus.APPROVED) {
      return {
        allowed: false,
        reason: 'KYC verification required for withdrawals',
        requiresKyc: true,
      };
    }

    // Check responsible gambling status
    if (user.rgStatus === 'SELF_EXCLUDED') {
      return {
        allowed: false,
        reason: 'User is self-excluded from gambling',
        requiresKyc: false,
      };
    }

    return {
      allowed: true,
      requiresKyc: false,
    };
  }

  private async updateKycFromProvider(userId: string, providerResult: any) {
    const updateData: any = {
      status: this.mapProviderStatusToPrisma(providerResult.status),
    };

    if (providerResult.status === 'APPROVED') {
      updateData.approvedAt = new Date();
    } else if (providerResult.status === 'REJECTED') {
      updateData.rejectedAt = new Date();
      updateData.reviewNotes = providerResult.reasonMessage;
    }

    return await this.prisma.kycProfile.update({
      where: { userId },
      data: updateData,
    });
  }

  private mapProviderStatusToPrisma(providerStatus: string): KycStatus {
    switch (providerStatus) {
      case 'PENDING':
      case 'UNDER_REVIEW':
        return KycStatus.UNDER_REVIEW;
      case 'APPROVED':
        return KycStatus.APPROVED;
      case 'REJECTED':
        return KycStatus.REJECTED;
      default:
        return KycStatus.PENDING;
    }
  }

  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      age--;
    }
    
    return age;
  }

  private getStatusMessage(status: KycStatus, sanctionsMatch: boolean): string {
    if (sanctionsMatch) {
      return 'Your submission requires manual review due to compliance checks';
    }

    switch (status) {
      case KycStatus.PENDING:
        return 'Your KYC verification is being processed';
      case KycStatus.UNDER_REVIEW:
        return 'Your documents are under review';
      case KycStatus.APPROVED:
        return 'Your identity has been verified successfully';
      case KycStatus.REJECTED:
        return 'Your verification was not successful. Please contact support for assistance';
      default:
        return 'Unknown status';
    }
  }

  private formatKycStatus(kycProfile: any) {
    return {
      status: kycProfile.status,
      submittedAt: kycProfile.submittedAt,
      approvedAt: kycProfile.approvedAt,
      rejectedAt: kycProfile.rejectedAt,
      reviewNotes: kycProfile.reviewNotes,
      checks: {
        ageVerified: kycProfile.isAgeVerified,
        geoAllowed: kycProfile.geoRestriction === GeographicRestriction.ALLOWED,
        sanctionsClean: !kycProfile.sanctionsMatch,
        pepClean: !kycProfile.pepMatch,
        amlRiskScore: kycProfile.amlRiskScore,
      },
    };
  }

  private async logAmlEvent(
    userId: string,
    eventType: string,
    status: string,
    description: string,
    riskScore?: number,
    metadata?: any
  ) {
    await this.prisma.amlEvent.create({
      data: {
        userId,
        eventType: eventType as any,
        status: status as any,
        description,
        riskScore,
        metadata,
      },
    });
  }
}
