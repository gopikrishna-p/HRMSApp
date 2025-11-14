import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    RefreshControl,
    TextInput,
    Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Loading from '../../components/common/Loading';
import apiService from '../../services/api.service';

const ExpenseClaimScreen = ({ navigation }) => {
    // State management
    const [activeTab, setActiveTab] = useState('submit'); // submit, history
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [employeeId, setEmployeeId] = useState('');

    // Submit form state
    const [expenses, setExpenses] = useState([{
        expense_type: '',
        amount: '',
        description: '',
        expense_date: new Date()
    }]);
    const [remark, setRemark] = useState('');
    const [expenseTypes, setExpenseTypes] = useState([]);
    const [showDatePicker, setShowDatePicker] = useState({ show: false, index: -1 });

    // History state
    const [claims, setClaims] = useState([]);
    const [filterStatus, setFilterStatus] = useState(''); // '', Draft, Approved, Rejected
    const [statusSummary, setStatusSummary] = useState({});
    const [totalClaimed, setTotalClaimed] = useState(0);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (activeTab === 'history' && employeeId) {
            loadClaims();
        }
    }, [activeTab, filterStatus, employeeId]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Get employee info
            const empResponse = await apiService.getCurrentEmployee();
            if (empResponse.success && empResponse.data?.message) {
                const empId = empResponse.data.message.name;
                setEmployeeId(empId);
            }

            // Get expense types
            const typesResponse = await apiService.getExpenseClaimTypes();
            if (typesResponse.success && typesResponse.data?.message) {
                setExpenseTypes(typesResponse.data.message);
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
            Alert.alert('Error', 'Failed to load expense types');
        } finally {
            setLoading(false);
        }
    };

    const loadClaims = async () => {
        if (!employeeId) return;
        
        setLoading(true);
        try {
            const filters = {
                employee: employeeId,
                approval_status: filterStatus || null,
                limit: 100
            };

            const response = await apiService.getEmployeeExpenseClaims(filters);
            if (response.success && response.data?.message) {
                const data = response.data.message;
                setClaims(data.claims || []);
                setStatusSummary(data.status_summary || {});
                setTotalClaimed(data.total_claimed_amount || 0);
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
        if (activeTab === 'history') {
            await loadClaims();
        } else {
            await loadInitialData();
        }
        setRefreshing(false);
    }, [activeTab, employeeId]);

    const addExpenseItem = () => {
        setExpenses([...expenses, {
            expense_type: '',
            amount: '',
            description: '',
            expense_date: new Date()
        }]);
    };

    const removeExpenseItem = (index) => {
        if (expenses.length > 1) {
            const newExpenses = expenses.filter((_, i) => i !== index);
            setExpenses(newExpenses);
        }
    };

    const updateExpenseItem = (index, field, value) => {
        const newExpenses = [...expenses];
        newExpenses[index][field] = value;
        
        // Note: sanctioned_amount is NOT set here - it will be set by backend
        // The admin/approver will modify it during approval process
        
        setExpenses(newExpenses);
    };

    const handleDateChange = (event, selectedDate, index) => {
        setShowDatePicker({ show: false, index: -1 });
        if (selectedDate) {
            updateExpenseItem(index, 'expense_date', selectedDate);
        }
    };

    const validateForm = () => {
        if (!employeeId) {
            Alert.alert('Error', 'Employee information not loaded');
            return false;
        }

        // Check if at least one expense exists
        if (expenses.length === 0) {
            Alert.alert('Error', 'Add at least one expense item');
            return false;
        }

        // Validate each expense
        for (let i = 0; i < expenses.length; i++) {
            const exp = expenses[i];
            
            if (!exp.expense_type) {
                Alert.alert('Error', `Expense type is required for item ${i + 1}`);
                return false;
            }
            
            if (!exp.amount || parseFloat(exp.amount) <= 0) {
                Alert.alert('Error', `Valid amount is required for item ${i + 1}`);
                return false;
            }
            
            if (!exp.description || !exp.description.trim()) {
                Alert.alert('Error', `Description is required for item ${i + 1}`);
                return false;
            }
        }

        return true;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        setLoading(true);
        try {
            // Prepare expense items
            // Note: sanctioned_amount should NOT be sent by employee
            // It will be set by backend and modified by admin/approver during approval
            const expenseItems = expenses.map(exp => ({
                expense_type: exp.expense_type,
                amount: parseFloat(exp.amount),
                description: exp.description.trim(),
                expense_date: exp.expense_date.toISOString().split('T')[0]
                // sanctioned_amount is handled by backend - defaults to amount, then admin can modify
            }));

            console.log('Submitting expense claim:', {
                employeeId,
                expenseItems,
                remark: remark.trim()
            });

            const response = await apiService.submitExpenseClaim(
                employeeId,
                expenseItems,
                { remark: remark.trim() }
            );

            console.log('Expense claim response:', response);

            // Check if API returned success
            if (!response.success) {
                Alert.alert('Error', response.message || 'Failed to submit expense claim');
                return;
            }

            // Check if we have valid data
            if (response.data?.message) {
                const data = response.data.message;
                Alert.alert(
                    'Success',
                    `Expense claim submitted successfully!\nClaim ID: ${data.claim_id || 'N/A'}\nTotal Amount: ₹${data.total_claimed_amount || calculateTotal().toFixed(2)}`,
                    [{ text: 'OK', onPress: () => {
                        // Reset form
                        setExpenses([{
                            expense_type: '',
                            amount: '',
                            description: '',
                            expense_date: new Date()
                        }]);
                        setRemark('');
                        setActiveTab('history');
                    }}]
                );
            } else {
                Alert.alert('Success', 'Expense claim submitted successfully', [
                    { text: 'OK', onPress: () => {
                        setExpenses([{
                            expense_type: '',
                            amount: '',
                            description: '',
                            expense_date: new Date()
                        }]);
                        setRemark('');
                        setActiveTab('history');
                    }}
                ]);
            }
        } catch (error) {
            console.error('Submit expense claim error:', error);
            Alert.alert('Error', error.message || 'Failed to submit expense claim');
        } finally {
            setLoading(false);
        }
    };

    const calculateTotal = () => {
        return expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    };

    const renderSubmitTab = () => (
        <ScrollView
            style={styles.tabContent}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        >
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Expense Items</Text>
                
                {expenses.map((expense, index) => (
                    <View key={index} style={styles.expenseCard}>
                        <View style={styles.expenseHeader}>
                            <Text style={styles.expenseNumber}>Item {index + 1}</Text>
                            {expenses.length > 1 && (
                                <TouchableOpacity
                                    onPress={() => removeExpenseItem(index)}
                                    style={styles.removeButton}
                                >
                                    <Text style={styles.removeButtonText}>Remove</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <Text style={styles.label}>Expense Type *</Text>
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={expense.expense_type}
                                onValueChange={(value) => updateExpenseItem(index, 'expense_type', value)}
                                style={styles.picker}
                            >
                                <Picker.Item label="Select type..." value="" />
                                {expenseTypes.map((type) => (
                                    <Picker.Item
                                        key={type.name}
                                        label={type.name}
                                        value={type.name}
                                    />
                                ))}
                            </Picker>
                        </View>

                        <Text style={styles.label}>Amount (₹) *</Text>
                        <Input
                            value={expense.amount}
                            onChangeText={(text) => updateExpenseItem(index, 'amount', text)}
                            placeholder="Enter amount"
                            keyboardType="decimal-pad"
                        />

                        <Text style={styles.label}>Description *</Text>
                        <Input
                            value={expense.description}
                            onChangeText={(text) => updateExpenseItem(index, 'description', text)}
                            placeholder="Describe the expense"
                            multiline
                            numberOfLines={3}
                        />

                        <Text style={styles.label}>Expense Date *</Text>
                        <TouchableOpacity
                            onPress={() => setShowDatePicker({ show: true, index })}
                            style={styles.dateButton}
                        >
                            <Text style={styles.dateText}>
                                {expense.expense_date.toLocaleDateString()}
                            </Text>
                        </TouchableOpacity>

                        {showDatePicker.show && showDatePicker.index === index && (
                            <DateTimePicker
                                value={expense.expense_date}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={(event, date) => handleDateChange(event, date, index)}
                                maximumDate={new Date()}
                            />
                        )}
                    </View>
                ))}

                <TouchableOpacity
                    onPress={addExpenseItem}
                    style={styles.addButton}
                >
                    <Text style={styles.addButtonText}>+ Add Another Expense</Text>
                </TouchableOpacity>

                <View style={styles.totalContainer}>
                    <Text style={styles.totalLabel}>Total Amount:</Text>
                    <Text style={styles.totalAmount}>₹{calculateTotal().toFixed(2)}</Text>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.label}>Overall Remarks (Optional)</Text>
                <Input
                    value={remark}
                    onChangeText={setRemark}
                    placeholder="Any additional remarks..."
                    multiline
                    numberOfLines={3}
                />
            </View>

            <Button
                title="Submit Expense Claim"
                onPress={handleSubmit}
                disabled={loading || expenses.length === 0}
            />

            <View style={styles.bottomPadding} />
        </ScrollView>
    );

    const renderClaimItem = (claim) => {
        const statusColor = 
            claim.approval_status === 'Approved' ? colors.success :
            claim.approval_status === 'Rejected' ? colors.error :
            colors.warning;

        return (
            <View key={claim.name} style={styles.claimCard}>
                <View style={styles.claimHeader}>
                    <Text style={styles.claimId}>{claim.name}</Text>
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
                    {claim.remark && (
                        <View style={styles.claimRow}>
                            <Text style={styles.claimLabel}>Remarks:</Text>
                            <Text style={[styles.claimValue, { flex: 1 }]}>{claim.remark}</Text>
                        </View>
                    )}
                </View>

                {claim.expenses && claim.expenses.length > 0 && (
                    <View style={styles.expensesList}>
                        <Text style={styles.expensesHeader}>Expense Details:</Text>
                        {claim.expenses.map((exp, idx) => (
                            <View key={idx} style={styles.expenseItem}>
                                <Text style={styles.expenseType}>{exp.expense_type}</Text>
                                <Text style={styles.expenseDesc}>{exp.description}</Text>
                                <View style={styles.expenseAmountRow}>
                                    <Text style={styles.expenseAmount}>₹{exp.amount?.toFixed(2)}</Text>
                                    <Text style={styles.expenseDate}>
                                        {new Date(exp.expense_date).toLocaleDateString()}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        );
    };

    const renderHistoryTab = () => (
        <View style={styles.tabContent}>
            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{statusSummary.Draft || 0}</Text>
                    <Text style={styles.summaryLabel}>Pending</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>
                        {statusSummary.Approved || 0}
                    </Text>
                    <Text style={styles.summaryLabel}>Approved</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={[styles.summaryValue, { color: colors.error }]}>
                        {statusSummary.Rejected || 0}
                    </Text>
                    <Text style={styles.summaryLabel}>Rejected</Text>
                </View>
            </View>

            <View style={styles.totalClaimedContainer}>
                <Text style={styles.totalClaimedLabel}>Total Claimed:</Text>
                <Text style={styles.totalClaimedAmount}>₹{totalClaimed.toFixed(2)}</Text>
            </View>

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
                        onPress={() => setFilterStatus('Draft')}
                        style={[styles.filterPill, filterStatus === 'Draft' && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterStatus === 'Draft' && styles.filterTextActive]}>
                            Pending
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

            {/* Claims List */}
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
                        <Text style={styles.emptySubtext}>
                            {filterStatus ? `No ${filterStatus.toLowerCase()} claims` : 'Submit your first expense claim'}
                        </Text>
                    </View>
                ) : (
                    claims.map(renderClaimItem)
                )}
                <View style={styles.bottomPadding} />
            </ScrollView>
        </View>
    );

    if (loading && !refreshing && claims.length === 0) {
        return <Loading />;
    }

    return (
        <View style={styles.container}>
            {/* Tab Navigation */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'submit' && styles.activeTab]}
                    onPress={() => setActiveTab('submit')}
                >
                    <Text style={[styles.tabText, activeTab === 'submit' && styles.activeTabText]}>
                        Submit Claim
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'history' && styles.activeTab]}
                    onPress={() => setActiveTab('history')}
                >
                    <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
                        My Claims
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Tab Content */}
            {activeTab === 'submit' ? renderSubmitTab() : renderHistoryTab()}
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
    section: {
        padding: 16,
        backgroundColor: colors.white,
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 16,
    },
    expenseCard: {
        backgroundColor: colors.cardBackground,
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    expenseHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    expenseNumber: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    removeButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: colors.error,
        borderRadius: 4,
    },
    removeButtonText: {
        color: colors.white,
        fontSize: 14,
        fontWeight: '500',
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textPrimary,
        marginBottom: 8,
        marginTop: 12,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: colors.white,
        marginBottom: 8,
    },
    picker: {
        height: 50,
    },
    dateButton: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        backgroundColor: colors.white,
    },
    dateText: {
        fontSize: 16,
        color: colors.textPrimary,
    },
    addButton: {
        alignItems: 'center',
        paddingVertical: 12,
        backgroundColor: colors.cardBackground,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.primary,
        borderStyle: 'dashed',
        marginTop: 8,
    },
    addButtonText: {
        color: colors.primary,
        fontSize: 16,
        fontWeight: '500',
    },
    totalContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    totalLabel: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    totalAmount: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.primary,
    },
    summaryContainer: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: colors.white,
        marginBottom: 12,
    },
    summaryCard: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
    },
    summaryValue: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.warning,
        marginBottom: 4,
    },
    summaryLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    totalClaimedContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: colors.white,
        marginBottom: 12,
    },
    totalClaimedLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    totalClaimedAmount: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.success,
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
    claimsList: {
        flex: 1,
        backgroundColor: colors.background,
    },
    claimCard: {
        backgroundColor: colors.white,
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    claimHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    claimId: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        flex: 1,
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
    claimDetails: {
        marginTop: 8,
    },
    claimRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    claimLabel: {
        fontSize: 14,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    claimValue: {
        fontSize: 14,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    expensesList: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    expensesHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    expenseItem: {
        backgroundColor: colors.cardBackground,
        padding: 12,
        borderRadius: 6,
        marginBottom: 8,
    },
    expenseType: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
        marginBottom: 4,
    },
    expenseDesc: {
        fontSize: 13,
        color: colors.textSecondary,
        marginBottom: 6,
    },
    expenseAmountRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    expenseAmount: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    expenseDate: {
        fontSize: 12,
        color: colors.textSecondary,
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
    bottomPadding: {
        height: 80,
    },
});

export default ExpenseClaimScreen;