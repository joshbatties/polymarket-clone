# Authentication Migration Plan: Custom Auth → Clerk

## Overview

This document outlines the complete migration from our custom JWT-based authentication system to Clerk, specifically tailored for the Aussie Markets prediction platform.

## Why Clerk Over Auth0?

For our Australian prediction markets app, Clerk is the better choice because:

- **Superior Expo/React Native support** - Critical for our mobile-first approach
- **Simpler pricing model** - $25/month for up to 10K MAU vs Auth0's complex pricing
- **Built-in user management dashboard** - Perfect for admin operations
- **Better developer experience** - Faster integration, better docs
- **Australian data residency options** - Important for compliance
- **Built-in email verification, 2FA** - Reduces our custom code significantly

## Pre-Migration Analysis

### Current Auth Implementation
- Custom JWT tokens (15min expiry)
- Argon2 password hashing
- Refresh token rotation
- Email verification system
- Role-based access control (USER, ADMIN)
- Integration with: KYC, Payments, Ledger, Trading systems

### Migration Scope
- **API Changes**: ~15 auth-related files
- **Mobile Changes**: Auth context, secure storage, login flows
- **Database Changes**: User table schema modifications
- **Integration Updates**: All services that depend on user context

## Phase 1: Setup & Configuration (Week 1)

### Step 1.1: Clerk Account Setup
```bash
# 1. Create Clerk account at https://clerk.com
# 2. Create new application: "Aussie Markets"
# 3. Configure settings:
#    - Application name: "Aussie Markets"
#    - Application type: "Native" (for mobile support)
#    - Region: "Australia" (for data residency)
```

### Step 1.2: Environment Configuration
```bash
# Add to apps/api/.env
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Add to apps/mobile/.env (via EAS secrets)
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### Step 1.3: Install Dependencies

**API Dependencies:**
```bash
cd apps/api
npm install @clerk/express @clerk/backend
npm uninstall @nestjs/jwt @nestjs/passport passport passport-jwt passport-local
```

**Mobile Dependencies:**
```bash
cd apps/mobile
npm install @clerk/clerk-expo
# Remove old auth dependencies
npm uninstall @react-native-async-storage/async-storage expo-secure-store
```

### Step 1.4: Configure Clerk Settings

**In Clerk Dashboard:**
- **Authentication**: Email + Password, 2FA optional
- **Social providers**: Disable for MVP (can add later)
- **Email templates**: Customize for Aussie Markets branding
- **User profile**: Enable phone number field
- **Sessions**: 7-day expiry (matches our refresh token TTL)
- **Webhooks**: Configure for user lifecycle events

## Phase 2: API Integration (Week 2)

### Step 2.1: Replace Auth Module Structure

**Remove files:**
```bash
rm -rf apps/api/src/auth/services/
rm -rf apps/api/src/auth/strategies/
rm -rf apps/api/src/auth/guards/jwt-auth.guard.ts
rm apps/api/src/auth/auth.service.ts
rm apps/api/src/auth/auth.controller.ts
```

**Create new Clerk integration:**

```typescript
// apps/api/src/auth/clerk.service.ts
import { Injectable } from '@nestjs/common';
import { clerkClient } from '@clerk/express';

@Injectable()
export class ClerkService {
  async getUserById(userId: string) {
    return clerkClient.users.getUser(userId);
  }

  async updateUserMetadata(userId: string, metadata: Record<string, any>) {
    return clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: metadata,
    });
  }

  async getUsersByRole(role: string) {
    return clerkClient.users.getUserList({
      query: `private_metadata.role:${role}`,
    });
  }
}
```

### Step 2.2: Create Clerk Middleware

```typescript
// apps/api/src/auth/clerk.middleware.ts
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { verifyToken } from '@clerk/express';

@Injectable()
export class ClerkAuthMiddleware implements NestMiddleware {
  async use(req: any, res: any, next: () => void) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('Missing or invalid authorization header');
      }

      const token = authHeader.substring(7);
      const verifiedToken = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      // Add user info to request
      req.user = {
        id: verifiedToken.sub,
        email: verifiedToken.email,
        role: verifiedToken.privateMetadata?.role || 'USER',
        emailVerified: verifiedToken.emailVerified,
      };

      next();
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

### Step 2.3: Update Auth Guards

