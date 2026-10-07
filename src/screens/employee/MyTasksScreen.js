// src/screens/employee/MyTasksScreen.js
//
// Tasks of one project (hrms.api.my_tasks). Tapping a task opens its work logs; new tasks
// are created from the sheet behind the footer button.
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import showToast from '../../utils/Toast';
import { listTasks, createTask } from '../../services/project.service';
import {
    Screen,
    Group,
    Row,
    StatusText,
    ProgressBar,
    StatStrip,
    Segmented,
    Sheet,
    Button,
    TextField,
    Field,
    EmptyState,
    Loading,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

// 'YYYY-MM-DD' -> '12 Oct' (or '12 Oct 2027' outside the current year)
const shortDate = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) {
        return null;
    }
    return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
};

// ERPNext task status -> status tone
const taskTone = (status) => {
    const s = String(status).toLowerCase();
    if (['completed', 'closed', 'done'].includes(s)) {
        return 'success';
    }
    return { working: 'warning', 'pending review': 'purple', overdue: 'danger', open: 'info' }[s] || 'neutral';
};

const TaskRow = ({ t, onOpen }) => {
    const progress = Number(t.progress || 0);
    const due = shortDate(t.exp_end_date);
    const subtitle = [t.priority ? `${t.priority} priority` : null, due ? `Due ${due}` : null].filter(Boolean).join('  ·  ');

    return (
        <Row
            title={t.subject}
            titleLines={2}
            subtitle={subtitle || undefined}
            meta={(
                <View style={styles.metaLine}>
                    <View style={styles.bar}>
                        <ProgressBar value={progress} tone={taskTone(t.status) === 'success' ? 'success' : 'accent'} />
                    </View>
                    <Text style={styles.percent}>{Math.round(progress)}%</Text>
                </View>
            )}
            right={<StatusText label={t.status} tone={taskTone(t.status)} />}
            onPress={() => onOpen(t)}
        />
    );
};

export default function MyTasksScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    const { projectId, projectName } = route.params || {};
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState([]);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('Medium');

    const headerTitle = projectName || projectId;

    useLayoutEffect(() => {
        if (headerTitle) {
            navigation.setOptions({ title: headerTitle });
        }
    }, [navigation, headerTitle]);

    const counts = useMemo(() => {
        const total = tasks.length;
        const done = tasks.filter((t) => ['Completed', 'Closed', 'Done'].includes(String(t.status))).length;
        return { total, open: total - done, done };
    }, [tasks]);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listTasks(projectId, { status: undefined, limit: 200 });
            const normalized = (data || [])
                .map((t) => ({
                    id: t.name,
                    subject: t.subject || t.title || t.name,
                    status: t.status || 'Open',
                    progress: Number(t.progress ?? t.percent_complete ?? 0),
                    project: t.project || projectId,
                    exp_start_date: t.exp_start_date,
                    exp_end_date: t.exp_end_date,
                    description: t.description,
                    // display only
                    priority: t.priority,
                }))
                .filter((t) => !!t.id);
            setTasks(normalized);
        } catch (e) {
            console.log('listTasks error', e?.message || e);
            setTasks([]);
            if (projectId) {
                showToast({ type: 'error', text1: 'Could not load tasks', text2: e?.message });
            }
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useFocusEffect(
        React.useCallback(() => {
            load();
            return () => { };
        }, [load])
    );

    const openTask = (t) => {
        navigation.navigate('MyLogsScreen', {
            projectId,
            projectName,
            taskId: t.id,
            taskSubject: t.subject,
            taskProgress: t.progress || 0,
        });
    };

    const onCreate = async () => {
        const subject = title.trim();
        if (!subject || saving) {
            return;
        }
        setSaving(true);
        try {
            await createTask(projectId, subject, description, { priority });
            setTitle('');
            setDescription('');
            setPriority('Medium');
            setCreating(false);
            await load();
        } catch (e) {
            console.log('createTask error', e?.message || e);
            showToast({ type: 'error', text1: 'Task not created', text2: e?.message });
        } finally {
            setSaving(false);
        }
    };

    const closeCreate = () => setCreating(false);

    const renderBody = () => {
        if (loading && tasks.length === 0) {
            return <Loading />;
        }
        if (!projectId) {
            return <EmptyState icon="folder" title="No project selected" message="Open a project from My projects to see its tasks." />;
        }
        if (tasks.length === 0) {
            return <EmptyState icon="check-square" title="No tasks yet" message="Add the first task for this project." />;
        }
        return (
            <>
                <StatStrip
                    style={styles.stats}
                    items={[
                        { label: 'Open', value: counts.open },
                        { label: 'Done', value: counts.done },
                        { label: 'Total', value: counts.total },
                    ]}
                />
                <Group>
                    {tasks.map((item) => (
                        <TaskRow key={item.id} t={item} onOpen={openTask} />
                    ))}
                </Group>
            </>
        );
    };

    return (
        <View style={styles.flex}>
            <Screen footer={projectId ? <Button title="New task" onPress={() => setCreating(true)} /> : null}>
                {renderBody()}
            </Screen>

            <Sheet
                visible={!!creating}
                title="New task"
                subtitle={headerTitle}
                onClose={closeCreate}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeCreate} style={styles.flex} />
                        <Button title="Create" onPress={onCreate} loading={saving} disabled={!title.trim()} style={styles.flex} />
                    </>
                )}
            >
                <TextField label="Title" placeholder="What needs to be done" value={title} onChangeText={setTitle} />
                <TextField
                    label="Description"
                    placeholder="Optional"
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={4}
                />
                <Field label="Priority">
                    <Segmented options={PRIORITIES} value={priority} onChange={setPriority} />
                </Field>
            </Sheet>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    stats: { marginBottom: space.xl },
    metaLine: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: 2 },
    bar: { flex: 1, maxWidth: 160 },
    percent: { ...type.caption, color: color.textSecondary, fontVariant: ['tabular-nums'], minWidth: 32 },
});
