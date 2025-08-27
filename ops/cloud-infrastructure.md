# Cloud Infrastructure - Staging Environment

This document outlines the cloud infrastructure requirements for the Aussie Markets staging environment in AWS ap-southeast-2.

## Required AWS Resources

### 1. Database (Amazon RDS)
- **Engine**: PostgreSQL 15+
- **Instance Class**: db.t3.micro (staging) / db.r6g.large (production)
- **Storage**: 20GB General Purpose SSD (gp3)
- **Multi-AZ**: No (staging) / Yes (production)
- **Backup Retention**: 7 days
- **Security Groups**: Allow access from API servers only
- **Encryption**: Enabled with AWS KMS

**Configuration**:
```bash
# RDS Instance Identifier
aussie-markets-staging-db

# Database Name
aussie_markets_staging

# Master Username
aussie_markets_admin

# Connection String Format
postgresql://aussie_markets_admin:${password}@aussie-markets-staging-db.xxxxx.ap-southeast-2.rds.amazonaws.com:5432/aussie_markets_staging
```

### 2. Cache (Amazon ElastiCache)
- **Engine**: Redis 7.0+
- **Node Type**: cache.t3.micro (staging) / cache.r6g.large (production)
- **Number of Replicas**: 0 (staging) / 1+ (production)
- **Subnet Group**: Private subnets
- **Security Groups**: Allow access from API servers only
- **Encryption**: In-transit and at-rest

**Configuration**:
```bash
# Cluster Identifier
aussie-markets-staging-redis

# Connection String Format
redis://aussie-markets-staging-redis.xxxxx.cache.ap-southeast-2.amazonaws.com:6379
```

### 3. Application Load Balancer (ALB)
- **Scheme**: Internet-facing
- **IP Address Type**: IPv4
- **Target Groups**: API servers (port 3000)
- **Health Checks**: `/api/v1/health`
- **SSL Certificate**: AWS Certificate Manager
- **Security Groups**: Allow HTTPS (443) from internet, HTTP (80) redirect to HTTPS

### 4. Container Infrastructure

#### Option A: Amazon ECS (Recommended)
- **Cluster**: aussie-markets-staging
- **Service**: aussie-markets-api-staging
- **Task Definition**: aussie-markets-api-task
- **Launch Type**: Fargate
- **CPU**: 0.25 vCPU (staging) / 1 vCPU (production)
- **Memory**: 512 MB (staging) / 2 GB (production)
- **Container Image**: ECR repository

#### Option B: AWS App Runner (Alternative)
- **Service Name**: aussie-markets-api-staging
- **Source**: Container image from ECR
- **Configuration**: Auto-scaling based on requests

### 5. Container Registry (Amazon ECR)
- **Repository Name**: aussie-markets/api
- **Image URI**: {account-id}.dkr.ecr.ap-southeast-2.amazonaws.com/aussie-markets/api
- **Lifecycle Policy**: Keep last 10 images, delete untagged after 1 day

### 6. Storage (Amazon S3)
- **Bucket Name**: aussie-markets-staging-logs
- **Purpose**: Application logs, build artifacts, backups
- **Versioning**: Enabled
- **Encryption**: AES-256
- **Lifecycle Policy**: Delete logs after 90 days

### 7. Secrets Management (AWS Systems Manager Parameter Store)
- **Naming Convention**: `/aussie-markets/staging/{service}/{secret}`
- **Encryption**: AWS KMS with custom key
- **Access**: IAM roles with least privilege

### 8. Monitoring & Logging

#### CloudWatch
- **Log Groups**: 
  - `/aws/ecs/aussie-markets-api-staging`
  - `/aussie-markets/staging/application`
- **Metrics**: Custom application metrics
- **Alarms**: Error rate, response time, resource utilization

#### X-Ray (Optional)
- **Tracing**: Enable for API requests
- **Service Map**: Visualize service dependencies

## Network Configuration

### VPC Setup
- **CIDR Block**: 10.0.0.0/16
- **Availability Zones**: 2 (ap-southeast-2a, ap-southeast-2b)

### Subnets
- **Public Subnets**: 10.0.1.0/24, 10.0.2.0/24 (ALB)
- **Private Subnets**: 10.0.10.0/24, 10.0.20.0/24 (ECS, RDS, Redis)

### Security Groups
- **ALB Security Group**: Port 80, 443 from internet
- **API Security Group**: Port 3000 from ALB
- **Database Security Group**: Port 5432 from API
- **Redis Security Group**: Port 6379 from API

## Cost Estimates (Monthly - Staging)

| Service | Configuration | Estimated Cost |
|---------|--------------|----------------|
| RDS (PostgreSQL) | db.t3.micro | $15-20 |
| ElastiCache (Redis) | cache.t3.micro | $12-15 |
| ECS Fargate | 0.25 vCPU, 512MB | $8-12 |
| ALB | Standard | $20-25 |
| ECR | 1GB storage | $0.10 |
| S3 | 10GB storage | $0.25 |
| CloudWatch | Basic monitoring | $5-10 |
| **Total** | | **$60-82** |

## Deployment Architecture

```
Internet
    ↓
Route 53 (DNS)
    ↓
CloudFront (CDN) [Optional]
    ↓
Application Load Balancer
    ↓
ECS Fargate (API Containers)
    ↓
RDS PostgreSQL + ElastiCache Redis
```

## Auto Scaling Configuration

### ECS Service Auto Scaling
- **Target Tracking**: 70% CPU utilization
- **Min Capacity**: 1 task
- **Max Capacity**: 3 tasks (staging) / 10 tasks (production)

### Database Scaling
- **Read Replicas**: 0 (staging) / 1+ (production)
- **Storage Auto Scaling**: Enabled, max 100GB

## Backup & Recovery

### Database Backups
- **Automated Backups**: 7 days retention
- **Manual Snapshots**: Before major deployments
- **Point-in-time Recovery**: 5 days

### Application Backups
- **Code**: Git repository
- **Configuration**: Infrastructure as Code (Terraform/CDK)
- **Secrets**: AWS Parameter Store with KMS

## Security Considerations

### Network Security
- All resources in private subnets except ALB
- NACLs for additional layer of protection
- VPC Flow Logs enabled

### Data Security
- Encryption at rest for all data stores
- Encryption in transit (TLS 1.2+)
- Regular security group audits

### Access Control
- IAM roles with least privilege
- Service-linked roles for AWS services
- Regular access reviews

## Implementation Checklist

- [ ] Create VPC and subnets
- [ ] Set up security groups and NACLs
- [ ] Create RDS PostgreSQL instance
- [ ] Set up ElastiCache Redis cluster
- [ ] Configure Application Load Balancer
- [ ] Create ECS cluster and service
- [ ] Set up ECR repository
- [ ] Configure S3 bucket for logs
- [ ] Set up CloudWatch monitoring
- [ ] Configure Parameter Store for secrets
- [ ] Test connectivity and health checks
- [ ] Set up backup procedures
- [ ] Configure auto-scaling policies
- [ ] Document connection strings and endpoints

## Connection Information

After setup, update the following in your environment variables:

```bash
# Database
DATABASE_URL=postgresql://aussie_markets_admin:${password}@aussie-markets-staging-db.xxxxx.ap-southeast-2.rds.amazonaws.com:5432/aussie_markets_staging

# Redis
REDIS_URL=redis://aussie-markets-staging-redis.xxxxx.cache.ap-southeast-2.amazonaws.com:6379

# API Endpoint
API_BASE_URL=https://staging-api.aussie-markets.com
```
