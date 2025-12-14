// src/screens/admin/ProjectsOverviewScreen.js
import React, { useCallback, useState } from 'react';
import {
    View,
    FlatList,
    RefreshControl,
    Modal,
    Pressable,
    Text,
    Switch,
    ActivityIndicator,
    StyleSheet,
    TouchableOpacity,
    TextInput as RNTextInput,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

import {
    adminListProjects,
    getProjectDetail,
    getAllEmployees,
    assignMembers,
    updateProject,
    deleteProject,
} from '../../services/project.service';
import AddProjectModal from '../../components/admin/AddProjectModal';
import { Alert } from 'react-native';

const EnhancedProjectCard = ({ project, onPress, onManageMembers, onEdit, onDelete }) => {
    const getStatusColor = (status) => {
        switch (status) {
            case 'Open': return '#3B82F6';
            case 'Working': return '#8B5CF6';
            case 'Completed': return '#10B981';
            case 'Cancelled': return '#EF4444';
            default: return '#6B7280';
        }
    };

    const getProgressColor = (progress) => {
        if (progress >= 75) return '#10B981';
        if (progress >= 50) return '#8B5CF6';
        if (progress >= 25) return '#F59E0B';
        return '#3B82F6';
    };

    const progress = Number(project.percent_complete || 0);
    const status = project.status || 'Open';

    return (
        <TouchableOpacity onPress={onPress} style={styles.projectCard}>
            <View style={styles.cardHeader}>
                <View style={styles.cardTitleContainer}>
                    <View style={[styles.projectIcon, { backgroundColor: getStatusColor(status) + '20' }]}>
                        <Icon name="folder-open" size={20} color={getStatusColor(status)} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.projectTitle} numberOfLines={1}>
                            {project.project_name || project.name}
                        </Text>
                        {project.company && (
                            <View style={styles.companyContainer}>
                                <Icon name="building" size={11} color="#6B7280" />
                                <Text style={styles.companyText} numberOfLines={1}>{project.company}</Text>
                            </View>
                        )}
                    </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '15' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(status) }]}>{status}</Text>
                </View>
            </View>

            <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>Progress</Text>
                    <Text style={[styles.progressValue, { color: getProgressColor(progress) }]}>
                        {Math.round(progress)}%
                    </Text>
                </View>
                <View style={styles.progressBarContainer}>
                    <View
                        style={[
                            styles.progressBar,
                            {
                                width: `${Math.max(0, Math.min(100, progress))}%`,
                                backgroundColor: getProgressColor(progress),
                            }
                        ]}
                    />
                </View>
            </View>

            <View style={styles.cardFooter}>
                <TouchableOpacity onPress={onManageMembers} style={styles.membersButton}>
                    <Icon name="users" size={12} color="#8B5CF6" />
                    <Text style={styles.membersButtonText}>Manage Team</Text>
                </TouchableOpacity>
                <View style={styles.cardActions}>
                    <TouchableOpacity onPress={onEdit} style={styles.actionButton}>
                        <Icon name="edit" size={14} color="#3B82F6" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onDelete} style={styles.actionButtonDelete}>
                        <Icon name="trash-alt" size={14} color="#EF4444" />
                    </TouchableOpacity>
                    <Icon name="chevron-right" size={14} color="#9CA3AF" />
                </View>
            </View>
        </TouchableOpacity>
    );
};

