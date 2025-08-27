# 🔧 Troubleshooting Guide - Aussie Markets

Common issues and solutions when setting up Aussie Markets.

## 🔍 Quick Diagnostics

### Check System Status
```bash
# Check if services are running
lsof -i :3000  # API server
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :8081  # Expo dev server

# Check database connection
cd apps/api
npx prisma db ping

# Check Redis connection
redis-cli ping
```

## 🗄️ Database Issues

### Error: "connect ECONNREFUSED"
```bash
# PostgreSQL not running
brew services start postgresql@15
# OR
sudo systemctl start postgresql

# Wrong DATABASE_URL
# Check your .env.local file
echo $DATABASE_URL
```

### Error: "database does not exist"
```bash
# Create the database
createdb aussiemarkets_dev

# Or connect and create manually
psql postgres
CREATE DATABASE aussiemarkets_dev;
\q
```

### Error: "password authentication failed"
```bash
# Reset PostgreSQL password
psql postgres
ALTER USER postgres PASSWORD 'newpassword';
\q

# Update DATABASE_URL in .env.local
```

### Prisma Migration Issues
```bash
# Reset database completely
npx prisma db push --force-reset

# If that fails, drop and recreate
dropdb aussiemarkets_dev
createdb aussiemarkets_dev
npx prisma db push
```

### Database Connection Pool Errors
```bash
# Add connection limits to DATABASE_URL
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=5&pool_timeout=20"
```

## 🔴 Redis Issues

### Error: "Redis connection to localhost:6379 failed"
```bash
# Install and start Redis
brew install redis
brew services start redis

# Check if Redis is running
redis-cli ping
# Should return "PONG"
```

### Error: "NOAUTH Authentication required"
```bash
# Redis has password protection
# Either disable auth in redis.conf or add password to REDIS_URL
REDIS_URL="redis://:password@localhost:6379"
```

### Redis Memory Issues
```bash
# Check Redis memory usage
redis-cli info memory

# Clear Redis if needed
redis-cli flushall
```

## 💳 Stripe Issues

### Error: "No such payment_intent"
```bash
# Make sure you're using test keys (pk_test_, sk_test_)
# Check Stripe Dashboard > Logs for details
# Verify webhook endpoint is correct
```

### Webhook Signature Verification Failed
```bash
# Check webhook secret matches
echo $STRIPE_WEBHOOK_SECRET

# For local development, use Stripe CLI
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe
# Copy the webhook secret from output
```

### Apple Pay Domain Verification
```bash
# Download verification file from Stripe
# Host at: https://yourdomain.com/.well-known/apple_developer_merchantid_domain_association
# Or use localhost for testing
```

## 📱 Mobile App Issues

### Expo Won't Start
```bash
# Clear cache and restart
npx expo start --clear

# Check Node version (needs 18+)
node --version

# Reinstall dependencies
rm -rf node_modules
pnpm install
```

### Error: "Unable to resolve module"
```bash
# Clear Metro cache
npx expo start --clear

# Reset everything
rm -rf node_modules
rm -rf .expo
pnpm install
```

### iOS Simulator Issues
```bash
# Open simulator manually
open -a Simulator

# Reset simulator
xcrun simctl erase all

# Install iOS runtime if missing
# Xcode > Preferences > Components > Simulators
```

### Android Emulator Issues
```bash
# Check Android Studio AVD Manager
# Start emulator manually from AVD Manager
# Ensure ANDROID_HOME is set correctly
```

### Network Requests Failing
```bash
# Check API_URL in .env.local
# For physical devices, use your computer's IP:
EXPO_PUBLIC_API_URL="http://192.168.1.100:3000"

# Find your IP
ifconfig | grep "inet 192"
```

## 🔐 Authentication Issues

### JWT Token Errors
```bash
# Check JWT secrets are set correctly
echo $JWT_SECRET
echo $REFRESH_TOKEN_SECRET

# Regenerate secrets if needed
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Password Hashing Errors
```bash
# Argon2 might need native compilation
npm rebuild argon2

# On M1 Macs, you might need:
arch -x86_64 npm install argon2
```

### Email Verification Not Working
```bash
# Check email provider settings
echo $EMAIL_PROVIDER

# For development, check console logs for email content
# Emails are logged to console when EMAIL_PROVIDER="console"
```

## 🚀 API Server Issues

### Error: "Port 3000 is already in use"
```bash
# Kill process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 pnpm run dev
```

### Environment Variables Not Loading
```bash
# Check .env.local exists and has correct format
cat apps/api/.env.local

