import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, useTheme, Chip, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const EmployeeStandupScreen = ({ navigation }) => {
  const { employee } = useAuth();
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayStandup, setTodayStandup] = useState(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [plannedOutput, setPlannedOutput] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [carryForwardTasks, setCarryForwardTasks] = useState([]);

  const fetchTodayStandup = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch standup and carry forward tasks in parallel
      const [standupResult, carryForwardResult] = await Promise.all([
        StandupService.getOrCreateTodayStandup(),
        StandupService.getCarryForwardTasks().catch(() => ({ data: [] })),
      ]);

      console.log('✅ Standup fetched:', standupResult);
      console.log('📋 Carry forward tasks:', carryForwardResult);
      
      // Handle the response - it might have .data nested
      const standupData = standupResult?.data || standupResult;
      setTodayStandup(standupData);
      setSubmitted(standupData?.is_submitted || false);

      // Set carry forward tasks
      const cfTasks = carryForwardResult?.data || [];
      setCarryForwardTasks(cfTasks);
    } catch (error) {
      console.error('❌ Error fetching standup:', error);
      Alert.alert('Error', 'Failed to load standup: ' + (error.message || 'Unknown error'));
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

  const handleSubmitTask = async () => {
    if (!todayStandup) {
      Alert.alert('Error', 'Standup data not loaded');
      return;
    }

    if (!taskTitle.trim() || !plannedOutput.trim()) {
      Alert.alert('Validation', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await StandupService.submitEmployeeStandupTask(
        todayStandup.standup_id,
        taskTitle.trim(),
        plannedOutput.trim(),
        0,
        parseFloat(estimatedHours) || 0
      );

      Alert.alert('Success', 'Standup task submitted for today!');
      setTaskTitle('');
      setPlannedOutput('');
      setEstimatedHours('');
      await fetchTodayStandup();
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'Failed to submit task');
    } finally {
      setLoading(false);
    }
  };

  // Handle using a carry forward task
  const handleUseCarryForwardTask = (task) => {
    setTaskTitle(task.task_title);
    setPlannedOutput(task.planned_output || `Continuing: ${task.task_title}`);
    setEstimatedHours(task.estimated_hours?.toString() || '');
    Alert.alert('Task Loaded', 'The carried forward task has been loaded. You can modify it before submitting.');
  };

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
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading standup...</Text>
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
        <ScrollView style={styles.container}>
          <View style={styles.errorContainer}>
            <View style={styles.errorIconBox}>
              <Icon name="exclamation-circle" size={40} color="#EF4444" />
            </View>
            <Text style={styles.errorTitle}>Unable to Load</Text>
            <Text style={styles.errorMessage}>Could not fetch standup data</Text>
            <Button
              mode="contained"
              onPress={fetchTodayStandup}
              style={styles.retryBtn}
            >
              Try Again
            </Button>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <ScrollView 
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Status Card */}
        <View style={styles.statusSection}>
          <View style={styles.statusHeader}>
            <View>
              <Text style={styles.statusDate}>{formatDate(todayStandup.standup_date)}</Text>
              <Text style={styles.statusLabel}>Today's Standup</Text>
            </View>
            <Chip
              icon={submitted ? 'check' : 'clock-outline'}
              style={{
                backgroundColor: submitted ? '#D1FAE5' : '#FEF3C7',
              }}
              textStyle={{ color: submitted ? '#059669' : '#92400E', fontWeight: '600' }}
              mode="flat"
            >
              {submitted ? 'Submitted' : 'Draft'}
            </Chip>
          </View>
        </View>

        {/* Carry Forward Tasks Section */}
        {!submitted && todayStandup && !todayStandup.employee_task && carryForwardTasks.length > 0 && (
          <View style={styles.carryForwardSection}>
            <View style={styles.sectionHeader}>
              <Icon name="history" size={18} color="#F59E0B" />
              <Text style={styles.sectionTitle}>Carried Forward Tasks</Text>
            </View>
            <Text style={styles.carryForwardHelp}>
              These tasks were marked for carry forward. Tap to use as today's task.
            </Text>
            {carryForwardTasks.map((task, index) => (
              <TouchableOpacity
                key={index}
                style={styles.carryForwardItem}
                onPress={() => handleUseCarryForwardTask(task)}
              >
                <View style={styles.carryForwardContent}>
                  <Icon name="arrow-right" size={14} color="#F59E0B" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.carryForwardTitle} numberOfLines={1}>{task.task_title}</Text>
                    <Text style={styles.carryForwardMeta}>
                      {task.completion_percentage}% complete • From {formatDate(task.standup_date)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Form Section - Only show if not submitted and no task created yet */}
        {!submitted && todayStandup && !todayStandup.employee_task && (
          <View style={styles.formSection}>
            <View style={styles.sectionHeader}>
              <Icon name="pencil-alt" size={18} color={custom.palette.primary} />
              <Text style={styles.sectionTitle}>Submit Your Morning Task</Text>
            </View>

            <TextInput
              label="Task Title"
              value={taskTitle}
              onChangeText={setTaskTitle}
              placeholder="e.g., API Development for Login Module"
              mode="outlined"
              style={styles.input}
              editable={!loading}
              outlineColor="#E5E7EB"
              activeOutlineColor={custom.palette.primary}
            />

            <TextInput
              label="Planned Output"
              value={plannedOutput}
              onChangeText={setPlannedOutput}
              placeholder="What do you plan to accomplish today?"
              mode="outlined"
              multiline
              numberOfLines={4}
              style={[styles.input, { marginTop: 12, textAlignVertical: 'top' }]}
              editable={!loading}
              outlineColor="#E5E7EB"
              activeOutlineColor={custom.palette.primary}
            />

            <TextInput
              label="Estimated Hours (optional)"
              value={estimatedHours}
              onChangeText={setEstimatedHours}
              placeholder="e.g., 4"
              mode="outlined"
              keyboardType="decimal-pad"
              style={[styles.input, { marginTop: 12 }]}
              editable={!loading}
              outlineColor="#E5E7EB"
              activeOutlineColor={custom.palette.primary}
            />

            <Button
              mode="contained"
              onPress={handleSubmitTask}
              loading={loading}
              disabled={loading || !taskTitle.trim() || !plannedOutput.trim()}
              style={styles.submitBtn}
              labelStyle={{ fontSize: 16, fontWeight: '600' }}
            >
              Submit Task
            </Button>
          </View>
        )}

        {/* Task Details - Show existing task */}
        {todayStandup && todayStandup.employee_task && (
          <View style={styles.taskSection}>
            <View style={styles.sectionHeader}>
              <Icon name="tasks" size={18} color={custom.palette.primary} />
              <Text style={styles.sectionTitle}>Your Task for Today</Text>
            </View>

            <View style={styles.taskCard}>
              {/* Task Status Badge */}
              <View style={styles.taskStatusRow}>
                <Chip
                  icon={
                    todayStandup.employee_task.task_status === 'Completed' ? 'check-circle' :
                    todayStandup.employee_task.task_status === 'In Progress' ? 'clock' :
                    todayStandup.employee_task.task_status === 'Blocked' ? 'alert-circle' : 'edit'
                  }
                  style={{
                    backgroundColor: 
                      todayStandup.employee_task.task_status === 'Completed' ? '#D1FAE5' :
                      todayStandup.employee_task.task_status === 'In Progress' ? '#DBEAFE' :
                      todayStandup.employee_task.task_status === 'Blocked' ? '#FEE2E2' : '#FEF3C7',
                  }}
                  textStyle={{
                    color: 
                      todayStandup.employee_task.task_status === 'Completed' ? '#065F46' :
                      todayStandup.employee_task.task_status === 'In Progress' ? '#1E40AF' :
                      todayStandup.employee_task.task_status === 'Blocked' ? '#991B1B' : '#92400E',
                    fontWeight: '600',
                    fontSize: 11,
                  }}
                >
                  {todayStandup.employee_task.task_status || 'Draft'}
                </Chip>
              </View>

              <Text style={styles.taskLabel}>Task Title</Text>
              <Text style={styles.taskValue}>
                {todayStandup.employee_task.task_title}
              </Text>

              <Text style={[styles.taskLabel, { marginTop: 12 }]}>Planned Output</Text>
              <Text style={[styles.taskValue, { lineHeight: 20 }]}>
                {todayStandup.employee_task.planned_output}
              </Text>

              {/* Hours Row */}
              <View style={styles.hoursRow}>
                <View style={styles.hoursItem}>
                  <Icon name="clock" size={14} color="#6B7280" />
                  <Text style={styles.hoursLabel}>Est. Hours</Text>
                  <Text style={styles.hoursValue}>
                    {todayStandup.employee_task.estimated_hours || 0}h
                  </Text>
                </View>
                <View style={styles.hoursItem}>
                  <Icon name="hourglass-half" size={14} color="#6B7280" />
                  <Text style={styles.hoursLabel}>Actual Hours</Text>
                  <Text style={styles.hoursValue}>
                    {todayStandup.employee_task.actual_hours || 0}h
                  </Text>
                </View>
              </View>

              {/* Blockers Section */}
              {todayStandup.employee_task.blockers && (
                <View style={styles.blockersSection}>
                  <Text style={[styles.taskLabel, { color: '#DC2626' }]}>
                    <Icon name="exclamation-triangle" size={12} color="#DC2626" /> Blockers
                  </Text>
                  <Text style={styles.blockersText}>
                    {todayStandup.employee_task.blockers}
                  </Text>
                </View>
              )}

              <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                  <Text style={styles.taskLabel}>Progress</Text>
                  <Text style={styles.progressValue}>
                    {todayStandup.employee_task.completion_percentage}%
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill,
                      { 
                        width: `${todayStandup.employee_task.completion_percentage}%`,
                        backgroundColor: custom.palette.primary
                      }
                    ]}
                  />
                </View>
              </View>

              {!submitted && (
                <Button
                  mode="contained"
                  onPress={() => navigation.navigate('EmployeeStandupUpdate')}
                  style={styles.updateBtn}
                  labelStyle={{ fontSize: 14, fontWeight: '600' }}
                >
                  Update in Evening
                </Button>
              )}
            </View>
          </View>
        )}

        {/* Success State - Submitted */}
        {submitted && (
          <View style={styles.successSection}>
            <View style={styles.successIconBox}>
              <Icon name="check-circle" size={48} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>Standup Submitted!</Text>
            <Text style={styles.successMessage}>
              Your standup for today has been submitted successfully
            </Text>

            {todayStandup && todayStandup.employee_task && (
              <View style={[styles.taskCard, { marginTop: 16 }]}>
                <Text style={styles.taskLabel}>Today's Task</Text>
                <Text style={styles.taskValue} numberOfLines={2}>
                  {todayStandup.employee_task.task_title}
                </Text>
                <Text style={[styles.taskLabel, { marginTop: 8 }]}>Progress</Text>
                <Text style={styles.progressValue}>
                  {todayStandup.employee_task.completion_percentage}%
                </Text>
              </View>
            )}

            <Button
              mode="outlined"
              onPress={() => navigation.navigate('EmployeeStandupHistory')}
              style={styles.viewHistoryBtn}
              labelStyle={{ fontSize: 14, color: custom.palette.primary }}
            >
              View History
            </Button>
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
  // Status Section
  statusSection: {
    marginBottom: 24,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statusDate: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  // Error State
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  errorIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  retryBtn: {
    minWidth: 120,
    marginTop: 16,
  },
  // Form Section
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
  },
  input: {
    marginBottom: 0,
    backgroundColor: '#FFFFFF',
  },
  submitBtn: {
    marginTop: 16,
    paddingVertical: 4,
  },
  // Task Section
  taskSection: {
    marginBottom: 24,
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  taskLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  taskValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginTop: 6,
  },
  progressContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6366F1',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  updateBtn: {
    marginTop: 16,
    paddingVertical: 4,
  },
  // Success State
  successSection: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    alignItems: 'center',
  },
  successIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 16,
  },
  viewHistoryBtn: {
    marginTop: 16,
    borderColor: '#6366F1',
  },
  // Carry Forward Section Styles
  carryForwardSection: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  carryForwardHelp: {
    fontSize: 12,
    color: '#92400E',
    marginBottom: 12,
  },
  carryForwardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  carryForwardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carryForwardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  carryForwardMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  // Task Status Row
  taskStatusRow: {
    marginBottom: 12,
  },
  // Hours Row Styles
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  hoursItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hoursLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  hoursValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  // Blockers Section
  blockersSection: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
  },
  blockersText: {
    fontSize: 13,
    color: '#991B1B',
    marginTop: 4,
    lineHeight: 18,
  },
});

export default EmployeeStandupScreen;
