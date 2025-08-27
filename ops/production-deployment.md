# Production Deployment Guide - Aussie Markets

## Overview
This document outlines the production deployment process for Aussie Markets, including infrastructure setup, security hardening, monitoring, and feature flag management.

## Infrastructure Architecture

### AWS Resources (ap-southeast-2)

#### Core Services
- **ECS Fargate**: Container orchestration for API services
- **RDS PostgreSQL**: Primary database with Multi-AZ deployment
- **ElastiCache Redis**: Caching and session storage
- **Application Load Balancer**: Traffic distribution and SSL termination
- **S3**: Static asset storage and backups
- **CloudFront**: CDN for mobile app assets
- **Route 53**: DNS management
- **AWS Certificate Manager**: SSL/TLS certificates

#### Security & Monitoring
- **AWS WAF**: Web application firewall
- **GuardDuty**: Threat detection
- **CloudTrail**: API logging and auditing
- **CloudWatch**: Monitoring and alerting
- **Systems Manager (SSM)**: Secrets management
- **KMS**: Encryption key management

#### Networking
- **VPC**: Isolated network environment
- **Private Subnets**: Database and internal services
- **Public Subnets**: Load balancers and NAT gateways
- **Security Groups**: Firewall rules
- **NACLs**: Network-level access control

### Resource Specifications

#### API Service (ECS Fargate)
```yaml
CPU: 2 vCPU (2048 CPU units)
Memory: 4 GB (4096 MB)
Min Instances: 2
Max Instances: 10
Target CPU: 70%
Health Check: /health
```

#### Database (RDS PostgreSQL)
```yaml
Instance Class: db.r6g.large
Engine Version: PostgreSQL 15.4
Storage: 100 GB gp3 (encrypted)
Multi-AZ: Enabled
Backup Retention: 7 days
Maintenance Window: Sun 02:00-03:00 AEST
```

#### Cache (ElastiCache Redis)
```yaml
Node Type: cache.r6g.large
Engine Version: Redis 7.0
Number of Nodes: 2 (with replication)
Parameter Group: Custom (optimized for sessions)
```

## Deployment Process

### Prerequisites
- [ ] AWS Account setup with appropriate IAM roles
- [ ] Terraform/CDK infrastructure as code
- [ ] CI/CD pipeline configured
- [ ] SSL certificates provisioned
- [ ] DNS domains configured
- [ ] Secrets stored in SSM Parameter Store

### Environment Configuration

#### Production Environment Variables
```bash
# Application
NODE_ENV=production
APP_VERSION=1.0.0
SERVICE_NAME=aussie-markets-api
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://username:password@prod-db.region.rds.amazonaws.com:5432/aussiemarkets
DATABASE_SSL=true
DATABASE_MAX_CONNECTIONS=50

# Redis
REDIS_URL=rediss://prod-cache.region.cache.amazonaws.com:6380
REDIS_TLS=true

# Security
JWT_SECRET=${ssm:/aussiemarkets/prod/jwt-secret}
REFRESH_TOKEN_SECRET=${ssm:/aussiemarkets/prod/refresh-secret}
FIELD_ENCRYPTION_KEY=${ssm:/aussiemarkets/prod/encryption-key}
FIELD_SEARCH_KEY=${ssm:/aussiemarkets/prod/search-key}

# External Services
STRIPE_SECRET_KEY=${ssm:/aussiemarkets/prod/stripe-secret}
STRIPE_WEBHOOK_SECRET=${ssm:/aussiemarkets/prod/stripe-webhook}
STRIPE_PUBLISHABLE_KEY=${ssm:/aussiemarkets/prod/stripe-publishable}

# Monitoring
JAEGER_ENDPOINT=https://jaeger.aussiemarkets.com.au
METRICS_PORT=9464
PAGERDUTY_ROUTING_KEY=${ssm:/aussiemarkets/prod/pagerduty-key}
SLACK_WEBHOOK_URL=${ssm:/aussiemarkets/prod/slack-webhook}

# Feature Flags
FEATURE_FLAG_SERVICE=unleash
UNLEASH_URL=https://unleash.aussiemarkets.com.au
UNLEASH_API_KEY=${ssm:/aussiemarkets/prod/unleash-key}

# Rate Limiting
RATE_LIMIT_REDIS_URL=${REDIS_URL}
RATE_LIMIT_ENABLED=true

# Compliance
KYC_PROVIDER=onfido
KYC_API_KEY=${ssm:/aussiemarkets/prod/kyc-api-key}
AML_MONITORING_ENABLED=true
```

### Deployment Steps

#### 1. Infrastructure Deployment
```bash
# Deploy infrastructure using Terraform/CDK
cd infrastructure/
terraform init
terraform plan -var-file=production.tfvars
terraform apply
```

#### 2. Database Migration
```bash
# Run database migrations
export DATABASE_URL="..."
npx prisma migrate deploy
npx prisma generate
```