```typescript
// apps/api/src/auth/guards/clerk-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.user) {
      throw new UnauthorizedException('Authentication required');
    }
    return true;
  }
}

// Keep existing RolesGuard - just update to use req.user.role from Clerk
```

### Step 2.4: Database Schema Migration

```sql
-- Migration: 001_prepare_clerk_migration.sql
-- Add Clerk ID column
ALTER TABLE "User" ADD COLUMN "clerkId" VARCHAR(255) UNIQUE;

-- Create index for performance
CREATE INDEX "User_clerkId_idx" ON "User"("clerkId");

-- Add migration tracking
CREATE TABLE "auth_migration_tracking" (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  clerk_id VARCHAR(255),
  migration_status VARCHAR(50) DEFAULT 'pending',
  migrated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Step 2.5: Create Migration Service

```typescript
// apps/api/src/auth/migration.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClerkService } from './clerk.service';

@Injectable()
export class AuthMigrationService {
  private readonly logger = new Logger(AuthMigrationService.name);

  constructor(
    private prisma: PrismaService,
    private clerkService: ClerkService,
  ) {}

  async migrateUserToClerk(userId: string, email: string): Promise<string> {
    // Create user in Clerk
    const clerkUser = await clerkClient.users.createUser({
      emailAddress: [email],
      privateMetadata: {
        legacyUserId: userId,
        role: 'USER', // Will be updated from database
        migratedAt: new Date().toISOString(),
      },
    });

    // Update our database
    await this.prisma.user.update({
      where: { id: userId },
      data: { clerkId: clerkUser.id },
    });

    return clerkUser.id;
  }
}
```

## Phase 3: Update All Controllers (Week 2-3)

### Step 3.1: Replace Auth Decorators

**Before:**
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
```

**After:**
```typescript
@UseGuards(ClerkAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
```

### Step 3.2: Update Controller Files

**Files to update:**
- `markets.controller.ts`
- `payments.controller.ts`
- `kyc.controller.ts`
- `ledger.controller.ts`
- `trading.controller.ts`
- `users.controller.ts`
- `withdrawals.controller.ts`

**Pattern for each controller:**
```typescript
// Replace @CurrentUser() decorator usage
// Before:
async createMarket(@CurrentUser() user: User, @Body() dto: CreateMarketDto) {
  const userId = user.id;
}

// After:
async createMarket(@Req() req: any, @Body() dto: CreateMarketDto) {
  const userId = req.user.id;
  const userEmail = req.user.email;
}
```

### Step 3.3: Create User Sync Service

```typescript
// apps/api/src/users/user-sync.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserSyncService {
  constructor(private prisma: PrismaService) {}

  async syncUserFromClerk(clerkUser: any) {
    const existingUser = await this.prisma.user.findUnique({
      where: { clerkId: clerkUser.id },
    });

    if (existingUser) {
      // Update existing user
      return this.prisma.user.update({
        where: { clerkId: clerkUser.id },
        data: {
          email: clerkUser.emailAddresses[0]?.emailAddress,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          emailVerified: clerkUser.emailAddresses[0]?.verification?.status === 'verified',
          lastLoginAt: new Date(),
        },
      });
    } else {
      // Create new user
      return this.prisma.user.create({
        data: {
          clerkId: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          role: 'USER',
          emailVerified: clerkUser.emailAddresses[0]?.verification?.status === 'verified',
          isActive: true,
          createdAt: new Date(clerkUser.createdAt),
        },
      });
    }
  }
}
```

## Phase 4: Mobile App Integration (Week 3)

### Step 4.1: Setup Clerk Provider

```typescript
// apps/mobile/app/_layout.tsx
import { ClerkProvider } from '@clerk/clerk-expo';
import Constants from 'expo-constants';

const publishableKey = Constants.expoConfig?.extra?.clerkPublishableKey;

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      {/* Existing app structure */}
    </ClerkProvider>
  );
}
```

### Step 4.2: Replace Auth Context

**Remove:**
```typescript
// Remove apps/mobile/contexts/authStore.ts
// Remove apps/mobile/services/authService.ts
```

**Replace with:**
```typescript
// apps/mobile/hooks/useAuth.ts
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo';

export function useAuth() {
  const { isSignedIn, signOut } = useClerkAuth();
  const { user } = useUser();

  return {
    isAuthenticated: isSignedIn,
    user: user ? {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.privateMetadata?.role || 'USER',
    } : null,
    signOut,
  };
}
```

