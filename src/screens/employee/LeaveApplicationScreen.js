import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    RefreshControl,
    Platform,
    Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../../theme/colors';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import apiService from '../../services/api.service';

const LeaveApplicationScreen = ({ navigation }) => {
    // State for form
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [employeeId, setEmployeeId] = useState('');
    
    // Leave application form
    const [selectedLeaveType, setSelectedLeaveType] = useState('');
    const [fromDate, setFromDate] = useState(new Date());
    const [toDate, setToDate] = useState(new Date());
    const [isHalfDay, setIsHalfDay] = useState(false);
    const [halfDayDate, setHalfDayDate] = useState(new Date());
    const [reason, setReason] = useState('');
    const [selectedApprover, setSelectedApprover] = useState('');
    
    // Date picker controls
    const [showFromDatePicker, setShowFromDatePicker] = useState(false);
    const [showToDatePicker, setShowToDatePicker] = useState(false);
    const [showHalfDayPicker, setShowHalfDayPicker] = useState(false);
    
    // Leave data
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [balances, setBalances] = useState({});
    const [approvers, setApprovers] = useState([]);
    const [myLeaves, setMyLeaves] = useState([]);
    
    // Tab state
    const [activeTab, setActiveTab] = useState('apply'); // 'apply' or 'history'
    
    // Filter state for history
    const [historyStatusFilter, setHistoryStatusFilter] = useState('all');

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Get employee ID
            const empResponse = await apiService.getCurrentEmployee();
            if (empResponse.success && empResponse.data?.message) {
                const empId = empResponse.data.message.name;
                setEmployeeId(empId);
                
                // Load leave types, balances, and approvers in parallel
                await Promise.all([
                    loadLeaveTypes(empId),
                    loadLeaveBalances(empId),
                    loadApprovers(empId),
                    loadMyLeaves(empId)
                ]);
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
            Alert.alert('Error', 'Failed to load leave application data');
        } finally {
            setLoading(false);
        }
    };

    const loadLeaveTypes = async (empId) => {
        try {
            const response = await apiService.getLeaveTypes(empId);
            if (response.success && response.data?.message) {
                const types = Array.isArray(response.data.message) ? response.data.message : [];
                setLeaveTypes(types);
                if (types.length > 0) {
                    setSelectedLeaveType(types[0]);
                }
            } else {
                setLeaveTypes([]);
            }
        } catch (error) {
            console.error('Error loading leave types:', error);
            setLeaveTypes([]);
        }
    };

    const loadLeaveBalances = async (empId) => {
        try {
            const response = await apiService.getLeaveBalances(empId);
            if (response.success && response.data?.message) {
                setBalances(response.data.message || {});
            } else {
                setBalances({});
            }
        } catch (error) {
            console.error('Error loading balances:', error);
            setBalances({});
        }
    };

    const loadApprovers = async (empId) => {
        try {
            const response = await apiService.getLeaveApprovalDetails(empId);
            if (response.success && response.data?.message) {
                const approverData = response.data.message;
                const approversList = Array.isArray(approverData.department_approvers) 
                    ? approverData.department_approvers 
                    : [];
                setApprovers(approversList);
                if (approverData.leave_approver) {
                    setSelectedApprover(approverData.leave_approver);
                }
            } else {
                setApprovers([]);
            }
        } catch (error) {
            console.error('Error loading approvers:', error);
            setApprovers([]);
        }
    };

    const loadMyLeaves = async (empId) => {
        try {
            const response = await apiService.getMyLeaves({ employee: empId, limit: 50 });
            if (response.success && response.data?.message) {
                const applications = response.data.message.applications;
                setMyLeaves(Array.isArray(applications) ? applications : []);
            } else {
                setMyLeaves([]);
            }
        } catch (error) {
            console.error('Error loading my leaves:', error);
            setMyLeaves([]);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            if (employeeId) {
                await Promise.all([
                    loadLeaveBalances(employeeId),
                    loadMyLeaves(employeeId)
                ]);
            }
        } catch (error) {
            console.error('Error refreshing:', error);
        } finally {
            setRefreshing(false);
        }
    }, [employeeId]);

    const handleSubmitLeave = async () => {
        // Validation
        if (!selectedLeaveType) {
            Alert.alert('Validation Error', 'Please select a leave type');
            return;
        }

        if (fromDate > toDate) {
            Alert.alert('Validation Error', 'From date cannot be after To date');
            return;
        }

        if (!reason.trim()) {
            Alert.alert('Validation Error', 'Please provide a reason for leave');
            return;
        }

        // Check balance
        const balance = balances[selectedLeaveType];
        if (balance && balance.balance_leaves !== undefined) {
            const requestedDays = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
            if (balance.balance_leaves < requestedDays) {
                Alert.alert(
                    'Insufficient Balance',
                    `You only have ${balance.balance_leaves} days remaining for ${selectedLeaveType}`
                );
                return;
            }
        }

        setLoading(true);
        try {
            const leaveData = {
                employee: employeeId,
                leave_type: selectedLeaveType,
                from_date: fromDate.toISOString().split('T')[0],
                to_date: toDate.toISOString().split('T')[0],
                half_day: isHalfDay ? 1 : 0,
                half_day_date: isHalfDay ? halfDayDate.toISOString().split('T')[0] : null,
                description: reason.trim(),
                leave_approver: selectedApprover || null
            };

            const response = await apiService.submitLeave(leaveData);

            if (response.success && response.data?.message) {
                const result = response.data.message;
                Alert.alert(
                    'Success',
                    `Leave submitted successfully!\n${result.total_leave_days} day(s) requested.\nRemaining balance: ${result.leave_balance}`,
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                // Reset form
                                setReason('');
                                setIsHalfDay(false);
                                setFromDate(new Date());
                                setToDate(new Date());
                                // Refresh data
                                loadLeaveBalances(employeeId);
                                loadMyLeaves(employeeId);
                                // Switch to history tab
                                setActiveTab('history');
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

    const handleCancelLeave = async (applicationId) => {
        Alert.alert(
            'Cancel Leave',
            'Are you sure you want to cancel this leave application?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const response = await apiService.cancelMyLeave(
                                applicationId,
                                'Cancelled by employee'
                            );

                            if (response.success) {
                                Alert.alert('Success', 'Leave application cancelled');
                                loadLeaveBalances(employeeId);
                                loadMyLeaves(employeeId);
                            } else {
                                Alert.alert('Error', response.message || 'Failed to cancel leave');
                            }
                        } catch (error) {
                            console.error('Error cancelling leave:', error);
                            Alert.alert('Error', 'Failed to cancel leave');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const renderBalanceCard = () => {
        if (!selectedLeaveType || !balances[selectedLeaveType]) {
            return null;
        }

        const balance = balances[selectedLeaveType];
        return (
            <View style={styles.balanceCard}>
                <Text style={styles.balanceTitle}>{selectedLeaveType} Balance</Text>
                <View style={styles.balanceRow}>
                    <View style={styles.balanceItem}>
                        <Text style={styles.balanceValue}>{balance.allocated_leaves || 0}</Text>
                        <Text style={styles.balanceLabel}>Allocated</Text>
                    </View>
                    <View style={styles.balanceItem}>
                        <Text style={[styles.balanceValue, styles.balanceRemaining]}>
                            {balance.balance_leaves || 0}
                        </Text>
                        <Text style={styles.balanceLabel}>Remaining</Text>
                    </View>
                    <View style={styles.balanceItem}>
                        <Text style={styles.balanceValue}>
                            {(balance.allocated_leaves || 0) - (balance.balance_leaves || 0)}
                        </Text>
                        <Text style={styles.balanceLabel}>Used</Text>
                    </View>
                </View>
            </View>
        );
    };

    const renderLeaveApplicationForm = () => (
        <ScrollView
            style={styles.formContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {/* Leave Type Picker */}
            <View style={styles.inputGroup}>
                <Text style={styles.label}>Leave Type *</Text>
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={selectedLeaveType}
                        onValueChange={(value) => setSelectedLeaveType(value)}
                        style={styles.picker}
                    >
                        <Picker.Item label="Select Leave Type" value="" />
                        {leaveTypes.map((type) => (
                            <Picker.Item key={type} label={type} value={type} />
                        ))}
                    </Picker>
                </View>
            </View>

            {renderBalanceCard()}

            {/* From Date */}
            <View style={styles.inputGroup}>
                <Text style={styles.label}>From Date *</Text>
                <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => setShowFromDatePicker(true)}
                >
                    <Text style={styles.dateText}>{fromDate.toDateString()}</Text>
                </TouchableOpacity>
                {showFromDatePicker && (
                    <DateTimePicker
                        value={fromDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, date) => {
                            setShowFromDatePicker(Platform.OS === 'ios');
                            if (date) {
                                setFromDate(date);
                                if (date > toDate) setToDate(date);
                            }
                        }}
                    />
                )}
            </View>

            {/* To Date */}
            <View style={styles.inputGroup}>
                <Text style={styles.label}>To Date *</Text>
                <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => setShowToDatePicker(true)}
                >
                    <Text style={styles.dateText}>{toDate.toDateString()}</Text>
                </TouchableOpacity>
                {showToDatePicker && (
                    <DateTimePicker
                        value={toDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        minimumDate={fromDate}
                        onChange={(event, date) => {
                            setShowToDatePicker(Platform.OS === 'ios');
                            if (date) setToDate(date);
                        }}
                    />
                )}
            </View>

            {/* Half Day Toggle */}
            <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setIsHalfDay(!isHalfDay)}
            >
                <View style={[styles.checkbox, isHalfDay && styles.checkboxChecked]}>
                    {isHalfDay && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Half Day Leave</Text>
            </TouchableOpacity>

            {/* Half Day Date (conditional) */}
            {isHalfDay && (
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Half Day Date</Text>
                    <TouchableOpacity
                        style={styles.dateButton}
                        onPress={() => setShowHalfDayPicker(true)}
                    >
                        <Text style={styles.dateText}>{halfDayDate.toDateString()}</Text>
                    </TouchableOpacity>
                    {showHalfDayPicker && (
                        <DateTimePicker
                            value={halfDayDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            minimumDate={fromDate}
                            maximumDate={toDate}
                            onChange={(event, date) => {
                                setShowHalfDayPicker(Platform.OS === 'ios');
                                if (date) setHalfDayDate(date);
                            }}
                        />
                    )}
                </View>
            )}

            {/* Reason */}
            <View style={styles.inputGroup}>
                <Text style={styles.label}>Reason *</Text>
                <Input
                    placeholder="Enter reason for leave"
                    value={reason}
                    onChangeText={setReason}
                    multiline
                    numberOfLines={4}
                    style={styles.textArea}
                />
            </View>

            {/* Approver (optional) */}
            {approvers.length > 0 && (
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Leave Approver</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={selectedApprover}
                            onValueChange={(value) => setSelectedApprover(value)}
                            style={styles.picker}
                        >
                            <Picker.Item label="Default Approver" value="" />
                            {approvers.map((approver) => (
                                <Picker.Item
                                    key={approver.name}
                                    label={approver.full_name}
                                    value={approver.name}
                                />
                            ))}
                        </Picker>
                    </View>
                </View>
            )}

            {/* Submit Button */}
            <View style={styles.submitButtonContainer}>
                <Button
                    title="Submit Leave Application"
                    onPress={handleSubmitLeave}
                    disabled={loading}
                />
            </View>
        </ScrollView>
    );

    const renderLeaveHistory = () => {
        const filteredLeaves = myLeaves.filter(leave => {
            if (historyStatusFilter === 'all') return true;
            return leave.status === historyStatusFilter;
        });

        return (
            <View style={styles.historyContainer}>
                {/* Status Filter */}
                <View style={styles.filterRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {['all', 'Open', 'Approved', 'Rejected', 'Cancelled'].map(status => (
                            <TouchableOpacity
                                key={status}
                                style={[
                                    styles.filterChip,
                                    historyStatusFilter === status && styles.filterChipActive
                                ]}
                                onPress={() => setHistoryStatusFilter(status)}
                            >
                                <Text
                                    style={[
                                        styles.filterChipText,
                                        historyStatusFilter === status && styles.filterChipTextActive
                                    ]}
                                >
                                    {status === 'all' ? 'All' : status}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <ScrollView
                    style={styles.historyList}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                >
                    {filteredLeaves.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No leave applications found</Text>
                        </View>
                    ) : (
                        filteredLeaves.map((leave) => (
                            <View key={leave.name} style={styles.leaveCard}>
                                <View style={styles.leaveCardHeader}>
                                    <Text style={styles.leaveType}>{leave.leave_type}</Text>
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
                                    <Text style={styles.leaveDate}>
                                        {new Date(leave.from_date).toLocaleDateString()} -{' '}
                                        {new Date(leave.to_date).toLocaleDateString()}
                                    </Text>
                                    <Text style={styles.leaveDays}>
                                        {leave.total_leave_days} day(s)
                                        {leave.half_day ? ' (Half Day)' : ''}
                                    </Text>
                                    {leave.description && (
                                        <Text style={styles.leaveReason} numberOfLines={2}>
                                            {leave.description}
                                        </Text>
                                    )}
                                    {leave.leave_approver_name && (
                                        <Text style={styles.leaveApprover}>
                                            Approver: {leave.leave_approver_name}
                                        </Text>
                                    )}
                                </View>

                                {leave.status === 'Open' && (
                                    <TouchableOpacity
                                        style={styles.cancelButton}
                                        onPress={() => handleCancelLeave(leave.name)}
                                    >
                                        <Text style={styles.cancelButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))
                    )}
                </ScrollView>
            </View>
        );
    };

    if (loading && !refreshing) {
        return <Loading message="Loading leave application..." />;
    }

    return (
        <View style={styles.container}>
            {/* Tab Navigation */}
            <View style={styles.tabContainer}>
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
                        My Leaves ({myLeaves.length})
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Tab Content */}
            {activeTab === 'apply' ? renderLeaveApplicationForm() : renderLeaveHistory()}
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
    },
    tab: {
        flex: 1,
        paddingVertical: 16,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: colors.primary,
    },
    tabText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: colors.primary,
        fontWeight: '600',
    },
    formContainer: {
        flex: 1,
        padding: 16,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: colors.white,
    },
    picker: {
        height: 50,
    },
    dateButton: {
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: colors.white,
    },
    dateText: {
        fontSize: 15,
        color: colors.textPrimary,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderWidth: 2,
        borderColor: colors.border,
        borderRadius: 4,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    checkmark: {
        color: colors.white,
        fontSize: 16,
        fontWeight: 'bold',
    },
    checkboxLabel: {
        fontSize: 15,
        color: colors.textPrimary,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    balanceCard: {
        backgroundColor: colors.lightBlue,
        padding: 16,
        borderRadius: 12,
        marginBottom: 20,
    },
    balanceTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 12,
    },
    balanceRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    balanceItem: {
        alignItems: 'center',
    },
    balanceValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    balanceRemaining: {
        color: colors.success,
    },
    balanceLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
    },
    submitButtonContainer: {
        marginTop: 10,
        marginBottom: 30,
    },
    historyContainer: {
        flex: 1,
    },
    filterRow: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: colors.lightGray,
        marginRight: 8,
    },
    filterChipActive: {
        backgroundColor: colors.primary,
    },
    filterChipText: {
        fontSize: 14,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    filterChipTextActive: {
        color: colors.white,
    },
    historyList: {
        flex: 1,
        padding: 16,
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: colors.textSecondary,
    },
    leaveCard: {
        backgroundColor: colors.white,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    leaveCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    leaveType: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
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
        fontSize: 12,
        fontWeight: '600',
    },
    leaveDetails: {
        marginBottom: 12,
    },
    leaveDate: {
        fontSize: 14,
        color: colors.textPrimary,
        marginBottom: 4,
    },
    leaveDays: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    leaveReason: {
        fontSize: 13,
        color: colors.textSecondary,
        fontStyle: 'italic',
        marginTop: 6,
    },
    leaveApprover: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
    },
    cancelButton: {
        padding: 10,
        borderRadius: 8,
        backgroundColor: colors.error,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: colors.white,
        fontSize: 14,
        fontWeight: '600',
    },
});

export default LeaveApplicationScreen;