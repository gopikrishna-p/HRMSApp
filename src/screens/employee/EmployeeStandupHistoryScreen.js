import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { Text, useTheme, Chip, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const EmployeeStandupHistoryScreen = ({ navigation }) => {
  const { employee } = useAuth();
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [standups, setStandups] = useState([]);
  const [stats, setStats] = useState(null);

  const fetchStandupHistory = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date();
      const fromDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const formatDateStr = (date) => date.toISOString().split('T')[0];
      const result = await StandupService.getEmployeeStandupHistory(
        formatDateStr(fromDate),
        formatDateStr(today),
        50
      );

      if (result?.data?.standups) {
        setStandups(result.data.standups);
        calculateStats(result.data.standups);
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to load standup history');
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateStats = (standupList) => {
    const totalStandups = standupList.length;
    const submittedCount = standupList.filter((s) => s.is_submitted).length;
    const completedTasks = standupList.reduce((acc, s) => {
      if (s.employee_task && s.employee_task.task_status === 'Completed') {
        return acc + 1;
      }
      return acc;
    }, 0);

    setStats({
      total: totalStandups,
      submitted: submittedCount,
      completed: completedTasks,
    });
  };

  useEffect(() => {
    fetchStandupHistory();
  }, [fetchStandupHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStandupHistory();
    setRefreshing(false);
  }, [fetchStandupHistory]);

  const renderStandupItem = ({ item }) => {
    const task = item.employee_task;
    const isSubmitted = item.is_submitted;

    return (
      <View style={styles.itemCard}>
        {/* Header */}
        <View style={styles.itemHeader}>
          <View>
            <Text style={styles.itemDate}>{formatDate(item.standup_date)}</Text>
            {isSubmitted && (
              <Text style={styles.submittedLabel}>Submitted</Text>
            )}
          </View>
          <Chip
            icon={isSubmitted ? 'check' : 'clock-outline'}
            style={{
              backgroundColor: isSubmitted ? '#D1FAE5' : '#FEF3C7',
            }}
            textStyle={{ color: isSubmitted ? '#059669' : '#92400E', fontWeight: '600' }}
            mode="flat"
            size="small"
          >
            {isSubmitted ? 'Done' : 'Draft'}
          </Chip>
        </View>

        {task ? (
          <View style={styles.taskContent}>
            <Text style={styles.taskTitle} numberOfLines={2}>{task.task_title}</Text>

            {task.actual_work_done && (
              <View style={styles.section}>
                <Text style={styles.label}>✅ Actual Work</Text>
                <Text style={styles.text} numberOfLines={2}>{task.actual_work_done}</Text>
              </View>
            )}

            {/* Progress & Status Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Progress</Text>
                <Text style={styles.statValue}>{task.completion_percentage}%</Text>
              </View>

              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Status</Text>
                <Chip
                  style={{
                    backgroundColor: task.task_status === 'Completed' ? '#D1FAE5' : '#FEF3C7',
                  }}
                  textStyle={{
                    color: task.task_status === 'Completed' ? '#065F46' : '#92400E',
                    fontSize: 10,
                    fontWeight: '600',
                  }}
                  size="small"
                  mode="flat"
                >
                  {task.task_status}
                </Chip>
              </View>
            </View>

            {/* Carry Forward Info */}
            {task.carry_forward === 1 && (
              <View style={styles.carryForwardBox}>
                <Icon name="arrow-right" size={12} color={custom.palette.warning} />
                <Text style={styles.carryForwardText}>
                  Carries forward to {task.next_working_date}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyTask}>
            <Text style={styles.emptyTaskText}>No task for this standup</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading && standups.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader 
          title="Standup History"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading history...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Statistics Grid */}
        {stats && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Icon name="list" size={20} color={custom.palette.primary} />
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statName}>Total</Text>
            </View>

            <View style={styles.statCard}>
              <Icon name="check" size={20} color="#10B981" />
              <Text style={styles.statNumber}>{stats.submitted}</Text>
              <Text style={styles.statName}>Submitted</Text>
            </View>

            <View style={styles.statCard}>
              <Icon name="flag-checkered" size={20} color="#6366F1" />
              <Text style={styles.statNumber}>{stats.completed}</Text>
              <Text style={styles.statName}>Completed</Text>
            </View>
          </View>
        )}

        {/* Standups List */}
        {standups.length > 0 ? (
          <View style={styles.listSection}>
            <Text style={styles.listTitle}>Last 30 Days</Text>
            <FlatList
              data={standups}
              renderItem={renderStandupItem}
              keyExtractor={(item) => item.standup_id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        ) : (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconBox}>
              <Icon name="inbox" size={40} color="#9CA3AF" />
            </View>
            <Text style={styles.emptyTitle}>No Standup History</Text>
            <Text style={styles.emptyMessage}>Your standup history will appear here</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingBottom: 32,
  },
  // Statistics Grid
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 24,
    justifyContent: 'space-between',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  statName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  // List Section
  listSection: {
    marginBottom: 24,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Item Card
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  submittedLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 4,
  },
  taskContent: {
    paddingVertical: 4,
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  section: {
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    marginTop: 4,
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  carryForwardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  carryForwardText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 6,
  },
  emptyTask: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyTaskText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  separator: {
    height: 8,
  },
  // Empty State
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
});

export default EmployeeStandupHistoryScreen;
