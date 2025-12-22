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
  Button as PaperButton,
  Chip,
  Divider,
  Dialog,
  Portal,
  TextInput,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import StandupService from '../../services/standup.service';

const EmployeeTodayStandupScreen = ({ navigation, route }) => {
  const { custom } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [standup, setStandup] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Dialog state for creating first task
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [plannedOutput, setPlannedOutput] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  const fetchTodayStandup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔍 Fetching today standup...');
      const result = await StandupService.getOrCreateTodayStandup();
      console.log('📄 Today standup:', result);

      // Handle nested response structure
      const data = result.data || result;
      setStandup(data);

      // If standup exists but has no tasks, show create task option
      if (data && data.total_tasks === 0) {
        console.log('✏️ No tasks yet, ready to create');
      }
    } catch (error) {
      console.error('❌ Error fetching standup:', error);
      setError(error.message || 'Failed to load today standup');
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

  const handleCreateFirstTask = async () => {
    if (!taskTitle.trim()) {
      Alert.alert('Validation', 'Please enter a task title');
      return;
    }

    if (!plannedOutput.trim()) {
      Alert.alert('Validation', 'Please enter planned output');
      return;
    }

    setCreatingTask(true);
    try {
      console.log('📝 Creating first task...');
      const result = await StandupService.submitEmployeeStandupTask(
        standup.standup_id,
        taskTitle,
        plannedOutput,
        0
      );
      console.log('✅ Task created:', result);

      Alert.alert('Success', 'First task created successfully', [
        {
          text: 'Continue',
          onPress: () => {
            setShowCreateTaskDialog(false);
            setTaskTitle('');
            setPlannedOutput('');
            // Refresh to show the new task
            fetchTodayStandup();
          },
        },
      ]);
    } catch (error) {
      console.error('❌ Error creating task:', error);
      Alert.alert('Error', error.message || 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleAddMoreTasks = () => {
    // Navigate to add task screen (to be created)
    navigation.navigate('EmployeeAddStandupTask', {
      standupId: standup.standup_id,
      onTaskAdded: fetchTodayStandup,
    });
  };

  const handleViewTasks = () => {
    // Navigate to task list/detail screen
    navigation.navigate('EmployeeStandupTasksView', {
      standupId: standup.standup_id,
    });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="Today's Standup"
          canGoBack={false}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading today's standup...</Text>
        </View>
      </View>
    );
  }

  if (error || !standup) {
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
            {error || 'Unable to load standup'}
          </Text>
          <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
            {error || 'Please try again later'}
          </Text>
          <PaperButton
            mode="contained"
            onPress={fetchTodayStandup}
            style={{ marginTop: 20 }}
          >
            Retry
          </PaperButton>
        </View>
      </View>
    );
  }

  const today = new Date();
  const todayDate = today.toLocaleDateString('en-IN');
  const standupDate = new Date(standup.standup_date).toLocaleDateString('en-IN');
  const isToday = todayDate === standupDate;

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <AppHeader
        title="Today's Standup"
        canGoBack={false}
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
        {/* Status Card */}
        <Section title="Standup Status" icon="calendar-check" tint={custom.palette.primary}>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusContent}>
                <Text style={styles.statusLabel}>📅 Date</Text>
                <Text style={styles.statusValue}>{standupDate}</Text>
              </View>
              <Chip
                icon={isToday ? 'check-circle' : 'clock'}
                style={{
                  backgroundColor: isToday ? '#D1FAE5' : '#FEF3C7',
                }}
                textStyle={{
                  color: isToday ? '#065F46' : '#92400E',
                  fontWeight: '600',
                }}
              >
                {isToday ? 'Today' : 'Not Today'}
              </Chip>
            </View>

            <Divider style={{ marginVertical: 12 }} />

            <View style={styles.statusRow}>
              <View style={styles.statusContent}>
                <Text style={styles.statusLabel}>⏰ Time</Text>
                <Text style={styles.statusValue}>
                  {standup.standup_time
                    ? new Date(standup.standup_time).toLocaleTimeString('en-IN')
                    : 'N/A'}
                </Text>
              </View>
              <Chip
                icon={standup.is_submitted ? 'lock' : 'pencil-alt'}
                style={{
                  backgroundColor: standup.is_submitted ? '#DBEAFE' : '#FEF3C7',
                }}
                textStyle={{
                  color: standup.is_submitted ? '#1E40AF' : '#92400E',
                  fontWeight: '600',
                  fontSize: 11,
                }}
              >
                {standup.is_submitted ? 'Submitted' : 'Draft'}
              </Chip>
            </View>

            <Divider style={{ marginVertical: 12 }} />

            <View style={styles.statusRow}>
              <View style={styles.statusContent}>
                <Text style={styles.statusLabel}>📋 ID</Text>
                <Text style={styles.statusValue}>{standup.standup_id}</Text>
              </View>
            </View>
          </View>
        </Section>

        {/* Task Summary Section */}
        <Section title="Task Summary" icon="tasks" tint="#8B5CF6">
          <View style={styles.taskSummaryCard}>
            <View style={styles.taskSummaryContent}>
              <View style={styles.taskCountBox}>
                <Icon name="list-ul" size={24} color={custom.palette.primary} />
                <Text style={styles.taskCountNumber}>{standup.total_tasks}</Text>
                <Text style={styles.taskCountLabel}>Total Tasks</Text>
              </View>

              <Divider
                style={{ width: 1, height: 60, backgroundColor: '#E5E7EB' }}
              />

              <View style={styles.taskStatusBox}>
                <Icon
                  name={standup.total_tasks > 0 ? 'check-circle' : 'circle'}
                  size={24}
                  color={standup.total_tasks > 0 ? '#10B981' : '#D1D5DB'}
                />
                <Text style={styles.taskStatusLabel}>
                  {standup.total_tasks > 0 ? 'Ready' : 'Pending'}
                </Text>
              </View>
            </View>

            {standup.total_tasks === 0 && (
              <View style={styles.emptyStateBox}>
                <Icon name="inbox" size={32} color="#D1D5DB" />
                <Text style={styles.emptyStateTitle}>No tasks yet</Text>
                <Text style={styles.emptyStateSubtitle}>
                  Create your first task to get started
                </Text>
              </View>
            )}
          </View>
        </Section>

        {/* Remarks Section */}
        {standup.remarks && (
          <Section title="Remarks" icon="sticky-note" tint="#F59E0B">
            <View style={styles.remarksBox}>
              <Text style={styles.remarksText}>{standup.remarks}</Text>
            </View>
          </Section>
        )}

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {standup.total_tasks === 0 && !standup.is_submitted ? (
            <View style={styles.primaryActionBox}>
              <View style={styles.actionIconBox}>
                <Icon name="plus-circle" size={28} color={custom.palette.primary} />
              </View>
              <Text style={styles.actionTitle}>Start Your Day</Text>
              <Text style={styles.actionDescription}>
                Create your first task to begin today's standup
              </Text>
              <PaperButton
                mode="contained"
                onPress={() => setShowCreateTaskDialog(true)}
                style={styles.createFirstTaskButton}
              >
                Create First Task
              </PaperButton>
            </View>
          ) : (
            <View style={styles.secondaryActionsBox}>
              {standup.total_tasks > 0 && !standup.is_submitted && (
                <PaperButton
                  mode="contained"
                  onPress={handleAddMoreTasks}
                  style={styles.addMoreButton}
                  icon="plus"
                >
                  Add More Tasks
                </PaperButton>
              )}

              {standup.total_tasks > 0 && (
                <PaperButton
                  mode="outlined"
                  onPress={handleViewTasks}
                  style={styles.viewTasksButton}
                  icon="eye"
                >
                  View Tasks
                </PaperButton>
              )}

              {standup.is_submitted && (
                <View style={styles.submittedBox}>
                  <Icon name="check-circle" size={24} color="#10B981" />
                  <Text style={styles.submittedText}>Standup Submitted</Text>
                  <Text style={styles.submittedSubtext}>
                    Waiting for manager review
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Create First Task Dialog */}
      <Portal>
        <Dialog
          visible={showCreateTaskDialog}
          onDismiss={() => !creatingTask && setShowCreateTaskDialog(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Create Your First Task</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogHelper}>
              Describe what you plan to accomplish today
            </Text>
            <TextInput
              mode="outlined"
              label="Task Title"
              placeholder="e.g., API Development for Login Module"
              value={taskTitle}
              onChangeText={setTaskTitle}
              editable={!creatingTask}
              style={styles.dialogInput}
            />
            <TextInput
              mode="outlined"
              label="Planned Output"
              placeholder="What do you plan to achieve?"
              multiline
              numberOfLines={4}
              value={plannedOutput}
              onChangeText={setPlannedOutput}
              editable={!creatingTask}
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <PaperButton
              onPress={() => setShowCreateTaskDialog(false)}
              disabled={creatingTask}
            >
              Cancel
            </PaperButton>
            <PaperButton
              onPress={handleCreateFirstTask}
              loading={creatingTask}
              disabled={creatingTask}
            >
              Create Task
            </PaperButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
  },
  statusCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusContent: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  taskSummaryCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 14,
  },
  taskSummaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  taskCountBox: {
    alignItems: 'center',
    flex: 1,
  },
  taskCountNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3B82F6',
    marginTop: 4,
  },
  taskCountLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '600',
  },
  taskStatusBox: {
    alignItems: 'center',
    flex: 1,
  },
  taskStatusLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginTop: 6,
  },
  emptyStateBox: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  emptyStateTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
  },
  emptyStateSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  remarksBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  remarksText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 20,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryActionBox: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  actionIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  createFirstTaskButton: {
    width: '100%',
    paddingVertical: 8,
    borderRadius: 8,
  },
  secondaryActionsBox: {
    gap: 10,
  },
  addMoreButton: {
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewTasksButton: {
    paddingVertical: 8,
    borderRadius: 8,
  },
  submittedBox: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  submittedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#15803D',
    marginTop: 8,
  },
  submittedSubtext: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 4,
  },
  dialog: {
    marginHorizontal: 16,
  },
  dialogHelper: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
  },
  dialogInput: {
    backgroundColor: '#FFF',
    marginBottom: 12,
  },
});

export default EmployeeTodayStandupScreen;
