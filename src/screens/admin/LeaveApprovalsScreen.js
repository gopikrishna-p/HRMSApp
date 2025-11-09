import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    RefreshControl,
    TextInput,
    Modal,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import apiService from '../../services/api.service';

const LeaveApprovalsScreen = ({ navigation }) => {
    // State
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    // Tab state
    const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'history', 'statistics'
    
    // Leave applications
    const [pendingLeaves, setPendingLeaves] = useState([]);
    const [historyLeaves, setHistoryLeaves] = useState([]);
    const [statistics, setStatistics] = useState(null);
    
    // Filters
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [selectedLeaveType, setSelectedLeaveType] = useState('');
    const [historyStatusFilter, setHistoryStatusFilter] = useState('');
    
    // Data for filters
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    
    // Action modal
    const [showActionModal, setShowActionModal] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [actionType, setActionType] = useState(''); // 'approve' or 'reject'
    const [remarks, setRemarks] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                loadDepartments(),
                loadEmployees(),
                fetchPendingLeaves(),
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
            Alert.alert('Error', 'Failed to load leave approvals data');
        } finally {
            setLoading(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await apiService.getDepartments();
            if (response.success && response.data) {
                // Handle different response structures
                const deptData = response.data.message || response.data;
                setDepartments(Array.isArray(deptData) ? deptData : []);
            } else {
                setDepartments([]);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
            setDepartments([]);
        }
    };

    const loadEmployees = async () => {
        try {
            const response = await apiService.getAllEmployees();
            if (response.success && response.data?.message) {
                const empData = response.data.message;
                setEmployees(Array.isArray(empData) ? empData : []);
            } else {
                setEmployees([]);
            }
        } catch (error) {
            console.error('Error loading employees:', error);
            setEmployees([]);
        }
    };

    const fetchPendingLeaves = async () => {
        try {
            const filters = {
                status: 'Open',
                department: selectedDepartment || null,
                employee: selectedEmployee || null,
                leave_type: selectedLeaveType || null,
            };

            const response = await apiService.getAllLeaves(filters);
            
            if (response.success && response.data?.message) {
                const result = response.data.message;
                setPendingLeaves(Array.isArray(result.applications) ? result.applications : []);
                setStatistics(result.statistics || null);
            } else {
                setPendingLeaves([]);
            }
        } catch (error) {
            console.error('Error fetching pending leaves:', error);
            Alert.alert('Error', 'Failed to load pending leaves');
            setPendingLeaves([]);
        }
    };

    const fetchHistoryLeaves = async () => {
        try {
            const filters = {
                status: historyStatusFilter || null,
                department: selectedDepartment || null,
                employee: selectedEmployee || null,
                leave_type: selectedLeaveType || null,
            };

            const response = await apiService.getAllLeaves(filters);
            
            if (response.success && response.data?.message) {
                const result = response.data.message;
                // Filter history to exclude pending
                const applications = Array.isArray(result.applications) ? result.applications : [];
                const history = applications.filter(
                    app => ['Approved', 'Rejected', 'Cancelled'].includes(app.status)
                );
                setHistoryLeaves(history);
                setStatistics(result.statistics || null);
            } else {
                setHistoryLeaves([]);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
            Alert.alert('Error', 'Failed to load leave history');
            setHistoryLeaves([]);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            if (activeTab === 'pending') {
                await fetchPendingLeaves();
            } else if (activeTab === 'history') {
                await fetchHistoryLeaves();
            }
        } catch (error) {
            console.error('Error refreshing:', error);
        } finally {
            setRefreshing(false);
        }
    }, [activeTab, selectedDepartment, selectedEmployee, selectedLeaveType, historyStatusFilter]);

    useEffect(() => {
        if (activeTab === 'pending') {
            fetchPendingLeaves();
        } else if (activeTab === 'history') {
            fetchHistoryLeaves();
        }
    }, [activeTab, selectedDepartment, selectedEmployee, selectedLeaveType, historyStatusFilter]);

    const openActionModal = (leave, action) => {
        setSelectedLeave(leave);
        setActionType(action);
        setRemarks('');
        setRejectionReason('');
        setShowActionModal(true);
    };

    const handleApprove = async () => {
        if (!selectedLeave) return;

        setLoading(true);
        setShowActionModal(false);
        
        try {
            const response = await apiService.approveLeave(
                selectedLeave.name,
                remarks.trim()
            );

            if (response.success) {
                Alert.alert('Success', 'Leave application approved successfully');
                fetchPendingLeaves();
                setRemarks('');
            } else {
                Alert.alert('Error', response.message || 'Failed to approve leave');
            }
        } catch (error) {
            console.error('Error approving leave:', error);
            Alert.alert('Error', error.message || 'Failed to approve leave');
        } finally {
            setLoading(false);
            setSelectedLeave(null);
        }
    };

    const handleReject = async () => {
        if (!selectedLeave) return;

        if (!rejectionReason.trim()) {
            Alert.alert('Validation Error', 'Rejection reason is required');
            return;
        }

        setLoading(true);
        setShowActionModal(false);
        
        try {
            const response = await apiService.rejectLeave(
                selectedLeave.name,
                rejectionReason.trim()
            );

            if (response.success) {
                Alert.alert('Success', 'Leave application rejected');
                fetchPendingLeaves();
                setRejectionReason('');
            } else {
                Alert.alert('Error', response.message || 'Failed to reject leave');
            }
        } catch (error) {
            console.error('Error rejecting leave:', error);
            Alert.alert('Error', error.message || 'Failed to reject leave');
        } finally {
            setLoading(false);
            setSelectedLeave(null);
        }
    };

    const renderFilters = () => (
        <View style={styles.filtersContainer}>
            {/* Department Filter */}
            <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Department</Text>
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={selectedDepartment}
                        onValueChange={(value) => setSelectedDepartment(value)}
                        style={styles.picker}
                    >
                        <Picker.Item label="All Departments" value="" />
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

            {/* Employee Filter */}
            <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Employee</Text>
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={selectedEmployee}
                        onValueChange={(value) => setSelectedEmployee(value)}
                        style={styles.picker}
                    >
                        <Picker.Item label="All Employees" value="" />
                        {employees.map((emp) => (
                            <Picker.Item
                                key={emp.name}
                                label={emp.employee_name}
                                value={emp.name}
                            />
                        ))}
                    </Picker>
                </View>
            </View>

            {/* Status Filter (for history tab only) */}
            {activeTab === 'history' && (
                <View style={styles.filterItem}>
                    <Text style={styles.filterLabel}>Status</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={historyStatusFilter}
                            onValueChange={(value) => setHistoryStatusFilter(value)}
                            style={styles.picker}
                        >
                            <Picker.Item label="All Statuses" value="" />
                            <Picker.Item label="Approved" value="Approved" />
                            <Picker.Item label="Rejected" value="Rejected" />
                            <Picker.Item label="Cancelled" value="Cancelled" />
                        </Picker>
                    </View>
                </View>
            )}

            {/* Clear Filters Button */}
            {(selectedDepartment || selectedEmployee || historyStatusFilter) && (
                <TouchableOpacity
                    style={styles.clearFiltersButton}
                    onPress={() => {
                        setSelectedDepartment('');
                        setSelectedEmployee('');
                        setHistoryStatusFilter('');
                    }}
                >
                    <Text style={styles.clearFiltersText}>Clear Filters</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    const renderLeaveCard = (leave, showActions = false) => (
        <View key={leave.name} style={styles.leaveCard}>
            <View style={styles.leaveCardHeader}>
                <View style={styles.leaveCardHeaderLeft}>
                    <Text style={styles.employeeName}>{leave.employee_name}</Text>
                    <Text style={styles.leaveType}>{leave.leave_type}</Text>
                </View>
                <View
                    style={[
                        styles.statusBadge,
                        styles[`status${leave.status.replace(/\s/g, '')}`]
                    ]}
                >
                    <Text style={styles.statusText}>{leave.status}</Text>
                </View>
            </View>

            <View style={styles.leaveDetails}>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date:</Text>
                    <Text style={styles.detailValue}>
                        {new Date(leave.from_date).toLocaleDateString()} -{' '}
                        {new Date(leave.to_date).toLocaleDateString()}
                    </Text>
                </View>

                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Days:</Text>
                    <Text style={styles.detailValue}>
                        {leave.total_leave_days} day(s)
                        {leave.half_day ? ' (Half Day)' : ''}
                    </Text>
                </View>

                {leave.department && (
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Department:</Text>
                        <Text style={styles.detailValue}>{leave.department}</Text>
                    </View>
                )}

                {leave.description && (
                    <View style={styles.descriptionContainer}>
                        <Text style={styles.detailLabel}>Reason:</Text>
                        <Text style={styles.description}>{leave.description}</Text>
                    </View>
                )}

                {leave.leave_approver_name && (
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Approver:</Text>
                        <Text style={styles.detailValue}>{leave.leave_approver_name}</Text>
                    </View>
                )}

                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Applied:</Text>
                    <Text style={styles.detailValue}>
                        {new Date(leave.creation).toLocaleDateString()}
                    </Text>
                </View>
            </View>

            {showActions && (
                <View style={styles.actionButtons}>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.approveButton]}
                        onPress={() => openActionModal(leave, 'approve')}
                    >
                        <Text style={styles.actionButtonText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => openActionModal(leave, 'reject')}
                    >
                        <Text style={styles.actionButtonText}>Reject</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    const renderPendingTab = () => (
        <ScrollView
            style={styles.tabContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {renderFilters()}
            
            {pendingLeaves.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No pending leave applications</Text>
                </View>
            ) : (
                <View style={styles.leavesList}>
                    {pendingLeaves.map(leave => renderLeaveCard(leave, true))}
                </View>
            )}
        </ScrollView>
    );

    const renderHistoryTab = () => (
        <ScrollView
            style={styles.tabContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {renderFilters()}
            
            {historyLeaves.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No leave history found</Text>
                </View>
            ) : (
                <View style={styles.leavesList}>
                    {historyLeaves.map(leave => renderLeaveCard(leave, false))}
                </View>
            )}
        </ScrollView>
    );

    const renderStatisticsTab = () => {
        if (!statistics) {
            return (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No statistics available</Text>
                </View>
            );
        }

        return (
            <ScrollView
                style={styles.tabContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <View style={styles.statsContainer}>
                    {/* Overall Statistics */}
                    <View style={styles.statsSection}>
                        <Text style={styles.statsSectionTitle}>Overall Statistics</Text>
                        <View style={styles.statsGrid}>
                            <View style={styles.statCard}>
                                <Text style={styles.statValue}>{statistics.total_applications}</Text>
                                <Text style={styles.statLabel}>Total Applications</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={styles.statValue}>{statistics.total_days || 0}</Text>
                                <Text style={styles.statLabel}>Total Days</Text>
                            </View>
                        </View>
                    </View>

                    {/* By Status */}
                    {statistics.by_status && Object.keys(statistics.by_status).length > 0 && (
                        <View style={styles.statsSection}>
                            <Text style={styles.statsSectionTitle}>By Status</Text>
                            {Object.entries(statistics.by_status).map(([status, count]) => (
                                <View key={status} style={styles.statsRow}>
                                    <Text style={styles.statsRowLabel}>{status}</Text>
                                    <Text style={styles.statsRowValue}>{count}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* By Leave Type */}
                    {statistics.by_leave_type && Object.keys(statistics.by_leave_type).length > 0 && (
                        <View style={styles.statsSection}>
                            <Text style={styles.statsSectionTitle}>By Leave Type</Text>
                            {Object.entries(statistics.by_leave_type).map(([type, count]) => (
                                <View key={type} style={styles.statsRow}>
                                    <Text style={styles.statsRowLabel}>{type}</Text>
                                    <Text style={styles.statsRowValue}>{count}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* By Department */}
                    {statistics.by_department && Object.keys(statistics.by_department).length > 0 && (
                        <View style={styles.statsSection}>
                            <Text style={styles.statsSectionTitle}>By Department</Text>
                            {Object.entries(statistics.by_department).map(([dept, count]) => (
                                <View key={dept} style={styles.statsRow}>
                                    <Text style={styles.statsRowLabel}>{dept}</Text>
                                    <Text style={styles.statsRowValue}>{count}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>
        );
    };

    const renderActionModal = () => (
        <Modal
            visible={showActionModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowActionModal(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>
                        {actionType === 'approve' ? 'Approve Leave' : 'Reject Leave'}
                    </Text>

                    {selectedLeave && (
                        <View style={styles.modalLeaveInfo}>
                            <Text style={styles.modalInfoText}>
                                Employee: {selectedLeave.employee_name}
                            </Text>
                            <Text style={styles.modalInfoText}>
                                Leave Type: {selectedLeave.leave_type}
                            </Text>
                            <Text style={styles.modalInfoText}>
                                Days: {selectedLeave.total_leave_days}
                            </Text>
                        </View>
                    )}

                    {actionType === 'approve' ? (
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Remarks (Optional)</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Enter approval remarks..."
                                value={remarks}
                                onChangeText={setRemarks}
                                multiline
                                numberOfLines={3}
                            />
                        </View>
                    ) : (
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Rejection Reason *</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Enter rejection reason..."
                                value={rejectionReason}
                                onChangeText={setRejectionReason}
                                multiline
                                numberOfLines={3}
                            />
                        </View>
                    )}

                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={[styles.modalButton, styles.modalCancelButton]}
                            onPress={() => setShowActionModal(false)}
                        >
                            <Text style={styles.modalCancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.modalButton,
                                actionType === 'approve' ? styles.modalApproveButton : styles.modalRejectButton
                            ]}
                            onPress={actionType === 'approve' ? handleApprove : handleReject}
                        >
                            <Text style={styles.modalActionButtonText}>
                                {actionType === 'approve' ? 'Approve' : 'Reject'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    if (loading && !refreshing) {
        return <Loading message="Loading leave approvals..." />;
    }

    return (
        <View style={styles.container}>
            {/* Tab Navigation */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
                    onPress={() => setActiveTab('pending')}
                >
                    <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
                        Pending ({pendingLeaves.length})
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'history' && styles.tabActive]}
                    onPress={() => setActiveTab('history')}
                >
                    <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
                        History
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'statistics' && styles.tabActive]}
                    onPress={() => setActiveTab('statistics')}
                >
                    <Text style={[styles.tabText, activeTab === 'statistics' && styles.tabTextActive]}>
                        Statistics
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Tab Content */}
            {activeTab === 'pending' && renderPendingTab()}
            {activeTab === 'history' && renderHistoryTab()}
            {activeTab === 'statistics' && renderStatisticsTab()}

            {/* Action Modal */}
            {renderActionModal()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: colors.primary,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: colors.primary,
        fontWeight: '600',
    },
    tabContent: {
        flex: 1,
    },
    filtersContainer: {
        backgroundColor: colors.white,
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    filterItem: {
        marginBottom: 10,
    },
    filterLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 5,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: colors.white,
    },
    picker: {
        height: 42,
    },
    clearFiltersButton: {
        marginTop: 6,
        padding: 8,
        backgroundColor: colors.lightGray,
        borderRadius: 8,
        alignItems: 'center',
    },
    clearFiltersText: {
        fontSize: 12,
        color: colors.primary,
        fontWeight: '600',
    },
    leavesList: {
        padding: 12,
    },
    emptyState: {
        padding: 30,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    leaveCard: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    leaveCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    leaveCardHeaderLeft: {
        flex: 1,
        marginRight: 10,
    },
    employeeName: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 3,
    },
    leaveType: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusOpen: {
        backgroundColor: '#FFF3CD',
    },
    statusApproved: {
        backgroundColor: '#D4EDDA',
    },
    statusRejected: {
        backgroundColor: '#F8D7DA',
    },
    statusCancelled: {
        backgroundColor: '#E2E3E5',
    },
    statusText: {
        fontSize: 10,
        fontWeight: '600',
    },
    leaveDetails: {
        marginBottom: 10,
    },
    detailRow: {
        flexDirection: 'row',
        marginBottom: 5,
    },
    detailLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '600',
        width: 85,
    },
    detailValue: {
        fontSize: 12,
        color: colors.textPrimary,
        flex: 1,
    },
    descriptionContainer: {
        marginTop: 6,
    },
    description: {
        fontSize: 12,
        color: colors.textSecondary,
        fontStyle: 'italic',
        marginTop: 3,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    actionButton: {
        flex: 1,
        padding: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    approveButton: {
        backgroundColor: colors.success,
    },
    rejectButton: {
        backgroundColor: colors.error,
    },
    actionButtonText: {
        color: colors.white,
        fontSize: 12,
        fontWeight: '600',
    },
    statsContainer: {
        padding: 12,
    },
    statsSection: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    statsSectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 10,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 10,
    },
    statCard: {
        flex: 1,
        backgroundColor: colors.lightBlue,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.primary,
        marginBottom: 3,
    },
    statLabel: {
        fontSize: 11,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    statsRowLabel: {
        fontSize: 13,
        color: colors.textPrimary,
    },
    statsRowValue: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.primary,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalContent: {
        backgroundColor: colors.white,
        borderRadius: 14,
        padding: 16,
        width: '100%',
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 12,
    },
    modalLeaveInfo: {
        backgroundColor: colors.lightGray,
        padding: 10,
        borderRadius: 8,
        marginBottom: 12,
    },
    modalInfoText: {
        fontSize: 12,
        color: colors.textPrimary,
        marginBottom: 3,
    },
    inputGroup: {
        marginBottom: 12,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 6,
    },
    textInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        color: colors.textPrimary,
        backgroundColor: colors.white,
        textAlignVertical: 'top',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    modalButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalCancelButton: {
        backgroundColor: colors.lightGray,
    },
    modalApproveButton: {
        backgroundColor: colors.success,
    },
    modalRejectButton: {
        backgroundColor: colors.error,
    },
    modalCancelButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    modalActionButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.white,
    },
});

export default LeaveApprovalsScreen;