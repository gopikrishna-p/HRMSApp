import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList } from 'react-native';
import { Text, Card, useTheme, ActivityIndicator, Button, Chip, TextInput, Dialog, Portal } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import StandupService from '../../services/standup.service';
import { formatDate, formatTime } from '../../utils/helpers';

const AdminStandupDetailScreen = ({ route, navigation }) => {
  const { standupId } = route.params;
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [standup, setStandup] = useState(null);
  const [submittingStandup, setSubmittingStandup] = useState(false);
  const [showRemarksDialog, setShowRemarksDialog] = useState(false);
  const [remarks, setRemarks] = useState('');

  const fetchStandupDetail = useCallback(async () => {
    setLoading(true);
    try {
      const result = await StandupService.getStandupDetail(standupId);
      if (result?.data) {
        setStandup(result.data);
        setRemarks(result.data.remarks || '');
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to load standup detail');
    } finally {
      setLoading(false);
    }
  }, [standupId]);

  useEffect(() => {
    fetchStandupDetail();
  }, [fetchStandupDetail]);

  const handleSubmitStandup = async () => {
    setSubmittingStandup(true);
    try {
      await StandupService.submitStandup(standupId, remarks.trim() || null);
      Alert.alert('Success', 'Standup submitted successfully!');
      setShowRemarksDialog(false);
      await fetchStandupDetail();
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'Failed to submit standup');
    } finally {
      setSubmittingStandup(false);
    }
  };

  const handleAmendStandup = async () => {
    Alert.alert(
      'Amend Standup',
      'This will unlock the submitted standup for editing. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Amend',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await StandupService.amendStandup(standupId);
              Alert.alert('Success', `Amended standup created: ${result.data.amended_standup_id}`);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to amend standup');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
        <ActivityIndicator size="large" color={custom.palette.primary} />
      </View>
    );
  }

  if (!standup) {
    return (
      <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
        <Card style={styles.errorCard}>
          <Card.Content>
            <Text>Failed to load standup</Text>
          </Card.Content>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: custom.palette.background }]}>
      {/* Header Info */}
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.label}>Standup Date</Text>
              <Text style={styles.value}>{formatDate(standup.standup_date)}</Text>
            </View>
            <Chip
              icon={standup.is_submitted ? 'check' : 'clock-outline'}
              style={{
                backgroundColor: standup.is_submitted ? '#D1FAE5' : '#FEF3C7',
              }}
              textStyle={{
                color: standup.is_submitted ? '#065F46' : '#92400E',
              }}
            >
              {standup.is_submitted ? 'Submitted' : 'Draft'}
            </Chip>
          </View>

          <View style={[styles.headerRow, { marginTop: 12 }]}>
            <View>
              <Text style={styles.label}>Standup Time</Text>
              <Text style={styles.value}>{formatTime(standup.standup_time)}</Text>
            </View>
            <View>
              <Text style={styles.label}>ID</Text>
              <Text style={[styles.value, { fontSize: 12 }]}>{standup.standup_id}</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Statistics */}
      {standup.statistics && (
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statNumber}>{standup.statistics.total_tasks}</Text>
              <Text style={styles.statName}>Total Tasks</Text>
            </Card.Content>
          </Card>

          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={[styles.statNumber, { color: '#10B981' }]}>
                {standup.statistics.completed_tasks}
              </Text>
              <Text style={styles.statName}>Completed</Text>
            </Card.Content>
          </Card>

          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={[styles.statNumber, { color: '#F59E0B' }]}>
                {standup.statistics.pending_tasks}
              </Text>
              <Text style={styles.statName}>Pending</Text>
            </Card.Content>
          </Card>
        </View>
      )}

      {/* Remarks */}
      {standup.remarks && (
        <Card style={styles.remarksCard}>
          <Card.Content>
            <Text style={styles.remarksLabel}>💬 Remarks</Text>
            <Text style={styles.remarksText}>{standup.remarks}</Text>
          </Card.Content>
        </Card>
      )}

      {/* Tasks List */}
      {standup.tasks && standup.tasks.length > 0 ? (
        <>
          <Text style={styles.tasksTitle}>Tasks ({standup.tasks.length})</Text>
          <FlatList
            data={standup.tasks}
            renderItem={({ item }) => <TaskCard task={item} custom={custom} />}
            keyExtractor={(item) => `${item.employee}-${item.idx}`}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </>
      ) : (
        <Card style={styles.emptyCard}>
          <Card.Content>
            <Text style={styles.emptyText}>No tasks in this standup</Text>
          </Card.Content>
        </Card>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {!standup.is_submitted ? (
          <Button
            mode="contained"
            onPress={() => setShowRemarksDialog(true)}
            loading={submittingStandup}
            disabled={submittingStandup}
            style={styles.actionBtn}
            labelStyle={{ fontSize: 14 }}
          >
            Submit Standup
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={handleAmendStandup}
            disabled={loading}
            style={styles.actionBtn}
            labelStyle={{ fontSize: 14 }}
          >
            Amend Standup
          </Button>
        )}

        <Button
          mode="outlined"
          onPress={() => navigation.goBack()}
          style={styles.actionBtn}
          labelStyle={{ fontSize: 14 }}
        >
          Go Back
        </Button>
      </View>

      {/* Remarks Dialog */}
      <Portal>
        <Dialog visible={showRemarksDialog} onDismiss={() => setShowRemarksDialog(false)}>
          <Dialog.Title>Add Remarks</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Manager Remarks (Optional)"
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Add any remarks or notes..."
              mode="outlined"
              multiline
              numberOfLines={4}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowRemarksDialog(false)}>Cancel</Button>
            <Button
              onPress={handleSubmitStandup}
              loading={submittingStandup}
              disabled={submittingStandup}
            >
              Submit
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
};

