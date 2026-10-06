// src/screens/admin/ExpenseClaimApprovalScreen.js
//
// Expense claims for admins: review pending claims (approve with per-line sanctioned amounts
// and a payable account, or reject with a reason), browse past claims, see totals, and file a
// claim on behalf of an employee.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import { formatLocalDate } from '../../utils/dateFormat';
import { loadAllEmployees } from '../../utils/employeeData';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    StatStrip,
    StatusText,
    Tag,
    Sheet,
    Button,
    TextField,
    SelectField,
    SearchField,
    EmptyState,
    Loading,
    Notice,
    Icon,
    color,
    space,
    radius,
    type,
    formatShortDate,
} from '../../components/ds';

// ------------------------------------------------------------------ helpers
// Indian digit grouping: 1234567 -> 12,34,567
const groupIndian = (digits) => {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
};
// ₹1,23,456.50; whole amounts drop the decimals unless `decimals` is given
const formatINR = (value, decimals) => {
    const n = Number(value) || 0;
    const places = decimals ?? (Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2);
    const [whole, fraction] = Math.abs(n).toFixed(places).split('.');
    return `${n < 0 ? '-' : ''}₹${groupIndian(whole)}${fraction ? `.${fraction}` : ''}`;
};

// 'YYYY-MM-DD' as a local date (no timezone shift)
const toDate = (value) => {
    if (value instanceof Date) {
        return value;
    }
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};
const dateLabel = (value) => {
    const d = toDate(value);
    return d ? formatShortDate(d) : '–';
};

// ERPNext keeps undecided claims as approval_status "Draft"; admins read that as pending.
const statusLabel = (status) => (status === 'Draft' ? 'Pending' : status);

// "Travel" or "Travel +2" for a claim with several expense types
const typesLabel = (claim) => {
    const types = [...new Set((claim.expenses || []).map((e) => e.expense_type).filter(Boolean))];
    if (types.length === 0) {
        return claim.total_expenses ? `${claim.total_expenses} items` : '';
    }
    return types.length === 1 ? types[0] : `${types[0]} +${types.length - 1}`;
};

// approved claims show what was sanctioned, everything else what was claimed
const listAmount = (claim) => (claim.approval_status === 'Approved' ? claim.total_sanctioned_amount : claim.total_claimed_amount);

const accountLabel = (account) => `${account.account_name}${account.account_number ? ` (${account.account_number})` : ''}`;

const HISTORY_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
];

const AmountCell = ({ amount, status }) => (
    <View style={styles.amountCell}>
        <Text style={styles.amountText} numberOfLines={1}>{formatINR(amount)}</Text>
        {status ? <StatusText label={status} size={12} /> : null}
    </View>
);

const Check = ({ on }) => (on ? <Icon name="check" size={18} color={color.accent} /> : null);

