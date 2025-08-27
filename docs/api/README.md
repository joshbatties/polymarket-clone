# Aussie Markets API Documentation

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Error Handling](#error-handling)
5. [Security](#security)
6. [Database Schema](#database-schema)
7. [Services](#services)
8. [Testing](#testing)

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- pnpm 9+

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment
cp apps/api/env.example apps/api/.env.local

# Configure database connection
vim apps/api/.env.local

# Start development server
cd apps/api
pnpm run start:dev
```

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/aussie_markets_dev
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=aussie_markets_dev
DATABASE_USER=user
DATABASE_PASSWORD=password

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-here-at-least-32-chars
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key-here
REFRESH_TOKEN_EXPIRES_IN=14d

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
EMAIL_FROM=noreply@aussie-markets.com
EMAIL_PROVIDER_API_KEY=

# Environment
NODE_ENV=development
PORT=3000
```

## Authentication

### Overview

The API uses a dual-token authentication system:
- **Access Tokens**: Short-lived JWT tokens (15 minutes)
- **Refresh Tokens**: Long-lived opaque tokens (14 days)

### Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant D as Database

    C->>A: POST /auth/login
    A->>D: Validate credentials
    A->>A: Generate tokens
    A->>D: Store refresh token hash
    A->>C: {accessToken, refreshToken}

    Note over C: Store tokens securely

    C->>A: GET /protected-endpoint
    Note over C: Authorization: Bearer {accessToken}
    A->>A: Validate JWT
    A->>C: Protected resource

    Note over C: Access token expires

    C->>A: POST /auth/refresh
    A->>D: Validate refresh token
    A->>A: Generate new tokens
    A->>D: Rotate refresh token
    A->>C: {accessToken, refreshToken}
```

### Password Security

The API implements industry-standard password security:

```typescript
// Argon2id configuration
const hashConfig = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64MB
  timeCost: 3,        // 3 iterations
  parallelism: 1,     // 1 thread
  hashLength: 32,     // 32 bytes
};
```

### Token Generation

```typescript
// Access Token (JWT)
const accessToken = jwt.sign(
  {
    sub: user.id,
    email: user.email,
    role: user.role,
  },
  JWT_SECRET,
  { expiresIn: '15m' }
);

// Refresh Token (256-bit random)
const refreshToken = crypto.randomBytes(32).toString('hex');
```

## API Endpoints

### Authentication Endpoints

#### POST /auth/register

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "emailVerified": false
  }
}
```

**Validation Rules:**
- Email: Valid email format, unique
- Password: 8+ chars, uppercase, lowercase, number, special character
- Name: 2-50 characters

#### POST /auth/login

Authenticate user and return tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "8f3c2e1d9b7a6c5e4f3a2b1c9d8e7f6a...",
  "expiresIn": 900
}
```

**Error Cases:**
- 401: Invalid credentials
- 401: Email not verified
- 400: Account deactivated

#### POST /auth/verify-email

Verify user's email address.

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verification successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "emailVerified": true,
    "emailVerifiedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### POST /auth/refresh

Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "8f3c2e1d9b7a6c5e4f3a2b1c9d8e7f6a..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token refreshed",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "new_refresh_token_here...",
  "expiresIn": 900
}
```

#### POST /auth/logout

Revoke refresh token (single device logout).

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  "refreshToken": "8f3c2e1d9b7a6c5e4f3a2b1c9d8e7f6a..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### POST /auth/logout-all

Revoke all refresh tokens (all devices logout).

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out from all devices"
}
```

#### GET /auth/profile

Get current user profile.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": null,
    "role": "user",
    "emailVerified": true,
    "emailVerifiedAt": "2024-01-15T10:30:00Z",
    "mfaEnabled": false,
    "lastLoginAt": "2024-01-15T14:20:00Z",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T14:20:00Z"
  }
}
```

#### POST /auth/resend-verification

Resend email verification.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account exists, verification email has been sent"
}
```

### Utility Endpoints

#### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T14:20:00Z",
  "service": "aussie-markets-api",
  "version": "0.0.1"
}
```

#### GET /auth/admin/test

Test admin access (admin role required).

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "success": true,
  "message": "Admin access granted",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

## Error Handling

### Standard Error Response

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "email",
      "message": "Please provide a valid email address"
    }
  ]
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful request |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Authentication required/failed |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Common Error Scenarios

#### Authentication Errors

```json
// Invalid credentials
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}

// Email not verified
{
  "statusCode": 401,
  "message": "Please verify your email address before logging in",
  "error": "Unauthorized"
}

// Token expired
{
  "statusCode": 401,
  "message": "Invalid access token",
  "error": "Unauthorized"
}
```

#### Validation Errors

```json
{
  "statusCode": 400,
  "message": [
    "Password must be at least 8 characters long",
    "Password must contain at least one uppercase letter"
  ],
  "error": "Bad Request"
}
```

## Security

### Security Headers

The API implements comprehensive security headers:

