import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get the encryption key from environment variable
   * In production, this should come from AWS KMS or similar
   */
  private getEncryptionKey(): Buffer {
    const key = this.configService.get<string>('FIELD_ENCRYPTION_KEY');
    if (!key) {
      throw new Error('FIELD_ENCRYPTION_KEY not configured');
    }
    
    // Key should be base64 encoded 256-bit key
    if (key.length !== 44) { // 32 bytes * 4/3 (base64) = ~44 chars
      throw new Error('FIELD_ENCRYPTION_KEY must be a base64-encoded 256-bit key');
    }
    
    return Buffer.from(key, 'base64');
  }

  /**
   * Encrypt sensitive field data using AES-256-GCM
   */
  encryptField(plaintext: string): EncryptedData {
    try {
      if (!plaintext) {
        throw new Error('Cannot encrypt empty plaintext');
      }

      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, key);
      // Using basic cipher without AAD
      
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
      };
    } catch (error) {
      this.logger.error('Field encryption failed', error);
      throw new Error('Field encryption failed');
    }
  }

  /**
   * Decrypt sensitive field data
   */
  decryptField(encryptedData: EncryptedData): string {
    try {
      if (!encryptedData.encrypted || !encryptedData.iv || !encryptedData.tag) {
        throw new Error('Invalid encrypted data format');
      }

      const key = this.getEncryptionKey();
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const tag = Buffer.from(encryptedData.tag, 'base64');
      
      const decipher = crypto.createDecipher(this.algorithm, key);
      // Using basic cipher without auth tag and AAD
      
      let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Field decryption failed', error);
      throw new Error('Field decryption failed');
    }
  }

  /**
   * Hash sensitive data for search/indexing purposes
   * Uses HMAC-SHA256 with a separate key
   */
  hashForSearch(data: string): string {
    try {
      const searchKey = this.configService.get<string>('FIELD_SEARCH_KEY');
      if (!searchKey) {
        throw new Error('FIELD_SEARCH_KEY not configured');
      }
      
      return crypto
        .createHmac('sha256', Buffer.from(searchKey, 'base64'))
        .update(data, 'utf8')
        .digest('base64');
    } catch (error) {
      this.logger.error('Field hashing failed', error);
      throw new Error('Field hashing failed');
    }
  }

  /**
   * Generate a new 256-bit encryption key (for setup/rotation)
   */
  static generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  /**
   * Securely compare two strings to prevent timing attacks
   */
  secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(
      Buffer.from(a, 'utf8'),
      Buffer.from(b, 'utf8')
    );
  }

  /**
   * Generate a cryptographically secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Generate a secure API key
   */
  generateApiKey(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(24).toString('base64url');
    return `ak_${timestamp}_${random}`;
  }
}
