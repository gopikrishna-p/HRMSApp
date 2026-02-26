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

const OnSiteRequestScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [deleting, setDeleting] = useState(null);
    
    // Form state
    const [fromDate, setFromDate] = useState(new Date());
    const [toDate, setToDate] = useState(new Date());
    const [clientLocation, setClientLocation] = useState('');
    const [reason, setReason] = useState('');
    const [showFromDatePicker, setShowFromDatePicker] = useState(false);
    const [showToDatePicker, setShowToDatePicker] = useState(false);
    
    // Request history
    const [myRequests, setMyRequests] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [historyFilter, setHistoryFilter] = useState('today');

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
            
            console.log('📥 Loading On Site requests...');
            const response = await ApiService.getOnSiteRequests();
            console.log('📋 Requests response:', response);
            
            let requestsData = [];
            
            if (response.success) {
                if (response.data?.message && Array.isArray(response.data.message)) {
                    requestsData = response.data.message;
                } else if (Array.isArray(response.data)) {
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
            console.error('❌ Error loading On Site requests:', error);
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
            if (toDate < selectedDate) {
                setToDate(selectedDate);
            }
        }
    };

    const handleToDateChange = (event, selectedDate) => {
        setShowToDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
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

        if (!clientLocation.trim()) {
            showToast({
                type: 'error',
                text1: 'Validation Error',
                text2: 'Please provide a client/site location',
            });
            return false;
        }

        if (clientLocation.trim().length < 3) {
            showToast({
                type: 'error',
                text1: 'Validation Error',
                text2: 'Location should be at least 3 characters',
            });
            return false;
        }

        // Check for overlapping dates
        const fromDateStr = formatDateForAPI(fromDate);
        const toDateStr = formatDateForAPI(toDate);
        
        const hasOverlap = myRequests.some(request => {
            if (request.status?.toLowerCase() === 'rejected') {
                return false;
            }
            
            const requestFrom = request.from_date;
            const requestTo = request.to_date;
            
            const isOverlapping = 
                (fromDateStr <= requestTo && fromDateStr >= requestFrom) ||
                (toDateStr >= requestFrom && toDateStr <= requestTo) ||
                (fromDateStr <= requestFrom && toDateStr >= requestTo);
            
            return isOverlapping;
        });

        if (hasOverlap) {
            showToast({
                type: 'error',
                text1: 'Duplicate Request',
                text2: 'You already have an On Site request for these dates',
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
            'Submit On Site Request',
            `Request On Site from ${formatDate(fromDate)} to ${formatDate(toDate)}?\n\nLocation: ${clientLocation.trim()}\n\nThis will send a notification to your admin for approval.`,
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
                from_date: formatDateForAPI(fromDate),
                to_date: formatDateForAPI(toDate),
                location: clientLocation.trim(),
                reason: reason.trim() || null,
            };

            console.log('📤 Submitting On Site request:', requestData);
            const response = await ApiService.submitOnSiteRequest(requestData);
            console.log('📥 Submit response:', response);

            if (response.success) {
                const backendData = response.data?.message || response.data || {};
                
                if (backendData.success === true) {
                    showToast({
                        type: 'success',
                        text1: 'Request Submitted',
                        text2: backendData.message || 'Your On Site request has been sent to admin for approval',
                    });

                    // Reset form
                    setFromDate(new Date());
                    setToDate(new Date());
                    setClientLocation('');
                    setReason('');

                    // Reload requests
                    await loadMyRequests();

                    // Switch to history view
                    setShowHistory(true);
                } else {
                    showToast({
                        type: 'error',
                        text1: 'Submission Failed',
                        text2: backendData.message || 'Failed to submit On Site request',
                    });
                }
            } else {
                showToast({
                    type: 'error',
                    text1: 'Submission Failed',
                    text2: response.message || 'Failed to submit On Site request',
                });
            }
        } catch (error) {
            console.error('❌ Error submitting On Site request:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: error.message || 'Failed to submit On Site request. Please try again.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteRequest = (requestId, requestDates) => {
        Alert.alert(
            'Delete On Site Request',
            `Are you sure you want to delete this On Site request?\n\n${requestDates}\n\nThis action cannot be undone.`,
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

            console.log('🗑️ Deleting On Site request:', requestId);
            const response = await ApiService.deleteOnSiteRequest(requestId);
            console.log('📥 Delete response:', response);

            if (response.success) {
                const backendData = response.data?.message || response.data || {};
                
                if (backendData.success === true) {
                    showToast({
                        type: 'success',
                        text1: 'Request Deleted',
                        text2: backendData.message || 'Your On Site request has been deleted',
                    });

                    await loadMyRequests();
                } else {
                    showToast({
                        type: 'error',
                        text1: 'Deletion Failed',
                        text2: backendData.message || 'Failed to delete On Site request',
                    });
                }
            } else {
                showToast({
                    type: 'error',
                    text1: 'Deletion Failed',
                    text2: response.message || 'Failed to delete On Site request',
                });
            }
        } catch (error) {
            console.error('❌ Error deleting On Site request:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: error.message || 'Failed to delete On Site request. Please try again.',
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
        return diffDays + 1;
    };

    const getFilteredRequests = () => {
        if (historyFilter === 'today') {
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

                {item.client_location && (
                    <View style={styles.historyLocation}>
                        <Icon name="map-marker-alt" size={12} color="#2196F3" />
                        <Text style={styles.historyLocationText} numberOfLines={1}>
                            {item.client_location}
                        </Text>
                    </View>
                )}

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
                    <Icon name="map-marker-alt" size={20} color="#2196F3" />
                    <Text style={styles.cardTitle}>New On Site Request</Text>
                </View>

                {/* Duration Summary */}
                <View style={styles.durationSummary}>
                    <Icon name="clock" size={16} color="#2196F3" />
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

                {/* Client Location */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                        Client/Site Location <Text style={styles.required}>*</Text>
                    </Text>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Enter client or site location..."
                        placeholderTextColor={colors.textSecondary}
                        value={clientLocation}
                        onChangeText={setClientLocation}
                        maxLength={200}
                    />
                    <Text style={styles.charCount}>
                        {clientLocation.length}/200 characters
                    </Text>
                </View>

                {/* Reason (Optional) */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                        Additional Notes <Text style={styles.optional}>(optional)</Text>
                    </Text>
                    <TextInput
                        style={styles.textArea}
                        placeholder="Any additional information or notes..."
                        placeholderTextColor={colors.textSecondary}
                        value={reason}
                        onChangeText={setReason}
                        multiline
                        numberOfLines={3}
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
                <Icon name="info-circle" size={16} color="#2196F3" />
                <Text style={styles.infoText}>
                    Your On Site request will be sent to admin for approval. Once approved, you'll be able to mark attendance as On Site.
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
                        <Text style={[styles.filterTabText, historyFilter === 'today' && styles.filterTabTextActive]}>
                            Today
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterTab, historyFilter === 'all' && styles.filterTabActive]}
                        onPress={() => setHistoryFilter('all')}
                    >
                        <Text style={[styles.filterTabText, historyFilter === 'all' && styles.filterTabTextActive]}>
                            All Requests
                        </Text>
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#2196F3" />
                        <Text style={styles.loadingText}>Loading requests...</Text>
                    </View>
                ) : filteredRequests.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Icon name="map-marker-alt" size={48} color={colors.textSecondary} />
                        <Text style={styles.emptyTitle}>
                            {historyFilter === 'today' ? 'No requests today' : 'No On Site requests yet'}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                            {historyFilter === 'today' 
                                ? 'Submit a new request or check all requests'
                                : 'Submit a new On Site request to get started'
                            }
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={filteredRequests}
                        renderItem={renderRequestHistoryItem}
                        keyExtractor={(item) => item.name}
                        contentContainerStyle={styles.historyList}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => loadMyRequests(true)}
                                colors={['#2196F3']}
                            />
                        }
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        );
    };

    if (loading && myRequests.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

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
                        color={!showHistory ? '#2196F3' : colors.textSecondary} 
                    />
                    <Text style={[styles.tabText, !showHistory && styles.tabTextActive]}>
                        New Request
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, showHistory && styles.tabActive]}
                    onPress={() => setShowHistory(true)}
                >
                    <Icon 
                        name="history" 
                        size={16} 
                        color={showHistory ? '#2196F3' : colors.textSecondary} 
                    />
                    <Text style={[styles.tabText, showHistory && styles.tabTextActive]}>
                        My Requests
                    </Text>
                    {myRequests.filter(r => r.status?.toLowerCase() === 'pending').length > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>
                                {myRequests.filter(r => r.status?.toLowerCase() === 'pending').length}
                            </Text>
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: colors.textSecondary,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
        gap: 8,
    },
    tabActive: {
        borderBottomColor: '#2196F3',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: '#2196F3',
        fontWeight: '600',
    },
    badge: {
        backgroundColor: '#F59E0B',
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        minWidth: 18,
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
        textAlign: 'center',
    },
    formContainer: {
        flex: 1,
        padding: 16,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
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
        backgroundColor: '#2196F3' + '15',
        padding: 10,
        borderRadius: 8,
        marginBottom: 16,
        gap: 8,
    },
    durationText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2196F3',
    },
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    required: {
        color: '#EF4444',
    },
    optional: {
        color: colors.textSecondary,
        fontWeight: '400',
        fontSize: 12,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
        padding: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 10,
    },
    dateButtonText: {
        flex: 1,
        fontSize: 14,
        color: colors.textPrimary,
    },
    textInput: {
        backgroundColor: colors.background,
        padding: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        fontSize: 14,
        color: colors.textPrimary,
    },
    textArea: {
        backgroundColor: colors.background,
        padding: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        fontSize: 14,
        color: colors.textPrimary,
        minHeight: 80,
    },
    charCount: {
        fontSize: 11,
        color: colors.textSecondary,
        textAlign: 'right',
        marginTop: 4,
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2196F3',
        paddingVertical: 14,
        borderRadius: 8,
        marginTop: 8,
        gap: 8,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#2196F3' + '10',
        padding: 14,
        borderRadius: 8,
        marginTop: 16,
        gap: 10,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: '#2196F3',
        lineHeight: 18,
    },
    historyContainer: {
        flex: 1,
    },
    filterTabContainer: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    filterTab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        backgroundColor: colors.background,
    },
    filterTabActive: {
        backgroundColor: '#2196F3',
    },
    filterTabText: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    filterTabTextActive: {
        color: 'white',
    },
    historyList: {
        padding: 16,
    },
    historyCard: {
        backgroundColor: colors.surface,
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
        borderLeftWidth: 3,
        borderLeftColor: '#2196F3',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    historyDates: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1,
    },
    historyDateText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
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
        fontSize: 11,
        fontWeight: '600',
        color: 'white',
        textTransform: 'capitalize',
    },
    deleteButton: {
        padding: 6,
        borderRadius: 6,
        backgroundColor: '#FEE2E2',
    },
    deleteButtonDisabled: {
        opacity: 0.5,
    },
    historyLocation: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    historyLocationText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '500',
        color: '#2196F3',
    },
    historyReason: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginBottom: 8,
    },
    historyReasonText: {
        flex: 1,
        fontSize: 12,
        color: colors.textSecondary,
        lineHeight: 16,
    },
    historyFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    historyTimestamp: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    historyApprover: {
        fontSize: 11,
        color: colors.textSecondary,
        fontStyle: 'italic',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 13,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 18,
    },
});

export default OnSiteRequestScreen;
