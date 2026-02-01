import React, { useState, useEffect } from 'react';
import { Modal, View, StyleSheet, Text, TextInput, Button, Switch, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';

const TASK_STATUS_OPTIONS = ['Draft', 'In Progress', 'Completed', 'Blocked'];

const EditStandupTaskModal = ({ visible, onClose, onSave, initialValues }) => {
  const [taskTitle, setTaskTitle] = useState(initialValues?.task_title || '');
  const [plannedOutput, setPlannedOutput] = useState(initialValues?.planned_output || '');
  const [actualWorkDone, setActualWorkDone] = useState(initialValues?.actual_work_done || '');
  const [completionPercentage, setCompletionPercentage] = useState(initialValues?.completion_percentage || 0);
  const [taskStatus, setTaskStatus] = useState(initialValues?.task_status || 'Draft');
  const [estimatedHours, setEstimatedHours] = useState(initialValues?.estimated_hours?.toString() || '');
  const [actualHours, setActualHours] = useState(initialValues?.actual_hours?.toString() || '');
  const [blockers, setBlockers] = useState(initialValues?.blockers || '');
  const [carryForward, setCarryForward] = useState(initialValues?.carry_forward === 1);
  const [nextWorkingDate, setNextWorkingDate] = useState(initialValues?.next_working_date || '');

  // Load values when modal becomes visible
  useEffect(() => {
    if (visible && initialValues) {
      setTaskTitle(initialValues.task_title || '');
      setPlannedOutput(initialValues.planned_output || '');
      setActualWorkDone(initialValues.actual_work_done || '');
      setCompletionPercentage(initialValues.completion_percentage || 0);
      setTaskStatus(initialValues.task_status || 'Draft');
      setEstimatedHours(initialValues.estimated_hours?.toString() || '');
      setActualHours(initialValues.actual_hours?.toString() || '');
      setBlockers(initialValues.blockers || '');
      setCarryForward(initialValues.carry_forward === 1);
      setNextWorkingDate(initialValues.next_working_date || '');
    }
  }, [visible, initialValues]);

  const handleSave = () => {
    onSave({
      task_title: taskTitle,
      planned_output: plannedOutput,
      actual_work_done: actualWorkDone,
      completion_percentage: completionPercentage,
      task_status: taskStatus,
      estimated_hours: parseFloat(estimatedHours) || 0,
      actual_hours: parseFloat(actualHours) || 0,
      blockers: blockers,
      carry_forward: carryForward ? 1 : 0,
      next_working_date: nextWorkingDate,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.header}>Edit Standup Task</Text>
            
            <Text style={styles.label}>Task Title</Text>
            <TextInput style={styles.input} placeholder="Task Title" value={taskTitle} onChangeText={setTaskTitle} />
            
            <Text style={styles.label}>Planned Output</Text>
            <TextInput style={[styles.input, styles.multilineInput]} placeholder="Planned Output" value={plannedOutput} onChangeText={setPlannedOutput} multiline numberOfLines={3} />
            
            <Text style={styles.label}>Actual Work Done</Text>
            <TextInput style={[styles.input, styles.multilineInput]} placeholder="Actual Work Done" value={actualWorkDone} onChangeText={setActualWorkDone} multiline numberOfLines={3} />
            
            <View style={styles.rowInputs}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Completion %</Text>
                <TextInput style={styles.input} placeholder="0-100" value={String(completionPercentage)} onChangeText={v => setCompletionPercentage(Number(v) || 0)} keyboardType="numeric" />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Estimated Hours</Text>
                <TextInput style={styles.input} placeholder="e.g., 4" value={estimatedHours} onChangeText={setEstimatedHours} keyboardType="decimal-pad" />
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Actual Hours</Text>
                <TextInput style={styles.input} placeholder="e.g., 4.5" value={actualHours} onChangeText={setActualHours} keyboardType="decimal-pad" />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Status</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={taskStatus} style={styles.picker} onValueChange={setTaskStatus}>
                    {TASK_STATUS_OPTIONS.map(status => (
                      <Picker.Item key={status} label={status} value={status} />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>

            {(taskStatus === 'Blocked' || blockers) && (
              <>
                <Text style={[styles.label, { color: '#DC2626' }]}>Blockers {taskStatus === 'Blocked' ? '(Required)' : ''}</Text>
                <TextInput 
                  style={[styles.input, styles.multilineInput, taskStatus === 'Blocked' && styles.blockerInput]} 
                  placeholder="Describe blockers or impediments..." 
                  value={blockers} 
                  onChangeText={setBlockers} 
                  multiline 
                  numberOfLines={2} 
                />
              </>
            )}

            <View style={styles.row}>
              <Text style={styles.switchLabel}>Carry Forward to Next Day:</Text>
              <Switch value={carryForward} onValueChange={setCarryForward} />
            </View>
            
            {carryForward && (
              <>
                <Text style={styles.label}>Next Working Date</Text>
                <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={nextWorkingDate} onChangeText={setNextWorkingDate} />
              </>
            )}
            
            <View style={styles.buttonRow}>
              <Button title="Cancel" onPress={onClose} color="#6B7280" />
              <Button title="Save" onPress={handleSave} color="#6366F1" />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '90%', maxHeight: '85%' },
  header: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#1F2937' },
  label: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, marginBottom: 8, backgroundColor: '#F9FAFB' },
  multilineInput: { minHeight: 70, textAlignVertical: 'top' },
  blockerInput: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  rowInputs: { flexDirection: 'row', gap: 12 },
  halfInput: { flex: 1 },
  switchLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  pickerContainer: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, backgroundColor: '#F9FAFB', overflow: 'hidden' },
  picker: { height: 44 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
});

export default EditStandupTaskModal;
