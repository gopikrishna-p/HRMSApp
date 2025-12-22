import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, RefreshControl } from 'react-native';
import { Text, TextInput, Button, useTheme, Switch, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const EmployeeStandupUpdateScreen = ({ navigation }) => {
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [todayStandup, setTodayStandup] = useState(null);
  const [actualWork, setActualWork] = useState('');
  const [completionPercentage, setCompletionPercentage] = useState(50);
  const [taskStatus, setTaskStatus] = useState('Draft');
  const [carryForward, setCarryForward] = useState(false);
  const [nextWorkingDate, setNextWorkingDate] = useState('');
  const [updated, setUpdated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTodayStandup = useCallback(async () => {
    setLoading(true);
    try {
      const result = await StandupService.getOrCreateTodayStandup();
      setTodayStandup(result.data);

      if (result.data?.employee_task) {
        const task = result.data.employee_task;
        setActualWork(task.actual_work_done || '');
        setCompletionPercentage(task.completion_percentage || 50);
        setTaskStatus(task.task_status || 'Draft');
        setCarryForward(task.carry_forward === 1);
        setNextWorkingDate(task.next_working_date || '');
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to load standup');
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

  const handleUpdateTask = async () => {
    if (!actualWork.trim()) {
      Alert.alert('Validation', 'Please fill in actual work done');
      return;
    }

    setLoading(true);
    try {
      await StandupService.updateEmployeeStandupTask(
        todayStandup.standup_id,
        actualWork.trim(),
        completionPercentage,
        taskStatus,
        carryForward ? 1 : 0,
        nextWorkingDate || null
      );

      Alert.alert('Success', 'Task updated successfully!');
      setUpdated(true);
      setTimeout(() => {
        navigation.navigate('EmployeeStandupHistory');
      }, 1500);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'Failed to update task');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !todayStandup) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader 
          title="Update Today's Task"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading task...</Text>
        </View>
      </View>
    );
  }

  if (!todayStandup?.employee_task) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader 
          title="Update Today's Task"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <ScrollView style={styles.container}>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBox}>
              <Icon name="inbox" size={40} color="#F59E0B" />
            </View>
            <Text style={styles.emptyTitle}>No Task to Update</Text>
            <Text style={styles.emptyMessage}>Please submit your morning standup first</Text>
            <Button
              mode="contained"
              onPress={() => navigation.navigate('EmployeeStandup')}
              style={styles.goBackBtn}
            >
              Go to Today's Standup
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
        {/* Task Info Card */}
        <View style={styles.infoSection}>
          <Text style={styles.taskTitle}>{todayStandup.employee_task.task_title}</Text>
          <Text style={[styles.planningLabel, { marginTop: 8 }]}>Planned Output</Text>
          <Text style={styles.planningText}>{todayStandup.employee_task.planned_output}</Text>
        </View>

        {/* Update Form */}
        <View style={styles.formSection}>
          <View style={styles.sectionHeader}>
            <Icon name="edit" size={18} color={custom.palette.primary} />
            <Text style={styles.sectionTitle}>Evening Update</Text>
          </View>

          {/* Actual Work Done */}
          <TextInput
            label="Actual Work Done"
            value={actualWork}
            onChangeText={setActualWork}
            placeholder="What did you actually accomplish today?"
            mode="outlined"
            multiline
            numberOfLines={4}
            style={[styles.input, { textAlignVertical: 'top' }]}
            editable={!loading}
            outlineColor="#E5E7EB"
            activeOutlineColor={custom.palette.primary}
          />

          {/* Completion Percentage Slider */}
          <View style={styles.sliderSection}>
            <View style={styles.sliderHeader}>
              <Text style={styles.label}>Completion Percentage</Text>
              <Text style={styles.percentageValue}>{completionPercentage}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill,
                  { 
                    width: `${completionPercentage}%`,
                    backgroundColor: custom.palette.primary
                  }
                ]}
              />
            </View>
            <View style={styles.percentageControls}>
              <Button
                mode="outlined"
                onPress={() => setCompletionPercentage(Math.max(0, completionPercentage - 10))}
                style={styles.percentageBtn}
                labelStyle={{ fontSize: 12 }}
                compact
              >
                -10%
              </Button>
              <TextInput
                value={completionPercentage.toString()}
                onChangeText={(val) => {
                  const num = parseInt(val) || 0;
                  if (num >= 0 && num <= 100) {
                    setCompletionPercentage(num);
                  }
                }}
                keyboardType="numeric"
                maxLength={3}
                style={styles.percentageInput}
                mode="outlined"
              />
              <Button
                mode="outlined"
                onPress={() => setCompletionPercentage(Math.min(100, completionPercentage + 10))}
                style={styles.percentageBtn}
                labelStyle={{ fontSize: 12 }}
                compact
              >
                +10%
              </Button>
            </View>
          </View>

          {/* Task Status */}
          <View style={styles.statusSection}>
            <Text style={styles.label}>Task Status</Text>
            <View style={styles.statusOptions}>
              {['Draft/In Progress', 'Completed'].map((status) => (
                <Button
                  key={status}
                  mode={taskStatus === status ? 'contained' : 'outlined'}
                  onPress={() => setTaskStatus(status)}
                  style={[
                    styles.statusButton,
                    taskStatus === status && { borderColor: custom.palette.primary }
                  ]}
                  labelStyle={{ fontSize: 12 }}
                  compact
                >
                  {status}
                </Button>
              ))}
            </View>
          </View>

          {/* Carry Forward Option */}
          <View style={styles.carryForwardSection}>
            <View style={styles.carryForwardHeader}>
              <Icon name="arrow-right" size={16} color={custom.palette.primary} />
              <Text style={styles.carryForwardLabel}>Carry Forward to Next Day</Text>
            </View>
            <Switch
              value={carryForward}
              onValueChange={setCarryForward}
              color={custom.palette.primary}
            />
          </View>

          {carryForward && (
            <TextInput
              label="Next Working Date"
              value={nextWorkingDate}
              onChangeText={setNextWorkingDate}
              placeholder="YYYY-MM-DD"
              mode="outlined"
              style={styles.input}
              editable={!loading}
              outlineColor="#E5E7EB"
              activeOutlineColor={custom.palette.primary}
            />
          )}

          {/* Submit Button */}
          <Button
            mode="contained"
            onPress={handleUpdateTask}
            loading={loading}
            disabled={loading || !actualWork.trim()}
            style={styles.submitBtn}
            labelStyle={{ fontSize: 16, fontWeight: '600' }}
          >
            Update Task
          </Button>
        </View>

        {/* Success State */}
        {updated && (
          <View style={styles.successSection}>
            <View style={styles.successIconBox}>
              <Icon name="check-circle" size={48} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>Task Updated!</Text>
            <Text style={styles.successMessage}>Your task has been updated successfully</Text>
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
  // Info Section
  infoSection: {
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
  taskTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  planningLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planningText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    marginTop: 6,
    lineHeight: 18,
  },
  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  goBackBtn: {
    minWidth: 140,
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
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    marginBottom: 0,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
  },
  // Slider Section
  sliderSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  percentageValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366F1',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  percentageControls: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  percentageBtn: {
    flex: 1,
    borderRadius: 6,
  },
  percentageInput: {
    flex: 0.8,
    backgroundColor: '#FFFFFF',
  },
  // Status Section
  statusSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  statusOptions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  statusButton: {
    flex: 1,
    minWidth: 90,
  },
  // Carry Forward Section
  carryForwardSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  carryForwardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carryForwardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },
  // Submit Button
  submitBtn: {
    marginTop: 20,
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
  },
});

export default EmployeeStandupUpdateScreen;