const ProjectsOverviewScreen = () => {
    const navigation = useNavigation();
    const theme = useTheme();
    const [projects, setProjects] = useState([]);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [memberModalVisible, setMemberModalVisible] = useState(false);
    const [memberProject, setMemberProject] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [savingMembers, setSavingMembers] = useState(false);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [addProjectModalVisible, setAddProjectModalVisible] = useState(false);

    // Edit project state
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editProject, setEditProject] = useState(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editStatus, setEditStatus] = useState('Open');
    const [editPriority, setEditPriority] = useState('Medium');
    const [savingEdit, setSavingEdit] = useState(false);

    const fetch = useCallback(async () => {
        setLoading(true);
        try {
            const data = await adminListProjects({ q });
            setProjects(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn('Projects fetch error', e);
            setProjects([]);
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
        setMemberModalVisible(true);
        setLoadingMembers(true);
        try {
            const [emp, detail] = await Promise.all([getAllEmployees(), getProjectDetail(project.name)]);
            const detailMembers =
                (detail?.project && Array.isArray(detail.project.members) && detail.project.members) ||
                (Array.isArray(detail?.members) && detail.members) ||
                [];
            const active = new Set(detailMembers.map((m) => m.employee).filter(Boolean));

            setSelectedIds(active);
            setEmployees(emp || []);
        } catch (e) {
            console.warn('Member load error', e);
            setEmployees([]);
            setSelectedIds(new Set());
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
            await assignMembers(memberProject.name, Array.from(selectedIds.values()));
            setMemberModalVisible(false);
        } catch (e) {
            console.warn('Assign members error', e);
        } finally {
            setSavingMembers(false);
        }
    };

    // Edit project handlers
    const openEditModal = (project) => {
        setEditProject(project);
        setEditName(project.project_name || '');
        setEditDescription(project.description || '');
        setEditStatus(project.status || 'Open');
        setEditPriority(project.priority || 'Medium');
        setEditModalVisible(true);
    };

    const handleSaveEdit = async () => {
        if (!editProject || !editName.trim()) {
            Alert.alert('Validation Error', 'Project name is required');
            return;
        }

        setSavingEdit(true);
        try {
            await updateProject(editProject.name, {
                project_name: editName.trim(),
                description: editDescription.trim() || null,
                status: editStatus,
                priority: editPriority,
            });
            Alert.alert('Success', 'Project updated successfully!');
            setEditModalVisible(false);
            fetch();
        } catch (error) {
            console.error('Update project error:', error);
            Alert.alert('Error', error?.message || 'Failed to update project');
        } finally {
            setSavingEdit(false);
        }
    };

    // Delete project handler
    const handleDeleteProject = (project) => {
        Alert.alert(
            'Delete Project',
            `Are you sure you want to delete "${project.project_name}"? This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteProject(project.name);
                            Alert.alert('Success', 'Project deleted successfully!');
                            fetch();
                        } catch (error) {
                            console.error('Delete project error:', error);
                            Alert.alert('Error', error?.message || 'Failed to delete project');
                        }
                    },
                },
            ]
        );
    };

    const renderItem = ({ item }) => (
        <EnhancedProjectCard
            project={item}
            onPress={() =>
                navigation.navigate('ProjectTasksScreen', { projectId: item.name, projectName: item.project_name })
            }
            onManageMembers={() => openMembers(item)}
            onEdit={() => openEditModal(item)}
            onDelete={() => handleDeleteProject(item)}
        />
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Projects Overview</Text>
                    <Text style={styles.headerSubtitle}>{projects.length} project{projects.length !== 1 ? 's' : ''}</Text>
                </View>
                <TouchableOpacity 
                    onPress={() => setAddProjectModalVisible(true)}
                    style={styles.addButton}
                >
                    <Icon name="plus" size={20} color="#FFFFFF" />
                </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.searchBox}>
                    <Icon name="search" size={16} color="#9CA3AF" />
                    <RNTextInput
                        placeholder="Search projects..."
                        value={q}
                        onChangeText={setQ}
                        style={styles.searchInput}
                        placeholderTextColor="#9CA3AF"
                    />
                    {q ? (
                        <TouchableOpacity onPress={() => setQ('')}>
                            <Icon name="times-circle" size={16} color="#9CA3AF" />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <Text style={styles.loadingText}>Loading projects…</Text>
                </View>
            ) : projects.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <View style={styles.emptyIcon}>
                        <Icon name="folder-open" size={48} color="#D1D5DB" />
                    </View>
                    <Text style={styles.emptyTitle}>No Projects Found</Text>
                    <Text style={styles.emptySubtitle}>
                        {q ? 'Try adjusting your search' : 'All projects will appear here'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={projects}
                    keyExtractor={(item, i) => item?.name ?? String(i)}
                    renderItem={renderItem}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={styles.listContainer}
                />
            )}

            {/* Member Manager Modal */}
            <Modal visible={memberModalVisible} animationType="slide" onRequestClose={() => setMemberModalVisible(false)}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.modalTitle}>Manage Team</Text>
                            {memberProject && (
                                <Text style={styles.modalSubtitle}>{memberProject.project_name}</Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={() => setMemberModalVisible(false)} style={styles.closeButton}>
                            <Icon name="times" size={18} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.selectedCount}>
                        <Icon name="users" size={14} color="#8B5CF6" />
                        <Text style={styles.selectedCountText}>
                            {selectedIds.size} member{selectedIds.size !== 1 ? 's' : ''} selected
                        </Text>
                    </View>

                    {loadingMembers ? (
                        <View style={styles.centerContainer}>
                            <ActivityIndicator size="large" color="#8B5CF6" />
                            <Text style={styles.loadingText}>Loading employees…</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={employees}
                            keyExtractor={(e) => e.name}
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    onPress={() => toggleSelect(item.name)}
                                    style={[
                                        styles.memberRow,
                                        selectedIds.has(item.name) && styles.memberRowSelected
                                    ]}
                                >
                                    <View style={[
                                        styles.memberAvatar,
                                        selectedIds.has(item.name) && styles.memberAvatarSelected
                                    ]}>
                                        <Icon 
                                            name="user" 
                                            size={16} 
                                            color={selectedIds.has(item.name) ? '#8B5CF6' : '#9CA3AF'} 
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.memberName}>{item.employee_name || item.name}</Text>
                                        {item.designation && (
                                            <Text style={styles.memberDesignation}>{item.designation}</Text>
                                        )}
                                    </View>
                                    <Switch 
                                        value={selectedIds.has(item.name)} 
                                        onValueChange={() => toggleSelect(item.name)}
                                        trackColor={{ false: '#E5E7EB', true: '#8B5CF6' }}
                                        thumbColor={selectedIds.has(item.name) ? '#FFFFFF' : '#F3F4F6'}
                                    />
                                </TouchableOpacity>
                            )}
                            contentContainerStyle={{ paddingBottom: 100 }}
                        />
                    )}

                    <View style={styles.modalActions}>
                        <TouchableOpacity 
                            onPress={() => setMemberModalVisible(false)} 
                            style={styles.cancelButton}
                            disabled={savingMembers}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={saveMembers} 
                            style={[styles.saveButton, savingMembers && styles.disabledButton]}
                            disabled={savingMembers}
                        >
                            {savingMembers ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <>
                                    <Icon name="check" size={14} color="#FFFFFF" />
                                    <Text style={styles.saveButtonText}>Save Changes</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Add Project Modal */}
            <AddProjectModal 
                visible={addProjectModalVisible}
                onClose={() => setAddProjectModalVisible(false)}
                onProjectCreated={(newProject) => {
                    // Refresh projects list
                    fetch();
                }}
            />

            {/* Edit Project Modal */}
            <Modal visible={editModalVisible} animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.modalTitle}>Edit Project</Text>
                            {editProject && (
                                <Text style={styles.modalSubtitle}>{editProject.name}</Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.closeButton}>
                            <Icon name="times" size={18} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.editFormContainer}>
                        {/* Project Name */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Project Name *</Text>
                            <View style={styles.inputContainer}>
                                <Icon name="folder" size={16} color="#9CA3AF" />
                                <RNTextInput
                                    style={styles.formInput}
                                    placeholder="Enter project name"
                                    value={editName}
                                    onChangeText={setEditName}
                                    placeholderTextColor="#9CA3AF"
                                    editable={!savingEdit}
                                />
                            </View>
                        </View>

                        {/* Description */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Description</Text>
                            <View style={[styles.inputContainer, styles.textareaContainer]}>
                                <Icon name="align-left" size={16} color="#9CA3AF" style={{ marginTop: 12 }} />
                                <RNTextInput
                                    style={[styles.formInput, styles.textarea]}
                                    placeholder="Enter project description"
                                    value={editDescription}
                                    onChangeText={setEditDescription}
                                    placeholderTextColor="#9CA3AF"
                                    multiline={true}
                                    numberOfLines={4}
                                    editable={!savingEdit}
                                />
                            </View>
                        </View>

                        {/* Status */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Status</Text>
                            <View style={styles.optionsContainer}>
                                {['Open', 'Working', 'Completed', 'Cancelled'].map((s) => (
                                    <TouchableOpacity
                                        key={s}
                                        onPress={() => setEditStatus(s)}
                                        style={[
                                            styles.optionButton,
                                            editStatus === s && styles.optionButtonActive,
                                        ]}
                                        disabled={savingEdit}
                                    >
                                        <Text
                                            style={[
                                                styles.optionButtonText,
                                                editStatus === s && styles.optionButtonTextActive,
                                            ]}
                                        >
                                            {s}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Priority */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Priority</Text>
                            <View style={styles.optionsContainer}>
                                {['Low', 'Medium', 'High'].map((p) => (
                                    <TouchableOpacity
                                        key={p}
                                        onPress={() => setEditPriority(p)}
                                        style={[
                                            styles.optionButton,
                                            editPriority === p && styles.optionButtonActive,
                                        ]}
                                        disabled={savingEdit}
                                    >
                                        <Text
                                            style={[
                                                styles.optionButtonText,
                                                editPriority === p && styles.optionButtonTextActive,
                                            ]}
                                        >
                                            {p}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>

                    <View style={styles.modalActions}>
                        <TouchableOpacity 
                            onPress={() => setEditModalVisible(false)} 
                            style={styles.cancelButton}
                            disabled={savingEdit}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={handleSaveEdit} 
                            style={[styles.saveButton, savingEdit && styles.disabledButton]}
                            disabled={savingEdit}
                        >
                            {savingEdit ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <>
                                    <Icon name="check" size={14} color="#FFFFFF" />
                                    <Text style={styles.saveButtonText}>Save Changes</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
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
    headerTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    headerIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#8B5CF6' + '15',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#8B5CF6',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
        shadowColor: '#8B5CF6',
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    searchContainer: {
        padding: 16,
        paddingBottom: 8,
        backgroundColor: '#FFFFFF',
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#111827',
        padding: 0,
    },
    listContainer: {
        padding: 16,
        paddingTop: 8,
        paddingBottom: 24,
    },
    projectCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 14,
    },
    cardTitleContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 12,
    },
    projectIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    projectTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    companyContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    companyText: {
        fontSize: 12,
        color: '#6B7280',
        marginLeft: 6,
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    progressSection: {
        marginBottom: 12,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressLabel: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '600',
    },
    progressValue: {
        fontSize: 14,
        fontWeight: '700',
    },
    progressBarContainer: {
        height: 8,
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        overflow: 'hidden',
    },
    progressBar: {
        height: 8,
        borderRadius: 8,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    membersButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#8B5CF6' + '15',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    membersButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#8B5CF6',
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
    modalSubtitle: {
        fontSize: 13,
        color: '#8B5CF6',
        marginTop: 2,
        fontWeight: '600',
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectedCount: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#8B5CF6' + '10',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        gap: 8,
    },
    selectedCountText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#8B5CF6',
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        marginHorizontal: 16,
        marginVertical: 4,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    memberRowSelected: {
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF6' + '05',
    },
    memberAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    memberAvatarSelected: {
        backgroundColor: '#8B5CF6' + '20',
    },
    memberName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111827',
    },
    memberDesignation: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    modalActions: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        padding: 16,
        gap: 12,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
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
    saveButton: {
        flex: 1,
        flexDirection: 'row',
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#8B5CF6',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        elevation: 2,
        shadowColor: '#8B5CF6',
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    disabledButton: {
        opacity: 0.6,
    },
    saveButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    // Card action buttons
    cardActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionButton: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#3B82F6' + '15',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonDelete: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#EF4444' + '15',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Edit form styles
    editFormContainer: {
        flex: 1,
        padding: 16,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 10,
    },
    textareaContainer: {
        alignItems: 'flex-start',
    },
    formInput: {
        flex: 1,
        fontSize: 15,
        color: '#111827',
        padding: 0,
    },
    textarea: {
        textAlignVertical: 'top',
        paddingTop: 8,
        minHeight: 80,
    },
    optionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    optionButton: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
    },
    optionButtonActive: {
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF6' + '15',
    },
    optionButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
    },
    optionButtonTextActive: {
        color: '#8B5CF6',
    },
});

export default ProjectsOverviewScreen;