# Aussie Markets - Deployment Documentation

## Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Infrastructure Setup](#infrastructure-setup)
3. [CI/CD Pipeline](#cicd-pipeline)
4. [Environment Configuration](#environment-configuration)
5. [Database Management](#database-management)
6. [Monitoring & Logging](#monitoring--logging)
7. [Backup & Recovery](#backup--recovery)
8. [Security Operations](#security-operations)
9. [Scaling & Performance](#scaling--performance)
10. [Troubleshooting](#troubleshooting)

## Deployment Overview

Aussie Markets uses a modern, cloud-native deployment architecture on AWS ap-southeast-2, designed for high availability, security, and scalability. The deployment strategy follows GitOps principles with automated CI/CD pipelines.

### Deployment Architecture

```mermaid
graph TB
    subgraph "GitHub"
        A[Source Code] --> B[GitHub Actions]
    end
    
    subgraph "AWS ap-southeast-2"
        B --> C[ECR Repository]
        B --> D[ECS Cluster]
        
        subgraph "Production"
            D --> E[Load Balancer]
            E --> F[ECS Services]
            F --> G[RDS PostgreSQL]
            F --> H[ElastiCache Redis]
        end
        
        subgraph "Staging"
            D --> I[Staging ALB]
            I --> J[Staging Services]
            J --> K[Staging RDS]
            J --> L[Staging Redis]
        end
    end
    
    subgraph "Mobile"
        B --> M[EAS Build]
        M --> N[TestFlight/Play Console]
    end
```

### Environments

| Environment | Purpose | Auto-Deploy | Manual Approval |
|-------------|---------|-------------|-----------------|
| **Development** | Local development | No | No |
| **Staging** | Testing and QA | Yes (main branch) | No |
| **Production** | Live system | No | Yes |

## Infrastructure Setup

### AWS Account Setup

#### 1. Account Configuration

```bash
# Configure AWS CLI
aws configure --profile aussie-markets
AWS Access Key ID: [Enter your access key]
AWS Secret Access Key: [Enter your secret key]
Default region name: ap-southeast-2
Default output format: json
```

#### 2. IAM Setup

Create deployment user with necessary permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:*",
        "ecr:*",
        "rds:*",
        "elasticache:*",
        "ec2:*",
        "elbv2:*",
        "ssm:*",
        "kms:*",
        "logs:*",
        "cloudformation:*",
        "iam:PassRole"
      ],
      "Resource": "*"
    }
  ]
}
```

### Infrastructure as Code

#### CloudFormation Templates

Create infrastructure using CloudFormation:

```yaml
# infrastructure/vpc.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Aussie Markets VPC Infrastructure'

Parameters:
  Environment:
    Type: String
    Default: staging
    AllowedValues: [staging, production]

Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsHostnames: true
      EnableDnsSupport: true
      Tags:
        - Key: Name
          Value: !Sub 'aussie-markets-vpc-${Environment}'

  PublicSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.1.0/24
      AvailabilityZone: !Select [0, !GetAZs '']
      MapPublicIpOnLaunch: true

  PublicSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.2.0/24
      AvailabilityZone: !Select [1, !GetAZs '']
      MapPublicIpOnLaunch: true

  PrivateSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.10.0/24
      AvailabilityZone: !Select [0, !GetAZs '']

  PrivateSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.20.0/24
      AvailabilityZone: !Select [1, !GetAZs '']
```

#### Database Setup

```yaml
# infrastructure/database.yaml
DatabaseSubnetGroup:
  Type: AWS::RDS::DBSubnetGroup
  Properties:
    DBSubnetGroupDescription: Subnet group for Aussie Markets database
    SubnetIds:
      - !Ref PrivateSubnet1
      - !Ref PrivateSubnet2

DatabaseInstance:
  Type: AWS::RDS::DBInstance
  Properties:
    DBInstanceIdentifier: !Sub 'aussie-markets-db-${Environment}'
    DBName: !Sub 'aussie_markets_${Environment}'
    Engine: postgres
    EngineVersion: '15.4'
    DBInstanceClass: !If [IsProduction, db.r6g.large, db.t3.micro]
    AllocatedStorage: 20
    StorageType: gp3
    StorageEncrypted: true
    MasterUsername: !Ref DatabaseUsername
    MasterUserPassword: !Ref DatabasePassword
    VPCSecurityGroups:
      - !Ref DatabaseSecurityGroup
    DBSubnetGroupName: !Ref DatabaseSubnetGroup
    BackupRetentionPeriod: 7
    MultiAZ: !If [IsProduction, true, false]
    DeletionProtection: !If [IsProduction, true, false]
```

### Container Platform Setup

#### ECS Cluster Configuration

```yaml
# infrastructure/ecs.yaml
ECSCluster:
  Type: AWS::ECS::Cluster
  Properties:
    ClusterName: !Sub 'aussie-markets-cluster-${Environment}'
    CapacityProviders:
      - FARGATE
      - FARGATE_SPOT
    DefaultCapacityProviderStrategy:
      - CapacityProvider: FARGATE
        Weight: 1

TaskDefinition:
  Type: AWS::ECS::TaskDefinition
  Properties:
    Family: !Sub 'aussie-markets-api-${Environment}'
    NetworkMode: awsvpc
    RequiresCompatibilities:
      - FARGATE
    Cpu: !If [IsProduction, 1024, 256]
    Memory: !If [IsProduction, 2048, 512]
    ExecutionRoleArn: !GetAtt ECSExecutionRole.Arn
    TaskRoleArn: !GetAtt ECSTaskRole.Arn
    ContainerDefinitions:
      - Name: api
        Image: !Sub '${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/aussie-markets-api:latest'
        PortMappings:
          - ContainerPort: 3000
            Protocol: tcp
        Environment:
          - Name: NODE_ENV
            Value: !Ref Environment
          - Name: PORT
            Value: '3000'
        Secrets:
          - Name: DATABASE_URL
            ValueFrom: !Sub '/aussie-markets/${Environment}/database-url'
          - Name: JWT_SECRET
            ValueFrom: !Sub '/aussie-markets/${Environment}/jwt-secret'
        LogConfiguration:
          LogDriver: awslogs
          Options:
            awslogs-group: !Ref LogGroup
            awslogs-region: !Ref AWS::Region
            awslogs-stream-prefix: api
```

## CI/CD Pipeline

### GitHub Actions Workflows

#### Pull Request Checks

```yaml
# .github/workflows/pr-checks.yml
name: PR Checks

on:
  pull_request:
    branches: [main, develop]

jobs:
  test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm run lint

      - name: Type check
        run: pnpm run typecheck

      - name: Test API
        run: |
          cd apps/api
          DATABASE_URL=postgresql://postgres:postgres@localhost:5432/test_db pnpm run test
        env:
          NODE_ENV: test

  test-mobile:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Test Mobile
        run: |
          cd apps/mobile
          pnpm run test --passWithNoTests

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Audit dependencies
        run: pnpm audit --audit-level moderate

      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          path: ./
          format: spdx-json

      - name: Security scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
```

#### Staging Deployment

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AWS_REGION: ap-southeast-2

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: aussie-markets-api
          IMAGE_TAG: ${{ github.sha }}
        run: |
          cd apps/api
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster aussie-markets-cluster-staging \
            --service aussie-markets-api-staging \
            --force-new-deployment

      - name: Wait for deployment
        run: |
          aws ecs wait services-stable \
            --cluster aussie-markets-cluster-staging \
            --services aussie-markets-api-staging

  build-mobile:
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Expo CLI
        run: npm install -g @expo/cli@latest

      - name: Setup EAS CLI
        run: npm install -g eas-cli@latest

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: |
          cd apps/mobile
          pnpm install --frozen-lockfile

      - name: EAS Build
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        run: |
          cd apps/mobile
          eas build --platform ios --profile development --non-interactive
```

#### Production Deployment

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to deploy'
        required: true

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.release.tag_name || github.event.inputs.version }}

      - name: Run pre-deployment checks
        run: |
          # Health check staging environment
          curl -f https://staging-api.aussie-markets.com/health || exit 1
          
          # Database migration dry run
          cd apps/api
          npm run migration:show

      - name: Deploy to production
        # Similar to staging but with production environment
        # Include blue-green deployment strategy
```

## Environment Configuration

### Development Environment

#### Local Setup

```bash
# Install dependencies
pnpm install

# Setup local database
docker run --name aussie-markets-db \
  -e POSTGRES_DB=aussie_markets_dev \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 -d postgres:15

# Setup Redis
docker run --name aussie-markets-redis \
  -p 6379:6379 -d redis:7-alpine

# Configure environment variables
cp apps/api/env.example apps/api/.env.local
# Edit .env.local with your configuration

# Start development servers
pnpm run dev
```

### Staging Environment

#### AWS Parameter Store Configuration

```bash
# Database configuration
aws ssm put-parameter \
  --name "/aussie-markets/staging/database-url" \
  --value "postgresql://user:password@staging-db.internal:5432/aussie_markets_staging" \
  --type "SecureString"

# JWT secrets
aws ssm put-parameter \
  --name "/aussie-markets/staging/jwt-secret" \
  --value "$(openssl rand -base64 32)" \
  --type "SecureString"

aws ssm put-parameter \
  --name "/aussie-markets/staging/refresh-token-secret" \
  --value "$(openssl rand -base64 32)" \
  --type "SecureString"

# Stripe configuration
aws ssm put-parameter \
  --name "/aussie-markets/staging/stripe-secret-key" \
  --value "sk_test_your_stripe_key_here" \
  --type "SecureString"
```

### Production Environment

#### High Availability Configuration

```yaml
# Multiple AZ deployment
DatabaseInstance:
  Type: AWS::RDS::DBInstance
  Properties:
    MultiAZ: true
    BackupRetentionPeriod: 30
    DeletionProtection: true

ECSService:
  Type: AWS::ECS::Service
  Properties:
    DesiredCount: 3
    LaunchType: FARGATE
    NetworkConfiguration:
      AwsvpcConfiguration:
        Subnets:
          - !Ref PrivateSubnet1
          - !Ref PrivateSubnet2
        SecurityGroups:
          - !Ref ECSSecurityGroup
    LoadBalancers:
      - TargetGroupArn: !Ref TargetGroup
        ContainerName: api
        ContainerPort: 3000
```

## Database Management

### Migration Strategy

#### Development Migrations

```typescript
// migrations/1640995200000-CreateUsers.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1640995200000 implements MigrationInterface {
  name = 'CreateUsers1640995200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "user_role" AS ENUM('user', 'admin');
      
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar UNIQUE NOT NULL,
        "password_hash" varchar NOT NULL,
        "role" "user_role" DEFAULT 'user',
        "email_verified" boolean DEFAULT false,
        "email_verified_at" timestamp,
        "mfa_enabled" boolean DEFAULT false,
        "first_name" varchar(50),
        "last_name" varchar(50),
        "phone_number" varchar(20),
        "is_active" boolean DEFAULT true,
        "last_login_at" timestamp,
        "last_login_ip" varchar(45),
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      );
      
      CREATE INDEX "idx_users_email" ON "users" ("email");
      CREATE INDEX "idx_users_active" ON "users" ("is_active");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
  }
}
```

#### Production Migration Process

```bash
# 1. Backup current database
aws rds create-db-snapshot \
  --db-instance-identifier aussie-markets-db-prod \
  --db-snapshot-identifier pre-migration-$(date +%Y%m%d-%H%M%S)

