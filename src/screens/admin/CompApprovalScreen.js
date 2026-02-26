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
    Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import Input from '../../components/common/Input';
import apiService from '../../services/api.service';

const CompApprovalScreen = ({ navigation }) => {
    // State management
    const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'apply', 'history', 'statistics'
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

    // Apply Form States
    const [applyEmployee, setApplyEmployee] = useState('');
    const [applyWorkFromDate, setApplyWorkFromDate] = useState(new Date());
    const [applyWorkEndDate, setApplyWorkEndDate] = useState(new Date());
    const [showApplyFromPicker, setShowApplyFromPicker] = useState(false);
    const [showApplyEndPicker, setShowApplyEndPicker] = useState(false);
    const [applyReason, setApplyReason] = useState('');
    const [applyHalfDay, setApplyHalfDay] = useState(false);
    const [applyHalfDayDate, setApplyHalfDayDate] = useState(new Date());
    const [showApplyHalfDayPicker, setShowApplyHalfDayPicker] = useState(false);
    const [applyLeaveType, setApplyLeaveType] = useState('Compensatory Off');
    const [leaveTypes, setLeaveTypes] = useState([]);

    // Action modal
    const [showActionModal, setShowActionModal] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [actionType, setActionType] = useState(''); // 'approve' or 'reject'
    const [actionInput, setActionInput] = useState(''); // Remarks for approve, Reason for reject

    useEffect(() => {
        loadDepartments();
        loadEmployees();
        loadLeaveTypes();
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

    const loadLeaveTypes = async () => {
        try {
            const response = await apiService.getLeaveTypes();
            if (response.success && response.data?.message) {
                const types = response.data.message;
                // Filter for compensatory off types or allow all
                const compTypes = Array.isArray(types) 
                    ? types.filter(t => t.is_compensatory === 1 || t.leave_type_name?.toLowerCase().includes('compensatory'))
                    : [];
                // If no compensatory types, use all
                setLeaveTypes(compTypes.length > 0 ? compTypes : (Array.isArray(types) ? types : []));
                // Set default
                if (compTypes.length > 0) {
                    setApplyLeaveType(compTypes[0].name);
                } else if (Array.isArray(types) && types.length > 0) {
                    setApplyLeaveType(types[0].name);
                }
            } else {
                setLeaveTypes([]);
            }
        } catch (error) {
            console.error('Load leave types error:', error);
            setLeaveTypes([]);
        }
    };

    const fetchPendingRequests = async () => {
        try {
            setLoading(true);
            console.log('📋 Fetching pending comp leave requests with filters:', {
                docstatus: 0,
                department: filterDepartment || null,
                employee: filterEmployee || null,
            });
            
            const response = await apiService.getAllCompLeaves({
                docstatus: 0, // Pending only
                department: filterDepartment || null,
                employee: filterEmployee || null,
                limit: 100
            });

            console.log('📋 Response from getAllCompLeaves:', response);
            
            if (response.success && response.data?.message) {
                const data = response.data.message;
                const applications = data.requests || [];
                console.log('✅ Pending comp leaves loaded:', applications.length, 'requests');
                setPendingRequests(Array.isArray(applications) ? applications : []);
                setStatistics(data.statistics || {});
            } else {
                console.error('❌ Failed to fetch comp leaves:', response);
                setPendingRequests([]);
            }
        } catch (error) {
            console.error('❌ Fetch pending comp leave requests error:', error);
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

    // Admin Apply Comp-Off for Employee
    const handleAdminApplyCompOff = async () => {
        // Validation
        if (!applyEmployee) {
            Alert.alert('Validation Error', 'Please select an employee');
            return;
        }
        if (!applyReason.trim()) {
            Alert.alert('Validation Error', 'Please provide a reason for working on holiday');
            return;
        }
        if (applyWorkEndDate < applyWorkFromDate) {
            Alert.alert('Validation Error', 'Work end date cannot be before start date');
            return;
        }
        if (applyHalfDay && !applyHalfDayDate) {
            Alert.alert('Validation Error', 'Please select half day date');
            return;
        }

        setLoading(true);
        try {
            const response = await apiService.submitCompLeave({
                employee: applyEmployee,
                work_from_date: applyWorkFromDate.toISOString().split('T')[0],
                work_end_date: applyWorkEndDate.toISOString().split('T')[0],
                reason: applyReason.trim(),
                leave_type: applyLeaveType || 'Compensatory Off',
                half_day: applyHalfDay ? 1 : 0,
                half_day_date: applyHalfDay ? applyHalfDayDate.toISOString().split('T')[0] : null
            });

            if (response.success && response.data?.message) {
                const data = response.data.message;
                const empName = employees.find(e => e.name === applyEmployee)?.employee_name || applyEmployee;
                Alert.alert(
                    'Success',
                    `Comp-off request for ${empName} submitted successfully!\n\n` +
                    `Compensatory Days: ${data.compensatory_days || 'N/A'}\n` +
                    `Status: ${data.docstatus === 1 ? 'Approved' : 'Pending'}`,
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                // Reset form
                                setApplyEmployee('');
                                setApplyReason('');
                                setApplyHalfDay(false);
                                setApplyWorkFromDate(new Date());
                                setApplyWorkEndDate(new Date());
                                // Switch to pending tab
                                setActiveTab('pending');
                            }
                        }
                    ]
                );
            } else {
                Alert.alert('Error', response.data?.message || 'Failed to submit comp-off request');
            }
        } catch (error) {
            console.error('Admin apply comp-off error:', error);
            Alert.alert('Error', error.message || 'Failed to submit comp-off request');
        } finally {
            setLoading(false);
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

    // Render Apply Tab - Admin apply comp-off for employee
    const renderApplyTab = () => (
        <ScrollView style={styles.tabContent}>
            <View style={styles.applyForm}>
                <Text style={styles.applyTitle}>Apply Comp-Off for Employee</Text>
                <Text style={styles.applySubtitle}>
                    Submit compensatory leave request for employees who worked on holidays.
                </Text>

                {/* Employee Selection */}
                <View style={styles.formGroup}>
                    <Text style={styles.fieldLabel}>Select Employee *</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={applyEmployee}
                            onValueChange={(value) => setApplyEmployee(value)}
                            style={styles.picker}
                        >
                            <Picker.Item label="-- Select Employee --" value="" />
                            {employees.map((emp) => (
                                <Picker.Item key={emp.name} label={emp.employee_name} value={emp.name} />
                            ))}
                        </Picker>
                    </View>
                </View>

                {/* Leave Type */}
                <View style={styles.formGroup}>
                    <Text style={styles.fieldLabel}>Leave Type</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={applyLeaveType}
                            onValueChange={(value) => setApplyLeaveType(value)}
                            style={styles.picker}
                        >
                            <Picker.Item label="Compensatory Off" value="Compensatory Off" />
                            {leaveTypes.map((lt) => (
                                <Picker.Item key={lt.name} label={lt.leave_type_name || lt.name} value={lt.name} />
                            ))}
                        </Picker>
                    </View>
                </View>

                {/* Work From Date */}
                <View style={styles.formGroup}>
                    <Text style={styles.fieldLabel}>Work From Date (Holiday) *</Text>
                    <TouchableOpacity 
                        style={styles.dateButton}
                        onPress={() => setShowApplyFromPicker(true)}
                    >
                        <Text style={styles.dateButtonText}>{formatDate(applyWorkFromDate)}</Text>
                    </TouchableOpacity>
                    {showApplyFromPicker && (
                        <DateTimePicker
                            value={applyWorkFromDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                                setShowApplyFromPicker(Platform.OS === 'ios');
                                if (date) setApplyWorkFromDate(date);
                            }}
                        />
                    )}
                </View>

                {/* Work End Date */}
                <View style={styles.formGroup}>
                    <Text style={styles.fieldLabel}>Work End Date (Holiday) *</Text>
                    <TouchableOpacity 
                        style={styles.dateButton}
                        onPress={() => setShowApplyEndPicker(true)}
                    >
                        <Text style={styles.dateButtonText}>{formatDate(applyWorkEndDate)}</Text>
                    </TouchableOpacity>
                    {showApplyEndPicker && (
                        <DateTimePicker
                            value={applyWorkEndDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                                setShowApplyEndPicker(Platform.OS === 'ios');
                                if (date) setApplyWorkEndDate(date);
                            }}
                        />
                    )}
                </View>

                {/* Half Day Toggle */}
                <View style={styles.formGroup}>
                    <View style={styles.checkboxRow}>
                        <TouchableOpacity 
                            style={styles.checkbox}
                            onPress={() => setApplyHalfDay(!applyHalfDay)}
                        >
                            <View style={[styles.checkboxInner, applyHalfDay && styles.checkboxChecked]}>
                                {applyHalfDay && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                        </TouchableOpacity>
                        <Text style={styles.checkboxLabel}>Half Day</Text>
                    </View>
                </View>

                {/* Half Day Date (conditional) */}
                {applyHalfDay && (
                    <View style={styles.formGroup}>
                        <Text style={styles.fieldLabel}>Half Day Date *</Text>
                        <TouchableOpacity 
                            style={styles.dateButton}
                            onPress={() => setShowApplyHalfDayPicker(true)}
                        >
                            <Text style={styles.dateButtonText}>{formatDate(applyHalfDayDate)}</Text>
                        </TouchableOpacity>
                        {showApplyHalfDayPicker && (
                            <DateTimePicker
                                value={applyHalfDayDate}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={(event, date) => {
                                    setShowApplyHalfDayPicker(Platform.OS === 'ios');
                                    if (date) setApplyHalfDayDate(date);
                                }}
                            />
                        )}
                    </View>
                )}

                {/* Reason */}
                <View style={styles.formGroup}>
                    <Text style={styles.fieldLabel}>Reason for Working on Holiday *</Text>
                    <Input
                        value={applyReason}
                        onChangeText={setApplyReason}
                        placeholder="e.g., Employee worked on Christmas for urgent project delivery"
                        multiline
                        numberOfLines={4}
                        style={styles.textArea}
                    />
                </View>

                {/* Submit Button */}
                <View style={styles.submitButtonContainer}>
                    <Button
                        title={loading ? 'Submitting...' : 'Submit Comp-Off Request'}
                        onPress={handleAdminApplyCompOff}
                        disabled={loading}
                        mode="contained"
                    />
                </View>

                {/* Info Box */}
                <View style={styles.infoBox}>
                    <Text style={styles.infoTitle}>ℹ️ Important Notes:</Text>
                    <Text style={styles.infoText}>• Work dates must be actual holidays for the employee</Text>
                    <Text style={styles.infoText}>• Employee must have attendance marked on those dates</Text>
                    <Text style={styles.infoText}>• Compensatory days will be allocated on approval</Text>
                    <Text style={styles.infoText}>• Admin-submitted requests are auto-approved</Text>
                </View>
            </View>
        </ScrollView>
    );

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
            {/* My Comp-Off Button */}
            <TouchableOpacity 
                style={styles.myCompOffButton}
                onPress={() => navigation.navigate('MyCompensatoryLeave')}
            >
                <Text style={styles.myCompOffButtonText}>📋 Apply My Comp-Off</Text>
            </TouchableOpacity>

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
                    style={[styles.tab, activeTab === 'apply' && styles.tabActive]}
                    onPress={() => setActiveTab('apply')}
                >
                    <Text style={[styles.tabText, activeTab === 'apply' && styles.tabTextActive]}>
                        Apply
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
                        Stats
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Tab Content */}
            {activeTab === 'pending' && renderPendingTab()}
            {activeTab === 'apply' && renderApplyTab()}
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
    myCompOffButton: {
        backgroundColor: colors.primary || '#007AFF',
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 12,
        marginTop: 12,
        marginBottom: 8,
        borderRadius: 10,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    myCompOffButtonText: {
        color: colors.white || '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
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
        borderBottomColor: colors.primary || '#007AFF',
    },
    tabText: {
        fontSize: 13,
        color: '#666',
        fontWeight: '500',
    },
    tabTextActive: {
        color: colors.primary || '#007AFF',
        fontWeight: '600',
    },
    tabContent: {
        flex: 1,
    },
    // Apply Form Styles
    applyForm: {
        padding: 16,
    },
    applyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.textPrimary || '#333',
        marginBottom: 8,
    },
    applySubtitle: {
        fontSize: 14,
        color: colors.textSecondary || '#666',
        marginBottom: 20,
        lineHeight: 20,
    },
    formGroup: {
        marginBottom: 16,
    },
    fieldLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
        marginBottom: 8,
    },
    dateButton: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#DDDDDD',
        borderRadius: 8,
        padding: 12,
    },
    dateButtonText: {
        fontSize: 16,
        color: colors.textPrimary || '#333',
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkbox: {
        marginRight: 10,
    },
    checkboxInner: {
        width: 24,
        height: 24,
        borderWidth: 2,
        borderColor: colors.primary || '#007AFF',
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxChecked: {
        backgroundColor: colors.primary || '#007AFF',
    },
    checkmark: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    checkboxLabel: {
        fontSize: 16,
        color: colors.textPrimary || '#333',
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    submitButtonContainer: {
        marginVertical: 20,
    },
    infoBox: {
        backgroundColor: '#E3F2FD',
        borderRadius: 8,
        padding: 16,
        marginTop: 10,
    },
    infoTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1976D2',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 13,
        color: '#1565C0',
        marginBottom: 4,
        lineHeight: 18,
    },
    filtersSection: {
        backgroundColor: '#FFFFFF',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    filterLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
        marginBottom: 5,
        marginTop: 6,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#DDDDDD',
        borderRadius: 8,
        marginBottom: 6,
    },
    picker: {
        height: 42,
    },
    clearButton: {
        backgroundColor: '#F5F5F5',
        padding: 8,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 6,
    },
    clearButtonText: {
        color: colors.primary || '#007AFF',
        fontSize: 12,
        fontWeight: '600',
    },
    requestsList: {
        flex: 1,
        padding: 12,
    },
    requestCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    requestHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    employeeName: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
        flex: 1,
    },
    requestId: {
        fontSize: 11,
        color: colors.textSecondary || '#666',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    statusBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '600',
    },
    detailRow: {
        marginBottom: 6,
    },
    detailLabel: {
        fontSize: 11,
        color: colors.textSecondary || '#666',
        marginBottom: 2,
    },
    detailValue: {
        fontSize: 12,
        color: colors.textPrimary || '#333',
    },
    daysHighlight: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.primary || '#007AFF',
    },
    allocationBox: {
        backgroundColor: '#E8F5E9',
        padding: 6,
        borderRadius: 6,
        marginTop: 3,
    },
    allocationText: {
        fontSize: 11,
        color: '#2E7D32',
        fontWeight: '600',
    },
    actionButtons: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 8,
    },
    actionButton: {
        flex: 1,
        padding: 10,
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
        fontSize: 12,
        fontWeight: '600',
    },
    emptyState: {
        padding: 30,
        alignItems: 'center',
    },
    emptyStateText: {
        fontSize: 14,
        color: colors.textSecondary || '#666',
        textAlign: 'center',
    },
    statsSection: {
        padding: 12,
    },
    statsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    statsTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
        paddingBottom: 6,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 5,
    },
    statsLabel: {
        fontSize: 13,
        color: colors.textSecondary || '#666',
    },
    statsValue: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 16,
        width: '100%',
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
        marginBottom: 12,
        textAlign: 'center',
    },
    modalInfo: {
        backgroundColor: '#F5F5F5',
        padding: 10,
        borderRadius: 8,
        marginBottom: 12,
    },
    modalInfoText: {
        fontSize: 12,
        color: colors.textPrimary || '#333',
        marginBottom: 3,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
        marginBottom: 6,
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#DDDDDD',
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        minHeight: 90,
        textAlignVertical: 'top',
        marginBottom: 12,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    modalButton: {
        flex: 1,
        padding: 10,
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
        fontSize: 13,
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