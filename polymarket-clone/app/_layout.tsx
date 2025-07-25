import { Stack, Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import NotificationCenter from '../components/NotificationCenter';
import { AuthService, AuthState } from '../services/authService';
import { NotificationService } from '../services/notificationService';
import { mockNotifications } from '../data/mockData';

export default function RootLayout() {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState(mockNotifications);
  const [authState, setAuthState] = useState<AuthState>(AuthService.getAuthState());

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribeAuth = AuthService.subscribe((newAuthState) => {
      setAuthState(newAuthState);
    });

    // Subscribe to notification updates
    const unsubscribeNotifications = NotificationService.subscribe((newNotification) => {
      setNotifications(prev => {
        const updated = [newNotification, ...prev];
        return updated.slice(0, 50); // Keep only last 50
      });
    });

    // Initialize notifications
    const currentNotifications = NotificationService.getNotifications();
    setNotifications(currentNotifications);

    return () => {
      unsubscribeAuth();
      unsubscribeNotifications();
    };
  }, []);

  const handleNotificationPress = (notification: any) => {
    // Mark as read and navigate if needed
    NotificationService.markAsRead(notification.id);
    setNotifications(prev => 
      prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
    );
    setShowNotifications(false);
  };

  const handleMarkAllRead = () => {
    NotificationService.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const NotificationButton = () => (
    <TouchableOpacity
      onPress={() => setShowNotifications(true)}
      style={styles.notificationButton}
    >
      <Ionicons name="notifications" size={24} color="#000000" />
      {unreadCount > 0 && (
        <View style={styles.notificationBadge}>
          <Text style={styles.badgeText}>{unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const CreateTabIcon = ({ focused }: { focused: boolean }) => (
    <View style={[styles.createButton, focused && styles.createButtonActive]}>
      <Ionicons 
        name="add" 
        size={28} 
        color={focused ? "#FFFFFF" : "#007AFF"} 
      />
    </View>
  );

  // Note: Removed authentication guard to allow browsing without login
  // Users can browse markets, but will be prompted to login for trading actions

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: '#007AFF',
            tabBarInactiveTintColor: '#8E8E93',
            tabBarStyle: {
              backgroundColor: '#FFFFFF',
              borderTopWidth: 0,
              borderTopColor: '#E5E5EA',
              paddingBottom: 18,
              paddingTop: 8,
              height: 80,
            },
            headerStyle: {
              backgroundColor: '',
              borderBottomWidth: 1,
              borderBottomColor: '#E5E5EA',
            },
            headerShown: false,
            headerTitleStyle: {
              fontSize: 18,
              fontWeight: '600',
              color: '#000000',
            },
            headerRight: () => <NotificationButton />,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Markets',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="trending-up" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="portfolio"
            options={{
              title: 'Portfolio',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="wallet" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="create"
            options={{
              title: 'Create',
              tabBarIcon: ({ focused }) => <CreateTabIcon focused={focused} />,
              tabBarLabel: () => null,
            }}
          />
          <Tabs.Screen
            name="activity"
            options={{
              title: 'Activity',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="list" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: authState.isAuthenticated ? 'Profile' : 'Login',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name={authState.isAuthenticated ? "person" : "log-in"} size={size} color={color} />
              ),
            }}
          />
          {/* Hidden screens for navigation */}
          <Tabs.Screen
            name="auth"
            options={{
              href: null, // Hide from tab bar
            }}
          />
          <Tabs.Screen
            name="[id]"
            options={{
              href: null, // Hide from tab bar
            }}
          />
        </Tabs>

        <NotificationCenter
          visible={showNotifications}
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onNotificationPress={handleNotificationPress}
          onMarkAllRead={handleMarkAllRead}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
  },
  notificationButton: {
    marginRight: 16,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  createButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8F4FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
    marginTop: -20,
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  createButtonActive: {
    backgroundColor: '#007AFF',
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
}); 