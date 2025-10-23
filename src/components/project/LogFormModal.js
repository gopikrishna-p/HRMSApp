import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal, Portal, TextInput, Button, SegmentedButtons, Checkbox, HelperText } from 'react-native-paper';

const statusOptions = [
    { value: 'Planned', label: 'Planned' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Blocked', label: 'Blocked' },
    { value: 'Completed', label: 'Completed' },
];

export default function LogFormModal({ visible, onDismiss, onSubmit, projectId }) {
    const [title, setTitle] = useState('');
    const [status, setStatus] = useState('In Progress');
    const [description, setDescription] = useState('');
    const [duration, setDuration] = useState('');
    const [billable, setBillable] = useState(false);
    const [activityType, setActivityType] = useState('');
    const [tags, setTags] = useState('');

    const canSave = useMemo(() => title.trim().length > 0 && status, [title, status]);

    const handleSave = () => {
        const payload = {
            project: projectId,
            title: title.trim(),
            status,
            description: description?.trim() || '',
            duration_hours: duration ? Number(duration) : null,
            billable: billable ? 1 : 0,
            activity_type: activityType || null,
            tags: tags
                ? tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                : [],
        };
        onSubmit?.(payload);
    };

    const clear = () => {
        setTitle('');
        setStatus('In Progress');
        setDescription('');
        setDuration('');
        setBillable(false);
        setActivityType('');
        setTags('');
    };

    return (
        <Portal>
            <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.container}>
                <TextInput label="Project" value={projectId} disabled mode="outlined" style={styles.input} />
                <TextInput label="Title *" value={title} onChangeText={setTitle} mode="outlined" style={styles.input} />
                <SegmentedButtons
                    value={status}
                    onValueChange={setStatus}
                    buttons={statusOptions}
                    style={{ marginBottom: 8 }}
                />
                <TextInput
                    label="Description"
                    value={description}
                    onChangeText={setDescription}
                    mode="outlined"
                    multiline
                    style={styles.input}
                />
                <View style={styles.row}>
                    <TextInput
                        label="Duration (hrs)"
                        value={duration}
                        onChangeText={setDuration}
                        keyboardType="decimal-pad"
                        mode="outlined"
                        style={[styles.input, { flex: 1, marginRight: 8 }]}
                    />
                    <TextInput
                        label="Activity Type"
                        value={activityType}
                        onChangeText={setActivityType}
                        mode="outlined"
                        style={[styles.input, { flex: 1 }]}
                    />
                </View>
                <TextInput
                    label="Tags (comma separated)"
                    value={tags}
                    onChangeText={setTags}
                    mode="outlined"
                    style={styles.input}
                />

                <View style={styles.row}>
                    <Checkbox.Item
                        label="Billable"
                        status={billable ? 'checked' : 'unchecked'}
                        onPress={() => setBillable((b) => !b)}
                    />
                    {!canSave && <HelperText type="error">Title is required</HelperText>}
                </View>

                <View style={styles.actions}>
                    <Button mode="text" onPress={() => (clear(), onDismiss?.())}>
                        Cancel
                    </Button>
                    <Button mode="contained" onPress={handleSave} disabled={!canSave}>
                        Save Log
                    </Button>
                </View>
            </Modal>
        </Portal>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: 'white', margin: 16, padding: 16, borderRadius: 12 },
    input: { marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'center' },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
