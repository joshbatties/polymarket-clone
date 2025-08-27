export interface KycDocumentRequest {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  documentType: string;
  documentFile?: Buffer;
  selfieFile?: Buffer;
}

export interface KycVerificationResult {
  success: boolean;
  providerRef: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW';
  reasonCode?: string;
  reasonMessage?: string;
  confidence?: number; // 0-100
  riskScore?: number; // 0-100
  extractedData?: {
    documentNumber?: string;
    fullName?: string;
    dateOfBirth?: Date;
    address?: string;
    expiryDate?: Date;
  };
  checks?: {
    documentAuthenticity?: boolean;
    faceMatch?: boolean;
    ageVerification?: boolean;
    addressVerification?: boolean;
  };
}

export interface SanctionsCheckResult {
  isMatch: boolean;
  riskScore: number; // 0-100
  matches?: Array<{
    name: string;
    type: 'SANCTIONS' | 'PEP' | 'ADVERSE_MEDIA';
    confidence: number;
    listName: string;
  }>;
}

export interface KycProviderInterface {
  /**
   * Initialize a KYC verification session
   */
  initiateVerification(userId: string, request: KycDocumentRequest): Promise<KycVerificationResult>;
  
  /**
   * Check the status of an ongoing verification
   */
  checkVerificationStatus(providerRef: string): Promise<KycVerificationResult>;
  
  /**
   * Perform sanctions and PEP checks
   */
  performSanctionsCheck(fullName: string, dateOfBirth: Date, country: string): Promise<SanctionsCheckResult>;
  
  /**
   * Get provider-specific webhook verification
   */
  verifyWebhookSignature?(payload: string, signature: string, secret: string): boolean;
  
  /**
   * Parse webhook payload from provider
   */
  parseWebhookPayload?(payload: any): {
    providerRef: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW';
    reason?: string;
  };
}

export interface KycProviderConfig {
  apiKey: string;
  apiSecret?: string;
  webhookSecret?: string;
  environment: 'sandbox' | 'production';
  baseUrl?: string;
}

export enum KycProviderType {
  MOCK = 'MOCK',
  ONFIDO = 'ONFIDO',
  SUMSUB = 'SUMSUB',
}