#### 3. Secrets Management
```bash
# Store secrets in AWS Systems Manager
aws ssm put-parameter --name "/aussiemarkets/prod/jwt-secret" --value "..." --type "SecureString"
aws ssm put-parameter --name "/aussiemarkets/prod/stripe-secret" --value "..." --type "SecureString"
# ... other secrets
```

#### 4. Application Deployment
```bash
# Build and deploy via CI/CD pipeline
git tag v1.0.0
git push origin v1.0.0

# Or manual deployment
docker build -t aussiemarkets-api:1.0.0 .
docker tag aussiemarkets-api:1.0.0 ${ECR_REGISTRY}/aussiemarkets-api:1.0.0
docker push ${ECR_REGISTRY}/aussiemarkets-api:1.0.0

# Update ECS service
aws ecs update-service --cluster production --service aussiemarkets-api --force-new-deployment
```

#### 5. Mobile App Deployment
```bash
# Build production mobile app
cd apps/mobile
eas build --platform all --profile production

# Submit to App Store
eas submit --platform ios --profile production
```

## Feature Flag Configuration

### Feature Flag Service (Unleash)

#### Core Feature Flags
```yaml
# Trading Features
trading_enabled:
  default: true
  description: "Enable/disable all trading functionality"
  
market_creation_enabled:
  default: true
  description: "Allow creation of new markets"
  
withdrawal_processing:
  default: false  # Start disabled, enable after license
  description: "Enable withdrawal processing"

# Compliance Features
kyc_verification_required:
  default: true
  description: "Require KYC verification for deposits"
  
enhanced_aml_monitoring:
  default: true
  description: "Enable enhanced AML transaction monitoring"

responsible_gambling_enforced:
  default: true
  description: "Enforce responsible gambling limits"

# Performance Features
redis_caching_enabled:
  default: true
  description: "Enable Redis caching for improved performance"

rate_limiting_strict:
  default: true
  description: "Enable strict rate limiting"

# Geographic Features
geo_restriction_enforced:
  default: true
  description: "Enforce geographic restrictions to Australia"

ip_geolocation_enabled:
  default: true
  description: "Enable IP-based geolocation checking"

# Security Features
tls_pinning_enforced:
  default: true
  description: "Enforce TLS certificate pinning"

root_detection_enabled:
  default: true
  description: "Enable root/jailbreak detection"

# Monitoring Features
detailed_logging_enabled:
  default: true
  description: "Enable detailed application logging"

telemetry_collection:
  default: true
  description: "Enable telemetry and metrics collection"
```

#### Staged Rollout Strategy
```yaml
# Phase 1: Internal Testing (Week 1)
target_audience: internal_team
user_segments: ["employee", "internal_tester"]
rollout_percentage: 100%

# Phase 2: Beta Testing (Week 2-3)
target_audience: beta_users
user_segments: ["beta_tester"]
rollout_percentage: 100%

# Phase 3: Soft Launch (Week 4-5)
target_audience: early_adopters
user_segments: ["early_adopter"]
rollout_percentage: 20%

# Phase 4: Full Launch (Week 6+)
target_audience: general_public
user_segments: ["general"]
rollout_percentage: 100%
```

## Security Hardening

### Network Security
```yaml
# AWS WAF Rules
- SQL Injection Protection
- XSS Protection
- Rate Limiting (1000 req/5min per IP)
- Geo-blocking (Australia only)
- Known bad IPs blocking

# Security Groups
API-SG:
  ingress:
    - port: 443, source: ALB-SG
    - port: 9464, source: monitoring-SG
  egress:
    - port: 5432, destination: DB-SG
    - port: 6379, destination: CACHE-SG
    - port: 443, destination: 0.0.0.0/0

DB-SG:
  ingress:
    - port: 5432, source: API-SG
  egress: none

CACHE-SG:
  ingress:
    - port: 6379, source: API-SG
  egress: none
```

### Application Security
```yaml
# Container Security
- Non-root user execution
- Read-only root filesystem
- Security updates automated
- Vulnerability scanning enabled

# Secrets Management
- All secrets in AWS SSM
- Automatic rotation enabled
- Least privilege access
- Audit logging enabled

# Encryption
- Data at rest: AES-256
- Data in transit: TLS 1.3
- Database: Encrypted with KMS
- Backups: Encrypted
```

## Monitoring and Alerting

### Health Checks
```yaml
# Application Load Balancer
Health Check Path: /health
Healthy Threshold: 2
Unhealthy Threshold: 3
Timeout: 5 seconds
Interval: 30 seconds

# ECS Service
Health Check Grace Period: 300 seconds
```

### CloudWatch Metrics
```yaml
# Application Metrics
- CPU Utilization
- Memory Utilization
- Request Count
- Response Time
- Error Rate

# Business Metrics
- Deposits per minute
- Trades per minute
- Active users
- Withdrawal processing time
- Ledger balance drift

# Security Metrics
- Failed authentication attempts
- Rate limit violations
- Geographic access attempts
- TLS handshake failures
```