### Step 4.3: Update Auth Screens

**Login Screen:**
```typescript
// apps/mobile/app/auth.tsx
import { SignIn } from '@clerk/clerk-expo';

export default function AuthScreen() {
  return (
    <SignIn 
      routing="replace"
      appearance={{
        elements: {
          // Customize for Aussie Markets branding
          card: "bg-white rounded-lg",
          headerTitle: "text-green-600",
        }
      }}
    />
  );
}
```

**Registration Screen:**
```typescript
// apps/mobile/app/register.tsx
import { SignUp } from '@clerk/clerk-expo';

export default function RegisterScreen() {
  return (
    <SignUp 
      routing="replace"
      appearance={{
        // Match your app's design system
      }}
    />
  );
}
```

### Step 4.4: Update API Client

```typescript
// apps/mobile/services/apiClient.ts
import { useAuth } from '@clerk/clerk-expo';

export function useApiClient() {
  const { getToken } = useAuth();

  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const token = await getToken();
    
    return fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  };

  return { apiCall };
}
```

## Phase 5: Webhook Integration (Week 4)

### Step 5.1: Setup Webhook Endpoint

```typescript
// apps/api/src/auth/webhooks.controller.ts
import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { Webhook } from 'svix';
import { UserSyncService } from '../users/user-sync.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private userSyncService: UserSyncService) {}

  @Post('clerk')
  @HttpCode(HttpStatus.OK)
  async handleClerkWebhook(
    @Body() payload: any,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    const webhook = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
    const evt = webhook.verify(JSON.stringify(payload), {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });

    switch (evt.type) {
      case 'user.created':
        await this.userSyncService.syncUserFromClerk(evt.data);
        break;
      case 'user.updated':
        await this.userSyncService.syncUserFromClerk(evt.data);
        break;
      case 'user.deleted':
        // Handle user deletion
        break;
    }

    return { received: true };
  }
}
```

### Step 5.2: Configure Webhook in Clerk Dashboard

1. Go to Clerk Dashboard → Webhooks
2. Add endpoint: `https://your-api.com/webhooks/clerk`
3. Select events: `user.created`, `user.updated`, `user.deleted`
4. Add webhook secret to environment variables

## Phase 6: Data Migration (Week 4)

### Step 6.1: Migration Script

```typescript
// apps/api/src/scripts/migrate-users-to-clerk.ts
import { PrismaClient } from '@prisma/client';
import { clerkClient } from '@clerk/express';

const prisma = new PrismaClient();

async function migrateUsers() {
  const users = await prisma.user.findMany({
    where: { clerkId: null },
    take: 100, // Batch process
  });

  for (const user of users) {
    try {
      // Create user in Clerk with temporary password
      const clerkUser = await clerkClient.users.createUser({
        emailAddress: [user.email],
        password: 'TempPassword123!', // User will reset on first login
        firstName: user.firstName,
        lastName: user.lastName,
        privateMetadata: {
          legacyUserId: user.id,
          role: user.role,
          migratedAt: new Date().toISOString(),
        },
      });

      // Update our database
      await prisma.user.update({
        where: { id: user.id },
        data: { clerkId: clerkUser.id },
      });

      // Send password reset email
      await clerkClient.emails.createEmail({
        emailAddress: user.email,
        subject: 'Complete Your Account Migration',
        body: 'Your account has been migrated. Please reset your password...',
      });

      console.log(`Migrated user: ${user.email}`);
    } catch (error) {
      console.error(`Failed to migrate user ${user.email}:`, error);
    }
  }
}
```

### Step 6.2: Gradual Migration Strategy

```typescript
// apps/api/src/auth/migration-middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class MigrationMiddleware implements NestMiddleware {
  async use(req: any, res: any, next: () => void) {
    // Check if user exists in both systems
    const authHeader = req.headers.authorization;
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        // Try Clerk first
        const clerkToken = await verifyToken(token);
        req.user = await this.getUserFromClerk(clerkToken);
        req.authSystem = 'clerk';
      } catch {
        try {
          // Fallback to legacy JWT
          const legacyUser = await this.verifyLegacyToken(token);
          req.user = legacyUser;
          req.authSystem = 'legacy';
          
          // Flag for migration
          req.shouldMigrate = true;
        } catch {
          throw new UnauthorizedException('Invalid token');
        }
      }
    }
    
    next();
  }
}
```

