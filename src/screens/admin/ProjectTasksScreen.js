// src/screens/admin/ProjectTasksScreen.js
//
// Tasks of one project (hrms.api.admin_tasks). Tapping a task opens its work logs; new tasks
// are created from the sheet behind the footer button.
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import showToast from '../../utils/Toast';
import { adminListTasks, createTask, getProjectDetail } from '../../services/project.service';
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

const TaskRow = ({ task, onPress }) => {
    const status = task.status || 'Open';
    const progress = Number(task.progress || 0);
    const due = shortDate(task.exp_end_date);
    const subtitle = [task.priority ? `${task.priority} priority` : null, due ? `Due ${due}` : null].filter(Boolean).join('  ·  ');

    return (
        <Row
            title={task.subject}
            titleLines={2}
            subtitle={subtitle || undefined}
            meta={(
                <View style={styles.metaLine}>
                    <View style={styles.bar}>
                        <ProgressBar value={progress} tone={taskTone(status) === 'success' ? 'success' : 'accent'} />
                    </View>
                    <Text style={styles.percent}>{Math.round(progress)}%</Text>
                </View>
            )}
            right={<StatusText label={status} tone={taskTone(status)} />}
            onPress={onPress}
        />
    );
};

const ProjectTasksScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { projectId, projectName } = route.params || {};
    const [detail, setDetail] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [newVisible, setNewVisible] = useState(false);
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [saving, setSaving] = useState(false);

    const headerTitle = projectName || detail?.project?.project_name || 'Project';

    useLayoutEffect(() => {
        navigation.setOptions({ title: headerTitle });
    }, [navigation, headerTitle]);

    const counts = useMemo(() => {
        const total = tasks.length;
        const done = tasks.filter((t) => ['Completed', 'Closed', 'Done'].includes(String(t.status))).length;
        const open = total - done;
        return { total, open, done };
    }, [tasks]);

    const fetch = useCallback(async () => {
        setLoading(true);
        try {
            const [d, t] = await Promise.all([getProjectDetail(projectId), adminListTasks(projectId)]);
            setDetail(d);
            setTasks(Array.isArray(t) ? t : []);
        } catch (e) {
            console.warn('Project tasks fetch error', e);
            setTasks([]);
            showToast({ type: 'error', text1: 'Could not load tasks', text2: e?.message });
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useFocusEffect(
        useCallback(() => {
            fetch();
        }, [fetch])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await fetch();
        } finally {
            setRefreshing(false);
        }
    };

    const addTask = async () => {
        if (!title.trim()) {
            return;
        }
        setSaving(true);
        try {
            await createTask(projectId, title.trim(), desc.trim(), { priority });
            setNewVisible(false);
            setTitle('');
            setDesc('');
            setPriority('Medium');
            fetch();
        } catch (e) {
            console.warn('Task create error', e);
            showToast({ type: 'error', text1: 'Task not created', text2: e?.message });
        } finally {
            setSaving(false);
        }
    };

    const openTask = (item) =>
        navigation.navigate('ProjectLogsScreen', {
            projectId,
            projectName: detail?.project?.project_name || projectName,
            taskId: item.name,
            taskSubject: item.subject,
            taskProgress: item.progress || 0,
        });

    return (
        <View style={styles.flex}>
            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={<Button title="New task" onPress={() => setNewVisible(true)} />}
            >
                {loading && !refreshing && tasks.length === 0 ? (
                    <Loading />
                ) : tasks.length === 0 ? (
                    <EmptyState icon="check-square" title="No tasks yet" message="Add the first task for this project." />
                ) : (
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
                                <TaskRow key={item.name} task={item} onPress={() => openTask(item)} />
                            ))}
                        </Group>
                    </>
                )}
            </Screen>

            <Sheet
                visible={newVisible}
                title="New task"
                subtitle={headerTitle}
                onClose={() => setNewVisible(false)}
                dismissable={!saving}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={() => setNewVisible(false)} disabled={saving} style={styles.flex} />
                        <Button title="Create" onPress={addTask} loading={saving} disabled={!title.trim()} style={styles.flex} />
                    </>
                )}
            >
                <TextField label="Title" placeholder="What needs to be done" value={title} onChangeText={setTitle} />
                <TextField
                    label="Description"
                    placeholder="Optional"
                    value={desc}
                    onChangeText={setDesc}
                    multiline
                    numberOfLines={4}
                />
                <Field label="Priority">
                    <Segmented options={PRIORITIES} value={priority} onChange={setPriority} />
                </Field>
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    stats: { marginBottom: space.xl },
    metaLine: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: 2 },
    bar: { flex: 1, maxWidth: 160 },
    percent: { ...type.caption, color: color.textSecondary, fontVariant: ['tabular-nums'], minWidth: 32 },
});

export default ProjectTasksScreen;
