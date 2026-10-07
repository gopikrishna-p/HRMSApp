// src/screens/employee/ExpenseClaimScreen.js
//
// The employee's expense claims: money in review / to be paid / paid, the payments received,
// the claims (filter by status, tap for the lines, receipt photos and payments; withdraw while
// in review) and the form to file a new claim with one or more expenses. Every expense needs at
// least one receipt photo; photos upload as soon as they are taken (ReceiptPicker). The approver
// sets the approved amounts and HR records the payments.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Alert, useWindowDimensions } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import { formatLocalDate } from '../../utils/dateFormat';
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
    Segmented,
    StatStrip,
    StatusText,
    Tag,
    Sheet,
    Button,
    Field,
    TextField,
    SelectField,
    EmptyState,
    Loading,
    Notice,
    Icon,
    color,
    space,
    type,
    statusTone,
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
const parseYMD = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};
const dateLabel = (value) => {
    const d = parseYMD(value);
    return d ? formatShortDate(d) : '–';
};

// ERPNext keeps undecided claims as approval_status "Draft"; employees read that as pending.
const statusLabel = (status) => (status === 'Draft' ? 'Pending' : status || '–');

// Where the claim is: Pending review, Rejected, Awaiting payment, Partly paid or Paid
const STAGE_TONES = {
    'Pending review': 'warning',
    'Rejected': 'danger',
    'Awaiting payment': 'info',
    'Partly paid': 'warning',
    'Paid': 'success',
};
const stageOf = (claim) => claim.stage || statusLabel(claim.approval_status);
const StageText = ({ claim }) => {
    const stage = stageOf(claim);
    return <StatusText label={stage} tone={STAGE_TONES[stage] || statusTone(stage)} />;
};

const photosLabel = (count) => `${count} ${count === 1 ? 'photo' : 'photos'}`;

// "Travel" or "Travel +2" for a claim with several expense types
const typesLabel = (claim) => {
    const types = [...new Set((claim.expenses || []).map((e) => e.expense_type).filter(Boolean))];
    if (types.length === 0) {
        return claim.total_expenses ? `${claim.total_expenses} ${claim.total_expenses === 1 ? 'item' : 'items'}` : '';
    }
    return types.length === 1 ? types[0] : `${types[0]} +${types.length - 1}`;
};

// "UPI  ·  UTR 1234" (+ the whole payment when only part of it went to this claim)
const paymentLine = (payment) => {
    const lines = [[payment.payment_mode, payment.reference].filter(Boolean).join('  ·  ')];
    if (Number(payment.payout_amount) > Number(payment.amount)) {
        lines.push(`Part of a ${formatINR(payment.payout_amount)} payment`);
    }
    return lines.filter(Boolean).join('\n');
};

// "For the claim of 03 Oct 2026" / "For claims of 03 Oct 2026 (₹500), 05 Oct 2026 (₹300)"
const payoutClaimsLine = (claims = []) => {
    if (claims.length === 0) {
        return '';
    }
    const ref = (c) => (c.claim_date ? dateLabel(c.claim_date) : c.expense_claim);
    if (claims.length === 1) {
        return `For the claim of ${ref(claims[0])}`;
    }
    return `For claims of ${claims.map((c) => `${ref(c)} (${formatINR(c.amount)})`).join(', ')}`;
};

const STATUS_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'Draft', label: 'Pending' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
];

// each expense line has a stable key so its receipt photos stay with it when another line is removed
let lineSeq = 0;
const newExpenseLine = () => ({
    key: `line${++lineSeq}`,
    expense_type: '',
    amount: '',
    description: '',
    expense_date: new Date()
});

const Check = ({ on }) => (on ? <Icon name="check" size={18} color={color.accent} /> : null);

