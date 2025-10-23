// src/screens/admin/ProjectTasksScreen.js
import React, { useEffect, useState, useCallback } from 'react';
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
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';

import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/common/Button';
import ListItem from '../../components/ui/ListItem';

import { getProjectDetail, listTasks, createTask } from '../../services/project.service';

const ProjectTasksScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { projectId, projectName } = route.params || {};
    const [detail, setDetail] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Create task modal
    const [newVisible, setNewVisible] = useState(false);
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [saving, setSaving] = useState(false);

    const fetch = async () => {
        setLoading(true);
        try {
            const [d, t] = await Promise.all([
                getProjectDetail(projectId),
                listTasks(projectId),
            ]);
            setDetail(d);
            setTasks(t || []);
        } catch (e) {
            console.warn('Project tasks fetch error', e);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetch();
        }, [projectId])
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
        <ListItem
            title={item.subject}
            subtitle={`${item.status || 'Open'}`}
            onPress={() =>
                navigation.navigate('ProjectLogsScreen', {
                    projectId,
                    projectName: detail?.project?.project_name || projectName,
                    taskId: item.name,
                    taskSubject: item.subject,
                })
            }
            rightText={item.status}
        />
    );

    return (
        <View style={{ flex: 1 }}>
            <AppHeader title={projectName || detail?.project?.project_name || 'Project'} back />
            <Section
                right={
                    <Button label="New Task" onPress={() => setNewVisible(true)} />
                }
            >
                {!!detail && (
                    <Text style={styles.meta}>
                        {detail.task_counts?.open_tasks || 0} open • {detail.task_counts?.done_tasks || 0} done •{' '}
                        {detail.task_counts?.total_tasks || 0} total
                    </Text>
                )}
            </Section>

            {loading ? (
                <ActivityIndicator style={{ marginTop: 24 }} />
            ) : tasks.length === 0 ? (
                <EmptyState
                    title="No Tasks"
                    description="Create your first task for this project."
                />
            ) : (
                <FlatList
                    data={tasks}
                    keyExtractor={(t) => t.name}
                    renderItem={renderTask}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                />
            )}

            {/* Create Task Modal */}
            <Modal visible={newVisible} animationType="slide" onRequestClose={() => setNewVisible(false)}>
                <View style={styles.modalWrap}>
                    <Text style={styles.modalTitle}>Create Task</Text>
                    <TextInput
                        placeholder="Title"
                        value={title}
                        onChangeText={setTitle}
                        style={styles.input}
                    />
                    <TextInput
                        placeholder="Description (optional)"
                        value={desc}
                        onChangeText={setDesc}
                        style={[styles.input, { height: 120 }]}
                        multiline
                    />
                    <View style={styles.modalActions}>
                        <Pressable onPress={() => setNewVisible(false)} style={[styles.btn, styles.btnSecondary]}>
                            <Text style={styles.btnTextSecondary}>Cancel</Text>
                        </Pressable>
                        <Pressable onPress={addTask} style={[styles.btn, styles.btnPrimary]} disabled={saving}>
                            <Text style={styles.btnTextPrimary}>{saving ? 'Saving...' : 'Create'}</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    meta: { marginHorizontal: 16, marginTop: 4, color: '#666' },
    modalWrap: { flex: 1, backgroundColor: '#fff', padding: 16 },
    modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10, marginTop: 6 },
    input: {
        backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: '#e9e9ee', marginVertical: 8,
    },
    modalActions: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        flexDirection: 'row', padding: 16, gap: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee',
    },
    btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    btnSecondary: { backgroundColor: '#f3f4f6' },
    btnPrimary: { backgroundColor: '#0ea5e9' },
    btnTextPrimary: { color: '#fff', fontWeight: '700' },
    btnTextSecondary: { color: '#111827', fontWeight: '700' },
});

export default ProjectTasksScreen;
