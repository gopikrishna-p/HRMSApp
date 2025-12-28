import React, { useState, useEffect } from 'react';
import { Modal, View, StyleSheet, Text, TextInput, Button, Switch } from 'react-native';
import { Picker } from '@react-native-picker/picker';

const EditStandupTaskModal = ({ visible, onClose, onSave, initialValues }) => {
  const [taskTitle, setTaskTitle] = useState(initialValues?.task_title || '');
  const [plannedOutput, setPlannedOutput] = useState(initialValues?.planned_output || '');
  const [actualWorkDone, setActualWorkDone] = useState(initialValues?.actual_work_done || '');
  const [completionPercentage, setCompletionPercentage] = useState(initialValues?.completion_percentage || 0);
  const [taskStatus, setTaskStatus] = useState(initialValues?.task_status || 'Draft');
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
      carry_forward: carryForward ? 1 : 0,
      next_working_date: nextWorkingDate,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.header}>Edit Standup Task</Text>
          <TextInput style={styles.input} placeholder="Task Title" value={taskTitle} onChangeText={setTaskTitle} />
          <TextInput style={styles.input} placeholder="Planned Output" value={plannedOutput} onChangeText={setPlannedOutput} />
          <TextInput style={styles.input} placeholder="Actual Work Done" value={actualWorkDone} onChangeText={setActualWorkDone} />
          <TextInput style={styles.input} placeholder="Completion %" value={String(completionPercentage)} onChangeText={v => setCompletionPercentage(Number(v))} keyboardType="numeric" />
          <View style={styles.row}>
            <Text>Status:</Text>
            <Picker selectedValue={taskStatus} style={styles.picker} onValueChange={setTaskStatus}>
              <Picker.Item label="Draft" value="Draft" />
              <Picker.Item label="Completed" value="Completed" />
            </Picker>
          </View>
          <View style={styles.row}>
            <Text>Carry Forward:</Text>
            <Switch value={carryForward} onValueChange={setCarryForward} />
          </View>
          {carryForward && (
            <TextInput style={styles.input} placeholder="Next Working Date (YYYY-MM-DD)" value={nextWorkingDate} onChangeText={setNextWorkingDate} />
          )}
          <View style={styles.buttonRow}>
            <Button title="Cancel" onPress={onClose} />
            <Button title="Save" onPress={handleSave} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: 320 },
  header: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  picker: { flex: 1, height: 40 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
});

export default EditStandupTaskModal;
