import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  useTheme,
  ActivityIndicator,
  Chip,
  Button as PaperButton,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import StandupService from '../../services/standup.service';

const AdminTodayStandupScreen = ({ navigation }) => {
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayStandup, setTodayStandup] = useState(null);
  const [error, setError] = useState(null);

  const fetchTodayStandup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await StandupService.getOrCreateTodayStandup();
      console.log('📅 Today standup:', result);

      const data = result.data || result;
      setTodayStandup(data);
    } catch (error) {
      console.error('❌ Error fetching today standup:', error);
      setError(error.message || 'Failed to load today\'s standup');
      Alert.alert('Error', error.message || 'Failed to load today\'s standup');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayStandup();
  }, [fetchTodayStandup]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTodayStandup();
    setRefreshing(false);
  }, [fetchTodayStandup]);

  const getStatusColor = (docstatus, isSubmitted) => {
    return docstatus === 0 && !isSubmitted ? '#F59E0B' : '#10B981';
  };

  const getStatusLabel = (docstatus, isSubmitted) => {
    return docstatus === 0 && !isSubmitted ? 'Draft' : 'Submitted';
  };

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="Today's Standup"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <Icon name="exclamation-circle" size={48} color="#EF4444" />
          <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#1F2937', textAlign: 'center' }}>
            Unable to load standup
          </Text>
          <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
            {error}
          </Text>
        </View>
      </View>
    );
  }

  if (loading && !todayStandup) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="Today's Standup"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading today's standup...</Text>
        </View>
      </View>
    );
  }

  if (!todayStandup) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="Today's Standup"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Icon name="inbox" size={48} color="#D1D5DB" />
          <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#1F2937' }}>
            No standup data
          </Text>
        </View>
      </View>
    );
  }

  const statusColor = getStatusColor(todayStandup.docstatus, todayStandup.is_submitted);
  const statusLabel = getStatusLabel(todayStandup.docstatus, todayStandup.is_submitted);
  const date = new Date(todayStandup.standup_date || todayStandup.date);
  const dateStr = date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <AppHeader
        title="Today's Standup"
        canGoBack={true}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[custom.palette.primary]}
          />
        }
      >
        {/* Date Header */}
        <Section title={dateStr} icon="calendar" tint={custom.palette.primary}>
          <View style={styles.headerCard}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.labelText}>Standup ID</Text>
                <Text style={styles.valueText}>{todayStandup.standup_id}</Text>
              </View>
              <Chip
                style={{
                  backgroundColor: statusColor,
                }}
                textStyle={{ color: '#FFF', fontWeight: '700' }}
              >
                {statusLabel}
              </Chip>
            </View>
          </View>
        </Section>

        {/* Status Information */}
        <Section title="Information" icon="info-circle" tint={custom.palette.primary}>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Icon name="clock" size={16} color="#6B7280" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Created Time</Text>
                <Text style={styles.infoValue}>
                  {todayStandup.standup_time || 'N/A'}
                </Text>
              </View>
            </View>

            <View style={[styles.infoRow, { marginTop: 12 }]}>
              <Icon name="users" size={16} color="#6B7280" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Employee Entries</Text>
                <Text style={styles.infoValue}>
                  {todayStandup.total_tasks || 0} {todayStandup.total_tasks === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
            </View>

            {todayStandup.remarks && (
              <View style={[styles.infoRow, { marginTop: 12 }]}>
                <Icon name="sticky-note" size={16} color="#6B7280" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Remarks</Text>
                  <Text style={styles.infoValue}>{todayStandup.remarks}</Text>
                </View>
              </View>
            )}
          </View>
        </Section>

        {/* Status Badge */}
        <Section title="Status Indicators" icon="flag" tint="#8B5CF6">
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Icon
                name={todayStandup.docstatus === 0 ? 'edit' : 'lock'}
                size={20}
                color={statusColor}
              />
              <Text style={[styles.statusText, { color: statusColor, marginTop: 8 }]}>
                {todayStandup.docstatus === 0 ? 'Editable' : 'Locked'}
              </Text>
            </View>

            <View style={styles.statusItem}>
              <Icon
                name={todayStandup.total_tasks > 0 ? 'check-circle' : 'circle'}
                size={20}
                color={todayStandup.total_tasks > 0 ? '#10B981' : '#D1D5DB'}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: todayStandup.total_tasks > 0 ? '#10B981' : '#D1D5DB', marginTop: 8 },
                ]}
              >
                {todayStandup.total_tasks > 0 ? 'Has Entries' : 'No Entries'}
              </Text>
            </View>

            <View style={styles.statusItem}>
              <Icon
                name={todayStandup.is_submittable ? 'check' : 'times'}
                size={20}
                color={todayStandup.is_submittable ? '#10B981' : '#EF4444'}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: todayStandup.is_submittable ? '#10B981' : '#EF4444', marginTop: 8 },
                ]}
              >
                {todayStandup.is_submittable ? 'Ready' : 'Not Ready'}
              </Text>
            </View>
          </View>
        </Section>

        {/* Action Buttons */}
        {todayStandup.total_tasks > 0 && (
          <Section title="Actions" icon="lightning-bolt" tint={custom.palette.primary}>
            <PaperButton
              mode="contained"
              onPress={() =>
                navigation.navigate('AdminStandupDetail', {
                  standupId: todayStandup.standup_id,
                  employeeName: 'Today\'s Standup',
                })
              }
              style={styles.actionButton}
            >
              View All Entries
            </PaperButton>
          </Section>
        )}

        {todayStandup.total_tasks === 0 && (
          <View style={styles.emptyStateContainer}>
            <Icon name="inbox" size={48} color="#D1D5DB" />
            <Text style={styles.emptyStateText}>No employee entries yet</Text>
            <Text style={styles.emptyStateSubtext}>Employees can start adding their standups</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
  },
  headerCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  labelText: {
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  valueText: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderRadius: 8,
  },
  statusItem: {
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionButton: {
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});

export default AdminTodayStandupScreen;
