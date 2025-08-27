import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, VerifyEmailDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimitConfigs, RateLimitKeyGenerators } from '../rate-limit/rate-limit.config';
import { User, UserRole } from '../entities';

interface RequestWithUser extends Request {
  user: User;
}

@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @RateLimit({
    ...RateLimitConfigs.AUTH_REGISTER,
    keyGenerator: RateLimitKeyGenerators.byIp,
  })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto, @Req() req: Request) {
    const ipAddress = this.getIpAddress(req);
    const result = await this.authService.register(registerDto, ipAddress);
    
    this.logger.log(`Registration attempt from IP: ${ipAddress}`);
    
    return {
      success: true,
      message: result.message,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        emailVerified: result.user.emailVerified,
      },
    };
  }

  @Post('login')
  @RateLimit({
    ...RateLimitConfigs.AUTH_LOGIN,
    keyGenerator: RateLimitKeyGenerators.byEmail,
  })
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ipAddress = this.getIpAddress(req);
    const tokens = await this.authService.login(loginDto, ipAddress);
    
    this.logger.log(`Login attempt from IP: ${ipAddress}`);
    
    return {
      success: true,
      message: 'Login successful',
      ...tokens,
    };
  }

  @Post('verify-email')
  @RateLimit(RateLimitConfigs.EMAIL_SEND)
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    const result = await this.authService.verifyEmail(verifyEmailDto);
    
    return {
      success: true,
      message: result.message,
      user: {
        id: result.user.id,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        emailVerifiedAt: result.user.emailVerifiedAt,
      },
    };
  }

  @Post('refresh')
  @RateLimit(RateLimitConfigs.AUTH_REFRESH)
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = this.getIpAddress(req);
    const tokens = await this.authService.refreshToken(
      refreshTokenDto.refreshToken,
      ipAddress,
    );
    
    return {
      success: true,
      message: 'Token refreshed',
      ...tokens,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@Body() refreshTokenDto: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = this.getIpAddress(req);
    await this.authService.logout(refreshTokenDto.refreshToken, ipAddress);
    
    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: User, @Req() req: Request) {
    const ipAddress = this.getIpAddress(req);
    await this.authService.logoutAll(user.id, ipAddress);
    
    return {
      success: true,
      message: 'Logged out from all devices',
    };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body('email') email: string) {
    const result = await this.authService.resendEmailVerification(email);
    
    return {
      success: true,
      message: result.message,
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: User) {
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt,
        mfaEnabled: user.mfaEnabled,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  @Get('admin/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async adminTest(@CurrentUser() user: User) {
    return {
      success: true,
      message: 'Admin access granted',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Extract IP address from request
   */
  private getIpAddress(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
}
