import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    Platform,
    FlatList,
    RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../../theme/colors';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

const WFHRequestScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [deleting, setDeleting] = useState(null); // Track which request is being deleted
    
    // Form state
    const [fromDate, setFromDate] = useState(new Date());
    const [toDate, setToDate] = useState(new Date());
    const [reason, setReason] = useState('');
    const [showFromDatePicker, setShowFromDatePicker] = useState(false);
    const [showToDatePicker, setShowToDatePicker] = useState(false);
    
    // Request history
    const [myRequests, setMyRequests] = useState([]);
    const [showHistory, setShowHistory] = useState(false); // Default to New Request form
    const [historyFilter, setHistoryFilter] = useState('today'); // Default to Present Day

    useEffect(() => {
        loadMyRequests();
    }, []);

    const loadMyRequests = async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            
            console.log('📥 Loading WFH requests...');
            const response = await ApiService.getWFHRequests();
            console.log('📋 Requests response:', response);
            
            // Handle different response formats:
            // 1. Frappe wraps arrays: { success: true, data: { message: [...] } }
            // 2. Direct array: { success: true, data: [...] }
            // 3. Error: { success: false, message: '...' }
            let requestsData = [];
            
            if (response.success) {
                if (response.data?.message && Array.isArray(response.data.message)) {
                    // Frappe wrapped: { data: { message: [...] } }
                    requestsData = response.data.message;
                } else if (Array.isArray(response.data)) {
                    // Direct array: { data: [...] }
                    requestsData = response.data;
                } else {
                    console.warn('⚠️ Unexpected response format:', response);
                }
            } else {
                console.error('❌ Failed to load requests:', response.message);
            }
            
            console.log('✅ Loaded requests:', requestsData.length);
            setMyRequests(requestsData);
        } catch (error) {
            console.error('❌ Error loading WFH requests:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to load your requests',
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleFromDateChange = (event, selectedDate) => {
        setShowFromDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            setFromDate(selectedDate);
            // Auto-adjust to_date if it's before from_date
            if (toDate < selectedDate) {
                setToDate(selectedDate);
            }
        }
    };

    const handleToDateChange = (event, selectedDate) => {
        setShowToDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            // Ensure to_date is not before from_date
            if (selectedDate >= fromDate) {
                setToDate(selectedDate);
            } else {
                showToast({
                    type: 'error',
                    text1: 'Invalid Date',
                    text2: 'End date cannot be before start date',
                });
            }
        }
    };

    const validateForm = () => {
        if (!fromDate) {
            showToast({
                type: 'error',
                text1: 'Validation Error',
                text2: 'Please select a start date',
            });
            return false;
        }

        if (!toDate) {
            showToast({
                type: 'error',
                text1: 'Validation Error',
                text2: 'Please select an end date',
            });
            return false;
        }

        if (toDate < fromDate) {
            showToast({
                type: 'error',
                text1: 'Validation Error',
                text2: 'End date cannot be before start date',
            });
            return false;
        }

        if (!reason.trim()) {
            showToast({
                type: 'error',
                text1: 'Validation Error',
                text2: 'Please provide a reason for your WFH request',
            });
            return false;
        }

        if (reason.trim().length < 10) {
            showToast({
                type: 'error',
                text1: 'Validation Error',
                text2: 'Reason should be at least 10 characters',
            });
            return false;
        }

        // Check for overlapping dates with existing requests
        const fromDateStr = formatDateForAPI(fromDate);
        const toDateStr = formatDateForAPI(toDate);
        
        const hasOverlap = myRequests.some(request => {
            // Skip rejected requests
            if (request.status?.toLowerCase() === 'rejected') {
                return false;
            }
            
            const requestFrom = request.from_date;
            const requestTo = request.to_date;
            
            // Check if dates overlap
            const isOverlapping = 
                (fromDateStr <= requestTo && fromDateStr >= requestFrom) || // New start is within existing range
                (toDateStr >= requestFrom && toDateStr <= requestTo) ||     // New end is within existing range
                (fromDateStr <= requestFrom && toDateStr >= requestTo);     // New range encompasses existing range
            
            return isOverlapping;
        });

        if (hasOverlap) {
            showToast({
                type: 'error',
                text1: 'Duplicate Request',
                text2: 'You already have a WFH request for these dates',
            });
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }

        Alert.alert(
            'Submit WFH Request',
            `Request WFH from ${formatDate(fromDate)} to ${formatDate(toDate)}?\n\nThis will send a notification to your admin for approval.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Submit',
                    style: 'default',
                    onPress: submitRequest,
                },
            ]
        );
    };

    const submitRequest = async () => {
        try {
            setSubmitting(true);

            const requestData = {
                request_type: 'Work From Home', // Required by backend
                from_date: formatDateForAPI(fromDate),
                to_date: formatDateForAPI(toDate),
                reason: reason.trim(),
            };

            console.log('📤 Submitting WFH request:', requestData);
            const response = await ApiService.submitWFHRequest(requestData);
            console.log('📥 Submit response:', response);

            // Backend returns: { status: "success", message: "...", name: "..." }
            // Frappe wraps it: { success: true, data: { message: {...} } }
            if (response.success) {
                const backendData = response.data?.message || response.data || {};
                
                if (backendData.status === 'success') {
                    showToast({
                        type: 'success',
                        text1: 'Request Submitted',
                        text2: backendData.message || 'Your WFH request has been sent to admin for approval',
                    });

                    // Reset form
                    setFromDate(new Date());
                    setToDate(new Date());
                    setReason('');

                    // Reload requests
                    await loadMyRequests();

                    // Switch to history view
                    setShowHistory(true);
                } else {
                    showToast({
                        type: 'error',
                        text1: 'Submission Failed',
                        text2: backendData.message || 'Failed to submit WFH request',
                    });
                }
            } else {
                showToast({
                    type: 'error',
                    text1: 'Submission Failed',
                    text2: response.message || 'Failed to submit WFH request',
                });
            }
        } catch (error) {
            console.error('❌ Error submitting WFH request:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: error.message || 'Failed to submit WFH request. Please try again.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteRequest = (requestId, requestDates) => {
        Alert.alert(
            'Delete WFH Request',
            `Are you sure you want to delete this WFH request?\n\n${requestDates}\n\nThis action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteRequest(requestId),
                },
            ]
        );
    };

    const deleteRequest = async (requestId) => {
        try {
            setDeleting(requestId);

            console.log('🗑️ Deleting WFH request:', requestId);
            const response = await ApiService.deleteWFHRequest(requestId);
            console.log('📥 Delete response:', response);

            if (response.success) {
                const backendData = response.data?.message || response.data || {};
                
                if (backendData.status === 'success') {
                    showToast({
                        type: 'success',
                        text1: 'Request Deleted',
                        text2: backendData.message || 'Your WFH request has been deleted',
                    });

                    // Reload requests
                    await loadMyRequests();
                } else {
                    showToast({
                        type: 'error',
                        text1: 'Deletion Failed',
                        text2: backendData.message || 'Failed to delete WFH request',
                    });
                }
            } else {
                showToast({
                    type: 'error',
                    text1: 'Deletion Failed',
                    text2: response.message || 'Failed to delete WFH request',
                });
            }
        } catch (error) {
            console.error('❌ Error deleting WFH request:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: error.message || 'Failed to delete WFH request. Please try again.',
            });
        } finally {
            setDeleting(null);
        }
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const formatDateForAPI = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'approved':
                return '#10B981';
            case 'rejected':
                return '#EF4444';
            case 'pending':
            default:
                return '#F59E0B';
        }
    };

    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'approved':
                return 'check-circle';
            case 'rejected':
                return 'times-circle';
            case 'pending':
            default:
                return 'clock';
        }
    };

    const calculateDuration = () => {
        const diffTime = Math.abs(toDate - fromDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays + 1; // Include both start and end date
    };

    const getFilteredRequests = () => {
        if (historyFilter === 'today') {
            // Filter by requests created today (requested on today's date)
            const today = formatDateForAPI(new Date());
            return myRequests.filter(request => {
                const creationDate = request.creation ? request.creation.split(' ')[0] : '';
                return creationDate === today;
            });
        }
        return myRequests;
    };

    const renderRequestHistoryItem = ({ item }) => {
        const statusColor = getStatusColor(item.status);
        const statusIcon = getStatusIcon(item.status);
        const isPending = item.status?.toLowerCase() === 'pending';
        const isDeleting = deleting === item.name;

        return (
            <View style={styles.historyCard}>
                <View style={styles.historyHeader}>
                    <View style={styles.historyDates}>
                        <Icon name="calendar" size={14} color={colors.textSecondary} />
                        <Text style={styles.historyDateText}>
                            {item.from_date === item.to_date
                                ? formatDate(new Date(item.from_date))
                                : `${formatDate(new Date(item.from_date))} - ${formatDate(new Date(item.to_date))}`
                            }
                        </Text>
                    </View>
                    <View style={styles.headerRight}>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                            <Icon name={statusIcon} size={12} color="white" />
                            <Text style={styles.statusText}>
                                {item.status || 'Pending'}
                            </Text>
                        </View>
                        {isPending && (
                            <TouchableOpacity
                                style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
                                onPress={() => handleDeleteRequest(
                                    item.name,
                                    item.from_date === item.to_date
                                        ? formatDate(new Date(item.from_date))
                                        : `${formatDate(new Date(item.from_date))} - ${formatDate(new Date(item.to_date))}`
                                )}
                                disabled={isDeleting}
                            >
                                {isDeleting ? (
                                    <ActivityIndicator size="small" color="#EF4444" />
                                ) : (
                                    <Icon name="trash" size={16} color="#EF4444" />
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {item.reason && (
                    <View style={styles.historyReason}>
                        <Icon name="comment" size={12} color={colors.textSecondary} />
                        <Text style={styles.historyReasonText} numberOfLines={2}>
                            {item.reason}
                        </Text>
                    </View>
                )}

                <View style={styles.historyFooter}>
                    <Text style={styles.historyTimestamp}>
                        Requested on {formatDate(new Date(item.creation))}
                    </Text>
                    {item.approved_by && (
                        <Text style={styles.historyApprover}>
                            by {item.approved_by}
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    const renderRequestForm = () => (
        <ScrollView 
            style={styles.formContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <Icon name="file-alt" size={20} color={colors.primary} />
                    <Text style={styles.cardTitle}>New WFH Request</Text>
                </View>

                {/* Duration Summary */}
                <View style={styles.durationSummary}>
                    <Icon name="clock" size={16} color={colors.primary} />
                    <Text style={styles.durationText}>
                        {calculateDuration()} day{calculateDuration() > 1 ? 's' : ''}
                    </Text>
                </View>

                {/* From Date */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                        From Date <Text style={styles.required}>*</Text>
                    </Text>
                    <TouchableOpacity
                        style={styles.dateButton}
                        onPress={() => setShowFromDatePicker(true)}
                    >
                        <Icon name="calendar-day" size={16} color={colors.textSecondary} />
                        <Text style={styles.dateButtonText}>
                            {formatDate(fromDate)}
                        </Text>
                        <Icon name="chevron-down" size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {showFromDatePicker && (
                    <DateTimePicker
                        value={fromDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleFromDateChange}
                        minimumDate={new Date()}
                    />
                )}

                {/* To Date */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                        To Date <Text style={styles.required}>*</Text>
                    </Text>
                    <TouchableOpacity
                        style={styles.dateButton}
                        onPress={() => setShowToDatePicker(true)}
                    >
                        <Icon name="calendar-day" size={16} color={colors.textSecondary} />
                        <Text style={styles.dateButtonText}>
                            {formatDate(toDate)}
                        </Text>
                        <Icon name="chevron-down" size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {showToDatePicker && (
                    <DateTimePicker
                        value={toDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleToDateChange}
                        minimumDate={fromDate}
                    />
                )}

                {/* Reason */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                        Reason <Text style={styles.required}>*</Text>
                    </Text>
                    <TextInput
                        style={styles.textArea}
                        placeholder="Please provide a reason for your WFH request..."
                        placeholderTextColor={colors.textSecondary}
                        value={reason}
                        onChangeText={setReason}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                        maxLength={500}
                    />
                    <Text style={styles.charCount}>
                        {reason.length}/500 characters
                    </Text>
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                    style={[
                        styles.submitButton,
                        submitting && styles.submitButtonDisabled,
                    ]}
                    onPress={handleSubmit}
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

            {/* Info Box */}
            <View style={styles.infoBox}>
                <Icon name="info-circle" size={16} color="#3B82F6" />
                <Text style={styles.infoText}>
                    Your request will be sent to admin for approval. You'll receive a notification once it's reviewed.
                </Text>
            </View>
        </ScrollView>
    );

    const renderRequestHistory = () => {
        const filteredRequests = getFilteredRequests();
        
        return (
            <View style={styles.historyContainer}>
                {/* Filter Tabs */}
                <View style={styles.filterTabContainer}>
                    <TouchableOpacity
                        style={[styles.filterTab, historyFilter === 'today' && styles.filterTabActive]}
                        onPress={() => setHistoryFilter('today')}
                    >
                        <Icon
                            name="calendar-day"
                            size={14}
                            color={historyFilter === 'today' ? colors.primary : colors.textSecondary}
                        />
                        <Text style={[styles.filterTabText, historyFilter === 'today' && styles.filterTabTextActive]}>
                            Requested Today
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterTab, historyFilter === 'all' && styles.filterTabActive]}
                        onPress={() => setHistoryFilter('all')}
                    >
                        <Icon
                            name="list"
                            size={14}
                            color={historyFilter === 'all' ? colors.primary : colors.textSecondary}
                        />
                        <Text style={[styles.filterTabText, historyFilter === 'all' && styles.filterTabTextActive]}>
                            All Requests
                        </Text>
                        {myRequests.length > 0 && (
                            <View style={styles.filterBadge}>
                                <Text style={styles.filterBadgeText}>{myRequests.length}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                <FlatList
                    data={filteredRequests}
                    renderItem={renderRequestHistoryItem}
                    keyExtractor={(item) => item.name}
                    contentContainerStyle={styles.historyList}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => loadMyRequests(true)}
                            colors={[colors.primary]}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Icon name="inbox" size={64} color={colors.textSecondary} />
                            <Text style={styles.emptyTitle}>
                                {historyFilter === 'today' ? 'No Requests Today' : 'No Requests Yet'}
                            </Text>
                            <Text style={styles.emptySubtitle}>
                                {historyFilter === 'today' 
                                    ? 'You haven\'t submitted any WFH requests today'
                                    : 'Your WFH requests will appear here'
                                }
                            </Text>
                        </View>
                    }
                    showsVerticalScrollIndicator={false}
                />
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Toggle Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, !showHistory && styles.tabActive]}
                    onPress={() => setShowHistory(false)}
                >
                    <Icon
                        name="plus-circle"
                        size={16}
                        color={!showHistory ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.tabText, !showHistory && styles.tabTextActive]}>
                        New Request
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.tab, showHistory && styles.tabActive]}
                    onPress={() => {
                        setShowHistory(true);
                        loadMyRequests();
                    }}
                >
                    <Icon
                        name="history"
                        size={16}
                        color={showHistory ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.tabText, showHistory && styles.tabTextActive]}>
                        My Requests
                    </Text>
                    {myRequests.length > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{myRequests.length}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {/* Content */}
            {showHistory ? renderRequestHistory() : renderRequestForm()}
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
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 12,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
        gap: 8,
    },
    tabActive: {
        borderBottomColor: colors.primary,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: colors.primary,
        fontWeight: '600',
    },
    badge: {
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeText: {
        color: 'white',
        fontSize: 11,
        fontWeight: '600',
    },
    formContainer: {
        flex: 1,
        padding: 16,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 12,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    durationSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primary + '15',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
        gap: 8,
    },
    durationText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    required: {
        color: '#EF4444',
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 14,
        gap: 12,
    },
    dateButtonText: {
        flex: 1,
        fontSize: 14,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    textArea: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        color: colors.textPrimary,
        minHeight: 100,
    },
    charCount: {
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: 'right',
        marginTop: 4,
    },
    submitButton: {
        backgroundColor: colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 8,
        marginTop: 8,
        gap: 10,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    infoBox: {
        flexDirection: 'row',
        backgroundColor: '#EFF6FF',
        padding: 16,
        borderRadius: 8,
        borderLeftWidth: 4,
        borderLeftColor: '#3B82F6',
        gap: 12,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: '#1E40AF',
        lineHeight: 18,
    },
    historyContainer: {
        flex: 1,
    },
    historyList: {
        padding: 16,
    },
    historyCard: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: colors.primary,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 3,
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    historyDates: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 8,
    },
    historyDateText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textPrimary,
        flex: 1,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 6,
    },
    statusText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    deleteButton: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 32,
        minHeight: 32,
    },
    deleteButtonDisabled: {
        opacity: 0.6,
    },
    filterTabContainer: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 4,
        margin: 12,
        gap: 4,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    filterTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        gap: 6,
    },
    filterTabActive: {
        backgroundColor: colors.primary + '15',
    },
    filterTabText: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    filterTabTextActive: {
        color: colors.primary,
        fontWeight: '600',
    },
    filterBadge: {
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        minWidth: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 4,
    },
    filterBadgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
    },
    historyReason: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
        gap: 8,
    },
    historyReasonText: {
        flex: 1,
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    historyFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    historyTimestamp: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    historyApprover: {
        fontSize: 12,
        color: colors.textSecondary,
        fontStyle: 'italic',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.textPrimary,
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
    },
});

export default WFHRequestScreen;