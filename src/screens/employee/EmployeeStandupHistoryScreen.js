import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { Text, Card, useTheme, ActivityIndicator, Chip, Divider } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import StandupService from '../../services/standup.service';
import { formatDate, formatTime } from '../../utils/helpers';

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
      // Get last 30 days of standups
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
      draft: totalStandups - submittedCount,
      completed: completedTasks,
    });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStandupHistory();
    setRefreshing(false);
  }, [fetchStandupHistory]);

  useEffect(() => {
    fetchStandupHistory();
  }, [fetchStandupHistory]);

  const getStatusColor = (status) => {
    return status === 'Completed' ? '#D1FAE5' : '#FEF3C7';
  };

  const getStatusTextColor = (status) => {
    return status === 'Completed' ? '#065F46' : '#92400E';
  };

  const renderStandupItem = ({ item }) => {
    const task = item.employee_task;
    const isSubmitted = item.is_submitted;

    return (
      <Card style={styles.standupCard}>
        <Card.Content>
          {/* Date and Status */}
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.date}>{formatDate(item.standup_date)}</Text>
              <Text style={styles.time}>{formatTime(item.standup_time)}</Text>
            </View>
            <Chip
              icon={isSubmitted ? 'check' : 'clock-outline'}
              style={{
                backgroundColor: isSubmitted ? '#D1FAE5' : '#FEF3C7',
              }}
              textStyle={{
                color: isSubmitted ? '#065F46' : '#92400E',
              }}
            >
              {isSubmitted ? 'Submitted' : 'Draft'}
            </Chip>
          </View>

          <Divider style={styles.divider} />

          {task ? (
            <>
              {/* Task Title */}
              <Text style={styles.taskTitle}>{task.task_title}</Text>

              {/* Planned Output */}
              {task.planned_output && (
                <View style={styles.section}>
                  <Text style={styles.label}>📋 Planned</Text>
                  <Text style={styles.text}>{task.planned_output}</Text>
                </View>
              )}

              {/* Actual Work Done */}
              {task.actual_work_done && (
                <View style={styles.section}>
                  <Text style={styles.label}>✅ Actual</Text>
                  <Text style={styles.text}>{task.actual_work_done}</Text>
                </View>
              )}

              {/* Completion & Status */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Completion</Text>
                  <View style={styles.completionContainer}>
                    <View
                      style={[
                        styles.completionBar,
                        {
                          width: `${task.completion_percentage}%`,
                          backgroundColor: custom.palette.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.statValue}>{task.completion_percentage}%</Text>
                </View>

                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Status</Text>
                  <Chip
                    size={12}
                    style={{
                      backgroundColor: getStatusColor(task.task_status),
                    }}
                    textStyle={{
                      color: getStatusTextColor(task.task_status),
                      fontSize: 11,
                    }}
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
            </>
          ) : (
            <View style={styles.emptyTask}>
              <Text style={styles.emptyTaskText}>No task for this standup</Text>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  if (loading && standups.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
        <ActivityIndicator size="large" color={custom.palette.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: custom.palette.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Icon name="history" size={24} color={custom.palette.primary} />
        <Text style={styles.headerTitle}>Standup History</Text>
      </View>

      {/* Statistics */}
      {stats && (
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statName}>Total</Text>
            </Card.Content>
          </Card>

          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={[styles.statNumber, { color: '#10B981' }]}>{stats.completed}</Text>
              <Text style={styles.statName}>Completed</Text>
            </Card.Content>
          </Card>

          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={[styles.statNumber, { color: '#F59E0B' }]}>{stats.submitted}</Text>
              <Text style={styles.statName}>Submitted</Text>
            </Card.Content>
          </Card>
        </View>
      )}

      {/* Standups List */}
      {standups.length > 0 ? (
        <View style={styles.listContainer}>
          <FlatList
            data={standups}
            renderItem={renderStandupItem}
            keyExtractor={(item) => item.standup_id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <Card.Content>
            <View style={styles.centerContent}>
              <Icon name="inbox" size={48} color={custom.palette.warning} />
              <Text style={[styles.emptyText, { marginTop: 12 }]}>No standup history</Text>
            </View>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    marginHorizontal: 4,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6366F1',
  },
  statName: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
  },
  listContainer: {
    marginBottom: 16,
  },
  standupCard: {
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  date: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  time: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  divider: {
    marginBottom: 12,
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  section: {
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  text: {
    fontSize: 12,
    color: '#111827',
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 8,
  },
  statItem: {
    flex: 1,
    marginRight: 12,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  completionContainer: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  completionBar: {
    height: '100%',
  },
  statValue: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
  },
  carryForwardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    borderLeftColor: '#F59E0B',
    borderLeftWidth: 3,
  },
  carryForwardText: {
    fontSize: 11,
    color: '#92400E',
    marginLeft: 6,
    fontWeight: '500',
  },
  emptyTask: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyTaskText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  separator: {
    height: 4,
  },
  emptyCard: {
    marginVertical: 32,
  },
  centerContent: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
});

export default EmployeeStandupHistoryScreen;
