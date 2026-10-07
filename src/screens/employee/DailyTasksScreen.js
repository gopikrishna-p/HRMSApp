// src/screens/employee/DailyTasksScreen.js
//
// The signed-in employee's daily tasks for one day (hrms.api.get_my_daily_tasks). Open tasks
// can be started, edited or deleted; tasks in progress can be marked complete. New tasks are
// added from the footer button.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Segmented,
    StatStrip,
    StatusText,
    Tag,
    DateNav,
    Sheet,
    Button,
    Field,
    TextField,
    EmptyState,
    Loading,
    color,
    space,
    formatLongDate,
} from '../../components/ds';

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const STATUS_TABS = ['All', 'Open', 'In Progress', 'Completed'];

// task status -> StatusText tone
const STATUS_TONE = { Open: 'warning', 'In Progress': 'info', Completed: 'success', Cancelled: 'neutral' };
// only high and urgent tasks get a tag; low and medium priority is plain secondary text
const PRIORITY_TAG = { High: { label: 'High priority', tone: 'warning' }, Urgent: { label: 'Urgent', tone: 'danger' } };

const statusLabel = (status) => (status === 'In Progress' ? 'In progress' : status);
const toOptions = (values) => values.map((v) => ({ value: v, label: statusLabel(v) }));
// "Took 2 Days" -> "Took 2 days"
const sentenceCase = (text) => (text ? text.charAt(0) + text.slice(1).toLowerCase() : text);
// 2.3456 -> "2.35 h"
const hoursLabel = (hours) => `${Math.round(Number(hours) * 100) / 100} h`;

