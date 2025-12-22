import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, Card, TextInput, Button, useTheme, SegmentedButtons, Chip, ActivityIndicator, Switch } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const EmployeeStandupUpdateScreen = ({ navigation }) => {
  const { employee } = useAuth();
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [todayStandup, setTodayStandup] = useState(null);
  const [actualWork, setActualWork] = useState('');
  const [completionPercentage, setCompletionPercentage] = useState(50);
  const [taskStatus, setTaskStatus] = useState('Draft');
  const [carryForward, setCarryForward] = useState(false);
  const [nextWorkingDate, setNextWorkingDate] = useState('');
  const [updated, setUpdated] = useState(false);

  const fetchTodayStandup = useCallback(async () => {
    setLoading(true);
    try {
      const result = await StandupService.getOrCreateTodayStandup();
      setTodayStandup(result.data);

      // Populate fields if employee task exists
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

  const handleUpdateTask = async () => {
    if (!actualWork.trim()) {
      Alert.alert('Validation', 'Please fill in the actual work done');
      return;
    }

    if (carryForward && !nextWorkingDate.trim()) {
      Alert.alert('Validation', 'Please enter next working date for carry forward');
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
        carryForward ? nextWorkingDate : null
      );

      Alert.alert('Success', 'Standup task updated successfully!');
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
      <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
        <ActivityIndicator size="large" color={custom.palette.primary} />
      </View>
    );
  }

  if (!todayStandup?.employee_task) {
    return (
      <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
        <Card style={styles.emptyCard}>
          <Card.Content>
            <View style={styles.centerContent}>
              <Icon name="info-circle" size={48} color={custom.palette.warning} />
              <Text style={[styles.emptyText, { marginTop: 12 }]}>
                No task submitted today yet
              </Text>
              <Text style={styles.emptySubtext}>
                Please submit your morning standup first
              </Text>
            </View>

            <Button
              mode="contained"
              onPress={() => navigation.navigate('EmployeeStandup')}
              style={styles.goBackBtn}
              labelStyle={{ fontSize: 12 }}
            >
              Go to Today's Standup
            </Button>
          </Card.Content>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: custom.palette.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Icon name="tasks" size={24} color={custom.palette.primary} />
        <Text style={styles.headerTitle}>Update Today's Task</Text>
      </View>

      {todayStandup && (
        <Card style={styles.taskCard}>
          <Card.Content>
            <Text style={styles.label}>Task Title</Text>
            <Text style={[styles.value, { marginBottom: 12 }]}>
              {todayStandup.employee_task.task_title}
            </Text>

            <Text style={styles.label}>Planned Output</Text>
            <Text style={[styles.value, { marginBottom: 12 }]}>
              {todayStandup.employee_task.planned_output}
            </Text>
          </Card.Content>
        </Card>
      )}

      <Card style={styles.formCard}>
        <Card.Title title="Evening Update" />
        <Card.Content>
          {/* Actual Work Done */}
          <TextInput
            label="Actual Work Done"
            value={actualWork}
            onChangeText={setActualWork}
            placeholder="What did you actually accomplish today?"
            mode="outlined"
            multiline
            numberOfLines={4}
            style={styles.input}
            editable={!loading}
          />

          {/* Completion Percentage */}
          <View style={[styles.section, { marginTop: 16 }]}>
            <View style={styles.completionHeader}>
              <Text style={styles.label}>Completion: {completionPercentage}%</Text>
              <Button
                mode="text"
                compact
                onPress={() => setCompletionPercentage(100)}
                disabled={loading}
              >
                Mark 100%
              </Button>
            </View>
            <View style={styles.progressContainer}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${completionPercentage}%`,
                    backgroundColor: custom.palette.primary,
                  },
                ]}
              />
            </View>
            <TextInput
              label="Set Percentage (0-100)"
              value={String(completionPercentage)}
              onChangeText={(val) => {
                const num = Math.min(Math.max(parseInt(val) || 0, 0), 100);
                setCompletionPercentage(num);
              }}
              mode="outlined"
              keyboardType="numeric"
              style={[styles.input, { marginTop: 8 }]}
              editable={!loading}
            />
          </View>

          {/* Task Status */}
          <View style={[styles.section, { marginTop: 16 }]}>
            <Text style={styles.label}>Task Status</Text>
            <SegmentedButtons
              value={taskStatus}
              onValueChange={setTaskStatus}
              buttons={[
                { value: 'Draft', label: 'Draft' },
                { value: 'Completed', label: 'Completed' },
              ]}
              style={{ marginTop: 8 }}
            />
          </View>

          {/* Carry Forward */}
          <View style={[styles.section, { marginTop: 16 }]}>
            <View style={styles.carryForwardHeader}>
              <Text style={styles.label}>Carry Forward to Next Day?</Text>
              <Switch value={carryForward} onValueChange={setCarryForward} disabled={loading} />
            </View>

            {carryForward && (
              <TextInput
                label="Next Working Date (YYYY-MM-DD)"
                value={nextWorkingDate}
                onChangeText={setNextWorkingDate}
                placeholder="e.g., 2025-12-24"
                mode="outlined"
                style={[styles.input, { marginTop: 8 }]}
                editable={!loading}
              />
            )}
          </View>

          <Button
            mode="contained"
            onPress={handleUpdateTask}
            loading={loading}
            disabled={loading || !actualWork.trim()}
            style={styles.submitBtn}
            labelStyle={{ fontSize: 14 }}
          >
            Update Task
          </Button>
        </Card.Content>
      </Card>

      {updated && (
        <Card style={styles.successCard}>
          <Card.Content>
            <View style={styles.centerContent}>
              <Icon name="check-circle" size={48} color={custom.palette.success} />
              <Text style={[styles.successText, { marginTop: 12 }]}>
                Task updated successfully!
              </Text>
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
  taskCard: {
    marginBottom: 16,
  },
  formCard: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  input: {
    marginBottom: 0,
  },
  section: {
    paddingBottom: 8,
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressContainer: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressBar: {
    height: '100%',
  },
  carryForwardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  submitBtn: {
    marginTop: 16,
  },
  emptyCard: {
    marginTop: 32,
  },
  centerContent: {
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  goBackBtn: {
    marginTop: 16,
  },
  successCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#D1FAE5',
    borderWidth: 1,
    marginBottom: 16,
  },
  successText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#047857',
  },
});

export default EmployeeStandupUpdateScreen;
