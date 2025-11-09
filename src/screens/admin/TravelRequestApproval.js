import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    RefreshControl,
    Modal,
    TextInput
} from 'react-native';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import apiService from '../../services/api.service';

const TravelRequestApproval = ({ navigation }) => {
    const [activeTab, setActiveTab] = useState('pending'); // pending, history, statistics
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    // Data states
    const [requests, setRequests] = useState([]);
    const [statistics, setStatistics] = useState({});
    const [filterDocstatus, setFilterDocstatus] = useState(0); // For pending tab

    // Action modal state
    const [actionModal, setActionModal] = useState({
        visible: false,
        type: '', // 'approve' or 'reject'
        request: null,
        remarks: ''
    });

    useEffect(() => {
        loadRequests();
    }, [activeTab, filterDocstatus]);

    const loadRequests = async () => {
        setLoading(true);
        try {
            let filters = { limit: 500 };
            
            if (activeTab === 'pending') {
                filters.docstatus = 0; // Draft/Pending requests
            } else if (activeTab === 'history') {
                if (filterDocstatus !== '') {
                    filters.docstatus = filterDocstatus;
                }
            }

            const response = await apiService.getAdminTravelRequests(filters);
            
            if (response.success && response.data?.message) {
                const data = response.data.message;
                setRequests(data.travel_requests || []);
                setStatistics(data.statistics || {});
            }
        } catch (error) {
            console.error('Error loading travel requests:', error);
            Alert.alert('Error', 'Failed to load travel requests');
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadRequests();
        setRefreshing(false);
    }, [activeTab, filterDocstatus]);

    const handleApprove = (request) => {
        setActionModal({
            visible: true,
            type: 'approve',
            request,
            remarks: ''
        });
    };

    const handleReject = (request) => {
        setActionModal({
            visible: true,
            type: 'reject',
            request,
            remarks: ''
        });
    };

    const confirmAction = async () => {
        const { type, request, remarks } = actionModal;
        
        if (type === 'reject' && !remarks.trim()) {
            Alert.alert('Error', 'Rejection reason is required');
            return;
        }

        setLoading(true);
        try {
            let response;
            
            if (type === 'approve') {
                response = await apiService.approveTravelRequest(request.name, remarks);
            } else {
                response = await apiService.rejectTravelRequest(request.name, remarks);
            }

            if (response.success) {
                Alert.alert(
                    'Success',
                    `Travel request ${type}d successfully`,
                    [{ text: 'OK', onPress: () => {
                        setActionModal({ visible: false, type: '', request: null, remarks: '' });
                        loadRequests();
                    }}]
                );
            }
        } catch (error) {
            console.error(`${type} request error:`, error);
            Alert.alert('Error', error.message || `Failed to ${type} request`);
        } finally {
            setLoading(false);
        }
    };

    const getDocstatusLabel = (docstatus) => {
        switch(docstatus) {
            case 0: return 'Draft';
            case 1: return 'Submitted';
            case 2: return 'Cancelled';
            default: return 'Unknown';
        }
    };

    const getDocstatusColor = (docstatus) => {
        switch(docstatus) {
            case 0: return colors.warning;
            case 1: return colors.success;
            case 2: return colors.error;
            default: return colors.textSecondary;
        }
    };

    const renderRequestCard = (request) => {
        const isPending = request.docstatus === 0;

        return (
            <View key={request.name} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.requestId}>{request.name}</Text>
                        <Text style={styles.employeeName}>{request.employee_name}</Text>
                        <Text style={styles.department}>{request.department || 'N/A'}</Text>
                    </View>
                    <View style={[
                        styles.statusBadge,
                        { backgroundColor: getDocstatusColor(request.docstatus) }
                    ]}>
                        <Text style={styles.statusText}>
                            {getDocstatusLabel(request.docstatus)}
                        </Text>
                    </View>
                </View>

                <View style={styles.requestDetails}>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Travel Type:</Text>
                        <Text style={styles.detailValue}>{request.travel_type}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Purpose:</Text>
                        <Text style={[styles.detailValue, { flex: 1 }]}>{request.purpose_of_travel}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Description:</Text>
                        <Text style={[styles.detailValue, { flex: 1 }]} numberOfLines={2}>
                            {request.description}
                        </Text>
                    </View>
                    {request.travel_funding && (
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Funding:</Text>
                            <Text style={styles.detailValue}>{request.travel_funding}</Text>
                        </View>
                    )}
                </View>

                {/* Itinerary Details */}
                {request.itinerary && request.itinerary.length > 0 && (
                    <View style={styles.itinerarySection}>
                        <Text style={styles.itineraryHeader}>
                            Itinerary ({request.itinerary.length} items):
                        </Text>
                        {request.itinerary.map((item, idx) => (
                            <View key={idx} style={styles.itineraryItem}>
                                <View style={styles.itineraryItemHeader}>
                                    <Text style={styles.itineraryRoute}>
                                        {item.from_location} → {item.to_location}
                                    </Text>
                                    <Text style={styles.itineraryMode}>{item.travel_mode}</Text>
                                </View>
                                <Text style={styles.itineraryDates}>
                                    {new Date(item.from_date).toLocaleDateString()} - {new Date(item.to_date).toLocaleDateString()}
                                </Text>
                                {item.lodging_required && (
                                    <Text style={styles.itineraryLodging}>🏨 Lodging Required</Text>
                                )}
                            </View>
                        ))}
                    </View>
                )}

                {/* Cost Estimation */}
                {request.costings && request.costings.length > 0 && (
                    <View style={styles.costingSection}>
                        <Text style={styles.costingHeader}>Cost Estimation:</Text>
                        {request.costings.map((cost, idx) => (
                            <View key={idx} style={styles.costingItem}>
                                <Text style={styles.costingType}>{cost.expense_type}</Text>
                                <Text style={styles.costingAmount}>₹{cost.amount?.toFixed(2)}</Text>
                            </View>
                        ))}
                        <View style={styles.costingTotal}>
                            <Text style={styles.costingTotalLabel}>Total Estimated Cost:</Text>
                            <Text style={styles.costingTotalValue}>
                                ₹{request.total_estimated_cost?.toFixed(2)}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Action Buttons */}
                {isPending && (
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
                )}
            </View>
        );
    };

    const renderPendingTab = () => (
        <ScrollView
            style={styles.tabContent}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        >
            {loading ? (
                <Loading />
            ) : requests.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No pending travel requests</Text>
                    <Text style={styles.emptySubtext}>All requests have been processed</Text>
                </View>
            ) : (
                <>
                    <View style={styles.pendingHeader}>
                        <Text style={styles.pendingCount}>
                            {requests.length} Pending Approval{requests.length !== 1 ? 's' : ''}
                        </Text>
                    </View>
                    {requests.map(renderRequestCard)}
                    <View style={styles.bottomPadding} />
                </>
            )}
        </ScrollView>
    );

    const renderHistoryTab = () => (
        <View style={styles.tabContent}>
            {/* Filter Pills */}
            <View style={styles.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <TouchableOpacity
                        onPress={() => setFilterDocstatus('')}
                        style={[styles.filterPill, filterDocstatus === '' && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterDocstatus === '' && styles.filterTextActive]}>
                            All
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilterDocstatus(1)}
                        style={[styles.filterPill, filterDocstatus === 1 && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterDocstatus === 1 && styles.filterTextActive]}>
                            Submitted
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilterDocstatus(2)}
                        style={[styles.filterPill, filterDocstatus === 2 && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterDocstatus === 2 && styles.filterTextActive]}>
                            Cancelled
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            <ScrollView
                style={styles.requestsList}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {loading ? (
                    <Loading />
                ) : requests.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No travel requests found</Text>
                    </View>
                ) : (
                    <>
                        {requests.map(renderRequestCard)}
                        <View style={styles.bottomPadding} />
                    </>
                )}
            </ScrollView>
        </View>
    );

    const renderStatisticsTab = () => (
        <ScrollView
            style={styles.tabContent}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        >
            <View style={styles.statsContainer}>
                <Text style={styles.statsTitle}>Overall Statistics</Text>
                
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{statistics.total_requests || 0}</Text>
                        <Text style={styles.statLabel}>Total Requests</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={[styles.statValue, { color: colors.success }]}>
                            ₹{(statistics.total_estimated_cost || 0).toFixed(0)}
                        </Text>
                        <Text style={styles.statLabel}>Total Cost</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={[styles.statValue, { color: colors.warning }]}>
                            {statistics.domestic_count || 0}
                        </Text>
                        <Text style={styles.statLabel}>Domestic</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={[styles.statValue, { color: colors.primary }]}>
                            {statistics.international_count || 0}
                        </Text>
                        <Text style={styles.statLabel}>International</Text>
                    </View>
                </View>

                {/* By Status */}
                {statistics.by_status && Object.keys(statistics.by_status).length > 0 && (
                    <View style={styles.statsSection}>
                        <Text style={styles.statsSectionTitle}>By Status</Text>
                        {Object.entries(statistics.by_status).map(([status, count]) => (
                            <View key={status} style={styles.statsRow}>
                                <Text style={styles.statsRowLabel}>{getDocstatusLabel(parseInt(status))}</Text>
                                <Text style={styles.statsRowValue}>{count}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* By Employee */}
                {statistics.by_employee && Object.keys(statistics.by_employee).length > 0 && (
                    <View style={styles.statsSection}>
                        <Text style={styles.statsSectionTitle}>Top Requesters</Text>
                        {Object.entries(statistics.by_employee)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 10)
                            .map(([employee, count]) => (
                                <View key={employee} style={styles.statsRow}>
                                    <Text style={styles.statsRowLabel}>{employee}</Text>
                                    <Text style={styles.statsRowValue}>{count}</Text>
                                </View>
                            ))}
                    </View>
                )}
            </View>
            <View style={styles.bottomPadding} />
        </ScrollView>
    );

    return (
        <View style={styles.container}>
            {/* Tab Navigation */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
                    onPress={() => setActiveTab('pending')}
                >
                    <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>
                        Pending
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'history' && styles.activeTab]}
                    onPress={() => setActiveTab('history')}
                >
                    <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
                        History
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'statistics' && styles.activeTab]}
                    onPress={() => setActiveTab('statistics')}
                >
                    <Text style={[styles.tabText, activeTab === 'statistics' && styles.activeTabText]}>
                        Statistics
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Tab Content */}
            {activeTab === 'pending' && renderPendingTab()}
            {activeTab === 'history' && renderHistoryTab()}
            {activeTab === 'statistics' && renderStatisticsTab()}

            {/* Action Modal */}
            <Modal
                visible={actionModal.visible}
                transparent
                animationType="fade"
                onRequestClose={() => setActionModal({ ...actionModal, visible: false })}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {actionModal.type === 'approve' ? 'Approve' : 'Reject'} Travel Request
                        </Text>
                        <Text style={styles.modalSubtitle}>
                            {actionModal.request?.name}
                        </Text>

                        <Text style={styles.modalLabel}>
                            {actionModal.type === 'approve' ? 'Remarks (Optional)' : 'Rejection Reason *'}
                        </Text>
                        <TextInput
                            style={styles.modalInput}
                            value={actionModal.remarks}
                            onChangeText={(text) => setActionModal({ ...actionModal, remarks: text })}
                            placeholder={actionModal.type === 'approve' 
                                ? 'Add approval remarks...' 
                                : 'Why is this request being rejected?'}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalCancelButton]}
                                onPress={() => setActionModal({ visible: false, type: '', request: null, remarks: '' })}
                            >
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.modalButton,
                                    actionModal.type === 'approve' ? styles.modalApproveButton : styles.modalRejectButton
                                ]}
                                onPress={confirmAction}
                                disabled={loading}
                            >
                                <Text style={styles.modalConfirmText}>
                                    {loading ? 'Processing...' : 'Confirm'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    tabBar: {
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
    activeTab: {
        borderBottomColor: colors.primary,
    },
    tabText: {
        fontSize: 16,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    activeTabText: {
        color: colors.primary,
        fontWeight: '600',
    },
    tabContent: {
        flex: 1,
    },
    pendingHeader: {
        padding: 16,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    pendingCount: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    requestCard: {
        backgroundColor: colors.white,
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    requestHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    requestId: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    employeeName: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.primary,
        marginBottom: 2,
    },
    department: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        color: colors.white,
        fontSize: 12,
        fontWeight: '600',
    },
    requestDetails: {
        marginTop: 8,
    },
    detailRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    detailLabel: {
        fontSize: 14,
        color: colors.textSecondary,
        fontWeight: '500',
        width: 100,
    },
    detailValue: {
        fontSize: 14,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    itinerarySection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    itineraryHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    itineraryItem: {
        backgroundColor: colors.cardBackground,
        padding: 12,
        borderRadius: 6,
        marginBottom: 8,
    },
    itineraryItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    itineraryRoute: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
        flex: 1,
    },
    itineraryMode: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    itineraryDates: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 2,
    },
    itineraryLodging: {
        fontSize: 12,
        color: colors.success,
        marginTop: 2,
    },
    costingSection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    costingHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    costingItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: colors.cardBackground,
        borderRadius: 4,
        marginBottom: 4,
    },
    costingType: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    costingAmount: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    costingTotal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    costingTotalLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    costingTotalValue: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.success,
    },
    actionButtons: {
        flexDirection: 'row',
        marginTop: 16,
        gap: 12,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 12,
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
        fontSize: 16,
        fontWeight: '600',
    },
    filterContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    filterPill: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: colors.cardBackground,
        marginRight: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    filterPillActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    filterText: {
        fontSize: 14,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    filterTextActive: {
        color: colors.white,
        fontWeight: '600',
    },
    requestsList: {
        flex: 1,
    },
    statsContainer: {
        padding: 16,
    },
    statsTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 16,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -6,
        marginBottom: 20,
    },
    statCard: {
        width: '50%',
        padding: 6,
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.primary,
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    statsSection: {
        backgroundColor: colors.white,
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
    },
    statsSectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 12,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    statsRowLabel: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    statsRowValue: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: colors.white,
        borderRadius: 12,
        padding: 20,
        width: '100%',
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 16,
    },
    modalLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: colors.textPrimary,
        minHeight: 100,
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalCancelButton: {
        backgroundColor: colors.cardBackground,
        borderWidth: 1,
        borderColor: colors.border,
    },
    modalApproveButton: {
        backgroundColor: colors.success,
    },
    modalRejectButton: {
        backgroundColor: colors.error,
    },
    modalCancelText: {
        color: colors.textPrimary,
        fontSize: 16,
        fontWeight: '600',
    },
    modalConfirmText: {
        color: colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    bottomPadding: {
        height: 80,
    },
});

export default TravelRequestApproval;