import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Alert,
    Modal,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import apiService from '../../services/api.service';

const CompApprovalScreen = ({ navigation }) => {
    // State management
    const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'history', 'statistics'
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Requests data
    const [pendingRequests, setPendingRequests] = useState([]);
    const [historyRequests, setHistoryRequests] = useState([]);
    const [statistics, setStatistics] = useState({
        total_requests: 0,
        total_days: 0,
        by_status: { pending: 0, approved: 0, cancelled: 0 },
        by_department: {},
        by_leave_type: {}
    });

    // Filters
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [filterDepartment, setFilterDepartment] = useState('');
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterStatus, setFilterStatus] = useState(''); // For history: 1=Approved, 2=Cancelled

    // Action modal
    const [showActionModal, setShowActionModal] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [actionType, setActionType] = useState(''); // 'approve' or 'reject'
    const [actionInput, setActionInput] = useState(''); // Remarks for approve, Reason for reject

    useEffect(() => {
        loadDepartments();
        loadEmployees();
    }, []);

    useEffect(() => {
        if (activeTab === 'pending') {
            fetchPendingRequests();
        } else if (activeTab === 'history') {
            fetchHistoryRequests();
        } else if (activeTab === 'statistics') {
            fetchStatistics();
        }
    }, [activeTab, filterDepartment, filterEmployee, filterStatus]);

    const loadDepartments = async () => {
        try {
            const response = await apiService.getDepartments();
            if (response.success && response.data?.message) {
                const deptData = response.data.message;
                setDepartments(Array.isArray(deptData) ? deptData : []);
            } else {
                setDepartments([]);
            }
        } catch (error) {
            console.error('Load departments error:', error);
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
            console.error('Load employees error:', error);
            setEmployees([]);
        }
    };

    const fetchPendingRequests = async () => {
        try {
            setLoading(true);
            const response = await apiService.getAllCompLeaves({
                docstatus: 0, // Pending only
                department: filterDepartment || null,
                employee: filterEmployee || null,
                limit: 100
            });

            if (response.success && response.data?.message) {
                const data = response.data.message;
                const applications = data.requests || [];
                setPendingRequests(Array.isArray(applications) ? applications : []);
                setStatistics(data.statistics || {});
            } else {
                setPendingRequests([]);
            }
        } catch (error) {
            console.error('Fetch pending requests error:', error);
            Alert.alert('Error', 'Failed to load pending requests');
            setPendingRequests([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchHistoryRequests = async () => {
        try {
            setLoading(true);
            const statusFilter = filterStatus ? parseInt(filterStatus) : null;
            const response = await apiService.getAllCompLeaves({
                docstatus: statusFilter, // 1=Approved, 2=Cancelled, or null for all history
                department: filterDepartment || null,
                employee: filterEmployee || null,
                limit: 200
            });

            if (response.success && response.data?.message) {
                const data = response.data.message;
                const applications = data.requests || [];
                // Filter out pending (docstatus=0) from history
                const historyOnly = Array.isArray(applications) 
                    ? applications.filter(app => app.docstatus !== 0)
                    : [];
                setHistoryRequests(historyOnly);
                setStatistics(data.statistics || {});
            } else {
                setHistoryRequests([]);
            }
        } catch (error) {
            console.error('Fetch history requests error:', error);
            Alert.alert('Error', 'Failed to load history');
            setHistoryRequests([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchStatistics = async () => {
        try {
            setLoading(true);
            const response = await apiService.getAllCompLeaves({
                department: filterDepartment || null,
                employee: filterEmployee || null,
                limit: 500
            });

            if (response.success && response.data?.message) {
                const data = response.data.message;
                setStatistics(data.statistics || {});
            }
        } catch (error) {
            console.error('Fetch statistics error:', error);
            Alert.alert('Error', 'Failed to load statistics');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        if (activeTab === 'pending') {
            fetchPendingRequests();
        } else if (activeTab === 'history') {
            fetchHistoryRequests();
        } else {
            fetchStatistics();
        }
    }, [activeTab, filterDepartment, filterEmployee, filterStatus]);

    const handleApprove = (request) => {
        setSelectedRequest(request);
        setActionType('approve');
        setActionInput('');
        setShowActionModal(true);
    };

    const handleReject = (request) => {
        setSelectedRequest(request);
        setActionType('reject');
        setActionInput('');
        setShowActionModal(true);
    };

    const executeAction = async () => {
        if (actionType === 'reject' && !actionInput.trim()) {
            Alert.alert('Validation Error', 'Rejection reason is required');
            return;
        }

        setLoading(true);
        setShowActionModal(false);

        try {
            let response;
            if (actionType === 'approve') {
                response = await apiService.approveCompLeave(selectedRequest.name, actionInput.trim());
            } else {
                response = await apiService.rejectCompLeave(selectedRequest.name, actionInput.trim());
            }

            if (response.success && response.data?.message) {
                const data = response.data.message;
                Alert.alert(
                    'Success',
                    actionType === 'approve'
                        ? `Request approved! ${data.days_allocated || 0} day(s) allocated to employee's leave balance.\n\nLeave Allocation: ${data.leave_allocation || 'N/A'}`
                        : 'Request rejected successfully'
                );
                fetchPendingRequests();
            } else {
                Alert.alert('Error', response.data?.message || `Failed to ${actionType} request`);
            }
        } catch (error) {
            console.error(`${actionType} error:`, error);
            Alert.alert('Error', error.message || `Failed to ${actionType} request`);
        } finally {
            setLoading(false);
            setSelectedRequest(null);
            setActionInput('');
        }
    };

    const clearFilters = () => {
        setFilterDepartment('');
        setFilterEmployee('');
        setFilterStatus('');
    };

    const getStatusBadge = (docstatus) => {
        if (docstatus === 0) return { text: 'Pending', color: '#FFA500' };
        if (docstatus === 1) return { text: 'Approved', color: '#4CAF50' };
        if (docstatus === 2) return { text: 'Cancelled', color: '#F44336' };
        return { text: 'Unknown', color: '#999' };
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    // Render Pending Tab
    const renderPendingTab = () => (
        <View style={styles.tabContent}>
            {/* Filters */}
            <View style={styles.filtersSection}>
                <Text style={styles.filterLabel}>Department:</Text>
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={filterDepartment}
                        onValueChange={(value) => setFilterDepartment(value)}
                        style={styles.picker}
                    >
                        <Picker.Item label="All Departments" value="" />
                        {departments.map((dept) => (
                            <Picker.Item key={dept.name} label={dept.department_name || dept.name} value={dept.name} />
                        ))}
                    </Picker>
                </View>

                <Text style={styles.filterLabel}>Employee:</Text>
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={filterEmployee}
                        onValueChange={(value) => setFilterEmployee(value)}
                        style={styles.picker}
                    >
                        <Picker.Item label="All Employees" value="" />
                        {employees.map((emp) => (
                            <Picker.Item key={emp.name} label={emp.employee_name} value={emp.name} />
                        ))}
                    </Picker>
                </View>

                <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
                    <Text style={styles.clearButtonText}>Clear Filters</Text>
                </TouchableOpacity>
            </View>

            {/* Requests List */}
            <ScrollView
                style={styles.requestsList}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {loading && !refreshing ? (
                    <Loading />
                ) : pendingRequests.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>No pending compensatory leave requests</Text>
                    </View>
                ) : (
                    pendingRequests.map((request) => (
                        <View key={request.name} style={styles.requestCard}>
                            <View style={styles.requestHeader}>
                                <Text style={styles.employeeName}>{request.employee_name}</Text>
                                <Text style={styles.requestId}>{request.name}</Text>
                            </View>

                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Department:</Text>
                                <Text style={styles.detailValue}>{request.department || 'N/A'}</Text>
                            </View>

                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Work Period:</Text>
                                <Text style={styles.detailValue}>
                                    {formatDate(request.work_from_date)} to {formatDate(request.work_end_date)}
                                </Text>
                            </View>

                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Compensatory Days:</Text>
                                <Text style={[styles.detailValue, styles.daysHighlight]}>
                                    {request.compensatory_days || 'N/A'}
                                </Text>
                            </View>

                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Reason:</Text>
                                <Text style={styles.detailValue}>{request.reason}</Text>
                            </View>

                            {request.leave_type && (
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Leave Type:</Text>
                                    <Text style={styles.detailValue}>{request.leave_type}</Text>
                                </View>
                            )}

                            {/* Action Buttons */}
                            <View style={styles.actionButtons}>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.approveButton]}
                                    onPress={() => handleApprove(request)}
                                >
                                    <Text style={styles.actionButtonText}>Approve</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.rejectButton]}
                                    onPress={() => handleReject(request)}
                                >
                                    <Text style={styles.actionButtonText}>Reject</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );

    // Render History Tab
    const renderHistoryTab = () => (
        <View style={styles.tabContent}>
            {/* Filters */}
            <View style={styles.filtersSection}>
                <Text style={styles.filterLabel}>Status:</Text>
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={filterStatus}
                        onValueChange={(value) => setFilterStatus(value)}
                        style={styles.picker}
                    >
                        <Picker.Item label="All History" value="" />
                        <Picker.Item label="Approved" value="1" />
                        <Picker.Item label="Cancelled" value="2" />
                    </Picker>
                </View>

                <Text style={styles.filterLabel}>Department:</Text>
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={filterDepartment}
                        onValueChange={(value) => setFilterDepartment(value)}
                        style={styles.picker}
                    >
                        <Picker.Item label="All Departments" value="" />
                        {departments.map((dept) => (
                            <Picker.Item key={dept.name} label={dept.department_name || dept.name} value={dept.name} />
                        ))}
                    </Picker>
                </View>

                <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
                    <Text style={styles.clearButtonText}>Clear Filters</Text>
                </TouchableOpacity>
            </View>

            {/* History List */}
            <ScrollView
                style={styles.requestsList}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {loading && !refreshing ? (
                    <Loading />
                ) : historyRequests.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>No history found</Text>
                    </View>
                ) : (
                    historyRequests.map((request) => {
                        const status = getStatusBadge(request.docstatus);
                        return (
                            <View key={request.name} style={styles.requestCard}>
                                <View style={styles.requestHeader}>
                                    <Text style={styles.employeeName}>{request.employee_name}</Text>
                                    <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
                                        <Text style={styles.statusBadgeText}>{status.text}</Text>
                                    </View>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Department:</Text>
                                    <Text style={styles.detailValue}>{request.department || 'N/A'}</Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Work Period:</Text>
                                    <Text style={styles.detailValue}>
                                        {formatDate(request.work_from_date)} to {formatDate(request.work_end_date)}
                                    </Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Compensatory Days:</Text>
                                    <Text style={styles.detailValue}>{request.compensatory_days || 'N/A'}</Text>
                                </View>

                                {request.leave_allocation && (
                                    <View style={[styles.detailRow, styles.allocationBox]}>
                                        <Text style={styles.allocationText}>
                                            ✓ Allocation: {request.leave_allocation}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );

    // Render Statistics Tab
    const renderStatisticsTab = () => (
        <ScrollView
            style={styles.tabContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <View style={styles.statsSection}>
                {/* Overall Stats */}
                <View style={styles.statsCard}>
                    <Text style={styles.statsTitle}>Overall Statistics</Text>
                    <View style={styles.statsRow}>
                        <Text style={styles.statsLabel}>Total Requests:</Text>
                        <Text style={styles.statsValue}>{statistics.total_requests || 0}</Text>
                    </View>
                    <View style={styles.statsRow}>
                        <Text style={styles.statsLabel}>Total Days:</Text>
                        <Text style={styles.statsValue}>{statistics.total_days || 0}</Text>
                    </View>
                </View>

                {/* By Status */}
                <View style={styles.statsCard}>
                    <Text style={styles.statsTitle}>By Status</Text>
                    <View style={styles.statsRow}>
                        <Text style={styles.statsLabel}>Pending:</Text>
                        <Text style={styles.statsValue}>{statistics.by_status?.pending || 0}</Text>
                    </View>
                    <View style={styles.statsRow}>
                        <Text style={styles.statsLabel}>Approved:</Text>
                        <Text style={styles.statsValue}>{statistics.by_status?.approved || 0}</Text>
                    </View>
                    <View style={styles.statsRow}>
                        <Text style={styles.statsLabel}>Cancelled:</Text>
                        <Text style={styles.statsValue}>{statistics.by_status?.cancelled || 0}</Text>
                    </View>
                </View>

                {/* By Department */}
                {statistics.by_department && Object.keys(statistics.by_department).length > 0 && (
                    <View style={styles.statsCard}>
                        <Text style={styles.statsTitle}>By Department</Text>
                        {Object.entries(statistics.by_department).map(([dept, count]) => (
                            <View key={dept} style={styles.statsRow}>
                                <Text style={styles.statsLabel}>{dept}:</Text>
                                <Text style={styles.statsValue}>{count}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* By Leave Type */}
                {statistics.by_leave_type && Object.keys(statistics.by_leave_type).length > 0 && (
                    <View style={styles.statsCard}>
                        <Text style={styles.statsTitle}>By Leave Type</Text>
                        {Object.entries(statistics.by_leave_type).map(([type, count]) => (
                            <View key={type} style={styles.statsRow}>
                                <Text style={styles.statsLabel}>{type}:</Text>
                                <Text style={styles.statsValue}>{count}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        </ScrollView>
    );

    // Action Modal
    const renderActionModal = () => (
        <Modal visible={showActionModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>
                        {actionType === 'approve' ? 'Approve Request' : 'Reject Request'}
                    </Text>

                    {selectedRequest && (
                        <View style={styles.modalInfo}>
                            <Text style={styles.modalInfoText}>
                                Employee: {selectedRequest.employee_name}
                            </Text>
                            <Text style={styles.modalInfoText}>
                                Days: {selectedRequest.compensatory_days || 'N/A'}
                            </Text>
                        </View>
                    )}

                    <Text style={styles.inputLabel}>
                        {actionType === 'approve' ? 'Remarks (Optional):' : 'Rejection Reason (Required):'}
                    </Text>
                    <TextInput
                        style={styles.textInput}
                        multiline
                        numberOfLines={4}
                        value={actionInput}
                        onChangeText={setActionInput}
                        placeholder={
                            actionType === 'approve'
                                ? 'Enter approval remarks...'
                                : 'Enter rejection reason...'
                        }
                    />

                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={[styles.modalButton, styles.modalCancelButton]}
                            onPress={() => {
                                setShowActionModal(false);
                                setActionInput('');
                            }}
                        >
                            <Text style={styles.modalButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.modalButton,
                                actionType === 'approve' ? styles.modalApproveButton : styles.modalRejectButton,
                            ]}
                            onPress={executeAction}
                        >
                            <Text style={[styles.modalButtonText, styles.modalButtonTextWhite]}>
                                {actionType === 'approve' ? 'Approve' : 'Reject'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    return (
        <View style={styles.container}>
            {/* Header Tabs */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
                    onPress={() => setActiveTab('pending')}
                >
                    <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
                        Pending ({statistics.by_status?.pending || 0})
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

            {/* Loading Overlay */}
            {loading && !refreshing && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background || '#F5F5F5',
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    tab: {
        flex: 1,
        paddingVertical: 14,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: colors.primary || '#007AFF',
    },
    tabText: {
        fontSize: 14,
        color: '#666',
        fontWeight: '500',
    },
    tabTextActive: {
        color: colors.primary || '#007AFF',
        fontWeight: '700',
    },
    tabContent: {
        flex: 1,
    },
    filtersSection: {
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    filterLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
        marginBottom: 6,
        marginTop: 8,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#DDDDDD',
        borderRadius: 8,
        marginBottom: 8,
    },
    picker: {
        height: 50,
    },
    clearButton: {
        backgroundColor: '#F5F5F5',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 8,
    },
    clearButtonText: {
        color: colors.primary || '#007AFF',
        fontSize: 14,
        fontWeight: '600',
    },
    requestsList: {
        flex: 1,
        padding: 16,
    },
    requestCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    requestHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    employeeName: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary || '#333',
        flex: 1,
    },
    requestId: {
        fontSize: 12,
        color: colors.textSecondary || '#666',
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
    },
    detailRow: {
        marginBottom: 8,
    },
    detailLabel: {
        fontSize: 12,
        color: colors.textSecondary || '#666',
        marginBottom: 2,
    },
    detailValue: {
        fontSize: 14,
        color: colors.textPrimary || '#333',
    },
    daysHighlight: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.primary || '#007AFF',
    },
    allocationBox: {
        backgroundColor: '#E8F5E9',
        padding: 8,
        borderRadius: 6,
        marginTop: 4,
    },
    allocationText: {
        fontSize: 13,
        color: '#2E7D32',
        fontWeight: '600',
    },
    actionButtons: {
        flexDirection: 'row',
        marginTop: 16,
        gap: 8,
    },
    actionButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    approveButton: {
        backgroundColor: '#4CAF50',
    },
    rejectButton: {
        backgroundColor: '#F44336',
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
    },
    emptyStateText: {
        fontSize: 16,
        color: colors.textSecondary || '#666',
        textAlign: 'center',
    },
    statsSection: {
        padding: 16,
    },
    statsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    statsTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary || '#333',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
        paddingBottom: 8,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    statsLabel: {
        fontSize: 14,
        color: colors.textSecondary || '#666',
    },
    statsValue: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 20,
        width: '100%',
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.textPrimary || '#333',
        marginBottom: 16,
        textAlign: 'center',
    },
    modalInfo: {
        backgroundColor: '#F5F5F5',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    modalInfoText: {
        fontSize: 14,
        color: colors.textPrimary || '#333',
        marginBottom: 4,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
        marginBottom: 8,
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#DDDDDD',
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        minHeight: 100,
        textAlignVertical: 'top',
        marginBottom: 16,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalCancelButton: {
        backgroundColor: '#F5F5F5',
    },
    modalApproveButton: {
        backgroundColor: '#4CAF50',
    },
    modalRejectButton: {
        backgroundColor: '#F44336',
    },
    modalButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
    },
    modalButtonTextWhite: {
        color: '#FFFFFF',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default CompApprovalScreen;