// src/screens/employee/MyLogsScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    FlatList,
    RefreshControl,
    ActivityIndicator,
    Alert,
    TouchableOpacity,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    TextInput,
    SafeAreaView,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';

import { listProjectLogs, startLog, stopLog } from '../../services/project.service';

const LogListItem = ({ log, onStop }) => {
    const getStatusColor = (status) => {
        switch (status) {
            case 'In Progress': return '#8B5CF6';
            case 'Completed': return '#10B981';
            case 'Paused': return '#F59E0B';
            default: return '#6B7280';
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch {
            return dateString;
        }
    };

    const isInProgress = log.status === 'In Progress';

    return (
        <View style={styles.logCard}>
            <View style={styles.logHeader}>
                <View style={[styles.logIcon, { backgroundColor: getStatusColor(log.status) + '20' }]}>
                    <Icon name={isInProgress ? 'play-circle' : 'check-circle'} size={18} color={getStatusColor(log.status)} />
                </View>
                <View style={{ flex: 1 }}>
                    <View style={styles.logTitleRow}>
                        <Text style={styles.logTitle} numberOfLines={1}>Work Log</Text>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(log.status) + '15' }]}>
                            <View style={[styles.statusDot, { backgroundColor: getStatusColor(log.status) }]} />
                            <Text style={[styles.statusText, { color: getStatusColor(log.status) }]}>
                                {log.status}
                            </Text>
                        </View>
                    </View>
                    {log.message && <Text style={styles.logMessage} numberOfLines={2}>{log.message}</Text>}
                </View>
            </View>

            <View style={styles.logDetails}>
                <View style={styles.logDetailRow}>
                    <Icon name="clock" size={12} color="#6B7280" />
                    <Text style={styles.logDetailText}>Started: {formatDate(log.from_time)}</Text>
                </View>
                {log.to_time && (
                    <View style={styles.logDetailRow}>
                        <Icon name="flag-checkered" size={12} color="#6B7280" />
                        <Text style={styles.logDetailText}>Ended: {formatDate(log.to_time)}</Text>
                    </View>
                )}
                {log.hours && (
                    <View style={styles.logDetailRow}>
                        <Icon name="hourglass-half" size={12} color="#6B7280" />
                        <Text style={styles.logDetailText}>Duration: {log.hours} hrs</Text>
                    </View>
                )}
            </View>

            {isInProgress && onStop && (
                <TouchableOpacity onPress={onStop} style={styles.stopButton}>
                    <Icon name="stop-circle" size={14} color="#FFFFFF" />
                    <Text style={styles.stopButtonText}>Stop Log</Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const ProjectLogsScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { projectId, projectName, taskId, taskSubject } = route.params || {};
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [startVisible, setStartVisible] = useState(false);
    const [starting, setStarting] = useState(false);
    const [message, setMessage] = useState('');

    const fetch = async () => {
        setLoading(true);
        try {
            const data = await listProjectLogs(projectId, { task: taskId });
            setLogs(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn('Logs fetch error', e);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetch();
        }, [projectId, taskId])
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
        setStarting(true);
        try {
            await startLog({ project: projectId, task: taskId, message });
            setStartVisible(false);
            setMessage('');
            fetch();
        } catch (e) {
            console.warn('Start log error', e);
        } finally {
            setStarting(false);
        }
    };

    const onStop = async (log) => {
        Alert.alert('Stop Log', 'Mark this log as completed?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Stop',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await stopLog({ log_name: log.name, message: '' });
                        fetch();
                    } catch (e) {
                        console.warn('Stop log error', e);
                    }
                },
            },
        ]);
    };

    const renderLog = ({ item }) => (
        <LogListItem
            log={item}
            onStop={item.status === 'In Progress' ? () => onStop(item) : undefined}
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
                        {taskSubject || projectName || 'Logs'}
                    </Text>
                    {taskSubject && projectName && (
                        <Text style={styles.headerSubtitle} numberOfLines={1}>{projectName}</Text>
                    )}
                    <Text style={styles.headerCount}>{logs.length} log{logs.length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.headerIcon}>
                    <Icon name="clipboard-list" size={20} color="#8B5CF6" />
                </View>
            </View>

            <View style={styles.addButtonContainer}>
                <TouchableOpacity onPress={() => setStartVisible(true)} style={styles.startButton}>
                    <Icon name="play" size={14} color="#FFFFFF" />
                    <Text style={styles.startButtonText}>Start Log</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <Text style={styles.loadingText}>Loading logs…</Text>
                </View>
            ) : logs.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <View style={styles.emptyIcon}>
                        <Icon name="clipboard-list" size={48} color="#D1D5DB" />
                    </View>
                    <Text style={styles.emptyTitle}>No Logs Yet</Text>
                    <Text style={styles.emptySubtitle}>Start logging work to see entries here</Text>
                </View>
            ) : (
                <FlatList
                    data={logs}
                    keyExtractor={(l) => l.name}
                    renderItem={renderLog}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={styles.listContainer}
                />
            )}

            {/* Start Log Modal */}
            <Modal transparent animationType="slide" visible={startVisible} onRequestClose={() => setStartVisible(false)}>
                <Pressable onPress={() => setStartVisible(false)} style={styles.modalOverlay}>
                    <View />
                </Pressable>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Start Work Log</Text>
                        <TouchableOpacity onPress={() => setStartVisible(false)} style={styles.closeButton}>
                            <Icon name="times" size={18} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.modalBody}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Notes (Optional)</Text>
                            <TextInput
                                placeholder="Add notes about what you're working on..."
                                value={message}
                                onChangeText={setMessage}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                                style={[styles.input, styles.textArea]}
                                placeholderTextColor="#9CA3AF"
                            />
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity 
                                onPress={() => setStartVisible(false)} 
                                style={styles.cancelButton}
                                disabled={starting}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={onStartSubmit} 
                                style={[styles.createButton, starting && styles.disabledButton]}
                                disabled={starting}
                            >
                                {starting ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Icon name="play" size={14} color="#FFFFFF" />
                                        <Text style={styles.createButtonText}>Start Logging</Text>
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

export default ProjectLogsScreen;

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
        fontSize: 18,
        fontWeight: '800',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 11,
        color: '#8B5CF6',
        marginTop: 1,
        fontWeight: '600',
    },
    headerCount: {
        fontSize: 11,
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
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#10B981',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#10B981',
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    startButtonText: {
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
    logCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    logHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    logIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    logTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    logTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
        flex: 1,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        gap: 6,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    logMessage: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    logDetails: {
        paddingLeft: 52,
        gap: 6,
    },
    logDetailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    logDetailText: {
        fontSize: 12,
        color: '#6B7280',
    },
    stopButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EF4444',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        marginTop: 12,
        gap: 8,
    },
    stopButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
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
        maxHeight: '70%',
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
        backgroundColor: '#10B981',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        elevation: 2,
        shadowColor: '#10B981',
        shadowOpacity: 0.3,
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