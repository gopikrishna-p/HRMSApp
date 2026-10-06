// src/screens/admin/ProjectsOverviewScreen.js
//
// All projects with their status and progress (hrms.api.admin_projects). Tapping a project
// opens its tasks; the team button opens a sheet to add employees to the project.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import showToast from '../../utils/Toast';
import {
    adminListProjects,
    getProjectDetail,
    getAllEmployees,
    assignMembers,
    removeMember,
} from '../../services/project.service';
import {
    Screen,
    Group,
    Row,
    Avatar,
    StatusText,
    ProgressBar,
    SearchField,
    IconButton,
    Sheet,
    Button,
    EmptyState,
    Loading,
    Icon,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' -> '12 Oct' (or '12 Oct 2027' outside the current year)
const shortDate = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) {
        return null;
    }
    return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
};

const PROJECT_TONE = { Open: 'info', Completed: 'success', Cancelled: 'neutral' };

const ProjectRow = ({ project, onPress, onManageMembers }) => {
    const progress = Number(project.percent_complete || 0);
    const status = project.status || 'Open';
    const total = Number(project.task_count || 0);
    const done = Number(project.completed_tasks || 0);
    const due = shortDate(project.expected_end_date);
    const subtitle = [
        total ? `${done} of ${total} tasks done` : 'No tasks',
        due ? `Due ${due}` : null,
        project.company,
    ].filter(Boolean).join('  ·  ');

    return (
        <Row
            title={project.project_name || project.name}
            subtitle={subtitle}
            subtitleLines={1}
            meta={(
                <View style={styles.metaLine}>
                    <StatusText label={status} tone={PROJECT_TONE[status]} />
                    <View style={styles.bar}>
                        <ProgressBar value={progress} tone={status === 'Completed' || progress >= 100 ? 'success' : 'accent'} />
                    </View>
                    <Text style={styles.percent}>{Math.round(progress)}%</Text>
                </View>
            )}
            right={<IconButton name="users" onPress={onManageMembers} label="Manage team" />}
            onPress={onPress}
        />
    );
};

const ProjectsOverviewScreen = () => {
    const navigation = useNavigation();
    const [projects, setProjects] = useState([]);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [memberModalVisible, setMemberModalVisible] = useState(false);
    const [memberProject, setMemberProject] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    // team as loaded from the server, to work out who was added or removed on save
    const [initialIds, setInitialIds] = useState(new Set());
    const [savingMembers, setSavingMembers] = useState(false);
    const [loadingMembers, setLoadingMembers] = useState(false);

    const fetch = useCallback(async () => {
        setLoading(true);
        try {
            const data = await adminListProjects({ q });
            setProjects(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn('Projects fetch error', e);
            setProjects([]);
            showToast({ type: 'error', text1: 'Could not load projects', text2: e?.message });
        } finally {
            setLoading(false);
        }
    }, [q]);

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
        }, [fetch])
    );

    const openMembers = async (project) => {
        setMemberProject(project);
        setSelectedIds(new Set());
        setInitialIds(new Set());
        setMemberModalVisible(true);
        setLoadingMembers(true);
        try {
            const [emp, detail] = await Promise.all([getAllEmployees(), getProjectDetail(project.name)]);
            const detailMembers =
                (detail?.project && Array.isArray(detail.project.members) && detail.project.members) ||
                (Array.isArray(detail?.members) && detail.members) ||
                [];
            const active = new Set(detailMembers.map((m) => m.employee_id || m.employee).filter(Boolean));

            setSelectedIds(active);
            setInitialIds(new Set(active));
            setEmployees(emp || []);
        } catch (e) {
            console.warn('Member load error', e);
            setEmployees([]);
            setSelectedIds(new Set());
            showToast({ type: 'error', text1: 'Could not load employees', text2: e?.message });
        } finally {
            setLoadingMembers(false);
        }
    };

    const toggleSelect = (employeeId) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(employeeId)) {
                next.delete(employeeId);
            } else {
                next.add(employeeId);
            }
            return next;
        });
    };

    const saveMembers = async () => {
        if (!memberProject) {
            return;
        }
        const added = [...selectedIds].filter((id) => !initialIds.has(id));
        const removed = [...initialIds].filter((id) => !selectedIds.has(id));
        if (added.length === 0 && removed.length === 0) {
            setMemberModalVisible(false);
            return;
        }
        setSavingMembers(true);
        try {
            if (added.length) {
                await assignMembers(memberProject.name, added);
            }
            for (const id of removed) {
                await removeMember(memberProject.name, id);
            }
            setMemberModalVisible(false);
            showToast({ type: 'success', text1: 'Team updated', text2: memberProject.project_name || memberProject.name });
        } catch (e) {
            console.warn('Assign members error', e);
            showToast({ type: 'error', text1: 'Team not updated', text2: e?.message });
        } finally {
            setSavingMembers(false);
        }
    };

    const closeMembers = () => setMemberModalVisible(false);

    return (
        <View style={styles.flex}>
            <View style={styles.toolbar}>
                <SearchField value={q} onChangeText={setQ} placeholder="Search projects" />
            </View>

            <Screen refreshing={refreshing} onRefresh={onRefresh}>
                {loading && !refreshing && projects.length === 0 ? (
                    <Loading />
                ) : projects.length === 0 ? (
                    <EmptyState
                        icon="folder"
                        title={q ? 'No matching projects' : 'No projects yet'}
                        message={q ? `Nothing matches “${q}”.` : 'New projects will appear here.'}
                    />
                ) : (
                    <Group title={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}>
                        {projects.map((item, i) => (
                            <ProjectRow
                                key={item?.name ?? String(i)}
                                project={item}
                                onPress={() =>
                                    navigation.navigate('ProjectTasksScreen', { projectId: item.name, projectName: item.project_name })
                                }
                                onManageMembers={() => openMembers(item)}
                            />
                        ))}
                    </Group>
                )}
            </Screen>

            <Sheet
                visible={memberModalVisible}
                title="Team"
                subtitle={memberProject ? memberProject.project_name || memberProject.name : undefined}
                onClose={closeMembers}
                dismissable={!savingMembers}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeMembers} disabled={savingMembers} style={styles.flex} />
                        <Button title="Save" onPress={saveMembers} loading={savingMembers} disabled={loadingMembers} style={styles.flex} />
                    </>
                )}
            >
                {loadingMembers ? (
                    <Loading />
                ) : employees.length === 0 ? (
                    <EmptyState icon="users" title="No employees" message="Only active employees with a user account can join a project." />
                ) : (
                    <Group title={`${selectedIds.size} selected`}>
                        {employees.map((item) => {
                            const isSelected = selectedIds.has(item.name);
                            return (
                                <Row
                                    key={item.name}
                                    left={<Avatar name={item.employee_name || item.name} size={32} />}
                                    title={item.employee_name || item.name}
                                    subtitle={item.designation || undefined}
                                    right={isSelected ? <Icon name="check" size={20} color={color.accent} /> : <View style={styles.checkSpace} />}
                                    chevron={false}
                                    onPress={() => toggleSelect(item.name)}
                                />
                            );
                        })}
                    </Group>
                )}
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    metaLine: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: 2 },
    bar: { flex: 1, maxWidth: 160 },
    percent: { ...type.caption, color: color.textSecondary, fontVariant: ['tabular-nums'], minWidth: 32 },
    checkSpace: { width: 20 },
});

export default ProjectsOverviewScreen;