const ExpenseClaimScreen = ({ navigation }) => {
    // State management
    const [activeTab, setActiveTab] = useState('history'); // history (my claims), submit (new claim form)
    const [loading, setLoading] = useState(true); // employee and expense types are fetched on mount
    const [refreshing, setRefreshing] = useState(false);
    const [employeeId, setEmployeeId] = useState('');
    const [employeeError, setEmployeeError] = useState(null); // employee record could not be loaded
    const [typesError, setTypesError] = useState(null); // expense types could not be loaded
    const [submitting, setSubmitting] = useState(false);
    const submittingRef = useRef(false); // blocks a second tap before the re-render disables the button

    // Submit form state
    const [expenses, setExpenses] = useState(() => [newExpenseLine()]);
    const [photosByLine, setPhotosByLine] = useState({}); // { [line key]: ReceiptPicker photos }
    const [remark, setRemark] = useState('');
    const [expenseTypes, setExpenseTypes] = useState([]);
    const [showDatePicker, setShowDatePicker] = useState({ show: false, index: -1 });

    // History state
    const [claims, setClaims] = useState([]);
    const [claimsLoading, setClaimsLoading] = useState(false);
    const [claimsError, setClaimsError] = useState(null);
    const claimsRequest = useRef(0); // ignores an answer for a filter that is no longer selected
    const claimsFilter = useRef(null); // the filter the claims on screen belong to
    const [filterStatus, setFilterStatus] = useState(''); // '', Draft, Approved, Rejected
    const [totalClaimed, setTotalClaimed] = useState(null); // null until loaded ('–')
    const [totalApproved, setTotalApproved] = useState(null);
    const [summary, setSummary] = useState(null); // in review / awaiting payment / paid amounts

    // Claim detail sheet: the list row (shown at once) and its full detail (lines, photos, payments)
    const [selected, setSelected] = useState(null);
    const [claimDetail, setClaimDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState(null);
    const [withdrawing, setWithdrawing] = useState(false);
    const withdrawingRef = useRef(false);
    const detailRequest = useRef(0); // ignores a slow answer for a claim that is no longer open
    const lastSelected = useRef(null); // keeps the detail sheet filled while it slides out

    // Payments received sheet
    const [paymentsOpen, setPaymentsOpen] = useState(false);
    const [account, setAccount] = useState(null);
    const [accountLoading, setAccountLoading] = useState(false);
    const [accountError, setAccountError] = useState(null);

    // Presentation only: expense-type picker
    const [typePicker, setTypePicker] = useState(null); // { index, open }

    // On a narrow phone with large text the stage moves under the amount, so a long stage
    // ("Awaiting payment") never squeezes the amount into "₹1,2…" (app text grows up to 1.3x).
    const { width: windowWidth, fontScale } = useWindowDimensions();
    const stageBelow = windowWidth / Math.min(Math.max(fontScale || 1, 1), 1.3) < 280;

    useEffect(() => {
        loadInitialData();
        loadSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- employee, expense types and the summary are loaded once on mount
    }, []);

    useEffect(() => {
        if (activeTab === 'history' && employeeId) {
            loadClaims();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the list is shown, the filter changes or the employee is known
    }, [activeTab, filterStatus, employeeId]);

    const loadExpenseTypes = async () => {
        try {
            const typesResponse = await apiService.getExpenseClaimTypes();
            if (!isApiSuccess(typesResponse)) {
                setTypesError(getApiErrorMessage(typesResponse, 'Please try again.'));
                return;
            }
            const types = extractFrappeData(typesResponse, []);
            setExpenseTypes(Array.isArray(types) ? types : []);
            setTypesError(null);
        } catch (error) {
            console.error('Error loading expense types:', error);
            setTypesError(error.message || 'Please try again.');
        }
    };

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Get employee info
            const empResponse = await apiService.getCurrentEmployee();
            const empData = extractFrappeData(empResponse, null);
            if (empData && empData.name) {
                setEmployeeId(empData.name);
                setEmployeeError(null);
            } else {
                setEmployeeError(getApiErrorMessage(empResponse, 'Pull down to try again.'));
            }

            // Get expense types
            await loadExpenseTypes();
        } catch (error) {
            console.error('Error loading initial data:', error);
            setEmployeeError(error.message || 'Pull down to try again.');
        } finally {
            setLoading(false);
        }
    };

    // A failed reload of the same filter keeps the claims on screen and says so; a failed load
    // for another filter clears them, so claims of the previous filter are never shown under it.
    const loadClaims = async () => {
        if (!employeeId) {
            return;
        }

        const request = ++claimsRequest.current;
        const filter = filterStatus;
        const fail = (message) => {
            if (claimsFilter.current !== filter) {
                setClaims([]);
                claimsFilter.current = filter;
            }
            setClaimsError(message);
        };
        setClaimsLoading(true);
        try {
            const filters = {
                employee: employeeId,
                approval_status: filterStatus || null,
                limit: 100
            };

            const response = await apiService.getEmployeeExpenseClaims(filters);
            if (request !== claimsRequest.current) {
                return;
            }
            if (!isApiSuccess(response)) {
                fail(getApiErrorMessage(response, 'Pull down to try again.'));
                return;
            }
            const data = extractFrappeData(response, {});
            setClaims(Array.isArray(data.claims) ? data.claims : []);
            claimsFilter.current = filter;
            setTotalClaimed(data.total_claimed_amount || 0);
            setTotalApproved(data.total_approved_amount || 0);
            setClaimsError(null);
        } catch (error) {
            console.error('Error loading claims:', error);
            if (request === claimsRequest.current) {
                fail(error.message || 'Pull down to try again.');
            }
        } finally {
            if (request === claimsRequest.current) {
                setClaimsLoading(false);
            }
        }
    };

    // money in review, approved but not paid yet, and paid so far (all of the employee's claims)
    const loadSummary = async () => {
        try {
            const response = await apiService.getMyExpenseSummary();
            if (response.success) {
                setSummary(extractFrappeData(response, {}) || {});
            }
        } catch (error) {
            console.error('Error loading expense summary:', error);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        if (activeTab !== 'history') {
            await loadInitialData();
        } else if (employeeId) {
            await Promise.all([loadClaims(), loadSummary()]);
        } else {
            // the employee record did not load: load it again (the claims follow once it is known)
            await Promise.all([loadInitialData(), loadSummary()]);
        }
        setRefreshing(false);
    };

    const addExpenseItem = () => {
        setExpenses((list) => [...list, newExpenseLine()]);
    };

    const removeExpenseItem = (index) => {
        if (expenses.length > 1) {
            const line = expenses[index];
            const newExpenses = expenses.filter((_, i) => i !== index);
            setExpenses(newExpenses);

            // drop the line's photos; uploaded ones are not on a claim yet, so the server deletes them
            // (a photo still uploading is cleaned up by the server's nightly job)
            const uploaded = receiptIds(photosByLine[line.key]);
            setPhotosByLine((all) => {
                const next = { ...all };
                delete next[line.key];
                return next;
            });
            uploaded.forEach((id) => {
                apiService.deleteExpenseReceipt(id).catch(() => {});
            });
        }
    };

    const updateExpenseItem = (index, field, value) => {
        // sanctioned_amount is not set here: the backend defaults it to the amount and the
        // approver changes it during approval.
        setExpenses((list) => list.map((exp, i) => (i === index ? { ...exp, [field]: value } : exp)));
    };

    // digits and one decimal point, so the amount sent is the amount typed ("1,500" -> "1500";
    // parseFloat would read "1,500" as 1)
    const cleanAmount = (text) => {
        const [whole, ...rest] = String(text).replace(/[^0-9.]/g, '').split('.');
        return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
    };

    // ReceiptPicker calls onChange with updater functions while uploads progress
    const setLinePhotos = (key) => (updater) => setPhotosByLine((all) => ({
        ...all,
        [key]: typeof updater === 'function' ? updater(all[key] || []) : updater,
    }));

    const handleDateChange = (event, selectedDate, index) => {
        setShowDatePicker({ show: false, index: -1 });
        if (selectedDate) {
            updateExpenseItem(index, 'expense_date', selectedDate);
        }
    };

    const validateForm = () => {
        if (!employeeId) {
            showToast({ type: 'error', text1: 'Your employee record is not loaded', text2: 'Pull down to try again' });
            return false;
        }

        // Check if at least one expense exists
        if (expenses.length === 0) {
            showToast({ type: 'error', text1: 'Add at least one expense' });
            return false;
        }

        // Validate each expense
        for (let i = 0; i < expenses.length; i++) {
            const exp = expenses[i];

            if (!exp.expense_type) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: select a type` });
                return false;
            }

            if (!(parseFloat(exp.amount) > 0)) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: enter an amount above zero` });
                return false;
            }

            if (!exp.description || !exp.description.trim()) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: add a description` });
                return false;
            }

            // every expense needs at least one uploaded receipt photo (the server refuses it otherwise)
            const photos = photosByLine[exp.key] || [];
            if (photosUploading(photos)) {
                showToast({ type: 'info', text1: `Expense ${i + 1}: photos are still uploading`, text2: 'Submit again when they finish' });
                return false;
            }

            if (photosFailed(photos)) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: a photo did not upload`, text2: 'Tap it to retry, or remove it' });
                return false;
            }

            if (receiptIds(photos).length === 0) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: add a receipt photo`, text2: 'Take a photo of the bill or choose one from the gallery' });
                return false;
            }
        }

        return true;
    };

    const resetForm = () => {
        setExpenses([newExpenseLine()]);
        setPhotosByLine({});
        setRemark('');
        setActiveTab('history');
    };

    const handleSubmit = async () => {
        if (submittingRef.current || !validateForm()) {
            return;
        }

        submittingRef.current = true;
        setSubmitting(true);
        try {
            // Prepare expense items. sanctioned_amount is not sent by the employee: the
            // backend defaults it to the amount and the approver changes it during approval.
            const expenseItems = expenses.map(exp => ({
                expense_type: exp.expense_type,
                amount: parseFloat(exp.amount),
                description: exp.description.trim(),
                expense_date: formatLocalDate(exp.expense_date),
                receipts: receiptIds(photosByLine[exp.key]),
            }));

            const response = await apiService.submitExpenseClaim(
                employeeId,
                expenseItems,
                { remark: remark.trim() }
            );

            // Check if API returned success
            if (!isApiSuccess(response)) {
                showToast({ type: 'error', text1: 'Claim not submitted', text2: getApiErrorMessage(response, 'Failed to submit expense claim') });
                return;
            }

            // Check if we have valid data
            if (response.data?.message) {
                const data = response.data.message;
                showToast({
                    type: 'success',
                    text1: 'Claim submitted',
                    text2: [data.claim_id, formatINR(data.total_claimed_amount || calculateTotal())].filter(Boolean).join('  ·  '),
                });
            } else {
                showToast({ type: 'success', text1: 'Claim submitted' });
            }
            // Reset form; back to the list, which reloads the claims
            resetForm();
            loadSummary();
        } catch (error) {
            console.error('Submit expense claim error:', error);
            showToast({ type: 'error', text1: 'Claim not submitted', text2: error.message || 'Failed to submit expense claim' });
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    const calculateTotal = () => {
        return expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    };

    // ------------------------------------------------------------------ claim detail
    // photo links are signed for 15 minutes, so the detail is loaded fresh every time a claim opens
    const loadClaimDetail = async (claimId) => {
        const request = ++detailRequest.current;
        setClaimDetail(null);
        setDetailError(null);
        setDetailLoading(true);
        try {
            const response = await apiService.getExpenseClaimDetail(claimId);
            if (request !== detailRequest.current) {
                return;
            }
            const data = extractFrappeData(response, null);
            if (isApiSuccess(response) && data?.name) {
                setClaimDetail(data);
            } else {
                setDetailError(getApiErrorMessage(response, 'Please try again'));
            }
        } catch (error) {
            console.error('Error loading expense claim:', error);
            if (request === detailRequest.current) {
                setDetailError(error.message || 'Please try again');
            }
        } finally {
            if (request === detailRequest.current) {
                setDetailLoading(false);
            }
        }
    };

    const openClaim = (claim) => {
        setSelected(claim);
        loadClaimDetail(claim.name);
    };

    const closeClaim = () => {
        if (!withdrawing) {
            setSelected(null);
        }
    };

    const withdrawClaim = async (claimId) => {
        if (withdrawingRef.current) {
            return;
        }
        withdrawingRef.current = true;
        setWithdrawing(true);
        try {
            const response = await apiService.withdrawExpenseClaim(claimId);
            if (!isApiSuccess(response)) {
                showToast({ type: 'error', text1: 'Claim not withdrawn', text2: getApiErrorMessage(response, 'Please try again') });
                return;
            }
            setSelected(null);
            showToast({ type: 'success', text1: 'Claim withdrawn' });
            await Promise.all([loadClaims(), loadSummary()]);
        } catch (error) {
            console.error('Withdraw expense claim error:', error);
            showToast({ type: 'error', text1: 'Claim not withdrawn', text2: error.message || 'Please try again' });
        } finally {
            withdrawingRef.current = false;
            setWithdrawing(false);
        }
    };

    const confirmWithdraw = (claim) => {
        Alert.alert(
            'Withdraw this claim?',
            `${formatINR(claim.total_claimed_amount)} claim of ${dateLabel(claim.posting_date)}. Its receipt photos are deleted too.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Withdraw', style: 'destructive', onPress: () => withdrawClaim(claim.name) },
            ]
        );
    };

    // ------------------------------------------------------------------ payments received
    const loadAccount = async () => {
        setAccountLoading(true);
        setAccountError(null);
        try {
            const response = await apiService.getExpensePaymentAccount();
            const data = extractFrappeData(response, null);
            if (isApiSuccess(response) && data) {
                setAccount(data);
            } else {
                setAccountError(getApiErrorMessage(response, 'Please try again'));
            }
        } catch (error) {
            console.error('Error loading expense payments:', error);
            setAccountError(error.message || 'Please try again');
        } finally {
            setAccountLoading(false);
        }
    };

    const openPayments = () => {
        setPaymentsOpen(true);
        loadAccount();
    };

    // ------------------------------------------------------------------ presentation helpers
    const openTypePicker = (index) => setTypePicker({ index, open: true });
    const closeTypePicker = () => setTypePicker((p) => (p ? { ...p, open: false } : p));
    const pickType = (name) => {
        if (typePicker) {
            updateExpenseItem(typePicker.index, 'expense_type', name);
        }
        closeTypePicker();
    };

    if (selected) {
        lastSelected.current = selected;
    }
    const detail = selected || lastSelected.current;
    const fullDetail = claimDetail && detail && claimDetail.name === detail.name ? claimDetail : null;
    // the claims list shows a spinner on the first load and on a filter change, not on pull-to-refresh
    const listBusy = !refreshing && (loading || claimsLoading);

    // ------------------------------------------------------------------ new claim form
    const renderSubmitTab = () => (
        <Screen
            refreshing={refreshing}
            onRefresh={onRefresh}
            footer={(
                <View style={styles.footerButtons}>
                    <Button title="Cancel" variant="secondary" onPress={() => setActiveTab('history')} disabled={submitting} style={styles.flex} />
                    <Button
                        title="Submit claim"
                        onPress={handleSubmit}
                        loading={submitting}
                        disabled={submitting || loading || expenses.length === 0}
                        style={styles.flex}
                    />
                </View>
            )}
        >
            {expenses.map((expense, index) => (
                <Group
                    key={expense.key}
                    title={`Expense ${index + 1}`}
                    action={expenses.length > 1 ? 'Remove' : undefined}
                    onAction={() => removeExpenseItem(index)}
                >
                    <View style={styles.formBody}>
                        <SelectField
                            label="Type"
                            value={expense.expense_type}
                            placeholder="Select type"
                            onPress={() => openTypePicker(index)}
                        />
                        <TextField
                            label="Amount (₹)"
                            value={expense.amount}
                            onChangeText={(text) => updateExpenseItem(index, 'amount', cleanAmount(text))}
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
                        <Field label="Receipt photos" hint="At least one photo of the bill">
                            <ReceiptPicker
                                value={photosByLine[expense.key] || []}
                                onChange={setLinePhotos(expense.key)}
                                disabled={submitting}
                            />
                        </Field>
                    </View>
                </Group>
            ))}

            <Button title="Add another expense" variant="secondary" onPress={addExpenseItem} style={styles.addButton} />

            <Group>
                <Row title="Total" right={<Text style={styles.totalValue} numberOfLines={1}>{formatINR(calculateTotal(), 2)}</Text>} />
            </Group>

            <Group title="Remarks">
                <View style={styles.formBody}>
                    <TextField
                        value={remark}
                        onChangeText={setRemark}
                        placeholder="Optional"
                        multiline
                        numberOfLines={3}
                        inputStyle={styles.shortMultiline}
                    />
                </View>
            </Group>
        </Screen>
    );

    // ------------------------------------------------------------------ my claims
    const renderClaimItem = (claim) => {
        const approvedDiffers = claim.approval_status === 'Approved'
            && Number(claim.total_sanctioned_amount) !== Number(claim.total_claimed_amount);
        const photoCount = Number(claim.receipt_count) || 0;
        const tags = [
            stageBelow ? <StageText key="stage" claim={claim} /> : null,
            approvedDiffers ? <Tag key="approved" label={`${formatINR(claim.total_sanctioned_amount)} approved`} /> : null,
            photoCount > 0 ? <Tag key="photos" label={photosLabel(photoCount)} /> : null,
        ].filter(Boolean);
        return (
            <Row
                key={claim.name}
                title={formatINR(claim.total_claimed_amount)}
                subtitle={[dateLabel(claim.posting_date), typesLabel(claim)].filter(Boolean).join('  ·  ')}
                meta={tags.length ? tags : null}
                right={stageBelow ? null : <StageText claim={claim} />}
                onPress={() => openClaim(claim)}
            />
        );
    };

    const renderHistoryTab = () => {
        const filterLabel = STATUS_FILTERS.find((f) => f.value === filterStatus)?.label || '';
        const money = (value) => (summary ? formatINR(value) : '–');
        return (
            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={<Button title="New claim" onPress={() => setActiveTab('submit')} />}
            >
                <StatStrip
                    style={styles.stats}
                    items={[
                        { label: 'In review', value: money(summary?.pending_review_amount) },
                        { label: 'To be paid', value: money(summary?.awaiting_payment_amount) },
                        { label: 'Paid', value: money(summary?.paid_amount) },
                    ]}
                />
                <Group footer="Totals cover all your claims, whatever filter is on.">
                    <Row title="Payments received" onPress={openPayments} />
                    <Row title="Total claimed" value={totalClaimed === null ? '–' : formatINR(totalClaimed)} />
                    <Row title="Total approved" value={totalApproved === null ? '–' : formatINR(totalApproved)} />
                </Group>

                <Text style={styles.sectionTitle}>Claims</Text>
                <Segmented
                    value={filterStatus || 'all'}
                    onChange={(value) => setFilterStatus(value === 'all' ? '' : value)}
                    options={STATUS_FILTERS}
                    style={styles.filter}
                />

                {listBusy ? (
                    <Loading />
                ) : !employeeId && employeeError ? (
                    <EmptyState
                        icon="alert-circle"
                        title="Could not load your employee record"
                        message={employeeError}
                        action="Try again"
                        onAction={onRefresh}
                    />
                ) : claimsError && claims.length === 0 ? (
                    <EmptyState
                        icon="alert-circle"
                        title="Could not load your claims"
                        message={claimsError}
                        action="Try again"
                        onAction={onRefresh}
                    />
                ) : claims.length === 0 ? (
                    <EmptyState
                        icon="file-text"
                        title={filterStatus ? `No ${filterLabel.toLowerCase()} claims` : 'No expense claims'}
                        message={filterStatus ? undefined : 'Claims you submit appear here.'}
                    />
                ) : (
                    <>
                        {/* a failed refresh keeps the last list on screen */}
                        {claimsError ? (
                            <Notice tone="warning" icon="alert-circle" title="Could not refresh the list">{claimsError}</Notice>
                        ) : null}
                        <Group>{claims.map(renderClaimItem)}</Group>
                    </>
                )}
            </Screen>
        );
    };

    // ------------------------------------------------------------------ claim detail
    const renderLine = (line, approved) => (
        <View key={line.name || line.idx} style={styles.line}>
            <View style={styles.lineHead}>
                <View style={styles.lineText}>
                    <Text style={styles.lineTitle}>{line.expense_type || '–'}</Text>
                    <Text style={styles.lineSubtitle}>
                        {[dateLabel(line.expense_date), line.description].filter(Boolean).join('  ·  ')}
                    </Text>
                </View>
                <View style={styles.lineAmounts}>
                    <Text style={styles.lineAmount}>{formatINR(line.amount)}</Text>
                    {approved ? (
                        <Text style={styles.lineApproved}>{`${formatINR(line.sanctioned_amount)} approved`}</Text>
                    ) : null}
                </View>
            </View>
            <View style={styles.lineReceipts}>
                <ReceiptThumbs receipts={line.receipts || []} />
            </View>
        </View>
    );

    const renderDetail = (claim) => {
        if (detailLoading) {
            return <Loading />;
        }
        if (detailError || !fullDetail) {
            return (
                <EmptyState
                    icon="alert-circle"
                    title="Could not load this claim"
                    message={detailError || undefined}
                    action="Try again"
                    onAction={() => loadClaimDetail(claim.name)}
                />
            );
        }
        const d = fullDetail;
        const approved = d.approval_status === 'Approved';
        const rejected = stageOf(d) === 'Rejected';
        const lines = d.lines || [];
        const payments = d.payments || [];
        return (
            <>
                <Group>
                    <Row title="Status" right={<StageText claim={d} />} />
                    <Row title="Date" value={dateLabel(d.posting_date)} />
                    <Row title="Claimed" value={formatINR(d.total_claimed_amount)} />
                    {approved ? <Row title="Approved" value={formatINR(d.total_sanctioned_amount)} /> : null}
                    {approved ? <Row title="Paid" value={formatINR(d.custom_paid_amount)} /> : null}
                    {approved ? <Row title="Still to be paid" value={formatINR(d.outstanding_amount)} /> : null}
                    {d.reviewed_on ? <Row title="Reviewed" value={dateLabel(d.reviewed_on)} /> : null}
                    {d.expense_approver ? <Row title="Approver" value={d.expense_approver_name || d.expense_approver} /> : null}
                </Group>

                {rejected && d.rejection_reason ? (
                    <Group title="Reason for rejection">
                        <Text style={styles.note}>{d.rejection_reason}</Text>
                    </Group>
                ) : null}

                {lines.length > 0 ? (
                    <Group title="Expenses">{lines.map((line) => renderLine(line, approved))}</Group>
                ) : null}

                {payments.length > 0 ? (
                    <Group title="Payments">
                        {payments.map((p, i) => (
                            <Row
                                key={`${p.name}-${i}`}
                                title={dateLabel(p.payout_date)}
                                subtitle={paymentLine(p)}
                                subtitleLines={3}
                                value={formatINR(p.amount)}
                            />
                        ))}
                    </Group>
                ) : null}

                {d.remark ? (
                    <Group title="Remarks">
                        <Text style={styles.note}>{d.remark}</Text>
                    </Group>
                ) : null}
            </>
        );
    };

    const closeButton = (
        <Button title="Close" variant="secondary" onPress={closeClaim} disabled={withdrawing} style={styles.flex} />
    );

    // ------------------------------------------------------------------ payments received
    const renderPayments = () => {
        if (accountLoading) {
            return <Loading />;
        }
        if (accountError || !account) {
            return (
                <EmptyState
                    icon="alert-circle"
                    title="Could not load payments"
                    message={accountError || undefined}
                    action="Try again"
                    onAction={loadAccount}
                />
            );
        }
        const payouts = account.payouts || [];
        return (
            <>
                <Group>
                    <Row title="Still to be paid" value={formatINR(account.outstanding)} />
                    <Row title="Paid so far" value={formatINR(account.total_paid)} />
                </Group>
                {payouts.length === 0 ? (
                    <EmptyState icon="credit-card" title="No payments yet" message="Payments for approved claims appear here." />
                ) : (
                    <Group title="Payments">
                        {payouts.map((p) => (
                            <Row
                                key={p.name}
                                title={dateLabel(p.payout_date)}
                                subtitle={[
                                    [p.payment_mode, p.reference].filter(Boolean).join('  ·  '),
                                    payoutClaimsLine(p.claims),
                                    p.remarks,
                                ].filter(Boolean).join('\n')}
                                subtitleLines={5}
                                value={formatINR(p.amount)}
                            />
                        ))}
                    </Group>
                )}
            </>
        );
    };

    return (
        <View style={styles.flex}>
            {activeTab === 'submit' ? renderSubmitTab() : renderHistoryTab()}

            <Sheet
                visible={Boolean(selected)}
                title={detail ? formatINR(detail.total_claimed_amount) : undefined}
                subtitle={detail?.name}
                onClose={closeClaim}
                dismissable={!withdrawing}
                footer={fullDetail?.can_withdraw ? (
                    <>
                        <Button
                            title="Withdraw claim"
                            variant="danger"
                            onPress={() => confirmWithdraw(fullDetail)}
                            loading={withdrawing}
                            disabled={withdrawing}
                            style={styles.flex}
                        />
                        {closeButton}
                    </>
                ) : closeButton}
            >
                {detail ? renderDetail(detail) : null}
            </Sheet>

            <Sheet
                visible={paymentsOpen}
                title="Payments received"
                onClose={() => setPaymentsOpen(false)}
                footer={<Button title="Close" variant="secondary" onPress={() => setPaymentsOpen(false)} style={styles.flex} />}
            >
                {renderPayments()}
            </Sheet>

            <Sheet visible={Boolean(typePicker?.open)} title="Expense type" onClose={closeTypePicker}>
                {expenseTypes.length === 0 ? (
                    typesError ? (
                        <EmptyState
                            icon="alert-circle"
                            title="Could not load expense types"
                            message={typesError}
                            action="Try again"
                            onAction={loadExpenseTypes}
                        />
                    ) : (
                        <EmptyState icon="list" title="No expense types" />
                    )
                ) : (
                    <Group>
                        {expenseTypes.map((t) => (
                            <Row
                                key={t.name}
                                title={t.name}
                                right={<Check on={Boolean(typePicker) && expenses[typePicker.index]?.expense_type === t.name} />}
                                chevron={false}
                                onPress={() => pickType(t.name)}
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
    stats: { marginBottom: space.md },
    sectionTitle: { ...type.label, marginBottom: space.sm, paddingHorizontal: space.xs },
    filter: { marginBottom: space.md },
    note: { ...type.body, lineHeight: 21, paddingHorizontal: space.lg, paddingVertical: space.md },

    line: { paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: color.surface },
    lineHead: { flexDirection: 'row', alignItems: 'flex-start' },
    lineText: { flex: 1, paddingRight: space.sm },
    lineTitle: { ...type.bodyStrong },
    lineSubtitle: { ...type.secondary, marginTop: 2, lineHeight: 18 },
    lineAmounts: { maxWidth: '50%', alignItems: 'flex-end' },
    lineAmount: { fontSize: 15, color: color.textSecondary, fontVariant: ['tabular-nums'], textAlign: 'right' },
    lineApproved: { ...type.caption, color: color.textSecondary, marginTop: 2, textAlign: 'right', fontVariant: ['tabular-nums'] },
    lineReceipts: { marginTop: space.md },

    formBody: { paddingHorizontal: space.lg, paddingTop: space.lg },
    shortMultiline: { minHeight: 72 },
    addButton: { marginTop: -space.sm, marginBottom: space.xl },
    footerButtons: { flexDirection: 'row', gap: space.sm },
    totalValue: { ...type.bodyStrong, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

export default ExpenseClaimScreen;
