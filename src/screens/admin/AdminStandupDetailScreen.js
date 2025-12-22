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
  TextInput,
  Button,
  useTheme,
  Card,
  ActivityIndicator,
  Divider,
  Dialog,
  Portal,
  Chip,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const AdminStandupDetailScreen = ({ navigation, route }) => {
  const { custom } = useTheme();
  const { standupId } = route.params;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [standup, setStandup] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogType, setDialogType] = useState(''); // submit, amend, remarks
  const [submitting, setSubmitting] = useState(false);

  const fetchStandupDetail = useCallback(async () => {
    setLoading(true);
    try {
      if (!standupId) {
        throw new Error('Standup ID not provided');
      }
      
      console.log('📋 Fetching details for standup:', standupId);
      const result = await StandupService.getStandupDetail(standupId);
      console.log('📋 Standup detail response:', result);
      
      const standupData = result.data || result;
      console.log('📋 Extracted standup data:', standupData);
      
      setStandup(standupData);
      setRemarks(standupData?.remarks || '');
    } catch (error) {
      console.error('❌ Error fetching standup detail:', error);
      Alert.alert('Error', 'Failed to load standup: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [standupId]);

  useEffect(() => {
    fetchStandupDetail();
  }, [fetchStandupDetail]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStandupDetail();
    setRefreshing(false);
  }, [fetchStandupDetail]);

  const handleSubmitStandup = async () => {
    setSubmitting(true);
    try {
      await StandupService.submitStandup(standupId, remarks || null);
      Alert.alert('Success', 'Standup submitted successfully!');
      setDialogVisible(false);
      await fetchStandupDetail();
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'Failed to submit standup');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAmendStandup = async () => {
    setSubmitting(true);
    try {
      const result = await StandupService.amendStandup(standupId);
      Alert.alert(
        'Success',
        `Standup unlocked for editing.\nNew ID: ${result.data?.amended_standup_id}`
      );
      setDialogVisible(false);
      navigation.goBack();
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'Failed to amend standup');
    } finally {
      setSubmitting(false);
    }
  };

  const renderTaskCard = task => (
    <Card
      key={`${task.idx}_${task.employee}`}
      style={[styles.taskCard, { backgroundColor: custom.palette.surface }]}
    >
      <Card.Content>
        {/* Task Header */}
        <View style={styles.taskHeader}>
          <View style={styles.employeeInfo}>
            <Text style={styles.employeeName}>{task.employee}</Text>
            <Text style={styles.taskDepartment}>{task.department}</Text>
          </View>
          <Chip
            icon={task.task_status === 'Completed' ? 'check' : 'clock'}
            style={{
              backgroundColor:
                task.task_status === 'Completed' ? '#D1FAE5' : '#FEF3C7',
            }}
            textStyle={{
              color:
                task.task_status === 'Completed' ? '#065F46' : '#92400E',
              fontWeight: '600',
            }}
          >
            {task.task_status}
          </Chip>
        </View>

        <Divider style={styles.divider} />

        {/* Task Title & Planned Output */}
        <View style={styles.taskContent}>
          <View style={styles.contentSection}>
            <Text style={styles.sectionLabel}>
              📌 Task Title
            </Text>
            <Text style={styles.sectionValue}>{task.task_title}</Text>
          </View>

          <View style={styles.contentSection}>
            <Text style={styles.sectionLabel}>
              🎯 Planned Output
            </Text>
            <Text style={styles.sectionValue}>{task.planned_output}</Text>
          </View>

          {task.actual_work_done && (
            <View style={styles.contentSection}>
              <Text style={styles.sectionLabel}>
                ✅ Actual Work Done
              </Text>
              <Text style={styles.sectionValue}>{task.actual_work_done}</Text>
            </View>
          )}
        </View>

        <Divider style={styles.divider} />

        {/* Progress Metrics */}
        <View style={styles.metricsContainer}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Completion %</Text>
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${task.completion_percentage}%`,
                    backgroundColor:
                      task.completion_percentage >= 80
                        ? '#10B981'
                        : task.completion_percentage >= 50
                        ? '#F59E0B'
                        : '#EF4444',
                  },
                ]}
              />
            </View>
            <Text style={styles.metricValue}>
              {task.completion_percentage}%
            </Text>
          </View>

          {task.carry_forward === 1 && (
            <View style={styles.carryForwardBadge}>
              <Icon
                name="arrow-right"
                size={12}
                color="#6366F1"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.carryForwardText}>
                Carry Forward to {task.next_working_date}
              </Text>
            </View>
          )}
        </View>
      </Card.Content>
    </Card>
  );

  if (loading && !standup) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="Standup Detail"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>
            Loading standup...
          </Text>
        </View>
      </View>
    );
  }

  if (!standup) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="Standup Detail"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#6B7280' }}>Failed to load standup</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <AppHeader
        title="Standup Detail"
        canGoBack={true}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[custom.palette.primary]}
          />
        }
        style={styles.container}
      >
        {/* Standup Header */}
        <View style={[styles.headerCard, { backgroundColor: custom.palette.surface }]}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerDate}>
                📅 {formatDate(standup.standup_date)}
              </Text>
              <Text style={styles.headerTime}>⏰ {standup.standup_time}</Text>
            </View>
            <Chip
              icon={standup.is_submitted ? 'check-circle' : 'pencil'}
              style={{
                backgroundColor: standup.is_submitted
                  ? '#D1FAE5'
                  : '#FEF3C7',
              }}
              textStyle={{
                color: standup.is_submitted ? '#065F46' : '#92400E',
                fontWeight: '600',
              }}
            >
              {standup.is_submitted ? 'Submitted' : 'Draft'}
            </Chip>
          </View>

          <Divider style={styles.divider} />

          {/* Statistics */}
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Icon
                name="tasks"
                size={18}
                color={custom.palette.primary}
              />
              <View style={styles.statContent}>
                <Text style={styles.statValue}>
                  {standup.statistics?.total_tasks || 0}
                </Text>
                <Text style={styles.statLabel}>Total Tasks</Text>
              </View>
            </View>

            <View style={styles.statBox}>
              <Icon
                name="check-circle"
                size={18}
                color="#10B981"
              />
              <View style={styles.statContent}>
                <Text style={[styles.statValue, { color: '#10B981' }]}>
                  {standup.statistics?.completed_tasks || 0}
                </Text>
                <Text style={styles.statLabel}>Completed</Text>
              </View>
            </View>

            <View style={styles.statBox}>
              <Icon
                name="hourglass-half"
                size={18}
                color="#F59E0B"
              />
              <View style={styles.statContent}>
                <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                  {standup.statistics?.pending_tasks || 0}
                </Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
            </View>

            <View style={styles.statBox}>
              <Icon
                name="percentage"
                size={18}
                color="#3B82F6"
              />
              <View style={styles.statContent}>
                <Text style={[styles.statValue, { color: '#3B82F6' }]}>
                  {standup.statistics?.avg_completion || 0}%
                </Text>
                <Text style={styles.statLabel}>Avg Comp.</Text>
              </View>
            </View>
          </View>

          {standup.remarks && (
            <>
              <Divider style={styles.divider} />
              <View>
                <Text style={styles.remarksLabel}>Manager Remarks</Text>
                <Text style={styles.remarksText}>{standup.remarks}</Text>
              </View>
            </>
          )}
        </View>

        {/* Tasks List */}
        <View style={styles.tasksSection}>
          <Text style={styles.sectionTitle}>
            📋 Tasks ({standup.tasks?.length || 0})
          </Text>
          {standup.tasks && standup.tasks.length > 0 ? (
            standup.tasks.map(task => renderTaskCard(task))
          ) : (
            <Text style={styles.noTasksText}>No tasks in this standup</Text>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {!standup.is_submitted ? (
            <>
              <Button
                mode="contained"
                icon="check"
                onPress={() => {
                  setDialogType('submit');
                  setDialogVisible(true);
                }}
                style={styles.actionButton}
                buttonColor="#10B981"
              >
                Submit Standup
              </Button>
            </>
          ) : (
            <>
              <Button
                mode="outlined"
                icon="pencil"
                onPress={() => {
                  setDialogType('amend');
                  setDialogVisible(true);
                }}
                style={styles.actionButton}
              >
                Amend (Unlock)
              </Button>
            </>
          )}

          <Button
            mode="outlined"
            icon="arrow-left"
            onPress={() => navigation.goBack()}
            style={styles.actionButton}
          >
            Back
          </Button>
        </View>
      </ScrollView>

      {/* Dialog: Submit or Add Remarks */}
      <Portal>
        <Dialog
          visible={dialogVisible && dialogType === 'submit'}
          onDismiss={() => setDialogVisible(false)}
        >
          <Dialog.Title>Submit Standup</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              Add manager remarks (optional):
            </Text>
            <TextInput
              mode="outlined"
              label="Remarks"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              numberOfLines={4}
              style={styles.remarksInput}
              placeholder="Enter any manager remarks or feedback..."
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setDialogVisible(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onPress={handleSubmitStandup}
              loading={submitting}
              buttonColor="#10B981"
              textColor="#fff"
            >
              Submit
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Dialog: Amend */}
        <Dialog
          visible={dialogVisible && dialogType === 'amend'}
          onDismiss={() => setDialogVisible(false)}
        >
          <Dialog.Title>Unlock for Editing</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              Are you sure you want to unlock this submitted standup for editing?
            </Text>
            <Text style={[styles.dialogText, { marginTop: 8, color: '#6B7280' }]}>
              An amended copy will be created and linked to the original.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setDialogVisible(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onPress={handleAmendStandup}
              loading={submitting}
              buttonColor="#F59E0B"
              textColor="#fff"
            >
              Proceed
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  headerCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerDate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  headerTime: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  divider: {
    marginVertical: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  statBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statContent: {
    marginLeft: 8,
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  remarksLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  remarksText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  tasksSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  taskCard: {
    marginBottom: 12,
    borderRadius: 8,
    elevation: 2,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  taskDepartment: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  taskContent: {
    marginVertical: 8,
  },
  contentSection: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  sectionValue: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  metricsContainer: {
    marginTop: 8,
  },
  metricItem: {
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  carryForwardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  carryForwardText: {
    fontSize: 11,
    color: '#4F46E5',
    fontWeight: '600',
  },
  noTasksText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
  actionsContainer: {
    marginBottom: 24,
    gap: 8,
  },
  actionButton: {
    marginBottom: 8,
  },
  dialogText: {
    fontSize: 14,
    color: '#374151',
  },
  remarksInput: {
    marginTop: 16,
  },
});

export default AdminStandupDetailScreen;
