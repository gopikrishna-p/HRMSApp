import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    ActivityIndicator,
    StatusBar,
    FlatList,
    Switch,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/FontAwesome5';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

// Safely import DateTimePicker
let DateTimePicker = null;
try {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch (e) {
    console.warn('DateTimePicker not available:', e.message);
}

// Safely import notification service
let NotificationService = null;
try {
    NotificationService = require('../../services/notification.service').default || require('../../services/notification.service');
} catch (e) {
    console.warn('NotificationService not available in LeaveApplicationScreen');
}

function LeaveApplicationScreen({ navigation }) {
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [applications, setApplications] = useState([]);
    const [userInfo, setUserInfo] = useState(null);
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [leaveBalances, setLeaveBalances] = useState({});
    
    // Form states
    const [leaveType, setLeaveType] = useState('');
    const [fromDate, setFromDate] = useState(new Date());
    const [toDate, setToDate] = useState(new Date());
    const [reason, setReason] = useState('');
    const [description, setDescription] = useState('');
    const [isHalfDay, setIsHalfDay] = useState(false);
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);

    useEffect(() => {
        loadUserInfo();
        loadLeaveTypes();
        loadLeaveBalances();
        loadLeaveApplications();
    }, []);

    const loadUserInfo = async () => {
        try {
            const res = await ApiService.getUserWfhInfo();
            if (res.success && res.data?.message) {
                setUserInfo(res.data.message);
            }
        } catch (error) {
            console.error('Error loading user info:', error);
        }
    };

    const loadLeaveTypes = async () => {
        try {
            console.log('Loading leave types...');
            const response = await ApiService.getLeaveTypes();
            console.log('Leave types response:', response);
            
            // Handle the actual response structure: response.data.message
            let leaveTypesArray = null;
            
            if (response && response.data && response.data.message && Array.isArray(response.data.message)) {
                leaveTypesArray = response.data.message;
            } else if (response && response.message && Array.isArray(response.message)) {
                leaveTypesArray = response.message;
            } else if (response && Array.isArray(response)) {
                leaveTypesArray = response;
            }
            
            if (leaveTypesArray && leaveTypesArray.length > 0) {
                setLeaveTypes(leaveTypesArray);
                setLeaveType(leaveTypesArray[0]); // Set first leave type as default
                console.log('Leave types loaded successfully:', leaveTypesArray);
            } else {
                console.log('No leave types found, using defaults');
                throw new Error('No leave types available');
            }
        } catch (error) {
            console.error('Error loading leave types:', error);
            console.error('Error details:', error.message, error.response);
            
            // Show user-friendly error (use 'error' instead of 'warning')
            showToast({
                type: 'error',
                text1: 'Loading Issue',
                text2: 'Using default leave types. Please check your connection.',
            });
            
            // Fallback to default leave types if API fails
            const defaultTypes = ['Casual Leave', 'Sick Leave', 'Earned Leave'];
            setLeaveTypes(defaultTypes);
            setLeaveType(defaultTypes[0]);
        }
    };

    const loadLeaveBalances = async () => {
        try {
            console.log('Loading leave balances...');
            const response = await ApiService.getLeaveBalances();
            console.log('Leave balances response:', response);
            
            // Handle the actual response structure: response.data.message
            let balances = null;
            
            if (response && response.data && response.data.message) {
                balances = response.data.message;
            } else if (response && response.message) {
                balances = response.message;
            } else if (response) {
                balances = response;
            }
            
            if (balances) {
                setLeaveBalances(balances);
                console.log('Leave balances loaded successfully:', balances);
            }
        } catch (error) {
            console.error('Error loading leave balances:', error);
            console.error('Error details:', error.message, error.response);
            
            showToast({
                type: 'error',
                text1: 'Balance Loading Issue',
                text2: 'Could not load leave balances. Please try again.',
            });
        }
    };

    const loadLeaveApplications = async () => {
        setLoading(true);
        try {
            const response = await ApiService.getLeaveApplications();
            if (response && Array.isArray(response)) {
                setApplications(response);
            } else if (response?.data && Array.isArray(response.data)) {
                setApplications(response.data);
            } else {
                setApplications([]);
            }
        } catch (error) {
            console.error('Error loading leave applications:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to load leave applications',
            });
            setApplications([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitApplication = async () => {
        // Validation
        if (!leaveType || !fromDate || !toDate || !description.trim()) {
            showToast({
                type: 'error',
                text1: 'Missing Information',
                text2: 'Please fill in all required fields',
            });
            return;
        }

        if (toDate < fromDate) {
            showToast({
                type: 'error',
                text1: 'Invalid Date Range',
                text2: 'End date cannot be before start date',
            });
            return;
        }

        // Calculate leave days
        const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;

        // Check available balance
        if (leaveBalances[leaveType] && daysDiff > leaveBalances[leaveType].balance_leaves) {
            showToast({
                type: 'error',
                text1: 'Insufficient Balance',
                text2: `You only have ${leaveBalances[leaveType].balance_leaves} days available`,
            });
            return;
        }

        setSubmitting(true);
        try {
            const applicationData = {
                leave_type: leaveType,
                from_date: fromDate.toISOString().split('T')[0],
                to_date: toDate.toISOString().split('T')[0],
                description: description.trim(),
                half_day: isHalfDay ? 1 : 0,
                half_day_date: isHalfDay ? fromDate.toISOString().split('T')[0] : null,
            };

            const response = await ApiService.submitLeaveApplication(applicationData);
            
            if (response?.status === 'success' || response?.success) {
                // Send notification to admin (if service available)
                if (NotificationService) {
                    try {
                        await NotificationService.sendLeaveNotification({
                            ...applicationData,
                            application_id: response?.name,
                        });
                    } catch (error) {
                        console.warn('Failed to send leave notification:', error);
                    }
                }

                showToast({
                    type: 'success',
                    text1: 'Application Submitted',
                    text2: 'Your leave application has been sent for approval',
                });

                // Reset form
                setDescription('');
                setFromDate(new Date());
                setToDate(new Date());
                setIsHalfDay(false);
                if (leaveTypes.length > 0) {
                    setLeaveType(leaveTypes[0]);
                }

                // Reload applications
                loadLeaveApplications();
            }
        } catch (error) {
            console.error('Error submitting leave application:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: error?.message || 'Failed to submit leave application',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'approved':
                return '#10B981';
            case 'rejected':
                return '#EF4444';
            case 'pending':
                return '#F59E0B';
            default:
                return '#6B7280';
        }
    };

    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'approved':
                return 'check-circle';
            case 'rejected':
                return 'times-circle';
            case 'pending':
                return 'clock';
            default:
                return 'question-circle';
        }
    };

    const getLeaveTypeIcon = (type) => {
        const lowerType = type?.toLowerCase() || '';
        if (lowerType.includes('sick')) return 'thermometer-half';
        if (lowerType.includes('emergency')) return 'exclamation-triangle';
        if (lowerType.includes('maternity') || lowerType.includes('paternity')) return 'baby';
        if (lowerType.includes('earned')) return 'star';
        if (lowerType.includes('casual')) return 'calendar-day';
        return 'calendar-day';
    };

    const renderApplicationItem = ({ item }) => {
        const statusColor = getStatusColor(item.status);
        const statusIcon = getStatusIcon(item.status);
        const leaveTypeIcon = getLeaveTypeIcon(item.leave_type);
        const isApproved = item.status === 'Approved';
        const isPending = item.status === 'Open';
        const isRejected = item.status === 'Rejected';

        return (
            <View style={styles.applicationCard}>
                <View style={styles.applicationHeader}>
                    <View style={styles.leaveTypeSection}>
                        <Icon name={leaveTypeIcon} size={16} color="#6366F1" />
                        <Text style={styles.leaveTypeText}>
                            {item.leave_type}
                        </Text>
                    </View>
                    <View style={[
                        styles.statusBadge, 
                        { 
                            backgroundColor: statusColor + '15',
                            borderColor: statusColor,
                            borderWidth: 1
                        }
                    ]}>
                        <Icon name={statusIcon} size={12} color={statusColor} />
                        <Text style={[styles.statusText, { color: statusColor }]}>
                            {item.status}
                        </Text>
                    </View>
                </View>
                
                <View style={styles.datesRow}>
                    <View style={styles.dateInfo}>
                        <Icon name="calendar-alt" size={12} color="#6B7280" />
                        <Text style={styles.dateText}>
                            {formatDate(new Date(item.from_date))} - {formatDate(new Date(item.to_date))}
                        </Text>
                    </View>
                    <View style={styles.daysInfo}>
                        <Icon name="clock" size={12} color="#6B7280" />
                        <Text style={styles.daysText}>
                            {item.total_leave_days} day{item.total_leave_days > 1 ? 's' : ''}
                        </Text>
                    </View>
                </View>
                
                {item.description && (
                    <View style={styles.reasonSection}>
                        <Icon name="comment" size={12} color="#6B7280" />
                        <Text style={styles.reasonText}>{item.description}</Text>
                    </View>
                )}
                
                <View style={styles.applicationFooter}>
                    <View style={styles.applicationMeta}>
                        <Icon name="paper-plane" size={10} color="#9CA3AF" />
                        <Text style={styles.applicationMetaText}>
                            Applied on {new Date(item.creation || item.posting_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            })}
                        </Text>
                    </View>
                    
                    {(isApproved || isRejected) && item.leave_approver && (
                        <View style={styles.applicationMeta}>
                            <Icon 
                                name={isApproved ? 'user-check' : 'user-times'} 
                                size={10} 
                                color="#9CA3AF" 
                            />
                            <Text style={styles.applicationMetaText}>
                                {isApproved ? 'Approved' : 'Rejected'} by {item.leave_approver}
                            </Text>
                        </View>
                    )}
                    
                    {isPending && (
                        <View style={styles.pendingIndicator}>
                            <View style={styles.pendingDot} />
                            <Text style={styles.pendingText}>Waiting for approval</Text>
                        </View>
                    )}
                </View>

                {isApproved && (
                    <View style={styles.approvedNotice}>
                        <Icon name="check-circle" size={14} color="#10B981" />
                        <Text style={styles.approvedNoticeText}>
                            Leave has been approved
                        </Text>
                    </View>
                )}

                {isRejected && item.rejection_reason && (
                    <View style={styles.rejectedNotice}>
                        <Icon name="times-circle" size={14} color="#EF4444" />
                        <Text style={styles.rejectedNoticeText}>
                            Reason: {item.rejection_reason}
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    const renderHeader = () => (
        <View>
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
                        <Text style={styles.headerTitle}>Leave Application</Text>
                        <Text style={styles.headerSubtitle}>Apply for leave</Text>
                    </View>
                </View>
            </View>

            {/* User Info Card */}
            <View style={styles.infoCard}>
                <View style={styles.infoHeader}>
                    <Icon 
                        name="user-clock" 
                        size={20} 
                        color="#6366F1" 
                    />
                    <Text style={styles.infoTitle}>
                        Leave Applications
                    </Text>
                </View>
                
                {userInfo && (
                    <View style={styles.infoContainer}>
                        <Text style={styles.infoText}>Employee: {userInfo.employee_name}</Text>
                        {userInfo.department && <Text style={styles.infoText}>Department: {userInfo.department}</Text>}
                        {userInfo.designation && <Text style={styles.infoText}>Designation: {userInfo.designation}</Text>}
                    </View>
                )}

                <View style={styles.actionContainer}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => navigation.navigate('Dashboard')}
                    >
                        <Icon name="home" size={16} color="#6366F1" />
                        <Text style={styles.actionButtonText}>Go to Dashboard</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Application Form */}
            <View style={styles.formCard}>
                <View style={styles.formHeader}>
                    <Text style={styles.sectionTitle}>New Leave Application</Text>
                    <Text style={styles.formDescription}>
                        Submit a leave application. Admin will review and approve/reject your request.
                    </Text>
                </View>
                
                {/* Leave Type */}
                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Leave Type</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={leaveType}
                            onValueChange={setLeaveType}
                            style={styles.picker}
                        >
                            {leaveTypes.map((type, index) => (
                                <Picker.Item 
                                    key={index} 
                                    label={type} 
                                    value={type} 
                                />
                            ))}
                        </Picker>
                    </View>
                </View>

                {/* Leave Balance Display */}
                {leaveType && leaveBalances[leaveType] && (
                    <View style={styles.balanceInfo}>
                        <Icon name="info-circle" size={14} color="#6366F1" />
                        <Text style={styles.balanceText}>
                            Available Balance: {leaveBalances[leaveType].balance_leaves || 0} days
                        </Text>
                    </View>
                )}

                {/* From Date */}
                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>From Date</Text>
                    <TouchableOpacity
                        style={styles.dateButton}
                        onPress={() => {
                            if (DateTimePicker) {
                                setShowFromPicker(true);
                            } else {
                                Alert.alert(
                                    'Date Picker Not Available',
                                    'Please install @react-native-community/datetimepicker to use date selection.',
                                    [{ text: 'OK' }]
                                );
                            }
                        }}
                    >
                        <Icon name="calendar" size={16} color="#6366F1" />
                        <Text style={styles.dateButtonText}>
                            {formatDate(fromDate)}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* To Date */}
                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>To Date</Text>
                    <TouchableOpacity
                        style={styles.dateButton}
                        onPress={() => {
                            if (DateTimePicker) {
                                setShowToPicker(true);
                            } else {
                                Alert.alert(
                                    'Date Picker Not Available',
                                    'Please install @react-native-community/datetimepicker to use date selection.',
                                    [{ text: 'OK' }]
                                );
                            }
                        }}
                    >
                        <Icon name="calendar" size={16} color="#6366F1" />
                        <Text style={styles.dateButtonText}>
                            {formatDate(toDate)}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Days Calculation */}
                <View style={styles.daysCalculation}>
                    <Icon name="calculator" size={14} color="#6366F1" />
                    <Text style={styles.daysCalculationText}>
                        Total Days: {Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) + 1}
                    </Text>
                </View>

                {/* Half Day Option */}
                <View style={styles.halfDaySection}>
                    <View style={styles.halfDayLabel}>
                        <Icon name="clock" size={14} color="#6366F1" />
                        <Text style={styles.halfDayLabelText}>Half Day Leave</Text>
                    </View>
                    <Switch
                        value={isHalfDay}
                        onValueChange={setIsHalfDay}
                        trackColor={{ false: '#E5E7EB', true: '#6366F1' }}
                        thumbColor={isHalfDay ? '#FFFFFF' : '#FFFFFF'}
                    />
                </View>

                {isHalfDay && (
                    <View style={styles.halfDayNote}>
                        <Icon name="info-circle" size={12} color="#F59E0B" />
                        <Text style={styles.halfDayNoteText}>
                            Half day leave will be applied to the start date
                        </Text>
                    </View>
                )}

                {/* Description */}
                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Description</Text>
                    <TextInput
                        style={styles.reasonInput}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Enter description for leave application..."
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                    style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                    onPress={handleSubmitApplication}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator size="small" color="white" />
                    ) : (
                        <>
                            <Icon name="paper-plane" size={16} color="white" />
                            <Text style={styles.submitButtonText}>Submit Application</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            {/* Applications Header */}
            <View style={styles.applicationsHeader}>
                <Text style={styles.sectionTitle}>My Applications</Text>
                <TouchableOpacity onPress={loadLeaveApplications}>
                    <Icon name="sync-alt" size={16} color="#6366F1" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            
            <FlatList
                data={applications}
                renderItem={renderApplicationItem}
                keyExtractor={(item) => item.name}
                ListHeaderComponent={renderHeader}
                contentContainerStyle={styles.scrollContainer}
                showsVerticalScrollIndicator={false}
                refreshing={loading}
                onRefresh={loadLeaveApplications}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Icon name="calendar-times" size={48} color="#9CA3AF" />
                        <Text style={styles.emptyStateTitle}>No Applications Yet</Text>
                        <Text style={styles.emptyStateText}>
                            Your leave applications will appear here
                        </Text>
                    </View>
                }
            />

            {/* Date Pickers */}
            {showFromPicker && DateTimePicker && (
                <DateTimePicker
                    value={fromDate}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(event, selectedDate) => {
                        setShowFromPicker(false);
                        if (selectedDate) {
                            setFromDate(selectedDate);
                            if (selectedDate > toDate) {
                                setToDate(selectedDate);
                            }
                        }
                    }}
                />
            )}

            {showToPicker && DateTimePicker && (
                <DateTimePicker
                    value={toDate}
                    mode="date"
                    display="default"
                    minimumDate={fromDate}
                    onChange={(event, selectedDate) => {
                        setShowToPicker(false);
                        if (selectedDate) {
                            setToDate(selectedDate);
                        }
                    }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    scrollContainer: {
        paddingBottom: 20,
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
    infoCard: {
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
    infoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    infoContainer: {
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    infoText: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 4,
    },
    actionContainer: {
        marginTop: 12,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EEF2FF',
        paddingVertical: 12,
        borderRadius: 8,
        gap: 8,
    },
    actionButtonText: {
        color: '#6366F1',
        fontSize: 14,
        fontWeight: '600',
    },
    formCard: {
        backgroundColor: '#FFFFFF',
        margin: 16,
        marginTop: 0,
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
    formHeader: {
        marginBottom: 16,
    },
    formDescription: {
        fontSize: 14,
        color: '#6B7280',
        lineHeight: 20,
        marginTop: 4,
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
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 12,
    },
    dateButtonText: {
        fontSize: 14,
        color: '#374151',
        fontWeight: '500',
    },
    daysCalculation: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 16,
        gap: 8,
    },
    daysCalculationText: {
        fontSize: 14,
        color: '#6366F1',
        fontWeight: '600',
    },
    halfDaySection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        marginBottom: 12,
    },
    halfDayLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    halfDayLabelText: {
        fontSize: 14,
        color: '#374151',
        fontWeight: '500',
    },
    halfDayNote: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        marginBottom: 16,
        gap: 6,
    },
    halfDayNoteText: {
        fontSize: 12,
        color: '#92400E',
        flex: 1,
    },
    reasonInput: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        backgroundColor: '#F9FAFB',
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 14,
        color: '#374151',
        minHeight: 100,
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#6366F1',
        paddingVertical: 14,
        borderRadius: 8,
        gap: 8,
        elevation: 1,
    },
    submitButtonDisabled: {
        backgroundColor: '#9CA3AF',
    },
    submitButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    applicationsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    applicationCard: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginVertical: 4,
        borderRadius: 12,
        padding: 16,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    applicationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    leaveTypeSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    leaveTypeText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    datesRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    dateInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    dateText: {
        fontSize: 13,
        color: '#6B7280',
        fontWeight: '500',
    },
    daysInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    daysText: {
        fontSize: 13,
        color: '#6B7280',
        fontWeight: '500',
    },
    reasonSection: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
        gap: 8,
    },
    reasonText: {
        fontSize: 14,
        color: '#6B7280',
        lineHeight: 20,
        flex: 1,
    },
    applicationFooter: {
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        gap: 6,
    },
    applicationMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    applicationMetaText: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    pendingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    pendingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#F59E0B',
    },
    pendingText: {
        fontSize: 12,
        color: '#F59E0B',
        fontStyle: 'italic',
    },
    approvedNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        padding: 12,
        backgroundColor: '#ECFDF5',
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#10B981',
    },
    approvedNoticeText: {
        fontSize: 12,
        color: '#065F46',
        fontWeight: '500',
    },
    rejectedNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        padding: 12,
        backgroundColor: '#FEF2F2',
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#EF4444',
    },
    rejectedNoticeText: {
        fontSize: 12,
        color: '#7F1D1D',
        fontWeight: '500',
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
        marginTop: 40,
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#374151',
        marginTop: 16,
        marginBottom: 8,
    },
    emptyStateText: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
    },
});

export default LeaveApplicationScreen;
