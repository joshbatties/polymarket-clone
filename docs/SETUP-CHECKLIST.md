# ✅ Setup Checklist - Aussie Markets

Use this checklist to verify everything is working correctly during setup.

## 📋 Pre-Setup Checklist

- [ ] Node.js 18+ installed (`node --version`)
- [ ] pnpm installed (`pnpm --version`) 
- [ ] Git installed and configured
- [ ] Code editor set up (VS Code recommended)
- [ ] Australian business details ready (for Stripe)
- [ ] Email domain available (for notifications)

## 🗂️ Foundation Services

### ✅ Domain & Email Setup
- [ ] Domain registered and accessible
- [ ] DNS configured correctly
- [ ] Email service configured (Google Workspace/SES)
- [ ] Test email sent and received
- [ ] Email addresses created:
  - [ ] `admin@yourdomain.com`
  - [ ] `support@yourdomain.com` 
  - [ ] `security@yourdomain.com`

**Test Command:**
```bash
# Test email service
curl -X POST http://localhost:3000/test/email
```

### ✅ Database (PostgreSQL)
- [ ] PostgreSQL 15+ installed/provisioned
- [ ] Database `aussiemarkets_dev` created
- [ ] Connection string works
- [ ] Can connect with psql/GUI tool
- [ ] Backup strategy configured (production)

**Test Commands:**
```bash
# Test connection
psql $DATABASE_URL -c "SELECT version();"

# Test with Prisma
cd apps/api && npx prisma db ping
```

### ✅ Redis Setup
- [ ] Redis installed/provisioned
- [ ] Redis server running
- [ ] Connection string works
- [ ] Can connect with redis-cli
- [ ] Memory limits configured (production)

**Test Commands:**
```bash
# Test connection
redis-cli -u $REDIS_URL ping

# Test basic operations
redis-cli -u $REDIS_URL set test_key "hello"
redis-cli -u $REDIS_URL get test_key
```

### ✅ Stripe Configuration
- [ ] Stripe account created and verified
- [ ] Australian business verification complete
- [ ] Test API keys obtained
- [ ] Production keys available (later)
- [ ] Apple Pay enabled and domain verified
- [ ] Webhook endpoint configured
- [ ] Test payments processed successfully

**Test Commands:**
```bash
# Test API key
curl https://api.stripe.com/v1/customers \
  -u $STRIPE_SECRET_KEY: \
  -d "email=test@example.com"

# Test webhook
curl -X POST http://localhost:3000/webhooks/stripe \
  -H "stripe-signature: test" \
  -d '{"type": "test.event"}'
```

## 🔧 Development Environment

### ✅ Project Setup
- [ ] Repository cloned
- [ ] Dependencies installed (`pnpm install`)
- [ ] Environment files created (`.env.local`)
- [ ] Secrets generated and configured
- [ ] Git hooks working (pre-commit, etc.)

**Test Commands:**
```bash
# Test dependencies
pnpm run build

# Test environment
cd apps/api && node -e "console.log(process.env.DATABASE_URL ? '✅ ENV loaded' : '❌ ENV missing')"
```

### ✅ Database Migration
- [ ] Prisma client generated
- [ ] Database schema applied
- [ ] Migrations run successfully
- [ ] Prisma Studio accessible
- [ ] Test data seeded (optional)

**Test Commands:**
```bash
cd apps/api

# Test Prisma
npx prisma generate
npx prisma db push
npx prisma studio
```

### ✅ API Server
- [ ] Server starts without errors
- [ ] Health endpoint responds
- [ ] Database health check passes
- [ ] Redis health check passes
- [ ] Logs are structured and readable
- [ ] Hot reload working in development

**Test Commands:**
```bash
# Start server
cd apps/api && pnpm run dev

# Test health
curl http://localhost:3000/health
curl http://localhost:3000/health/database
curl http://localhost:3000/health/redis
```

## 🔐 Authentication System

### ✅ User Registration
- [ ] Registration endpoint works
- [ ] Password hashing with Argon2id
- [ ] Email verification sent
- [ ] User created in database
- [ ] Validation errors handled properly

**Test Commands:**
```bash
# Test registration
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### ✅ User Login
- [ ] Login endpoint works
- [ ] JWT access token generated (15min expiry)
- [ ] Refresh token generated (14d expiry)
- [ ] Invalid credentials rejected
- [ ] Rate limiting applied

**Test Commands:**
```bash
# Test login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'
```

### ✅ Token Management
- [ ] Access token validates correctly
- [ ] Refresh token rotation works
- [ ] Token expiry handled
- [ ] Logout invalidates tokens
- [ ] Concurrent sessions handled

**Test Commands:**
```bash
# Test protected endpoint
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  http://localhost:3000/users/profile

# Test token refresh
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "YOUR_REFRESH_TOKEN"}'
```

## 📱 Mobile Application

### ✅ Expo Setup
- [ ] Expo CLI installed
- [ ] EAS CLI installed and logged in
- [ ] Project configured in Expo dashboard
- [ ] Development build working
- [ ] iOS simulator/Android emulator working

**Test Commands:**
```bash
cd apps/mobile

# Test Expo
npx expo --version
eas --version