# 2. Test migration on staging
cd apps/api
NODE_ENV=staging npm run migration:run

# 3. Verify staging functionality
curl -f https://staging-api.aussie-markets.com/health

# 4. Schedule maintenance window for production
# 5. Run production migration during low traffic
NODE_ENV=production npm run migration:run

# 6. Verify production functionality
curl -f https://api.aussie-markets.com/health
```

### Database Monitoring

```typescript
// monitoring/database-health.ts
export class DatabaseHealthMonitor {
  async checkHealth(): Promise<HealthStatus> {
    const checks = await Promise.all([
      this.checkConnectivity(),
      this.checkPerformance(),
      this.checkReplication(),
      this.checkBackups(),
    ]);

    return {
      status: checks.every(c => c.healthy) ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkConnectivity(): Promise<HealthCheck> {
    try {
      const start = Date.now();
      await this.dataSource.query('SELECT 1');
      const duration = Date.now() - start;

      return {
        name: 'connectivity',
        healthy: duration < 1000, // 1 second threshold
        duration,
        message: duration < 1000 ? 'OK' : 'Slow response',
      };
    } catch (error) {
      return {
        name: 'connectivity',
        healthy: false,
        error: error.message,
      };
    }
  }
}
```

## Monitoring & Logging

### CloudWatch Configuration

#### Log Groups

```yaml
ApiLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub '/aws/ecs/aussie-markets-api-${Environment}'
    RetentionInDays: !If [IsProduction, 365, 30]

SecurityLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub '/aussie-markets/${Environment}/security'
    RetentionInDays: 2555  # 7 years for compliance

AuditLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub '/aussie-markets/${Environment}/audit'
    RetentionInDays: 2555  # 7 years for compliance
```

#### Metrics and Alarms

```yaml
HighErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub 'HighErrorRate-${Environment}'
    AlarmDescription: 'High error rate detected'
    MetricName: ErrorRate
    Namespace: AussieMarkets/API
    Statistic: Average
    Period: 300
    EvaluationPeriods: 2
    Threshold: 5  # 5% error rate
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref AlertTopic

DatabaseConnectionsAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub 'DatabaseConnections-${Environment}'
    MetricName: DatabaseConnections
    Namespace: AWS/RDS
    Statistic: Average
    Period: 300
    EvaluationPeriods: 2
    Threshold: 80  # 80% of max connections
    ComparisonOperator: GreaterThanThreshold
```

### Application Monitoring

```typescript
// monitoring/application-monitor.ts
export class ApplicationMonitor {
  private readonly cloudWatch = new CloudWatchClient({ region: 'ap-southeast-2' });

  async recordMetric(metricName: string, value: number, unit: string = 'Count'): Promise<void> {
    await this.cloudWatch.send(new PutMetricDataCommand({
      Namespace: 'AussieMarkets/API',
      MetricData: [{
        MetricName: metricName,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
        Dimensions: [{
          Name: 'Environment',
          Value: process.env.NODE_ENV || 'development',
        }],
      }],
    }));
  }

  async recordAuthEvent(event: AuthEvent): Promise<void> {
    await this.recordMetric('AuthAttempts', 1);
    
    if (!event.success) {
      await this.recordMetric('AuthFailures', 1);
    }

    // Record response time
    await this.recordMetric('AuthResponseTime', event.duration, 'Milliseconds');
  }
}
```

## Backup & Recovery

### Automated Backups

#### Database Backups

```typescript
// backup/database-backup.ts
export class DatabaseBackupService {
  async createBackup(): Promise<BackupResult> {
    const backupId = `manual-backup-${Date.now()}`;
    
    // Create RDS snapshot
    const snapshot = await this.rds.send(new CreateDBSnapshotCommand({
      DBInstanceIdentifier: process.env.DB_INSTANCE_ID,
      DBSnapshotIdentifier: backupId,
    }));

    // Backup to S3
    await this.exportToS3(backupId);

    // Update backup metadata
    await this.recordBackup({
      id: backupId,
      type: 'manual',
      status: 'completed',
      size: snapshot.AllocatedStorage,
      timestamp: new Date(),
    });

    return { success: true, backupId };
  }

  async restoreFromBackup(backupId: string): Promise<void> {
    // Validate backup exists
    const backup = await this.getBackup(backupId);
    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }

    // Create new instance from snapshot
    await this.rds.send(new RestoreDBInstanceFromDBSnapshotCommand({
      DBInstanceIdentifier: `${process.env.DB_INSTANCE_ID}-restore`,
      DBSnapshotIdentifier: backupId,
    }));
  }
}
```

#### Automated Backup Schedule

```yaml
BackupLambda:
  Type: AWS::Lambda::Function
  Properties:
    FunctionName: !Sub 'aussie-markets-backup-${Environment}'
    Runtime: nodejs20.x
    Handler: backup.handler
    Code:
      ZipFile: |
        exports.handler = async (event) => {
          // Automated backup logic
        };

BackupSchedule:
  Type: AWS::Events::Rule
  Properties:
    ScheduleExpression: 'cron(0 2 * * ? *)'  # Daily at 2 AM
    Targets:
      - Arn: !GetAtt BackupLambda.Arn
        Id: BackupTarget
```

### Disaster Recovery

#### Recovery Time Objectives

| Component | RTO | RPO | Recovery Method |
|-----------|-----|-----|-----------------|
| **Database** | 4 hours | 15 minutes | Point-in-time restore |
| **API Service** | 30 minutes | 0 | Container redeployment |
| **Static Assets** | 15 minutes | 1 hour | S3 cross-region replication |
| **Configuration** | 15 minutes | 1 hour | Parameter Store backup |

#### Recovery Procedures

```bash
#!/bin/bash
# disaster-recovery.sh

set -e

ENVIRONMENT=${1:-staging}
BACKUP_DATE=${2:-$(date -d '1 day ago' +%Y-%m-%d)}

echo "Starting disaster recovery for $ENVIRONMENT..."

# 1. Restore database
echo "Restoring database from backup..."
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "aussie-markets-db-$ENVIRONMENT-restore" \
  --db-snapshot-identifier "aussie-markets-db-$ENVIRONMENT-$BACKUP_DATE"

# 2. Update DNS to point to recovery environment
echo "Updating DNS records..."
aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch file://dns-failover.json

# 3. Scale up services
echo "Scaling up ECS services..."
aws ecs update-service \
  --cluster "aussie-markets-cluster-$ENVIRONMENT" \
  --service "aussie-markets-api-$ENVIRONMENT" \
  --desired-count 3

# 4. Verify recovery
echo "Verifying system health..."
for i in {1..30}; do
  if curl -f "https://api.aussie-markets.com/health"; then
    echo "System recovery successful!"
    exit 0
  fi
  sleep 10
done

echo "System recovery failed - manual intervention required"
exit 1
```

## Security Operations

### Security Monitoring

#### Real-time Security Events

```typescript
// security/security-monitor.ts
export class SecurityEventMonitor {
  async processSecurityEvent(event: SecurityEvent): Promise<void> {
    // Log to security log group
    await this.securityLogger.log(event);

    // Check against threat intelligence
    const threatLevel = await this.assessThreat(event);

    if (threatLevel >= ThreatLevel.HIGH) {
      // Immediate response
      await this.triggerImmediateResponse(event);
    }

    // Update security metrics
    await this.updateSecurityMetrics(event);
  }

