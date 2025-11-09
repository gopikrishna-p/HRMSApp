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
import Input from '../../components/common/Input';
import Loading from '../../components/common/Loading';
import apiService from '../../services/api.service';

const ExpenseClaimApprovalScreen = ({ navigation }) => {
    const [activeTab, setActiveTab] = useState('pending'); // pending, history, statistics
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    // Data states
    const [claims, setClaims] = useState([]);
    const [statistics, setStatistics] = useState({});
    const [filterStatus, setFilterStatus] = useState('Draft'); // For pending tab

    // Action modal state
    const [actionModal, setActionModal] = useState({
        visible: false,
        type: '', // 'approve' or 'reject'
        claim: null,
        remarks: ''
    });

    useEffect(() => {
        loadClaims();
    }, [activeTab, filterStatus]);

    const loadClaims = async () => {
        setLoading(true);
        try {
            let filters = { limit: 500 };
            
            if (activeTab === 'pending') {
                filters.approval_status = 'Draft';
            } else if (activeTab === 'history') {
                // Load all for history
            }

            const response = await apiService.getAdminExpenseClaims(filters);
            
            if (response.success && response.data?.message) {
                const data = response.data.message;
                setClaims(data.claims || []);
                setStatistics(data.statistics || {});
            }
        } catch (error) {
            console.error('Error loading claims:', error);
            Alert.alert('Error', 'Failed to load expense claims');
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadClaims();
        setRefreshing(false);
    }, [activeTab, filterStatus]);

    const handleApprove = (claim) => {
        setActionModal({
            visible: true,
            type: 'approve',
            claim,
            remarks: ''
        });
    };

    const handleReject = (claim) => {
        setActionModal({
            visible: true,
            type: 'reject',
            claim,
            remarks: ''
        });
    };

    const confirmAction = async () => {
        const { type, claim, remarks } = actionModal;
        
        if (type === 'reject' && !remarks.trim()) {
            Alert.alert('Error', 'Rejection reason is required');
            return;
        }

        setLoading(true);
        try {
            let response;
            
            if (type === 'approve') {
                response = await apiService.approveExpenseClaim(claim.name, remarks);
            } else {
                response = await apiService.rejectExpenseClaim(claim.name, remarks);
            }

            if (response.success) {
                Alert.alert(
                    'Success',
                    `Expense claim ${type}d successfully`,
                    [{ text: 'OK', onPress: () => {
                        setActionModal({ visible: false, type: '', claim: null, remarks: '' });
                        loadClaims();
                    }}]
                );
            }
        } catch (error) {
            console.error(`${type} claim error:`, error);
            Alert.alert('Error', error.message || `Failed to ${type} claim`);
        } finally {
            setLoading(false);
        }
    };

    const renderClaimCard = (claim) => {
        const statusColor = 
            claim.approval_status === 'Approved' ? colors.success :
            claim.approval_status === 'Rejected' ? colors.error :
            colors.warning;

        const isPending = claim.approval_status === 'Draft';

        return (
            <View key={claim.name} style={styles.claimCard}>
                <View style={styles.claimHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.claimId}>{claim.name}</Text>
                        <Text style={styles.employeeName}>{claim.employee_name}</Text>
                        <Text style={styles.department}>{claim.department || 'N/A'}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                        <Text style={styles.statusText}>{claim.approval_status}</Text>
                    </View>
                </View>

                <View style={styles.claimDetails}>
                    <View style={styles.claimRow}>
                        <Text style={styles.claimLabel}>Date:</Text>
                        <Text style={styles.claimValue}>
                            {new Date(claim.posting_date).toLocaleDateString()}
                        </Text>
                    </View>
                    <View style={styles.claimRow}>
                        <Text style={styles.claimLabel}>Claimed:</Text>
                        <Text style={styles.claimValue}>₹{claim.total_claimed_amount?.toFixed(2)}</Text>
                    </View>
                    <View style={styles.claimRow}>
                        <Text style={styles.claimLabel}>Sanctioned:</Text>
                        <Text style={styles.claimValue}>₹{claim.total_sanctioned_amount?.toFixed(2)}</Text>
                    </View>
                    <View style={styles.claimRow}>
                        <Text style={styles.claimLabel}>Expenses:</Text>
                        <Text style={styles.claimValue}>{claim.total_expenses} items</Text>
                    </View>
                    {claim.expense_approver && (
                        <View style={styles.claimRow}>
                            <Text style={styles.claimLabel}>Approver:</Text>
                            <Text style={styles.claimValue}>{claim.expense_approver}</Text>
                        </View>
                    )}
                    {claim.remark && (
                        <View style={styles.claimRow}>
                            <Text style={styles.claimLabel}>Remarks:</Text>
                            <Text style={[styles.claimValue, { flex: 1 }]}>{claim.remark}</Text>
                        </View>
                    )}
                </View>

                {/* Expense Details */}
                {claim.expenses && claim.expenses.length > 0 && (
                    <View style={styles.expensesList}>
                        <Text style={styles.expensesHeader}>Expense Breakdown:</Text>
                        {claim.expenses.map((exp, idx) => (
                            <View key={idx} style={styles.expenseItem}>
                                <View style={styles.expenseItemHeader}>
                                    <Text style={styles.expenseType}>{exp.expense_type}</Text>
                                    <Text style={styles.expenseAmount}>₹{exp.amount?.toFixed(2)}</Text>
                                </View>
                                <Text style={styles.expenseDesc}>{exp.description}</Text>
                                <Text style={styles.expenseDate}>
                                    Date: {new Date(exp.expense_date).toLocaleDateString()}
                                </Text>
                                {exp.sanctioned_amount !== exp.amount && (
                                    <Text style={styles.sanctionedAmount}>
                                        Sanctioned: ₹{exp.sanctioned_amount?.toFixed(2)}
                                    </Text>
                                )}
                            </View>
                        ))}
                    </View>
                )}

                {/* Action Buttons */}
                {isPending && (
                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.approveButton]}
                            onPress={() => handleApprove(claim)}
                        >
                            <Text style={styles.actionButtonText}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.rejectButton]}
                            onPress={() => handleReject(claim)}
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
            ) : claims.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No pending expense claims</Text>
                    <Text style={styles.emptySubtext}>All claims have been processed</Text>
                </View>
            ) : (
                <>
                    <View style={styles.pendingHeader}>
                        <Text style={styles.pendingCount}>
                            {claims.length} Pending Approval{claims.length !== 1 ? 's' : ''}
                        </Text>
                    </View>
                    {claims.map(renderClaimCard)}
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
                        onPress={() => setFilterStatus('')}
                        style={[styles.filterPill, !filterStatus && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, !filterStatus && styles.filterTextActive]}>
                            All
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilterStatus('Approved')}
                        style={[styles.filterPill, filterStatus === 'Approved' && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterStatus === 'Approved' && styles.filterTextActive]}>
                            Approved
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilterStatus('Rejected')}
                        style={[styles.filterPill, filterStatus === 'Rejected' && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterStatus === 'Rejected' && styles.filterTextActive]}>
                            Rejected
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            <ScrollView
                style={styles.claimsList}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {loading ? (
                    <Loading />
                ) : claims.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No expense claims found</Text>
                    </View>
                ) : (
                    <>
                        {claims.map(renderClaimCard)}
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
                        <Text style={styles.statValue}>{statistics.total_claims || 0}</Text>
                        <Text style={styles.statLabel}>Total Claims</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={[styles.statValue, { color: colors.success }]}>
                            ₹{(statistics.total_claimed || 0).toFixed(0)}
                        </Text>
                        <Text style={styles.statLabel}>Total Claimed</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={[styles.statValue, { color: colors.primary }]}>
                            ₹{(statistics.total_sanctioned || 0).toFixed(0)}
                        </Text>
                        <Text style={styles.statLabel}>Total Sanctioned</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={[styles.statValue, { color: colors.warning }]}>
                            ₹{(statistics.total_reimbursed || 0).toFixed(0)}
                        </Text>
                        <Text style={styles.statLabel}>Total Reimbursed</Text>
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
                            {actionModal.type === 'approve' ? 'Approve' : 'Reject'} Expense Claim
                        </Text>
                        <Text style={styles.modalSubtitle}>
                            {actionModal.claim?.name}
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
                                : 'Why is this claim being rejected?'}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalCancelButton]}
                                onPress={() => setActionModal({ visible: false, type: '', claim: null, remarks: '' })}
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
    activeTab: {
        borderBottomColor: colors.primary,
    },
    tabText: {
        fontSize: 13,
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
        padding: 12,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    pendingCount: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    claimCard: {
        backgroundColor: colors.white,
        marginHorizontal: 12,
        marginTop: 10,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    claimHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    claimId: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 3,
    },
    employeeName: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.primary,
        marginBottom: 2,
    },
    department: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    statusText: {
        color: colors.white,
        fontSize: 10,
        fontWeight: '600',
    },
    claimDetails: {
        marginTop: 6,
    },
    claimRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    claimLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    claimValue: {
        fontSize: 12,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    expensesList: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    expensesHeader: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 6,
    },
    expenseItem: {
        backgroundColor: colors.cardBackground,
        padding: 10,
        borderRadius: 6,
        marginBottom: 6,
    },
    expenseItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 3,
    },
    expenseType: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.primary,
    },
    expenseAmount: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    expenseDesc: {
        fontSize: 11,
        color: colors.textSecondary,
        marginBottom: 3,
    },
    expenseDate: {
        fontSize: 10,
        color: colors.textSecondary,
    },
    sanctionedAmount: {
        fontSize: 10,
        color: colors.success,
        marginTop: 2,
    },
    actionButtons: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 8,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 10,
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
    filterContainer: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    filterPill: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
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
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    filterTextActive: {
        color: colors.white,
        fontWeight: '600',
    },
    claimsList: {
        flex: 1,
    },
    statsContainer: {
        padding: 12,
    },
    statsTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 12,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -5,
        marginBottom: 16,
    },
    statCard: {
        width: '50%',
        padding: 5,
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.primary,
        marginBottom: 3,
    },
    statLabel: {
        fontSize: 11,
        color: colors.textSecondary,
        fontWeight: '500',
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
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    statsRowLabel: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    statsRowValue: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 6,
    },
    emptySubtext: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
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
        marginBottom: 6,
    },
    modalSubtitle: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 12,
    },
    modalLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.textPrimary,
        marginBottom: 6,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        color: colors.textPrimary,
        minHeight: 90,
        marginBottom: 16,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 10,
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
        fontSize: 13,
        fontWeight: '600',
    },
    modalConfirmText: {
        color: colors.white,
        fontSize: 13,
        fontWeight: '600',
    },
    bottomPadding: {
        height: 60,
    },
});

export default ExpenseClaimApprovalScreen;