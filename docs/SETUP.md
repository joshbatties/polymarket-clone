# 🚀 Aussie Markets - Complete Setup Guide

This guide will walk you through setting up ALL the infrastructure, services, and accounts needed to run Aussie Markets in development and production.

## 📋 Prerequisites Checklist

Before starting, you'll need:
- [ ] Australian Business Number (ABN) for Stripe Australia
- [ ] Email domain for notifications (e.g., aussiemarkets.com.au)
- [ ] Credit card for service signups
- [ ] Australian bank account for Stripe payouts
- [ ] Government ID for business verification

## 🗂️ Setup Order (Follow This Sequence)

### Phase 1: Foundation Services
1. [Domain & Email Setup](#1-domain--email-setup)
2. [Database Setup (PostgreSQL)](#2-database-setup-postgresql)
3. [Redis Setup](#3-redis-setup)
4. [Stripe Account & Configuration](#4-stripe-account--configuration)

### Phase 2: Development Environment
5. [Environment Variables](#5-environment-variables)
6. [Local Development Setup](#6-local-development-setup)
7. [Database Migration](#7-database-migration)
8. [Testing the API](#8-testing-the-api)

### Phase 3: Mobile Development
9. [Apple Developer Account](#9-apple-developer-account)
10. [Expo/EAS Setup](#10-expoeas-setup)
11. [Mobile App Configuration](#11-mobile-app-configuration)

### Phase 4: External Services
12. [Email Service Setup](#12-email-service-setup)
13. [KYC Provider Setup](#13-kyc-provider-setup)
14. [Monitoring Services](#14-monitoring-services)

### Phase 5: Production Deployment
15. [AWS Infrastructure](#15-aws-infrastructure)
16. [CI/CD Pipeline](#16-cicd-pipeline)
17. [Production Deployment](#17-production-deployment)
18. [App Store Submission](#18-app-store-submission)

---

## 1. Domain & Email Setup

### 1.1 Register Domain
```bash
# Recommended: Register your domain (e.g., aussiemarkets.com.au)
# Use: Namecheap, GoDaddy, or Australian registrar
```

### 1.2 Email Service
**Option A: Google Workspace (Recommended)**
1. Go to [Google Workspace](https://workspace.google.com)
2. Set up business email: `admin@yourdomain.com`
3. Verify domain ownership
4. Create additional emails:
   - `support@yourdomain.com`
   - `security@yourdomain.com`
   - `legal@yourdomain.com`

**Option B: AWS SES**
1. Set up AWS SES in `ap-southeast-2`
2. Verify domain and email addresses
3. Request production access (exit sandbox)

---

## 2. Database Setup (PostgreSQL)

### 2.1 Development Database

**Option A: Local PostgreSQL**
```bash
# Install PostgreSQL 15+
# macOS
brew install postgresql@15

# Ubuntu/Debian
sudo apt install postgresql-15 postgresql-client-15

# Start PostgreSQL
brew services start postgresql@15
# OR
sudo systemctl start postgresql

# Create database
createdb aussiemarkets_dev
```

**Option B: Railway (Easy Cloud Option)**
1. Go to [Railway.app](https://railway.app)
2. Create account and new project
3. Add PostgreSQL service
4. Copy connection string

**Option C: AWS RDS (Production-like)**
```bash
# Create RDS instance via AWS Console:
# - Engine: PostgreSQL 15.4
# - Instance: db.t3.micro (free tier)
# - Region: ap-southeast-2
# - Database: aussiemarkets
# - Username: aussieadmin
# - Password: Generate secure password
```

### 2.2 Database Connection String
```bash
# Local
DATABASE_URL="postgresql://username:password@localhost:5432/aussiemarkets_dev"

# Railway
DATABASE_URL="postgresql://postgres:password@host:port/railway"

# AWS RDS
DATABASE_URL="postgresql://aussieadmin:password@host.region.rds.amazonaws.com:5432/aussiemarkets"
```

---

## 3. Redis Setup

### 3.1 Development Redis

**Option A: Local Redis**
```bash
# Install Redis
# macOS
brew install redis

# Ubuntu/Debian
sudo apt install redis-server

# Start Redis
brew services start redis
# OR
sudo systemctl start redis-server
```

**Option B: Railway Redis**
1. In your Railway project, add Redis service
2. Copy connection string

**Option C: AWS ElastiCache**
```bash
# Create ElastiCache cluster:
# - Engine: Redis 7.0
# - Node: cache.t3.micro
# - Region: ap-southeast-2
```

### 3.2 Redis Connection String
```bash
# Local
REDIS_URL="redis://localhost:6379"

# Railway
REDIS_URL="redis://default:password@host:port"

# AWS ElastiCache
REDIS_URL="rediss://your-cluster.cache.amazonaws.com:6380"
```

---

## 4. Stripe Account & Configuration

### 4.1 Create Stripe Account
1. Go to [Stripe.com](https://stripe.com)
2. Create account with Australian business details
3. Complete business verification (requires ABN)
4. Enable Test Mode for development

### 4.2 Stripe Configuration

**4.2.1 Get API Keys**
```bash
# Dashboard → Developers → API Keys
STRIPE_PUBLISHABLE_KEY="pk_test_..."  # For mobile app
STRIPE_SECRET_KEY="sk_test_..."       # For API server
```

**4.2.2 Enable Apple Pay**
1. Dashboard → Settings → Payment Methods
2. Enable Apple Pay
3. Add domain: `yourdomain.com`
4. Download verification file and host at `https://yourdomain.com/.well-known/apple_developer_merchantid_domain_association`

**4.2.3 Configure Webhooks**
1. Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/webhooks/stripe`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payout.paid`
   - `payout.failed`
4. Copy webhook signing secret:
```bash
STRIPE_WEBHOOK_SECRET="whsec_..."
```

**4.2.4 Set Up Payouts**
1. Dashboard → Settings → Payouts
2. Add Australian bank account
3. Set payout schedule (daily recommended)

### 4.3 Test Cards
```bash
# Stripe test cards for development
# Success: 4242 4242 4242 4242
# Declined: 4000 0000 0000 0002
# Authentication required: 4000 0025 0000 3155
```

---

## 5. Environment Variables

### 5.1 Create Environment Files

**5.1.1 API Environment (apps/api/.env.local)**
```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/aussiemarkets_dev"
DATABASE_SSL=false

# Redis
REDIS_URL="redis://localhost:6379"

# JWT Secrets (generate these!)
JWT_SECRET="your-super-secure-jwt-secret-here"
REFRESH_TOKEN_SECRET="your-super-secure-refresh-secret-here"

# Encryption (generate these!)
FIELD_ENCRYPTION_KEY="your-base64-encryption-key"
FIELD_SEARCH_KEY="your-base64-search-key"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_MERCHANT_IDENTIFIER="merchant.com.yourdomain.aussiemarkets"
STRIPE_ACCOUNT_COUNTRY="AU"

# Email (choose one)
EMAIL_PROVIDER="console"  # For development
# EMAIL_PROVIDER="ses"
# AWS_REGION="ap-southeast-2"
# AWS_ACCESS_KEY_ID="your-key"
# AWS_SECRET_ACCESS_KEY="your-secret"

# Application
NODE_ENV="development"
APP_VERSION="1.0.0"
API_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:8081"

# Security
RATE_LIMIT_ENABLED=true

# Feature Flags
TRADING_ENABLED=true
WITHDRAWAL_PROCESSING=false  # Start disabled
KYC_VERIFICATION_REQUIRED=true

# Monitoring (optional for development)
LOG_LEVEL="debug"
```

**5.1.2 Mobile Environment (apps/mobile/.env.local)**
```bash
EXPO_PUBLIC_API_URL="http://localhost:3000"
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
EXPO_PUBLIC_ENVIRONMENT="development"
```

### 5.2 Generate Secrets
```bash
# Generate JWT secrets (run these commands)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate encryption keys
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 6. Local Development Setup

### 6.1 Install Dependencies
```bash
# Install pnpm (if not installed)
npm install -g pnpm

# Install dependencies
pnpm install
```

### 6.2 Install Additional Tools
```bash
# Install Prisma CLI globally
npm install -g prisma

# Install Expo CLI
npm install -g @expo/cli

# Install EAS CLI
npm install -g eas-cli
```

---

## 7. Database Migration

### 7.1 Run Migrations
```bash
cd apps/api

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma db push

# Optional: Seed with test data
npx prisma db seed
```

### 7.2 Verify Database
```bash
# Open Prisma Studio to inspect database
npx prisma studio
```

---

## 8. Testing the API

### 8.1 Start API Server
```bash
cd apps/api
pnpm run dev
```

### 8.2 Test Health Endpoint
```bash
curl http://localhost:3000/health
```

### 8.3 Test Registration
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

---

## 9. Apple Developer Account

### 9.1 Create Apple Developer Account
1. Go to [developer.apple.com](https://developer.apple.com)
2. Enroll in Apple Developer Program ($99/year)
3. Complete enrollment with business details

### 9.2 Create App ID
1. Certificates, Identifiers & Profiles
2. Identifiers → App IDs
3. Create new App ID: `com.yourdomain.aussiemarkets`
4. Enable capabilities:
   - Apple Pay Payment Processing
   - Push Notifications

### 9.3 Create Merchant ID (for Apple Pay)
1. Identifiers → Merchant IDs
2. Create: `merchant.com.yourdomain.aussiemarkets`
3. Configure with your domain

### 9.4 Certificates
1. Create Apple Pay Processing Certificate
2. Download and configure in Stripe dashboard

---

## 10. Expo/EAS Setup

### 10.1 Create Expo Account
1. Go to [expo.dev](https://expo.dev)
2. Create account
3. Install EAS CLI: `npm install -g eas-cli`

### 10.2 Configure EAS
```bash
cd apps/mobile

# Login to Expo
eas login

# Initialize EAS project
eas build:configure
```

### 10.3 EAS Configuration (eas.json)
```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "resourceClass": "m1-medium"
      }
    },
    "production": {
      "ios": {
        "resourceClass": "m1-medium"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

---

## 11. Mobile App Configuration

### 11.1 Configure app.json
```json
{
  "expo": {
    "name": "Aussie Markets",
    "slug": "aussie-markets",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourdomain.aussiemarkets",
      "merchantId": "merchant.com.yourdomain.aussiemarkets",
      "capabilities": [
        "apple-pay"
      ]
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      },
      "package": "com.yourdomain.aussiemarkets"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    },
    "plugins": [
      "@stripe/stripe-react-native"
    ]
  }
}
```

### 11.2 Test Mobile App
```bash
cd apps/mobile

# Start development server
pnpm run start

# Test on iOS simulator
pnpm run ios

# Test on Android emulator
pnpm run android
```

---

## 12. Email Service Setup

### 12.1 AWS SES Setup (Recommended)
```bash
# 1. AWS Console → SES → Configuration → Verified identities
# 2. Add domain: yourdomain.com
# 3. Add TXT record to DNS
# 4. Verify domain
# 5. Request production access (exit sandbox)

# Environment variables
EMAIL_PROVIDER="ses"
AWS_REGION="ap-southeast-2"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
SES_FROM_EMAIL="noreply@yourdomain.com"
```

### 12.2 Alternative: SendGrid
```bash
# 1. Create SendGrid account
# 2. Get API key
# 3. Verify domain

EMAIL_PROVIDER="sendgrid"
SENDGRID_API_KEY="SG.your-api-key"
```

---

## 13. KYC Provider Setup

### 13.1 Onfido (Recommended)
```bash
# 1. Go to onfido.com
# 2. Create business account
# 3. Complete business verification
# 4. Get API keys

KYC_PROVIDER="onfido"
ONFIDO_API_KEY="your-onfido-api-key"
ONFIDO_WEBHOOK_SECRET="your-webhook-secret"
```

### 13.2 Alternative: Mock Provider (Development)
```bash
# Use mock provider for development
KYC_PROVIDER="mock"
```

---

## 14. Monitoring Services

### 14.1 Sentry (Error Tracking)
```bash
# 1. Create Sentry account
# 2. Create project
# 3. Get DSN

SENTRY_DSN="https://your-dsn@sentry.io/project-id"
```

### 14.2 LogRocket (Session Replay)
```bash
# 1. Create LogRocket account
# 2. Get app ID

LOGROCKET_APP_ID="your-app-id"
```

---

## 15. AWS Infrastructure

### 15.1 AWS Account Setup
1. Create AWS account
2. Set up billing alerts
3. Create IAM user with programmatic access
4. Install AWS CLI and configure

### 15.2 Production Infrastructure
```bash
# Use our infrastructure code
cd infrastructure/

# Install Terraform
# Configure AWS credentials
aws configure

# Deploy infrastructure
terraform init
terraform plan -var-file=production.tfvars
terraform apply
```

---

## 16. CI/CD Pipeline

### 16.1 GitHub Secrets
Add these secrets to your GitHub repository:

```bash
# AWS
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

# Database
DATABASE_URL

# Other secrets...
```

### 16.2 EAS Secrets
```bash
# Add secrets to EAS
eas secret:create --scope project --name EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY --value "pk_test_..."
```

---

## 17. Production Deployment

### 17.1 Database Setup
```bash
# Create production database
# Run migrations
DATABASE_URL="your-prod-db-url" npx prisma migrate deploy
```

### 17.2 API Deployment
```bash
# Build and deploy API
docker build -t aussiemarkets-api .
# Deploy to ECS/Railway/etc.
```

### 17.3 Mobile App Build
```bash
# Build for App Store
eas build --platform ios --profile production
```

---

## 18. App Store Submission

### 18.1 Prepare Assets
- App icons (multiple sizes)
- Screenshots (various device sizes)
- App description
- Privacy policy URL
- Terms of service URL

### 18.2 TestFlight
```bash
# Submit to TestFlight
eas submit --platform ios --profile production
```

### 18.3 App Store Review
1. Add test account credentials
2. Provide review notes
3. Submit for review

---

## 🔧 Development Workflow

### Daily Development
```bash
# Terminal 1: API
cd apps/api && pnpm run dev

# Terminal 2: Mobile
cd apps/mobile && pnpm run start

# Terminal 3: Database
npx prisma studio
```

### Testing
```bash
# Run API tests
cd apps/api && pnpm run test

# Run E2E tests
pnpm run test:e2e
```

## 🚨 Important Security Notes

1. **Never commit secrets** to git
2. **Use different keys** for development/production
3. **Enable 2FA** on all service accounts
4. **Regularly rotate secrets**
5. **Monitor for security alerts**

## 🆘 Getting Help

If you get stuck:
1. Check service documentation
2. Review error logs
3. Test with simple curl commands
4. Use service test modes
5. Contact support for paid services

## 📝 Next Steps

Once everything is set up:
1. Test the complete user flow
2. Deploy to staging environment
3. Run security scans
4. Prepare for legal compliance
5. Submit to App Store

This setup will take 1-2 days to complete properly. Take it step by step and test each service as you go!
