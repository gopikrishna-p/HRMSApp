import React, { useState, useEffect, useCallback } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    ScrollView, 
    TouchableOpacity, 
    RefreshControl,
    Alert,
    Platform,
    ActivityIndicator
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../../theme/colors';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import apiService from '../../services/api.service';

const CompensatoryLeaveScreen = ({ navigation }) => {
    // State management
    const [employeeId, setEmployeeId] = useState('');
    const [activeTab, setActiveTab] = useState('apply'); // 'apply' or 'history'
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    // Apply form states
    const [workFromDate, setWorkFromDate] = useState(new Date());
    const [workEndDate, setWorkEndDate] = useState(new Date());
    const [showWorkFromPicker, setShowWorkFromPicker] = useState(false);
    const [showWorkEndPicker, setShowWorkEndPicker] = useState(false);
    const [reason, setReason] = useState('');
    const [halfDay, setHalfDay] = useState(false);
    const [halfDayDate, setHalfDayDate] = useState(new Date());
    const [showHalfDayPicker, setShowHalfDayPicker] = useState(false);
    const [leaveType, setLeaveType] = useState('Compensatory Off');
    
    // History states
    const [myRequests, setMyRequests] = useState([]);
    const [filterStatus, setFilterStatus] = useState(null); // null, 0, 1, 2
    const [totalDays, setTotalDays] = useState(0);
    const [statusSummary, setStatusSummary] = useState({
        pending: 0,
        approved: 0,
        cancelled: 0
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (activeTab === 'history' && employeeId) {
            loadMyRequests();
        }
    }, [activeTab, filterStatus, employeeId]);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            // Get employee ID
            const empResponse = await apiService.getCurrentEmployee();
            if (empResponse.success && empResponse.data?.message) {
                const empId = empResponse.data.message.name;
                setEmployeeId(empId);
            } else {
                Alert.alert('Error', 'Failed to get employee information');
            }
        } catch (error) {
            console.error('Error loading employee data:', error);
            Alert.alert('Error', 'Failed to load employee information');
        } finally {
            setLoading(false);
        }
    };

    const loadMyRequests = async () => {
        if (!employeeId) return;
        
        try {
            setLoading(true);
            const response = await apiService.getMyCompLeaves({
                employee: employeeId,
                docstatus: filterStatus,
                from_date: null,
                to_date: null,
                limit: 100
            });

            if (response.success && response.data?.message) {
                const data = response.data.message;
                setMyRequests(Array.isArray(data.requests) ? data.requests : []);
                setTotalDays(data.total_compensatory_days || 0);
                setStatusSummary(data.status_summary || { pending: 0, approved: 0, cancelled: 0 });
            } else {
                setMyRequests([]);
            }
        } catch (error) {
            console.error('Load requests error:', error);
            Alert.alert('Error', 'Failed to load compensatory leave requests');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadMyRequests();
    }, []);

    const handleSubmit = async () => {
        // Check if employee ID is loaded
        if (!employeeId) {
            Alert.alert('Error', 'Employee information not loaded. Please try again.');
            return;
        }

        // Validation
        if (!reason.trim()) {
            Alert.alert('Validation Error', 'Please provide a reason for working on holiday');
            return;
        }

        if (workEndDate < workFromDate) {
            Alert.alert('Validation Error', 'Work end date cannot be before start date');
            return;
        }

        if (halfDay && !halfDayDate) {
            Alert.alert('Validation Error', 'Please select half day date');
            return;
        }

        setLoading(true);
        try {
            const response = await apiService.submitCompLeave({
                employee: employeeId,
                work_from_date: workFromDate.toISOString().split('T')[0],
                work_end_date: workEndDate.toISOString().split('T')[0],
                reason: reason.trim(),
                leave_type: leaveType,
                half_day: halfDay ? 1 : 0,
                half_day_date: halfDay ? halfDayDate.toISOString().split('T')[0] : null
            });

            if (response.success && response.data?.message) {
                const data = response.data.message;
                Alert.alert(
                    'Success',
                    `Compensatory leave request submitted successfully!\n\n` +
                    `Working Days: ${data.compensatory_days || 'N/A'}\n` +
                    `Status: ${data.docstatus === 1 ? 'Approved' : 'Pending Approval'}`,
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                // Reset form
                                setReason('');
                                setHalfDay(false);
                                setWorkFromDate(new Date());
                                setWorkEndDate(new Date());
                                // Switch to history tab
                                setActiveTab('history');
                            }
                        }
                    ]
                );
            } else {
                Alert.alert('Error', response.data?.message || 'Failed to submit request');
            }
        } catch (error) {
            console.error('Submit error:', error);
            Alert.alert('Error', error.message || 'Failed to submit compensatory leave request');
        } finally {
            setLoading(false);
        }
    };

    const handleCancelRequest = (requestId, requestName) => {
        Alert.alert(
            'Cancel Request',
            `Are you sure you want to cancel request ${requestName}?`,
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            const response = await apiService.cancelCompLeave(requestId, 'Cancelled by employee');
                            
                            if (response.success) {
                                Alert.alert('Success', 'Request cancelled successfully');
                                loadMyRequests();
                            } else {
                                Alert.alert('Error', response.data?.message || 'Failed to cancel request');
                            }
                        } catch (error) {
                            Alert.alert('Error', error.message || 'Failed to cancel request');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const getStatusBadge = (docstatus) => {
        if (docstatus === 0) return { text: 'Pending', color: colors.warning || '#FFA500' };
        if (docstatus === 1) return { text: 'Approved', color: colors.success || '#4CAF50' };
        if (docstatus === 2) return { text: 'Cancelled', color: colors.error || '#F44336' };
        return { text: 'Unknown', color: '#999' };
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    // Render Apply Tab
    const renderApplyTab = () => (
        <ScrollView style={styles.tabContent}>
            <View style={styles.formSection}>
                <Text style={styles.sectionTitle}>Apply for Compensatory Leave</Text>
                <Text style={styles.helpText}>
                    Request comp off for working on holidays. Your work dates must be actual holidays with attendance marked.
                </Text>

                {/* Work From Date */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Work From Date *</Text>
                    <TouchableOpacity 
                        style={styles.dateButton}
                        onPress={() => setShowWorkFromPicker(true)}
                    >
                        <Text style={styles.dateButtonText}>{formatDate(workFromDate)}</Text>
                    </TouchableOpacity>
                    {showWorkFromPicker && (
                        <DateTimePicker
                            value={workFromDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                                setShowWorkFromPicker(Platform.OS === 'ios');
                                if (date) setWorkFromDate(date);
                            }}
                        />
                    )}
                </View>

                {/* Work End Date */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Work End Date *</Text>
                    <TouchableOpacity 
                        style={styles.dateButton}
                        onPress={() => setShowWorkEndPicker(true)}
                    >
                        <Text style={styles.dateButtonText}>{formatDate(workEndDate)}</Text>
                    </TouchableOpacity>
                    {showWorkEndPicker && (
                        <DateTimePicker
                            value={workEndDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                                setShowWorkEndPicker(Platform.OS === 'ios');
                                if (date) setWorkEndDate(date);
                            }}
                        />
                    )}
                </View>

                {/* Half Day Toggle */}
                <View style={styles.formGroup}>
                    <View style={styles.checkboxRow}>
                        <TouchableOpacity 
                            style={styles.checkbox}
                            onPress={() => setHalfDay(!halfDay)}
                        >
                            <View style={[styles.checkboxInner, halfDay && styles.checkboxChecked]}>
                                {halfDay && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                        </TouchableOpacity>
                        <Text style={styles.checkboxLabel}>Half Day</Text>
                    </View>
                </View>

                {/* Half Day Date (conditional) */}
                {halfDay && (
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Half Day Date *</Text>
                        <TouchableOpacity 
                            style={styles.dateButton}
                            onPress={() => setShowHalfDayPicker(true)}
                        >
                            <Text style={styles.dateButtonText}>{formatDate(halfDayDate)}</Text>
                        </TouchableOpacity>
                        {showHalfDayPicker && (
                            <DateTimePicker
                                value={halfDayDate}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={(event, date) => {
                                    setShowHalfDayPicker(Platform.OS === 'ios');
                                    if (date) setHalfDayDate(date);
                                }}
                            />
                        )}
                    </View>
                )}

                {/* Reason */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Reason for Working on Holiday *</Text>
                    <Input
                        value={reason}
                        onChangeText={setReason}
                        placeholder="e.g., Worked on Christmas for urgent project delivery"
                        multiline
                        numberOfLines={4}
                        style={styles.textArea}
                    />
                </View>

                {/* Submit Button */}
                <View style={styles.submitButtonContainer}>
                    <Button
                        title={loading ? 'Submitting...' : 'Submit Request'}
                        onPress={handleSubmit}
                        disabled={loading}
                        mode="contained"
                    />
                </View>

                {/* Info Box */}
                <View style={styles.infoBox}>
                    <Text style={styles.infoTitle}>ℹ️ Important Notes:</Text>
                    <Text style={styles.infoText}>• Work dates must be marked as holidays</Text>
                    <Text style={styles.infoText}>• Attendance must be marked on those dates</Text>
                    <Text style={styles.infoText}>• Compensatory days will be allocated upon approval</Text>
                    <Text style={styles.infoText}>• You can use allocated days for future leave applications</Text>
                </View>
            </View>
        </ScrollView>
    );

    // Render History Tab
    const renderHistoryTab = () => (
        <View style={styles.tabContent}>
            {/* Filter Pills */}
            <View style={styles.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <TouchableOpacity
                        style={[styles.filterPill, filterStatus === null && styles.filterPillActive]}
                        onPress={() => setFilterStatus(null)}
                    >
                        <Text style={[styles.filterPillText, filterStatus === null && styles.filterPillTextActive]}>
                            All ({statusSummary.pending + statusSummary.approved + statusSummary.cancelled})
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterPill, filterStatus === 0 && styles.filterPillActive]}
                        onPress={() => setFilterStatus(0)}
                    >
                        <Text style={[styles.filterPillText, filterStatus === 0 && styles.filterPillTextActive]}>
                            Pending ({statusSummary.pending})
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterPill, filterStatus === 1 && styles.filterPillActive]}
                        onPress={() => setFilterStatus(1)}
                    >
                        <Text style={[styles.filterPillText, filterStatus === 1 && styles.filterPillTextActive]}>
                            Approved ({statusSummary.approved})
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterPill, filterStatus === 2 && styles.filterPillActive]}
                        onPress={() => setFilterStatus(2)}
                    >
                        <Text style={[styles.filterPillText, filterStatus === 2 && styles.filterPillTextActive]}>
                            Cancelled ({statusSummary.cancelled})
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* Summary Card */}
            <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Total Compensatory Days Earned</Text>
                <Text style={styles.summaryValue}>{totalDays.toFixed(1)} days</Text>
            </View>

            {/* Requests List */}
            <ScrollView 
                style={styles.requestsList}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {loading && !refreshing ? (
                    <Loading />
                ) : myRequests.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>No compensatory leave requests found</Text>
                    </View>
                ) : (
                    myRequests.map((request) => {
                        const status = getStatusBadge(request.docstatus);
                        return (
                            <View key={request.name} style={styles.requestCard}>
                                <View style={styles.requestHeader}>
                                    <Text style={styles.requestId}>{request.name}</Text>
                                    <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
                                        <Text style={styles.statusBadgeText}>{status.text}</Text>
                                    </View>
                                </View>
                                
                                <View style={styles.requestDetails}>
                                    <Text style={styles.detailLabel}>Work Period:</Text>
                                    <Text style={styles.detailValue}>
                                        {formatDate(request.work_from_date)} to {formatDate(request.work_end_date)}
                                    </Text>
                                </View>

                                <View style={styles.requestDetails}>
                                    <Text style={styles.detailLabel}>Compensatory Days:</Text>
                                    <Text style={styles.detailValue}>{request.compensatory_days || 'N/A'}</Text>
                                </View>

                                {request.half_day === 1 && (
                                    <View style={styles.requestDetails}>
                                        <Text style={styles.detailLabel}>Half Day Date:</Text>
                                        <Text style={styles.detailValue}>{formatDate(request.half_day_date)}</Text>
                                    </View>
                                )}

                                <View style={styles.requestDetails}>
                                    <Text style={styles.detailLabel}>Reason:</Text>
                                    <Text style={styles.detailValue}>{request.reason}</Text>
                                </View>

                                {request.leave_type && (
                                    <View style={styles.requestDetails}>
                                        <Text style={styles.detailLabel}>Leave Type:</Text>
                                        <Text style={styles.detailValue}>{request.leave_type}</Text>
                                    </View>
                                )}

                                {request.leave_allocation && (
                                    <View style={[styles.requestDetails, styles.allocationBox]}>
                                        <Text style={styles.allocationText}>
                                            ✓ Allocated: {request.leave_allocation}
                                        </Text>
                                    </View>
                                )}

                                {/* Cancel Button for Pending Requests */}
                                {request.docstatus === 0 && (
                                    <TouchableOpacity
                                        style={styles.cancelButton}
                                        onPress={() => handleCancelRequest(request.name, request.name)}
                                    >
                                        <Text style={styles.cancelButtonText}>Cancel Request</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Header Tabs */}
            <View style={styles.tabBar}>
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
                        My Requests
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Tab Content */}
            {activeTab === 'apply' ? renderApplyTab() : renderHistoryTab()}

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
        paddingVertical: 16,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: colors.primary || '#007AFF',
    },
    tabText: {
        fontSize: 16,
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
    formSection: {
        padding: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.textPrimary || '#333',
        marginBottom: 8,
    },
    helpText: {
        fontSize: 14,
        color: colors.textSecondary || '#666',
        marginBottom: 20,
        lineHeight: 20,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
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
    filterContainer: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    filterPill: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F5F5F5',
        marginRight: 8,
    },
    filterPillActive: {
        backgroundColor: colors.primary || '#007AFF',
    },
    filterPillText: {
        fontSize: 14,
        color: '#666',
        fontWeight: '500',
    },
    filterPillTextActive: {
        color: '#FFFFFF',
        fontWeight: '600',
    },
    summaryCard: {
        backgroundColor: colors.primary || '#007AFF',
        margin: 16,
        padding: 20,
        borderRadius: 12,
        alignItems: 'center',
    },
    summaryTitle: {
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 8,
        opacity: 0.9,
    },
    summaryValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    requestsList: {
        flex: 1,
        paddingHorizontal: 16,
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
    requestId: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary || '#333',
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
    requestDetails: {
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
    allocationBox: {
        backgroundColor: '#E8F5E9',
        padding: 8,
        borderRadius: 6,
        marginTop: 8,
    },
    allocationText: {
        fontSize: 13,
        color: '#2E7D32',
        fontWeight: '600',
    },
    cancelButton: {
        backgroundColor: '#FFEBEE',
        borderRadius: 8,
        padding: 12,
        marginTop: 12,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#C62828',
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
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default CompensatoryLeaveScreen;