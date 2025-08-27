# ⚡ Quick Start Guide - Get Aussie Markets Running in 30 Minutes

This is a minimal setup to get Aussie Markets running locally for development. For full production setup, see [SETUP.md](./SETUP.md).

## 🎯 Goal
Get the API and mobile app running locally with basic functionality in ~30 minutes.

## 📋 What You'll Need
- Node.js 18+ and pnpm
- PostgreSQL (local or cloud)
- Redis (local or cloud)
- Stripe test account (free)

## 🚀 Step-by-Step Setup

### 1. Clone and Install (2 minutes)
```bash
git clone <your-repo>
cd polymarket-clone
npm install
```

### 2. Quick Database Setup (5 minutes)

**Railway PostgresSQL**
```bash
# 1. Go to railway.app
# 2. Create account and new project  
# 3. Add PostgreSQL service
# 4. Click PostgreSQL → "Connect" tab
# 5. Enable "Public Networking" if not enabled
# 6. Copy the PUBLIC/EXTERNAL DATABASE_URL 
# ⚠️  Make sure it's NOT the .railway.internal URL!
```

### 3. Quick Redis Setup (3 minutes)

**Railway Redis**
```bash
# 1. In your Railway project, add Redis service
# 2. Click Redis → "Connect" tab
# 3. Enable "Public Networking" if not enabled  
# 4. Copy the PUBLIC/EXTERNAL REDIS_URL
# ⚠️  Make sure it's NOT the .railway.internal URL!
```

### 4. Stripe Test Account (5 minutes)
```bash
# 1. Go to stripe.com and create account
# 2. Stay in Test Mode
# 3. Get these keys from Dashboard > Developers > API Keys:
#    - Publishable key (pk_test_...)
#    - Secret key (sk_test_...)
# 4. Create webhook endpoint (for later):
#    - URL: http://localhost:3000/webhooks/stripe
#    - Events: payment_intent.succeeded, payment_intent.payment_failed
#    - Copy webhook secret (whsec_...)
```

### 5. Environment Variables (5 minutes)

**Create `apps/api/.env`:**
```bash
# Database (use your DATABASE_URL from step 2)
DATABASE_URL="postgresql://username:password@localhost:5432/aussiemarkets_dev"

# Redis (use your REDIS_URL from step 3)
REDIS_URL="redis://localhost:6379"

# Generate these secrets (run the commands below)
JWT_SECRET="your-64-char-hex-secret"
REFRESH_TOKEN_SECRET="your-64-char-hex-secret"
FIELD_ENCRYPTION_KEY="your-32-byte-base64-key"
FIELD_SEARCH_KEY="your-32-byte-base64-key"

# Stripe (from step 4)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."

# Basic config
NODE_ENV="development"
API_URL="http://localhost:3000"
EMAIL_PROVIDER="console"
RATE_LIMIT_ENABLED=false
```

**Create `apps/mobile/.env.local`:**
```bash
EXPO_PUBLIC_API_URL="http://localhost:3000"
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
EXPO_PUBLIC_ENVIRONMENT="development"
```

**Generate secrets:**
```bash
# Run these to generate secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('REFRESH_TOKEN_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('FIELD_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('FIELD_SEARCH_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

### 6. Install Missing Dependencies (2 minutes)
```bash
cd apps/api

# Install required dependencies
npm install @nestjs/swagger@^7.0.0
```

### 7. Database Setup (3 minutes)
```bash
# Generate Prisma client and run migrations
npx prisma generate
npx prisma db push

# Verify it worked
npx prisma studio
# This opens a web UI to browse your database
```

### 8. Test API (2 minutes)
```bash
# Start the API server on port 3001 (port 3000 may be used by other services)
cd apps/api
# On Windows PowerShell:
$env:PORT=3001; npm run start:dev
# On Mac/Linux:
# PORT=3001 npm run start:dev

# In another terminal, test it works:
curl http://localhost:3001/api/v1/health
# Or on Windows PowerShell:
# Invoke-WebRequest http://localhost:3001/api/v1/health -UseBasicParsing
# Should return {"status": "ok", "timestamp": "...", ...}
```

### 9. Setup Mobile App Environment (2 minutes)
```bash
# Create mobile app environment file
cd apps/mobile