const ExpenseClaimApprovalScreen = ({ navigation, route }) => {
    const [activeTab, setActiveTab] = useState(route?.params?.tab || 'pending'); // pending, apply, history, statistics
    const [loading, setLoading] = useState(true); // claims are fetched on mount
    const [refreshing, setRefreshing] = useState(false);

    // Data states
    const [claims, setClaims] = useState([]);
    const [statistics, setStatistics] = useState({});
    const [filterStatus, setFilterStatus] = useState(''); // History filter: '' (all), 'Approved' or 'Rejected'
    // Phase 3.x deep-link from EmployeeManagement Quick Actions (B5).
    const [preselectFilter, setPreselectFilter] = useState(route?.params?.preselectEmployee || '');
    const displayedClaims = preselectFilter
        ? claims.filter((c) => c.employee === preselectFilter)
        : claims;

    // Payable accounts
    const [payableAccounts, setPayableAccounts] = useState([]);
    const [defaultPayableAccount, setDefaultPayableAccount] = useState('');

    // Apply tab states (for admin creating expense claims for employees)
    const [employees, setEmployees] = useState([]);
    const [expenseTypes, setExpenseTypes] = useState([]);
    const [applyEmployee, setApplyEmployee] = useState('');
    const [applyExpenses, setApplyExpenses] = useState([{
        expense_type: '',
        amount: '',
        description: '',
        expense_date: new Date()
    }]);
    const [applyRemark, setApplyRemark] = useState('');
    const [showDatePicker, setShowDatePicker] = useState({ show: false, index: -1 });

    // Action modal state
    const [actionModal, setActionModal] = useState({
        visible: false,
        type: '', // 'approve' or 'reject'
        claim: null,
        remarks: '',
        sanctionedAmounts: {}, // Store custom sanctioned amounts: { expenseIndex: amount }
        selectedPayableAccount: '' // Store selected payable account
    });

    // Presentation state: claim open in the detail sheet, inline sheet error, pickers
    const [selected, setSelected] = useState(null);
    const [sheetError, setSheetError] = useState('');
    const [accountsOpen, setAccountsOpen] = useState(false);
    const [picker, setPicker] = useState(null); // { kind: 'employee' | 'type', index, open }
    const [pickerQuery, setPickerQuery] = useState('');
    const returnTab = useRef('pending');
    const lastSheet = useRef({ mode: null, claim: null }); // keeps the sheet content while it slides out

    useEffect(() => {
        loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reference data is loaded once on mount
    }, []);

    useEffect(() => {
        if (route?.params?.preselectEmployee) {
            setPreselectFilter(route.params.preselectEmployee);
        }
        if (route?.params?.tab) {
            setActiveTab(route.params.tab);
        }
    }, [route?.params?.preselectEmployee, route?.params?.tab]);

    useEffect(() => {
        loadClaims();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload whenever the tab or the status filter changes
    }, [activeTab, filterStatus]);

    const loadInitialData = async () => {
        await Promise.all([
            loadPayableAccounts(),
            loadEmployees(),
            loadExpenseTypes()
        ]);
    };

    const loadEmployees = async () => {
        // Shared helper — see src/utils/employeeData.js.
        setEmployees(await loadAllEmployees());
    };

    const loadExpenseTypes = async () => {
        try {
            const response = await apiService.getExpenseClaimTypes();
            if (response.success && response.data?.message) {
                setExpenseTypes(response.data.message);
            } else {
                setExpenseTypes([]);
            }
        } catch (error) {
            console.error('Load expense types error:', error);
            setExpenseTypes([]);
        }
    };

    const loadPayableAccounts = async () => {
        try {
            const response = await apiService.getPayableAccounts();
            if (response.success && response.data?.message) {
                const data = response.data.message;
                setPayableAccounts(data.accounts || []);
                setDefaultPayableAccount(data.default_account || '');
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
            } else if (activeTab === 'history' && filterStatus && filterStatus !== 'all' && filterStatus !== 'Draft') {
                // History's Approved / Rejected filter
                filters.approval_status = filterStatus;
            }

            const response = await apiService.getAdminExpenseClaims(filters);

            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, { claims: [], statistics: {} });
                setClaims(data.claims || []);
                setStatistics(data.statistics || {});
            } else {
                console.error('Failed to load expense claims:', response);
                setClaims([]);
                setStatistics({});
            }
        } catch (error) {
            console.error('Error loading expense claims:', error);
            setClaims([]);
            setStatistics({});
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadClaims();
        setRefreshing(false);
    };

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

    // Apply Tab Helper Functions
    const addExpenseItem = () => {
        setApplyExpenses([...applyExpenses, {
            expense_type: '',
            amount: '',
            description: '',
            expense_date: new Date()
        }]);
    };

    const removeExpenseItem = (index) => {
        if (applyExpenses.length > 1) {
            const newExpenses = applyExpenses.filter((_, i) => i !== index);
            setApplyExpenses(newExpenses);
        }
    };

    const updateExpenseItem = (index, field, value) => {
        const newExpenses = [...applyExpenses];
        newExpenses[index][field] = value;
        setApplyExpenses(newExpenses);
    };

    const handleDateChange = (event, selectedDate, index) => {
        setShowDatePicker({ show: false, index: -1 });
        if (selectedDate) {
            updateExpenseItem(index, 'expense_date', selectedDate);
        }
    };

    const calculateApplyTotal = () => {
        return applyExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    };

    const validateApplyForm = () => {
        if (!applyEmployee) {
            showToast({ type: 'error', text1: 'Select an employee' });
            return false;
        }

        if (applyExpenses.length === 0) {
            showToast({ type: 'error', text1: 'Add at least one expense' });
            return false;
        }

        for (let i = 0; i < applyExpenses.length; i++) {
            const exp = applyExpenses[i];

            if (!exp.expense_type) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: select a type` });
                return false;
            }

            if (!exp.amount || parseFloat(exp.amount) <= 0) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: enter an amount above zero` });
                return false;
            }

            if (!exp.description || !exp.description.trim()) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: add a description` });
                return false;
            }
        }

        return true;
    };

    const handleApplySubmit = async () => {
        if (!validateApplyForm()) {
            return;
        }

        setLoading(true);
        try {
            const expenseItems = applyExpenses.map(exp => ({
                expense_type: exp.expense_type,
                amount: parseFloat(exp.amount),
                description: exp.description.trim(),
                expense_date: formatLocalDate(exp.expense_date)
            }));

            const response = await apiService.submitExpenseClaim(
                applyEmployee,
                expenseItems,
                { remark: applyRemark.trim() }
            );

            if (response.success && response.data?.message) {
                const data = response.data.message;
                showToast({
                    type: 'success',
                    text1: 'Claim created',
                    text2: `${data.claim_id || 'N/A'}  ·  ${formatINR(data.total_claimed_amount || calculateApplyTotal())}`,
                });
                // Reset form
                setApplyEmployee('');
                setApplyExpenses([{
                    expense_type: '',
                    amount: '',
                    description: '',
                    expense_date: new Date()
                }]);
                setApplyRemark('');
                setActiveTab('pending'); // the tab effect reloads the pending list
            } else {
                showToast({ type: 'error', text1: 'Claim not created', text2: response.message || 'Failed to create expense claim' });
            }
        } catch (error) {
            console.error('Submit expense claim error:', error);
            showToast({ type: 'error', text1: 'Claim not created', text2: error.message || 'Failed to create expense claim' });
        } finally {
            setLoading(false);
        }
    };

    const confirmAction = async () => {
        const { type: action, claim, remarks, sanctionedAmounts, selectedPayableAccount } = actionModal;
        setSheetError('');

        if (action === 'reject' && !remarks.trim()) {
            setSheetError('Add a reason for rejecting this claim.');
            return;
        }

        // Validate sanctioned amounts and payable account for approval
        if (action === 'approve') {
            // Validate payable account only if accounts were loaded
            if (payableAccounts.length > 0 && !selectedPayableAccount) {
                setSheetError('Select a payable account.');
                return;
            }

            // Validate sanctioned amounts
            for (const [idx, amount] of Object.entries(sanctionedAmounts)) {
                const numAmount = parseFloat(amount);
                const line = `Line ${parseInt(idx, 10) + 1}${claim.expenses[idx]?.expense_type ? ` (${claim.expenses[idx].expense_type})` : ''}`;
                if (isNaN(numAmount) || numAmount <= 0) {
                    setSheetError(`${line}: enter a sanctioned amount above zero.`);
                    return;
                }
                const claimedAmount = claim.expenses[idx]?.amount || 0;
                if (numAmount > claimedAmount) {
                    setSheetError(`${line}: sanctioned amount is more than claimed.`);
                    return;
                }
            }
        }

        let done = null;
        setLoading(true);
        try {
            let response;

            if (action === 'approve') {
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
                if (action === 'approve') {
                    // Calculate total from sanctionedAmounts
                    const totalSanctioned = Object.values(sanctionedAmounts)
                        .reduce((sum, amt) => sum + parseFloat(amt || 0), 0);

                    done = { text1: 'Claim approved', text2: `${claim.employee_name}  ·  ${formatINR(totalSanctioned)} sanctioned` };
                } else {
                    done = { text1: 'Claim rejected', text2: claim.employee_name };
                }
            } else {
                setSheetError(getApiErrorMessage(response, `Failed to ${action} expense claim`));
            }
        } catch (error) {
            console.error(`${action} claim error:`, error);
            setSheetError(error.message || `Failed to ${action} claim`);
        } finally {
            setLoading(false);
        }

        if (done) {
            showToast({ type: 'success', ...done });
            setActionModal({ visible: false, type: '', claim: null, remarks: '', sanctionedAmounts: {}, selectedPayableAccount: '' });
            setSelected(null);
            loadClaims();
        }
    };

    // ------------------------------------------------------------------ sheet + picker plumbing
    const openClaim = (claim) => {
        setSheetError('');
        setSelected(claim);
    };

    const openAction = (handler) => {
        if (!selected) {
            return;
        }
        setSheetError('');
        setAccountsOpen(false);
        handler(selected);
    };

    const cancelAction = () => {
        setSheetError('');
        setActionModal({ visible: false, type: '', claim: null, remarks: '', sanctionedAmounts: {} });
    };

    const closeSheet = () => {
        if (loading && actionModal.visible) {
            return;
        }
        setActionModal({ ...actionModal, visible: false });
        setSelected(null);
        setSheetError('');
        setAccountsOpen(false);
    };

    const openApply = () => {
        returnTab.current = activeTab === 'apply' ? 'pending' : activeTab;
        setActiveTab('apply');
    };

    const openPicker = (next) => {
        setPickerQuery('');
        setPicker({ ...next, open: true });
    };

    const closePicker = () => setPicker((p) => (p ? { ...p, open: false } : p));

    const pickerOptions = useMemo(() => {
        if (picker?.kind === 'employee') {
            const q = pickerQuery.trim().toLowerCase();
            return q
                ? employees.filter((e) => `${e.employee_name} ${e.name}`.toLowerCase().includes(q))
                : employees;
        }
        return picker?.kind === 'type' ? expenseTypes : [];
    }, [picker, pickerQuery, employees, expenseTypes]);

    const pick = (value) => {
        if (picker?.kind === 'employee') {
            setApplyEmployee(value);
        } else if (picker?.kind === 'type') {
            updateExpenseItem(picker.index, 'expense_type', value);
        }
        closePicker();
    };

    const setSanctioned = (idx, value) => {
        const newAmounts = { ...actionModal.sanctionedAmounts };
        newAmounts[idx] = value;
        setActionModal({ ...actionModal, sanctionedAmounts: newAmounts });
    };

    const pendingCount = displayedClaims.filter((c) => c.approval_status === 'Draft').length;

    // ------------------------------------------------------------------ list tabs
    const renderClaims = () => {
        if (displayedClaims.length === 0) {
            const isPendingTab = activeTab === 'pending';
            return (
                <EmptyState
                    icon={isPendingTab ? 'check-circle' : 'file-text'}
                    title={isPendingTab ? 'No pending claims' : 'No claims'}
                    message={preselectFilter
                        ? `Nothing for employee ${preselectFilter}.`
                        : isPendingTab ? 'New expense claims will appear here.' : 'Expense claims will appear here.'}
                />
            );
        }
        return (
            <Group>
                {displayedClaims.map((claim) => (
                    <Row
                        key={claim.name}
                        left={<Avatar name={claim.employee_name} />}
                        title={claim.employee_name}
                        subtitle={[dateLabel(claim.posting_date), typesLabel(claim)].filter(Boolean).join('  ·  ')}
                        right={<AmountCell amount={listAmount(claim)} status={activeTab === 'history' ? statusLabel(claim.approval_status) : null} />}
                        onPress={() => openClaim(claim)}
                    />
                ))}
            </Group>
        );
    };

    const renderSummary = () => {
        const byStatus = Object.entries(statistics.by_status || {});
        const byDepartment = Object.entries(statistics.by_department || {});
        return (
            <>
                <StatStrip
                    style={styles.stats}
                    items={[
                        { label: 'Claims', value: statistics.total_claims || 0 },
                        ...byStatus.map(([status, count]) => ({ label: statusLabel(status), value: count })),
                    ]}
                />
                <Group title="Amounts">
                    <Row title="Claimed" value={formatINR(statistics.total_claimed_amount, 0)} />
                    <Row title="Sanctioned" value={formatINR(statistics.total_sanctioned_amount, 0)} />
                    <Row title="Reimbursed" value={formatINR(statistics.total_reimbursed_amount, 0)} />
                </Group>
                {byDepartment.length > 0 ? (
                    <Group title="By department">
                        {byDepartment.map(([dept, count]) => (
                            <Row key={dept} title={dept} value={String(count)} />
                        ))}
                    </Group>
                ) : null}
            </>
        );
    };

    // ------------------------------------------------------------------ apply on behalf
    const renderApplyForm = () => {
        const employee = employees.find((e) => e.name === applyEmployee);
        return (
            <Screen
                footer={(
                    <View style={styles.footerButtons}>
                        <Button title="Cancel" variant="secondary" onPress={() => setActiveTab(returnTab.current)} style={styles.flex} />
                        <Button
                            title="Submit claim"
                            onPress={handleApplySubmit}
                            disabled={loading || applyExpenses.length === 0}
                            style={styles.flex}
                        />
                    </View>
                )}
            >
                <Group title="Employee">
                    <View style={styles.formBody}>
                        <SelectField
                            value={employee ? `${employee.employee_name} (${employee.name})` : applyEmployee}
                            placeholder="Select employee"
                            onPress={() => openPicker({ kind: 'employee' })}
                        />
                    </View>
                </Group>

                {applyExpenses.map((expense, index) => (
                    <Group
                        key={index}
                        title={`Expense ${index + 1}`}
                        action={applyExpenses.length > 1 ? 'Remove' : undefined}
                        onAction={() => removeExpenseItem(index)}
                    >
                        <View style={styles.formBody}>
                            <SelectField
                                label="Type"
                                value={expense.expense_type}
                                placeholder="Select type"
                                onPress={() => openPicker({ kind: 'type', index })}
                            />
                            <TextField
                                label="Amount (₹)"
                                value={expense.amount}
                                onChangeText={(text) => updateExpenseItem(index, 'amount', text)}
                                placeholder="0.00"
                                keyboardType="decimal-pad"
                            />
                            <TextField
                                label="Description"
                                value={expense.description}
                                onChangeText={(text) => updateExpenseItem(index, 'description', text)}
                                placeholder="What was this for?"
                                multiline
                                numberOfLines={3}
                                inputStyle={styles.shortMultiline}
                            />
                            <SelectField
                                label="Date"
                                value={formatShortDate(expense.expense_date)}
                                icon="calendar"
                                onPress={() => setShowDatePicker({ show: true, index })}
                            />
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
                    </Group>
                ))}

                <Button title="Add another expense" variant="secondary" onPress={addExpenseItem} style={styles.addButton} />

                <Group>
                    <Row title="Total" right={<Text style={styles.totalValue}>{formatINR(calculateApplyTotal(), 2)}</Text>} />
                </Group>

                <Group title="Remarks">
                    <View style={styles.formBody}>
                        <TextField
                            value={applyRemark}
                            onChangeText={setApplyRemark}
                            placeholder="Optional"
                            multiline
                            numberOfLines={3}
                            inputStyle={styles.shortMultiline}
                        />
                    </View>
                </Group>
            </Screen>
        );
    };

    // ------------------------------------------------------------------ sheet content
    const renderDetail = (claim) => {
        const isPending = claim.approval_status === 'Draft';
        const expenses = claim.expenses || [];
        return (
            <>
                <Group>
                    <Row title="Status" right={<StatusText label={statusLabel(claim.approval_status)} />} />
                    <Row title="Date" value={dateLabel(claim.posting_date)} />
                    <Row title="Claimed" value={formatINR(claim.total_claimed_amount)} />
                    {!isPending ? <Row title="Sanctioned" value={formatINR(claim.total_sanctioned_amount)} /> : null}
                    {claim.expense_approver ? <Row title="Approver" value={claim.expense_approver} /> : null}
                </Group>

                {expenses.length > 0 ? (
                    <Group title="Expenses">
                        {expenses.map((exp, idx) => (
                            <Row
                                key={idx}
                                title={exp.expense_type}
                                subtitle={[dateLabel(exp.expense_date), exp.description].filter(Boolean).join('  ·  ')}
                                meta={!isPending && exp.sanctioned_amount !== exp.amount
                                    ? <Tag label={`Sanctioned ${formatINR(exp.sanctioned_amount)}`} />
                                    : null}
                                value={formatINR(exp.amount)}
                            />
                        ))}
                    </Group>
                ) : null}

                {claim.remark ? (
                    <Group title="Remarks">
                        <Text style={styles.note}>{claim.remark}</Text>
                    </Group>
                ) : null}
            </>
        );
    };

    const renderApproveForm = (claim) => {
        const account = payableAccounts.find((a) => a.name === actionModal.selectedPayableAccount);
        const totalSanctioned = Object.values(actionModal.sanctionedAmounts)
            .reduce((sum, amt) => sum + parseFloat(amt || 0), 0);
        const isDefault = Boolean(actionModal.selectedPayableAccount) && defaultPayableAccount === actionModal.selectedPayableAccount;
        return (
            <>
                {payableAccounts.length === 0 ? (
                    <Notice tone="warning" title="No payable account">
                        Add a payable account to the chart of accounts, or set a default expense claim payable account for the company.
                    </Notice>
                ) : (
                    <>
                        <SelectField
                            label="Payable account"
                            value={account ? accountLabel(account) : actionModal.selectedPayableAccount}
                            placeholder="Select account"
                            hint={isDefault && !accountsOpen ? 'Default account' : undefined}
                            icon={accountsOpen ? 'chevron-up' : 'chevron-down'}
                            onPress={() => setAccountsOpen((open) => !open)}
                            style={accountsOpen ? styles.selectOpen : undefined}
                        />
                        {accountsOpen ? (
                            <Group>
                                {payableAccounts.map((a) => (
                                    <Row
                                        key={a.name}
                                        title={a.account_name}
                                        subtitle={[a.account_number, a.name === defaultPayableAccount ? 'Default' : null].filter(Boolean).join('  ·  ') || null}
                                        right={<Check on={a.name === actionModal.selectedPayableAccount} />}
                                        chevron={false}
                                        onPress={() => {
                                            setActionModal({ ...actionModal, selectedPayableAccount: a.name });
                                            setAccountsOpen(false);
                                        }}
                                    />
                                ))}
                            </Group>
                        ) : null}
                    </>
                )}

                {claim.expenses ? (
                    <Group title="Sanctioned amounts">
                        {claim.expenses.map((expense, idx) => {
                            const claimedAmount = expense.amount || 0;
                            const currentSanctioned = actionModal.sanctionedAmounts[idx] !== undefined
                                ? actionModal.sanctionedAmounts[idx]
                                : claimedAmount;
                            return (
                                <View key={idx} style={styles.sanctionLine}>
                                    <View style={styles.sanctionBody}>
                                        <Text style={type.bodyStrong} numberOfLines={1}>{expense.expense_type}</Text>
                                        <Text style={styles.sanctionMeta} numberOfLines={2}>
                                            {[`Claimed ${formatINR(claimedAmount, 2)}`, expense.description].filter(Boolean).join('  ·  ')}
                                        </Text>
                                        {parseFloat(currentSanctioned) !== claimedAmount ? (
                                            <Pressable hitSlop={8} onPress={() => setSanctioned(idx, claimedAmount.toFixed(2))} style={styles.fullLink}>
                                                <Text style={styles.link}>Use full amount</Text>
                                            </Pressable>
                                        ) : null}
                                    </View>
                                    <View style={styles.amountInput}>
                                        <Text style={styles.amountPrefix}>₹</Text>
                                        <TextInput
                                            style={styles.amountInputText}
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

                                                setSanctioned(idx, finalValue);
                                            }}
                                            keyboardType="decimal-pad"
                                            placeholder="0.00"
                                            placeholderTextColor={color.textTertiary}
                                            returnKeyType="done"
                                        />
                                    </View>
                                </View>
                            );
                        })}
                        <Row title="Total sanctioned" right={<Text style={styles.totalValue}>{formatINR(totalSanctioned, 2)}</Text>} />
                    </Group>
                ) : null}

                <TextField
                    label="Remarks"
                    value={actionModal.remarks}
                    onChangeText={(text) => setActionModal({ ...actionModal, remarks: text })}
                    placeholder="Optional"
                    multiline
                    numberOfLines={3}
                    inputStyle={styles.shortMultiline}
                />
            </>
        );
    };

    const renderRejectForm = () => (
        <TextField
            label="Reason"
            value={actionModal.remarks}
            onChangeText={(text) => setActionModal({ ...actionModal, remarks: text })}
            placeholder="Why is this claim being rejected?"
            multiline
            numberOfLines={3}
        />
    );

    const openMode = actionModal.visible ? actionModal.type : selected ? 'detail' : null;
    const openClaimData = actionModal.visible ? actionModal.claim : selected;
    if (openMode && openClaimData) {
        lastSheet.current = { mode: openMode, claim: openClaimData };
    }
    const sheetMode = openMode || lastSheet.current.mode;
    const sheetClaim = openClaimData || lastSheet.current.claim;
    const busy = loading && actionModal.visible;

    let sheetFooter = null;
    if (sheetMode === 'detail') {
        sheetFooter = sheetClaim?.approval_status === 'Draft' ? (
            <>
                <Button title="Reject" variant="danger" onPress={() => openAction(handleReject)} style={styles.flex} />
                <Button title="Approve" onPress={() => openAction(handleApprove)} style={styles.flex} />
            </>
        ) : (
            <Button title="Close" variant="secondary" onPress={closeSheet} style={styles.flex} />
        );
    } else if (sheetMode) {
        sheetFooter = (
            <View style={styles.footerStack}>
                {sheetError ? <Text style={styles.footerError}>{sheetError}</Text> : null}
                <View style={styles.footerButtons}>
                    <Button title="Cancel" variant="secondary" onPress={cancelAction} disabled={loading} style={styles.flex} />
                    <Button
                        title={sheetMode === 'approve' ? 'Approve' : 'Reject'}
                        variant={sheetMode === 'approve' ? 'primary' : 'dangerSolid'}
                        onPress={confirmAction}
                        loading={loading}
                        style={styles.flex}
                    />
                </View>
            </View>
        );
    }

    const isListTab = activeTab === 'pending' || activeTab === 'history';

    return (
        <View style={styles.flex}>
            {activeTab === 'apply' ? (
                renderApplyForm()
            ) : (
                <>
                    <View style={styles.toolbar}>
                        <View style={styles.toolbarRow}>
                            <Segmented
                                value={activeTab}
                                onChange={setActiveTab}
                                style={styles.flex}
                                options={[
                                    { value: 'pending', label: 'Pending', count: pendingCount || undefined },
                                    { value: 'history', label: 'History' },
                                    { value: 'statistics', label: 'Summary' },
                                ]}
                            />
                            <Button title="New claim" size="sm" onPress={openApply} />
                        </View>
                        {activeTab === 'history' ? (
                            <Segmented
                                value={filterStatus || 'all'}
                                onChange={(value) => setFilterStatus(value === 'all' ? '' : value)}
                                options={HISTORY_FILTERS}
                                style={styles.subControl}
                            />
                        ) : null}
                        {isListTab && preselectFilter ? (
                            <Pressable style={styles.filterChip} onPress={() => setPreselectFilter('')} hitSlop={6}>
                                <Text style={styles.filterChipText}>Employee {preselectFilter}</Text>
                                <Icon name="x" size={14} color={color.textSecondary} />
                            </Pressable>
                        ) : null}
                    </View>

                    <Screen refreshing={refreshing} onRefresh={onRefresh}>
                        {loading && !refreshing ? (
                            <Loading />
                        ) : activeTab === 'statistics' ? (
                            renderSummary()
                        ) : (
                            renderClaims()
                        )}
                    </Screen>
                </>
            )}

            <Sheet
                visible={Boolean(openMode)}
                title={sheetMode === 'approve' ? 'Approve claim' : sheetMode === 'reject' ? 'Reject claim' : sheetClaim?.employee_name}
                subtitle={sheetMode === 'detail'
                    ? [sheetClaim?.name, sheetClaim?.department].filter(Boolean).join('  ·  ')
                    : [sheetClaim?.employee_name, sheetClaim?.name].filter(Boolean).join('  ·  ')}
                onClose={closeSheet}
                dismissable={!busy}
                footer={sheetFooter}
            >
                {sheetClaim && sheetMode === 'detail' ? renderDetail(sheetClaim) : null}
                {sheetClaim && sheetMode === 'approve' ? renderApproveForm(sheetClaim) : null}
                {sheetClaim && sheetMode === 'reject' ? renderRejectForm() : null}
            </Sheet>

            <Sheet
                visible={Boolean(picker?.open)}
                title={picker?.kind === 'employee' ? 'Employee' : 'Expense type'}
                onClose={closePicker}
            >
                {picker?.kind === 'employee' ? (
                    <SearchField value={pickerQuery} onChangeText={setPickerQuery} placeholder="Search by name or ID" style={styles.pickerSearch} />
                ) : null}
                {pickerOptions.length === 0 ? (
                    <EmptyState
                        icon={picker?.kind === 'employee' ? 'users' : 'list'}
                        title={picker?.kind === 'employee' ? 'No employees' : 'No expense types'}
                        message={pickerQuery ? `No one matches “${pickerQuery}”.` : null}
                    />
                ) : (
                    <Group>
                        {picker?.kind === 'employee'
                            ? pickerOptions.map((emp) => (
                                <Row
                                    key={emp.name}
                                    left={<Avatar name={emp.employee_name} size={32} />}
                                    title={emp.employee_name}
                                    subtitle={emp.name}
                                    right={<Check on={emp.name === applyEmployee} />}
                                    chevron={false}
                                    onPress={() => pick(emp.name)}
                                />
                            ))
                            : pickerOptions.map((t) => (
                                <Row
                                    key={t.name}
                                    title={t.name}
                                    right={<Check on={picker?.kind === 'type' && applyExpenses[picker.index]?.expense_type === t.name} />}
                                    chevron={false}
                                    onPress={() => pick(t.name)}
                                />
                            ))}
                    </Group>
                )}
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    subControl: { marginTop: space.sm },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        marginTop: space.sm,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: color.neutralSoft,
    },
    filterChipText: { fontSize: 13, color: color.textSecondary, fontWeight: '500' },

    amountCell: { alignItems: 'flex-end', gap: 3, marginLeft: space.sm },
    amountText: { ...type.bodyStrong, fontVariant: ['tabular-nums'] },
    totalValue: { ...type.bodyStrong, fontWeight: '600', fontVariant: ['tabular-nums'] },
    stats: { marginBottom: space.xl },

    formBody: { paddingHorizontal: space.lg, paddingTop: space.lg },
    shortMultiline: { minHeight: 72 },
    addButton: { marginTop: -space.sm, marginBottom: space.xl },
    footerButtons: { flexDirection: 'row', gap: space.sm },
    footerStack: { flex: 1 },
    footerError: { ...type.secondary, color: color.danger, marginBottom: space.sm },

    note: { ...type.body, lineHeight: 21, paddingHorizontal: space.lg, paddingVertical: space.md },
    selectOpen: { marginBottom: space.sm },
    sanctionLine: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.lg, paddingVertical: space.md },
    sanctionBody: { flex: 1, paddingRight: space.md },
    sanctionMeta: { ...type.secondary, marginTop: 2, lineHeight: 18 },
    fullLink: { alignSelf: 'flex-start', marginTop: 6 },
    link: { fontSize: 13, fontWeight: '600', color: color.accent },
    amountInput: {
        flexDirection: 'row',
        alignItems: 'center',
        width: 116,
        height: 40,
        paddingHorizontal: 10,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: color.surface,
    },
    amountPrefix: { ...type.secondary },
    amountInputText: { flex: 1, fontSize: 15, color: color.text, textAlign: 'right', paddingVertical: 0, fontVariant: ['tabular-nums'] },
    pickerSearch: { marginBottom: space.md },
});

export default ExpenseClaimApprovalScreen;
