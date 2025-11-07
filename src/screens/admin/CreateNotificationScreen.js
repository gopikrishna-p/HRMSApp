import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    StatusBar,
    Alert,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { colors } from '../../theme/colors';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

// Safely import notification service
let NotificationService = null;
try {
    NotificationService = require('../../services/notification.service').default || require('../../services/notification.service');
} catch (e) {
    console.warn('NotificationService not available in CreateNotificationScreen');
}

const CreateNotificationScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    
    // Form states
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [targetType, setTargetType] = useState('all');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedEmployees, setSelectedEmployees] = useState([]);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [deptResponse, empResponse] = await Promise.all([
                ApiService.getDepartments(),
                ApiService.getAllEmployees()
            ]);

            if (deptResponse.success && deptResponse.data?.message) {
                setDepartments(deptResponse.data.message);
            }

            if (empResponse.success && empResponse.data?.message) {
                setEmployees(empResponse.data.message.filter(emp => emp.status === 'Active'));
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to load data',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSendNotification = async () => {
        if (!title.trim()) {
            showToast({
                type: 'warning',
                text1: 'Missing Title',
                text2: 'Please enter a notification title',
            });
            return;
        }

        if (!message.trim()) {
            showToast({
                type: 'warning',
                text1: 'Missing Message',
                text2: 'Please enter a notification message',
            });
            return;
        }

        if (targetType === 'department' && !selectedDepartment) {
            showToast({
                type: 'warning',
                text1: 'Select Department',
                text2: 'Please select a department',
            });
            return;
        }

        if (targetType === 'specific' && selectedEmployees.length === 0) {
            showToast({
                type: 'warning',
                text1: 'Select Employees',
                text2: 'Please select at least one employee',
            });
            return;
        }

        Alert.alert(
            'Send Notification',
            `Send notification to ${getTargetDescription()}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send', onPress: confirmSendNotification }
            ]
        );
    };

    const confirmSendNotification = async () => {
        setSending(true);
        try {
            const notificationData = {
                title: title.trim(),
                message: message.trim(),
                target_type: targetType,
                department: targetType === 'department' ? selectedDepartment : null,
                target_employees: targetType === 'specific' ? selectedEmployees : null,
            };

            const response = await ApiService.createNotification(notificationData);

            if (response.success) {
                // Send via notification service as well (if available)
                if (NotificationService) {
                    try {
                        await NotificationService.sendAdminNotification({
                            title: title.trim(),
                            body: message.trim(),
                            target_type: targetType,
                            target_ids: selectedEmployees,
                            department_id: selectedDepartment,
                        });
                    } catch (error) {
                        console.warn('Failed to send via NotificationService:', error);
                    }
                }

                showToast({
                    type: 'success',
                    text1: 'Notification Sent',
                    text2: 'Notification has been sent successfully',
                });

                // Reset form
                setTitle('');
                setMessage('');
                setTargetType('all');
                setSelectedDepartment('');
                setSelectedEmployees([]);

                // Go back after a delay
                setTimeout(() => {
                    navigation.goBack();
                }, 1500);
            }
        } catch (error) {
            console.error('Error sending notification:', error);
            showToast({
                type: 'error',
                text1: 'Send Failed',
                text2: 'Failed to send notification',
            });
        } finally {
            setSending(false);
        }
    };

    const getTargetDescription = () => {
        switch (targetType) {
            case 'all':
                return 'all employees';
            case 'department':
                const dept = departments.find(d => d.name === selectedDepartment);
                return `${dept?.department_name || 'selected'} department`;
            case 'specific':
                return `${selectedEmployees.length} selected employee${selectedEmployees.length > 1 ? 's' : ''}`;
            default:
                return 'selected targets';
        }
    };

    const toggleEmployeeSelection = (employeeId) => {
        setSelectedEmployees(prev => {
            if (prev.includes(employeeId)) {
                return prev.filter(id => id !== employeeId);
            } else {
                return [...prev, employeeId];
            }
        });
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            
            {/* Header */}
            <View style={styles.headerSection}>
                <View style={styles.headerTop}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={styles.backButton}
                    >
                        <Icon name="arrow-left" size={20} color="#374151" />
                    </TouchableOpacity>
                    <View style={styles.headerTitleContainer}>
                        <Text style={styles.headerTitle}>Create Notification</Text>
                        <Text style={styles.headerSubtitle}>Send notifications to employees</Text>
                    </View>
                </View>
            </View>

            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
                {/* Notification Details */}
                <View style={styles.formCard}>
                    <Text style={styles.sectionTitle}>Notification Details</Text>
                    
                    {/* Title */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Title *</Text>
                        <TextInput
                            style={styles.textInput}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="Enter notification title..."
                            maxLength={100}
                        />
                        <Text style={styles.characterCount}>{title.length}/100</Text>
                    </View>

                    {/* Message */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Message *</Text>
                        <TextInput
                            style={[styles.textInput, styles.messageInput]}
                            value={message}
                            onChangeText={setMessage}
                            placeholder="Enter notification message..."
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                            maxLength={500}
                        />
                        <Text style={styles.characterCount}>{message.length}/500</Text>
                    </View>
                </View>

                {/* Target Selection */}
                <View style={styles.formCard}>
                    <Text style={styles.sectionTitle}>Send To</Text>
                    
                    {/* Target Type */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Target Type</Text>
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={targetType}
                                onValueChange={setTargetType}
                                style={styles.picker}
                            >
                                <Picker.Item label="All Employees" value="all" />
                                <Picker.Item label="Specific Department" value="department" />
                                <Picker.Item label="Specific Employees" value="specific" />
                            </Picker>
                        </View>
                    </View>

                    {/* Department Selection */}
                    {targetType === 'department' && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Department</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={selectedDepartment}
                                    onValueChange={setSelectedDepartment}
                                    style={styles.picker}
                                >
                                    <Picker.Item label="-- Select Department --" value="" />
                                    {departments.map((dept) => (
                                        <Picker.Item
                                            key={dept.name}
                                            label={dept.department_name || dept.name}
                                            value={dept.name}
                                        />
                                    ))}
                                </Picker>
                            </View>
                        </View>
                    )}

                    {/* Employee Selection */}
                    {targetType === 'specific' && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>
                                Employees ({selectedEmployees.length} selected)
                            </Text>
                            <View style={styles.employeeList}>
                                {employees.map((emp) => (
                                    <TouchableOpacity
                                        key={emp.name}
                                        style={[
                                            styles.employeeItem,
                                            selectedEmployees.includes(emp.name) && styles.employeeItemSelected
                                        ]}
                                        onPress={() => toggleEmployeeSelection(emp.name)}
                                    >
                                        <View style={styles.employeeInfo}>
                                            <Text style={styles.employeeName}>
                                                {emp.employee_name || emp.name}
                                            </Text>
                                            {emp.designation && (
                                                <Text style={styles.employeeDesignation}>
                                                    {emp.designation}
                                                </Text>
                                            )}
                                        </View>
                                        <View style={[
                                            styles.checkbox,
                                            selectedEmployees.includes(emp.name) && styles.checkboxSelected
                                        ]}>
                                            {selectedEmployees.includes(emp.name) && (
                                                <Icon name="check" size={12} color="white" />
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Target Summary */}
                    <View style={styles.targetSummary}>
                        <Icon name="info-circle" size={16} color="#6366F1" />
                        <Text style={styles.targetSummaryText}>
                            This notification will be sent to {getTargetDescription()}
                        </Text>
                    </View>
                </View>

                {/* Send Button */}
                <View style={styles.actionContainer}>
                    <TouchableOpacity
                        style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                        onPress={handleSendNotification}
                        disabled={sending}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <>
                                <Icon name="paper-plane" size={16} color="white" />
                                <Text style={styles.sendButtonText}>Send Notification</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#6B7280',
    },
    headerSection: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        padding: 8,
        marginRight: 12,
    },
    headerTitleContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    scrollContainer: {
        flex: 1,
    },
    formCard: {
        backgroundColor: '#FFFFFF',
        margin: 16,
        borderRadius: 12,
        padding: 16,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 16,
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        backgroundColor: '#F9FAFB',
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 14,
        color: '#374151',
    },
    messageInput: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    characterCount: {
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'right',
        marginTop: 4,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        backgroundColor: '#F9FAFB',
        overflow: 'hidden',
    },
    picker: {
        height: 50,
    },
    employeeList: {
        maxHeight: 300,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        backgroundColor: '#F9FAFB',
    },
    employeeItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    employeeItemSelected: {
        backgroundColor: '#EEF2FF',
    },
    employeeInfo: {
        flex: 1,
    },
    employeeName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
    },
    employeeDesignation: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: '#6366F1',
        borderColor: '#6366F1',
    },
    targetSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        padding: 12,
        borderRadius: 8,
        gap: 8,
    },
    targetSummaryText: {
        flex: 1,
        fontSize: 14,
        color: '#6366F1',
        fontWeight: '500',
    },
    actionContainer: {
        padding: 16,
        paddingTop: 0,
    },
    sendButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#6366F1',
        paddingVertical: 16,
        borderRadius: 12,
        gap: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    sendButtonDisabled: {
        backgroundColor: '#9CA3AF',
    },
    sendButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },
});

export default CreateNotificationScreen;