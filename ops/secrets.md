# Secrets Management Plan

This document outlines the secrets management strategy for Aussie Markets, including local development and production deployment.

## Local Development (.env.local)

For local development, use `.env.local` files in each application directory. These files are git-ignored for security.

### API App Secrets (`apps/api/.env.local`)

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

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-here-at-least-32-chars
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key-here
REFRESH_TOKEN_EXPIRES_IN=14d

# Stripe (Test Keys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_APPLE_MERCHANT_ID=merchant.com.jpcgroup.aussiemarkets

# AWS (ap-southeast-2)
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# KYC Provider (TBD - stub for now)
KYC_PROVIDER_API_KEY=stub_key_for_development
KYC_PROVIDER_BASE_URL=https://api.kyc-provider.com

# Email Provider
EMAIL_FROM=noreply@aussie-markets.com
EMAIL_PROVIDER_API_KEY=

# CORS
CORS_ORIGINS=http://localhost:8081,http://localhost:3000

# Environment
NODE_ENV=development
PORT=3000
```

### Mobile App Secrets (Expo)

Mobile app secrets are managed through EAS Secrets and environment variables:

```bash
# API Configuration
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Development/Staging/Production URLs will be different
```

## Production Secrets (AWS SSM Parameter Store)

### Parameter Structure

All production secrets will be stored in AWS Systems Manager Parameter Store with the following naming convention:

```
/aussie-markets/{environment}/{service}/{secret_name}
```

### Environment-Specific Parameters

#### Development Environment
- `/aussie-markets/dev/api/database-url`
- `/aussie-markets/dev/api/redis-url`
- `/aussie-markets/dev/api/jwt-secret`
- `/aussie-markets/dev/api/stripe-secret-key`
- `/aussie-markets/dev/api/stripe-webhook-secret`

#### Staging Environment
- `/aussie-markets/staging/api/database-url`
- `/aussie-markets/staging/api/redis-url`
- `/aussie-markets/staging/api/jwt-secret`
- `/aussie-markets/staging/api/stripe-secret-key`
- `/aussie-markets/staging/api/stripe-webhook-secret`

#### Production Environment
- `/aussie-markets/prod/api/database-url`
- `/aussie-markets/prod/api/redis-url`
- `/aussie-markets/prod/api/jwt-secret`
- `/aussie-markets/prod/api/stripe-secret-key`
- `/aussie-markets/prod/api/stripe-webhook-secret`

### AWS KMS Encryption

All SecureString parameters in SSM will be encrypted using AWS KMS with environment-specific keys:

- `alias/aussie-markets-dev`
- `alias/aussie-markets-staging`
- `alias/aussie-markets-prod`

### EAS Secrets (Mobile App)

EAS Build and Update secrets are managed through Expo's secret management:

```bash
# Set secrets for different environments
eas secret:create --scope project --name STRIPE_PUBLISHABLE_KEY_DEV --value pk_test_...
eas secret:create --scope project --name STRIPE_PUBLISHABLE_KEY_STAGING --value pk_test_...
eas secret:create --scope project --name STRIPE_PUBLISHABLE_KEY_PROD --value pk_live_...

eas secret:create --scope project --name API_BASE_URL_DEV --value https://dev-api.aussie-markets.com
eas secret:create --scope project --name API_BASE_URL_STAGING --value https://staging-api.aussie-markets.com
eas secret:create --scope project --name API_BASE_URL_PROD --value https://api.aussie-markets.com
```

## Security Requirements

### Key Generation
- JWT secrets: At least 32 characters, cryptographically random
- Database passwords: At least 16 characters, mixed case, numbers, symbols
- API keys: Use provider-generated keys when possible

### Access Control
- IAM roles with least-privilege access to SSM parameters
- Environment separation through different AWS accounts or strict IAM policies
- Regular rotation of secrets (quarterly for production)

### Monitoring
- CloudTrail logging for all SSM parameter access
- Alerts for unauthorized secret access attempts
- Audit trail for secret rotations

## Implementation Notes

1. **Local Development**: Use `.env.local` files, never commit to git
2. **CI/CD**: GitHub Actions will read from AWS SSM Parameter Store
3. **Container Deployment**: Secrets injected as environment variables at runtime
4. **Mobile Builds**: EAS Build will inject secrets during build process
5. **Backup**: Regular backup of SSM parameters to encrypted S3 bucket

## Setup Checklist

- [ ] Create AWS KMS keys for each environment
- [ ] Set up IAM roles for parameter access
- [ ] Configure GitHub Actions secrets for AWS access
- [ ] Set up EAS project and configure secrets
- [ ] Create local `.env.local` files for development
- [ ] Document secret rotation procedures
- [ ] Set up monitoring and alerting for secret access

## Contact

For questions about secrets management, contact the DevOps team or refer to the AWS SSM documentation.
