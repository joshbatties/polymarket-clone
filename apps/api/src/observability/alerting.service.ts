import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
// TelemetryService removed for simplification
import { StructuredLoggingService } from '../logging/logging.service';

export interface Alert {
  id: string;
  name: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  description: string;
  timestamp: Date;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  status: 'firing' | 'resolved';
  source: string;
  metric?: {
    name: string;
    value: number;
    threshold: number;
  };
}

export interface AlertRule {
  name: string;
  condition: () => Promise<boolean>;
  severity: Alert['severity'];
  message: string;
  description: string;
  cooldownMinutes: number;
  enabled: boolean;
}

export interface NotificationChannel {
  name: string;
  type: 'email' | 'slack' | 'pagerduty' | 'webhook';
  config: Record<string, any>;
  enabled: boolean;
}

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);
  private activeAlerts: Map<string, Alert> = new Map();
  private lastAlertTimes: Map<string, Date> = new Map();
  private alertRules: AlertRule[] = [];
  private notificationChannels: NotificationChannel[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    // TelemetryService removed for simplification
    private readonly loggingService: StructuredLoggingService,
  ) {
    this.setupAlertRules();
    this.setupNotificationChannels();
  }

  /**
   * Setup alert rules for business and technical metrics
   */
  private setupAlertRules(): void {
    this.alertRules = [
      {
        name: 'high_error_rate',
        condition: () => this.checkErrorRate(),
        severity: 'critical',
        message: 'High API error rate detected',
        description: 'API error rate exceeds 5% over the last 5 minutes',
        cooldownMinutes: 10,
        enabled: true,
      },
      {
        name: 'webhook_failures',
        condition: () => this.checkWebhookFailures(),
        severity: 'critical',
        message: 'Webhook processing failures',
        description: 'Multiple webhook failures detected - payments may be affected',
        cooldownMinutes: 5,
        enabled: true,
      },
      {
        name: 'ledger_drift',
        condition: () => this.checkLedgerDrift(),
        severity: 'critical',
        message: 'Ledger balance drift detected',
        description: 'Financial ledger shows balance inconsistency',
        cooldownMinutes: 1,
        enabled: true,
      },
      {
        name: 'slow_response_times',
        condition: () => this.checkResponseTimes(),
        severity: 'warning',
        message: 'Slow API response times',
        description: 'API response times exceed 300ms threshold',
        cooldownMinutes: 15,
        enabled: true,
      },
      {
        name: 'database_connection_issues',
        condition: () => this.checkDatabaseHealth(),
        severity: 'critical',
        message: 'Database connectivity issues',
        description: 'Unable to connect to database or queries are timing out',
        cooldownMinutes: 5,
        enabled: true,
      },
      {
        name: 'high_authentication_failures',
        condition: () => this.checkAuthFailures(),
        severity: 'warning',
        message: 'High authentication failure rate',
        description: 'Possible credential stuffing or brute force attack',
        cooldownMinutes: 20,
        enabled: true,
      },
      {
        name: 'pending_withdrawals_backlog',
        condition: () => this.checkWithdrawalBacklog(),
        severity: 'warning',
        message: 'Withdrawal processing backlog',
        description: 'High number of pending withdrawals requiring attention',
        cooldownMinutes: 60,
        enabled: true,
      },
      {
        name: 'aml_events_spike',
        condition: () => this.checkAMLEvents(),
        severity: 'warning',
        message: 'AML events spike detected',
        description: 'Unusual increase in AML monitoring events',
        cooldownMinutes: 30,
        enabled: true,
      },
      {
        name: 'memory_usage_high',
        condition: () => this.checkMemoryUsage(),
        severity: 'warning',
        message: 'High memory usage',
        description: 'Application memory usage is approaching limits',
        cooldownMinutes: 30,
        enabled: true,
      },
      {
        name: 'external_service_degradation',
        condition: () => this.checkExternalServices(),
        severity: 'error',
        message: 'External service degradation',
        description: 'Stripe or other critical services showing degraded performance',
        cooldownMinutes: 15,
        enabled: true,
      },
    ];

    this.logger.log(`Initialized ${this.alertRules.length} alert rules`);
  }

  /**
   * Setup notification channels
   */
  private setupNotificationChannels(): void {
    this.notificationChannels = [
      {
        name: 'pagerduty',
        type: 'pagerduty',
        config: {
          routingKey: this.configService.get('PAGERDUTY_ROUTING_KEY'),
        },
        enabled: !!this.configService.get('PAGERDUTY_ROUTING_KEY'),
      },
      {
        name: 'slack',
        type: 'slack',
        config: {
          webhookUrl: this.configService.get('SLACK_WEBHOOK_URL'),
          channel: '#aussie-markets-alerts',
        },
        enabled: !!this.configService.get('SLACK_WEBHOOK_URL'),
      },
      {
        name: 'email',
        type: 'email',
        config: {
          to: this.configService.get('ALERT_EMAIL_TO', '').split(','),
          from: this.configService.get('ALERT_EMAIL_FROM'),
        },
        enabled: !!this.configService.get('ALERT_EMAIL_TO'),
      },
    ];

    const enabledChannels = this.notificationChannels.filter(c => c.enabled);
    this.logger.log(`Initialized ${enabledChannels.length} notification channels`);
  }

  /**
   * Check all alert rules periodically
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAlertRules(): Promise<void> {
    try {
      for (const rule of this.alertRules) {
        if (!rule.enabled) continue;

        // Check cooldown
        const lastAlert = this.lastAlertTimes.get(rule.name);
        if (lastAlert) {
          const cooldownMs = rule.cooldownMinutes * 60 * 1000;
          if (Date.now() - lastAlert.getTime() < cooldownMs) {
            continue;
          }
        }

        try {
          const shouldAlert = await rule.condition();
          
          if (shouldAlert) {
            await this.fireAlert(rule);
          } else {
            await this.resolveAlert(rule.name);
          }
        } catch (error) {
          this.logger.error(`Error checking alert rule ${rule.name}:`, error);
        }
      }
    } catch (error) {
      this.logger.error('Error in alert rule checking:', error);
    }
  }

  /**
   * Fire an alert
   */
  private async fireAlert(rule: AlertRule): Promise<void> {
    const alertId = `${rule.name}_${Date.now()}`;
    
    const alert: Alert = {
      id: alertId,
      name: rule.name,
      severity: rule.severity,
      message: rule.message,
      description: rule.description,
      timestamp: new Date(),
      labels: {
        alertname: rule.name,
        severity: rule.severity,
        service: 'aussie-markets-api',
      },
      annotations: {
        description: rule.description,
        runbook_url: `https://runbooks.aussiemarkets.com.au/${rule.name}`,
      },
      status: 'firing',
      source: 'internal_monitoring',
    };

    this.activeAlerts.set(rule.name, alert);
    this.lastAlertTimes.set(rule.name, new Date());

    // Send notifications
    await this.sendNotifications(alert);

    // Log the alert
    this.loggingService.logSecurityEvent({
      event: 'alert_fired',
      outcome: 'success',
      metadata: {
        alertName: rule.name,
        severity: rule.severity,
        message: rule.message,
      },
    });

    this.logger.warn(`Alert fired: ${rule.name} - ${rule.message}`);
  }

  /**
   * Resolve an alert
   */
  private async resolveAlert(ruleName: string): Promise<void> {
    const alert = this.activeAlerts.get(ruleName);
    if (!alert) return;

    alert.status = 'resolved';
    alert.timestamp = new Date();

    // Send resolution notification
    await this.sendNotifications(alert);

    this.activeAlerts.delete(ruleName);
    
    this.logger.log(`Alert resolved: ${ruleName}`);
  }

  /**
   * Send notifications to configured channels
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    const promises = this.notificationChannels
      .filter(channel => channel.enabled)
      .map(channel => this.sendNotification(channel, alert));

    await Promise.allSettled(promises);
  }

  /**
   * Send notification to a specific channel
   */
  private async sendNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    try {
      switch (channel.type) {
        case 'slack':
          await this.sendSlackNotification(channel, alert);
          break;
        case 'pagerduty':
          await this.sendPagerDutyNotification(channel, alert);
          break;
        case 'email':
          await this.sendEmailNotification(channel, alert);
          break;
        case 'webhook':
          await this.sendWebhookNotification(channel, alert);
          break;
        default:
          this.logger.warn(`Unknown notification channel type: ${channel.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send notification via ${channel.name}:`, error);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    const color = this.getSeverityColor(alert.severity);
    const status = alert.status === 'firing' ? '🚨 FIRING' : '✅ RESOLVED';
    
    const payload = {
      channel: channel.config.channel,
      username: 'Aussie Markets Monitoring',
      icon_emoji: ':warning:',
      attachments: [
        {
          color,
          title: `${status} ${alert.message}`,
          text: alert.description,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Time',
              value: alert.timestamp.toISOString(),
              short: true,
            },
          ],
          footer: 'Aussie Markets Monitoring',
          ts: Math.floor(alert.timestamp.getTime() / 1000),
        },
      ],
    };

    // Would send to Slack webhook
    this.logger.log(`Would send Slack notification for alert: ${alert.name}`);
  }

  /**
   * Send PagerDuty notification
   */
  private async sendPagerDutyNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    const eventAction = alert.status === 'firing' ? 'trigger' : 'resolve';
    
    const payload = {
      routing_key: channel.config.routingKey,
      event_action: eventAction,
      dedup_key: alert.name,
      payload: {
        summary: alert.message,
        source: 'aussie-markets-api',
        severity: alert.severity,
        timestamp: alert.timestamp.toISOString(),
        custom_details: {
          description: alert.description,
          labels: alert.labels,
          annotations: alert.annotations,
        },
      },
    };

    // Would send to PagerDuty Events API
    this.logger.log(`Would send PagerDuty notification for alert: ${alert.name}`);
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    const subject = `Aussie Markets Alert: ${alert.message}`;
    const body = `
      Alert: ${alert.name}
      Status: ${alert.status.toUpperCase()}
      Severity: ${alert.severity.toUpperCase()}
      Time: ${alert.timestamp.toISOString()}
      
      Description: ${alert.description}
      
      This is an automated alert from Aussie Markets monitoring system.
    `;

    // Would send email via configured service
    this.logger.log(`Would send email notification for alert: ${alert.name}`);
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    const payload = {
      alert,
      webhook_url: channel.config.url,
    };

    // Would send HTTP POST to webhook URL
    this.logger.log(`Would send webhook notification for alert: ${alert.name}`);
  }

  /**
   * Get color for Slack based on severity
   */
  private getSeverityColor(severity: Alert['severity']): string {
    switch (severity) {
      case 'critical': return 'danger';
      case 'error': return 'warning';
      case 'warning': return 'warning';
      case 'info': return 'good';
      default: return '#808080';
    }
  }

  // Alert condition checkers

  private async checkErrorRate(): Promise<boolean> {
    // This would query metrics to check error rate
    // For now, return false (no alert)
    return false;
  }

  private async checkWebhookFailures(): Promise<boolean> {
    try {
      // Check recent webhook failures in the last 5 minutes
      const recentFailures = await this.prismaService.idempotencyKey.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000),
          },
          // This would need additional tracking of webhook failures
        },
      });

      return recentFailures > 5; // Alert if more than 5 failures in 5 minutes
    } catch (error) {
      this.logger.error('Error checking webhook failures:', error);
      return false;
    }
  }

  private async checkLedgerDrift(): Promise<boolean> {
    try {
      // Check for ledger balance inconsistencies
      const ledgerSum = await this.prismaService.ledgerEntry.aggregate({
        _sum: { amountCents: true },
      });

      const totalSum = Number(ledgerSum._sum.amountCents || 0);
      const driftThreshold = 100; // $1.00 in cents

      return Math.abs(totalSum) > driftThreshold;
    } catch (error) {
      this.logger.error('Error checking ledger drift:', error);
      return false;
    }
  }

  private async checkResponseTimes(): Promise<boolean> {
    // This would check metrics for response time percentiles
    return false;
  }

  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return false; // No alert if query succeeds
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return true; // Alert if database query fails
    }
  }

  private async checkAuthFailures(): Promise<boolean> {
    // This would check authentication failure rates
    return false;
  }

  private async checkWithdrawalBacklog(): Promise<boolean> {
    try {
      const pendingWithdrawals = await this.prismaService.withdrawal.count({
        where: {
          status: 'PENDING_REVIEW',
        },
      });

      return pendingWithdrawals > 50;
    } catch (error) {
      this.logger.error('Error checking withdrawal backlog:', error);
      return false;
    }
  }

  private async checkAMLEvents(): Promise<boolean> {
    try {
      const recentAmlEvents = await this.prismaService.amlEvent.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
          },
        },
      });

      return recentAmlEvents > 10; // Alert if more than 10 AML events in 30 minutes
    } catch (error) {
      this.logger.error('Error checking AML events:', error);
      return false;
    }
  }

  private async checkMemoryUsage(): Promise<boolean> {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    
    return heapUsedMB > 1024; // Alert if using more than 1GB
  }

  private async checkExternalServices(): Promise<boolean> {
    // This would check external service health
    return false;
  }

  /**
   * Get current active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert statistics
   */
  getAlertStats(): {
    totalRules: number;
    enabledRules: number;
    activeAlerts: number;
    notificationChannels: number;
  } {
    return {
      totalRules: this.alertRules.length,
      enabledRules: this.alertRules.filter(r => r.enabled).length,
      activeAlerts: this.activeAlerts.size,
      notificationChannels: this.notificationChannels.filter(c => c.enabled).length,
    };
  }

  /**
   * Manually fire a test alert
   */
  async fireTestAlert(): Promise<void> {
    const testAlert: Alert = {
      id: `test_${Date.now()}`,
      name: 'test_alert',
      severity: 'info',
      message: 'Test alert - monitoring system check',
      description: 'This is a test alert to verify monitoring and notification systems',
      timestamp: new Date(),
      labels: { alertname: 'test_alert', severity: 'info' },
      annotations: { description: 'Test alert' },
      status: 'firing',
      source: 'manual_test',
    };

    await this.sendNotifications(testAlert);
    this.logger.log('Test alert sent');
  }
}
