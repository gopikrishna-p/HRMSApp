// src/components/admin/AddProjectModal.js
import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput as RNTextInput,
    ActivityIndicator,
    ScrollView,
    Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { createProject } from '../../services/project.service';

const AddProjectModal = ({ visible, onClose, onProjectCreated }) => {
    const [projectName, setProjectName] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [loading, setLoading] = useState(false);

    const resetForm = () => {
        setProjectName('');
        setDescription('');
        setStartDate('');
        setEndDate('');
        setPriority('Medium');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleCreate = async () => {
        if (!projectName.trim()) {
            Alert.alert('Validation Error', 'Project name is required');
            return;
        }

        setLoading(true);
        try {
            const newProject = await createProject({
                project_name: projectName,
                description: description || null,
                expected_start_date: startDate || null,
                expected_end_date: endDate || null,
                priority,
            });

            if (newProject) {
                Alert.alert('Success', 'Project created successfully!');
                resetForm();
                onProjectCreated?.(newProject);
                handleClose();
            }
        } catch (error) {
            console.error('Create project error:', error);
            Alert.alert('Error', error?.message || 'Failed to create project');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            onRequestClose={handleClose}
            transparent={true}
        >
            <View style={styles.modalContainer}>
                {/* Header */}
                <View style={styles.modalHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.modalTitle}>Create New Project</Text>
                        <Text style={styles.modalSubtitle}>Add a new project to your workspace</Text>
                    </View>
                    <TouchableOpacity
                        onPress={handleClose}
                        style={styles.closeButton}
                        disabled={loading}
                    >
                        <Icon name="times" size={18} color="#6B7280" />
                    </TouchableOpacity>
                </View>

                {/* Form Content */}
                <ScrollView style={styles.formContainer} contentContainerStyle={{ paddingBottom: 100 }}>
                    {/* Project Name */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Project Name *</Text>
                        <View style={styles.inputContainer}>
                            <Icon name="folder" size={16} color="#9CA3AF" />
                            <RNTextInput
                                style={styles.input}
                                placeholder="Enter project name"
                                value={projectName}
                                onChangeText={setProjectName}
                                placeholderTextColor="#9CA3AF"
                                editable={!loading}
                            />
                        </View>
                    </View>

                    {/* Description */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Description</Text>
                        <View style={[styles.inputContainer, styles.textareaContainer]}>
                            <Icon name="align-left" size={16} color="#9CA3AF" style={{ marginTop: 12 }} />
                            <RNTextInput
                                style={[styles.input, styles.textarea]}
                                placeholder="Enter project description (optional)"
                                value={description}
                                onChangeText={setDescription}
                                placeholderTextColor="#9CA3AF"
                                multiline={true}
                                numberOfLines={4}
                                editable={!loading}
                            />
                        </View>
                    </View>

                    {/* Start Date */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Start Date</Text>
                        <View style={styles.inputContainer}>
                            <Icon name="calendar-alt" size={16} color="#9CA3AF" />
                            <RNTextInput
                                style={styles.input}
                                placeholder="YYYY-MM-DD"
                                value={startDate}
                                onChangeText={setStartDate}
                                placeholderTextColor="#9CA3AF"
                                editable={!loading}
                            />
                        </View>
                        <Text style={styles.helperText}>Format: YYYY-MM-DD</Text>
                    </View>

                    {/* End Date */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>End Date</Text>
                        <View style={styles.inputContainer}>
                            <Icon name="calendar-alt" size={16} color="#9CA3AF" />
                            <RNTextInput
                                style={styles.input}
                                placeholder="YYYY-MM-DD"
                                value={endDate}
                                onChangeText={setEndDate}
                                placeholderTextColor="#9CA3AF"
                                editable={!loading}
                            />
                        </View>
                        <Text style={styles.helperText}>Format: YYYY-MM-DD</Text>
                    </View>

                    {/* Priority */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Priority</Text>
                        <View style={styles.priorityContainer}>
                            {['Low', 'Medium', 'High'].map((p) => (
                                <TouchableOpacity
                                    key={p}
                                    onPress={() => setPriority(p)}
                                    style={[
                                        styles.priorityButton,
                                        priority === p && styles.priorityButtonActive,
                                    ]}
                                    disabled={loading}
                                >
                                    <Text
                                        style={[
                                            styles.priorityButtonText,
                                            priority === p && styles.priorityButtonTextActive,
                                        ]}
                                    >
                                        {p}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </ScrollView>

                {/* Action Buttons */}
                <View style={styles.modalActions}>
                    <TouchableOpacity
                        onPress={handleClose}
                        style={styles.cancelButton}
                        disabled={loading}
                    >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={handleCreate}
                        style={[styles.createButton, loading && styles.disabledButton]}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <>
                                <Icon name="plus" size={14} color="#FFFFFF" />
                                <Text style={styles.createButtonText}>Create Project</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: '#F9FAFB',
        paddingTop: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
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
        color: '#6B7280',
        marginTop: 2,
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 12,
    },
    formContainer: {
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
    input: {
        flex: 1,
        fontSize: 15,
        color: '#111827',
        padding: 0,
    },
    textarea: {
        textAlignVertical: 'top',
        paddingTop: 8,
    },
    helperText: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 6,
    },
    priorityContainer: {
        flexDirection: 'row',
        gap: 10,
    },
    priorityButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
    },
    priorityButtonActive: {
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF6' + '15',
    },
    priorityButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
    },
    priorityButtonTextActive: {
        color: '#8B5CF6',
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
    createButton: {
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
    createButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
    },
});

export default AddProjectModal;
