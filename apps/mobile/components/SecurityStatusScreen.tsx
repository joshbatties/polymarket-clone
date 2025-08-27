import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useSecurity } from '../hooks/useSecurity';
import { SecurityStatus, SecurityEvent } from '../services/security/SecurityManager';

interface SecurityStatusScreenProps {
  onNavigateBack?: () => void;
}

const SecurityStatusScreen: React.FC<SecurityStatusScreenProps> = ({ onNavigateBack }) => {
  const {
    securityStatus,
    isSecurityInitialized,
    isLoading,
    securityEvents,
    performSecurityCheck,
    error,
  } = useSecurity({
    autoInitialize: true,
    showAlerts: false, // We'll handle alerts in this component
    blockOnSecurity: false, // Don't block in settings screen
  });

  useEffect(() => {
    // Set current screen for protection
    // This would typically be done in a navigation hook
    console.log('[SecurityStatusScreen] Mounted');
  }, []);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'secure':
        return '#4CAF50';
      case 'warning':
        return '#FF9800';
      case 'compromised':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'secure':
        return '🔒';
      case 'warning':
        return '⚠️';
      case 'compromised':
        return '🔓';
      default:
        return '❓';
    }
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleString();
  };

  const showEventDetails = (event: SecurityEvent) => {
    const details = [
      `Type: ${event.type}`,
      `Severity: ${event.severity}`,
      `Time: ${formatDate(event.timestamp)}`,
      `Description: ${event.description}`,
      event.metadata ? `Details: ${JSON.stringify(event.metadata, null, 2)}` : '',
    ].filter(Boolean).join('\n');

    Alert.alert('Security Event Details', details, [{ text: 'OK' }]);
  };

  const renderSecurityStatus = () => {
    if (!securityStatus) {
      return (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Security Status</Text>
          <Text style={styles.statusText}>Not available</Text>
        </View>
      );
    }

    return (
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Security Status</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusIcon}>
            {getStatusIcon(securityStatus.overall)}
          </Text>
          <Text
            style={[
              styles.statusText,
              { color: getStatusColor(securityStatus.overall) },
            ]}
          >
            {securityStatus.overall.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.lastCheck}>
          Last Check: {formatDate(securityStatus.lastCheck)}
        </Text>
      </View>
    );
  };

  const renderDetailedStatus = () => {
    if (!securityStatus) return null;

    return (
      <View style={styles.detailsCard}>
        <Text style={styles.cardTitle}>Security Details</Text>
        
        {/* TLS Pinning Status */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>TLS Pinning:</Text>
          <Text
            style={[
              styles.detailValue,
              { color: getStatusColor(securityStatus.tlsPinning.status) },
            ]}
          >
            {securityStatus.tlsPinning.enabled ? 'Enabled' : 'Disabled'} (
            {securityStatus.tlsPinning.status})
          </Text>
        </View>

        {/* Device Integrity */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Device Integrity:</Text>
          <Text
            style={[
              styles.detailValue,
              { color: getStatusColor(securityStatus.deviceIntegrity.status) },
            ]}
          >
            {securityStatus.deviceIntegrity.status}
          </Text>
        </View>

        {/* Root/Jailbreak Detection */}
        {securityStatus.deviceIntegrity.rootDetection && (
          <>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Root Detection:</Text>
              <Text
                style={[
                  styles.detailValue,
                  {
                    color: securityStatus.deviceIntegrity.rootDetection.isRooted
                      ? '#F44336'
                      : '#4CAF50',
                  },
                ]}
              >
                {securityStatus.deviceIntegrity.rootDetection.isRooted
                  ? 'Detected'
                  : 'Not Detected'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Jailbreak Detection:</Text>
              <Text
                style={[
                  styles.detailValue,
                  {
                    color: securityStatus.deviceIntegrity.rootDetection.isJailbroken
                      ? '#F44336'
                      : '#4CAF50',
                  },
                ]}
              >
                {securityStatus.deviceIntegrity.rootDetection.isJailbroken
                  ? 'Detected'
                  : 'Not Detected'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Risk Level:</Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: getStatusColor(securityStatus.deviceIntegrity.rootDetection.riskLevel) },
                ]}
              >
                {securityStatus.deviceIntegrity.rootDetection.riskLevel.toUpperCase()}
              </Text>
            </View>
          </>
        )}

        {/* Screen Protection */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Screen Protection:</Text>
          <Text
            style={[
              styles.detailValue,
              { color: securityStatus.screenProtection.enabled ? '#4CAF50' : '#FF9800' },
            ]}
          >
            {securityStatus.screenProtection.enabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>
    );
  };

  const renderRecommendations = () => {
    if (!securityStatus?.recommendations.length) return null;

    return (
      <View style={styles.recommendationsCard}>
        <Text style={styles.cardTitle}>Security Recommendations</Text>
        {securityStatus.recommendations.map((recommendation, index) => (
          <View key={index} style={styles.recommendationItem}>
            <Text style={styles.recommendationBullet}>•</Text>
            <Text style={styles.recommendationText}>{recommendation}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderSecurityEvents = () => {
    if (!securityEvents.length) return null;

    const recentEvents = securityEvents.slice(-10); // Show last 10 events

    return (
      <View style={styles.eventsCard}>
        <Text style={styles.cardTitle}>Recent Security Events</Text>
        {recentEvents.map((event, index) => (
          <TouchableOpacity
            key={index}
            style={styles.eventItem}
            onPress={() => showEventDetails(event)}
          >
            <View style={styles.eventHeader}>
              <Text style={styles.eventType}>{event.type}</Text>
              <Text
                style={[
                  styles.eventSeverity,
                  { color: getStatusColor(event.severity) },
                ]}
              >
                {event.severity}
              </Text>
            </View>
            <Text style={styles.eventDescription}>{event.description}</Text>
            <Text style={styles.eventTime}>{formatDate(event.timestamp)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Security Status</Text>
        {onNavigateBack && (
          <TouchableOpacity onPress={onNavigateBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={performSecurityCheck}
            colors={['#007AFF']}
          />
        }
      >
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>Error: {error}</Text>
          </View>
        )}

        {!isSecurityInitialized && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              Security services are not initialized
            </Text>
          </View>
        )}

        {renderSecurityStatus()}
        {renderDetailedStatus()}
        {renderRecommendations()}
        {renderSecurityEvents()}

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={performSecurityCheck}
          disabled={isLoading}
        >
          <Text style={styles.refreshButtonText}>
            {isLoading ? 'Checking...' : 'Refresh Security Check'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  statusText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  lastCheck: {
    fontSize: 12,
    color: '#666',
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  recommendationsCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  recommendationBullet: {
    fontSize: 16,
    color: '#666',
    marginRight: 8,
  },
  recommendationText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  eventsCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    marginBottom: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventType: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  eventSeverity: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  eventDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 10,
    color: '#999',
  },
  errorCard: {
    backgroundColor: '#ffebee',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
  },
  warningCard: {
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  warningText: {
    color: '#e65100',
    fontSize: 14,
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SecurityStatusScreen;
