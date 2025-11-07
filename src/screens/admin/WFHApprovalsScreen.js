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
    const [requests, setRequests] = useState([]);
    const [processingRequest, setProcessingRequest] = useState(null);

    useEffect(() => {
        loadPendingRequests();
    }, []);

    const loadPendingRequests = async (isRefresh = false) => {
        try {
            isRefresh ? setRefreshing(true) : setLoading(true);
            const response = await ApiService.getPendingWFHRequests();
            
            if (response.success && response.data?.message) {
                setRequests(response.data.message);
            } else {
                showToast({
                    type: 'error',
                    text1: 'Error',
                    text2: 'Failed to load WFH requests',
                });
            }
        } catch (error) {
            console.error('Error loading pending WFH requests:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to load WFH requests',
            });
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
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
            
            let response;
            if (action === 'approve') {
                response = await ApiService.approveWFHRequest(requestId);
            } else {
                response = await ApiService.rejectWFHRequest(requestId);
            }

            if (response.success) {
                // Send notification to employee
                if (NotificationService) {
                    try {
                        await NotificationService.sendWFHApprovalNotification(
                            action === 'approve',
                            requestData.from_date,
                            action === 'approve' ? 'Your WFH request has been approved' : 'Your WFH request has been rejected'
                        );
                    } catch (error) {
                        console.warn('Failed to send notification:', error);
                    }
                }

                // Remove from list
                setRequests(requests.filter(req => req.name !== requestId));
                
                showToast({
                    type: 'success',
                    text1: action === 'approve' ? 'Approved' : 'Rejected',
                    text2: `WFH request has been ${action === 'approve' ? 'approved' : 'rejected'}`,
                });

                // If approved, automatically enable WFH for employee
                if (action === 'approve') {
                    try {
                        await ApiService.enableWFHForEmployee(requestData.employee);
                        showToast({
                            type: 'info',
                            text1: 'WFH Enabled',
                            text2: `WFH has been automatically enabled for ${requestData.employee_name}`,
                        });
                    } catch (error) {
                        console.warn('Failed to auto-enable WFH:', error);
                    }
                }
            } else {
                showToast({
                    type: 'error',
                    text1: 'Error',
                    text2: response.message || `Failed to ${action} request`,
                });
            }
        } catch (error) {
            console.error(`Error ${action}ing request:`, error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: `Failed to ${action} request`,
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

    const renderRequestItem = ({ item }) => {
        const { icon, color } = getRequestTypeIcon(item.from_date, item.to_date);
        const isProcessing = processingRequest === item.name;

        return (
            <View style={styles.requestCard}>
                <View style={styles.requestHeader}>
                    <View style={styles.employeeInfo}>
                        <Icon name="user" size={16} color={colors.textSecondary} />
                        <Text style={styles.employeeName}>{item.employee_name}</Text>
                    </View>
                    <View style={[styles.typeIndicator, { backgroundColor: color }]}>
                        <Icon name={icon} size={12} color="white" />
                    </View>
                </View>

                <View style={styles.requestDetails}>
                    <View style={styles.dateInfo}>
                        <Icon name="calendar" size={14} color={colors.textSecondary} />
                        <Text style={styles.dateText}>
                            {item.from_date === item.to_date
                                ? formatDate(item.from_date)
                                : `${formatDate(item.from_date)} - ${formatDate(item.to_date)}`
                            }
                        </Text>
                    </View>
                    
                    {item.reason && (
                        <View style={styles.reasonInfo}>
                            <Icon name="comment" size={14} color={colors.textSecondary} />
                            <Text style={styles.reasonText} numberOfLines={2}>
                                {item.reason}
                            </Text>
                        </View>
                    )}
                    
                    <View style={styles.timestampInfo}>
                        <Icon name="clock" size={14} color={colors.textSecondary} />
                        <Text style={styles.timestampText}>
                            Requested on {formatDate(item.creation)}
                        </Text>
                    </View>
                </View>

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
                                <Icon name="times" size={16} color="white" />
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
                                <Icon name="check" size={16} color="white" />
                                <Text style={styles.actionButtonText}>Approve</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Icon name="clipboard-check" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No Pending Requests</Text>
            <Text style={styles.emptySubtitle}>
                All WFH requests have been reviewed
            </Text>
        </View>
    );

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
            <View style={styles.header}>
                <Text style={styles.title}>WFH Approvals</Text>
                <Text style={styles.subtitle}>
                    {requests.length} pending request{requests.length !== 1 ? 's' : ''}
                </Text>
            </View>

            <FlatList
                data={requests}
                renderItem={renderRequestItem}
                keyExtractor={(item) => item.name}
                contentContainerStyle={requests.length === 0 ? styles.emptyContainer : styles.listContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => loadPendingRequests(true)}
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
        marginTop: 16,
        fontSize: 16,
        color: colors.textSecondary,
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
        padding: 16,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 40,
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
    requestCard: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: colors.primary,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    requestHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    employeeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    employeeName: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginLeft: 8,
    },
    typeIndicator: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    requestDetails: {
        marginBottom: 16,
    },
    dateInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    dateText: {
        fontSize: 14,
        color: colors.textPrimary,
        marginLeft: 8,
        fontWeight: '500',
    },
    reasonInfo: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    reasonText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginLeft: 8,
        flex: 1,
    },
    timestampInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    timestampText: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 8,
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        minHeight: 44,
    },
    rejectButton: {
        backgroundColor: '#EF4444',
    },
    approveButton: {
        backgroundColor: '#10B981',
    },
    actionButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 8,
    },
});

export default WFHApprovalsScreen;