import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export interface CreateUserDto {
  email: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto, passwordHash: string): Promise<User> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: createUserDto.email.toLowerCase(),
          passwordHash,
          firstName: createUserDto.firstName,
          lastName: createUserDto.lastName,
          phoneNumber: createUserDto.phoneNumber,
          role: UserRole.USER,
          emailVerified: false,
          isActive: true,
        },
      });

      return user;
    } catch (error) {
      if (error.code === 'P2002') {
        // Unique constraint violation
        throw new ConflictException('Email already exists');
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: updates,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        // Record not found
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }

  async markEmailAsVerified(userId: string): Promise<User> {
    return this.update(userId, {
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
  }

  async updateLastLogin(userId: string, ipAddress: string): Promise<void> {
    await this.update(userId, {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
    });
  }

  async deactivateUser(userId: string): Promise<User> {
    return this.update(userId, {
      isActive: false,
    });
  }

  async activateUser(userId: string): Promise<User> {
    return this.update(userId, {
      isActive: true,
    });
  }

  async changeRole(userId: string, role: UserRole): Promise<User> {
    return this.update(userId, {
      role,
    });
  }

  async getUserProfile(userId: string): Promise<Omit<User, 'passwordHash'> | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        emailVerified: true,
        emailVerifiedAt: true,
        mfaEnabled: true,
        mfaSecret: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        isActive: true,
        lastLoginAt: true,
        lastLoginIp: true,
        rgStatus: true,
        dailyDepositLimitCents: true,
        weeklyDepositLimitCents: true,
        selfExcludedAt: true,
        selfExclusionEndAt: true,
        coolingOffEndAt: true,
        ipCountryCode: true,
        lastLocationLat: true,
        lastLocationLon: true,
        locationPermissionGranted: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async getUsersCount(): Promise<number> {
    return this.prisma.user.count();
  }

  async getActiveUsersCount(): Promise<number> {
    return this.prisma.user.count({
      where: { isActive: true },
    });
  }

  async searchUsers(query: {
    search?: string;
    role?: UserRole;
    isActive?: boolean;
    cursor?: string;
    limit?: number;
  }): Promise<{ users: User[]; hasMore: boolean; nextCursor: string | null }> {
    const { search, role, isActive, cursor, limit = 20 } = query;

    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role !== undefined) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        emailVerified: true,
        emailVerifiedAt: true,
        firstName: true,
        lastName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const hasMore = users.length > limit;
    const results = hasMore ? users.slice(0, -1) : users;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return {
      users: results as User[],
      hasMore,
      nextCursor,
    };
  }
}