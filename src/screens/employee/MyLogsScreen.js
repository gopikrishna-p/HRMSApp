// src/screens/employee/MyLogsScreen.js
//
// The signed-in employee's work logs (timesheet entries) on a task (hrms.api.my_task_logs).
// The task's progress can be set here; new entries are added from the footer button.
import React, { useState, useCallback, useLayoutEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import showToast from '../../utils/Toast';
import { formatTimeOfDay } from '../../utils/dateFormat';
import { listProjectLogs, startLog, stopLog, updateTask } from '../../services/project.service';
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
    Notice,
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
    const from = formatTimeOfDay(log.from_time);
    const to = formatTimeOfDay(log.to_time);
    return [shortDate(log.from_time), from && to ? `${from} – ${to}` : from].filter(Boolean).join(', ');
};

const hoursLabel = (hours) => {
    const h = Math.round(Number(hours) * 100) / 100;
    return h ? `${h} h` : undefined;
};

const LogRow = ({ log, showTask, onStop }) => {
    const facts = [whenLabel(log), showTask ? log.task : null].filter(Boolean).join('  ·  ');
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
    const [loadError, setLoadError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const [startVisible, setStartVisible] = useState(false);
    const [starting, setStarting] = useState(false);
    const startBusy = useRef(false); // blocks a second Save tap before the re-render disables it
    const [message, setMessage] = useState('');
    const [hours, setHours] = useState('1');

    const [taskProgress, setTaskProgress] = useState(initialProgress || 0);
    const [updatingProgress, setUpdatingProgress] = useState(false);
    const progressBusy = useRef(false);

    const headerTitle = taskSubject || projectName;

    useLayoutEffect(() => {
        if (headerTitle) {
            navigation.setOptions({ title: headerTitle });
        }
    }, [navigation, headerTitle]);

    const onUpdateProgress = async (newProgress) => {
        if (!taskId || progressBusy.current) {
            return;
        }
        progressBusy.current = true;
        setUpdatingProgress(true);
        try {
            const result = await updateTask(taskId, { progress: newProgress });
            // project.service returns null (it does not throw) when the server refuses
            if (!result) {
                throw new Error('Check your connection and try again.');
            }
            setTaskProgress(newProgress);
        } catch (e) {
            console.warn('Update progress error', e);
            showToast({ type: 'error', text1: 'Progress not updated', text2: e?.message });
        } finally {
            progressBusy.current = false;
            setUpdatingProgress(false);
        }
    };

    const fetch = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listProjectLogs(projectId, { task: taskId });
            // project.service returns null (it does not throw) when the request fails; that must
            // not read as "no logs yet"
            if (!Array.isArray(data)) {
                throw new Error('Check your connection and try again.');
            }
            setLogs(data);
            setLoadError(null);
        } catch (e) {
            console.warn('Logs fetch error', e);
            if (projectId) {
                setLoadError(e?.message || 'Check your connection and try again.');
            } else {
                setLogs([]);
            }
        } finally {
            setLoading(false);
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
        if (startBusy.current) {
            return;
        }
        // an empty field still means the default hour; anything typed must be a real number of
        // hours ("0" or "abc" used to become 1 h silently). A decimal comma ("1,5", from a
        // locale's decimal-pad) means 1.5 h, not the 1 h parseFloat would read.
        const typed = String(hours || '').trim().replace(',', '.');
        const hoursValue = typed ? (/^\d+(\.\d+)?$/.test(typed) ? parseFloat(typed) : NaN) : 1;
        if (!(hoursValue > 0)) {
            showToast({ type: 'error', text1: 'Check the hours', text2: 'Enter the hours in digits, e.g. 2.5' });
            return;
        }
        if (hoursValue > 24) {
            showToast({ type: 'error', text1: 'Check the hours', text2: 'One log can be at most 24 hours' });
            return;
        }
        if (!message.trim()) {
            showToast({ type: 'error', text1: 'Add a description', text2: 'Say what you worked on' });
            return;
        }
        startBusy.current = true;
        setStarting(true);
        try {
            const result = await startLog({ project: projectId, task: taskId, message, hours: hoursValue });
            // project.service returns null (it does not throw) when the server refuses
            if (!result) {
                throw new Error('Check your connection and try again.');
            }
            setStartVisible(false);
            setMessage('');
            setHours('1');
            await fetch();
        } catch (e) {
            console.warn('Start log error', e);
            showToast({ type: 'error', text1: 'Log not saved', text2: e?.message });
        } finally {
            startBusy.current = false;
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
                        await fetch();
                    } catch (e) {
                        console.warn('Stop log error', e);
                        showToast({ type: 'error', text1: 'Log not stopped', text2: e?.message });
                    }
                },
            },
        ]);
    };

    const closeStart = () => {
        if (!starting) {
            setStartVisible(false);
        }
    };

    const renderLogs = () => {
        if (loading && !refreshing && logs.length === 0 && !loadError) {
            return <Loading />;
        }
        if (!projectId) {
            return <EmptyState icon="clock" title="No task selected" message="Open a task from My projects to see its work logs." />;
        }
        if (logs.length === 0 && loadError) {
            return <EmptyState icon="alert-circle" title="Could not load logs" message={loadError} action="Try again" onAction={onRefresh} />;
        }
        if (logs.length === 0) {
            return (
                <EmptyState
                    icon="clock"
                    title="No logs yet"
                    message={taskId ? 'Work you log on this task appears here.' : 'Work you log on this project appears here.'}
                />
            );
        }
        return (
            <>
                {loadError ? (
                    <Notice tone="danger" icon="alert-circle" title="Could not refresh">{loadError}</Notice>
                ) : null}
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
            </>
        );
    };

    return (
        <View style={styles.flex}>
            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={taskId ? <Button title="Add log" onPress={() => setStartVisible(true)} /> : null}
            >
                {taskId ? (
                    <Group title="Task">
                        {projectName ? (
                            <Row
                                title="Project"
                                right={<Text style={styles.detailValue} numberOfLines={1}>{projectName}</Text>}
                            />
                        ) : null}
                        <View style={styles.progressBlock}>
                            <View style={styles.progressHeader}>
                                <Text style={type.bodyStrong}>Progress</Text>
                                <Text style={styles.progressValue}>{`${Math.round(Number(taskProgress) || 0)}%`}</Text>
                            </View>
                            <ProgressBar value={taskProgress} tone={taskProgress >= 100 ? 'success' : 'accent'} />
                            <Segmented
                                options={PROGRESS_STEPS}
                                value={taskProgress}
                                onChange={(v) => {
                                    if (!updatingProgress) {
                                        onUpdateProgress(v);
                                    }
                                }}
                                style={[styles.progressControl, updatingProgress && styles.busy]}
                            />
                        </View>
                    </Group>
                ) : null}

                {renderLogs()}
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
                        <Button title="Save" onPress={onStartSubmit} loading={starting} style={styles.flex} />
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
