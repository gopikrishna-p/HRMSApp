// src/screens/admin/ExpenseClaimApprovalScreen.js
//
// Expense claims for HR: review pending claims line by line with their receipt photos
// (approve an amount per line, or reject with a reason), browse past claims with their
// payment stage, see totals, and file a claim on behalf of an employee (with receipt photos).
// Approved claims are paid from Expense Payments (ExpensePaymentsScreen).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import { formatLocalDate } from '../../utils/dateFormat';
import { loadAllEmployees } from '../../utils/employeeData';
import showToast from '../../utils/Toast';
import {
    ReceiptPicker,
    ReceiptThumbs,
    receiptIds,
    photosUploading,
    photosFailed,
} from '../../components/expense/ReceiptPhotos';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    StatStrip,
    StatusText,
    Tag,
    Notice,
    Sheet,
    Button,
    Field,
    TextField,
    SelectField,
    SearchField,
    EmptyState,
    Loading,
    Icon,
    color,
    space,
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

// Claim stage from the server (Pending review, Rejected, Awaiting payment, Partly paid, Paid)
const STAGE_TONE = {
    'Pending review': 'warning',
    'Rejected': 'danger',
    'Awaiting payment': 'info',
    'Partly paid': 'warning',
    'Paid': 'success',
    'Cancelled': 'neutral',
};
const stageOf = (claim) => claim?.stage || statusLabel(claim?.approval_status);

// "Travel" or "Travel +2" for a claim with several expense types
const typesLabel = (claim) => {
    const types = [...new Set((claim.expenses || []).map((e) => e.expense_type).filter(Boolean))];
    if (types.length === 0) {
        return claim.total_expenses ? `${claim.total_expenses} ${Number(claim.total_expenses) === 1 ? 'item' : 'items'}` : '';
    }
    return types.length === 1 ? types[0] : `${types[0]} +${types.length - 1}`;
};

const photosLabel = (count) => (count ? `${count} ${count === 1 ? 'photo' : 'photos'}` : '');

// approved claims show what was sanctioned, everything else what was claimed
const listAmount = (claim) => (claim.approval_status === 'Approved' ? claim.total_sanctioned_amount : claim.total_claimed_amount);

// 1000 -> "1000", 999.5 -> "999.5" (prefill for an amount input)
const amountText = (value) => String(Math.round((Number(value) || 0) * 100) / 100);