## Phase 7: Testing & Validation (Week 4-5)

### Step 7.1: Test Scenarios

**API Tests:**
```typescript
// apps/api/src/auth/auth.e2e.spec.ts
describe('Auth Migration E2E', () => {
  it('should authenticate with Clerk token', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);
    
    expect(response.body.user.id).toBeDefined();
  });

  it('should maintain role-based access', async () => {
    await request(app.getHttpServer())
      .post('/admin/markets')
      .set('Authorization', `Bearer ${adminClerkToken}`)
      .expect(201);
  });

  it('should reject invalid tokens', async () => {
    await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
});
```

**Mobile Tests:**
```typescript
// apps/mobile/__tests__/auth.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { SignIn } from '@clerk/clerk-expo';

describe('Clerk Integration', () => {
  it('should render sign in component', () => {
    const { getByText } = render(<SignIn />);
    expect(getByText('Sign in')).toBeTruthy();
  });
});
```

### Step 7.2: Validation Checklist

- [ ] All API endpoints accept Clerk tokens
- [ ] Role-based access control works
- [ ] Mobile login/logout flows work
- [ ] User data syncs between Clerk and database
- [ ] Webhook processing works correctly
- [ ] Email verification flows work
- [ ] Password reset works
- [ ] 2FA setup works (if enabled)

## Phase 8: Cleanup & Go-Live (Week 5)

### Step 8.1: Remove Legacy Code

```bash
# Remove old auth files
rm -rf apps/api/src/auth/services/
rm -rf apps/api/src/auth/strategies/
rm apps/api/src/auth/auth.service.ts
rm apps/api/src/auth/auth.controller.ts

# Remove old mobile auth
rm apps/mobile/contexts/authStore.ts
rm apps/mobile/services/authService.ts

# Update package.json to remove unused dependencies
```

### Step 8.2: Database Cleanup

```sql
-- Migration: 002_cleanup_auth_migration.sql
-- Remove old auth columns (after confirming all users migrated)
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordHash";
ALTER TABLE "User" DROP COLUMN IF EXISTS "refreshTokenHash";
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerificationToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordResetToken";

-- Drop migration tracking table
DROP TABLE "auth_migration_tracking";
```

### Step 8.3: Update Documentation

- [ ] Update API documentation
- [ ] Update mobile setup guide
- [ ] Update deployment docs
- [ ] Update environment variable docs

## Production Deployment

### Step 8.4: Environment Setup

**Production Clerk Configuration:**
```bash
# Production environment variables
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_live_...
```

**Mobile Production Build:**
```bash
cd apps/mobile
eas build --platform ios --profile production
eas build --platform android --profile production
```

## Rollback Plan

If issues arise, we can rollback by:

1. **Revert API changes** - Re-enable legacy auth middleware
2. **Revert mobile app** - Push previous build via EAS Update
3. **Database rollback** - Restore from backup before migration
4. **DNS/Traffic** - Route traffic back to old API version

## Success Metrics

After migration, we should see:

- **Reduced auth-related code** by ~80%
- **Faster user onboarding** (built-in email verification)
- **Better security** (Clerk handles security updates)
- **Improved user experience** (modern auth flows)
- **Easier admin management** (Clerk dashboard)

## Cost Analysis

**Monthly Costs:**
- Clerk: $25/month (up to 10K MAU)
- Savings: ~40 hours/month of auth maintenance = $4000/month

**One-time Migration Cost:**
- Development time: ~5 weeks = $25,000
- Testing: $5,000
- Total: $30,000

**ROI Timeline:** 7.5 months to break even, then $4000/month savings

## Risk Assessment

**Low Risk:**
- Clerk is battle-tested with many Australian companies
- Good fallback/rollback plan
- Gradual migration approach

**Mitigation:**
- Thorough testing in staging
- Feature flags for gradual rollout
- Keep legacy auth for 1 month as backup

---

**Next Steps:**
1. Get stakeholder approval for 5-week timeline
2. Set up Clerk development account
3. Begin Phase 1 implementation
4. Schedule regular migration check-ins

This migration will significantly simplify our authentication system while improving security and user experience for the Aussie Markets platform.
