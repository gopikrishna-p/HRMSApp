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
    Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import Input from '../../components/common/Input';
import apiService, { extractFrappeData, isApiSuccess } from '../../services/api.service';

const LeaveApprovalsScreen = ({ navigation }) => {
    // State
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    // Tab state
    const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'history', 'statistics', 'apply'
    
    // Leave applications
    const [pendingLeaves, setPendingLeaves] = useState([]);
    const [historyLeaves, setHistoryLeaves] = useState([]);
    const [statistics, setStatistics] = useState(null);
    
    // Admin Apply Leave Form State
    const [applyForEmployee, setApplyForEmployee] = useState('');
    const [applyLeaveType, setApplyLeaveType] = useState('');
    const [applyFromDate, setApplyFromDate] = useState(new Date());
    const [applyToDate, setApplyToDate] = useState(new Date());
    const [applyIsHalfDay, setApplyIsHalfDay] = useState(false);
    const [applyHalfDayDate, setApplyHalfDayDate] = useState(new Date());
    const [applyReason, setApplyReason] = useState('');
    const [applyAutoApprove, setApplyAutoApprove] = useState(true);
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [leaveBalances, setLeaveBalances] = useState({});
    const [showApplyFromDatePicker, setShowApplyFromDatePicker] = useState(false);
    const [showApplyToDatePicker, setShowApplyToDatePicker] = useState(false);
    const [showApplyHalfDayPicker, setShowApplyHalfDayPicker] = useState(false);
    
    // Filters
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState('');
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
            };

            console.log('📋 Fetching pending leaves with filters:', filters);
            const response = await apiService.getAllLeaves(filters);
            console.log('📋 Response from getAllLeaves:', response);
            
            if (isApiSuccess(response)) {
                const result = extractFrappeData(response, { applications: [] });
                console.log('✅ Pending leaves loaded:', result.applications?.length || 0, 'applications');
                setPendingLeaves(Array.isArray(result.applications) ? result.applications : []);
            } else {
                console.error('❌ Failed to fetch leaves:', response);
                setPendingLeaves([]);
            }
        } catch (error) {
            console.error('❌ Error fetching pending leaves:', error);
            setPendingLeaves([]);
        }
    };

    const fetchHistoryLeaves = async () => {
        try {
            const filters = {
                status: historyStatusFilter || null,
                department: selectedDepartment || null,
                employee: selectedEmployee || null,
            };

            const response = await apiService.getAllLeaves(filters);
            console.log('📋 History response:', response);
            
            if (isApiSuccess(response)) {
                const result = extractFrappeData(response, { applications: [] });
                // Filter history to exclude pending
                const applications = Array.isArray(result.applications) ? result.applications : [];
                const history = applications.filter(
                    app => ['Approved', 'Rejected', 'Cancelled'].includes(app.status)
                );
                console.log('📋 History leaves loaded:', history.length, 'from', applications.length, 'total');
                setHistoryLeaves(history);
            } else {
                console.error('❌ Failed to fetch history:', response);
                setHistoryLeaves([]);
            }
        } catch (error) {
            console.error('❌ Error fetching history:', error);
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
            } else if (activeTab === 'statistics') {
                await fetchStatistics();
            }
        } catch (error) {
            console.error('Error refreshing:', error);
        } finally {
            setRefreshing(false);
        }
    }, [activeTab, selectedDepartment, selectedEmployee, historyStatusFilter]);

    const fetchStatistics = async () => {
        try {
            const response = await apiService.getLeaveStatistics(selectedDepartment || null);
            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, null);
                setStatistics(data);
            } else {
                setStatistics(null);
            }
        } catch (error) {
            console.error('Error fetching statistics:', error);
            setStatistics(null);
        }
    };

    useEffect(() => {
        if (activeTab === 'pending') {
            fetchPendingLeaves();
        } else if (activeTab === 'history') {
            fetchHistoryLeaves();
        } else if (activeTab === 'statistics') {
            fetchStatistics();
        }
    }, [activeTab, selectedDepartment, selectedEmployee, historyStatusFilter]);

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

    // ===== ADMIN APPLY LEAVE METHODS =====
    
    const loadLeaveTypesForEmployee = async (employeeId) => {
        if (!employeeId) {
            setLeaveTypes([]);
            setApplyLeaveType('');
            return;
        }
        
        try {
            const response = await apiService.getLeaveTypes(employeeId);
            if (response.success && response.data?.message) {
                const types = Array.isArray(response.data.message) ? response.data.message : [];
                setLeaveTypes(types);
                if (types.length > 0 && !applyLeaveType) {
                    setApplyLeaveType(types[0]);
                }
            } else {
                setLeaveTypes([]);
            }
        } catch (error) {
            console.error('Error loading leave types:', error);
            setLeaveTypes([]);
        }
    };

    const loadLeaveBalancesForEmployee = async (employeeId) => {
        if (!employeeId) {
            setLeaveBalances({});
            return;
        }
        
        try {
            const response = await apiService.getLeaveBalances(employeeId);
            if (response.success && response.data?.message) {
                setLeaveBalances(response.data.message || {});
            } else {
                setLeaveBalances({});
            }
        } catch (error) {
            console.error('Error loading leave balances:', error);
            setLeaveBalances({});
        }
    };

    // Watch for employee selection changes to load their leave types
    useEffect(() => {
        if (applyForEmployee) {
            loadLeaveTypesForEmployee(applyForEmployee);
            loadLeaveBalancesForEmployee(applyForEmployee);
        } else {
            setLeaveTypes([]);
            setLeaveBalances({});
            setApplyLeaveType('');
        }
    }, [applyForEmployee]);

    const handleAdminSubmitLeave = async () => {
        // Validation
        if (!applyForEmployee) {
            Alert.alert('Validation Error', 'Please select an employee');
            return;
        }

        if (!applyLeaveType) {
            Alert.alert('Validation Error', 'Please select a leave type');
            return;
        }

        if (applyFromDate > applyToDate) {
            Alert.alert('Validation Error', 'From date cannot be after To date');
            return;
        }

        if (!applyReason.trim()) {
            Alert.alert('Validation Error', 'Please provide a reason for leave');
            return;
        }

        // Check balance if available
        const balance = leaveBalances[applyLeaveType];
        if (balance && balance.balance_leaves !== undefined) {
            const requestedDays = Math.ceil((applyToDate - applyFromDate) / (1000 * 60 * 60 * 24)) + 1;
            if (balance.balance_leaves < requestedDays && !applyAutoApprove) {
                Alert.alert(
                    'Low Balance Warning',
                    `Selected employee only has ${balance.balance_leaves} days remaining for ${applyLeaveType}. Continue anyway?`,
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Continue', onPress: () => submitAdminLeave() }
                    ]
                );
                return;
            }
        }

        submitAdminLeave();
    };

    const formatLocalDate = (date) => {
        if (!date) return null;

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    };

    const submitAdminLeave = async () => {
        setLoading(true);
        try {
            const leaveData = {
                employee: applyForEmployee,
                leave_type: applyLeaveType,
                from_date: formatLocalDate(applyFromDate),
                to_date: formatLocalDate(applyToDate),
                half_day: applyIsHalfDay ? 1 : 0,
                half_day_date: applyIsHalfDay ? formatLocalDate(applyHalfDayDate) : null,
                description: applyReason.trim(),
                auto_approve: applyAutoApprove ? 1 : 0
            };

            const response = await apiService.adminSubmitLeave(leaveData);

            if (response.success && response.data?.message) {
                const rawResult = response.data.message;
                const result = rawResult?.data?.message || rawResult;
                const selectedEmployeeName = employees.find(e => e.name === applyForEmployee)?.employee_name || applyForEmployee;
                const days = result.total_leave_days ?? 'N/A';
                const remainingBalance = result.leave_balance ?? '';
                
                Alert.alert(
                    'Success',
                    `Leave submitted successfully for ${selectedEmployeeName}!\n${days} day(s) requested.${applyAutoApprove ? ' (Auto-approved)' : ''}${remainingBalance !== '' ? `\nRemaining balance: ${remainingBalance}` : ''}`,
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                // Reset form
                                setApplyReason('');
                                setApplyIsHalfDay(false);
                                setApplyFromDate(new Date());
                                setApplyToDate(new Date());
                                // Refresh data
                                loadLeaveBalancesForEmployee(applyForEmployee);
                                fetchPendingLeaves();
                                // Switch to pending tab
                                setActiveTab('pending');
                            }
                        }
                    ]
                );
            } else {
                Alert.alert('Error', response.message || 'Failed to submit leave application');
            }
        } catch (error) {
            console.error('Error submitting leave:', error);
            Alert.alert('Error', error.message || 'Failed to submit leave application');
        } finally {
            setLoading(false);
        }
    };

    const renderBalanceCard = () => {
        if (!applyLeaveType || !leaveBalances[applyLeaveType]) {
            return null;
        }

        const balance = leaveBalances[applyLeaveType];
        return (
            <View style={styles.applyBalanceCard}>
                <Text style={styles.applyBalanceTitle}>{applyLeaveType} Balance</Text>
                <View style={styles.applyBalanceRow}>
                    <View style={styles.applyBalanceItem}>
                        <Text style={styles.applyBalanceValue}>{balance.allocated_leaves || 0}</Text>
                        <Text style={styles.applyBalanceLabel}>Allocated</Text>
                    </View>
                    <View style={styles.applyBalanceItem}>
                        <Text style={[styles.applyBalanceValue, styles.applyBalanceRemaining]}>
                            {balance.balance_leaves || 0}
                        </Text>
                        <Text style={styles.applyBalanceLabel}>Remaining</Text>
                    </View>
                    <View style={styles.applyBalanceItem}>
                        <Text style={styles.applyBalanceValue}>
                            {(balance.allocated_leaves || 0) - (balance.balance_leaves || 0)}
                        </Text>
                        <Text style={styles.applyBalanceLabel}>Used</Text>
                    </View>
                </View>
            </View>
        );
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

    // ===== RENDER APPLY LEAVE TAB =====
    const renderApplyLeaveTab = () => (
        <ScrollView
            style={styles.tabContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <View style={styles.applyFormContainer}>
                <Text style={styles.applyFormTitle}>Apply Leave for Employee</Text>
                
                {/* Employee Selection */}
                <View style={styles.applyInputGroup}>
                    <Text style={styles.applyLabel}>Select Employee *</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={applyForEmployee}
                            onValueChange={(value) => setApplyForEmployee(value)}
                            style={styles.picker}
                        >
                            <Picker.Item label="Select Employee" value="" />
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

                {/* Leave Type Selection */}
                <View style={styles.applyInputGroup}>
                    <Text style={styles.applyLabel}>Leave Type *</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={applyLeaveType}
                            onValueChange={(value) => setApplyLeaveType(value)}
                            style={styles.picker}
                            enabled={leaveTypes.length > 0}
                        >
                            <Picker.Item label={leaveTypes.length > 0 ? "Select Leave Type" : "Select Employee First"} value="" />
                            {leaveTypes.map((type) => (
                                <Picker.Item key={type} label={type} value={type} />
                            ))}
                        </Picker>
                    </View>
                </View>

                {/* Leave Balance Card */}
                {renderBalanceCard()}

                {/* From Date */}
                <View style={styles.applyInputGroup}>
                    <Text style={styles.applyLabel}>From Date *</Text>
                    <TouchableOpacity
                        style={styles.applyDateButton}
                        onPress={() => setShowApplyFromDatePicker(true)}
                    >
                        <Text style={styles.applyDateText}>{applyFromDate.toDateString()}</Text>
                    </TouchableOpacity>
                    {showApplyFromDatePicker && (
                        <DateTimePicker
                            value={applyFromDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                                setShowApplyFromDatePicker(Platform.OS === 'ios');
                                if (date) {
                                    setApplyFromDate(date);
                                    if (date > applyToDate) setApplyToDate(date);
                                }
                            }}
                        />
                    )}
                </View>

                {/* To Date */}
                <View style={styles.applyInputGroup}>
                    <Text style={styles.applyLabel}>To Date *</Text>
                    <TouchableOpacity
                        style={styles.applyDateButton}
                        onPress={() => setShowApplyToDatePicker(true)}
                    >
                        <Text style={styles.applyDateText}>{applyToDate.toDateString()}</Text>
                    </TouchableOpacity>
                    {showApplyToDatePicker && (
                        <DateTimePicker
                            value={applyToDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            minimumDate={applyFromDate}
                            onChange={(event, date) => {
                                setShowApplyToDatePicker(Platform.OS === 'ios');
                                if (date) setApplyToDate(date);
                            }}
                        />
                    )}
                </View>

                {/* Half Day Toggle */}
                <TouchableOpacity
                    style={styles.applyCheckboxContainer}
                    onPress={() => setApplyIsHalfDay(!applyIsHalfDay)}
                >
                    <View style={[styles.applyCheckbox, applyIsHalfDay && styles.applyCheckboxChecked]}>
                        {applyIsHalfDay && <Text style={styles.applyCheckmark}>✓</Text>}
                    </View>
                    <Text style={styles.applyCheckboxLabel}>Half Day Leave</Text>
                </TouchableOpacity>

                {/* Half Day Date (conditional) */}
                {applyIsHalfDay && (
                    <View style={styles.applyInputGroup}>
                        <Text style={styles.applyLabel}>Half Day Date</Text>
                        <TouchableOpacity
                            style={styles.applyDateButton}
                            onPress={() => setShowApplyHalfDayPicker(true)}
                        >
                            <Text style={styles.applyDateText}>{applyHalfDayDate.toDateString()}</Text>
                        </TouchableOpacity>
                        {showApplyHalfDayPicker && (
                            <DateTimePicker
                                value={applyHalfDayDate}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                minimumDate={applyFromDate}
                                maximumDate={applyToDate}
                                onChange={(event, date) => {
                                    setShowApplyHalfDayPicker(Platform.OS === 'ios');
                                    if (date) setApplyHalfDayDate(date);
                                }}
                            />
                        )}
                    </View>
                )}

                {/* Reason */}
                <View style={styles.applyInputGroup}>
                    <Text style={styles.applyLabel}>Reason *</Text>
                    <TextInput
                        style={styles.applyTextArea}
                        placeholder="Enter reason for leave"
                        value={applyReason}
                        onChangeText={setApplyReason}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                </View>

                {/* Auto Approve Toggle */}
                <TouchableOpacity
                    style={styles.applyCheckboxContainer}
                    onPress={() => setApplyAutoApprove(!applyAutoApprove)}
                >
                    <View style={[styles.applyCheckbox, applyAutoApprove && styles.applyCheckboxChecked]}>
                        {applyAutoApprove && <Text style={styles.applyCheckmark}>✓</Text>}
                    </View>
                    <Text style={styles.applyCheckboxLabel}>Auto Approve Leave</Text>
                </TouchableOpacity>
                <Text style={styles.applyHint}>
                    When enabled, leave will be automatically approved upon submission
                </Text>

                {/* Submit Button */}
                <View style={styles.applySubmitContainer}>
                    <Button
                        title="Submit Leave Application"
                        onPress={handleAdminSubmitLeave}
                        disabled={loading || !applyForEmployee || !applyLeaveType}
                    />
                </View>
            </View>
        </ScrollView>
    );

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
            {/* My Leave Button for Admin Self */}
            <TouchableOpacity
                style={styles.myLeaveButton}
                onPress={() => navigation.navigate('MyLeaveApplication')}
            >
                <Text style={styles.myLeaveButtonText}>📝 Apply My Leave</Text>
            </TouchableOpacity>

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
                    style={[styles.tab, activeTab === 'apply' && styles.tabActive]}
                    onPress={() => setActiveTab('apply')}
                >
                    <Text style={[styles.tabText, activeTab === 'apply' && styles.tabTextActive]}>
                        Apply Leave
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
            {activeTab === 'apply' && renderApplyLeaveTab()}
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
    myLeaveButton: {
        backgroundColor: colors.primary,
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
    myLeaveButtonText: {
        color: colors.white,
        fontSize: 16,
        fontWeight: '600',
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
    // ===== APPLY LEAVE FORM STYLES =====
    applyFormContainer: {
        padding: 16,
    },
    applyFormTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 16,
    },
    applyInputGroup: {
        marginBottom: 16,
    },
    applyLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    applyDateButton: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 14,
        backgroundColor: colors.white,
    },
    applyDateText: {
        fontSize: 15,
        color: colors.textPrimary,
    },
    applyCheckboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    applyCheckbox: {
        width: 24,
        height: 24,
        borderWidth: 2,
        borderColor: colors.border,
        borderRadius: 6,
        marginRight: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.white,
    },
    applyCheckboxChecked: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    applyCheckmark: {
        color: colors.white,
        fontSize: 14,
        fontWeight: 'bold',
    },
    applyCheckboxLabel: {
        fontSize: 14,
        color: colors.textPrimary,
    },
    applyTextArea: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        color: colors.textPrimary,
        backgroundColor: colors.white,
        minHeight: 100,
        textAlignVertical: 'top',
    },
    applyHint: {
        fontSize: 12,
        color: colors.textSecondary,
        fontStyle: 'italic',
        marginBottom: 16,
        marginLeft: 34,
    },
    applySubmitContainer: {
        marginTop: 10,
        marginBottom: 30,
    },
    applyBalanceCard: {
        backgroundColor: colors.lightBlue,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    applyBalanceTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: 12,
    },
    applyBalanceRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    applyBalanceItem: {
        alignItems: 'center',
    },
    applyBalanceValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    applyBalanceRemaining: {
        color: colors.success,
    },
    applyBalanceLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
    },
});

export default LeaveApprovalsScreen;