import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Text, useTheme, Chip, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';
import EditStandupTaskModal from '../../components/employee/EditStandupTaskModal';

const EmployeeStandupHistoryScreen = ({ navigation }) => {
  const { employee } = useAuth();
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [standups, setStandups] = useState([]);
  const [stats, setStats] = useState(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTaskInitial, setEditTaskInitial] = useState({});
  const [editStandupId, setEditStandupId] = useState(null);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStandupHistory();
    setRefreshing(false);
  }, [fetchStandupHistory]);

  useEffect(() => {
    fetchStandupHistory();
  }, [fetchStandupHistory]);

  const renderStandupItem = ({ item }) => {
    const task = item.employee_task;
    const isSubmitted = item.is_submitted;
    const canEdit = !isSubmitted && !!task;
    const isBlocked = task?.task_status === 'Blocked';

    const getStatusColor = (status) => {
      switch (status) {
        case 'Completed': return { bg: '#D1FAE5', text: '#065F46' };
        case 'In Progress': return { bg: '#DBEAFE', text: '#1E40AF' };
        case 'Blocked': return { bg: '#FEE2E2', text: '#991B1B' };
        default: return { bg: '#FEF3C7', text: '#92400E' };
      }
    };

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
            style={{ backgroundColor: isSubmitted ? '#D1FAE5' : '#FEF3C7' }}
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

            {/* Hours Display */}
            <View style={styles.hoursDisplay}>
              <View style={styles.hourItem}>
                <Icon name="clock" size={12} color="#6B7280" />
                <Text style={styles.hourLabel}>Est: {task.estimated_hours || 0}h</Text>
              </View>
              <View style={styles.hourItem}>
                <Icon name="hourglass-half" size={12} color="#6B7280" />
                <Text style={styles.hourLabel}>Actual: {task.actual_hours || 0}h</Text>
              </View>
            </View>

            {task.actual_work_done && (
              <View style={styles.section}>
                <Text style={styles.label}>✅ Actual Work</Text>
                <Text style={styles.text} numberOfLines={2}>{task.actual_work_done}</Text>
              </View>
            )}

            {/* Blockers Display */}
            {(task.blockers || isBlocked) && (
              <View style={styles.blockersDisplayBox}>
                <Icon name="exclamation-triangle" size={12} color="#DC2626" />
                <Text style={styles.blockersDisplayText} numberOfLines={2}>
                  {task.blockers || 'Task is blocked'}
                </Text>
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
                  style={{ backgroundColor: getStatusColor(task.task_status).bg }}
                  textStyle={{ color: getStatusColor(task.task_status).text, fontSize: 10, fontWeight: '600' }}
                  size="small"
                  mode="flat"
                >
                  {task.task_status || 'Draft'}
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

            {/* Edit Button for Drafts */}
            {canEdit && (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => {
                  setEditTaskInitial(task);
                  setEditStandupId(item.standup_id);
                  setEditModalVisible(true);
                }}
              >
                <Icon name="edit" size={13} color="#FFFFFF" />
                <Text style={styles.editButtonText}>Edit Task</Text>
              </TouchableOpacity>
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
          <Text style={{ marginTop: 16, color: '#6B7280', fontSize: 14 }}>Loading history...</Text>
        </View>
      </View>
    );
  }

  // Save handler for modal
  const handleEditSave = async (fields) => {
    try {
      setEditModalVisible(false);
      if (!editStandupId) return;
      await StandupService.editEmployeeStandupTask(editStandupId, fields);
      Alert.alert('Success', 'Standup task updated');
      fetchStandupHistory();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update standup task');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Statistics Grid */}
        {stats && (
          <View style={styles.statsGrid}>
            <LinearGradient
              colors={[custom.palette.primary, '#4F46E5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCard}
            >
              <Icon name="list" size={22} color="#FFFFFF" />
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statNameLight}>Total</Text>
            </LinearGradient>

            <LinearGradient
              colors={[custom.palette.success, '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCard}
            >
              <Icon name="check" size={22} color="#FFFFFF" />
              <Text style={styles.statNumber}>{stats.submitted}</Text>
              <Text style={styles.statNameLight}>Submitted</Text>
            </LinearGradient>

            <LinearGradient
              colors={[custom.palette.secondary, '#0D9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCard}
            >
              <Icon name="flag-checkered" size={22} color="#FFFFFF" />
              <Text style={styles.statNumber}>{stats.completed}</Text>
              <Text style={styles.statNameLight}>Completed</Text>
            </LinearGradient>
          </View>
        )}

        {/* Standups List */}
        {standups.length > 0 ? (
          <View style={styles.listSection}>
            <View style={styles.sectionHeaderContainer}>
              <Icon name="history" size={16} color={custom.palette.primary} />
              <Text style={styles.listTitle}>Last 30 Days</Text>
            </View>
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
      <EditStandupTaskModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        onSave={handleEditSave}
        initialValues={editTaskInitial}
      />
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
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 10,
  },
  statName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 6,
    textAlign: 'center',
    opacity: 0.9,
  },
  statNameLight: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 6,
    textAlign: 'center',
    opacity: 0.9,
  },
  // List Section
  listSection: {
    marginBottom: 24,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 8,
  },
  // Item Card
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemDate: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: 0.3,
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
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    letterSpacing: 0.2,
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
    height: 0,
  },
  editButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
    backgroundColor: '#6366F1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  // Empty State
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyIconBox: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Hours Display Styles
  hoursDisplay: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
  },
  hourItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hourLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  // Blockers Display
  blockersDisplayBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
    gap: 6,
  },
  blockersDisplayText: {
    fontSize: 11,
    color: '#991B1B',
    flex: 1,
    lineHeight: 16,
  },
});

export default EmployeeStandupHistoryScreen;
