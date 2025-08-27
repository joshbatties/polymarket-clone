import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class HashService {
  /**
   * Hash a password using Argon2id with security parameters that exceed OWASP recommendations
   * - memoryCost: 64MB (minimum requirement)
   * - timeCost: 3 iterations (minimum requirement)
   * - parallelism: 1 thread (minimum requirement)
   */
  async hashPassword(password: string): Promise<string> {
    try {
      return await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536, // 64MB in KiB
        timeCost: 3,
        parallelism: 1,
        hashLength: 32,
      });
    } catch (error) {
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      // Always return false on verification errors (security)
      return false;
    }
  }

  /**
   * Hash a refresh token for storage
   */
  async hashRefreshToken(token: string): Promise<string> {
    try {
      return await argon2.hash(token, {
        type: argon2.argon2id,
        memoryCost: 32768, // 32MB for refresh tokens (lighter)
        timeCost: 2,
        parallelism: 1,
        hashLength: 32,
      });
    } catch (error) {
      throw new Error(`Token hashing failed: ${error.message}`);
    }
  }

  /**
   * Verify a refresh token against its hash
   */
  async verifyRefreshToken(token: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, token);
    } catch (error) {
      return false;
    }
  }
}
