import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    RefreshControl,
    Modal,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import apiService from '../../services/api.service';

const TravelRequestApproval = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [requests, setRequests] = useState([]);
    const [filterStatus, setFilterStatus] = useState('pending');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showActionModal, setShowActionModal] = useState(false);
    const [actionType, setActionType] = useState(null); // 'approve' or 'reject'
    const [actionReason, setActionReason] = useState('');

    useEffect(() => {
        loadRequests();
    }, [filterStatus]);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const filters = {};
            if (filterStatus !== 'all') {
                filters.status = filterStatus;
            }

            console.log('[Admin] Fetching travel requests with filters:', filters);
            const response = await apiService.getTravelRequests(filters);
            console.log('[Admin] Travel Requests Response:', JSON.stringify(response, null, 2));
            
            // Try multiple possible response structures
            let requestsData = null;
            
            if (response.success && response.data?.message?.data?.requests) {
                requestsData = response.data.message.data.requests;
            } else if (response.success && response.data?.message?.requests) {
                requestsData = response.data.message.requests;
            } else if (response.success && response.data?.requests) {
                requestsData = response.data.requests;
            } else if (response.data?.message?.data) {
                requestsData = response.data.message.data;
            } else if (response.data?.message) {
                requestsData = response.data.message;
            } else if (response.data) {
                requestsData = response.data;
            }
            
            console.log('[Admin] Parsed requests data:', requestsData);
            console.log('[Admin] Number of requests:', requestsData?.length || 0);
            
            if (requestsData && Array.isArray(requestsData)) {
                setRequests(requestsData);
            } else if (requestsData) {
                // If it's an object, try to extract an array
                const possibleArrays = Object.values(requestsData).find(val => Array.isArray(val));
                if (possibleArrays) {
                    setRequests(possibleArrays);
                } else {
                    console.warn('[Admin] Response data is not an array:', requestsData);
                    setRequests([]);
                }
            } else {
                console.warn('[Admin] No requests found in response');
                setRequests([]);
            }
        } catch (error) {
            console.error('[Admin] Load requests error:', error);
            console.error('[Admin] Error details:', error.response?.data || error.message);
            Alert.alert('Error', 'Failed to load travel requests');
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadRequests();
        setRefreshing(false);
    };

    const handleViewDetails = async (request) => {
        try {
            const response = await apiService.getTravelRequestDetails(request.name);
            if (response.success && response.data?.message?.data) {
                setSelectedRequest(response.data.message.data);
                setShowDetailsModal(true);
            } else {
                Alert.alert('Error', 'Failed to load request details');
            }
        } catch (error) {
            console.error('View details error:', error);
            Alert.alert('Error', 'Failed to load request details');
        }
    };

    const handleAction = (type) => {
        if (!selectedRequest) return;

        setActionType(type);
        setActionReason('');
        setShowDetailsModal(false);
        setShowActionModal(true);
    };

    const confirmAction = async () => {
        if (actionType === 'reject' && !actionReason.trim()) {
            Alert.alert('Validation Error', 'Please provide a reason for rejection');
            return;
        }

        setLoading(true);
        try {
            let response;
            if (actionType === 'approve') {
                response = await apiService.approveTravelRequest(
                    selectedRequest.request_id,
                    actionReason
                );
            } else {
                response = await apiService.rejectTravelRequest(
                    selectedRequest.request_id,
                    actionReason
                );
            }

            if (response.success && response.data?.message?.status === 'success') {
                Alert.alert(
                    'Success',
                    `Travel request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully`,
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                setShowActionModal(false);
                                setSelectedRequest(null);
                                setActionReason('');
                                loadRequests();
                            },
                        },
                    ]
                );
            } else {
                Alert.alert('Error', response.data?.message?.message || `Failed to ${actionType} request`);
            }
        } catch (error) {
            console.error('Action error:', error);
            Alert.alert('Error', `Failed to ${actionType} travel request`);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Pending':
                return '#FFA500';
            case 'Approved':
                return '#4CAF50';
            case 'Rejected':
                return '#F44336';
            default:
                return '#757575';
        }
    };

    const renderRequestCard = (request) => (
        <TouchableOpacity
            key={request.name}
            style={styles.requestCard}
            onPress={() => handleViewDetails(request)}
        >
            <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                    <Icon name="account" size={20} color="#4A90E2" />
                    <Text style={styles.employeeName}>{request.employee_name}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status_label) }]}>
                    <Text style={styles.statusText}>{request.status_label}</Text>
                </View>
            </View>

            <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                    <Icon name="airplane" size={16} color="#666" />
                    <Text style={styles.infoText}>{request.travel_type}</Text>
                </View>

                <View style={styles.infoRow}>
                    <Icon name="target" size={16} color="#666" />
                    <Text style={styles.infoText}>{request.purpose_of_travel}</Text>
                </View>

                {request.description && (
                    <Text style={styles.description} numberOfLines={2}>
                        {request.description}
                    </Text>
                )}
            </View>

            <View style={styles.cardFooter}>
                <Text style={styles.dateText}>
                    <Icon name="calendar" size={14} color="#999" /> {request.creation}
                </Text>
                <Icon name="chevron-right" size={20} color="#999" />
            </View>
        </TouchableOpacity>
    );

    const renderDetailsModal = () => {
        if (!selectedRequest) return null;

        return (
            <Modal
                visible={showDetailsModal}
                animationType="slide"
                onRequestClose={() => setShowDetailsModal(false)}
            >
                <View style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                            <Icon name="close" size={24} color="#333" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Request Details</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    {/* Content */}
                    <ScrollView style={styles.modalContent}>
                        {/* Employee Info */}
                        <View style={styles.detailSection}>
                            <Text style={styles.sectionTitle}>Employee Information</Text>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Name:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.employee_name}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Employee ID:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.employee}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Company:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.company}</Text>
                            </View>
                        </View>

                        {/* Travel Details */}
                        <View style={styles.detailSection}>
                            <Text style={styles.sectionTitle}>Travel Details</Text>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Type:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.travel_type}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Purpose:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.purpose_of_travel}</Text>
                            </View>
                            {selectedRequest.description && (
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Description:</Text>
                                    <Text style={styles.detailValue}>{selectedRequest.description}</Text>
                                </View>
                            )}
                        </View>

                        {/* Contact Info */}
                        {(selectedRequest.cell_number || selectedRequest.prefered_email) && (
                            <View style={styles.detailSection}>
                                <Text style={styles.sectionTitle}>Contact Information</Text>
                                {selectedRequest.cell_number && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Phone:</Text>
                                        <Text style={styles.detailValue}>{selectedRequest.cell_number}</Text>
                                    </View>
                                )}
                                {selectedRequest.prefered_email && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Email:</Text>
                                        <Text style={styles.detailValue}>{selectedRequest.prefered_email}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Funding Info */}
                        {(selectedRequest.travel_funding || selectedRequest.details_of_sponsor) && (
                            <View style={styles.detailSection}>
                                <Text style={styles.sectionTitle}>Funding Information</Text>
                                {selectedRequest.travel_funding && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Funding:</Text>
                                        <Text style={styles.detailValue}>{selectedRequest.travel_funding}</Text>
                                    </View>
                                )}
                                {selectedRequest.details_of_sponsor && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Sponsor:</Text>
                                        <Text style={styles.detailValue}>{selectedRequest.details_of_sponsor}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Event Details */}
                        {(selectedRequest.name_of_organizer || selectedRequest.address_of_organizer) && (
                            <View style={styles.detailSection}>
                                <Text style={styles.sectionTitle}>Event Details</Text>
                                {selectedRequest.name_of_organizer && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Organizer:</Text>
                                        <Text style={styles.detailValue}>{selectedRequest.name_of_organizer}</Text>
                                    </View>
                                )}
                                {selectedRequest.address_of_organizer && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Address:</Text>
                                        <Text style={styles.detailValue}>{selectedRequest.address_of_organizer}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Status */}
                        <View style={styles.detailSection}>
                            <Text style={styles.sectionTitle}>Status</Text>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Current Status:</Text>
                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedRequest.status_label) }]}>
                                    <Text style={styles.statusText}>{selectedRequest.status_label}</Text>
                                </View>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Submitted On:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.creation}</Text>
                            </View>
                        </View>

                        {/* Comments */}
                        {selectedRequest.comments && selectedRequest.comments.length > 0 && (
                            <View style={styles.detailSection}>
                                <Text style={styles.sectionTitle}>Comments</Text>
                                {selectedRequest.comments.map((comment, index) => (
                                    <View key={index} style={styles.commentCard}>
                                        <Text style={styles.commentText}>{comment.content}</Text>
                                        <Text style={styles.commentMeta}>
                                            {comment.owner} • {comment.creation}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        <View style={{ height: 100 }} />
                    </ScrollView>

                    {/* Action Buttons */}
                    {selectedRequest.status_label === 'Pending' && (
                        <View style={styles.actionButtons}>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.rejectButton]}
                                onPress={() => handleAction('reject')}
                            >
                                <Icon name="close-circle" size={20} color="#FFF" />
                                <Text style={styles.actionButtonText}>Reject</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.actionButton, styles.approveButton]}
                                onPress={() => handleAction('approve')}
                            >
                                <Icon name="check-circle" size={20} color="#FFF" />
                                <Text style={styles.actionButtonText}>Approve</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </Modal>
        );
    };

    const renderActionModal = () => (
        <Modal
            visible={showActionModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowActionModal(false)}
        >
            <View style={styles.actionModalOverlay}>
                <View style={styles.actionModalContent}>
                    <Text style={styles.actionModalTitle}>
                        {actionType === 'approve' ? 'Approve Request' : 'Reject Request'}
                    </Text>

                    <Text style={styles.actionModalSubtitle}>
                        {actionType === 'approve'
                            ? 'Optional: Add remarks or comments'
                            : 'Please provide a reason for rejection'}
                    </Text>

                    <TextInput
                        style={styles.actionInput}
                        value={actionReason}
                        onChangeText={setActionReason}
                        placeholder={actionType === 'approve' ? 'Remarks (optional)' : 'Rejection reason *'}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />

                    <View style={styles.actionModalButtons}>
                        <TouchableOpacity
                            style={[styles.actionModalButton, styles.actionModalCancelButton]}
                            onPress={() => setShowActionModal(false)}
                        >
                            <Text style={styles.actionModalCancelText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionModalButton, actionType === 'approve' ? styles.actionModalApproveButton : styles.actionModalRejectButton]}
                            onPress={confirmAction}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Text style={styles.actionModalConfirmText}>
                                    {actionType === 'approve' ? 'Approve' : 'Reject'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    if (loading && requests.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4A90E2" />
                <Text style={styles.loadingText}>Loading requests...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Travel Request Approvals</Text>
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {['pending', 'approved', 'rejected', 'all'].map((status) => (
                        <TouchableOpacity
                            key={status}
                            style={[
                                styles.filterTab,
                                filterStatus === status && styles.filterTabActive,
                            ]}
                            onPress={() => setFilterStatus(status)}
                        >
                            <Text
                                style={[
                                    styles.filterTabText,
                                    filterStatus === status && styles.filterTabTextActive,
                                ]}
                            >
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Request List */}
            <ScrollView
                style={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {requests.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Icon name="clipboard-text-outline" size={80} color="#CCC" />
                        <Text style={styles.emptyText}>No travel requests found</Text>
                        <Text style={styles.emptySubtext}>
                            {filterStatus === 'pending'
                                ? 'No pending requests at the moment'
                                : `No ${filterStatus} requests found`}
                        </Text>
                    </View>
                ) : (
                    requests.map(renderRequestCard)
                )}
            </ScrollView>

            {/* Modals */}
            {renderDetailsModal()}
            {renderActionModal()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: '#666',
    },
    header: {
        padding: 16,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    filterContainer: {
        backgroundColor: '#FFF',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    filterTab: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F0F0F0',
        marginRight: 8,
    },
    filterTabActive: {
        backgroundColor: '#4A90E2',
    },
    filterTabText: {
        fontSize: 14,
        color: '#666',
        fontWeight: '500',
    },
    filterTabTextActive: {
        color: '#FFF',
        fontWeight: '600',
    },
    content: {
        flex: 1,
    },
    requestCard: {
        backgroundColor: '#FFF',
        marginHorizontal: 16,
        marginVertical: 8,
        padding: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    employeeName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginLeft: 8,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '600',
    },
    cardBody: {
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 14,
        color: '#666',
        marginLeft: 8,
    },
    description: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
        fontStyle: 'italic',
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    dateText: {
        fontSize: 13,
        color: '#999',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#999',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#AAA',
        marginTop: 8,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#FFF',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    modalContent: {
        flex: 1,
        padding: 16,
    },
    detailSection: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    detailLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        width: 120,
    },
    detailValue: {
        fontSize: 14,
        color: '#333',
        flex: 1,
    },
    commentCard: {
        backgroundColor: '#F9F9F9',
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
    },
    commentText: {
        fontSize: 14,
        color: '#333',
        marginBottom: 8,
    },
    commentMeta: {
        fontSize: 12,
        color: '#999',
    },
    actionButtons: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: '#FFF',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        gap: 8,
    },
    approveButton: {
        backgroundColor: '#4CAF50',
    },
    rejectButton: {
        backgroundColor: '#F44336',
    },
    actionButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
    actionModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    actionModalContent: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 20,
        width: '100%',
        maxWidth: 400,
    },
    actionModalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
    },
    actionModalSubtitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 16,
    },
    actionInput: {
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        backgroundColor: '#FAFAFA',
        minHeight: 100,
        marginBottom: 16,
        textAlignVertical: 'top',
    },
    actionModalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    actionModalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionModalCancelButton: {
        backgroundColor: '#F0F0F0',
    },
    actionModalApproveButton: {
        backgroundColor: '#4CAF50',
    },
    actionModalRejectButton: {
        backgroundColor: '#F44336',
    },
    actionModalCancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#666',
    },
    actionModalConfirmText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFF',
    },
});

export default TravelRequestApproval;