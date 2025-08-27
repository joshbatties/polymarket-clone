import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TokenService, AuthTokens } from './services/token.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto, LoginDto, VerifyEmailDto } from './dto';
import { User } from '../entities';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Register a new user
   */
  async register(registerDto: RegisterDto, ipAddress: string): Promise<{
    user: User;
    message: string;
  }> {
    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(registerDto.password, saltRounds);

    // Create user with hashed password
    const user = await this.usersService.create(registerDto, passwordHash);

    // Generate email verification token
    const verificationToken = await this.mailService.generateEmailVerificationToken(
      user.id,
      user.email,
    );

    // Send verification email
    await this.mailService.sendEmailVerification(user.email, verificationToken);

    this.logger.log(`User registered: ${user.email}`);

    return {
      user,
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  /**
   * Login user
   */
  async login(loginDto: LoginDto, ipAddress: string): Promise<AuthTokens> {
    const { email, password } = loginDto;

    // Validate user credentials
    const user = await this.usersService.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if email is verified
    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address before logging in',
      );
    }

    // Update last login
    await this.usersService.updateLastLogin(user.id, ipAddress);

    // Generate token pair
    const tokens = await this.tokenService.generateTokenPair(user, ipAddress);

    this.logger.log(`User logged in: ${user.email}`);

    return tokens;
  }

  /**
   * Verify email address
   */
  async verifyEmail(verifyEmailDto: VerifyEmailDto): Promise<{
    message: string;
    user: User;
  }> {
    const { token } = verifyEmailDto;

    try {
      // Verify token
      const payload = await this.mailService.verifyEmailVerificationToken(token);

      // Get user
      const user = await this.usersService.findByIdOrThrow(payload.userId);

      // Check if email matches
      if (user.email !== payload.email) {
        throw new BadRequestException('Token email mismatch');
      }

      // Mark email as verified
      const verifiedUser = await this.usersService.markEmailAsVerified(user.id);

      this.logger.log(`Email verified: ${user.email}`);

      return {
        message: 'Email verification successful',
        user: verifiedUser,
      };
    } catch (error) {
      this.logger.error('Email verification failed:', error.message);
      throw new BadRequestException('Invalid or expired verification token');
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    refreshTokenString: string,
    ipAddress: string,
  ): Promise<AuthTokens> {
    return this.tokenService.refreshAccessToken(refreshTokenString, ipAddress);
  }

  /**
   * Logout user (revoke refresh token)
   */
  async logout(refreshTokenString: string, ipAddress: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(refreshTokenString, ipAddress);
  }

  /**
   * Logout from all devices (revoke all refresh tokens)
   */
  async logoutAll(userId: string, ipAddress: string): Promise<void> {
    await this.tokenService.revokeAllUserTokens(userId, ipAddress);
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Don't reveal whether user exists for security
      return { message: 'If an account exists, verification email has been sent' };
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generate new verification token
    const verificationToken = await this.mailService.generateEmailVerificationToken(
      user.id,
      user.email,
    );

    // Send verification email
    await this.mailService.sendEmailVerification(user.email, verificationToken);

    return { message: 'Verification email sent' };
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: string): Promise<User> {
    return this.usersService.findByIdOrThrow(userId);
  }

  /**
   * Generate token pair directly (for tests)
   */
  async generateTokens(user: User, ipAddress: string = 'test'): Promise<AuthTokens> {
    return this.tokenService.generateTokenPair(user, ipAddress);
  }

  /**
   * Refresh tokens directly (for tests)
   */
  async refreshTokens(refreshTokenString: string, ipAddress: string = 'test'): Promise<AuthTokens> {
    return this.tokenService.refreshAccessToken(refreshTokenString, ipAddress);
  }

  /**
   * Validate JWT payload and return user
   */
  async validateJwtPayload(payload: any): Promise<User> {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return user;
  }
}
