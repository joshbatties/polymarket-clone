# Aussie Markets 🇦🇺

A secure, regulated prediction market platform for Australian users, built with modern technology and comprehensive security measures.

## 🎯 Project Overview

Aussie Markets is a sophisticated prediction market platform designed specifically for Australian users, featuring:

- **🇦🇺 Australian Dollar Trading** - Real-money prediction markets in AUD
- **🔐 Bank-Grade Security** - Argon2id authentication, secure token management
- **📱 Native Mobile Experience** - iOS/Android apps with seamless user experience  
- **⚡ Real-time Trading** - LMSR automated market maker for continuous liquidity
- **🏛️ Regulatory Compliance** - Full Australian AML/CTF and gambling compliance
- **💳 Secure Payments** - Apple Pay integration via Stripe for instant deposits

## 📚 Complete Documentation

### 📖 **[📋 Complete Documentation Hub](./docs/README.md)**
Start here for comprehensive project documentation covering all aspects of the system.

### 🏗️ **[Architecture Overview](./docs/architecture/README.md)**
- System design principles and technology decisions
- Epoch 1 & 2 implementation details  
- Security architecture and data flow
- Infrastructure and deployment strategy

### 🔧 **[API Documentation](./docs/api/README.md)**
- Complete endpoint documentation with examples
- Authentication system (Argon2id + JWT + refresh tokens)
- Database schema and entity relationships
- Security measures and validation

### 📱 **[Mobile App Documentation](./docs/mobile/README.md)**
- React Native + Expo implementation guide
- Secure token storage and auto-refresh
- State management with Zustand + React Query
- Mobile security best practices

### 🔒 **[Security Documentation](./docs/security/README.md)**
- OWASP MASVS compliance implementation
- Comprehensive security measures and monitoring
- Australian regulatory compliance (AML/CTF, Privacy Act)
- Incident response and security operations

### 🚀 **[Deployment Guide](./docs/deployment/README.md)**
- AWS infrastructure setup and configuration
- CI/CD pipeline with GitHub Actions
- Environment management and scaling
- Monitoring, backup, and disaster recovery

## ⚡ Quick Start

### Prerequisites
- Node.js 20+ and pnpm 9+
- Docker for local development
- iOS Simulator or Android Emulator

### 🚀 Local Development Setup

```bash
# 1. Clone and install dependencies
git clone <repository-url>
cd aussie-markets
pnpm install

# 2. Start local database
docker run --name aussie-markets-db \
  -e POSTGRES_DB=aussie_markets_dev \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 -d postgres:15

# 3. Configure environment
cp apps/api/env.example apps/api/.env.local
# Edit .env.local with your database configuration

# 4. Start development servers
pnpm run dev
```

### 📱 Mobile Development

```bash
# Start mobile development
cd apps/mobile
pnpm start

# Run on iOS
pnpm run ios

# Run on Android  
pnpm run android
```

## 🏗️ Architecture Overview

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Mobile App** | Expo (React Native) + TypeScript | iOS/Android native experience |
| **Backend API** | NestJS + TypeScript | Scalable, secure backend services |
| **Database** | PostgreSQL 15+ with TypeORM | Reliable data persistence |
| **Cache** | Redis 7+ | Session management and performance |
| **Payments** | Stripe + Apple Pay | Secure payment processing |
| **Infrastructure** | AWS ap-southeast-2 | Australian data residency |
| **CI/CD** | GitHub Actions + EAS Build | Automated deployment |

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   Mobile App    │    │   Admin Panel   │
│  (React Native) │    │   (Future)      │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          └──────────┬───────────┘
                     │
        ┌─────────────▼───────────────┐
        │        API Gateway          │
        │     (NestJS + Express)      │
        └─────────────┬───────────────┘
                      │
        ┌─────────────▼───────────────┐
        │     Business Logic          │
        │  Auth │ Markets │ Trading   │
        │  KYC  │ Wallet  │ Admin     │
        └─────────────┬───────────────┘
                      │
        ┌─────────────▼───────────────┐
        │      Data Layer             │
        │ PostgreSQL │ Redis │ S3    │
        └─────────────────────────────┘