# No spaces around = sign
# No quotes around values (unless needed)
# Use absolute paths for file references
```

### TypeScript Compilation Errors
```bash
# Clear build cache
rm -rf dist/
rm -rf .next/

# Regenerate Prisma types
npx prisma generate

# Check Node version compatibility
node --version  # Should be 18+
```

### Rate Limiting Issues
```bash
# Disable rate limiting for development
RATE_LIMIT_ENABLED=false

# Or increase limits in rate-limit module
```

## 📊 Monitoring Issues

### Health Check Failing
```bash
# Check API server is running
curl http://localhost:3000/health

# Check dependencies
curl http://localhost:3000/health/database
curl http://localhost:3000/health/redis
```

### Logs Not Appearing
```bash
# Set log level
LOG_LEVEL="debug"

# Check console output when starting server
# Logs appear in terminal, not files by default
```

## 🏗️ Build Issues

### pnpm Install Fails
```bash
# Clear pnpm cache
pnpm store prune

# Try npm instead
rm pnpm-lock.yaml
npm install
```

### Prisma Generate Fails
```bash
# Clear Prisma cache
rm -rf node_modules/.prisma/
npx prisma generate
```

### EAS Build Fails
```bash
# Check eas.json configuration
# Ensure Apple Developer account is set up
# Check build logs in Expo dashboard
```

## 🌐 Network Issues

### CORS Errors
```bash
# Check FRONTEND_URL in .env.local
# API includes CORS middleware for specified origins
```

### SSL/TLS Issues
```bash
# For development, disable SSL verification
NODE_TLS_REJECT_UNAUTHORIZED=0

# Don't use this in production!
```

### DNS Resolution Issues
```bash
# Use IP addresses instead of hostnames
# Check /etc/hosts file for conflicts
```

## 🔒 Security Issues

### Encryption Key Errors
```bash
# Regenerate encryption keys
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Ensure keys are base64 encoded, not hex
FIELD_ENCRYPTION_KEY="base64-encoded-key-here"
```

### Permission Denied Errors
```bash
# Check file permissions
chmod +x scripts/*

# Check database permissions
# Ensure user has CREATE/DROP privileges
```

## 📱 Apple Developer Issues

### Code Signing Errors
```bash
# Check Apple Developer account status
# Ensure certificates are valid
# Check bundle identifier matches App ID
```

### Apple Pay Configuration
```bash
# Verify merchant ID is configured
# Check domain verification file
# Ensure capabilities are enabled in Xcode
```

## 🆘 Getting More Help

### Logs to Check
```bash
# API Server logs
cd apps/api && pnpm run dev

# Expo logs
cd apps/mobile && npx expo start

# Database logs
tail -f /usr/local/var/log/postgresql@15/server.log

# Redis logs
redis-cli monitor
```

### Debugging Commands
```bash
# Test database connection
cd apps/api && npx prisma studio

# Test Redis connection
redis-cli

# Test API endpoints
curl -v http://localhost:3000/health

# Check environment variables
printenv | grep -E "DATABASE|REDIS|STRIPE"
```

### Reset Everything
```bash
# Nuclear option - reset everything
rm -rf node_modules
rm -rf .expo
rm pnpm-lock.yaml
dropdb aussiemarkets_dev
createdb aussiemarkets_dev
redis-cli flushall
pnpm install
cd apps/api && npx prisma db push
```

## 📞 Support Resources

### Documentation
- [Prisma Docs](https://www.prisma.io/docs)
- [NestJS Docs](https://docs.nestjs.com)
- [Expo Docs](https://docs.expo.dev)
- [Stripe Docs](https://stripe.com/docs)

### Community Help
- [Prisma Discord](https://pris.ly/discord)
- [Expo Discord](https://discord.gg/4gtbPAdpaE)
- [NestJS Discord](https://discord.gg/G7Qnnhy)

### Service Status Pages
- [Stripe Status](https://status.stripe.com)
- [Expo Status](https://status.expo.dev)
- [AWS Status](https://status.aws.amazon.com)

### Error Patterns

#### If you see "Cannot find module"
1. Run `pnpm install`
2. Check imports are correct
3. Clear cache and restart

#### If you see "Connection refused"
1. Check service is running
2. Check ports are correct
3. Check firewall settings

#### If you see "Unauthorized" 
1. Check API keys are correct
2. Check authentication headers
3. Check user permissions

#### If you see "Invalid signature"
1. Check webhook secrets
2. Check timestamp tolerance
3. Check request body format

Remember: Most issues are configuration problems, not code problems. Double-check your environment variables first!
