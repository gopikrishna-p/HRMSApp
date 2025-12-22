import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { Text, useTheme, Chip, Button, TextInput, Dialog, Portal, ActivityIndicator } from 'react-native-paper';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const AdminStandupDetailScreen = ({ route, navigation }) => {
  const { standupId } = route.params;
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [standup, setStandup] = useState(null);
  const [submittingStandup, setSubmittingStandup] = useState(false);
  const [showRemarksDialog, setShowRemarksDialog] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStandupDetail();
    setRefreshing(false);
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
    setSubmittingStandup(true);
    try {
      await StandupService.amendStandup(standupId, remarks.trim() || null);
      Alert.alert('Success', 'Standup amended successfully!');
      setShowRemarksDialog(false);
      await fetchStandupDetail();
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'Failed to amend standup');
    } finally {
      setSubmittingStandup(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader 
          title="Standup Details"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading details...</Text>
        </View>
      </View>
    );
  }

  if (!standup) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader 
          title="Standup Details"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: '#6B7280' }}>Failed to load standup</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <AppHeader 
        title="Standup Details"
        canGoBack={true}
        onBack={() => navigation.goBack()}
      />
      <ScrollView 
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header Info Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerLabel}>Employee</Text>
              <Text style={styles.headerValue}>{standup.employee_name}</Text>
            </View>
            <Chip
              icon={standup.is_submitted ? 'check' : 'clock-outline'}
              style={{
                backgroundColor: standup.is_submitted ? '#D1FAE5' : '#FEF3C7',
              }}
              textStyle={{ color: standup.is_submitted ? '#059669' : '#92400E', fontWeight: '600' }}
              mode="flat"
            >
              {standup.is_submitted ? 'Submitted' : 'Draft'}
            </Chip>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoValue}>{formatDate(standup.standup_date)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Department</Text>
              <Text style={styles.infoValue}>{standup.department}</Text>
            </View>
          </View>
        </View>

        {/* Statistics Card */}
        {standup.employee_tasks && standup.employee_tasks.length > 0 && (
          <View style={styles.statsCard}>
            <Text style={styles.cardTitle}>Tasks Summary</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Total Tasks</Text>
                <Text style={styles.statValue}>{standup.employee_tasks.length}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Completed</Text>
                <Text style={styles.statValue}>
                  {standup.employee_tasks.filter(t => t.task_status === 'Completed').length}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Avg Progress</Text>
                <Text style={styles.statValue}>
                  {Math.round(
                    standup.employee_tasks.reduce((sum, t) => sum + t.completion_percentage, 0) /
                    standup.employee_tasks.length
                  )}%
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Tasks Section */}
        {standup.employee_tasks && standup.employee_tasks.length > 0 && (
          <View style={styles.tasksSection}>
            <Text style={styles.sectionTitle}>Tasks Details</Text>
            <FlatList
              data={standup.employee_tasks}
              renderItem={({ item: task }) => (
                <View style={styles.taskCard}>
                  <Text style={styles.taskTitle}>{task.task_title}</Text>

                  <Text style={[styles.label, { marginTop: 10 }]}>Planned Output</Text>
                  <Text style={styles.text}>{task.planned_output}</Text>

                  {task.actual_work_done && (
                    <>
                      <Text style={[styles.label, { marginTop: 10 }]}>Actual Work Done</Text>
                      <Text style={styles.text}>{task.actual_work_done}</Text>
                    </>
                  )}

                  <View style={styles.taskMeta}>
                    <View style={styles.metaItem}>
                      <Text style={styles.label}>Completion</Text>
                      <Text style={styles.metaValue}>{task.completion_percentage}%</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={styles.label}>Status</Text>
                      <Chip
                        style={{
                          backgroundColor: task.task_status === 'Completed' ? '#D1FAE5' : '#FEF3C7',
                          marginTop: 4,
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
                </View>
              )}
              keyExtractor={(item) => item.name}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.taskSeparator} />}
            />
          </View>
        )}

        {/* Remarks Card */}
        {standup.remarks && (
          <View style={styles.remarksCard}>
            <Text style={styles.remarksLabel}>Manager Remarks</Text>
            <Text style={styles.remarksText}>{standup.remarks}</Text>
          </View>
        )}

        {/* Action Buttons */}
        {!standup.is_submitted && (
          <Button
            mode="contained"
            onPress={() => setShowRemarksDialog(true)}
            style={styles.submitBtn}
            labelStyle={{ fontSize: 16, fontWeight: '600' }}
          >
            Submit Standup
          </Button>
        )}

        {standup.is_submitted && (
          <Button
            mode="outlined"
            onPress={() => setShowRemarksDialog(true)}
            style={styles.amendBtn}
            labelStyle={{ fontSize: 16, fontWeight: '600', color: custom.palette.primary }}
          >
            Amend Standup
          </Button>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Dialog for Remarks */}
      <Portal>
        <Dialog visible={showRemarksDialog} onDismiss={() => setShowRemarksDialog(false)}>
          <Dialog.Title>
            {standup.is_submitted ? 'Amend Standup' : 'Submit Standup'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Manager Remarks (Optional)"
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Add any remarks or feedback..."
              mode="outlined"
              multiline
              numberOfLines={4}
              style={{ marginTop: 8, textAlignVertical: 'top' }}
              editable={!submittingStandup}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowRemarksDialog(false)} disabled={submittingStandup}>
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={standup.is_submitted ? handleAmendStandup : handleSubmitStandup}
              loading={submittingStandup}
              disabled={submittingStandup}
            >
              {standup.is_submitted ? 'Amend' : 'Submit'}
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
    paddingBottom: 32,
  },
  // Header Card
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 6,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  infoItem: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  // Statistics Card
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6366F1',
    marginTop: 6,
  },
  // Tasks Section
  tasksSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  taskCard: {
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
  taskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
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
    marginTop: 6,
    lineHeight: 16,
  },
  taskMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 8,
  },
  metaItem: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  taskSeparator: {
    height: 8,
  },
  // Remarks Card
  remarksCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  remarksLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  remarksText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#78350F',
    lineHeight: 16,
  },
  // Buttons
  submitBtn: {
    marginBottom: 16,
    paddingVertical: 4,
  },
  amendBtn: {
    marginBottom: 16,
    borderColor: '#6366F1',
    paddingVertical: 4,
  },
});

export default AdminStandupDetailScreen;
