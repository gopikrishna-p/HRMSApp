// src/screens/admin/AdminDailyTasksScreen.js
//
// Everyone's daily tasks for one day, grouped by employee (hrms.api.admin_get_all_tasks).
// Admins can edit any task, assign a task to one or more employees, add a task to their
// own list, and see weekly or monthly task analytics.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    StatStrip,
    StatusText,
    Tag,
    DateNav,
    Sheet,
    Button,
    IconButton,
    SearchField,
    Field,
    TextField,
    SelectField,
    EmptyState,
    Loading,
    Icon,
    color,
    space,
    radius,
    type,
    formatLongDate,
    TopInset,
} from '../../components/ds';

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const STATUS_OPTIONS = ['Open', 'In Progress', 'Completed', 'Cancelled'];
const FILTER_TABS = ['All', 'Open', 'In Progress', 'Completed'];

// task status -> StatusText tone
const STATUS_TONE = { Open: 'warning', 'In Progress': 'info', Completed: 'success', Cancelled: 'neutral' };
// only high and urgent tasks get a tag; low and medium priority is plain secondary text
const PRIORITY_TAG = { High: { label: 'High priority', tone: 'warning' }, Urgent: { label: 'Urgent', tone: 'danger' } };

const statusLabel = (status) => (status === 'In Progress' ? 'In progress' : status);
const toOptions = (values) => values.map((v) => ({ value: v, label: statusLabel(v) }));
const shortDept = (dept) => (dept || '').replace(' - DG', '');
// "Took 2 Days" -> "Took 2 days"
const sentenceCase = (text) => (text ? text.charAt(0) + text.slice(1).toLowerCase() : text);
const ANALYTICS_PERIODS = [
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
];

const AdminDailyTasksScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [employeeGroups, setEmployeeGroups] = useState([]);
    const [summary, setSummary] = useState({});
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [activeTab, setActiveTab] = useState('All');
    const [expandedEmps, setExpandedEmps] = useState({});

    // Analytics
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [analytics, setAnalytics] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [analyticsPeriod, setAnalyticsPeriod] = useState('week');

    // Edit sheet
    const [showEditModal, setShowEditModal] = useState(false);
    const [editTask, setEditTask] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editPriority, setEditPriority] = useState('Medium');
    const [editStatus, setEditStatus] = useState('Open');
    const [editRemarks, setEditRemarks] = useState('');
    const [saving, setSaving] = useState(false);

    // Assign sheet
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignStep, setAssignStep] = useState('form'); // 'form' | 'employees'
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [assignTitle, setAssignTitle] = useState('');
    const [assignDesc, setAssignDesc] = useState('');
    const [assignPriority, setAssignPriority] = useState('Medium');
    const [assigning, setAssigning] = useState(false);
    const [employeeList, setEmployeeList] = useState([]);
    const [empSearch, setEmpSearch] = useState('');
    const [empLoading, setEmpLoading] = useState(false);

    // Own task sheet
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newPriority, setNewPriority] = useState('Medium');
    const [creating, setCreating] = useState(false);

    const formatDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // "today", "yesterday", "tomorrow" or "Tuesday, 6 October"
    const getDisplayDate = (d) => {
        const today = new Date();
        if (formatDate(d) === formatDate(today)) {
            return 'today';
        }
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (formatDate(d) === formatDate(yesterday)) {
            return 'yesterday';
        }
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        if (formatDate(d) === formatDate(tomorrow)) {
            return 'tomorrow';
        }
        return formatLongDate(d);
    };

    const fetchTasks = useCallback(async () => {
        try {
            const dateStr = formatDate(selectedDate);
            const filter = activeTab === 'All' ? null : activeTab;
            const response = await ApiService.adminGetAllTasks(dateStr, null, null, filter);
            if (response?.success && response?.data?.message?.status === 'success') {
                const result = response.data.message.data;
                setEmployeeGroups(result.employee_groups || []);
                setSummary(result.summary || {});
                const expanded = {};
                (result.employee_groups || []).forEach(g => { expanded[g.employee] = true; });
                setExpandedEmps(expanded);
            } else {
                setEmployeeGroups([]);
                setSummary({});
            }
        } catch (error) {
            console.error('Admin fetch tasks error:', error);
            setEmployeeGroups([]);
            setSummary({});
            showToast({ type: 'error', text1: 'Could not load tasks', text2: error?.message || 'Check your connection and try again' });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedDate, activeTab]);

    const fetchAnalytics = useCallback(async () => {
        setAnalyticsLoading(true);
        try {
            const response = await ApiService.adminGetTaskAnalytics(analyticsPeriod);
            if (response?.success && response?.data?.message?.status === 'success') {
                setAnalytics(response.data.message.data);
            }
        } catch (error) {
            console.error('Analytics error:', error);
        } finally {
            setAnalyticsLoading(false);
        }
    }, [analyticsPeriod]);

    const fetchEmployees = async () => {
        setEmpLoading(true);
        try {
            const response = await ApiService.getAllEmployees();
            if (response?.success && response?.data?.message) {
                const data = response.data.message;
                // get_all_employees returns { status, employees: [...] }
                const emps = data.employees || data || [];
                setEmployeeList(Array.isArray(emps) ? emps : []);
            }
        } catch (err) {
            console.error('Fetch employees error:', err);
        } finally {
            setEmpLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchTasks();
    }, [fetchTasks]);
    useEffect(() => {
        if (showAnalytics) {
            fetchAnalytics();
        }
    }, [showAnalytics, fetchAnalytics]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchTasks();
    }, [fetchTasks]);
    const changeDate = (offset) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + offset);
        setSelectedDate(d);
    };
    const toggleExpand = (empId) => {
        setExpandedEmps(prev => ({ ...prev, [empId]: !prev[empId] }));
    };

    const openEditModal = (task) => {
        setEditTask(task);
        setEditTitle(task.task_title);
        setEditDescription(task.task_description || '');
        setEditPriority(task.priority);
        setEditStatus(task.status);
        setEditRemarks(task.remarks || '');
        setShowEditModal(true);
    };

    const handleEdit = async () => {
        if (!editTitle.trim()) {
            showToast({ type: 'error', text1: 'Title is required', text2: 'Enter a task title' });
            return;
        }
        setSaving(true);
        try {
            const response = await ApiService.adminUpdateTask({
                task_name: editTask.name,
                task_title: editTitle.trim(),
                task_description: editDescription.trim(),
                priority: editPriority,
                status: editStatus,
                remarks: editRemarks.trim(),
            });
            if (response?.success && response?.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Task updated' });
                setShowEditModal(false);
                fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Not updated', text2: response?.data?.message?.message || 'Update failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Not updated', text2: 'Update failed' });
        } finally {
            setSaving(false);
        }
    };

    const toggleEmployee = (empId) => {
        setSelectedEmployees(prev =>
            prev.includes(empId) ? prev.filter(e => e !== empId) : [...prev, empId]
        );
    };

    const handleAssign = async () => {
        if (selectedEmployees.length === 0 || !assignTitle.trim()) {
            showToast({ type: 'error', text1: 'Missing details', text2: 'Select employees and enter a title' });
            return;
        }
        setAssigning(true);
        try {
            const response = await ApiService.adminAssignTask({
                employees: selectedEmployees,
                task_title: assignTitle.trim(),
                task_description: assignDesc.trim(),
                priority: assignPriority,
            });
            if (response?.success && response?.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Task assigned', text2: response.data.message.message });
                setShowAssignModal(false);
                setSelectedEmployees([]);
                setAssignTitle('');
                setAssignDesc('');
                setAssignPriority('Medium');
                setEmpSearch('');
                fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Not assigned', text2: response?.data?.message?.message || 'Assign failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Not assigned', text2: 'Assign failed' });
        } finally {
            setAssigning(false);
        }
    };

    const handleCreateOwnTask = async () => {
        if (!newTitle.trim()) {
            showToast({ type: 'error', text1: 'Title is required', text2: 'Enter a task title' });
            return;
        }
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
                fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Not added', text2: response?.data?.message?.message || 'Failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Not added', text2: 'Failed to create task' });
        } finally {
            setCreating(false);
        }
    };

    const openAssign = () => {
        fetchEmployees();
        setShowAssignModal(true);
    };

    const closeAssign = () => {
        setShowAssignModal(false);
        setEmpSearch('');
        setAssignStep('form');
    };

    // ------------------------------------------------------------------ list

    const renderTaskRow = (task) => {
        const priorityTag = PRIORITY_TAG[task.priority];
        const tags = [
            priorityTag && <Tag key="p" label={priorityTag.label} tone={priorityTag.tone} />,
            task.carry_forward_count > 0 && (
                <Tag
                    key="cf"
                    label={task.carry_forward_count === 1 ? 'Carried forward' : `Carried forward ${task.carry_forward_count} times`}
                    tone="warning"
                />
            ),
        ].filter(Boolean);
        const subtitle = [
            priorityTag ? null : task.priority ? `${task.priority} priority` : null,
            task.time_taken_hours > 0 ? `${task.time_taken_hours}h` : null,
            sentenceCase(task.completion_label),
        ].filter(Boolean).join('  ·  ');
        return (
            <Row
                key={task.name}
                left={<View style={styles.taskIndent} />}
                title={task.task_title}
                titleLines={2}
                subtitle={subtitle || undefined}
                meta={tags.length ? tags : null}
                right={<StatusText label={statusLabel(task.status)} tone={STATUS_TONE[task.status]} />}
                onPress={() => openEditModal(task)}
            />
        );
    };

    const renderEmployeeGroup = (group) => {
        const isExpanded = expandedEmps[group.employee];
        const allDone = group.total > 0 && group.completed === group.total;
        return (
            <Group key={group.employee} style={styles.employeeGroup}>
                <Row
                    left={<Avatar name={group.employee_name} />}
                    title={group.employee_name}
                    subtitle={shortDept(group.department) || 'No department'}
                    chevron={false}
                    onPress={() => toggleExpand(group.employee)}
                    right={(
                        <View style={styles.groupRight}>
                            <Text style={[styles.groupCount, allDone && styles.groupCountDone]}>{`${group.completed}/${group.total}`}</Text>
                            <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={color.textTertiary} />
                        </View>
                    )}
                />
                {isExpanded ? (group.tasks || []).map(renderTaskRow) : null}
            </Group>
        );
    };

    const renderBody = () => {
        if (loading) {
            return <Loading />;
        }
        if (employeeGroups.length === 0) {
            const which = activeTab === 'All' ? '' : `${statusLabel(activeTab).toLowerCase()} `;
            return <EmptyState icon="check-square" title="No tasks" message={`No ${which}tasks for ${getDisplayDate(selectedDate)}.`} />;
        }
        return (
            <>
                <StatStrip
                    style={styles.strip}
                    items={[
                        { label: 'Tasks', value: summary.total_tasks || 0 },
                        { label: 'Completed', value: summary.completed || 0 },
                        { label: 'Pending', value: summary.pending || 0 },
                        { label: 'Completion', value: `${summary.completion_rate || 0}%` },
                    ]}
                />
                {employeeGroups.map(renderEmployeeGroup)}
            </>
        );
    };

    // ------------------------------------------------------------------ sheets

    const renderAnalyticsSheet = () => (
        <Sheet
            visible={showAnalytics}
            title="Task analytics"
            onClose={() => setShowAnalytics(false)}
            footer={<Button title="Close" variant="secondary" onPress={() => setShowAnalytics(false)} style={styles.flex} />}
        >
            <Segmented value={analyticsPeriod} onChange={setAnalyticsPeriod} options={ANALYTICS_PERIODS} style={styles.sheetControl} />
            {analyticsLoading ? (
                <Loading />
            ) : analytics ? (
                <>
                    <View style={styles.statsPanel}>
                        <StatStrip
                            style={styles.flatStrip}
                            items={[
                                { label: 'Tasks', value: analytics.total ?? 0 },
                                { label: 'Completed', value: analytics.completed ?? 0 },
                                { label: 'Pending', value: analytics.pending ?? 0 },
                            ]}
                        />
                        <View style={styles.stripDivider} />
                        <StatStrip
                            style={styles.flatStrip}
                            items={[
                                { label: 'Completion', value: `${analytics.completion_rate ?? 0}%` },
                                { label: 'Avg hours', value: analytics.avg_completion_hours ?? 0 },
                                { label: 'Carried forward', value: analytics.carried_forward ?? 0 },
                            ]}
                        />
                    </View>

                    {analytics.top_employees?.length > 0 ? (
                        <Group title="Top performers">
                            {analytics.top_employees.map((emp, i) => (
                                <Row
                                    key={`top-${i}`}
                                    left={<Avatar name={emp.employee_name} size={32} />}
                                    title={emp.employee_name}
                                    value={`${emp.completed} of ${emp.total}`}
                                />
                            ))}
                        </Group>
                    ) : null}

                    {analytics.carry_forward_leaders?.length > 0 ? (
                        <Group title="Most carried forward">
                            {analytics.carry_forward_leaders.map((emp, i) => (
                                <Row
                                    key={`cf-${i}`}
                                    left={<Avatar name={emp.employee_name} size={32} />}
                                    title={emp.employee_name}
                                    value={`${emp.total_cf} ${Number(emp.total_cf) === 1 ? 'time' : 'times'}`}
                                />
                            ))}
                        </Group>
                    ) : null}
                </>
            ) : (
                <EmptyState icon="bar-chart-2" title="No analytics" message="Could not load task analytics." />
            )}
        </Sheet>
    );

    const renderEditSheet = () => (
        <Sheet
            visible={showEditModal}
            title="Edit task"
            subtitle={editTask ? `${editTask.employee_name}  ·  ${shortDept(editTask.department) || 'No department'}` : undefined}
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
            <Field label="Status">
                <Segmented options={toOptions(STATUS_OPTIONS)} value={editStatus} onChange={setEditStatus} />
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
        </Sheet>
    );

    const renderAssignSheet = () => {
        const filteredEmps = employeeList.filter(e =>
            !empSearch || (e.employee_name || '').toLowerCase().includes(empSearch.toLowerCase()) ||
            (e.name || '').toLowerCase().includes(empSearch.toLowerCase()) ||
            (e.department || '').toLowerCase().includes(empSearch.toLowerCase())
        );
        const count = selectedEmployees.length;
        const names = selectedEmployees.map(empId => employeeList.find(e => e.name === empId)?.employee_name || empId);
        const selectedSummary = names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;

        if (assignStep === 'employees') {
            return (
                <Sheet
                    visible={showAssignModal}
                    title="Select employees"
                    subtitle={count ? `${count} selected` : undefined}
                    onClose={() => setAssignStep('form')}
                    footer={<Button title="Done" onPress={() => setAssignStep('form')} style={styles.flex} />}
                >
                    <SearchField value={empSearch} onChangeText={setEmpSearch} placeholder="Search by name or department" style={styles.sheetControl} />
                    {empLoading ? (
                        <Loading />
                    ) : filteredEmps.length === 0 ? (
                        <EmptyState icon="search" title="No employees found" />
                    ) : (
                        <Group footer={filteredEmps.length > 20 ? `Showing 20 of ${filteredEmps.length}. Search to narrow the list.` : undefined}>
                            {filteredEmps.slice(0, 20).map(emp => {
                                const isSelected = selectedEmployees.includes(emp.name);
                                return (
                                    <Row
                                        key={emp.name}
                                        left={<Avatar name={emp.employee_name} size={32} />}
                                        title={emp.employee_name}
                                        subtitle={shortDept(emp.department) || emp.name}
                                        selected={isSelected}
                                        chevron={false}
                                        onPress={() => toggleEmployee(emp.name)}
                                        right={<CheckMark checked={isSelected} />}
                                    />
                                );
                            })}
                        </Group>
                    )}
                </Sheet>
            );
        }

        return (
            <Sheet
                visible={showAssignModal}
                title="Assign task"
                onClose={() => !assigning && closeAssign()}
                dismissable={!assigning}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeAssign} disabled={assigning} />
                        <Button
                            title={count ? `Assign to ${count} ${count === 1 ? 'employee' : 'employees'}` : 'Assign'}
                            onPress={handleAssign}
                            loading={assigning}
                            style={styles.flex}
                        />
                    </>
                )}
            >
                <SelectField
                    label="Employees"
                    value={selectedSummary}
                    placeholder="Select employees"
                    icon="chevron-right"
                    onPress={() => setAssignStep('employees')}
                />
                <TextField
                    label="Title"
                    placeholder="What needs to be done"
                    value={assignTitle}
                    onChangeText={setAssignTitle}
                    maxLength={140}
                />
                <TextField
                    label="Description"
                    placeholder="Optional"
                    value={assignDesc}
                    onChangeText={setAssignDesc}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                />
                <Field label="Priority">
                    <Segmented options={PRIORITIES} value={assignPriority} onChange={setAssignPriority} />
                </Field>
            </Sheet>
        );
    };

    const renderCreateSheet = () => (
        <Sheet
            visible={showCreateModal}
            title="Add my task"
            onClose={() => !creating && setShowCreateModal(false)}
            dismissable={!creating}
            footer={(
                <>
                    <Button title="Cancel" variant="secondary" onPress={() => setShowCreateModal(false)} disabled={creating} style={styles.flex} />
                    <Button title="Add task" onPress={handleCreateOwnTask} loading={creating} style={styles.flex} />
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

    return (
        <View style={styles.container}>
            <TopInset />
            <View style={styles.topBar}>
                <IconButton name="arrow-left" onPress={() => navigation.goBack()} color={color.text} label="Back" />
                <Text style={styles.topTitle} numberOfLines={1}>Daily tasks</Text>
                <IconButton name="bar-chart-2" onPress={() => setShowAnalytics(true)} color={color.text} label="Task analytics" />
            </View>

            <DateNav
                date={selectedDate}
                onPrev={() => changeDate(-1)}
                onNext={() => changeDate(1)}
                onPick={() => setSelectedDate(new Date())}
                caption={summary.total_employees ? `${summary.total_employees} ${summary.total_employees === 1 ? 'employee' : 'employees'}` : undefined}
            />

            <View style={styles.toolbar}>
                <Segmented value={activeTab} onChange={setActiveTab} options={toOptions(FILTER_TABS)} />
            </View>

            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={(
                    <View style={styles.footerRow}>
                        <Button title="Add my task" variant="secondary" onPress={() => setShowCreateModal(true)} style={styles.flex} />
                        <Button title="Assign task" onPress={openAssign} style={styles.flex} />
                    </View>
                )}
            >
                {renderBody()}
            </Screen>

            {renderAnalyticsSheet()}
            {renderEditSheet()}
            {renderAssignSheet()}
            {renderCreateSheet()}
        </View>
    );
};

// check mark slot for multi-select rows (keeps row text aligned when unchecked)
const CheckMark = ({ checked }) => (
    <View style={styles.check}>
        {checked ? <Icon name="check" size={18} color={color.accent} /> : null}
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: color.bg },
    flex: { flex: 1 },
    topBar: {
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.xs,
        backgroundColor: color.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    topTitle: { ...type.title, flex: 1, textAlign: 'center' },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    strip: { marginBottom: space.xl },
    employeeGroup: { marginBottom: space.lg },
    groupRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    groupCount: { ...type.secondary, fontVariant: ['tabular-nums'] },
    groupCountDone: { color: color.success, fontWeight: '500' },
    // aligns task titles with the employee name above (avatar 36 + its 12 margin)
    taskIndent: { width: 48 },
    footerRow: { flexDirection: 'row', gap: space.sm },
    sheetControl: { marginBottom: space.lg },
    statsPanel: {
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color.border,
        overflow: 'hidden',
        marginBottom: space.xl,
    },
    flatStrip: { borderWidth: 0, borderRadius: 0 },
    stripDivider: { height: StyleSheet.hairlineWidth, backgroundColor: color.divider, marginHorizontal: space.lg },
    check: { width: 24, alignItems: 'flex-end' },
});

export default AdminDailyTasksScreen;
