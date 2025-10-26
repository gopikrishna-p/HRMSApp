// src/screens/admin/ProjectTasksScreen.js
import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    FlatList,
    RefreshControl,
    ActivityIndicator,
    Modal,
    Text,
    TextInput,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

import { adminListTasks, createTask, getProjectDetail } from '../../services/project.service';

const TaskCard = ({ task, onPress }) => {
    const getStatusColor = (status) => {
        const s = String(status).toLowerCase();
        if (['completed', 'closed', 'done'].includes(s)) return '#10B981';
        if (s === 'working') return '#8B5CF6';
        if (s === 'pending review') return '#F59E0B';
        if (s === 'open') return '#3B82F6';
        return '#6B7280';
    };

    const getPriorityColor = (priority) => {
        const p = String(priority).toLowerCase();
        if (p === 'high' || p === 'urgent') return '#EF4444';
        if (p === 'medium') return '#F59E0B';
        if (p === 'low') return '#10B981';
        return '#6B7280';
    };

    const status = task.status || 'Open';
    const priority = task.priority || '';

    return (
        <TouchableOpacity onPress={onPress} style={styles.taskCard}>
            <View style={styles.taskHeader}>
                <View style={[styles.taskIcon, { backgroundColor: getStatusColor(status) + '20' }]}>
                    <Icon name="check-circle" size={18} color={getStatusColor(status)} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle} numberOfLines={2}>{task.subject}</Text>
                    <View style={styles.taskMeta}>
                        <View style={[styles.statusChip, { backgroundColor: getStatusColor(status) + '15' }]}>
                            <Text style={[styles.statusChipText, { color: getStatusColor(status) }]}>
                                {status}
                            </Text>
                        </View>
                        {priority && (
                            <View style={[styles.priorityChip, { backgroundColor: getPriorityColor(priority) + '15' }]}>
                                <Icon name="flag" size={9} color={getPriorityColor(priority)} />
                                <Text style={[styles.priorityText, { color: getPriorityColor(priority) }]}>
                                    {priority}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
                <Icon name="chevron-right" size={14} color="#9CA3AF" />
            </View>
        </TouchableOpacity>
    );
};

const ProjectTasksScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const theme = useTheme();
    const { projectId, projectName } = route.params || {};
    const [detail, setDetail] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [newVisible, setNewVisible] = useState(false);
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [saving, setSaving] = useState(false);

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
        if (!title.trim()) return;
        setSaving(true);
        try {
            await createTask(projectId, title.trim(), desc.trim());
            setNewVisible(false);
            setTitle('');
            setDesc('');
            fetch();
        } catch (e) {
            console.warn('Task create error', e);
        } finally {
            setSaving(false);
        }
    };

    const renderTask = ({ item }) => (
        <TaskCard
            task={item}
            onPress={() =>
                navigation.navigate('ProjectLogsScreen', {
                    projectId,
                    projectName: detail?.project?.project_name || projectName,
                    taskId: item.name,
                    taskSubject: item.subject,
                })
            }
        />
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="arrow-left" size={18} color="#111827" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {projectName || detail?.project?.project_name || 'Project'}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {counts.open} open • {counts.done} done • {counts.total} total
                    </Text>
                </View>
                <View style={styles.headerIcon}>
                    <Icon name="tasks" size={20} color="#8B5CF6" />
                </View>
            </View>

            <View style={styles.addButtonContainer}>
                <TouchableOpacity onPress={() => setNewVisible(true)} style={styles.addButton}>
                    <Icon name="plus" size={14} color="#FFFFFF" />
                    <Text style={styles.addButtonText}>New Task</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <Text style={styles.loadingText}>Loading tasks…</Text>
                </View>
            ) : tasks.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <View style={styles.emptyIcon}>
                        <Icon name="tasks" size={48} color="#D1D5DB" />
                    </View>
                    <Text style={styles.emptyTitle}>No Tasks Yet</Text>
                    <Text style={styles.emptySubtitle}>Create your first task for this project</Text>
                </View>
            ) : (
                <FlatList
                    data={tasks}
                    keyExtractor={(t) => t.name}
                    renderItem={renderTask}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={styles.listContainer}
                />
            )}

            {/* Create Task Modal */}
            <Modal visible={newVisible} animationType="slide" onRequestClose={() => setNewVisible(false)}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Create Task</Text>
                        <TouchableOpacity onPress={() => setNewVisible(false)} style={styles.closeButton}>
                            <Icon name="times" size={18} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.modalBody}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Task Title *</Text>
                            <TextInput
                                placeholder="Enter task title"
                                value={title}
                                onChangeText={setTitle}
                                style={styles.input}
                                placeholderTextColor="#9CA3AF"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Description</Text>
                            <TextInput
                                placeholder="Add task description (optional)"
                                value={desc}
                                onChangeText={setDesc}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                                style={[styles.input, styles.textArea]}
                                placeholderTextColor="#9CA3AF"
                            />
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity 
                                onPress={() => setNewVisible(false)} 
                                style={styles.cancelButton}
                                disabled={saving}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={addTask} 
                                style={[styles.createButton, saving && styles.disabledButton]}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Icon name="plus" size={14} color="#FFFFFF" />
                                        <Text style={styles.createButtonText}>Create Task</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: 20,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    headerIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#8B5CF6' + '15',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 12,
    },
    addButtonContainer: {
        padding: 16,
        paddingBottom: 8,
        backgroundColor: '#FFFFFF',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111827',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#111827',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    addButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
        marginLeft: 8,
    },
    listContainer: {
        padding: 16,
        paddingTop: 8,
        paddingBottom: 24,
    },
    taskCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    taskHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    taskIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    taskTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 6,
    },
    taskMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    statusChip: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusChipText: {
        fontSize: 10,
        fontWeight: '700',
    },
    priorityChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4,
    },
    priorityText: {
        fontSize: 10,
        fontWeight: '700',
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyIcon: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingTop: 24,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#111827',
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalBody: {
        padding: 20,
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 14,
        fontSize: 15,
        color: '#111827',
        backgroundColor: '#FFFFFF',
    },
    textArea: {
        minHeight: 120,
        textAlignVertical: 'top',
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 20,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#6B7280',
    },
    createButton: {
        flex: 1,
        flexDirection: 'row',
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#111827',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        elevation: 2,
        shadowColor: '#111827',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    disabledButton: {
        opacity: 0.6,
    },
    createButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
    },
});

export default ProjectTasksScreen