// src/screens/admin/ProjectLogsScreen.js
//
// Work logs (timesheet entries) of a project, or of one task when opened from the task list.
// For a task, its progress can be set here; new entries are added from the footer button.
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import showToast from '../../utils/Toast';
import { formatTimeOfDay } from '../../utils/dateFormat';
import { adminListProjectLogs, startLog, stopLog, updateTask } from '../../services/project.service';
import {
    Screen,
    Group,
    Row,
    StatusText,
    ProgressBar,
    Segmented,
    Sheet,
    Button,
    TextField,
    EmptyState,
    Loading,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PROGRESS_STEPS = [0, 25, 50, 75, 100].map((v) => ({ value: v, label: `${v}%` }));
const LOG_TONE = { 'In Progress': 'info', Paused: 'warning' };

// 'YYYY-MM-DD[ HH:MM:SS]' -> '12 Oct' (or '12 Oct 2027' outside the current year)
const shortDate = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) {
        return null;
    }
    return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
};

// '12 Oct, 10:00 AM – 12:30 PM'
const whenLabel = (log) => {
    const start = log.log_time || log.from_time;
    const from = formatTimeOfDay(start);
    const to = formatTimeOfDay(log.to_time);
    return [shortDate(start), from && to ? `${from} – ${to}` : from].filter(Boolean).join(', ');
};

const hoursLabel = (hours) => {
    const h = Math.round(Number(hours) * 100) / 100;
    return h ? `${h} h` : undefined;
};

const LogRow = ({ log, showTask, onStop }) => {
    const facts = [whenLabel(log), log.employee_name || log.employee, showTask ? log.task_subject || log.task : null].filter(Boolean).join('  ·  ');
    return (
        <Row
            title={log.description || 'Work log'}
            titleLines={3}
            subtitle={[facts, log.message].filter(Boolean).join('\n') || undefined}
            subtitleLines={3}
            meta={log.status ? <StatusText label={log.status} tone={LOG_TONE[log.status]} /> : null}
            value={log.hours ? hoursLabel(log.hours) : undefined}
            right={onStop ? <Button title="Stop" variant="danger" size="sm" onPress={onStop} style={styles.stop} /> : null}
        />
    );
};

const ProjectLogsScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { projectId, projectName, taskId, taskSubject, taskProgress: initialProgress } = route.params || {};
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [startVisible, setStartVisible] = useState(false);
    const [starting, setStarting] = useState(false);
    const [message, setMessage] = useState('');
    const [hours, setHours] = useState('1');

    const [taskProgress, setTaskProgress] = useState(Number(initialProgress) || 0);
    const [updatingProgress, setUpdatingProgress] = useState(false);
    const [error, setError] = useState(null);
    // blocks a second save / progress change before the controls re-render as busy
    const busy = useRef(false);
    const progressBusy = useRef(false);
    const loadRequest = useRef(0);

    const headerTitle = taskSubject || projectName || 'Logs';

    useLayoutEffect(() => {
        navigation.setOptions({ title: headerTitle });
    }, [navigation, headerTitle]);

    const onUpdateProgress = async (newProgress) => {
        if (!taskId || progressBusy.current || newProgress === taskProgress) {
            return;
        }
        progressBusy.current = true;
        setUpdatingProgress(true);
        try {
            // project.service returns null (it does not throw) when the server call fails
            const res = await updateTask(taskId, { progress: newProgress });
            if (!res) {
                throw new Error('The server did not accept the change. Try again.');
            }
            setTaskProgress(newProgress);
        } catch (e) {
            console.warn('Update progress error', e);
            showToast({ type: 'error', text1: 'Progress not updated', text2: e?.message || 'Try again' });
        } finally {
            progressBusy.current = false;
            setUpdatingProgress(false);
        }
    };

    const fetch = useCallback(async () => {
        const requestId = ++loadRequest.current;
        setLoading(true);
        try {
            // admin view: every employee's logs, not only the signed-in user's
            const data = await adminListProjectLogs(projectId, { task: taskId });
            if (requestId !== loadRequest.current) {
                return;
            }
            // project.service returns null (it does not throw) when the server call fails
            if (Array.isArray(data)) {
                setLogs(data);
                setError(null);
            } else {
                setLogs([]);
                setError('Could not load logs. Pull down to try again.');
            }
        } catch (e) {
            console.warn('Logs fetch error', e);
            if (requestId === loadRequest.current) {
                setLogs([]);
                setError(e?.message || 'Could not load logs. Pull down to try again.');
            }
        } finally {
            if (requestId === loadRequest.current) {
                setLoading(false);
            }
        }
    }, [projectId, taskId]);

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

    const onStartSubmit = async () => {
        if (busy.current) {
            return;
        }
        const hoursValue = String(hours).trim() ? parseFloat(String(hours).replace(',', '.')) : 1;
        if (!(hoursValue > 0)) {
            showToast({ type: 'error', text1: 'Check the hours', text2: 'Enter a number of hours greater than 0' });
            return;
        }
        if (!message.trim()) {
            showToast({ type: 'error', text1: 'Description is required', text2: 'Describe the work done' });
            return;
        }
        busy.current = true;
        setStarting(true);
        try {
            // project.service returns null (it does not throw) when the server call fails
            const res = await startLog({ project: projectId, task: taskId, message, hours: hoursValue });
            if (!res) {
                throw new Error('The server did not accept the log. Try again.');
            }
            setStartVisible(false);
            setMessage('');
            setHours('1');
            fetch();
        } catch (e) {
            console.warn('Start log error', e);
            showToast({ type: 'error', text1: 'Log not saved', text2: e?.message || 'Try again' });
        } finally {
            busy.current = false;
            setStarting(false);
        }
    };

    const onStop = async (log) => {
        Alert.alert('Stop log', 'Mark this log as completed?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Stop',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await stopLog({ log_name: log.name, message: '' });
                        fetch();
                    } catch (e) {
                        console.warn('Stop log error', e);
                        showToast({ type: 'error', text1: 'Log not stopped', text2: e?.message });
                    }
                },
            },
        ]);
    };

    const closeStart = () => !starting && setStartVisible(false);

    return (
        <View style={styles.flex}>
            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                // a log is always added to a task (add_task_log needs one)
                footer={taskId ? <Button title="Add log" onPress={() => setStartVisible(true)} /> : null}
            >
                {taskId ? (
                    <Group title="Task">
                        {projectName ? (
                            <Row
                                title="Project"
                                right={<Text style={styles.detailValue} numberOfLines={2}>{projectName}</Text>}
                            />
                        ) : null}
                        <View style={styles.progressBlock}>
                            <View style={styles.progressHeader}>
                                <Text style={type.bodyStrong}>Progress</Text>
                                <Text style={styles.progressValue} numberOfLines={1}>{`${Math.round(taskProgress)}%`}</Text>
                            </View>
                            <ProgressBar value={taskProgress} tone={taskProgress >= 100 ? 'success' : 'accent'} />
                            <Segmented
                                options={PROGRESS_STEPS}
                                value={taskProgress}
                                onChange={onUpdateProgress}
                                style={[styles.progressControl, updatingProgress && styles.busy]}
                            />
                        </View>
                    </Group>
                ) : null}

                {loading && !refreshing && logs.length === 0 ? (
                    <Loading />
                ) : error && logs.length === 0 ? (
                    <EmptyState icon="alert-circle" title="Could not load logs" message={error} action="Try again" onAction={fetch} />
                ) : logs.length === 0 ? (
                    <EmptyState
                        icon="clock"
                        title="No logs yet"
                        message={taskId ? 'Work logged on this task appears here.' : 'Work logged on this project appears here.'}
                    />
                ) : (
                    <Group title={`${logs.length} ${logs.length === 1 ? 'log' : 'logs'}`}>
                        {logs.map((item) => (
                            <LogRow
                                key={item.log_id || `${item.timesheet}_${item.from_time}`}
                                log={item}
                                showTask={!taskId}
                                onStop={item.status === 'In Progress' ? () => onStop(item) : undefined}
                            />
                        ))}
                    </Group>
                )}
            </Screen>

            <Sheet
                visible={startVisible}
                title="Add work log"
                subtitle={taskSubject || projectName}
                onClose={closeStart}
                dismissable={!starting}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeStart} disabled={starting} style={styles.flex} />
                        <Button title="Save" onPress={onStartSubmit} loading={starting} disabled={!message.trim()} style={styles.flex} />
                    </>
                )}
            >
                <TextField
                    label="Hours"
                    placeholder="e.g. 2.5"
                    value={hours}
                    onChangeText={setHours}
                    keyboardType="decimal-pad"
                />
                <TextField
                    label="Description"
                    placeholder="What did you work on?"
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    numberOfLines={4}
                />
            </Sheet>
        </View>
    );
};

export default ProjectLogsScreen;

const styles = StyleSheet.create({
    flex: { flex: 1 },
    detailValue: { ...type.body, color: color.textSecondary, flexShrink: 1, maxWidth: '65%', textAlign: 'right' },
    progressBlock: { paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: color.surface },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm },
    progressValue: { fontSize: 15, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    progressControl: { marginTop: space.md },
    busy: { opacity: 0.5 },
    stop: { marginLeft: space.sm },
});