const TaskCard = ({ task, custom }) => (
  <Card style={styles.taskCard}>
    <Card.Content>
      {/* Employee & Department */}
      <View style={styles.employeeHeader}>
        <View style={styles.employeeInfo}>
          <Text style={styles.employeeName}>{task.employee}</Text>
          <Text style={styles.department}>{task.department}</Text>
        </View>
      </View>

      {/* Task Title */}
      <Text style={styles.taskTitle}>{task.task_title}</Text>

      {/* Planned Output */}
      {task.planned_output && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>📋 Planned Output</Text>
          <Text style={styles.sectionText}>{task.planned_output}</Text>
        </View>
      )}

      {/* Actual Work Done */}
      {task.actual_work_done && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>✅ Actual Work Done</Text>
          <Text style={styles.sectionText}>{task.actual_work_done}</Text>
        </View>
      )}

      {/* Completion & Status */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Completion</Text>
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${task.completion_percentage}%`, backgroundColor: custom.palette.primary },
              ]}
            />
          </View>
          <Text style={styles.statValue}>{task.completion_percentage}%</Text>
        </View>

        <View style={styles.stat}>
          <Text style={styles.statLabel}>Status</Text>
          <Chip
            size={12}
            style={{
              backgroundColor: task.task_status === 'Completed' ? '#D1FAE5' : '#FEF3C7',
              marginTop: 4,
            }}
            textStyle={{
              color: task.task_status === 'Completed' ? '#065F46' : '#92400E',
              fontSize: 10,
            }}
          >
            {task.task_status}
          </Chip>
        </View>
      </View>

      {/* Carry Forward */}
      {task.carry_forward === 1 && (
        <View style={styles.carryForwardBox}>
          <Icon name="arrow-right" size={12} color={custom.palette.warning} />
          <Text style={styles.carryForwardText}>
            Carries forward to {task.next_working_date}
          </Text>
        </View>
      )}
    </Card.Content>
  </Card>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  headerCard: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginTop: 4,
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
  remarksCard: {
    marginBottom: 16,
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1,
  },
  remarksLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 8,
  },
  remarksText: {
    fontSize: 12,
    color: '#111827',
    lineHeight: 18,
  },
  tasksTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  taskCard: {
    marginBottom: 8,
  },
  employeeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  department: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 12,
    color: '#111827',
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 8,
  },
  stat: {
    flex: 1,
    marginRight: 12,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBar: {
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
  separator: {
    height: 4,
  },
  emptyCard: {
    marginVertical: 32,
  },
  emptyText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  actionButtons: {
    marginTop: 24,
    marginBottom: 16,
  },
  actionBtn: {
    marginBottom: 12,
  },
  errorCard: {
    marginTop: 32,
  },
});

export default AdminStandupDetailScreen;
