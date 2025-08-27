import { Injectable, Logger } from '@nestjs/common';
import {
  KycProviderInterface,
  KycDocumentRequest,
  KycVerificationResult,
  SanctionsCheckResult,
  KycProviderConfig,
} from '../interfaces/kyc-provider.interface';

@Injectable()
export class MockKycProvider implements KycProviderInterface {
  private readonly logger = new Logger(MockKycProvider.name);
  private verificationStore = new Map<string, KycVerificationResult>();

  constructor(private readonly config: KycProviderConfig) {}

  async initiateVerification(
    userId: string,
    request: KycDocumentRequest
  ): Promise<KycVerificationResult> {
    this.logger.log(`Initiating mock KYC verification for user ${userId}`);

    const providerRef = `mock_${userId}_${Date.now()}`;
    
    // Simulate various outcomes based on test data patterns
    const result = this.generateMockResult(providerRef, request);
    
    // Store the result for status checking
    this.verificationStore.set(providerRef, result);
    
    // Simulate async processing delay
    if (result.status === 'PENDING') {
      setTimeout(() => {
        const finalResult = { ...result, status: 'APPROVED' as const };
        this.verificationStore.set(providerRef, finalResult);
        this.logger.log(`Mock verification ${providerRef} auto-approved`);
      }, 5000); // Auto-approve after 5 seconds
    }

    return result;
  }

  async checkVerificationStatus(providerRef: string): Promise<KycVerificationResult> {
    this.logger.log(`Checking status for verification ${providerRef}`);
    
    const result = this.verificationStore.get(providerRef);
    if (!result) {
      throw new Error(`Verification ${providerRef} not found`);
    }

    return result;
  }

  async performSanctionsCheck(
    fullName: string,
    dateOfBirth: Date,
    country: string
  ): Promise<SanctionsCheckResult> {
    this.logger.log(`Performing mock sanctions check for ${fullName}`);

    // Simulate different outcomes based on test names
    if (fullName.toLowerCase().includes('blocked')) {
      return {
        isMatch: true,
        riskScore: 95,
        matches: [{
          name: fullName,
          type: 'SANCTIONS',
          confidence: 0.95,
          listName: 'OFAC SDN',
        }],
      };
    }

    if (fullName.toLowerCase().includes('pep')) {
      return {
        isMatch: true,
        riskScore: 75,
        matches: [{
          name: fullName,
          type: 'PEP',
          confidence: 0.85,
          listName: 'PEP Database',
        }],
      };
    }

    // Default: clean result
    return {
      isMatch: false,
      riskScore: 5,
    };
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // Mock webhook verification - always true for testing
    return signature === `mock_signature_${secret}`;
  }

  parseWebhookPayload(payload: any): {
    providerRef: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW';
    reason?: string;
  } {
    return {
      providerRef: payload.id || payload.verification_id,
      status: payload.status || 'PENDING',
      reason: payload.reason,
    };
  }

  private generateMockResult(
    providerRef: string,
    request: KycDocumentRequest
  ): KycVerificationResult {
    const { firstName, lastName, dateOfBirth } = request;
    
    // Calculate age
    const age = new Date().getFullYear() - dateOfBirth.getFullYear();
    
    // Simulate rejection for underage users
    if (age < 18) {
      return {
        success: false,
        providerRef,
        status: 'REJECTED',
        reasonCode: 'AGE_VERIFICATION_FAILED',
        reasonMessage: 'User is under 18 years old',
        confidence: 100,
        riskScore: 100,
        checks: {
          ageVerification: false,
          documentAuthenticity: true,
          faceMatch: true,
          addressVerification: true,
        },
      };
    }

    // Simulate rejection for certain test names
    if (firstName.toLowerCase().includes('reject') || lastName.toLowerCase().includes('reject')) {
      return {
        success: false,
        providerRef,
        status: 'REJECTED',
        reasonCode: 'DOCUMENT_VERIFICATION_FAILED',
        reasonMessage: 'Document verification failed',
        confidence: 85,
        riskScore: 75,
        checks: {
          documentAuthenticity: false,
          faceMatch: true,
          ageVerification: true,
          addressVerification: true,
        },
      };
    }

    // Simulate pending status for certain test names
    if (firstName.toLowerCase().includes('pending') || lastName.toLowerCase().includes('pending')) {
      return {
        success: true,
        providerRef,
        status: 'PENDING',
        confidence: 90,
        riskScore: 15,
        extractedData: {
          documentNumber: `MOCK${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          fullName: `${firstName} ${lastName}`,
          dateOfBirth,
          address: request.address,
        },
        checks: {
          documentAuthenticity: true,
          faceMatch: true,
          ageVerification: true,
          addressVerification: true,
        },
      };
    }

    // Default: immediate approval
    return {
      success: true,
      providerRef,
      status: 'APPROVED',
      confidence: 95,
      riskScore: 10,
      extractedData: {
        documentNumber: `MOCK${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        fullName: `${firstName} ${lastName}`,
        dateOfBirth,
        address: request.address,
      },
      checks: {
        documentAuthenticity: true,
        faceMatch: true,
        ageVerification: true,
        addressVerification: true,
      },
    };
  }
}