  private async triggerImmediateResponse(event: SecurityEvent): Promise<void> {
    // Block suspicious IP
    if (event.type === 'BRUTE_FORCE_ATTACK') {
      await this.blockIpAddress(event.sourceIp);
    }

    // Alert security team
    await this.alertSecurityTeam(event);

    // Create incident ticket
    await this.createIncident(event);
  }
}
```

#### Compliance Reporting

```typescript
// compliance/audit-reporter.ts
export class ComplianceReporter {
  async generateAuditReport(period: DateRange): Promise<AuditReport> {
    const [
      authEvents,
      dataAccess,
      systemChanges,
      securityIncidents,
    ] = await Promise.all([
      this.getAuthenticationEvents(period),
      this.getDataAccessLogs(period),
      this.getSystemChanges(period),
      this.getSecurityIncidents(period),
    ]);

    return {
      period,
      summary: {
        totalAuthAttempts: authEvents.length,
        failedAuthAttempts: authEvents.filter(e => !e.success).length,
        dataAccessEvents: dataAccess.length,
        systemChanges: systemChanges.length,
        securityIncidents: securityIncidents.length,
      },
      details: {
        authEvents,
        dataAccess: this.redactPii(dataAccess),
        systemChanges,
        securityIncidents,
      },
      generatedAt: new Date(),
      generatedBy: 'automated-compliance-system',
    };
  }
}
```

## Scaling & Performance

### Auto Scaling Configuration

#### ECS Auto Scaling

```yaml
ECSServiceScalingTarget:
  Type: AWS::ApplicationAutoScaling::ScalableTarget
  Properties:
    MaxCapacity: !If [IsProduction, 10, 3]
    MinCapacity: !If [IsProduction, 3, 1]
    ResourceId: !Sub 'service/${ECSCluster}/${ECSService}'
    RoleARN: !GetAtt ECSServiceScalingRole.Arn
    ScalableDimension: ecs:service:DesiredCount
    ServiceNamespace: ecs

ECSServiceScalingPolicy:
  Type: AWS::ApplicationAutoScaling::ScalingPolicy
  Properties:
    PolicyName: ECSServiceScalingPolicy
    PolicyType: TargetTrackingScaling
    ScalingTargetId: !Ref ECSServiceScalingTarget
    TargetTrackingScalingPolicyConfiguration:
      PredefinedMetricSpecification:
        PredefinedMetricType: ECSServiceAverageCPUUtilization
      TargetValue: 70.0
      ScaleOutCooldown: 300
      ScaleInCooldown: 300
```

#### Database Scaling

```typescript
// scaling/database-scaler.ts
export class DatabaseScaler {
  async scaleIfNeeded(): Promise<void> {
    const metrics = await this.getDbMetrics();
    
    if (metrics.cpuUtilization > 80) {
      await this.scaleUp();
    } else if (metrics.cpuUtilization < 20 && metrics.connectionCount < 10) {
      await this.scaleDown();
    }
  }

