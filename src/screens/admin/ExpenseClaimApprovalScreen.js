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
import { Picker } from '@react-native-picker/picker';
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
    
    // Payable accounts
    const [payableAccounts, setPayableAccounts] = useState([]);
    const [defaultPayableAccount, setDefaultPayableAccount] = useState('');

    // Action modal state
    const [actionModal, setActionModal] = useState({
        visible: false,
        type: '', // 'approve' or 'reject'
        claim: null,
        remarks: '',
        sanctionedAmounts: {}, // Store custom sanctioned amounts: { expenseIndex: amount }
        selectedPayableAccount: '' // Store selected payable account
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadClaims();
    }, [activeTab, filterStatus]);
    
    const loadInitialData = async () => {
        await loadPayableAccounts();
    };
    
    const loadPayableAccounts = async () => {
        try {
            console.log('Loading payable accounts...');
            const response = await apiService.getPayableAccounts();
            console.log('Payable accounts response:', JSON.stringify(response, null, 2));
            
            if (response.success && response.data?.message) {
                const data = response.data.message;
                console.log('Payable accounts data:', data);
                setPayableAccounts(data.accounts || []);
                setDefaultPayableAccount(data.default_account || '');
                console.log('Set payable accounts:', data.accounts?.length || 0, 'accounts');
            } else {
                console.error('Failed to load payable accounts:', response);
            }
        } catch (error) {
            console.error('Error loading payable accounts:', error);
        }
    };

    const loadClaims = async () => {
        setLoading(true);
        try {
            let filters = { limit: 500 };
            
            if (activeTab === 'pending') {
                // Get only pending (Draft) expense claims
                filters.approval_status = 'Draft';
            } else if (activeTab === 'history') {
                // Load all non-draft for history (Approved, Rejected, etc)
            }

            console.log('📋 Loading expense claims with filters:', filters);
            const response = await apiService.getAdminExpenseClaims(filters);
            console.log('📋 Response from getAdminExpenseClaims:', response);
            
            if (response.success && response.data?.message) {
                const data = response.data.message;
                console.log('📋 Claims loaded:', data.claims?.length || 0, 'claims, stats:', data.statistics);
                setClaims(data.claims || []);
                setStatistics(data.statistics || {});
            } else {
                console.error('❌ Failed to load claims:', response);
                setClaims([]);
                setStatistics({});
            }
        } catch (error) {
            console.error('❌ Error loading claims:', error);
            setClaims([]);
            setStatistics({});
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
        // Initialize sanctioned amounts with claimed amounts (default) - ensure proper number formatting
        const initialSanctionedAmounts = {};
        if (claim.expenses && claim.expenses.length > 0) {
            claim.expenses.forEach((exp, idx) => {
                const amount = exp.sanctioned_amount || exp.amount;
                initialSanctionedAmounts[idx] = typeof amount === 'number' ? amount.toFixed(2) : String(amount || '0.00');
            });
        }
        
        // Pre-select payable account
        const selectedAccount = claim.payable_account || defaultPayableAccount;
        
        setActionModal({
            visible: true,
            type: 'approve',
            claim,
            remarks: '',
            sanctionedAmounts: initialSanctionedAmounts,
            selectedPayableAccount: selectedAccount
        });
    };

    const handleReject = (claim) => {
        setActionModal({
            visible: true,
            type: 'reject',
            claim,
            remarks: '',
            sanctionedAmounts: {},
            selectedPayableAccount: ''
        });
    };

    const confirmAction = async () => {
        const { type, claim, remarks, sanctionedAmounts, selectedPayableAccount } = actionModal;
        
        if (type === 'reject' && !remarks.trim()) {
            Alert.alert('Error', 'Rejection reason is required');
            return;
        }

        // Validate sanctioned amounts and payable account for approval
        if (type === 'approve') {
            // Validate payable account only if accounts were loaded
            if (payableAccounts.length > 0 && !selectedPayableAccount) {
                Alert.alert('Error', 'Please select a Payable Account');
                return;
            }
            
            // Validate sanctioned amounts
            for (const [idx, amount] of Object.entries(sanctionedAmounts)) {
                const numAmount = parseFloat(amount);
                if (isNaN(numAmount) || numAmount <= 0) {
                    Alert.alert('Error', `Invalid sanctioned amount for expense item ${parseInt(idx) + 1}`);
                    return;
                }
                const claimedAmount = claim.expenses[idx]?.amount || 0;
                if (numAmount > claimedAmount) {
                    Alert.alert('Error', `Sanctioned amount cannot exceed claimed amount for expense item ${parseInt(idx) + 1}`);
                    return;
                }
            }
        }

        setLoading(true);
        try {
            let response;
            
            if (type === 'approve') {
                // Send sanctioned amounts and payable account with approval
                response = await apiService.approveExpenseClaim(
                    claim.name, 
                    remarks,
                    sanctionedAmounts,
                    selectedPayableAccount
                );
            } else {
                response = await apiService.rejectExpenseClaim(claim.name, remarks);
            }

            if (response.success) {
                let message;
                if (type === 'approve') {
                    // Calculate total from sanctionedAmounts
                    const totalSanctioned = Object.values(sanctionedAmounts)
                        .reduce((sum, amt) => sum + parseFloat(amt || 0), 0);
                    
                    message = `Expense claim approved successfully\nTotal Sanctioned: ₹${totalSanctioned.toFixed(2)}`;
                } else {
                    message = `Expense claim ${type}d successfully`;
                }
                    
                Alert.alert(
                    'Success',
                    message,
                    [{ text: 'OK', onPress: () => {
                        setActionModal({ visible: false, type: '', claim: null, remarks: '', sanctionedAmounts: {}, selectedPayableAccount: '' });
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
                    <ScrollView 
                        contentContainerStyle={styles.modalScrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>
                                {actionModal.type === 'approve' ? 'Approve' : 'Reject'} Expense Claim
                            </Text>
                            <Text style={styles.modalSubtitle}>
                                {actionModal.claim?.name}
                            </Text>
                            <Text style={styles.modalEmployee}>
                                {actionModal.claim?.employee_name}
                            </Text>

                            {/* Payable Account Selection (only for approve) */}
                            {actionModal.type === 'approve' && (
                                <View style={styles.payableAccountSection}>
                                    <Text style={styles.sectionLabel}>
                                        Payable Account {payableAccounts.length > 0 ? '*' : '(Optional)'}
                                    </Text>
                                    {payableAccounts.length === 0 ? (
                                        <View style={styles.noAccountsWarning}>
                                            <Text style={styles.warningText}>
                                                ⚠️ No payable accounts configured. Please configure Payable Accounts in your Chart of Accounts or set a default expense claim payable account in Company settings.
                                            </Text>
                                        </View>
                                    ) : (
                                        <>
                                            <View style={styles.pickerContainer}>
                                                <Picker
                                                    selectedValue={actionModal.selectedPayableAccount}
                                                    onValueChange={(value) => 
                                                        setActionModal({ ...actionModal, selectedPayableAccount: value })
                                                    }
                                                    style={styles.picker}
                                                >
                                                    <Picker.Item label="Select Payable Account..." value="" />
                                                    {payableAccounts.map((account) => (
                                                        <Picker.Item
                                                            key={account.name}
                                                            label={`${account.account_name}${account.account_number ? ` (${account.account_number})` : ''}`}
                                                            value={account.name}
                                                        />
                                                    ))}
                                                </Picker>
                                            </View>
                                            {defaultPayableAccount === actionModal.selectedPayableAccount && (
                                                <Text style={styles.defaultAccountHint}>Default account</Text>
                                            )}
                                        </>
                                    )}
                                </View>
                            )}

                            {/* Sanctioned Amounts Editor (only for approve) */}
                            {actionModal.type === 'approve' && actionModal.claim?.expenses && (
                                <View style={styles.sanctionSection}>
                                    <Text style={styles.sanctionTitle}>Sanctioned Amounts</Text>
                                    <Text style={styles.sanctionSubtitle}>
                                        You can approve full amount or enter custom sanctioned amounts
                                    </Text>
                                    
                                    {actionModal.claim.expenses.map((expense, idx) => {
                                        const claimedAmount = expense.amount || 0;
                                        const currentSanctioned = actionModal.sanctionedAmounts[idx] !== undefined 
                                            ? actionModal.sanctionedAmounts[idx] 
                                            : claimedAmount;
                                        
                                        return (
                                            <View key={idx} style={styles.sanctionItem}>
                                                <View style={styles.sanctionItemHeader}>
                                                    <Text style={styles.sanctionExpenseType}>
                                                        {idx + 1}. {expense.expense_type}
                                                    </Text>
                                                    <Text style={styles.sanctionClaimedAmount}>
                                                        Claimed: ₹{claimedAmount.toFixed(2)}
                                                    </Text>
                                                </View>
                                                
                                                <Text style={styles.sanctionDescription} numberOfLines={2}>
                                                    {expense.description}
                                                </Text>
                                                
                                                <View style={styles.sanctionInputRow}>
                                                    <Text style={styles.sanctionInputLabel}>Sanctioned Amount:</Text>
                                                    <TextInput
                                                        style={styles.sanctionInput}
                                                        value={String(currentSanctioned)}
                                                        onChangeText={(text) => {
                                                            // Allow only numbers and one decimal point
                                                            const sanitized = text.replace(/[^0-9.]/g, '');
                                                            const parts = sanitized.split('.');
                                                            let finalValue = parts[0];
                                                            
                                                            // Allow only one decimal point with max 2 decimal places
                                                            if (parts.length > 1) {
                                                                finalValue = parts[0] + '.' + parts.slice(1).join('').substring(0, 2);
                                                            }
                                                            
                                                            const newAmounts = { ...actionModal.sanctionedAmounts };
                                                            newAmounts[idx] = finalValue;
                                                            setActionModal({ ...actionModal, sanctionedAmounts: newAmounts });
                                                        }}
                                                        keyboardType="decimal-pad"
                                                        placeholder="0.00"
                                                        returnKeyType="done"
                                                    />
                                                    <TouchableOpacity
                                                        style={styles.fullAmountButton}
                                                        onPress={() => {
                                                            const newAmounts = { ...actionModal.sanctionedAmounts };
                                                            newAmounts[idx] = claimedAmount.toFixed(2);
                                                            setActionModal({ ...actionModal, sanctionedAmounts: newAmounts });
                                                        }}
                                                    >
                                                        <Text style={styles.fullAmountButtonText}>Full</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        );
                                    })}
                                    
                                    <View style={styles.sanctionTotalRow}>
                                        <Text style={styles.sanctionTotalLabel}>Total Sanctioned:</Text>
                                        <Text style={styles.sanctionTotalAmount}>
                                            ₹{Object.values(actionModal.sanctionedAmounts)
                                                .reduce((sum, amt) => sum + parseFloat(amt || 0), 0)
                                                .toFixed(2)}
                                        </Text>
                                    </View>
                                </View>
                            )}

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
                                numberOfLines={3}
                                textAlignVertical="top"
                            />

                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalCancelButton]}
                                    onPress={() => setActionModal({ visible: false, type: '', claim: null, remarks: '', sanctionedAmounts: {} })}
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
                    </ScrollView>
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
        padding: 16,
    },
    modalScrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
    },
    modalContent: {
        backgroundColor: colors.white,
        borderRadius: 14,
        padding: 16,
        width: '100%',
        maxWidth: 500,
        alignSelf: 'center',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    modalSubtitle: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 2,
    },
    modalEmployee: {
        fontSize: 13,
        color: colors.primary,
        fontWeight: '500',
        marginBottom: 16,
    },
    payableAccountSection: {
        marginBottom: 16,
    },
    sectionLabel: {
        fontSize: 13,
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
    defaultAccountHint: {
        fontSize: 11,
        color: colors.success,
        marginTop: 4,
        fontStyle: 'italic',
    },
    noAccountsWarning: {
        backgroundColor: '#FFF3CD',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#FFE69C',
    },
    warningText: {
        fontSize: 12,
        color: '#856404',
        lineHeight: 18,
    },
    sanctionSection: {
        backgroundColor: colors.cardBackground,
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    sanctionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    sanctionSubtitle: {
        fontSize: 11,
        color: colors.textSecondary,
        marginBottom: 12,
        lineHeight: 16,
    },
    sanctionItem: {
        backgroundColor: colors.white,
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
    },
    sanctionItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 6,
    },
    sanctionExpenseType: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
        flex: 1,
        marginRight: 8,
    },
    sanctionClaimedAmount: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.primary,
    },
    sanctionDescription: {
        fontSize: 11,
        color: colors.textSecondary,
        marginBottom: 8,
    },
    sanctionInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sanctionInputLabel: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.textPrimary,
    },
    sanctionInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        fontSize: 12,
        color: colors.textPrimary,
        backgroundColor: colors.white,
    },
    fullAmountButton: {
        backgroundColor: colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    fullAmountButtonText: {
        color: colors.white,
        fontSize: 11,
        fontWeight: '600',
    },
    sanctionTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 10,
        marginTop: 4,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    sanctionTotalLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    sanctionTotalAmount: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.success,
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
        minHeight: 70,
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