```

## 🔐 Security & Compliance

### Security Highlights

- **🔒 Argon2id Password Hashing** - Memory cost ≥64MB, time cost ≥3 iterations
- **🎫 Dual-Token Authentication** - Short-lived JWT + long-lived refresh tokens  
- **📱 Secure Mobile Storage** - Keychain/Keystore only (never AsyncStorage)
- **🛡️ Defense in Depth** - Multiple security layers with real-time monitoring
- **🔐 Field-Level Encryption** - Additional protection for sensitive data

### Regulatory Compliance

- **🇦🇺 Australian Privacy Act** - Data protection and user privacy
- **🏛️ AML/CTF Compliance** - Anti-money laundering and counter-terrorism financing
- **📋 OWASP MASVS** - Mobile Application Security Verification Standard
- **💳 PCI DSS** - Payment security via Stripe (SAQ-A eligibility)

## 📊 Project Status

### ✅ Completed Features

#### 🏗️ **Epoch 1 - Foundation** (COMPLETED)
- [x] **Monorepo Setup** - pnpm workspaces with optimized dependency management
- [x] **Code Quality** - ESLint + Prettier with strict TypeScript
- [x] **CI/CD Pipeline** - Automated testing, security scanning, deployment
- [x] **Infrastructure Design** - Complete AWS ap-southeast-2 architecture
- [x] **Documentation** - Comprehensive technical documentation

#### 🔐 **Epoch 2 - Authentication & Authorization** (COMPLETED)  
- [x] **Secure Authentication** - Argon2id password hashing with proper parameters
- [x] **Token Management** - JWT access tokens (15min) + opaque refresh tokens (256-bit)
- [x] **Email Verification** - JWS signed tokens with 24-hour expiry
- [x] **Mobile Security** - Keychain storage, automatic token refresh
- [x] **Role-Based Access** - User/admin roles with NestJS guards
- [x] **Complete Auth Flow** - Register → Email verification → Login → Persistent sessions

### 🚀 **READY TO LAUNCH? START HERE!**

### 🎯 **[📋 Implementation Summary](./IMPLEMENTATION-SUMMARY.md)** 
**READ THIS FIRST** - Complete overview of what's built and what you need to do.

### ⚡ **Quick Setup (30 minutes)**
**New to the project?** Start here for a minimal development environment:
- **[⚡ Quick Start Guide](./QUICK-START.md)** - Get running in 30 minutes
- **[🔧 Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions

### 🏢 **Production Setup (1-2 weeks)**
**Ready for production?** Follow the comprehensive setup:
- **[📋 Complete Setup Guide](./SETUP.md)** - Full infrastructure setup  
- **[✅ Setup Checklist](./SETUP-CHECKLIST.md)** - Verify everything works
- **[💰 Cost Estimates](./COST-ESTIMATES.md)** - Budget planning (~$2,740/month)
- **[🏪 App Store Submission](./docs/app-store-submission.md)** - Publication guide

### 💼 **What You'll Need**
- **Time**: 2-4 hours (dev) or 1-2 weeks (production)
- **Budget**: $75/month (dev) or $81K+ (launch)
- **Services**: Stripe account, Apple Developer account, domain
- **Legal**: Australian business entity, potential gambling license

## ✅ **PROJECT STATUS: PRODUCTION READY** 

All 10 epochs completed! The codebase includes:
- 🔐 **Enterprise Security** - MASVS compliance, TLS pinning, field encryption
- 💰 **Financial Systems** - Double-entry ledger, LMSR trading, Stripe payments  
- 📱 **Mobile Apps** - iOS/Android with Apple Pay integration
- 🏛️ **Compliance** - KYC/AML, responsible gambling, Australian regulations
- 📊 **Observability** - OpenTelemetry, monitoring, alerting
- 🧪 **Testing** - Comprehensive test coverage including chaos engineering

## 🛠️ Development

### Code Quality Standards
- **Strict TypeScript** - Type safety across all components
- **Comprehensive Testing** - Unit and integration test coverage
- **Security Scanning** - SAST, dependency auditing, SBOM generation
- **Documentation** - Every feature thoroughly documented

### Development Workflow
1. **Feature Branch** - Create from `main` branch
2. **Implementation** - Follow TypeScript and security guidelines
3. **Testing** - Add comprehensive tests for new features
4. **Documentation** - Update relevant documentation
5. **Pull Request** - Automated checks must pass
6. **Code Review** - Team review and approval
7. **Deployment** - Automated staging deployment

## 📞 Support & Resources

### 🆘 Getting Help
- **📖 Documentation** - Start with [Complete Documentation](./docs/README.md)
- **🐛 Issues** - Create GitHub issues for bugs and feature requests
- **💬 Development** - Contact the development team for technical questions

### 🚨 Emergency Procedures
- **🔒 Security Incidents** - Follow [Security Documentation](./docs/security/README.md#incident-response)
- **⚡ System Outages** - Follow [Deployment Guide](./docs/deployment/README.md#troubleshooting)
- **💾 Data Recovery** - Follow [Backup Procedures](./docs/deployment/README.md#backup--recovery)

## 📄 License

**Proprietary** - JPC Group. All rights reserved.

---

**🚀 Ready to get started?** Begin with the [Complete Documentation](./docs/README.md) for comprehensive guidance on every aspect of the Aussie Markets platform.
