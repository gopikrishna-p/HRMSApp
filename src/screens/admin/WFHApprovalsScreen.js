import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Alert,
    ActivityIndicator,
    Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { colors } from '../../theme/colors';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

// Safely import notification service
let NotificationService = null;
try {
    NotificationService = require('../../services/notification.service').default || require('../../services/notification.service');
} catch (e) {
    console.warn('NotificationService not available in WFHApprovalsScreen');
}

const WFHApprovalsScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [historyRequests, setHistoryRequests] = useState([]);
    const [allHistoryRequests, setAllHistoryRequests] = useState([]); // Unfiltered history
    const [processingRequest, setProcessingRequest] = useState(null);
    const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'history'
    const [selectedDateFilter, setSelectedDateFilter] = useState('all'); // 'all', 'today', 'week', 'month'
    const [showDateFilterModal, setShowDateFilterModal] = useState(false);

    useEffect(() => {
        loadRequests();
    }, []);

    const loadRequests = async (isRefresh = false) => {
        try {
            isRefresh ? setRefreshing(true) : setLoading(true);
            
            console.log('📥 Loading WFH requests...');
            
            // Load pending requests
            const pendingResponse = await ApiService.getPendingWFHRequests();
            console.log('📋 Pending requests response:', pendingResponse);
            
            let pendingData = [];
            if (pendingResponse.success) {
                if (pendingResponse.data?.message && Array.isArray(pendingResponse.data.message)) {
                    pendingData = pendingResponse.data.message;
                } else if (Array.isArray(pendingResponse.data)) {
                    pendingData = pendingResponse.data;
                }
            }
            
            console.log('✅ Loaded pending requests:', pendingData.length);
            setPendingRequests(pendingData);
            
            // Load all requests for history (approved/rejected)
            const allResponse = await ApiService.getAllWFHRequestsForAdmin();
            console.log('📋 All requests response:', allResponse);
            
            let historyData = [];
            if (allResponse.success) {
                let allData = [];
                if (allResponse.data?.message && Array.isArray(allResponse.data.message)) {
                    allData = allResponse.data.message;
                } else if (Array.isArray(allResponse.data)) {
                    allData = allResponse.data;
                }
                
                // Filter to only approved and rejected
                historyData = allData.filter(req => 
                    req.status?.toLowerCase() === 'approved' || 
                    req.status?.toLowerCase() === 'rejected'
                );
            }
            
            console.log('✅ Loaded history requests:', historyData.length);
            setAllHistoryRequests(historyData); // Store all history
            applyDateFilter(historyData, selectedDateFilter); // Apply current filter
            
        } catch (error) {
            console.error('❌ Error loading WFH requests:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to load WFH requests',
            });
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
    };

    const applyDateFilter = (data, filter) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        let filtered = data;
        
        if (filter === 'today') {
            filtered = data.filter(req => {
                const modifiedDate = new Date(req.modified);
                const reqDate = new Date(modifiedDate.getFullYear(), modifiedDate.getMonth(), modifiedDate.getDate());
                return reqDate.getTime() === today.getTime();
            });
        } else if (filter === 'week') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            filtered = data.filter(req => {
                const modifiedDate = new Date(req.modified);
                return modifiedDate >= weekAgo;
            });
        } else if (filter === 'month') {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            filtered = data.filter(req => {
                const modifiedDate = new Date(req.modified);
                return modifiedDate >= monthAgo;
            });
        }
        
        setHistoryRequests(filtered);
    };

    const handleDateFilterChange = (filter) => {
        setSelectedDateFilter(filter);
        applyDateFilter(allHistoryRequests, filter);
        setShowDateFilterModal(false);
    };

    const getDateFilterLabel = () => {
        switch (selectedDateFilter) {
            case 'today':
                return 'Today';
            case 'week':
                return 'Last 7 Days';
            case 'month':
                return 'Last Month';
            default:
                return 'All Time';
        }
    };

    const getFilteredRequests = () => {
        if (activeTab === 'pending') {
            return pendingRequests;
        } else {
            return historyRequests;
        }
    };

    const getTabCounts = () => {
        return {
            pending: pendingRequests.length,
            history: historyRequests.length,
        };
    };

    const handleApproveRequest = async (request) => {
        Alert.alert(
            'Approve WFH Request',
            `Approve WFH request for ${request.employee_name} from ${formatDate(request.from_date)} to ${formatDate(request.to_date)}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Approve',
                    style: 'default',
                    onPress: () => processRequest(request.name, 'approve', request)
                }
            ]
        );
    };

    const handleRejectRequest = async (request) => {
        Alert.alert(
            'Reject WFH Request',
            `Reject WFH request for ${request.employee_name}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reject',
                    style: 'destructive',
                    onPress: () => processRequest(request.name, 'reject', request)
                }
            ]
        );
    };

    const processRequest = async (requestId, action, requestData) => {
        try {
            setProcessingRequest(requestId);
            
            console.log(`📤 Processing ${action} for request:`, requestId);
            let response;
            if (action === 'approve') {
                response = await ApiService.approveWFHRequest(requestId);
            } else {
                response = await ApiService.rejectWFHRequest(requestId);
            }
            console.log(`📥 ${action} response:`, response);

            // Handle nested response format:
            // { success: true, data: { message: { success: true, message: '...' } } }
            const backendData = response.data?.message || response.data || {};
            const isSuccess = response.success && (backendData.success === true || backendData.status === 'success');
            
            if (isSuccess) {
                // Send notification to employee
                if (NotificationService) {
                    try {
                        await NotificationService.sendWFHApprovalNotification(
                            action === 'approve',
                            requestData.from_date,
                            action === 'approve' ? 'Your WFH request has been approved' : 'Your WFH request has been rejected'
                        );
                    } catch (error) {
                        console.warn('⚠️ Failed to send notification:', error);
                    }
                }

                // Remove from list and reload to get updated data
                await loadRequests(true);
                
                showToast({
                    type: 'success',
                    text1: action === 'approve' ? 'Approved' : 'Rejected',
                    text2: backendData.message || `WFH request has been ${action === 'approve' ? 'approved' : 'rejected'}`,
                });

                // If approved, automatically enable WFH for employee
                if (action === 'approve') {
                    try {
                        console.log('🔧 Auto-enabling WFH for employee:', requestData.employee);
                        const enableResponse = await ApiService.enableWFHForEmployee(requestData.employee);
                        console.log('✅ Enable WFH response:', enableResponse);
                        
                        const enableData = enableResponse.data?.message || enableResponse.data || {};
                        if (enableResponse.success && (enableData.success === true || enableData.status === 'success')) {
                            showToast({
                                type: 'info',
                                text1: 'WFH Enabled',
                                text2: enableData.message || `WFH has been enabled for ${requestData.employee_name}`,
                            });
                        }
                    } catch (error) {
                        console.warn('⚠️ Failed to auto-enable WFH:', error);
                    }
                }
            } else {
                showToast({
                    type: 'error',
                    text1: 'Error',
                    text2: backendData.message || response.message || `Failed to ${action} request`,
                });
            }
        } catch (error) {
            console.error(`❌ Error ${action}ing request:`, error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: error.message || `Failed to ${action} request`,
            });
        } finally {
            setProcessingRequest(null);
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getRequestTypeIcon = (fromDate, toDate) => {
        const from = new Date(fromDate);
        const to = new Date(toDate);
        const daysDiff = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 0) {
            return { icon: 'calendar-day', color: '#10B981' };
        } else {
            return { icon: 'calendar-week', color: '#F59E0B' };
        }
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

    const renderRequestItem = ({ item }) => {
        const { icon, color } = getRequestTypeIcon(item.from_date, item.to_date);
        const isProcessing = processingRequest === item.name;
        const isPending = item.status?.toLowerCase() === 'pending';
        const statusColor = getStatusColor(item.status);
        const statusIcon = getStatusIcon(item.status);

        return (
            <View style={styles.requestCard}>
                {/* Header Row */}
                <View style={styles.requestHeader}>
                    <View style={styles.employeeInfo}>
                        <View style={[styles.typeIndicator, { backgroundColor: color }]}>
                            <Icon name={icon} size={9} color="white" />
                        </View>
                        <Text style={styles.employeeName} numberOfLines={1}>{item.employee_name}</Text>
                    </View>
                    {!isPending && (
                        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                            <Icon name={statusIcon} size={8} color="white" />
                            <Text style={styles.statusText}>{item.status}</Text>
                        </View>
                    )}
                </View>

                {/* Date and Details Row */}
                <View style={styles.requestDetails}>
                    <View style={styles.infoRow}>
                        <Icon name="calendar" size={11} color={colors.textSecondary} />
                        <Text style={styles.dateText}>
                            {item.from_date === item.to_date
                                ? formatDate(item.from_date)
                                : `${formatDate(item.from_date)} - ${formatDate(item.to_date)}`
                            }
                        </Text>
                    </View>
                    
                    {item.reason && (
                        <View style={styles.infoRow}>
                            <Icon name="comment" size={11} color={colors.textSecondary} />
                            <Text style={styles.reasonText} numberOfLines={1}>
                                {item.reason}
                            </Text>
                        </View>
                    )}
                </View>

                {isPending && (
                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.rejectButton]}
                            onPress={() => handleRejectRequest(item)}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <>
                                    <Icon name="times" size={14} color="white" />
                                    <Text style={styles.actionButtonText}>Reject</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionButton, styles.approveButton]}
                            onPress={() => handleApproveRequest(item)}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <>
                                    <Icon name="check" size={14} color="white" />
                                    <Text style={styles.actionButtonText}>Approve</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    const renderEmptyState = () => {
        const message = activeTab === 'pending' ? 'No pending WFH requests' : 'No request history yet';
        const subtitle = activeTab === 'pending' 
            ? 'All WFH requests have been reviewed' 
            : 'Approved and rejected requests will appear here';
        
        return (
            <View style={styles.emptyState}>
                <Icon name="clipboard-check" size={48} color={colors.textSecondary} />
                <Text style={styles.emptyTitle}>{message}</Text>
                <Text style={styles.emptySubtitle}>{subtitle}</Text>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading WFH requests...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Tab Navigation */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
                    onPress={() => setActiveTab('pending')}
                >
                    <Icon
                        name="clock"
                        size={14}
                        color={activeTab === 'pending' ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
                        Pending
                    </Text>
                    {getTabCounts().pending > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{getTabCounts().pending}</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.tab, activeTab === 'history' && styles.tabActive]}
                    onPress={() => setActiveTab('history')}
                >
                    <Icon
                        name="history"
                        size={14}
                        color={activeTab === 'history' ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
                        History
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Date Filter for History Tab */}
            {activeTab === 'history' && (
                <View style={styles.filterContainer}>
                    <TouchableOpacity 
                        style={styles.filterButton}
                        onPress={() => setShowDateFilterModal(true)}
                    >
                        <Icon name="filter" size={14} color={colors.primary} />
                        <Text style={styles.filterButtonText}>{getDateFilterLabel()}</Text>
                        <Icon name="chevron-down" size={12} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.filterResultText}>
                        {historyRequests.length} {historyRequests.length === 1 ? 'request' : 'requests'}
                    </Text>
                </View>
            )}

            {/* Date Filter Modal */}
            <Modal
                visible={showDateFilterModal}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowDateFilterModal(false)}
            >
                <TouchableOpacity 
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowDateFilterModal(false)}
                >
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Filter by Date</Text>
                        
                        <TouchableOpacity
                            style={[styles.filterOption, selectedDateFilter === 'all' && styles.filterOptionActive]}
                            onPress={() => handleDateFilterChange('all')}
                        >
                            <Icon 
                                name="calendar" 
                                size={16} 
                                color={selectedDateFilter === 'all' ? colors.primary : colors.textSecondary} 
                            />
                            <Text style={[styles.filterOptionText, selectedDateFilter === 'all' && styles.filterOptionTextActive]}>
                                All Time
                            </Text>
                            {selectedDateFilter === 'all' && (
                                <Icon name="check" size={16} color={colors.primary} />
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.filterOption, selectedDateFilter === 'today' && styles.filterOptionActive]}
                            onPress={() => handleDateFilterChange('today')}
                        >
                            <Icon 
                                name="calendar-day" 
                                size={16} 
                                color={selectedDateFilter === 'today' ? colors.primary : colors.textSecondary} 
                            />
                            <Text style={[styles.filterOptionText, selectedDateFilter === 'today' && styles.filterOptionTextActive]}>
                                Today
                            </Text>
                            {selectedDateFilter === 'today' && (
                                <Icon name="check" size={16} color={colors.primary} />
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.filterOption, selectedDateFilter === 'week' && styles.filterOptionActive]}
                            onPress={() => handleDateFilterChange('week')}
                        >
                            <Icon 
                                name="calendar-week" 
                                size={16} 
                                color={selectedDateFilter === 'week' ? colors.primary : colors.textSecondary} 
                            />
                            <Text style={[styles.filterOptionText, selectedDateFilter === 'week' && styles.filterOptionTextActive]}>
                                Last 7 Days
                            </Text>
                            {selectedDateFilter === 'week' && (
                                <Icon name="check" size={16} color={colors.primary} />
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.filterOption, selectedDateFilter === 'month' && styles.filterOptionActive]}
                            onPress={() => handleDateFilterChange('month')}
                        >
                            <Icon 
                                name="calendar-alt" 
                                size={16} 
                                color={selectedDateFilter === 'month' ? colors.primary : colors.textSecondary} 
                            />
                            <Text style={[styles.filterOptionText, selectedDateFilter === 'month' && styles.filterOptionTextActive]}>
                                Last Month
                            </Text>
                            {selectedDateFilter === 'month' && (
                                <Icon name="check" size={16} color={colors.primary} />
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.modalCancelButton}
                            onPress={() => setShowDateFilterModal(false)}
                        >
                            <Text style={styles.modalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <FlatList
                data={getFilteredRequests()}
                renderItem={renderRequestItem}
                keyExtractor={(item) => item.name}
                contentContainerStyle={getFilteredRequests().length === 0 ? styles.emptyContainer : styles.listContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => loadRequests(true)}
                        colors={[colors.primary]}
                    />
                }
                ListEmptyComponent={renderEmptyState}
                showsVerticalScrollIndicator={false}
            />
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
        marginTop: 10,
        fontSize: 14,
        color: colors.textSecondary,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
        gap: 5,
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
    badge: {
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        minWidth: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
    },
    header: {
        padding: 20,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    listContainer: {
        padding: 12,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 30,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginTop: 12,
        marginBottom: 6,
    },
    emptySubtitle: {
        fontSize: 13,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    requestCard: {
        backgroundColor: colors.surface,
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
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
        marginBottom: 8,
    },
    employeeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 6,
    },
    employeeName: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        flex: 1,
    },
    typeIndicator: {
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 8,
        gap: 3,
    },
    statusText: {
        color: 'white',
        fontSize: 9,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    requestDetails: {
        gap: 5,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    dateText: {
        fontSize: 12,
        color: colors.textPrimary,
        fontWeight: '500',
        flex: 1,
    },
    reasonText: {
        fontSize: 11,
        color: colors.textSecondary,
        flex: 1,
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
        marginTop: 10,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        minHeight: 36,
    },
    rejectButton: {
        backgroundColor: '#EF4444',
    },
    approveButton: {
        backgroundColor: '#10B981',
    },
    actionButtonText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 5,
    },
    filterContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: colors.background,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.primary,
        gap: 5,
    },
    filterButtonText: {
        fontSize: 12,
        color: colors.primary,
        fontWeight: '500',
    },
    filterResultText: {
        fontSize: 11,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalContent: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
        width: '100%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 12,
        textAlign: 'center',
    },
    filterOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 8,
        marginBottom: 6,
        backgroundColor: colors.background,
        gap: 10,
    },
    filterOptionActive: {
        backgroundColor: colors.primary + '15',
        borderWidth: 1,
        borderColor: colors.primary,
    },
    filterOptionText: {
        fontSize: 14,
        color: colors.textPrimary,
        flex: 1,
        fontWeight: '500',
    },
    filterOptionTextActive: {
        color: colors.primary,
        fontWeight: '600',
    },
    modalCancelButton: {
        marginTop: 10,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
        backgroundColor: colors.background,
    },
    modalCancelText: {
        fontSize: 14,
        color: colors.textSecondary,
        fontWeight: '600',
    },
});

export default WFHApprovalsScreen;