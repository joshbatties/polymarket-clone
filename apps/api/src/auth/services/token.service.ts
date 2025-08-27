import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { User, RefreshToken } from '../../entities';
import { HashService } from './hash.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly hashService: HashService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate access JWT token (15 minutes)
   */
  async generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
      secret: this.configService.get('JWT_SECRET'),
    });
  }

  /**
   * Generate opaque refresh token (256-bit random)
   */
  generateRefreshToken(): string {
    return randomBytes(32).toString('hex'); // 256 bits = 32 bytes
  }

  /**
   * Create and store refresh token in database
   */
  async createRefreshToken(
    user: User,
    ipAddress: string,
  ): Promise<RefreshToken> {
    const token = this.generateRefreshToken();
    const tokenHash = await this.hashService.hashRefreshToken(token);

    const refreshToken = await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(
          Date.now() +
            this.parseTimeToMs(
              this.configService.get('REFRESH_TOKEN_EXPIRES_IN', '14d'),
            ),
        ),
        createdByIp: ipAddress,
      },
    });

    // Store the actual token temporarily for return
    (refreshToken as any).token = token;
    return refreshToken;
  }

  /**
   * Generate both access and refresh tokens
   */
  async generateTokenPair(user: User, ipAddress: string): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(user),
      this.createRefreshToken(user, ipAddress),
    ]);

    return {
      accessToken,
      refreshToken: (refreshToken as any).token,
      expiresIn: this.parseTimeToMs(
        this.configService.get('JWT_EXPIRES_IN', '15m'),
      ),
    };
  }

  /**
   * Refresh access token using refresh token (token rotation)
   */
  async refreshAccessToken(
    refreshTokenString: string,
    ipAddress: string,
  ): Promise<AuthTokens> {
    // Find all active refresh tokens to check against
    const refreshTokens = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null },
      include: { user: true },
    });

    let matchedToken: (RefreshToken & { user: User }) | null = null;

    // Check each token to find a match
    for (const tokenRecord of refreshTokens) {
      const isValid = await this.hashService.verifyRefreshToken(
        refreshTokenString,
        tokenRecord.tokenHash,
      );
      if (isValid) {
        matchedToken = tokenRecord as any;
        break;
      }
    }

    if (!matchedToken || matchedToken.revokedAt !== null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = matchedToken.user;

    // Generate new token pair
    const newTokens = await this.generateTokenPair(user, ipAddress);

    // Revoke old refresh token and mark replacement
    await this.prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: {
        revokedAt: new Date(),
        revokedByIp: ipAddress,
        replacedByToken: newTokens.refreshToken,
      },
    });

    return newTokens;
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(
    refreshTokenString: string,
    ipAddress: string,
  ): Promise<void> {
    const refreshTokens = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null },
    });

    for (const tokenRecord of refreshTokens) {
      const isValid = await this.hashService.verifyRefreshToken(
        refreshTokenString,
        tokenRecord.tokenHash,
      );
      if (isValid) {
        await this.prisma.refreshToken.update({
          where: { id: tokenRecord.id },
          data: {
            revokedAt: new Date(),
            revokedByIp: ipAddress,
          },
        });
        return;
      }
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllUserTokens(userId: string, ipAddress: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedByIp: ipAddress },
    });
  }

  /**
   * Verify JWT access token
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      return this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  /**
   * Clean up expired refresh tokens (should be run periodically)
   */
  async cleanupExpiredTokens(): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }

  /**
   * Parse time string to milliseconds (e.g., '15m', '14d', '1h')
   */
  private parseTimeToMs(timeString: string): number {
    const timeMap = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    const unit = timeString.slice(-1) as keyof typeof timeMap;
    const value = parseInt(timeString.slice(0, -1));

    if (!timeMap[unit] || isNaN(value)) {
      throw new Error(`Invalid time format: ${timeString}`);
    }

    return value * timeMap[unit];
  }
}
