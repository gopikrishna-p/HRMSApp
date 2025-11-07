import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    StatusBar,
    Alert,
    RefreshControl,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/FontAwesome5';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

// Safely import notification service
let NotificationService = null;
try {
    NotificationService = require('../../services/notification.service').default || require('../../services/notification.service');
} catch (e) {
    console.warn('NotificationService not available in LeaveApprovalsScreen');
}

function LeaveApprovalsScreen({ navigation }) {
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [applications, setApplications] = useState([]);
    const [processingIds, setProcessingIds] = useState(new Set());
    const [filter, setFilter] = useState('pending'); // pending (Open), all, approved, rejected
    const [dateFilter, setDateFilter] = useState('all'); // all, today, this_week, this_month

    useEffect(() => {
        loadPendingApplications();
    }, [filter, dateFilter]);

    const loadPendingApplications = async () => {
        setLoading(true);
        try {
            console.log('Loading leave applications with filter:', filter, 'dateFilter:', dateFilter);
            
            // Use the correct API call for getting leave applications
            const response = await ApiService.getLeaveApplications(null, true, true); // employee=null, for_approval=true, include_balances=true
            console.log('Leave applications response:', response);
            
            let applications = [];
            
            // Handle response format
            if (response && response.data && response.data.message) {
                applications = response.data.message;
            } else if (response && response.message) {
                applications = response.message;
            } else if (response && Array.isArray(response)) {
                applications = response;
            }
            
            // Filter applications based on filter selection
            if (filter === 'pending') {
                applications = applications.filter(app => app.status === 'Open');
            } else if (filter === 'approved') {
                applications = applications.filter(app => app.status === 'Approved');
            } else if (filter === 'rejected') {
                applications = applications.filter(app => app.status === 'Rejected');
            }
            // 'all' shows everything
            
            // Apply date filter if needed (using from_date since posting_date is not available)
            if (dateFilter !== 'all') {
                const today = new Date();
                const filterDate = new Date();
                
                if (dateFilter === 'today') {
                    filterDate.setHours(0, 0, 0, 0);
                    applications = applications.filter(app => {
                        const appDate = new Date(app.from_date);
                        appDate.setHours(0, 0, 0, 0);
                        return appDate.getTime() === filterDate.getTime();
                    });
                } else if (dateFilter === 'this_week') {
                    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
                    applications = applications.filter(app => {
                        const appDate = new Date(app.from_date);
                        return appDate >= startOfWeek;
                    });
                } else if (dateFilter === 'this_month') {
                    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    applications = applications.filter(app => {
                        const appDate = new Date(app.from_date);
                        return appDate >= startOfMonth;
                    });
                }
            }
            
            setApplications(applications);
            console.log('Filtered applications:', applications.length);
            
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

    const onRefresh = async () => {
        setRefreshing(true);
        await loadPendingApplications();
        setRefreshing(false);
    };

    const processApplication = async (applicationId, action, rejectionReason = null) => {
        setProcessingIds(prev => new Set(prev.add(applicationId)));
        
        try {
            console.log('Processing leave application:', { applicationId, action, rejectionReason });
            
            const response = await ApiService.processLeaveApplication({
                application_id: applicationId,
                action: action,
                rejection_reason: rejectionReason
            });

            console.log('Process leave application response:', response);

            // Handle the nested response format
            const result = response?.data?.message || response;
            
            if (result?.status === 'success' || response?.success) {
                // Send notification to employee
                if (NotificationService) {
                    try {
                        await NotificationService.sendLeaveApprovalNotification({
                            application_id: applicationId,
                            action: action,
                            rejection_reason: rejectionReason
                        });
                    } catch (error) {
                        console.warn('Failed to send leave approval notification:', error);
                    }
                }

                showToast({
                    type: 'success',
                    text1: 'Success',
                    text2: `Leave application ${action}d successfully`,
                });

                // Reload applications
                loadPendingApplications();
            } else {
                throw new Error(result?.message || 'Unknown error occurred');
            }
        } catch (error) {
            console.error(`Error ${action}ing leave application:`, error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: error?.message || `Failed to ${action} leave application`,
            });
        } finally {
            setProcessingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(applicationId);
                return newSet;
            });
        }
    };

    const handleApproveApplication = (application) => {
        Alert.alert(
            'Approve Leave Application',
            `Are you sure you want to approve ${application.employee_name}'s ${application.leave_type} leave from ${formatDate(new Date(application.from_date))} to ${formatDate(new Date(application.to_date))}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Approve', 
                    style: 'default',
                    onPress: () => processApplication(application.name, 'approve')
                }
            ]
        );
    };

    const handleRejectApplication = (application) => {
        Alert.prompt(
            'Reject Leave Application',
            `Please provide a reason for rejecting ${application.employee_name}'s leave application:`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reject',
                    style: 'destructive',
                    onPress: (reason) => {
                        if (reason && reason.trim()) {
                            processApplication(application.name, 'reject', reason.trim());
                        } else {
                            showToast({
                                type: 'warning',
                                text1: 'Missing Information',
                                text2: 'Please provide a rejection reason',
                            });
                        }
                    }
                }
            ],
            'plain-text',
            '',
            'Enter rejection reason...'
        );
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const getLeaveTypeIcon = (type) => {
        switch (type?.toLowerCase()) {
            case 'sick':
                return 'thermometer-half';
            case 'emergency':
                return 'exclamation-triangle';
            case 'maternity':
            case 'paternity':
                return 'baby';
            case 'earned':
                return 'star';
            default:
                return 'calendar-day';
        }
    };

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'approved':
                return '#10B981';
            case 'rejected':
                return '#EF4444';
            case 'pending':
            case 'open':
                return '#F59E0B';
            default:
                return '#6B7280';
        }
    };

    const renderApplicationItem = ({ item }) => {
        const isProcessing = processingIds.has(item.name);
        const isPending = item.status === 'Open';
        const leaveTypeIcon = getLeaveTypeIcon(item.leave_type);
        const statusColor = getStatusColor(item.status);

        return (
            <View style={styles.applicationCard}>
                <View style={styles.applicationHeader}>
                    <View style={styles.employeeInfo}>
                        <View style={styles.employeeNameRow}>
                            <Icon name="user" size={14} color="#6366F1" />
                            <Text style={styles.employeeName}>{item.employee_name}</Text>
                        </View>
                    </View>
                    <View style={[
                        styles.statusBadge,
                        { 
                            backgroundColor: statusColor + '15',
                            borderColor: statusColor,
                            borderWidth: 1
                        }
                    ]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>
                            {item.status}
                        </Text>
                    </View>
                </View>

                <View style={styles.leaveDetails}>
                    <View style={styles.leaveTypeRow}>
                        <Icon name={leaveTypeIcon} size={16} color="#6366F1" />
                        <Text style={styles.leaveTypeText}>
                            {item.leave_type?.charAt(0).toUpperCase() + item.leave_type?.slice(1)} Leave
                        </Text>
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
                </View>

                {item.description && (
                    <View style={styles.reasonSection}>
                        <Text style={styles.reasonLabel}>Reason:</Text>
                        <Text style={styles.reasonText}>{item.description}</Text>
                    </View>
                )}

                <View style={styles.metaInfo}>
                    <View style={styles.metaRow}>
                        <Icon name="user" size={10} color="#9CA3AF" />
                        <Text style={styles.metaText}>
                            Employee: {item.employee}
                        </Text>
                    </View>
                    
                    <View style={styles.metaRow}>
                        <Icon name="calendar" size={10} color="#9CA3AF" />
                        <Text style={styles.metaText}>
                            Application ID: {item.name}
                        </Text>
                    </View>
                </View>

                {isPending && (
                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={[styles.rejectButton, isProcessing && styles.disabledButton]}
                            onPress={() => handleRejectApplication(item)}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <ActivityIndicator size="small" color="#EF4444" />
                            ) : (
                                <>
                                    <Icon name="times" size={14} color="#EF4444" />
                                    <Text style={styles.rejectButtonText}>Reject</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.approveButton, isProcessing && styles.disabledButton]}
                            onPress={() => handleApproveApplication(item)}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <>
                                    <Icon name="check" size={14} color="white" />
                                    <Text style={styles.approveButtonText}>Approve</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    const renderHeader = () => (
        <View>
            <View style={styles.headerSection}>
                <View style={styles.headerTop}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={styles.backButton}
                    >
                        <Icon name="arrow-left" size={20} color="#374151" />
                    </TouchableOpacity>
                    <View style={styles.headerTitleContainer}>
                        <Text style={styles.headerTitle}>Leave Approvals</Text>
                        <Text style={styles.headerSubtitle}>Review and process leave applications</Text>
                    </View>
                </View>
            </View>

            <View style={styles.filtersSection}>
                <View style={styles.filterGroup}>
                    <Text style={styles.filterLabel}>Status Filter</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={filter}
                            onValueChange={setFilter}
                            style={styles.picker}
                        >
                            <Picker.Item label="Pending Applications" value="pending" />
                            <Picker.Item label="All Applications" value="all" />
                            <Picker.Item label="Approved Only" value="approved" />
                            <Picker.Item label="Rejected Only" value="rejected" />
                        </Picker>
                    </View>
                </View>

                <View style={styles.filterGroup}>
                    <Text style={styles.filterLabel}>Date Filter</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={dateFilter}
                            onValueChange={setDateFilter}
                            style={styles.picker}
                        >
                            <Picker.Item label="All Dates" value="all" />
                            <Picker.Item label="Today" value="today" />
                            <Picker.Item label="This Week" value="this_week" />
                            <Picker.Item label="This Month" value="this_month" />
                        </Picker>
                    </View>
                </View>
            </View>

            <View style={styles.statsSection}>
                <View style={styles.statsCard}>
                    <Icon name="clock" size={16} color="#F59E0B" />
                    <Text style={styles.statsNumber}>{applications.filter(app => app.status === 'Open').length}</Text>
                    <Text style={styles.statsLabel}>Pending</Text>
                </View>
                <View style={styles.statsCard}>
                    <Icon name="check-circle" size={16} color="#10B981" />
                    <Text style={styles.statsNumber}>{applications.filter(app => app.status === 'Approved').length}</Text>
                    <Text style={styles.statsLabel}>Approved</Text>
                </View>
                <View style={styles.statsCard}>
                    <Icon name="times-circle" size={16} color="#EF4444" />
                    <Text style={styles.statsNumber}>{applications.filter(app => app.status === 'Rejected').length}</Text>
                    <Text style={styles.statsLabel}>Rejected</Text>
                </View>
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
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Icon name="clipboard-list" size={48} color="#9CA3AF" />
                        <Text style={styles.emptyStateTitle}>No Applications Found</Text>
                        <Text style={styles.emptyStateText}>
                            {filter === 'pending' 
                                ? 'No pending leave applications at the moment'
                                : 'No leave applications match your current filters'
                            }
                        </Text>
                    </View>
                }
            />
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
    filtersSection: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        flexDirection: 'row',
        gap: 12,
    },
    filterGroup: {
        flex: 1,
    },
    filterLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 4,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 6,
        backgroundColor: '#F9FAFB',
        overflow: 'hidden',
    },
    picker: {
        height: 40,
        fontSize: 12,
    },
    statsSection: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    statsCard: {
        alignItems: 'center',
        padding: 8,
        gap: 4,
    },
    statsNumber: {
        fontSize: 18,
        fontWeight: '700',
        color: '#374151',
    },
    statsLabel: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
    },
    applicationCard: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginVertical: 6,
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
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    employeeInfo: {
        flex: 1,
    },
    employeeNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    employeeName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    departmentText: {
        fontSize: 12,
        color: '#6B7280',
        marginLeft: 22,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    leaveDetails: {
        marginBottom: 12,
    },
    leaveTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    leaveTypeText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#374151',
    },
    datesRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
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
        backgroundColor: '#F9FAFB',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
    },
    reasonLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 4,
    },
    reasonText: {
        fontSize: 14,
        color: '#6B7280',
        lineHeight: 18,
    },
    metaInfo: {
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        gap: 4,
        marginBottom: 12,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metaText: {
        fontSize: 11,
        color: '#9CA3AF',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 8,
    },
    approveButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#10B981',
        paddingVertical: 12,
        borderRadius: 8,
        gap: 6,
    },
    approveButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    rejectButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#EF4444',
        gap: 6,
    },
    rejectButtonText: {
        color: '#EF4444',
        fontSize: 14,
        fontWeight: '600',
    },
    disabledButton: {
        opacity: 0.6,
    },
    rejectionReasonBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 12,
        padding: 12,
        backgroundColor: '#FEF2F2',
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#EF4444',
    },
    rejectionReasonText: {
        fontSize: 12,
        color: '#7F1D1D',
        lineHeight: 16,
        flex: 1,
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

export default LeaveApprovalsScreen;