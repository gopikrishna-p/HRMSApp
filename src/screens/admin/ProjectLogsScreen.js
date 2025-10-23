// src/screens/admin/ProjectLogsScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    FlatList,
    RefreshControl,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';

import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/common/Button';
import LogListItem from '../../components/project/LogListItem';
import LogFormModal from '../../components/project/LogFormModal';

import { listProjectLogs, startLog, stopLog } from '../../services/project.service';

const ProjectLogsScreen = () => {
    const route = useRoute();
    const { projectId, projectName, taskId, taskSubject } = route.params || {};
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [startVisible, setStartVisible] = useState(false); // LogFormModal
    const [starting, setStarting] = useState(false);

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

    const onStartSubmit = async ({ message }) => {
        setStarting(true);
        try {
            await startLog({ project: projectId, task: taskId, message });
            setStartVisible(false);
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
            onPress={() => { }}
            onStop={item.status === 'In Progress' ? () => onStop(item) : undefined}
        />
    );

    return (
        <View style={{ flex: 1 }}>
            <AppHeader
                title={taskSubject ? `${taskSubject}` : (projectName || 'Logs')}
                subtitle={projectName && taskSubject ? projectName : undefined}
                back
            />
            <Section right={<Button label="Start Log" onPress={() => setStartVisible(true)} />} />

            {loading ? (
                <ActivityIndicator style={{ marginTop: 24 }} />
            ) : logs.length === 0 ? (
                <EmptyState
                    title="No Logs"
                    description="Start logging work to see entries here."
                />
            ) : (
                <FlatList
                    data={logs}
                    keyExtractor={(l) => l.name}
                    renderItem={renderLog}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                />
            )}

            {/* Start Log Modal */}
            <LogFormModal
                visible={startVisible}
                title="Start Log"
                onClose={() => setStartVisible(false)}
                loading={starting}
                onSubmit={onStartSubmit}
            // The modal typically asks for "message" (notes).
            // If your component expects different props, adjust here.
            />
        </View>
    );
};

export default ProjectLogsScreen;