# On Windows PowerShell:
echo "EXPO_PUBLIC_API_URL=http://localhost:3001" > .env
echo "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key_here" >> .env  
echo "EXPO_PUBLIC_ENVIRONMENT=development" >> .env

# On Mac/Linux:
# echo "EXPO_PUBLIC_API_URL=http://localhost:3001" > .env
# echo "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key_here" >> .env  
# echo "EXPO_PUBLIC_ENVIRONMENT=development" >> .env
```

### 10. Test Mobile App (5 minutes)
```bash
# Install Expo CLI if needed
npm install -g @expo/cli

# Start the mobile app
npm run start

# Choose iOS simulator or Android emulator
# The app should load and show the login screen
```

## 🧪 Quick Test Flow

### Test User Registration:
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

### Test User Login:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com", 
    "password": "SecurePassword123!"
  }'
```

### Create a Test Market (Admin):
```bash
# First, make your test user an admin in Prisma Studio
# Then use the access token from login:

curl -X POST http://localhost:3000/admin/markets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "title": "Test Market",
    "description": "Will this work?",
    "closeAt": "2024-12-31T23:59:59Z",
    "outcomeType": "BINARY",
    "liquidityParam": 1000
  }'
```

## 🎉 Success!

If everything works, you should have:
- ✅ API server running on http://localhost:3000
- ✅ Mobile app running on Expo
- ✅ Database with users and markets
- ✅ Basic authentication working
- ✅ Market creation working

## 🐛 Common Issues & Solutions

### ❌ "Environment variable not found: DATABASE_URL"
```bash
# Make sure you created apps/api/.env (not .env.local)
# Prisma looks for .env file specifically
ls apps/api/.env

# If missing, create it with your Railway URLs
```

### ❌ Railway Database Connection Error
```bash
# Problem: You're using .railway.internal URLs (only work inside Railway)
# Solution: Use PUBLIC URLs from Railway dashboard

# ✅ Correct format:
DATABASE_URL="postgresql://user:pass@containers-us-west-123.railway.app:5432/railway"

# ❌ Wrong format (won't work locally):
DATABASE_URL="postgresql://user:pass@postgres.railway.internal:5432/railway"
```

### ❌ "@nestjs/swagger plugin is not installed"
```bash
cd apps/api
npm install @nestjs/swagger@^7.0.0
```

### ❌ "Missing script: dev"
```bash
# The script is called "start:dev", not "dev"
npm run start:dev
```

### Database Connection Error
```bash
# For Railway: Check if URLs are correct in .env
# For Local: Check PostgreSQL is running
# Windows: services.msc → PostgreSQL
# Mac: brew services list | grep postgresql

# Test connection
npx prisma db push
```

### Redis Connection Error
```bash
# For Railway: Check if URLs are correct in .env  
# For Local: Check Redis is running
# Windows: services.msc → Redis
# Mac: brew services list | grep redis

# Test Redis (if local)
redis-cli ping
# Should return "PONG"
```

### Prisma Schema Error
```bash
# Reset database and retry
npx prisma db push --force-reset
npx prisma generate
```

### Mobile App Won't Load
```bash
# Clear Expo cache
npx expo start --clear

# Make sure API_URL is correct in .env.local
# Use your computer's IP, not localhost, for real devices
```

### Stripe Webhook Issues
```bash
# For local development, use Stripe CLI:
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe
# This gives you a webhook secret starting with whsec_
```

## 🚀 What's Next?

Now that you have the basics running:

1. **Test Payment Flow**: Set up Apple Pay (requires Apple Developer account)
2. **Add Real Email**: Set up AWS SES or SendGrid  
3. **Add Monitoring**: Set up Sentry for error tracking
4. **Production Database**: Move to AWS RDS or similar
5. **Deploy API**: Use Railway, AWS, or similar
6. **Mobile Builds**: Set up EAS for real device testing

For complete production setup, follow [SETUP.md](./SETUP.md).

## 📞 Need Help?

- **Database issues**: Check PostgreSQL/Redis logs
- **API errors**: Check `apps/api/logs` or console output
- **Mobile issues**: Check Expo logs in terminal
- **Stripe issues**: Check Stripe Dashboard > Logs

The most important thing is getting the database and basic auth working first - everything else builds on that foundation!
