import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, Card, TextInput, Button, useTheme, SegmentedButtons, Chip, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const EmployeeStandupScreen = ({ navigation }) => {
  const { employee } = useAuth();
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [todayStandup, setTodayStandup] = useState(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [plannedOutput, setPlannedOutput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const fetchTodayStandup = useCallback(async () => {
    setLoading(true);
    try {
      const result = await StandupService.getOrCreateTodayStandup();
      console.log('✅ Standup fetched:', result);
      console.log('📊 Result structure:', {
        hasResult: !!result,
        hasData: !!result?.data,
        standup_id: result?.standup_id,
        is_submitted: result?.is_submitted,
        total_tasks: result?.total_tasks,
        employee_task: !!result?.employee_task,
      });
      
      // Handle the response - it might have .data nested
      const standupData = result?.data || result;
      setTodayStandup(standupData);
      setSubmitted(standupData?.is_submitted || false);
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
        0
      );

      Alert.alert('Success', 'Standup task submitted for today!');
      setTaskTitle('');
      setPlannedOutput('');
      await fetchTodayStandup();
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'Failed to submit task');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !todayStandup) {
    return (
      <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
        <View style={styles.header}>
          <Icon name="calendar-day" size={24} color={custom.palette.primary} />
          <Text style={styles.headerTitle}>Today's Standup</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: custom.palette.textSecondary }}>Loading standup...</Text>
        </View>
      </View>
    );
  }

  if (!todayStandup) {
    return (
      <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
        <View style={styles.header}>
          <Icon name="calendar-day" size={24} color={custom.palette.primary} />
          <Text style={styles.headerTitle}>Today's Standup</Text>
        </View>
        <Card style={styles.errorCard}>
          <Card.Content>
            <Icon name="exclamation-circle" size={32} color={custom.palette.warning} />
            <Text style={[styles.label, { marginTop: 12 }]}>Unable to Load</Text>
            <Text style={[styles.value, { marginTop: 4 }]}>Could not fetch standup data</Text>
            <Button
              mode="contained"
              onPress={fetchTodayStandup}
              style={{ marginTop: 16 }}
            >
              Try Again
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
        <Icon name="calendar-day" size={24} color={custom.palette.primary} />
        <Text style={styles.headerTitle}>Today's Standup</Text>
      </View>

      {todayStandup && (
        <Card style={styles.statusCard}>
          <Card.Content>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{formatDate(todayStandup.standup_date)}</Text>

            <Text style={[styles.label, { marginTop: 8 }]}>Status</Text>
            <Chip
              icon={submitted ? 'check' : 'clock-outline'}
              style={{
                marginTop: 4,
                backgroundColor: submitted ? '#D1FAE5' : '#FEF3C7',
              }}
              textStyle={{ color: submitted ? '#065F46' : '#92400E' }}
            >
              {submitted ? 'Submitted' : 'Draft'}
            </Chip>

            {todayStandup.total_tasks > 0 && (
              <>
                <Text style={[styles.label, { marginTop: 8 }]}>Tasks for Today</Text>
                <Text style={styles.value}>{todayStandup.total_tasks}</Text>
              </>
            )}
          </Card.Content>
        </Card>
      )}

      {!submitted && todayStandup && !todayStandup.employee_task && (
        <Card style={styles.formCard}>
          <Card.Title title="Submit Morning Task" />
          <Card.Content>
            <TextInput
              label="Task Title"
              value={taskTitle}
              onChangeText={setTaskTitle}
              placeholder="e.g., API Development for Login Module"
              mode="outlined"
              style={styles.input}
              editable={!loading}
            />

            <TextInput
              label="Planned Output"
              value={plannedOutput}
              onChangeText={setPlannedOutput}
              placeholder="What do you plan to accomplish today?"
              mode="outlined"
              multiline
              numberOfLines={4}
              style={[styles.input, { marginTop: 12 }]}
              editable={!loading}
            />

            <Button
              mode="contained"
              onPress={handleSubmitTask}
              loading={loading}
              disabled={loading || !taskTitle.trim() || !plannedOutput.trim()}
              style={styles.submitBtn}
              labelStyle={{ fontSize: 14 }}
            >
              Submit Task
            </Button>
          </Card.Content>
        </Card>
      )}

      {todayStandup && todayStandup.employee_task && !submitted && (
        <Card style={styles.taskCard}>
          <Card.Title title="Your Task for Today" />
          <Card.Content>
            <Text style={styles.label}>Task Title</Text>
            <Text style={[styles.value, { marginBottom: 12 }]}>
              {todayStandup.employee_task.task_title}
            </Text>

            <Text style={styles.label}>Planned Output</Text>
            <Text style={[styles.value, { marginBottom: 16, lineHeight: 18 }]}>
              {todayStandup.employee_task.planned_output}
            </Text>

            <Text style={styles.label}>Current Completion</Text>
            <Text style={[styles.value, { marginBottom: 12 }]}>
              {todayStandup.employee_task.completion_percentage}%
            </Text>

            <Button
              mode="contained"
              onPress={() => navigation.navigate('EmployeeStandupUpdate')}
              style={styles.updateBtn}
              labelStyle={{ fontSize: 14 }}
            >
              Update in Evening
            </Button>
          </Card.Content>
        </Card>
      )}

      {submitted && (
        <Card style={styles.submittedCard}>
          <Card.Content>
            <View style={styles.centerContent}>
              <Icon name="check-circle" size={48} color={custom.palette.success} />
              <Text style={[styles.submittedText, { marginTop: 12 }]}>
                Your standup has been submitted
              </Text>
              <Text style={styles.submittedSubtext}>
                You can update it in the evening
              </Text>
            </View>

            <Button
              mode="outlined"
              onPress={() => navigation.navigate('EmployeeStandupHistory')}
              style={styles.historyBtn}
              labelStyle={{ fontSize: 12 }}
            >
              View History
            </Button>
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
  statusCard: {
    marginBottom: 16,
  },
  errorCard: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 24,
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
    marginTop: 4,
    color: '#111827',
  },
  formCard: {
    marginBottom: 16,
  },
  taskCard: {
    marginBottom: 16,
    borderColor: '#14B8A6',
    borderWidth: 1,
  },
  input: {
    marginBottom: 0,
  },
  submitBtn: {
    marginTop: 16,
  },
  updateBtn: {
    marginTop: 8,
  },
  submittedCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#D1FAE5',
    borderWidth: 1,
  },
  centerContent: {
    alignItems: 'center',
  },
  submittedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#047857',
  },
  submittedSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  historyBtn: {
    marginTop: 16,
  },
});

export default EmployeeStandupScreen;
