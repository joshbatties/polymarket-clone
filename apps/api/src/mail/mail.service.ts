import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';

export interface EmailVerificationPayload {
  userId: string;
  email: string;
  purpose: 'email_verification';
  iat: number;
  exp: number;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly jwtSecret: Uint8Array;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get('JWT_SECRET', 'fallback-secret-key');
    this.jwtSecret = new TextEncoder().encode(secret);
  }

  /**
   * Generate email verification token (JWS) with 24h expiry
   */
  async generateEmailVerificationToken(
    userId: string,
    email: string,
  ): Promise<string> {
    try {
      const token = await new SignJWT({
        userId,
        email,
        purpose: 'email_verification',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .setIssuer('aussie-markets-api')
        .setAudience('aussie-markets-mobile')
        .sign(this.jwtSecret);

      return token;
    } catch (error) {
      this.logger.error('Failed to generate email verification token:', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Verify email verification token
   */
  async verifyEmailVerificationToken(
    token: string,
  ): Promise<EmailVerificationPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwtSecret, {
        issuer: 'aussie-markets-api',
        audience: 'aussie-markets-mobile',
      });

      // Validate payload structure
      if (
        !payload.userId ||
        !payload.email ||
        payload.purpose !== 'email_verification'
      ) {
        throw new Error('Invalid token payload');
      }

      return payload as unknown as EmailVerificationPayload;
    } catch (error) {
      this.logger.error('Email verification token verification failed:', error);
      throw new Error('Invalid or expired verification token');
    }
  }

  /**
   * Send email verification email (stub implementation for dev)
   * In production, this would integrate with SES, SendGrid, etc.
   */
  async sendEmailVerification(email: string, token: string): Promise<void> {
    const verificationUrl = this.buildVerificationUrl(token);

    // Development: Log to console
    if (this.configService.get('NODE_ENV') === 'development') {
      this.logger.log('📧 EMAIL VERIFICATION (DEV MODE)');
      this.logger.log('================================');
      this.logger.log(`To: ${email}`);
      this.logger.log(`Subject: Verify your Aussie Markets account`);
      this.logger.log(`\nClick the link below to verify your email address:`);
      this.logger.log(`${verificationUrl}`);
      this.logger.log(`\nThis link expires in 24 hours.`);
      this.logger.log('================================');
      return;
    }

    // Production: Send actual email (implement with your email provider)
    this.logger.log(`Sending email verification to ${email}`);
    // TODO: Integrate with email service provider
    // await this.emailProvider.send({
    //   to: email,
    //   subject: 'Verify your Aussie Markets account',
    //   template: 'email-verification',
    //   data: { verificationUrl }
    // });
  }

  /**
   * Send password reset email (future implementation)
   */
  async sendPasswordReset(email: string, token: string): Promise<void> {
    // TODO: Implement password reset email
    this.logger.log(`Password reset requested for ${email}`);
  }

  /**
   * Build verification URL for the mobile app
   */
  private buildVerificationUrl(token: string): string {
    const baseUrl = this.configService.get(
      'MOBILE_APP_URL',
      'aussie-markets://verify-email',
    );
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }

  /**
   * Validate email format (additional validation)
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
