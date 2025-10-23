// src/screens/employee/EmployeeProjectTasksScreen.js
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { listTasks, createTask } from '../../services/project.service';

const TaskRow = ({ t, onOpen }) => (
    <TouchableOpacity
        onPress={() => onOpen(t)}
        style={{
            backgroundColor: '#fff',
            marginHorizontal: 16,
            marginVertical: 6,
            padding: 14,
            borderRadius: 12,
            elevation: 1,
        }}
    >
        <Text style={{ fontWeight: '600' }}>{t.subject}</Text>
        <Text style={{ color: '#666', marginTop: 4 }}>Status: {t.status} • {Math.round(t.progress || 0)}%</Text>
        {t.exp_end_date && <Text style={{ color: '#888', marginTop: 2 }}>Due: {t.exp_end_date}</Text>}
    </TouchableOpacity>
);

export default function MyTasksScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    const { projectId, projectName } = route.params || {};
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState([]);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const load = async () => {
        try {
            setLoading(true);
            const data = await listTasks(projectId, { status: undefined, limit: 200 });
            // Normalize: backend might send title/subject/progress
            const normalized = (data || []).map(t => ({
                id: t.name,
                subject: t.subject || t.title || t.name,
                status: t.status || 'Open',
                progress: Number(t.progress ?? t.percent_complete ?? 0),
                project: t.project || projectId,
                exp_start_date: t.exp_start_date,
                exp_end_date: t.exp_end_date,
                description: t.description,
            })).filter(t => !!t.id);
            setTasks(normalized);
        } catch (e) {
            console.log('listTasks error', e?.message || e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [projectId]);

    const openTask = (t) => {
        navigation.navigate('MyLogsScreen', {
            projectId,
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
        <SafeAreaView style={{ flex: 1 }}>
            {/* header */}
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fafafa' }}>
                <Text style={{ fontSize: 18, fontWeight: '700' }}>{projectName || projectId}</Text>
                <Text style={{ color: '#666' }}>Tasks</Text>
            </View>

            {/* add button */}
            <View style={{ padding: 12, alignItems: 'flex-end' }}>
                <TouchableOpacity
                    onPress={() => setCreating(true)}
                    style={{ backgroundColor: '#111827', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }}
                >
                    <Text style={{ color: 'white', fontWeight: '600' }}>+ Add Task</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator />
                    <Text style={{ marginTop: 8 }}>Loading tasks…</Text>
                </View>
            ) : (
                <FlatList
                    data={tasks}
                    keyExtractor={(t) => t.id}
                    renderItem={({ item }) => <TaskRow t={item} onOpen={openTask} />}
                    ListEmptyComponent={() => <Text style={{ textAlign: 'center', marginTop: 48 }}>No tasks yet.</Text>}
                />
            )}

            {/* create modal */}
            <Modal transparent animationType="fade" visible={!!creating} onRequestClose={() => setCreating(false)}>
                <Pressable onPress={() => setCreating(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <View />
                </Pressable>
                <View style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12 }}>New Task</Text>
                    <TextInput
                        placeholder="Title"
                        value={title}
                        onChangeText={setTitle}
                        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, marginBottom: 10 }}
                    />
                    <TextInput
                        placeholder="Description (optional)"
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, minHeight: 90 }}
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                        <TouchableOpacity onPress={() => setCreating(false)} style={{ padding: 10, marginRight: 8 }}>
                            <Text>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onCreate} style={{ backgroundColor: '#111827', padding: 10, borderRadius: 8 }}>
                            <Text style={{ color: '#fff', fontWeight: '600' }}>Create</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