```typescript
// CORS Configuration
app.enableCors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:8081'],
  credentials: true,
});

// Global validation
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

### Rate Limiting

Rate limiting is implemented to prevent abuse:

- **Authentication endpoints**: 5 requests per minute per IP
- **General API endpoints**: 100 requests per minute per user
- **Admin endpoints**: 50 requests per minute per admin

### Input Validation

All inputs are validated using class-validator:

```typescript
export class RegisterDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message: 'Password must contain uppercase, lowercase, number and special character',
  })
  password: string;
}
```

### SQL Injection Prevention

TypeORM with parameterized queries prevents SQL injection:

```typescript
// Safe query
const user = await this.userRepository.findOne({
  where: { email: email.toLowerCase() },
});

// Unsafe (never used)
// const user = await this.userRepository.query(`SELECT * FROM users WHERE email = '${email}'`);
```

## Database Schema

### Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    role user_role DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    email_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMP,
    mfa_enabled BOOLEAN DEFAULT false,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    phone_number VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    last_login_ip VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active);
```

### Refresh Tokens Table

```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    revoked_by_ip VARCHAR(45),
    replaced_by_token VARCHAR,
    created_by_ip VARCHAR(45) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens(revoked_at);
```

### Entity Relationships

```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
  refreshTokens: RefreshToken[];
}

@Entity('refresh_tokens')
export class RefreshToken {
  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
```

## Services

### AuthService

Main authentication service handling registration, login, and verification.

```typescript
@Injectable()
export class AuthService {
  async register(registerDto: RegisterDto, ipAddress: string): Promise<{user: User; message: string}>;
  async login(loginDto: LoginDto, ipAddress: string): Promise<AuthTokens>;
  async verifyEmail(verifyEmailDto: VerifyEmailDto): Promise<{message: string; user: User}>;
  async refreshToken(refreshTokenString: string, ipAddress: string): Promise<AuthTokens>;
  async logout(refreshTokenString: string, ipAddress: string): Promise<void>;
  async logoutAll(userId: string, ipAddress: string): Promise<void>;
}
```

### TokenService

Handles JWT and refresh token generation, validation, and rotation.

```typescript
@Injectable()
export class TokenService {
  async generateAccessToken(user: User): Promise<string>;
  async generateTokenPair(user: User, ipAddress: string): Promise<AuthTokens>;
  async refreshAccessToken(refreshTokenString: string, ipAddress: string): Promise<AuthTokens>;
  async revokeRefreshToken(refreshTokenString: string, ipAddress: string): Promise<void>;
  async revokeAllUserTokens(userId: string, ipAddress: string): Promise<void>;
}
```

### HashService

Secure password and token hashing using Argon2id.

```typescript
@Injectable()
export class HashService {
  async hashPassword(password: string): Promise<string>;
  async verifyPassword(password: string, hash: string): Promise<boolean>;
  async hashRefreshToken(token: string): Promise<string>;
  async verifyRefreshToken(token: string, hash: string): Promise<boolean>;
}
```

### UsersService

User management operations and profile handling.

```typescript
@Injectable()
export class UsersService {
  async create(registerDto: RegisterDto): Promise<User>;
  async findByEmail(email: string): Promise<User | null>;
  async validateUser(email: string, password: string): Promise<User | null>;
  async markEmailAsVerified(userId: string): Promise<User>;
  async updateLastLogin(userId: string, ipAddress: string): Promise<void>;
}
```

### MailService

Email handling and verification token management.

```typescript
@Injectable()
export class MailService {
  async generateEmailVerificationToken(userId: string, email: string): Promise<string>;
  async verifyEmailVerificationToken(token: string): Promise<EmailVerificationPayload>;
  async sendEmailVerification(email: string, token: string): Promise<void>;
}
```

## Testing

### Unit Tests

```bash
# Run all tests
pnpm run test

# Run tests with coverage
pnpm run test:cov

# Run tests in watch mode
pnpm run test:watch
```

### Test Structure

```typescript
describe('AuthService', () => {
  let service: AuthService;
  let mockUsersService: MockUsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should register a new user', async () => {
    // Test implementation
  });
});
```

### Integration Tests

```bash
# Run e2e tests
pnpm run test:e2e
```

### Manual Testing

Use the included test files or tools like Postman:

```bash
# Start the server
pnpm run start:dev

# Test endpoints
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","firstName":"Test","lastName":"User"}'
```

## Development Guidelines

### Code Style

- Use TypeScript strict mode
- Follow NestJS conventions
- Use DTOs for all API inputs
- Implement proper error handling
- Add comprehensive logging

### Security Checklist

- [ ] All inputs validated
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] CSRF protection
- [ ] Rate limiting implemented
- [ ] Secure headers configured
- [ ] Secrets properly managed
- [ ] Access logs implemented

### Performance Considerations

- Use database indexes for frequently queried fields
- Implement caching for expensive operations
- Use connection pooling
- Monitor query performance
- Implement pagination for large datasets

---

For more information, see the [Architecture Documentation](../architecture/README.md) and [Security Documentation](../security/README.md).