### Alerting Rules
```yaml
# Critical Alerts (PagerDuty)
- API Error Rate > 5%
- Database Connection Failure
- Ledger Balance Drift > $10
- Security Breach Detected

# Warning Alerts (Slack)
- Response Time P95 > 300ms
- Memory Usage > 80%
- Failed Login Rate > 10/min
- Pending Withdrawals > 50

# Info Alerts (Email)
- Deployment Completed
- Daily Business Summary
- Weekly Security Report
```

## Backup and Disaster Recovery

### Database Backups
```yaml
# Automated Backups
Frequency: Daily
Retention: 30 days
Cross-Region: Enabled (ap-southeast-1)
Point-in-Time Recovery: 7 days

# Manual Snapshots
Pre-deployment: Always
Major releases: Required
Quarterly: Full backup with export
```

### Application Recovery
```yaml
# Multi-AZ Deployment
Primary: ap-southeast-2a
Secondary: ap-southeast-2b
Failover: Automatic (< 5 minutes)

# Blue-Green Deployment
Strategy: Zero-downtime deployments
Rollback: < 2 minutes
Health Check: Automated
```

## Maintenance Windows

### Scheduled Maintenance
```yaml
# Database Maintenance
Window: Sunday 02:00-03:00 AEST
Frequency: Monthly
Notification: 48 hours advance

# Application Updates
Window: Sunday 01:00-02:00 AEST
Frequency: Weekly
Notification: 24 hours advance

# Security Updates
Window: As required (emergency)
Notification: 2 hours advance (if possible)
```

## Compliance and Auditing

### Regulatory Requirements
- **AUSTRAC**: Transaction reporting and monitoring
- **ASIC**: Financial services compliance
- **Privacy Act**: Data protection and user rights
- **PCI DSS**: Payment card data security

### Audit Logging
```yaml
# Application Logs
Level: INFO and above
Retention: 90 days
Format: Structured JSON
Destination: CloudWatch Logs

# Security Logs
- Authentication events
- Authorization failures
- Admin actions
- Data access logs
- Configuration changes

# Business Logs
- Financial transactions
- Market resolutions
- User registrations
- Compliance events
```

## Performance Monitoring

### SLAs
```yaml
# Availability
Target: 99.9% uptime
Measurement: Monthly
Exclusions: Scheduled maintenance

# Performance
API Response Time: P95 < 300ms
Database Query Time: P95 < 100ms
Page Load Time: < 3 seconds

# Reliability
Error Rate: < 0.1%
Crash-Free Rate: > 99.5%
```

### Load Testing
```yaml
# Regular Testing
Frequency: Monthly
Scenarios: Normal load, peak load, stress test
Metrics: Response time, error rate, throughput

# Pre-deployment Testing
Scope: All major releases
Duration: 30 minutes sustained load
Acceptance: No degradation vs baseline
```

## Troubleshooting Runbooks

### Common Issues
- [High Response Times](runbooks/high-response-times.md)
- [Database Connection Issues](runbooks/database-issues.md)
- [Redis Cache Problems](runbooks/redis-issues.md)
- [Authentication Failures](runbooks/auth-issues.md)
- [Payment Processing Errors](runbooks/payment-issues.md)
- [Ledger Balance Drift](runbooks/ledger-drift.md)

### Emergency Contacts
```yaml
# On-Call Rotation
Primary: tech-oncall@aussiemarkets.com.au
Secondary: senior-engineer@aussiemarkets.com.au
Escalation: cto@aussiemarkets.com.au

# External Vendors
Stripe Support: +1-888-963-8352
AWS Support: Enterprise Support Plan
Database Expert: consultant@dbexperts.com.au
```

## Security Incident Response

### Response Team
```yaml
# Incident Commander
Role: Lead technical response
Contact: security@aussiemarkets.com.au

# Communications Lead
Role: Customer and stakeholder communication
Contact: communications@aussiemarkets.com.au

# Legal Counsel
Role: Regulatory and legal compliance
Contact: legal@aussiemarkets.com.au
```

### Response Procedures
1. **Detection**: Automated alerts and monitoring
2. **Assessment**: Determine scope and impact
3. **Containment**: Isolate and stop the threat
4. **Investigation**: Root cause analysis
5. **Recovery**: Restore normal operations
6. **Lessons Learned**: Post-incident review

## Success Metrics

### Technical Metrics
- Deployment frequency: Daily
- Lead time: < 1 hour
- MTTR: < 15 minutes
- Change failure rate: < 5%

### Business Metrics
- User registration rate
- Deposit conversion rate
- Trading volume
- Customer satisfaction (NPS)
- Support ticket volume

### Security Metrics
- Security incidents: 0 per month
- Vulnerability resolution: < 48 hours
- Compliance audit score: > 95%
- Penetration test findings: 0 critical

This production deployment guide ensures Aussie Markets launches with enterprise-grade reliability, security, and compliance for the Australian market.
