// src/screens/employee/MyTasksScreen.js
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    SafeAreaView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    StyleSheet,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { listTasks, createTask } from '../../services/project.service';
import Icon from 'react-native-vector-icons/FontAwesome5';

const TaskRow = ({ t, onOpen }) => {
    const getStatusColor = (status) => {
        switch (status) {
            case 'Open': return '#3B82F6';
            case 'Working': return '#8B5CF6';
            case 'Completed': return '#10B981';
            case 'Cancelled': return '#EF4444';
            case 'Pending Review': return '#F59E0B';
            default: return '#6B7280';
        }
    };

    const getProgressColor = (progress) => {
        if (progress >= 75) return '#10B981';
        if (progress >= 50) return '#8B5CF6';
        if (progress >= 25) return '#F59E0B';
        return '#3B82F6';
    };

    return (
        <TouchableOpacity onPress={() => onOpen(t)} style={styles.taskCard}>
            <View style={styles.taskHeader}>
                <View style={[styles.taskIcon, { backgroundColor: getStatusColor(t.status) + '20' }]}>
                    <Icon name="check-circle" size={16} color={getStatusColor(t.status)} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle} numberOfLines={2}>{t.subject}</Text>
                    <View style={styles.taskMeta}>
                        <View style={[styles.statusChip, { backgroundColor: getStatusColor(t.status) + '15' }]}>
                            <Text style={[styles.statusChipText, { color: getStatusColor(t.status) }]}>
                                {t.status}
                            </Text>
                        </View>
                        <Text style={styles.progressText}>
                            <Icon name="chart-line" size={10} color={getProgressColor(t.progress)} />
                            {' '}{Math.round(t.progress || 0)}%
                        </Text>
                    </View>
                </View>
            </View>

            {t.exp_end_date && (
                <View style={styles.dueDateContainer}>
                    <Icon name="calendar-alt" size={11} color="#6B7280" />
                    <Text style={styles.dueDateText}>Due: {t.exp_end_date}</Text>
                </View>
            )}

            <View style={styles.progressBarContainer}>
                <View
                    style={[
                        styles.progressBar,
                        {
                            width: `${Math.max(0, Math.min(100, t.progress || 0))}%`,
                            backgroundColor: getProgressColor(t.progress),
                        }
                    ]}
                />
            </View>
        </TouchableOpacity>
    );
};

export default function MyTasksScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    const { projectId, projectName } = route.params || {};
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState([]);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

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
                }))
                .filter((t) => !!t.id);
            setTasks(normalized);
        } catch (e) {
            console.log('listTasks error', e?.message || e);
            setTasks([]);
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
        });
    };

    const onCreate = async () => {
        const subject = title.trim();
        if (!subject) return;
        try {
            await createTask(projectId, subject, description);
            setTitle('');
            setDescription('');
            setCreating(false);
            await load();
        } catch (e) {
            console.log('createTask error', e?.message || e);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="arrow-left" size={18} color="#111827" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{projectName || projectId}</Text>
                    <Text style={styles.headerSubtitle}>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.headerIcon}>
                    <Icon name="tasks" size={20} color="#8B5CF6" />
                </View>
            </View>

            <View style={styles.addButtonContainer}>
                <TouchableOpacity onPress={() => setCreating(true)} style={styles.addButton}>
                    <Icon name="plus" size={14} color="#FFFFFF" />
                    <Text style={styles.addButtonText}>Add Task</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <Text style={styles.loadingText}>Loading tasks…</Text>
                </View>
            ) : (
                <FlatList
                    data={tasks}
                    keyExtractor={(t) => t.id}
                    renderItem={({ item }) => <TaskRow t={item} onOpen={openTask} />}
                    contentContainerStyle={styles.listContainer}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIcon}>
                                <Icon name="tasks" size={48} color="#D1D5DB" />
                            </View>
                            <Text style={styles.emptyTitle}>No Tasks Yet</Text>
                            <Text style={styles.emptySubtitle}>Create your first task to get started</Text>
                        </View>
                    )}
                />
            )}

            <Modal transparent animationType="slide" visible={!!creating} onRequestClose={() => setCreating(false)}>
                <Pressable onPress={() => setCreating(false)} style={styles.modalOverlay}>
                    <View />
                </Pressable>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>New Task</Text>
                        <TouchableOpacity onPress={() => setCreating(false)} style={styles.closeButton}>
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
                                value={description}
                                onChangeText={setDescription}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                                style={[styles.input, styles.textArea]}
                                placeholderTextColor="#9CA3AF"
                            />
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setCreating(false)} style={styles.cancelButton}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onCreate} style={styles.createButton}>
                                <Icon name="plus" size={14} color="#FFFFFF" />
                                <Text style={styles.createButtonText}>Create Task</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

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
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    taskIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
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
        gap: 10,
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
    progressText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#6B7280',
    },
    dueDateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        paddingLeft: 48,
    },
    dueDateText: {
        fontSize: 11,
        color: '#6B7280',
        marginLeft: 6,
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: '#F3F4F6',
        borderRadius: 6,
        overflow: 'hidden',
        marginTop: 4,
    },
    progressBar: {
        height: 6,
        borderRadius: 6,
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
        alignItems: 'center',
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
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
        backgroundColor: '#F9FAFB',
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
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
    createButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
    },
});