# Start development server
pnpm run start
```

### ✅ Apple Developer Setup
- [ ] Apple Developer account active
- [ ] App ID created with capabilities
- [ ] Merchant ID created for Apple Pay
- [ ] Certificates generated
- [ ] Provisioning profiles created

### ✅ Mobile App Functionality
- [ ] App loads without crashes
- [ ] Navigation works between screens
- [ ] API connections successful
- [ ] Authentication flow complete
- [ ] Secure storage working
- [ ] Error handling working

**Test Steps:**
1. Launch app on simulator/device
2. Complete registration flow
3. Login with created account
4. Navigate between screens
5. Check network requests in logs

## 💰 Payment System

### ✅ Stripe Integration
- [ ] Payment intents create successfully
- [ ] Apple Pay configuration working
- [ ] Webhook signature verification
- [ ] Payment success handling
- [ ] Payment failure handling
- [ ] Refund processing (if needed)

**Test Commands:**
```bash
# Test payment intent creation
curl -X POST http://localhost:3000/payments/deposit-intent \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amountCents": 1000}'
```

### ✅ Ledger System
- [ ] Double-entry transactions work
- [ ] Zero-sum constraint enforced
- [ ] Idempotency keys prevent duplicates
- [ ] Transaction history accurate
- [ ] Balance calculations correct

**Test Commands:**
```bash
# Test ledger transaction
curl -X POST http://localhost:3000/test/ledger \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "description": "Test transaction"
  }'
```

## 🏪 Market System

### ✅ Market Creation
- [ ] Admin can create markets
- [ ] LMSR state initialized correctly
- [ ] Market appears in listings
- [ ] Market details displayed correctly
- [ ] Market lifecycle managed

**Test Commands:**
```bash
# Create test market (as admin)
curl -X POST http://localhost:3000/admin/markets \
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Market",
    "description": "Will this work?",
    "closeAt": "2024-12-31T23:59:59Z",
    "outcomeType": "BINARY",
    "liquidityParam": 1000
  }'
```

### ✅ Trading System  
- [ ] Market quotes generated correctly
- [ ] Trade execution works
- [ ] Position tracking accurate
- [ ] LMSR pricing updates
- [ ] Fee calculation correct

**Test Commands:**
```bash
# Get market quote
curl http://localhost:3000/markets/MARKET_ID/quote?outcome=YES&shares=10

# Execute trade
curl -X POST http://localhost:3000/markets/MARKET_ID/trades \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "outcome": "YES",
    "shares": 10,
    "idempotencyKey": "unique-key-123"
  }'
```

## 🔒 Security & Compliance

### ✅ Security Measures
- [ ] HTTPS enforced (production)
- [ ] Rate limiting active
- [ ] Input validation working
- [ ] SQL injection protection
- [ ] XSS protection
- [ ] CSRF protection
- [ ] Security headers set

### ✅ Data Protection
- [ ] PII encryption working
- [ ] Secure logging (no sensitive data)
- [ ] Database encryption at rest
- [ ] Secure key management
- [ ] Data retention policies
- [ ] GDPR compliance features

### ✅ KYC/AML System
- [ ] KYC provider integration
- [ ] Document verification
- [ ] Age verification (18+)
- [ ] Geographic restrictions (AU only)
- [ ] Transaction monitoring
- [ ] AML event logging

**Test Commands:**
```bash
# Test KYC flow
curl -X POST http://localhost:3000/kyc/start \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "documentType": "passport",
    "country": "AU"
  }'
```

## 📊 Monitoring & Observability

### ✅ Health Monitoring
- [ ] Health checks responding
- [ ] Metrics collection working
- [ ] Error tracking configured
- [ ] Log aggregation working
- [ ] Alert rules configured
- [ ] Dashboard accessible

**Test Commands:**
```bash
# Test monitoring endpoints
curl http://localhost:3000/health
curl http://localhost:3000/health/business
curl http://localhost:3000/metrics
```

### ✅ Performance Monitoring
- [ ] Response time tracking
- [ ] Database query monitoring
- [ ] Memory usage tracking
- [ ] Error rate monitoring
- [ ] Business metrics tracking

## 🚀 Production Readiness

### ✅ Infrastructure
- [ ] Production environment configured
- [ ] SSL certificates installed
- [ ] CDN configured
- [ ] Load balancer configured
- [ ] Auto-scaling configured
- [ ] Backup systems working

### ✅ CI/CD Pipeline
- [ ] GitHub Actions configured
- [ ] Tests running automatically
- [ ] Security scans passing
- [ ] Deployment automation working
- [ ] Rollback procedures tested

### ✅ App Store Preparation
- [ ] Apple Developer account ready
- [ ] App icons and screenshots prepared
- [ ] App description written
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Age rating configured (17+)
- [ ] Geographic restrictions set (AU only)

## ✅ Final Verification

### ✅ End-to-End Flow
- [ ] User can register and verify email
- [ ] User can complete KYC verification
- [ ] User can deposit funds via Apple Pay
- [ ] User can view available markets
- [ ] User can place trades
- [ ] User can view portfolio
- [ ] Admin can create and resolve markets
- [ ] User can withdraw funds
- [ ] All transactions recorded correctly

### ✅ Security Audit
- [ ] Security checklist completed
- [ ] Penetration testing done
- [ ] Code review completed
- [ ] Dependencies audited
- [ ] Secrets properly secured
- [ ] Access controls verified

### ✅ Compliance Verification
- [ ] Legal requirements met
- [ ] Regulatory approvals obtained
- [ ] Privacy policies compliant
- [ ] Data handling compliant
- [ ] Financial reporting ready
- [ ] Audit trail complete

## 🎯 Launch Checklist

- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security scans clean
- [ ] Documentation complete
- [ ] Support team trained
- [ ] Monitoring alerts configured
- [ ] Incident response plan ready
- [ ] Legal compliance verified
- [ ] App Store submission approved
- [ ] Marketing materials ready

## 📞 Support Contacts

Keep these handy during setup:

- **Technical Issues**: [Your tech team]
- **Stripe Support**: [Stripe dashboard]
- **Apple Developer Support**: [Apple Developer portal]
- **AWS Support**: [AWS console]
- **Legal/Compliance**: [Your legal team]

---

**🎉 Once everything is checked off, you're ready to launch Aussie Markets!**

Remember to test everything thoroughly in staging before going to production.
