// src/screens/employee/TaskLogsScreen.js
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { listProjectLogs, startLog, stopLog } from '../../services/project.service';

const LogItem = ({ log, onStop }) => {
    const isOpen = (log.status || '').toLowerCase() !== 'completed';
    return (
        <View style={{ backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 6, padding: 14, borderRadius: 12, elevation: 1 }}>
            <Text style={{ fontWeight: '600' }}>{log.status || 'Open'}</Text>
            {log.message ? <Text style={{ marginTop: 6 }}>{log.message}</Text> : null}
            <Text style={{ color: '#888', marginTop: 8, fontSize: 12 }}>
                {log.started_at ? `Start: ${log.started_at}` : ''}{log.started_at && log.ended_at ? '  •  ' : ''}
                {log.ended_at ? `End: ${log.ended_at}` : ''}
            </Text>
            {log.duration_hrs ? <Text style={{ color: '#888', marginTop: 4, fontSize: 12 }}>Duration: {log.duration_hrs}h</Text> : null}
            {isOpen ? (
                <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
                    <TouchableOpacity onPress={() => onStop(log)} style={{ backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                        <Text style={{ color: '#fff', fontWeight: '600' }}>Stop</Text>
                    </TouchableOpacity>
                </View>
            ) : null}
        </View>
    );
};

export default function MyLogsScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    const { projectId, taskId, taskSubject } = route.params || {};
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState([]);
    const [adding, setAdding] = useState(false);
    const [message, setMessage] = useState('');
    const [stopNote, setStopNote] = useState('');
    const [stoppingLog, setStoppingLog] = useState(null);

    const load = async () => {
        try {
            setLoading(true);
            const list = await listProjectLogs(projectId, { task: taskId, limit: 200 });
            const normalized = (list || []).map(l => ({
                id: l.name,
                status: l.status || 'Open',
                message: l.message || '',
                started_at: l.started_at,
                ended_at: l.ended_at,
                duration_hrs: Number(l.duration_hrs ?? 0),
            })).filter(l => !!l.id);
            setLogs(normalized);
        } catch (e) {
            console.log('listProjectLogs error', e?.message || e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [projectId, taskId]);

    const onStart = async () => {
        const note = message.trim();
        try {
            await startLog({ project: projectId, task: taskId, message: note });
            setMessage('');
            setAdding(false);
            await load();
        } catch (e) {
            console.log('startLog error', e?.message || e);
        }
    };

    const onStop = async () => {
        if (!stoppingLog?.id) return;
        try {
            await stopLog({ log_name: stoppingLog.id, message: stopNote.trim(), new_status: 'Completed' });
            setStopNote('');
            setStoppingLog(null);
            await load();
        } catch (e) {
            console.log('stopLog error', e?.message || e);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1 }}>
            {/* header */}
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fafafa' }}>
                <Text style={{ fontSize: 18, fontWeight: '700' }}>{taskSubject || taskId}</Text>
                <Text style={{ color: '#666' }}>Logs</Text>
            </View>

            {/* actions */}
            <View style={{ padding: 12, flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity
                    onPress={() => setAdding(true)}
                    style={{ backgroundColor: '#111827', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }}
                >
                    <Text style={{ color: 'white', fontWeight: '600' }}>+ Start Log</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator />
                    <Text style={{ marginTop: 8 }}>Loading logs…</Text>
                </View>
            ) : (
                <FlatList
                    data={logs}
                    keyExtractor={(l) => l.id}
                    renderItem={({ item }) => <LogItem log={item} onStop={(log) => setStoppingLog(log)} />}
                    ListEmptyComponent={() => <Text style={{ textAlign: 'center', marginTop: 48 }}>No logs yet.</Text>}
                />
            )}

            {/* start log modal */}
            <Modal transparent animationType="fade" visible={!!adding} onRequestClose={() => setAdding(false)}>
                <Pressable onPress={() => setAdding(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <View />
                </Pressable>
                <View style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Start Log</Text>
                    <TextInput
                        placeholder="What are you starting?"
                        value={message}
                        onChangeText={setMessage}
                        multiline
                        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, minHeight: 90 }}
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                        <TouchableOpacity onPress={() => setAdding(false)} style={{ padding: 10, marginRight: 8 }}>
                            <Text>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onStart} style={{ backgroundColor: '#111827', padding: 10, borderRadius: 8 }}>
                            <Text style={{ color: '#fff', fontWeight: '600' }}>Start</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* stop log modal */}
            <Modal transparent animationType="fade" visible={!!stoppingLog} onRequestClose={() => setStoppingLog(null)}>
                <Pressable onPress={() => setStoppingLog(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <View />
                </Pressable>
                <View style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Stop Log</Text>
                    <Text style={{ color: '#666', marginBottom: 8 }}>{stoppingLog?.message || '(no message)'}</Text>
                    <TextInput
                        placeholder="Add a completion note (optional)"
                        value={stopNote}
                        onChangeText={setStopNote}
                        multiline
                        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, minHeight: 80 }}
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                        <TouchableOpacity onPress={() => setStoppingLog(null)} style={{ padding: 10, marginRight: 8 }}>
                            <Text>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onStop} style={{ backgroundColor: '#111827', padding: 10, borderRadius: 8 }}>
                            <Text style={{ color: '#fff', fontWeight: '600' }}>Stop</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