const DailyTasksScreen = () => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [loadError, setLoadError] = useState(null);
    // each load gets a number; a reply for a date or tab the user has already left is dropped
    const requestId = useRef(0);
    const statusBusy = useRef(false);
    const createBusy = useRef(false);
    const editBusy = useRef(false);
    const deleteBusy = useRef(false);
    const [summary, setSummary] = useState({});
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [activeTab, setActiveTab] = useState('All');

    // Create task sheet
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newPriority, setNewPriority] = useState('Medium');
    const [creating, setCreating] = useState(false);

    // Edit task sheet
    const [showEditModal, setShowEditModal] = useState(false);
    const [editTask, setEditTask] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editPriority, setEditPriority] = useState('Medium');
    const [editRemarks, setEditRemarks] = useState('');
    const [saving, setSaving] = useState(false);

    const formatDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // "today", "yesterday", "tomorrow" or "Tuesday, 6 October"
    const getDisplayDate = (d) => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        if (formatDate(d) === formatDate(today)) {
            return 'today';
        }
        if (formatDate(d) === formatDate(yesterday)) {
            return 'yesterday';
        }
        if (formatDate(d) === formatDate(tomorrow)) {
            return 'tomorrow';
        }
        return formatLongDate(d);
    };

    const fetchTasks = useCallback(async () => {
        const id = ++requestId.current;
        try {
            const dateStr = formatDate(selectedDate);
            const filter = activeTab === 'All' ? null : activeTab;
            const response = await ApiService.getMyDailyTasks(dateStr, filter);
            if (id !== requestId.current) {
                return;
            }
            const result = response?.data?.message;
            if (response?.success && result?.status === 'success' && result.data) {
                setTasks(Array.isArray(result.data.tasks) ? result.data.tasks : []);
                setSummary(result.data.summary || {});
                setLoadError(null);
            } else {
                // a failed load must not read as "no tasks", nor leave another day's tasks on screen;
                // the API wrapper never throws and puts the server's message on response.message
                setTasks([]);
                setSummary({});
                setLoadError(response?.message || result?.message || 'Check your connection and try again.');
            }
        } catch (error) {
            console.error('Fetch tasks error:', error);
            if (id !== requestId.current) {
                return;
            }
            setTasks([]);
            setSummary({});
            setLoadError(error?.message || 'Check your connection and try again.');
        } finally {
            if (id === requestId.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [selectedDate, activeTab]);

    useEffect(() => {
        setLoading(true);
        fetchTasks();
    }, [fetchTasks]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchTasks();
    }, [fetchTasks]);

    const changeDate = (offset) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + offset);
        setSelectedDate(d);
    };

    const handleCreate = async () => {
        if (!newTitle.trim()) {
            showToast({ type: 'error', text1: 'Title is required', text2: 'Enter a task title' });
            return;
        }
        if (createBusy.current) {
            return;
        }
        createBusy.current = true;
        setCreating(true);
        try {
            const response = await ApiService.createDailyTask({
                task_title: newTitle.trim(),
                task_description: newDescription.trim(),
                priority: newPriority,
            });
            if (response?.success && response?.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Task added', text2: response.data.message.message });
                setShowCreateModal(false);
                setNewTitle('');
                setNewDescription('');
                setNewPriority('Medium');
                await fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Task not added', text2: response?.message || response?.data?.message?.message || 'Failed to create task' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Task not added', text2: error?.message || 'Failed to create task' });
        } finally {
            createBusy.current = false;
            setCreating(false);
        }
    };

    const handleStatusChange = async (taskName, newStatus) => {
        // ignore a second tap while the first update is still running
        if (statusBusy.current) {
            return;
        }
        statusBusy.current = true;
        try {
            const response = await ApiService.updateTaskStatus({ task_name: taskName, new_status: newStatus });
            if (response?.success && response?.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Task updated', text2: response.data.message.message });
                // keep the busy flag until the list shows the new status, so the old button
                // can't be tapped again
                await fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Not updated', text2: response?.message || response?.data?.message?.message || 'Update failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Not updated', text2: error?.message || 'Update failed' });
        } finally {
            statusBusy.current = false;
        }
    };

    const openEditModal = (task) => {
        setEditTask(task);
        setEditTitle(task.task_title || '');
        setEditDescription(task.task_description || '');
        setEditPriority(task.priority || 'Medium');
        setEditRemarks(task.remarks || '');
        setShowEditModal(true);
    };

    const handleEdit = async () => {
        if (!editTitle.trim()) {
            showToast({ type: 'error', text1: 'Title is required', text2: 'Enter a task title' });
            return;
        }
        if (editBusy.current || !editTask) {
            return;
        }
        editBusy.current = true;
        setSaving(true);
        try {
            const response = await ApiService.updateDailyTask({
                task_name: editTask.name,
                task_title: editTitle.trim(),
                task_description: editDescription.trim(),
                priority: editPriority,
                remarks: editRemarks.trim(),
            });
            if (response?.success && response?.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Task updated' });
                setShowEditModal(false);
                setEditTask(null);
                await fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Not updated', text2: response?.message || response?.data?.message?.message || 'Update failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Not updated', text2: error?.message || 'Update failed' });
        } finally {
            editBusy.current = false;
            setSaving(false);
        }
    };

    const handleDelete = async (taskName) => {
        if (deleteBusy.current) {
            return;
        }
        deleteBusy.current = true;
        try {
            const response = await ApiService.deleteDailyTask(taskName);
            if (response?.success && response?.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Task deleted' });
                await fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Not deleted', text2: response?.message || response?.data?.message?.message || 'Delete failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Not deleted', text2: error?.message || 'Delete failed' });
        } finally {
            deleteBusy.current = false;
        }
    };

    // delete lives in the edit sheet, which only opens for open tasks (the same tasks the
    // delete button used to be shown for)
    const deleteFromSheet = () => {
        const taskName = editTask?.name;
        if (!taskName) {
            return;
        }
        Alert.alert('Delete this task?', editTask?.task_title || '', [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                    setShowEditModal(false);
                    handleDelete(taskName);
                },
            },
        ]);
    };

    // ------------------------------------------------------------------ list

    const renderTaskRow = (item) => {
        const isOpen = item.status === 'Open';
        const isInProgress = item.status === 'In Progress';
        const isCompleted = item.status === 'Completed';
        const canEdit = isOpen; // Only Open tasks can be edited

        const priorityTag = PRIORITY_TAG[item.priority];
        const facts = [
            priorityTag ? null : item.priority ? `${item.priority} priority` : null,
            item.assigned_by_name ? `From ${item.assigned_by_name}` : null,
            isCompleted && Number(item.time_taken_hours) > 0 ? hoursLabel(item.time_taken_hours) : null,
            isCompleted ? sentenceCase(item.completion_label) : null,
        ].filter(Boolean).join('  ·  ');
        const subtitle = [item.task_description, facts].filter(Boolean).join('\n');

        const meta = [
            <StatusText key="s" label={statusLabel(item.status)} tone={STATUS_TONE[item.status]} />,
            priorityTag ? <Tag key="p" label={priorityTag.label} tone={priorityTag.tone} /> : null,
            item.carry_forward_count > 0 ? (
                <Tag
                    key="cf"
                    label={item.carry_forward_count === 1 ? 'Carried forward' : `Carried forward ${item.carry_forward_count} times`}
                    tone="warning"
                />
            ) : null,
        ].filter(Boolean);

        let action = null;
        if (isOpen) {
            action = (
                <Button
                    title="Start"
                    variant="secondary"
                    size="sm"
                    onPress={() => handleStatusChange(item.name, 'In Progress')}
                    style={styles.rowAction}
                />
            );
        } else if (isInProgress) {
            action = (
                <Button
                    title="Complete"
                    variant="secondary"
                    size="sm"
                    onPress={() => handleStatusChange(item.name, 'Completed')}
                    style={styles.rowAction}
                />
            );
        }

        return (
            <Row
                key={item.name}
                title={item.task_title}
                titleLines={2}
                subtitle={subtitle || undefined}
                subtitleLines={3}
                meta={meta}
                right={action}
                chevron={false}
                onPress={canEdit ? () => openEditModal(item) : undefined}
            />
        );
    };

    const renderBody = () => {
        if (loading) {
            return <Loading />;
        }
        if (loadError) {
            return <EmptyState icon="alert-circle" title="Could not load tasks" message={loadError} action="Try again" onAction={onRefresh} />;
        }
        if (tasks.length === 0) {
            const which = activeTab === 'All' ? '' : `${statusLabel(activeTab).toLowerCase()} `;
            return <EmptyState icon="check-square" title="No tasks" message={`No ${which}tasks for ${getDisplayDate(selectedDate)}.`} />;
        }
        return (
            <>
                <StatStrip
                    style={styles.strip}
                    items={[
                        { label: 'Total', value: summary.total || 0 },
                        { label: 'In progress', value: summary.in_progress || 0 },
                        { label: 'Done', value: summary.completed || 0 },
                        { label: 'Carried', value: summary.carried_forward || 0 },
                    ]}
                />
                <Group>
                    {tasks.map(renderTaskRow)}
                </Group>
            </>
        );
    };

    // ------------------------------------------------------------------ sheets

    // the server always adds new tasks to today's list, whichever day is on screen
    const viewingToday = formatDate(selectedDate) === formatDate(new Date());

    const renderCreateSheet = () => (
        <Sheet
            visible={showCreateModal}
            title="New task"
            subtitle={viewingToday ? undefined : "Goes on today's list"}
            onClose={() => !creating && setShowCreateModal(false)}
            dismissable={!creating}
            footer={(
                <>
                    <Button title="Cancel" variant="secondary" onPress={() => setShowCreateModal(false)} disabled={creating} style={styles.flex} />
                    <Button title="Add task" onPress={handleCreate} loading={creating} style={styles.flex} />
                </>
            )}
        >
            <TextField
                label="Title"
                placeholder="What needs to be done"
                value={newTitle}
                onChangeText={setNewTitle}
                maxLength={140}
            />
            <TextField
                label="Description"
                placeholder="Optional"
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
                numberOfLines={3}
                maxLength={500}
            />
            <Field label="Priority">
                <Segmented options={PRIORITIES} value={newPriority} onChange={setNewPriority} />
            </Field>
        </Sheet>
    );

    const renderEditSheet = () => (
        <Sheet
            visible={showEditModal}
            title="Edit task"
            onClose={() => !saving && setShowEditModal(false)}
            dismissable={!saving}
            footer={(
                <>
                    <Button title="Cancel" variant="secondary" onPress={() => setShowEditModal(false)} disabled={saving} style={styles.flex} />
                    <Button title="Save" onPress={handleEdit} loading={saving} style={styles.flex} />
                </>
            )}
        >
            <TextField label="Title" value={editTitle} onChangeText={setEditTitle} maxLength={140} />
            <TextField
                label="Description"
                placeholder="Optional"
                value={editDescription}
                onChangeText={setEditDescription}
                multiline
                numberOfLines={3}
                maxLength={500}
            />
            <Field label="Priority">
                <Segmented options={PRIORITIES} value={editPriority} onChange={setEditPriority} />
            </Field>
            <TextField
                label="Remarks"
                placeholder="Optional"
                value={editRemarks}
                onChangeText={setEditRemarks}
                multiline
                numberOfLines={2}
                maxLength={500}
            />
            <Group style={styles.deleteGroup}>
                <Row icon="trash-2" title="Delete task" destructive chevron={false} disabled={saving} onPress={deleteFromSheet} />
            </Group>
        </Sheet>
    );

    return (
        <View style={styles.container}>
            <DateNav
                date={selectedDate}
                onPrev={() => changeDate(-1)}
                onNext={() => changeDate(1)}
                onPick={() => setSelectedDate(new Date())}
            />

            <View style={styles.toolbar}>
                <Segmented value={activeTab} onChange={setActiveTab} options={toOptions(STATUS_TABS)} />
            </View>

            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={<Button title="Add task" onPress={() => setShowCreateModal(true)} />}
            >
                {renderBody()}
            </Screen>

            {renderCreateSheet()}
            {renderEditSheet()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: color.bg },
    flex: { flex: 1 },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    strip: { marginBottom: space.xl },
    rowAction: { marginLeft: space.sm },
    deleteGroup: { marginTop: space.xs, marginBottom: 0 },
});

export default DailyTasksScreen;