  private async scaleUp(): Promise<void> {
    // Add read replica
    await this.rds.send(new CreateDBInstanceReadReplicaCommand({
      DBInstanceIdentifier: `${this.masterInstanceId}-replica-${Date.now()}`,
      SourceDBInstanceIdentifier: this.masterInstanceId,
    }));
  }
}
```

### Performance Optimization

#### Caching Strategy

```typescript
// caching/cache-manager.ts
export class CacheManager {
  private readonly redis = new Redis(process.env.REDIS_URL);

  async get<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async set<T>(key: string, value: T, ttl: number = 300): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Usage in services
export class MarketService {
  async getMarkets(): Promise<Market[]> {
    const cacheKey = 'markets:active';
    
    // Check cache first
    const cached = await this.cache.get<Market[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const markets = await this.marketRepository.find({
      where: { status: 'active' }
    });

    // Cache for 5 minutes
    await this.cache.set(cacheKey, markets, 300);
    
    return markets;
  }
}
```

## Troubleshooting

### Common Issues

#### Database Connection Issues

```bash
# Check database connectivity
aws rds describe-db-instances \
  --db-instance-identifier aussie-markets-db-staging

# Check security groups
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=database-sg"

# Test connection from ECS
aws ecs execute-command \
  --cluster aussie-markets-cluster-staging \
  --task <task-arn> \
  --container api \
  --interactive \
  --command "psql $DATABASE_URL -c 'SELECT 1'"
```

#### Service Deployment Issues

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster aussie-markets-cluster-staging \
  --services aussie-markets-api-staging

# Check task logs
aws logs tail /aws/ecs/aussie-markets-api-staging --follow

# Check task definition
aws ecs describe-task-definition \
  --task-definition aussie-markets-api-staging
```

#### Mobile Build Issues

```bash
# Check EAS build status
eas build:list --platform ios --status errored

# View build logs
eas build:view <build-id>

# Clear cache and retry
eas build --clear-cache --platform ios
```

### Debugging Tools

#### Application Debugging

```typescript
// debugging/debug-tools.ts
export class DebugTools {
  async generateDiagnosticReport(): Promise<DiagnosticReport> {
    const [
      systemHealth,
      databaseHealth,
      cacheHealth,
      externalServices,
    ] = await Promise.all([
      this.checkSystemHealth(),
      this.checkDatabaseHealth(),
      this.checkCacheHealth(),
      this.checkExternalServices(),
    ]);

    return {
      timestamp: new Date(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version,
      systemHealth,
      databaseHealth,
      cacheHealth,
      externalServices,
    };
  }

  async performHealthCheck(): Promise<HealthStatus> {
    try {
      // Test database
      await this.dataSource.query('SELECT 1');
      
      // Test cache
      await this.redis.ping();
      
      // Test external APIs
      await this.testStripeConnection();
      
      return { status: 'healthy', timestamp: new Date() };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message,
        timestamp: new Date() 
      };
    }
  }
}
```

### Support Procedures

#### Log Analysis

```bash
# Search for errors in the last hour
aws logs filter-log-events \
  --log-group-name /aws/ecs/aussie-markets-api-staging \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern 'ERROR'

# Search for specific user's activity
aws logs filter-log-events \
  --log-group-name /aussie-markets/staging/audit \
  --filter-pattern '{ $.userId = "user-id-here" }'

# Search for security events
aws logs filter-log-events \
  --log-group-name /aussie-markets/staging/security \
  --start-time $(date -d '24 hours ago' +%s)000 \
  --filter-pattern 'SECURITY_INCIDENT'
```

#### Emergency Procedures

```bash
#!/bin/bash
# emergency-response.sh

case "$1" in
  "scale-down")
    # Emergency scale down
    aws ecs update-service \
      --cluster aussie-markets-cluster-production \
      --service aussie-markets-api-production \
      --desired-count 1
    ;;
  
  "block-ip")
    # Block malicious IP
    aws wafv2 update-ip-set \
      --scope CLOUDFRONT \
      --id $WAF_IP_SET_ID \
      --addresses "$2/32"
    ;;
  
  "enable-maintenance")
    # Enable maintenance mode
    aws ssm put-parameter \
      --name "/aussie-markets/production/maintenance-mode" \
      --value "true" \
      --overwrite
    ;;
esac
```

---

This deployment documentation provides comprehensive guidance for deploying and operating Aussie Markets. For development information, see the [API Documentation](../api/README.md) and [Mobile Documentation](../mobile/README.md).
