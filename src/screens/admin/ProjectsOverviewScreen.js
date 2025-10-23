// src/screens/admin/ProjectsOverviewScreen.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    View,
    FlatList,
    RefreshControl,
    Modal,
    Pressable,
    Text,
    TextInput,
    Switch,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ProjectCard from '../../components/project/ProjectCard';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/common/Button';

import {
    listProjects,
    getProjectDetail,
    getAllEmployees,
    assignMembers,
} from '../../services/project.service';

const ProjectsOverviewScreen = () => {
    const navigation = useNavigation();
    const [projects, setProjects] = useState([]);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Member modal state
    const [memberModalVisible, setMemberModalVisible] = useState(false);
    const [memberProject, setMemberProject] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [savingMembers, setSavingMembers] = useState(false);
    const [loadingMembers, setLoadingMembers] = useState(false);

    const fetch = async () => {
        setLoading(true);
        try {
            const data = await listProjects({ q });
            setProjects(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn('Projects fetch error', e);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await fetch();
        } finally {
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetch();
        }, [q])
    );

    const openMembers = async (project) => {
        setMemberProject(project);
        setMemberModalVisible(true);
        setLoadingMembers(true);
        try {
            // preload all employees + current active members
            const [emp, detail] = await Promise.all([getAllEmployees(), getProjectDetail(project.name)]);
            const active = new Set((detail?.members || []).map((m) => m.employee));
            setSelectedIds(active);
            setEmployees(emp || []);
        } catch (e) {
            console.warn('Member load error', e);
        } finally {
            setLoadingMembers(false);
        }
    };

    const toggleSelect = (employeeId) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(employeeId)) next.delete(employeeId);
            else next.add(employeeId);
            return next;
        });
    };

    const saveMembers = async () => {
        if (!memberProject) return;
        setSavingMembers(true);
        try {
            await assignMembers(
                memberProject.name,
                Array.from(selectedIds.values())
            );
            setMemberModalVisible(false);
        } catch (e) {
            console.warn('Assign members error', e);
        } finally {
            setSavingMembers(false);
        }
    };

    const renderItem = ({ item }) => (
        <ProjectCard
            project={item}
            onPress={() =>
                navigation.navigate('ProjectTasksScreen', { projectId: item.name, projectName: item.project_name })
            }
            onManageMembers={() => openMembers(item)}
        />
    );

    return (
        <View style={{ flex: 1 }}>
            <AppHeader title="Projects" />
            <Section>
                <TextInput
                    placeholder="Search projects..."
                    value={q}
                    onChangeText={setQ}
                    style={styles.search}
                    returnKeyType="search"
                />
            </Section>

            {loading ? (
                <ActivityIndicator style={{ marginTop: 24 }} />
            ) : projects.length === 0 ? (
                <EmptyState title="No Projects" description="Projects you have access to will appear here." />
            ) : (
                <FlatList
                    data={projects}
                    keyExtractor={(item, i) => item?.name ?? item?.project?.name ?? String(i)}
                    renderItem={renderItem}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                />
            )}

            {/* Member Manager Modal */}
            <Modal visible={memberModalVisible} animationType="slide" onRequestClose={() => setMemberModalVisible(false)}>
                <View style={styles.modalWrap}>
                    <Text style={styles.modalTitle}>
                        Manage Members {memberProject ? `- ${memberProject.project_name}` : ''}
                    </Text>

                    {loadingMembers ? (
                        <ActivityIndicator style={{ marginTop: 24 }} />
                    ) : (
                        <FlatList
                            data={employees}
                            keyExtractor={(e) => e.name}
                            renderItem={({ item }) => (
                                <View style={styles.memberRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.memberName}>{item.employee_name || item.name}</Text>
                                        <Text style={styles.memberSub}>{item.designation || ''}</Text>
                                    </View>
                                    <Switch
                                        value={selectedIds.has(item.name)}
                                        onValueChange={() => toggleSelect(item.name)}
                                    />
                                </View>
                            )}
                            contentContainerStyle={{ paddingBottom: 120 }}
                        />
                    )}

                    <View style={styles.modalActions}>
                        <Pressable onPress={() => setMemberModalVisible(false)} style={[styles.btn, styles.btnSecondary]}>
                            <Text style={styles.btnTextSecondary}>Cancel</Text>
                        </Pressable>
                        <Pressable onPress={saveMembers} style={[styles.btn, styles.btnPrimary]} disabled={savingMembers}>
                            <Text style={styles.btnTextPrimary}>{savingMembers ? 'Saving...' : 'Save'}</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    search: {
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: '#e9e9ee',
        marginHorizontal: 16,
        marginBottom: 6,
    },
    modalWrap: { flex: 1, backgroundColor: '#fff' },
    modalTitle: { fontSize: 18, fontWeight: '700', padding: 16, paddingTop: 20 },
    memberRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f1f4',
    },
    memberName: { fontSize: 16, fontWeight: '600' },
    memberSub: { fontSize: 12, color: '#666' },
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

export default ProjectsOverviewScreen;
