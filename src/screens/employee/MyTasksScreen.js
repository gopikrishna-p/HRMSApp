// src/screens/employee/MyTasksScreen.js
//
// Tasks of one project (hrms.api.my_tasks). Tapping a task opens its work logs; new tasks
// are created from the sheet behind the footer button.
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
    Notice,
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

// "Pending Review" -> "Pending review"
const statusLabel = (status) => {
    const text = String(status || '');
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

// Status sits on the meta line with the progress bar (as on My projects), so a long status
// such as "Pending review" never squeezes a two-line task title on a narrow phone.
const TaskRow = ({ t, onOpen }) => {
    const progress = Number(t.progress) || 0;
    const due = shortDate(t.exp_end_date);
    const subtitle = [t.priority ? `${t.priority} priority` : null, due ? `Due ${due}` : null].filter(Boolean).join('  ·  ');

    return (
        <Row
            title={t.subject}
            titleLines={2}
            subtitle={subtitle || undefined}
            meta={(
                <View style={styles.metaLine}>
                    <StatusText label={statusLabel(t.status)} tone={taskTone(t.status)} />
                    <View style={styles.barGroup}>
                        <View style={styles.bar}>
                            <ProgressBar value={progress} tone={taskTone(t.status) === 'success' ? 'success' : 'accent'} />
                        </View>
                        <Text style={styles.percent} numberOfLines={1}>{`${Math.round(progress)}%`}</Text>
                    </View>
                </View>
            )}
            onPress={() => onOpen(t)}
        />
    );
};

export default function MyTasksScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    const { projectId, projectName } = route.params || {};
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const saveBusy = useRef(false); // blocks a second Create tap before the re-render disables it
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
            // project.service returns null (it does not throw) when the request fails; that must
            // not read as "no tasks yet"
            if (!Array.isArray(data)) {
                throw new Error('Check your connection and try again.');
            }
            const normalized = data
                .map((t) => ({
                    id: t.name,
                    subject: t.subject || t.title || t.name,
                    status: t.status || 'Open',
                    progress: Number(t.progress ?? t.percent_complete ?? 0) || 0,
                    project: t.project || projectId,
                    exp_start_date: t.exp_start_date,
                    exp_end_date: t.exp_end_date,
                    description: t.description,
                    // display only
                    priority: t.priority,
                }))
                .filter((t) => !!t.id);
            setTasks(normalized);
            setLoadError(null);
        } catch (e) {
            console.log('listTasks error', e?.message || e);
            if (projectId) {
                setLoadError(e?.message || 'Check your connection and try again.');
            } else {
                setTasks([]);
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

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

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
        if (!subject || saveBusy.current) {
            return;
        }
        saveBusy.current = true;
        setSaving(true);
        try {
            const created = await createTask(projectId, subject, description, { priority });
            // project.service returns null (it does not throw) when the server refuses
            if (!created) {
                throw new Error('The task was not saved. Check your connection and try again.');
            }
            showToast({ type: 'success', text1: 'Task created' });
            setTitle('');
            setDescription('');
            setPriority('Medium');
            setCreating(false);
            await load();
        } catch (e) {
            console.log('createTask error', e?.message || e);
            showToast({ type: 'error', text1: 'Task not created', text2: e?.message });
        } finally {
            saveBusy.current = false;
            setSaving(false);
        }
    };

    const closeCreate = () => {
        if (!saving) {
            setCreating(false);
        }
    };

    const renderBody = () => {
        if (loading && !refreshing && tasks.length === 0 && !loadError) {
            return <Loading />;
        }
        if (!projectId) {
            return <EmptyState icon="folder" title="No project selected" message="Open a project from My projects to see its tasks." />;
        }
        if (tasks.length === 0) {
            if (loadError) {
                return <EmptyState icon="alert-circle" title="Could not load tasks" message={loadError} action="Try again" onAction={onRefresh} />;
            }
            return <EmptyState icon="check-square" title="No tasks yet" message="Add the first task for this project." />;
        }
        return (
            <>
                {loadError ? (
                    <Notice tone="danger" icon="alert-circle" title="Could not refresh">{loadError}</Notice>
                ) : null}
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
            <Screen
                refreshing={refreshing}
                onRefresh={projectId ? onRefresh : undefined}
                footer={projectId ? <Button title="New task" onPress={() => setCreating(true)} /> : null}
            >
                {renderBody()}
            </Screen>

            <Sheet
                visible={!!creating}
                title="New task"
                subtitle={headerTitle}
                onClose={closeCreate}
                dismissable={!saving}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeCreate} disabled={saving} style={styles.flex} />
                        <Button title="Create" onPress={onCreate} loading={saving} disabled={!title.trim()} style={styles.flex} />
                    </>
                )}
            >
                <TextField label="Title" placeholder="What needs to be done" value={title} onChangeText={setTitle} maxLength={140} />
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
    // the bar and its percent move under the status together when a long status and 1.3x text
    // leave them no room
    metaLine: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: space.xs, marginTop: 2 },
    barGroup: { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', gap: space.md },
    bar: { flex: 1, maxWidth: 160 },
    percent: { ...type.caption, color: color.textSecondary, fontVariant: ['tabular-nums'], minWidth: 32 },
});
