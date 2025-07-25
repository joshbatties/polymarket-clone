import { Notification } from '../types/market';

interface NotificationCallback {
  (notification: Notification): void;
}

interface PriceAlert {
  id: string;
  marketId: string;
  targetPrice: number;
  side: 'YES' | 'NO';
  condition: 'above' | 'below';
  userId: string;
}

// Mock storage for notifications and alerts
let notifications: Notification[] = [];
let priceAlerts: PriceAlert[] = [];
let subscribers: NotificationCallback[] = [];

export class NotificationService {
  static subscribe(callback: NotificationCallback): () => void {
    subscribers.push(callback);
    
    // Return unsubscribe function
    return () => {
      subscribers = subscribers.filter(sub => sub !== callback);
    };
  }

  static addNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Notification {
    const newNotification: Notification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
    };

    notifications.unshift(newNotification);
    
    // Notify all subscribers
    subscribers.forEach(callback => callback(newNotification));
    
    // Keep only last 50 notifications
    if (notifications.length > 50) {
      notifications = notifications.slice(0, 50);
    }

    return newNotification;
  }

  static getNotifications(): Notification[] {
    return [...notifications];
  }

  static markAsRead(notificationId: string): void {
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
    }
  }

  static markAllAsRead(): void {
    notifications.forEach(n => n.read = true);
  }

  static deleteNotification(notificationId: string): void {
    notifications = notifications.filter(n => n.id !== notificationId);
  }

  static clearAllNotifications(): void {
    notifications = [];
  }

  // Trade-related notifications
  static notifyTradeExecuted(
    marketQuestion: string,
    side: 'YES' | 'NO',
    action: 'BUY' | 'SELL',
    shares: number,
    price: number,
    marketId?: string
  ): void {
    const message = `Your ${action.toLowerCase()} order for ${shares} ${side} shares at ${(price * 100).toFixed(0)}¢ has been executed`;
    
    this.addNotification({
      type: 'trade_executed',
      title: 'Trade Executed',
      message,
      marketId,
    });
  }

  static notifyOrderPlaced(
    marketQuestion: string,
    side: 'YES' | 'NO',
    action: 'BUY' | 'SELL',
    shares: number,
    price: number,
    marketId?: string
  ): void {
    const message = `Your limit ${action.toLowerCase()} order for ${shares} ${side} shares at ${(price * 100).toFixed(0)}¢ has been placed`;
    
    this.addNotification({
      type: 'trade_executed',
      title: 'Order Placed',
      message,
      marketId,
    });
  }

  static notifyMarketResolved(
    marketQuestion: string,
    outcome: 'YES' | 'NO',
    winnings?: number,
    marketId?: string
  ): void {
    const message = winnings 
      ? `Market resolved: ${outcome} won. You earned $${winnings.toFixed(2)}`
      : `Market resolved: ${outcome} won`;
    
    this.addNotification({
      type: 'market_resolved',
      title: 'Market Resolved',
      message,
      marketId,
    });
  }

  static notifyMarketEnding(
    marketQuestion: string,
    hoursLeft: number,
    marketId?: string
  ): void {
    const timeText = hoursLeft < 24 
      ? `${Math.round(hoursLeft)} hours`
      : `${Math.round(hoursLeft / 24)} days`;
    
    this.addNotification({
      type: 'market_ending',
      title: 'Market Ending Soon',
      message: `"${marketQuestion}" ends in ${timeText}`,
      marketId,
    });
  }

  static notifyPriceAlert(
    marketQuestion: string,
    side: 'YES' | 'NO',
    currentPrice: number,
    targetPrice: number,
    condition: 'above' | 'below',
    marketId?: string
  ): void {
    const message = `${side} price is now ${condition} ${(targetPrice * 100).toFixed(0)}¢ (current: ${(currentPrice * 100).toFixed(0)}¢)`;
    
    this.addNotification({
      type: 'price_alert',
      title: 'Price Alert',
      message,
      marketId,
    });
  }

  // Price Alert Management
  static addPriceAlert(
    marketId: string,
    targetPrice: number,
    side: 'YES' | 'NO',
    condition: 'above' | 'below',
    userId: string = 'default'
  ): string {
    const alert: PriceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      marketId,
      targetPrice,
      side,
      condition,
      userId,
    };

    priceAlerts.push(alert);
    return alert.id;
  }

  static removePriceAlert(alertId: string): void {
    priceAlerts = priceAlerts.filter(alert => alert.id !== alertId);
  }

  static getPriceAlerts(userId: string = 'default'): PriceAlert[] {
    return priceAlerts.filter(alert => alert.userId === userId);
  }

  static checkPriceAlerts(marketId: string, yesPrice: number, noPrice: number): void {
    const marketAlerts = priceAlerts.filter(alert => alert.marketId === marketId);
    
    marketAlerts.forEach(alert => {
      const currentPrice = alert.side === 'YES' ? yesPrice : noPrice;
      
      const shouldTrigger = 
        (alert.condition === 'above' && currentPrice >= alert.targetPrice) ||
        (alert.condition === 'below' && currentPrice <= alert.targetPrice);

      if (shouldTrigger) {
        // Remove the alert first to prevent duplicate notifications
        this.removePriceAlert(alert.id);
        
        // Send notification
        this.notifyPriceAlert(
          `Market ${marketId}`, // In real app, would fetch market question
          alert.side,
          currentPrice,
          alert.targetPrice,
          alert.condition,
          marketId
        );
      }
    });
  }

  // General notifications
  static notifyGeneral(title: string, message: string): void {
    this.addNotification({
      type: 'general',
      title,
      message,
    });
  }

  static notifyDeposit(amount: number): void {
    this.addNotification({
      type: 'general',
      title: 'Deposit Successful',
      message: `$${amount.toFixed(2)} has been added to your account`,
    });
  }

  static notifyWithdrawal(amount: number): void {
    this.addNotification({
      type: 'general',
      title: 'Withdrawal Processed',
      message: `$${amount.toFixed(2)} has been withdrawn from your account`,
    });
  }

  static notifyMarketCreated(marketQuestion: string, marketId: string): void {
    this.addNotification({
      type: 'general',
      title: 'Market Created',
      message: `Your market "${marketQuestion}" is now live for trading`,
      marketId,
    });
  }

  // Batch operations
  static getUnreadCount(): number {
    return notifications.filter(n => !n.read).length;
  }

  static getRecentNotifications(limit: number = 10): Notification[] {
    return notifications.slice(0, limit);
  }

  static getNotificationsByType(type: Notification['type']): Notification[] {
    return notifications.filter(n => n.type === type);
  }

  // Initialize with some demo notifications
  static initializeDemoNotifications(): void {
    // Clear existing notifications
    notifications = [];
    
    // Add some demo notifications
    this.addNotification({
      type: 'trade_executed',
      title: 'Trade Executed',
      message: 'Your buy order for 100 YES shares at 52¢ has been filled',
      marketId: '1',
    });

    this.addNotification({
      type: 'price_alert',
      title: 'Price Alert',
      message: 'Bitcoin $150K market YES price is now above 35¢',
      marketId: '1',
    });

    this.addNotification({
      type: 'market_ending',
      title: 'Market Ending Soon',
      message: 'Trump 2024 Election market ends in 2 days',
      marketId: '7',
    });

    this.addNotification({
      type: 'general',
      title: 'Welcome!',
      message: 'Welcome to PolyMarket Clone! Start trading on prediction markets.',
    });
  }

  // Real-time price monitoring (simplified)
  static startPriceMonitoring(): void {
    // In a real app, this would connect to a WebSocket or polling service
    // For demo, we'll simulate price changes and check alerts periodically
    setInterval(() => {
      // Simulate random price movements and check alerts
      const marketIds = ['1', '2', '7', '8']; // Sample market IDs
      
      marketIds.forEach(marketId => {
        // Generate random price movements
        const yesPrice = 0.3 + Math.random() * 0.4; // Random between 0.3 and 0.7
        const noPrice = 1 - yesPrice;
        
        // Check if any alerts should trigger
        this.checkPriceAlerts(marketId, yesPrice, noPrice);
      });
    }, 30000); // Check every 30 seconds
  }

  static stopPriceMonitoring(): void {
    // In a real app, would disconnect from WebSocket or stop polling
  }
}

// Auto-initialize demo notifications when service is loaded
NotificationService.initializeDemoNotifications(); 