// digits and one decimal point, at most 2 decimals
const sanitizeAmount = (text) => {
    const parts = String(text || '').replace(/[^0-9.]/g, '').split('.');
    return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('').substring(0, 2)}` : parts[0];
};

// why an approved amount is not usable (null when it is fine): 0 up to the claimed amount
const lineProblem = (text, claimed) => {
    const t = String(text ?? '').trim();
    const n = Number(t);
    if (t === '' || Number.isNaN(n) || n < 0) {
        return `Enter ₹0 to ${formatINR(claimed)}`;
    }
    if (n > claimed + 0.004) {
        return `More than the ${formatINR(claimed)} claimed`;
    }
    return null;
};

let lineSeq = 1;
const newExpenseLine = () => ({
    key: `line-${lineSeq++}`, // keeps each line's photos while lines are added and removed
    expense_type: '',
    amount: '',
    description: '',
    expense_date: new Date(),
});

const HISTORY_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
];

const AmountCell = ({ amount, stage }) => (
    <View style={styles.amountCell}>
        <Text style={styles.amountText} numberOfLines={1}>{formatINR(amount)}</Text>
        {stage ? <StatusText label={stage} tone={STAGE_TONE[stage]} size={12} /> : null}
    </View>
);

const Check = ({ on }) => (on ? <Icon name="check" size={18} color={color.accent} /> : null);

const ExpenseClaimApprovalScreen = ({ navigation, route }) => {
    const [activeTab, setActiveTab] = useState(route?.params?.tab || 'pending'); // pending, apply, history, statistics
    const [loading, setLoading] = useState(true); // claims are fetched on mount
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState(''); // message of the last failed list load
    const loadSeq = useRef(0); // only the latest list load may update the screen (tabs can change mid-load)

    // Data states
    const [claims, setClaims] = useState([]);
    const [statistics, setStatistics] = useState({});
    const [filterStatus, setFilterStatus] = useState(''); // History filter: '' (all), 'Approved' or 'Rejected'
    // Phase 3.x deep-link from EmployeeManagement Quick Actions (B5).
    const [preselectFilter, setPreselectFilter] = useState(route?.params?.preselectEmployee || '');
    const displayedClaims = preselectFilter
        ? claims.filter((c) => c.employee === preselectFilter)
        : claims;

    // Apply tab states (for admin creating expense claims for employees)
    const [employees, setEmployees] = useState([]);
    const [expenseTypes, setExpenseTypes] = useState([]);
    const [applyEmployee, setApplyEmployee] = useState('');
    const [applyExpenses, setApplyExpenses] = useState(() => [newExpenseLine()]);
    const [photosByLine, setPhotosByLine] = useState({}); // line key -> ReceiptPicker photos
    const [applyRemark, setApplyRemark] = useState('');
    const [showDatePicker, setShowDatePicker] = useState({ show: false, index: -1 });
    const [submitting, setSubmitting] = useState(false);
    const submittingRef = useRef(false);

    // Review sheet: the list row, its detail (lines, photos, payments) loaded fresh on open
    const [sheetOpen, setSheetOpen] = useState(false);
    const [selected, setSelected] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailError, setDetailError] = useState('');
    const [amounts, setAmounts] = useState({}); // line index -> approved amount (text)
    const [remarks, setRemarks] = useState(''); // approval remarks
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState('');
    const [processing, setProcessing] = useState(null); // 'approve' | 'reject' while the request runs
    const [sheetError, setSheetError] = useState('');
    const openClaimId = useRef(null); // ignores a detail response for a claim that is no longer open
    const processingRef = useRef(false); // blocks a second tap before the busy state renders

    // Pickers for the apply form
    const [picker, setPicker] = useState(null); // { kind: 'employee' | 'type', index, open }
    const [pickerQuery, setPickerQuery] = useState('');
    const returnTab = useRef('pending');

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

    // `quiet` reloads keep the current list on screen (used after a decision)
    const loadClaims = async (quiet = false) => {
        const id = ++loadSeq.current;
        if (!quiet) {
            setLoading(true);
        }
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
            if (id !== loadSeq.current) {
                return;
            }

            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, { claims: [], statistics: {} }) || {};
                const rows = Array.isArray(data.claims) ? data.claims : [];
                // History = reviewed claims; pending (Draft) ones belong to the Pending tab
                setClaims(activeTab === 'history' ? rows.filter((c) => c.approval_status !== 'Draft') : rows);
                setStatistics(data.statistics || {});
                setLoadError('');
            } else {
                console.error('Failed to load expense claims:', response);
                const msg = getApiErrorMessage(response, 'Please try again.');
                setClaims([]);
                setStatistics({});
                setLoadError(msg);
                showToast({ type: 'error', text1: 'Could not load expense claims', text2: msg });
            }
        } catch (error) {
            console.error('Error loading expense claims:', error);
            if (id === loadSeq.current) {
                setClaims([]);
                setStatistics({});
                setLoadError(error?.message || 'Please try again.');
            }
        } finally {
            if (id === loadSeq.current) {
                setLoading(false);
            }
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadClaims(true);
        setRefreshing(false);
    };

    // ------------------------------------------------------------------ review
    const loadDetail = async (claimId) => {
        setDetailError('');
        try {
            const response = await apiService.getExpenseClaimDetail(claimId);
            if (openClaimId.current !== claimId) {
                return;
            }
            const data = isApiSuccess(response) ? extractFrappeData(response, null) : null;
            if (data?.name) {
                setDetail(data);
                // prefill each line's approved amount with what was claimed
                const initial = {};
                (data.lines || []).forEach((line, idx) => {
                    initial[idx] = amountText(line.amount);
                });
                setAmounts(initial);
            } else {
                setDetailError(getApiErrorMessage(response, 'Please try again.'));
            }
        } catch (error) {
            if (openClaimId.current === claimId) {
                setDetailError(error.message || 'Please try again.');
            }
        }
    };

    const openClaim = (claim) => {
        // receipt links are signed for 15 minutes, so the detail is always loaded fresh
        openClaimId.current = claim.name;
        setSelected(claim);
        setDetail(null);
        setDetailError('');
        setAmounts({});
        setRemarks('');
        setRejecting(false);
        setReason('');
        setSheetError('');
        setSheetOpen(true);
        loadDetail(claim.name);
    };

    const closeSheet = () => {
        if (processing) {
            return;
        }
        if (rejecting) {
            setRejecting(false);
            setSheetError('');
            return;
        }
        openClaimId.current = null;
        setSheetOpen(false);
    };

    const finishReview = async (toast) => {
        showToast({ type: 'success', ...toast });
        openClaimId.current = null;
        setSheetOpen(false);
        await loadClaims(true);
    };

    const setLineAmount = (idx, text) => setAmounts((all) => ({ ...all, [idx]: sanitizeAmount(text) }));

    const handleApprove = async () => {
        const claim = detail;
        if (!claim || processingRef.current) {
            return;
        }
        setSheetError('');
        const lines = claim.lines || [];

        // approved amount per line: 0 up to the claimed amount, keyed by line index (0-based)
        const sanctionedAmounts = {};
        for (let i = 0; i < lines.length; i++) {
            const claimed = Number(lines[i].amount) || 0;
            const problem = lineProblem(amounts[i], claimed);
            if (problem) {
                const line = `Expense ${i + 1}${lines[i].expense_type ? ` (${lines[i].expense_type})` : ''}`;
                setSheetError(`${line}: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}.`);
                return;
            }
            sanctionedAmounts[String(i)] = Math.round(Number(amounts[i]) * 100) / 100;
        }
        const totalSanctioned = Object.values(sanctionedAmounts).reduce((sum, amt) => sum + amt, 0);
        if (totalSanctioned <= 0) {
            setSheetError('Nothing is approved. Reject the claim instead.');
            return;
        }

        processingRef.current = true;
        setProcessing('approve');
        try {
            // claims are no longer posted to the ledger, so no payable account is sent
            const response = await apiService.approveExpenseClaim(claim.name, remarks, sanctionedAmounts, null);
            if (isApiSuccess(response)) {
                await finishReview({ text1: 'Claim approved', text2: `${claim.employee_name}  ·  ${formatINR(totalSanctioned)} approved` });
            } else {
                setSheetError(getApiErrorMessage(response, 'Failed to approve expense claim'));
            }
        } catch (error) {
            console.error('approve claim error:', error);
            setSheetError(error.message || 'Failed to approve claim');
        } finally {
            processingRef.current = false;
            setProcessing(null);
        }
    };

    const handleReject = async () => {
        const claim = detail || selected;
        if (!claim || processingRef.current) {
            return;
        }
        setSheetError('');
        if (!reason.trim()) {
            setSheetError('Add a reason for rejecting this claim.');
            return;
        }
        processingRef.current = true;
        setProcessing('reject');
        try {
            const response = await apiService.rejectExpenseClaim(claim.name, reason);
            if (response.success) {
                await finishReview({ text1: 'Claim rejected', text2: claim.employee_name });
            } else {
                setSheetError(getApiErrorMessage(response, 'Failed to reject expense claim'));
            }
        } catch (error) {
            console.error('reject claim error:', error);
            setSheetError(error.message || 'Failed to reject claim');
        } finally {
            processingRef.current = false;
            setProcessing(null);
        }
    };

    const startReject = () => {
        setSheetError('');
        setRejecting(true);
    };

    const goToPayment = (claim) => {
        openClaimId.current = null;
        setSheetOpen(false);
        navigation.navigate('ExpensePayments', { employee: claim.employee, employee_name: claim.employee_name });
    };

    // ------------------------------------------------------------------ apply on behalf
    const addExpenseItem = () => {
        setApplyExpenses([...applyExpenses, newExpenseLine()]);
    };

    // photos already uploaded for a line that goes away are removed from the server
    const discardPhotos = (photos = []) => {
        photos.forEach((p) => {
            if (p.status === 'done' && p.receipt?.name) {
                apiService.deleteExpenseReceipt(p.receipt.name).catch(() => {});
            }
        });
    };

    const removeExpenseItem = (index) => {
        if (applyExpenses.length > 1) {
            const removed = applyExpenses[index];
            const newExpenses = applyExpenses.filter((_, i) => i !== index);
            setApplyExpenses(newExpenses);
            if (removed) {
                discardPhotos(photosByLine[removed.key]);
                setPhotosByLine((all) => {
                    const next = { ...all };
                    delete next[removed.key];
                    return next;
                });
            }
        }
    };

    const updateExpenseItem = (index, field, value) => {
        setApplyExpenses((list) => list.map((exp, i) => (i === index ? { ...exp, [field]: value } : exp)));
    };

    // ReceiptPicker calls onChange with updater functions while uploads progress
    const linePhotosSetter = (key) => (updater) => setPhotosByLine((all) => ({
        ...all,
        [key]: typeof updater === 'function' ? updater(all[key] || []) : updater,
    }));

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
            const photos = photosByLine[exp.key] || [];

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

            if (photosUploading(photos)) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: photos are still uploading`, text2: 'Wait a moment and submit again' });
                return false;
            }

            if (photosFailed(photos)) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: a photo did not upload`, text2: 'Tap it to retry, or remove it' });
                return false;
            }

            if (receiptIds(photos).length === 0) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: add a receipt photo` });
                return false;
            }
        }

        return true;
    };

    const handleApplySubmit = async () => {
        if (submittingRef.current || !validateApplyForm()) {
            return;
        }

        submittingRef.current = true;
        setSubmitting(true);
        try {
            const expenseItems = applyExpenses.map(exp => ({
                expense_type: exp.expense_type,
                amount: parseFloat(exp.amount),
                description: exp.description.trim(),
                expense_date: formatLocalDate(exp.expense_date),
                receipts: receiptIds(photosByLine[exp.key] || []),
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
                    text2: [data.claim_id, formatINR(data.total_claimed_amount || calculateApplyTotal())].filter(Boolean).join('  ·  '),
                });
                // Reset form (the photos are now on the claim)
                setApplyEmployee('');
                setApplyExpenses([newExpenseLine()]);
                setPhotosByLine({});
                setApplyRemark('');
                setActiveTab('pending'); // the tab effect reloads the pending list
            } else {
                showToast({ type: 'error', text1: 'Claim not created', text2: response.message || 'Failed to create expense claim' });
            }
        } catch (error) {
            console.error('Submit expense claim error:', error);
            showToast({ type: 'error', text1: 'Claim not created', text2: error.message || 'Failed to create expense claim' });
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
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
            // receipts are stored per employee: photos taken for someone else can't go on this claim
            const photos = Object.values(photosByLine).flat();
            if (value !== applyEmployee && photos.length > 0) {
                discardPhotos(photos);
                setPhotosByLine({});
                showToast({ type: 'info', text1: 'Receipt photos removed', text2: 'Add the photos again for this employee' });
            }
            setApplyEmployee(value);
        } else if (picker?.kind === 'type') {
            updateExpenseItem(picker.index, 'expense_type', value);
        }
        closePicker();
    };

    const pendingCount = displayedClaims.filter((c) => c.approval_status === 'Draft').length;

    // ------------------------------------------------------------------ list tabs
    const renderClaims = () => {
        if (displayedClaims.length === 0 && loadError) {
            return <EmptyState icon="alert-circle" title="Could not load expense claims" message={loadError} action="Try again" onAction={() => loadClaims()} />;
        }
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
                        subtitle={[dateLabel(claim.posting_date), typesLabel(claim), photosLabel(claim.receipt_count)].filter(Boolean).join('  ·  ')}
                        subtitleLines={3}
                        right={<AmountCell amount={listAmount(claim)} stage={activeTab === 'history' ? stageOf(claim) : null} />}
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
                {loadError ? (
                    <Notice tone="danger" icon="alert-circle" title="Could not load the summary" onPress={() => loadClaims()}>
                        {`${loadError} Tap to try again.`}
                    </Notice>
                ) : null}
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
                            <Row key={dept} title={String(dept).replace(' - DG', '')} value={String(count)} />
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
                            loading={submitting}
                            disabled={submitting || applyExpenses.length === 0}
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
                        key={expense.key}
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
                            <Field label="Receipt photos" hint={applyEmployee ? undefined : 'Select the employee first'}>
                                <ReceiptPicker
                                    value={photosByLine[expense.key] || []}
                                    onChange={linePhotosSetter(expense.key)}
                                    employee={applyEmployee || undefined}
                                    disabled={!applyEmployee}
                                />
                            </Field>
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

    // ------------------------------------------------------------------ review sheet content
    const claimIsPending = (claim) => claim?.approval_status === 'Draft' && claim?.docstatus !== 2;
    const reviewClaim = detail || selected;
    const isPending = claimIsPending(reviewClaim);
    const owedOnClaim = detail?.approval_status === 'Approved' ? Number(detail.outstanding_amount) || 0 : 0;

    const renderLine = (line, idx, pending, approved) => {
        const claimed = Number(line.amount) || 0;
        const text = amounts[idx] ?? '';
        const problem = pending ? lineProblem(text, claimed) : null;
        const short = pending && !problem && claimed - Number(text) > 0.004;
        const sanctionedDiffers = approved && Math.abs((Number(line.sanctioned_amount) || 0) - claimed) > 0.004;
        return (
            <View key={line.name || idx} style={styles.line}>
                <View style={styles.lineTop}>
                    <View style={styles.lineBody}>
                        <Text style={type.bodyStrong} numberOfLines={1}>{line.expense_type || `Expense ${idx + 1}`}</Text>
                        <Text style={styles.lineMeta} numberOfLines={3}>
                            {[dateLabel(line.expense_date), line.description].filter(Boolean).join('  ·  ')}
                        </Text>
                    </View>
                    <Text style={styles.lineAmount}>{formatINR(claimed)}</Text>
                </View>
                {sanctionedDiffers ? (
                    <View style={styles.lineTag}>
                        <Tag label={`Approved ${formatINR(line.sanctioned_amount)}`} />
                    </View>
                ) : null}
                <View style={styles.linePhotos}>
                    <ReceiptThumbs receipts={line.receipts || []} showDuplicates />
                </View>
                {pending ? (
                    <>
                        <TextField
                            label="Approve"
                            value={text}
                            onChangeText={(t) => setLineAmount(idx, t)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            returnKeyType="done"
                            editable={!processing}
                            style={styles.lineField}
                            inputStyle={styles.amountInput}
                        />
                        {problem || short ? (
                            <View style={styles.lineFoot}>
                                <Text style={problem ? styles.lineError : styles.lineNote} numberOfLines={2}>
                                    {problem || `${formatINR(claimed - Number(text))} less than claimed`}
                                </Text>
                                <Pressable hitSlop={8} onPress={() => setLineAmount(idx, amountText(claimed))}>
                                    <Text style={styles.link}>Use full amount</Text>
                                </Pressable>
                            </View>
                        ) : null}
                    </>
                ) : null}
            </View>
        );
    };

    const renderReview = () => {
        if (!selected) {
            return null;
        }
        if (!detail) {
            return detailError ? (
                <EmptyState
                    icon="alert-circle"
                    title="Could not load the claim"
                    message={detailError}
                    action="Try again"
                    onAction={() => loadDetail(selected.name)}
                />
            ) : (
                <Loading label="Loading claim" />
            );
        }

        const claim = detail;
        const lines = claim.lines || [];
        const payments = claim.payments || [];
        const approved = claim.approval_status === 'Approved';
        const stage = stageOf(claim);
        const claimed = Number(claim.total_claimed_amount) || 0;
        const approvedTotal = lines.reduce(
            (sum, line, idx) => sum + (lineProblem(amounts[idx], Number(line.amount) || 0) ? 0 : Number(amounts[idx])),
            0,
        );
        const reviewed = [claim.reviewed_by, claim.reviewed_on ? dateLabel(claim.reviewed_on) : null].filter(Boolean).join('  ·  ');

        return (
            <>
                <Group>
                    <Row title="Stage" right={<StatusText label={stage} tone={STAGE_TONE[stage]} />} />
                    <Row title="Date" value={dateLabel(claim.posting_date)} />
                    <Row title="Employee ID" value={claim.employee} />
                    <Row title="Claimed" value={formatINR(claimed)} />
                    {approved ? <Row title="Approved" value={formatINR(claim.total_sanctioned_amount)} /> : null}
                    {approved ? <Row title="Paid" value={formatINR(claim.custom_paid_amount)} /> : null}
                    {approved ? (
                        <Row title="Still owed" value={formatINR(owedOnClaim)} valueTone={owedOnClaim > 0 ? 'warning' : undefined} />
                    ) : null}
                    {!isPending && reviewed ? <Row title="Reviewed by" subtitle={reviewed} /> : null}
                </Group>

                {claim.approval_status === 'Rejected' && claim.rejection_reason ? (
                    <Group title="Reason for rejection">
                        <Text style={styles.note}>{claim.rejection_reason}</Text>
                    </Group>
                ) : null}

                {claim.remark ? (
                    <Group title="Remarks">
                        <Text style={styles.note}>{claim.remark}</Text>
                    </Group>
                ) : null}

                <Group title={lines.length > 1 ? `Expenses  ·  ${lines.length}` : 'Expense'}>
                    {lines.map((line, idx) => renderLine(line, idx, isPending, approved))}
                </Group>

                {isPending ? (
                    <>
                        <Group>
                            <Row
                                title="Approved total"
                                subtitle={approvedTotal < claimed - 0.004 ? `${formatINR(claimed)} claimed` : undefined}
                                right={<Text style={styles.totalValue}>{formatINR(approvedTotal)}</Text>}
                            />
                        </Group>
                        <TextField
                            label="Remarks (optional)"
                            value={remarks}
                            onChangeText={setRemarks}
                            placeholder="Shown on the claim"
                            multiline
                            numberOfLines={3}
                            editable={!processing}
                            inputStyle={styles.shortMultiline}
                        />
                    </>
                ) : null}

                {approved ? (
                    <Group title="Payments">
                        {payments.length === 0 ? (
                            <Row title="No payments yet" />
                        ) : (
                            payments.map((p) => (
                                <Row
                                    key={p.name}
                                    title={dateLabel(p.payout_date)}
                                    subtitle={[
                                        [p.payment_mode, p.reference].filter(Boolean).join('  ·  '),
                                        Number(p.payout_amount) - Number(p.amount) > 0.004 ? `Part of a ${formatINR(p.payout_amount)} payment` : null,
                                    ].filter(Boolean).join('\n')}
                                    value={formatINR(p.amount)}
                                />
                            ))
                        )}
                    </Group>
                ) : null}
            </>
        );
    };

    const renderRejectForm = () => (
        <TextField
            label="Reason"
            value={reason}
            onChangeText={setReason}
            placeholder="Why is this claim being rejected?"
            multiline
            numberOfLines={3}
            editable={!processing}
        />
    );

    let sheetFooter;
    if (rejecting) {
        sheetFooter = (
            <View style={styles.footerStack}>
                {sheetError ? <Text style={styles.footerError}>{sheetError}</Text> : null}
                <View style={styles.footerButtons}>
                    <Button title="Back" variant="secondary" onPress={closeSheet} disabled={Boolean(processing)} style={styles.flex} />
                    <Button title="Reject" variant="dangerSolid" onPress={handleReject} loading={processing === 'reject'} style={styles.flex} />
                </View>
            </View>
        );
    } else if (isPending) {
        sheetFooter = (
            <View style={styles.footerStack}>
                {sheetError ? <Text style={styles.footerError}>{sheetError}</Text> : null}
                <View style={styles.footerButtons}>
                    <Button title="Reject" variant="danger" onPress={startReject} disabled={Boolean(processing)} style={styles.flex} />
                    <Button
                        title="Approve"
                        onPress={handleApprove}
                        loading={processing === 'approve'}
                        disabled={!detail || Boolean(processing)}
                        style={styles.flex}
                    />
                </View>
            </View>
        );
    } else if (owedOnClaim > 0) {
        sheetFooter = (
            <>
                <Button title="Close" variant="secondary" onPress={closeSheet} style={styles.flex} />
                <Button title="Record payment" onPress={() => goToPayment(detail)} style={styles.flex} />
            </>
        );
    } else {
        sheetFooter = <Button title="Close" variant="secondary" onPress={closeSheet} style={styles.flex} />;
    }

    const isListTab = activeTab === 'pending' || activeTab === 'history';

    return (
        <View style={styles.flex}>
            {activeTab === 'apply' ? (
                renderApplyForm()
            ) : (
                <>
                    <View style={styles.toolbar}>
                        {/* "New claim" lives in the footer: next to three segments it squeezed them off a 320 dp phone */}
                        <Segmented
                            value={activeTab}
                            onChange={setActiveTab}
                            options={[
                                { value: 'pending', label: 'Pending', count: pendingCount || undefined },
                                { value: 'history', label: 'History' },
                                { value: 'statistics', label: 'Summary' },
                            ]}
                        />
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
                                <Text style={styles.filterChipText} numberOfLines={1}>Employee {preselectFilter}</Text>
                                <Icon name="x" size={14} color={color.textSecondary} />
                            </Pressable>
                        ) : null}
                    </View>

                    <Screen
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        footer={<Button title="New claim on behalf" icon="plus" onPress={openApply} />}
                    >
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
                visible={sheetOpen}
                title={rejecting ? 'Reject claim' : reviewClaim?.employee_name}
                subtitle={rejecting
                    ? [reviewClaim?.employee_name, reviewClaim?.name].filter(Boolean).join('  ·  ')
                    : [reviewClaim?.name, reviewClaim?.department].filter(Boolean).join('  ·  ')}
                onClose={closeSheet}
                dismissable={!processing}
                footer={sheetFooter}
            >
                {rejecting ? renderRejectForm() : renderReview()}
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
                                    left={<Avatar name={emp.employee_name || emp.name} size={32} />}
                                    title={emp.employee_name || emp.name}
                                    titleLines={2}
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
                                    titleLines={2}
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
    subControl: { marginTop: space.sm },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        maxWidth: '100%',
        gap: 6,
        marginTop: space.sm,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: color.neutralSoft,
    },
    filterChipText: { fontSize: 13, color: color.textSecondary, fontWeight: '500', flexShrink: 1 },

    // the amount never shrinks; a long stage label ellipsizes instead of squeezing the name
    amountCell: { alignItems: 'flex-end', gap: 3, marginLeft: space.sm, maxWidth: '45%' },
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
    link: { fontSize: 13, fontWeight: '600', color: color.accent },

    line: { paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: color.surface },
    lineTop: { flexDirection: 'row', alignItems: 'flex-start' },
    lineBody: { flex: 1, paddingRight: space.md },
    lineMeta: { ...type.secondary, marginTop: 2, lineHeight: 18 },
    lineAmount: { ...type.bodyStrong, fontVariant: ['tabular-nums'] },
    lineTag: { flexDirection: 'row', marginTop: 6 },
    linePhotos: { marginTop: space.md },
    lineField: { marginTop: space.md, marginBottom: 0 },
    amountInput: { fontVariant: ['tabular-nums'] },
    lineFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginTop: 6 },
    lineError: { ...type.secondary, color: color.danger, flex: 1 },
    lineNote: { ...type.secondary, flex: 1 },
    pickerSearch: { marginBottom: space.md },
});

export default ExpenseClaimApprovalScreen;
