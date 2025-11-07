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
    console.warn('NotificationService not available in WFHRequestScreen');
}

function WFHRequestScreen({ navigation }) {
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [requests, setRequests] = useState([]);
    const [eligible, setEligible] = useState(false);
    const [info, setInfo] = useState(null);
    
    // Form states
    const [requestType, setRequestType] = useState('single_day');
    const [fromDate, setFromDate] = useState(new Date());
    const [toDate, setToDate] = useState(new Date());
    const [reason, setReason] = useState('');
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);

    useEffect(() => {
        loadWFHInfo();
        loadWFHRequests();
    }, []);

    const loadWFHInfo = async () => {
        try {
            const res = await ApiService.getUserWfhInfo();
            if (res.success && res.data?.message) {
                setEligible(!!res.data.message.wfh_eligible);
                setInfo(res.data.message);
            }
        } catch (error) {
            console.error('Error loading WFH info:', error);
        }
    };

    const loadWFHRequests = async () => {
        setLoading(true);
        try {
            const response = await ApiService.getWFHRequests();
            if (response.success && response.data?.message) {
                setRequests(response.data.message);
            }
        } catch (error) {
            console.error('Error loading WFH requests:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to load WFH requests',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitRequest = async () => {
        if (!reason.trim()) {
            showToast({
                type: 'warning',
                text1: 'Missing Information',
                text2: 'Please provide a reason for WFH request',
            });
            return;
        }

        if (requestType === 'date_range' && toDate < fromDate) {
            showToast({
                type: 'warning',
                text1: 'Invalid Date Range',
                text2: 'End date cannot be before start date',
            });
            return;
        }

        setSubmitting(true);
        try {
            const requestData = {
                request_type: requestType,
                from_date: fromDate.toISOString().split('T')[0],
                to_date: requestType === 'single_day' ? fromDate.toISOString().split('T')[0] : toDate.toISOString().split('T')[0],
                reason: reason.trim(),
            };

            const response = await ApiService.submitWFHRequest(requestData);
            
            if (response.success) {
                // Send notification to admin (if service available)
                if (NotificationService) {
                    try {
                        await NotificationService.sendWFHNotification({
                            ...requestData,
                            request_id: response.data?.message?.name,
                        });
                    } catch (error) {
                        console.warn('Failed to send WFH notification:', error);
                    }
                }

                showToast({
                    type: 'success',
                    text1: 'Request Submitted',
                    text2: 'Your WFH request has been sent for approval',
                });

                // Reset form
                setReason('');
                setFromDate(new Date());
                setToDate(new Date());
                setRequestType('single_day');

                // Reload requests
                loadWFHRequests();
            }
        } catch (error) {
            console.error('Error submitting WFH request:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to submit WFH request',
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

    const renderRequestItem = ({ item }) => {
        const statusColor = getStatusColor(item.status);
        const statusIcon = getStatusIcon(item.status);
        const isApproved = item.status === 'Approved';
        const isPending = item.status === 'Pending';
        const isRejected = item.status === 'Rejected';

        return (
            <View style={styles.requestCard}>
                <View style={styles.requestHeader}>
                    <View style={styles.requestDates}>
                        <Icon name="calendar" size={14} color="#6366F1" />
                        <Text style={styles.requestDateText}>
                            {formatDate(new Date(item.from_date))}
                            {item.from_date !== item.to_date && ` - ${formatDate(new Date(item.to_date))}`}
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
                
                {item.reason && (
                    <View style={styles.reasonSection}>
                        <Icon name="comment" size={12} color="#6B7280" />
                        <Text style={styles.reasonText}>{item.reason}</Text>
                    </View>
                )}
                
                <View style={styles.requestFooter}>
                    <View style={styles.requestMeta}>
                        <Icon name="clock" size={10} color="#9CA3AF" />
                        <Text style={styles.requestMetaText}>
                            Requested on {new Date(item.creation).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            })}
                        </Text>
                    </View>
                    
                    {(isApproved || isRejected) && item.approved_by && (
                        <View style={styles.requestMeta}>
                            <Icon 
                                name={isApproved ? 'user-check' : 'user-times'} 
                                size={10} 
                                color="#9CA3AF" 
                            />
                            <Text style={styles.requestMetaText}>
                                {isApproved ? 'Approved' : 'Rejected'} by {item.approved_by}
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
                            WFH has been enabled for your account
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
                        <Text style={styles.headerTitle}>Work From Home</Text>
                        <Text style={styles.headerSubtitle}>Request WFH approval</Text>
                    </View>
                </View>
            </View>

            {/* Eligibility Card */}
            <View style={styles.eligibilityCard}>
                <View style={styles.eligibilityHeader}>
                    <Icon 
                        name="briefcase" 
                        size={20} 
                        color="#6366F1" 
                    />
                    <Text style={styles.eligibilityTitle}>
                        Work From Home Requests
                    </Text>
                </View>
                
                {info && (
                    <View style={styles.infoContainer}>
                        <Text style={styles.infoText}>Employee: {info.employee_name}</Text>
                        {info.department && <Text style={styles.infoText}>Department: {info.department}</Text>}
                        {info.designation && <Text style={styles.infoText}>Designation: {info.designation}</Text>}
                        <Text style={styles.infoText}>
                            Current WFH Status: {eligible ? 'Enabled' : 'Pending Approval'}
                        </Text>
                    </View>
                )}

                <View style={styles.actionContainer}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => navigation.navigate('CheckInOut')}
                    >
                        <Icon name="clock" size={16} color="#6366F1" />
                        <Text style={styles.actionButtonText}>Go to Check In/Out</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Request Form */}
            <View style={styles.formCard}>
                <View style={styles.formHeader}>
                    <Text style={styles.sectionTitle}>New WFH Request</Text>
                    <Text style={styles.formDescription}>
                        Submit a request to work from home. Admin will review and approve/reject your request.
                    </Text>
                </View>
                
                {/* Request Type */}
                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Request Type</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={requestType}
                            onValueChange={setRequestType}
                            style={styles.picker}
                        >
                            <Picker.Item label="Single Day" value="single_day" />
                            <Picker.Item label="Date Range" value="date_range" />
                        </Picker>
                    </View>
                </View>

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

                {/* To Date (only for date range) */}
                {requestType === 'date_range' && (
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
                )}

                {/* Reason */}
                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Reason</Text>
                    <TextInput
                        style={styles.reasonInput}
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Enter reason for WFH request..."
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                    style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                    onPress={handleSubmitRequest}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator size="small" color="white" />
                    ) : (
                        <>
                            <Icon name="paper-plane" size={16} color="white" />
                            <Text style={styles.submitButtonText}>Submit Request</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            {/* Requests Header */}
            <View style={styles.requestsHeader}>
                <Text style={styles.sectionTitle}>My Requests</Text>
                <TouchableOpacity onPress={loadWFHRequests}>
                    <Icon name="sync-alt" size={16} color="#6366F1" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            
            <FlatList
                data={requests}
                renderItem={renderRequestItem}
                keyExtractor={(item) => item.name}
                ListHeaderComponent={renderHeader}
                contentContainerStyle={styles.scrollContainer}
                showsVerticalScrollIndicator={false}
                refreshing={loading}
                onRefresh={loadWFHRequests}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Icon name="calendar-times" size={48} color="#9CA3AF" />
                        <Text style={styles.emptyStateTitle}>No Requests Yet</Text>
                        <Text style={styles.emptyStateText}>
                            Your WFH requests will appear here
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
                            if (requestType === 'single_day') {
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
    eligibilityCard: {
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
    eligibilityHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    eligibilityTitle: {
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
    requestsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    requestCard: {
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
    requestHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    requestDates: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    requestDateText: {
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
    requestFooter: {
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        gap: 6,
    },
    requestMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    requestMetaText: {
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

export default WFHRequestScreen;
