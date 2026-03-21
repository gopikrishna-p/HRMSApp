import React, { useState, useEffect, useCallback } from 'react';
import {
    View, FlatList, RefreshControl, TouchableOpacity, Modal,
    TextInput, ActivityIndicator, StyleSheet, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import EmptyState from '../../components/ui/EmptyState';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import { colors } from '../../theme/colors';

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const STATUS_OPTIONS = ['Open', 'In Progress', 'Completed', 'Cancelled'];
const FILTER_TABS = ['All', 'Open', 'In Progress', 'Completed'];

const PRIORITY_COLORS = {
    Low: '#6B7280', Medium: '#3B82F6', High: '#F59E0B', Urgent: '#EF4444',
};
const STATUS_COLORS = {
    Open: '#6B7280', 'In Progress': '#3B82F6', Completed: '#10B981', Cancelled: '#EF4444',
};
const STATUS_ICONS = {
    Open: 'circle', 'In Progress': 'spinner', Completed: 'check-circle', Cancelled: 'times-circle',
};

const AdminDailyTasksScreen = ({ navigation }) => {
    const { custom } = useTheme();
    const { employee } = useAuth();

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

    // Edit modal
    const [showEditModal, setShowEditModal] = useState(false);
    const [editTask, setEditTask] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editPriority, setEditPriority] = useState('Medium');
    const [editStatus, setEditStatus] = useState('Open');
    const [editRemarks, setEditRemarks] = useState('');
    const [saving, setSaving] = useState(false);

    // Assign modal
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [assignTitle, setAssignTitle] = useState('');
    const [assignDesc, setAssignDesc] = useState('');
    const [assignPriority, setAssignPriority] = useState('Medium');
    const [assigning, setAssigning] = useState(false);
    const [employeeList, setEmployeeList] = useState([]);
    const [empSearch, setEmpSearch] = useState('');
    const [empLoading, setEmpLoading] = useState(false);

    // Create own task modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newPriority, setNewPriority] = useState('Medium');
    const [creating, setCreating] = useState(false);

    // FAB menu
    const [showFabMenu, setShowFabMenu] = useState(false);

    const formatDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const getDisplayDate = (d) => {
        const today = new Date();
        if (formatDate(d) === formatDate(today)) return 'Today';
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        if (formatDate(d) === formatDate(yesterday)) return 'Yesterday';
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        if (formatDate(d) === formatDate(tomorrow)) return 'Tomorrow';
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
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

    useEffect(() => { setLoading(true); fetchTasks(); }, [fetchTasks]);
    useEffect(() => { if (showAnalytics) fetchAnalytics(); }, [showAnalytics, fetchAnalytics]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchTasks(); }, [fetchTasks]);
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
            showToast({ type: 'error', text1: 'Error', text2: 'Title is required' });
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
                showToast({ type: 'success', text1: 'Updated', text2: 'Task updated' });
                setShowEditModal(false);
                fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: response?.data?.message?.message || 'Update failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Error', text2: 'Update failed' });
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
            showToast({ type: 'error', text1: 'Error', text2: 'Select employee(s) and enter title' });
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
                showToast({ type: 'success', text1: 'Assigned', text2: response.data.message.message });
                setShowAssignModal(false);
                setSelectedEmployees([]);
                setAssignTitle('');
                setAssignDesc('');
                setAssignPriority('Medium');
                setEmpSearch('');
                fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: response?.data?.message?.message || 'Assign failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Error', text2: 'Assign failed' });
        } finally {
            setAssigning(false);
        }
    };

    const handleCreateOwnTask = async () => {
        if (!newTitle.trim()) {
            showToast({ type: 'error', text1: 'Error', text2: 'Task title is required' });
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
                showToast({ type: 'success', text1: 'Task Created', text2: response.data.message.message });
                setShowCreateModal(false);
                setNewTitle('');
                setNewDescription('');
                setNewPriority('Medium');
                fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: response?.data?.message?.message || 'Failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Error', text2: 'Failed to create task' });
        } finally {
            setCreating(false);
        }
    };

    const renderSummary = () => (
        <View style={[styles.summaryCard, { backgroundColor: '#6366F110' }]}>
            <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: '#6366F1' }]}>{summary.total_tasks || 0}</Text>
                    <Text style={styles.summaryLabel}>Tasks</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: '#EC4899' }]}>{summary.total_employees || 0}</Text>
                    <Text style={styles.summaryLabel}>Employees</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: '#10B981' }]}>{summary.completed || 0}</Text>
                    <Text style={styles.summaryLabel}>Done</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: '#F59E0B' }]}>{summary.pending || 0}</Text>
                    <Text style={styles.summaryLabel}>Pending</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: '#3B82F6' }]}>{summary.completion_rate || 0}%</Text>
                    <Text style={styles.summaryLabel}>Rate</Text>
                </View>
            </View>
        </View>
    );

    const renderTaskItem = (task) => (
        <TouchableOpacity key={task.name} style={styles.taskItem} onPress={() => openEditModal(task)} activeOpacity={0.7}>
            <View style={styles.taskRow}>
                <Icon name={STATUS_ICONS[task.status]} size={12} color={STATUS_COLORS[task.status]} solid={task.status === 'Completed'} style={{ marginTop: 2 }} />
                <View style={styles.taskInfo}>
                    <Text style={[styles.taskTitle, task.status === 'Completed' && styles.taskDone]} numberOfLines={1}>{task.task_title}</Text>
                    <View style={styles.taskChips}>
                        <View style={[styles.chip, { backgroundColor: PRIORITY_COLORS[task.priority] + '15' }]}>
                            <Text style={[styles.chipText, { color: PRIORITY_COLORS[task.priority] }]}>{task.priority}</Text>
                        </View>
                        {task.carry_forward_count > 0 && (
                            <View style={[styles.chip, { backgroundColor: '#FEF3C7' }]}>
                                <Text style={[styles.chipText, { color: '#D97706' }]}>CF x{task.carry_forward_count}</Text>
                            </View>
                        )}
                        {task.completion_label && (
                            <View style={[styles.chip, { backgroundColor: '#D1FAE5' }]}>
                                <Text style={[styles.chipText, { color: '#059669' }]}>{task.completion_label}</Text>
                            </View>
                        )}
                        {task.time_taken_hours > 0 && (
                            <View style={styles.chip}>
                                <Text style={styles.chipText}>{task.time_taken_hours}h</Text>
                            </View>
                        )}
                    </View>
                </View>
                <Icon name="pen" size={11} color="#9CA3AF" />
            </View>
        </TouchableOpacity>
    );

    const renderEmployeeGroup = ({ item: group }) => {
        const isExpanded = expandedEmps[group.employee];
        const completionPct = group.total ? Math.round((group.completed / group.total) * 100) : 0;

        return (
            <View style={styles.empGroup}>
                <TouchableOpacity style={styles.empHeader} onPress={() => toggleExpand(group.employee)}>
                    <View style={styles.empHeaderLeft}>
                        <View style={[styles.avatar, { backgroundColor: custom.palette.primary + '20' }]}>
                            <Text style={[styles.avatarText, { color: custom.palette.primary }]}>
                                {(group.employee_name || '?')[0].toUpperCase()}
                            </Text>
                        </View>
                        <View>
                            <Text style={styles.empName}>{group.employee_name}</Text>
                            <Text style={styles.empDept}>{group.department || 'No Dept'}</Text>
                        </View>
                    </View>
                    <View style={styles.empHeaderRight}>
                        <View style={styles.empStats}>
                            <Text style={[styles.empStat, { color: '#10B981' }]}>{group.completed}</Text>
                            <Text style={styles.empStatSep}>/</Text>
                            <Text style={styles.empStat}>{group.total}</Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${completionPct}%`, backgroundColor: completionPct === 100 ? '#10B981' : '#3B82F6' }]} />
                        </View>
                        <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#9CA3AF" />
                    </View>
                </TouchableOpacity>
                {isExpanded && group.tasks.map(renderTaskItem)}
            </View>
        );
    };

    const renderAnalyticsModal = () => (
        <Modal visible={showAnalytics} transparent animationType="slide" onRequestClose={() => setShowAnalytics(false)}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Task Analytics</Text>
                        <TouchableOpacity onPress={() => setShowAnalytics(false)}>
                            <Icon name="times" size={20} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.periodRow}>
                        {['week', 'month'].map(p => (
                            <TouchableOpacity
                                key={p}
                                style={[styles.periodBtn, analyticsPeriod === p && { backgroundColor: custom.palette.primary }]}
                                onPress={() => setAnalyticsPeriod(p)}
                            >
                                <Text style={[styles.periodBtnText, analyticsPeriod === p && { color: '#FFF' }]}>
                                    {p === 'week' ? 'This Week' : 'This Month'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {analyticsLoading ? (
                        <ActivityIndicator size="large" color={custom.palette.primary} style={{ marginTop: 30 }} />
                    ) : analytics ? (
                        <ScrollView style={{ marginTop: 16 }}>
                            <View style={styles.analyticsGrid}>
                                {[
                                    { label: 'Total Tasks', value: analytics.total, color: '#6366F1' },
                                    { label: 'Completed', value: analytics.completed, color: '#10B981' },
                                    { label: 'Pending', value: analytics.pending, color: '#F59E0B' },
                                    { label: 'Completion Rate', value: `${analytics.completion_rate}%`, color: '#3B82F6' },
                                    { label: 'Avg Hours', value: analytics.avg_completion_hours, color: '#8B5CF6' },
                                    { label: 'Carried Forward', value: analytics.carried_forward, color: '#EC4899' },
                                ].map((stat, i) => (
                                    <View key={i} style={[styles.analyticsStat, { borderLeftColor: stat.color }]}>
                                        <Text style={[styles.analyticsValue, { color: stat.color }]}>{stat.value}</Text>
                                        <Text style={styles.analyticsLabel}>{stat.label}</Text>
                                    </View>
                                ))}
                            </View>

                            {analytics.top_employees?.length > 0 && (
                                <View style={styles.analyticsSection}>
                                    <Text style={styles.analyticsSectionTitle}>Top Performers</Text>
                                    {analytics.top_employees.map((emp, i) => (
                                        <View key={i} style={styles.analyticsRow}>
                                            <Text style={styles.analyticsRowLabel}>{i + 1}. {emp.employee_name}</Text>
                                            <Text style={styles.analyticsRowValue}>{emp.completed}/{emp.total} done</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {analytics.carry_forward_leaders?.length > 0 && (
                                <View style={styles.analyticsSection}>
                                    <Text style={styles.analyticsSectionTitle}>Most Carry-Forwards</Text>
                                    {analytics.carry_forward_leaders.map((emp, i) => (
                                        <View key={i} style={styles.analyticsRow}>
                                            <Text style={styles.analyticsRowLabel}>{emp.employee_name}</Text>
                                            <Text style={[styles.analyticsRowValue, { color: '#F59E0B' }]}>{emp.total_cf} times</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    ) : null}
                </View>
            </View>
        </Modal>
    );

    const renderEditModal = () => (
        <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Edit Task</Text>
                        <TouchableOpacity onPress={() => setShowEditModal(false)}>
                            <Icon name="times" size={20} color="#6B7280" />
                        </TouchableOpacity>
                    </View>
                    {editTask && (
                        <Text style={styles.empSubtitle}>{editTask.employee_name} {'\u2022'} {editTask.department || 'No Dept'}</Text>
                    )}

                    <ScrollView>
                        <Text style={styles.inputLabel}>Title *</Text>
                        <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} maxLength={140} />

                        <Text style={styles.inputLabel}>Description</Text>
                        <TextInput style={[styles.input, styles.textArea]} value={editDescription} onChangeText={setEditDescription} multiline numberOfLines={3} maxLength={500} />

                        <Text style={styles.inputLabel}>Priority</Text>
                        <View style={styles.optionRow}>
                            {PRIORITIES.map(p => (
                                <TouchableOpacity key={p}
                                    style={[styles.optionBtn, editPriority === p && { backgroundColor: PRIORITY_COLORS[p] + '20', borderColor: PRIORITY_COLORS[p] }]}
                                    onPress={() => setEditPriority(p)}>
                                    <Text style={[styles.optionText, editPriority === p && { color: PRIORITY_COLORS[p], fontWeight: '600' }]}>{p}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.inputLabel}>Status</Text>
                        <View style={styles.optionRow}>
                            {STATUS_OPTIONS.map(s => (
                                <TouchableOpacity key={s}
                                    style={[styles.optionBtn, editStatus === s && { backgroundColor: STATUS_COLORS[s] + '20', borderColor: STATUS_COLORS[s] }]}
                                    onPress={() => setEditStatus(s)}>
                                    <Text style={[styles.optionText, editStatus === s && { color: STATUS_COLORS[s], fontWeight: '600' }]}>{s}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.inputLabel}>Remarks</Text>
                        <TextInput style={[styles.input, styles.textArea]} value={editRemarks} onChangeText={setEditRemarks} placeholder="Admin notes..." placeholderTextColor="#9CA3AF" multiline numberOfLines={2} maxLength={500} />
                    </ScrollView>

                    <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: custom.palette.primary }, saving && { opacity: 0.6 }]}
                        onPress={handleEdit} disabled={saving}>
                        {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    const renderAssignModal = () => {
        const filteredEmps = employeeList.filter(e =>
            !empSearch || (e.employee_name || '').toLowerCase().includes(empSearch.toLowerCase()) ||
            (e.name || '').toLowerCase().includes(empSearch.toLowerCase()) ||
            (e.department || '').toLowerCase().includes(empSearch.toLowerCase())
        );

        return (
            <Modal visible={showAssignModal} transparent animationType="slide" onRequestClose={() => setShowAssignModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '92%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Assign Task</Text>
                            <TouchableOpacity onPress={() => { setShowAssignModal(false); setEmpSearch(''); }}>
                                <Icon name="times" size={20} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView keyboardShouldPersistTaps="handled">
                            <Text style={styles.inputLabel}>Select Employee(s) *</Text>
                            {selectedEmployees.length > 0 && (
                                <View style={styles.selectedChipsRow}>
                                    {selectedEmployees.map(empId => {
                                        const emp = employeeList.find(e => e.name === empId);
                                        return (
                                            <TouchableOpacity key={empId} style={styles.selectedChip} onPress={() => toggleEmployee(empId)}>
                                                <Text style={styles.selectedChipText}>{emp?.employee_name || empId}</Text>
                                                <Icon name="times" size={10} color="#FFF" style={{ marginLeft: 4 }} />
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}

                            <TextInput
                                style={styles.empSearchInput}
                                value={empSearch}
                                onChangeText={setEmpSearch}
                                placeholder="Search by name or department..."
                                placeholderTextColor="#9CA3AF"
                            />

                            {empLoading ? (
                                <ActivityIndicator size="small" color={custom.palette.primary} style={{ marginVertical: 16 }} />
                            ) : (
                                <ScrollView style={styles.empListContainer} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                    {filteredEmps.slice(0, 20).map(emp => {
                                        const isSelected = selectedEmployees.includes(emp.name);
                                        return (
                                            <TouchableOpacity
                                                key={emp.name}
                                                style={[styles.empPickerItem, isSelected && styles.empPickerItemSelected]}
                                                onPress={() => toggleEmployee(emp.name)}>
                                                <View style={styles.empPickerLeft}>
                                                    <View style={[styles.empCheckbox, isSelected && { backgroundColor: custom.palette.primary, borderColor: custom.palette.primary }]}>
                                                        {isSelected && <Icon name="check" size={10} color="#FFF" />}
                                                    </View>
                                                    <View>
                                                        <Text style={styles.empPickerName}>{emp.employee_name}</Text>
                                                        <Text style={styles.empPickerId}>{emp.department || emp.name}</Text>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                    {filteredEmps.length === 0 && (
                                        <Text style={styles.empPickerEmpty}>No employees found</Text>
                                    )}
                                    {filteredEmps.length > 20 && (
                                        <Text style={styles.empPickerEmpty}>Showing 20 of {filteredEmps.length} — refine your search</Text>
                                    )}
                                </ScrollView>
                            )}

                            <Text style={styles.inputLabel}>Task Title *</Text>
                            <TextInput style={styles.input} value={assignTitle} onChangeText={setAssignTitle} placeholder="Task title" placeholderTextColor="#9CA3AF" maxLength={140} />

                            <Text style={styles.inputLabel}>Description</Text>
                            <TextInput style={[styles.input, styles.textArea]} value={assignDesc} onChangeText={setAssignDesc} placeholder="Details (optional)" placeholderTextColor="#9CA3AF" multiline numberOfLines={3} maxLength={500} />

                            <Text style={styles.inputLabel}>Priority</Text>
                            <View style={styles.optionRow}>
                                {PRIORITIES.map(p => (
                                    <TouchableOpacity key={p}
                                        style={[styles.optionBtn, assignPriority === p && { backgroundColor: PRIORITY_COLORS[p] + '20', borderColor: PRIORITY_COLORS[p] }]}
                                        onPress={() => setAssignPriority(p)}>
                                        <Text style={[styles.optionText, assignPriority === p && { color: PRIORITY_COLORS[p], fontWeight: '600' }]}>{p}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>

                        <TouchableOpacity
                            style={[styles.saveBtn, { backgroundColor: custom.palette.primary }, assigning && { opacity: 0.6 }]}
                            onPress={handleAssign} disabled={assigning}>
                            {assigning ? <ActivityIndicator color="#FFF" size="small" /> :
                                <Text style={styles.saveBtnText}>Assign to {selectedEmployees.length} Employee{selectedEmployees.length !== 1 ? 's' : ''}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    };

    const renderCreateModal = () => (
        <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>My Task</Text>
                        <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                            <Icon name="times" size={20} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView>
                        <Text style={styles.inputLabel}>Title *</Text>
                        <TextInput style={styles.input} value={newTitle} onChangeText={setNewTitle} placeholder="What needs to be done?" placeholderTextColor="#9CA3AF" maxLength={140} />

                        <Text style={styles.inputLabel}>Description</Text>
                        <TextInput style={[styles.input, styles.textArea]} value={newDescription} onChangeText={setNewDescription} placeholder="Add details (optional)" placeholderTextColor="#9CA3AF" multiline numberOfLines={3} maxLength={500} />

                        <Text style={styles.inputLabel}>Priority</Text>
                        <View style={styles.optionRow}>
                            {PRIORITIES.map(p => (
                                <TouchableOpacity key={p}
                                    style={[styles.optionBtn, newPriority === p && { backgroundColor: PRIORITY_COLORS[p] + '20', borderColor: PRIORITY_COLORS[p] }]}
                                    onPress={() => setNewPriority(p)}>
                                    <Text style={[styles.optionText, newPriority === p && { color: PRIORITY_COLORS[p], fontWeight: '600' }]}>{p}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>

                    <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: custom.palette.primary }, creating && { opacity: 0.6 }]}
                        onPress={handleCreateOwnTask} disabled={creating}>
                        {creating ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Create Task</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <AppHeader title="Daily Tasks" canGoBack onBack={() => navigation.goBack()}
                rightIcon="chart-bar" onRightPress={() => setShowAnalytics(true)} />

            {/* Date Selector */}
            <View style={styles.dateSelector}>
                <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrow}>
                    <Icon name="chevron-left" size={16} color={custom.palette.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={styles.dateCenter}>
                    <Text style={styles.dateText}>{getDisplayDate(selectedDate)}</Text>
                    <Text style={styles.dateSubtext}>{formatDate(selectedDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateArrow}>
                    <Icon name="chevron-right" size={16} color={custom.palette.primary} />
                </TouchableOpacity>
            </View>

            {/* Filter Tabs */}
            <View style={styles.tabRow}>
                {FILTER_TABS.map(tab => (
                    <TouchableOpacity key={tab}
                        style={[styles.tab, activeTab === tab && { backgroundColor: custom.palette.primary, borderColor: custom.palette.primary }]}
                        onPress={() => setActiveTab(tab)}>
                        <Text style={[styles.tabText, activeTab === tab && { color: '#FFF' }]}>{tab}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {renderSummary()}

            {loading ? (
                <ActivityIndicator size="large" color={custom.palette.primary} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={employeeGroups}
                    keyExtractor={item => item.employee}
                    renderItem={renderEmployeeGroup}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[custom.palette.primary]} />}
                    ListEmptyComponent={<EmptyState icon="clipboard-list" title="No tasks" message={`No tasks for ${getDisplayDate(selectedDate)}`} />}
                />
            )}

            {/* FAB Menu Overlay */}
            {showFabMenu && (
                <TouchableOpacity style={styles.fabOverlay} activeOpacity={1} onPress={() => setShowFabMenu(false)}>
                    <View style={styles.fabMenuContainer}>
                        <TouchableOpacity style={styles.fabMenuItem} onPress={() => { setShowFabMenu(false); setShowCreateModal(true); }}>
                            <Icon name="plus" size={14} color="#FFF" />
                            <Text style={styles.fabMenuText}>  My Task</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.fabMenuItem, { backgroundColor: '#8B5CF6' }]} onPress={() => { setShowFabMenu(false); fetchEmployees(); setShowAssignModal(true); }}>
                            <Icon name="user-plus" size={14} color="#FFF" />
                            <Text style={styles.fabMenuText}>  Assign Task</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            )}

            {/* FAB */}
            <TouchableOpacity style={[styles.fab, { backgroundColor: custom.palette.primary }]}
                onPress={() => setShowFabMenu(prev => !prev)}>
                <Icon name={showFabMenu ? 'times' : 'plus'} size={20} color="#FFF" />
            </TouchableOpacity>

            {renderAnalyticsModal()}
            {renderEditModal()}
            {renderAssignModal()}
            {renderCreateModal()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    dateSelector: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF',
        borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    dateArrow: { padding: 8 },
    dateCenter: { alignItems: 'center' },
    dateText: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    dateSubtext: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', gap: 8 },
    tab: {
        flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center',
        borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
    },
    tabText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    summaryCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 14 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
    summaryItem: { alignItems: 'center' },
    summaryNumber: { fontSize: 20, fontWeight: '800' },
    summaryLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
    listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
    empGroup: { backgroundColor: '#FFF', borderRadius: 12, marginBottom: 10, overflow: 'hidden', elevation: 1 },
    empHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 14, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
    },
    empHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    avatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    avatarText: { fontSize: 16, fontWeight: '700' },
    empName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    empDept: { fontSize: 11, color: colors.textSecondary },
    empSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
    empHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    empStats: { flexDirection: 'row', alignItems: 'center' },
    empStat: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    empStatSep: { fontSize: 14, color: colors.textSecondary, marginHorizontal: 2 },
    progressBarBg: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lightGray },
    progressBarFill: { height: 4, borderRadius: 2 },
    taskItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight },
    taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    taskInfo: { flex: 1 },
    taskTitle: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
    taskDone: { textDecorationLine: 'line-through', color: colors.textSecondary },
    taskChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.lightGray },
    chipText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
    fab: {
        position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
        justifyContent: 'center', alignItems: 'center', elevation: 6,
    },
    fabOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end', alignItems: 'flex-end',
        paddingBottom: 90, paddingRight: 20,
    },
    fabMenuContainer: { gap: 10 },
    fabMenuItem: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 12,
        borderRadius: 25, elevation: 4,
    },
    fabMenuText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
    inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
    input: {
        borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12,
        fontSize: 15, color: colors.textPrimary, backgroundColor: colors.background,
    },
    textArea: { height: 80, textAlignVertical: 'top' },
    optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    optionBtn: {
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
        borderWidth: 1, borderColor: colors.border,
    },
    optionText: { fontSize: 12, color: colors.textSecondary },
    saveBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    periodRow: { flexDirection: 'row', gap: 8 },
    periodBtn: {
        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
        borderWidth: 1, borderColor: colors.border,
    },
    periodBtnText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    analyticsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    analyticsStat: {
        width: '47%', padding: 14, borderRadius: 10, backgroundColor: colors.background,
        borderLeftWidth: 3,
    },
    analyticsValue: { fontSize: 22, fontWeight: '800' },
    analyticsLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    analyticsSection: { marginTop: 20 },
    analyticsSectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
    analyticsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight },
    analyticsRowLabel: { fontSize: 14, color: colors.textPrimary },
    analyticsRowValue: { fontSize: 14, fontWeight: '600', color: '#10B981' },
    selectedChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    selectedChip: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#3B82F6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15,
    },
    selectedChipText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
    empSearchInput: {
        borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10,
        fontSize: 14, color: colors.textPrimary, backgroundColor: colors.background,
    },
    empListContainer: {
        marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
        maxHeight: 220,
    },
    empPickerItem: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 10, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
    },
    empPickerItemSelected: { backgroundColor: '#3B82F608' },
    empPickerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    empCheckbox: {
        width: 22, height: 22, borderRadius: 4, borderWidth: 1.5,
        borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    },
    empPickerName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
    empPickerId: { fontSize: 11, color: colors.textSecondary },
    empPickerEmpty: { padding: 16, textAlign: 'center', color: colors.textSecondary, fontSize: 13 },
});

export default AdminDailyTasksScreen;
