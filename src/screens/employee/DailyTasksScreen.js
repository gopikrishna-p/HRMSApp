import React, { useState, useEffect, useCallback } from 'react';
import {
    View, FlatList, RefreshControl, TouchableOpacity, Modal,
    TextInput, ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import EmptyState from '../../components/ui/EmptyState';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import { colors } from '../../theme/colors';

const { width } = Dimensions.get('window');

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const STATUS_TABS = ['All', 'Open', 'In Progress', 'Completed'];

const PRIORITY_COLORS = {
    Low: '#6B7280',
    Medium: '#3B82F6',
    High: '#F59E0B',
    Urgent: '#EF4444',
};

const STATUS_COLORS = {
    Open: '#6B7280',
    'In Progress': '#3B82F6',
    Completed: '#10B981',
    Cancelled: '#EF4444',
};

const STATUS_ICONS = {
    Open: 'circle',
    'In Progress': 'spinner',
    Completed: 'check-circle',
    Cancelled: 'times-circle',
};

const DailyTasksScreen = ({ navigation }) => {
    const { custom } = useTheme();
    const { employee } = useAuth();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [summary, setSummary] = useState({});
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [activeTab, setActiveTab] = useState('All');

    // Create task modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newPriority, setNewPriority] = useState('Medium');
    const [creating, setCreating] = useState(false);

    // Edit task modal
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

    const getDisplayDate = (d) => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        if (formatDate(d) === formatDate(today)) return 'Today';
        if (formatDate(d) === formatDate(yesterday)) return 'Yesterday';
        if (formatDate(d) === formatDate(tomorrow)) return 'Tomorrow';
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    const fetchTasks = useCallback(async () => {
        try {
            const dateStr = formatDate(selectedDate);
            const filter = activeTab === 'All' ? null : activeTab;
            const response = await ApiService.getMyDailyTasks(dateStr, filter);
            if (response?.success && response?.data?.message) {
                const result = response.data.message;
                if (result.status === 'success' && result.data) {
                    setTasks(result.data.tasks || []);
                    setSummary(result.data.summary || {});
                } else {
                    setTasks([]);
                    setSummary({});
                }
            } else {
                setTasks([]);
                setSummary({});
            }
        } catch (error) {
            console.error('Fetch tasks error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
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
                showToast({ type: 'error', text1: 'Error', text2: response?.data?.message?.message || 'Failed to create task' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Error', text2: 'Failed to create task' });
        } finally {
            setCreating(false);
        }
    };

    const handleStatusChange = async (taskName, newStatus) => {
        try {
            const response = await ApiService.updateTaskStatus({ task_name: taskName, new_status: newStatus });
            if (response?.success && response?.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Updated', text2: response.data.message.message });
                fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: response?.data?.message?.message || 'Update failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Error', text2: 'Update failed' });
        }
    };

    const openEditModal = (task) => {
        setEditTask(task);
        setEditTitle(task.task_title);
        setEditDescription(task.task_description || '');
        setEditPriority(task.priority);
        setEditRemarks(task.remarks || '');
        setShowEditModal(true);
    };

    const handleEdit = async () => {
        if (!editTitle.trim()) {
            showToast({ type: 'error', text1: 'Error', text2: 'Task title is required' });
            return;
        }
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
                showToast({ type: 'success', text1: 'Updated', text2: 'Task updated' });
                setShowEditModal(false);
                setEditTask(null);
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

    const handleDelete = async (taskName) => {
        try {
            const response = await ApiService.deleteDailyTask(taskName);
            if (response?.success && response?.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Deleted', text2: 'Task deleted' });
                fetchTasks();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: response?.data?.message?.message || 'Delete failed' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Error', text2: 'Delete failed' });
        }
    };

    const renderSummaryCard = () => (
        <View style={[styles.summaryCard, { backgroundColor: custom.palette.primary + '10' }]}>
            <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: custom.palette.primary }]}>{summary.total || 0}</Text>
                    <Text style={styles.summaryLabel}>Total</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: '#3B82F6' }]}>{summary.in_progress || 0}</Text>
                    <Text style={styles.summaryLabel}>In Progress</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: '#10B981' }]}>{summary.completed || 0}</Text>
                    <Text style={styles.summaryLabel}>Done</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: '#F59E0B' }]}>{summary.carried_forward || 0}</Text>
                    <Text style={styles.summaryLabel}>Carried</Text>
                </View>
            </View>
        </View>
    );

    const renderTaskCard = ({ item }) => {
        const isOpen = item.status === 'Open';
        const isInProgress = item.status === 'In Progress';
        const isCompleted = item.status === 'Completed';
        const canEdit = isOpen; // Only Open tasks can be edited

        return (
            <View style={[styles.taskCard, { borderLeftColor: STATUS_COLORS[item.status] || '#6B7280' }]}>
                <TouchableOpacity
                    style={styles.taskContent}
                    onPress={() => canEdit ? openEditModal(item) : null}
                    activeOpacity={canEdit ? 0.7 : 1}
                >
                    <View style={styles.taskHeader}>
                        <View style={styles.taskTitleRow}>
                            <Icon
                                name={STATUS_ICONS[item.status] || 'circle'}
                                size={14}
                                color={STATUS_COLORS[item.status]}
                                solid={isCompleted}
                                style={{ marginRight: 8 }}
                            />
                            <Text style={[styles.taskTitle, isCompleted && styles.taskTitleCompleted]} numberOfLines={2}>
                                {item.task_title}
                            </Text>
                        </View>
                        <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[item.priority] + '20' }]}>
                            <Text style={[styles.priorityText, { color: PRIORITY_COLORS[item.priority] }]}>{item.priority}</Text>
                        </View>
                    </View>

                    {item.task_description ? (
                        <Text style={styles.taskDescription} numberOfLines={2}>{item.task_description}</Text>
                    ) : null}

                    <View style={styles.taskMeta}>
                        {item.carry_forward_count > 0 && (
                            <View style={styles.metaChip}>
                                <Icon name="redo" size={10} color="#F59E0B" />
                                <Text style={[styles.metaText, { color: '#F59E0B' }]}> CF x{item.carry_forward_count}</Text>
                            </View>
                        )}
                        {isCompleted && item.completion_label && (
                            <View style={[styles.metaChip, { backgroundColor: '#D1FAE5' }]}>
                                <Icon name="clock" size={10} color="#10B981" />
                                <Text style={[styles.metaText, { color: '#10B981' }]}> {item.completion_label}</Text>
                            </View>
                        )}
                        {isCompleted && item.time_taken_hours > 0 && (
                            <View style={styles.metaChip}>
                                <Icon name="hourglass-half" size={10} color="#6B7280" />
                                <Text style={styles.metaText}> {item.time_taken_hours}h</Text>
                            </View>
                        )}
                        {item.assigned_by_name && (
                            <View style={styles.metaChip}>
                                <Icon name="user-tag" size={10} color="#8B5CF6" />
                                <Text style={[styles.metaText, { color: '#8B5CF6' }]}> {item.assigned_by_name}</Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>

                {/* Action Buttons */}
                {isOpen && (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={styles.startTaskBtn}
                            onPress={() => handleStatusChange(item.name, 'In Progress')}
                        >
                            <Icon name="play" size={14} color="#FFF" />
                            <Text style={styles.startTaskBtnText}>  Start Task</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionBtnSmall, { backgroundColor: '#EF444415' }]}
                            onPress={() => handleDelete(item.name)}
                        >
                            <Icon name="trash" size={13} color="#EF4444" />
                        </TouchableOpacity>
                    </View>
                )}
                {isInProgress && (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={styles.completeTaskBtn}
                            onPress={() => handleStatusChange(item.name, 'Completed')}
                        >
                            <Icon name="check-circle" size={15} color="#FFF" solid />
                            <Text style={styles.completeTaskBtnText}>  Mark as Complete</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    const renderCreateModal = () => (
        <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>New Task</Text>
                        <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                            <Icon name="times" size={20} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.inputLabel}>Title *</Text>
                    <TextInput
                        style={styles.input}
                        value={newTitle}
                        onChangeText={setNewTitle}
                        placeholder="What needs to be done?"
                        placeholderTextColor="#9CA3AF"
                        maxLength={140}
                    />

                    <Text style={styles.inputLabel}>Description</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={newDescription}
                        onChangeText={setNewDescription}
                        placeholder="Add details (optional)"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        numberOfLines={3}
                        maxLength={500}
                    />

                    <Text style={styles.inputLabel}>Priority</Text>
                    <View style={styles.priorityRow}>
                        {PRIORITIES.map((p) => (
                            <TouchableOpacity
                                key={p}
                                style={[styles.priorityOption, newPriority === p && { backgroundColor: PRIORITY_COLORS[p] + '20', borderColor: PRIORITY_COLORS[p] }]}
                                onPress={() => setNewPriority(p)}
                            >
                                <Text style={[styles.priorityOptionText, newPriority === p && { color: PRIORITY_COLORS[p], fontWeight: '600' }]}>{p}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={[styles.createBtn, { backgroundColor: custom.palette.primary }, creating && { opacity: 0.6 }]}
                        onPress={handleCreate}
                        disabled={creating}
                    >
                        {creating ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.createBtnText}>Create Task</Text>}
                    </TouchableOpacity>
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

                    <Text style={styles.inputLabel}>Title *</Text>
                    <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} maxLength={140} />

                    <Text style={styles.inputLabel}>Description</Text>
                    <TextInput style={[styles.input, styles.textArea]} value={editDescription} onChangeText={setEditDescription} multiline numberOfLines={3} maxLength={500} />

                    <Text style={styles.inputLabel}>Priority</Text>
                    <View style={styles.priorityRow}>
                        {PRIORITIES.map((p) => (
                            <TouchableOpacity
                                key={p}
                                style={[styles.priorityOption, editPriority === p && { backgroundColor: PRIORITY_COLORS[p] + '20', borderColor: PRIORITY_COLORS[p] }]}
                                onPress={() => setEditPriority(p)}
                            >
                                <Text style={[styles.priorityOptionText, editPriority === p && { color: PRIORITY_COLORS[p], fontWeight: '600' }]}>{p}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={styles.inputLabel}>Remarks</Text>
                    <TextInput style={[styles.input, styles.textArea]} value={editRemarks} onChangeText={setEditRemarks} placeholder="Add notes..." placeholderTextColor="#9CA3AF" multiline numberOfLines={2} maxLength={500} />

                    <TouchableOpacity
                        style={[styles.createBtn, { backgroundColor: custom.palette.primary }, saving && { opacity: 0.6 }]}
                        onPress={handleEdit}
                        disabled={saving}
                    >
                        {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.createBtnText}>Save Changes</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <AppHeader title="Daily Tasks" canGoBack onBack={() => navigation.goBack()} />

            {/* Date Selector */}
            <View style={styles.dateSelector}>
                <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrow}>
                    <Icon name="chevron-left" size={16} color={custom.palette.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={styles.dateCenter}>
                    <Text style={[styles.dateText, { color: colors.textPrimary }]}>{getDisplayDate(selectedDate)}</Text>
                    <Text style={styles.dateSubtext}>{formatDate(selectedDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateArrow}>
                    <Icon name="chevron-right" size={16} color={custom.palette.primary} />
                </TouchableOpacity>
            </View>

            {/* Status Tabs */}
            <View style={styles.tabRow}>
                {STATUS_TABS.map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && { backgroundColor: custom.palette.primary, borderColor: custom.palette.primary }]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && { color: '#FFF' }]}>{tab}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {renderSummaryCard()}

            {loading ? (
                <ActivityIndicator size="large" color={custom.palette.primary} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={tasks}
                    keyExtractor={(item) => item.name}
                    renderItem={renderTaskCard}
                    contentContainerStyle={styles.listContainer}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[custom.palette.primary]} />}
                    ListEmptyComponent={<EmptyState icon="clipboard-list" title="No tasks" message={`No ${activeTab !== 'All' ? activeTab.toLowerCase() : ''} tasks for ${getDisplayDate(selectedDate)}`} />}
                />
            )}

            {/* FAB - Create Task */}
            <TouchableOpacity style={[styles.fab, { backgroundColor: custom.palette.primary }]} onPress={() => setShowCreateModal(true)}>
                <Icon name="plus" size={22} color="#FFF" />
            </TouchableOpacity>

            {renderCreateModal()}
            {renderEditModal()}
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
    dateText: { fontSize: 18, fontWeight: '700' },
    dateSubtext: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    tabRow: {
        flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: '#FFF', gap: 8,
    },
    tab: {
        flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center',
        borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
    },
    tabText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    summaryCard: {
        marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 16,
    },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
    summaryItem: { alignItems: 'center' },
    summaryNumber: { fontSize: 22, fontWeight: '800' },
    summaryLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    listContainer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
    taskCard: {
        backgroundColor: '#FFF', borderRadius: 12, marginBottom: 10, padding: 14,
        borderLeftWidth: 4, elevation: 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
    },
    taskContent: {},
    taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    taskTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
    taskTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    taskTitleCompleted: { textDecorationLine: 'line-through', color: colors.textSecondary },
    priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    priorityText: { fontSize: 11, fontWeight: '600' },
    taskDescription: { fontSize: 13, color: colors.textSecondary, marginTop: 6, marginLeft: 22 },
    taskMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6, marginLeft: 22 },
    metaChip: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.lightGray, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    },
    metaText: { fontSize: 11, color: colors.textSecondary },
    actionRow: {
        flexDirection: 'row', marginTop: 10, paddingTop: 10,
        borderTopWidth: 1, borderTopColor: colors.borderLight, gap: 8,
    },
    startTaskBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#3B82F6', paddingVertical: 10, borderRadius: 10,
    },
    startTaskBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
    completeTaskBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 10,
    },
    completeTaskBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
    actionBtnSmall: {
        width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8,
    },
    fab: {
        position: 'absolute', bottom: 24, right: 20,
        width: 56, height: 56, borderRadius: 28,
        justifyContent: 'center', alignItems: 'center',
        elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3, shadowRadius: 4,
    },
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 24, maxHeight: '85%',
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
    },
    modalTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
    inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
    input: {
        borderWidth: 1, borderColor: colors.border, borderRadius: 10,
        padding: 12, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.background,
    },
    textArea: { height: 80, textAlignVertical: 'top' },
    priorityRow: { flexDirection: 'row', gap: 8 },
    priorityOption: {
        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
        borderWidth: 1, borderColor: colors.border,
    },
    priorityOptionText: { fontSize: 13, color: colors.textSecondary },
    createBtn: {
        marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    },
    createBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

export default DailyTasksScreen;
