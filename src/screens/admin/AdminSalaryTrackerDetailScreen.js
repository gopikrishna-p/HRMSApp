// src/screens/admin/AdminSalaryTrackerDetailScreen.js
//
// One Employee Salary Tracker record: the salary worked out for the month, what has been
// paid against it, the attendance it was based on and every payment entry. Records an
// employee submitted themselves ("Pending Review") are approved or rejected here.
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import { todayLocalYMD } from '../../utils/dateFormat';
import {
    Screen,
    Group,
    Row,
    Avatar,
    StatusText,
    Tag,
    StatStrip,
    ProgressBar,
    Segmented,
    Sheet,
    Button,
    IconButton,
    Field,
    TextField,
    EmptyState,
    Loading,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PAY_TONE = { 'Fully Paid': 'success', 'Partially Paid': 'warning', 'Unpaid': 'danger' };
const APPROVAL_TONE = { 'Approved': 'success', 'Pending Review': 'warning', 'Rejected': 'danger', 'Draft': 'neutral' };

const PRESETS = [
    { value: 'full', label: 'Full' },
    { value: 'half', label: 'Half' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'custom', label: 'Custom' },
];

const PAYMENT_MODES = [
    { value: 'Bank Transfer', label: 'Bank' },
    { value: 'Cash', label: 'Cash' },
    { value: 'UPI', label: 'UPI' },
    { value: 'Cheque', label: 'Cheque' },
    { value: 'Other', label: 'Other' },
];

// ₹1,50,000 (Indian grouping); paise are shown only when the amount has them
const inr = (value) => {
    const n = Number(value) || 0;
    const paise = Math.round(Math.abs(n) * 100);
    const s = String(Math.floor(paise / 100));
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
    const frac = paise % 100 ? `.${String(paise % 100).padStart(2, '0')}` : '';
    return `${n < 0 && paise ? '-' : ''}₹${grouped}${frac}`;
};
const minus = (value) => (Number(value) > 0 ? `−${inr(value)}` : inr(value));

// The API wrapper never throws on HTTP errors; the server's message is in `response.message`
// (a frappe.throw comes back as HTTP 417 with no `status` in the body).
const failMessage = (resp, result, fallback = 'Failed') => {
    const msg = resp?.message || result?.message;
    return typeof msg === 'string' && msg.trim() ? msg.trim() : fallback;
};

// a real calendar date typed as 'YYYY-MM-DD' (read as a local date, never through the Date parser)
const isValidYMD = (value) => {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return false;
    }
    const [y, m, d] = text.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

// 'YYYY-MM-DD' -> '05 Mar 2026'
const dateLabel = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}` : String(value || '');
};

function AdminSalaryTrackerDetailScreen({ route, navigation }) {
    const { trackerId } = route.params;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [approving, setApproving] = useState(null); // 'approve' | 'reject' while the request runs
    const [loadError, setLoadError] = useState(null);
    const [deleting, setDeleting] = useState(false);
    // blocks a second approve / payment / delete before the buttons re-render as busy
    const busy = useRef(false);
    const loadRequest = useRef(0);

    // Payment sheet
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [payAmount, setPayAmount] = useState('');
    const [payDate, setPayDate] = useState(todayLocalYMD());
    const [payMode, setPayMode] = useState('Bank Transfer');
    const [payRef, setPayRef] = useState('');
    const [payRemarks, setPayRemarks] = useState('');
    const [payLoading, setPayLoading] = useState(false);
    // 'full' | 'half' | 'quarter' | 'custom' — drives the preset highlight in
    // the payment sheet. Defaults to 'custom' so nothing is pre-set; choosing
    // a preset both fills the amount and highlights it.
    const [payPreset, setPayPreset] = useState('custom');

    // Recompute the amount when a preset is chosen. Quarter/half are
    // rounded to whole rupees (no fractional paisa) — admins keep partial-
    // payment splits on round numbers.
    const applyPaymentPreset = (preset) => {
        const pending = Number(data?.pending_amount || 0);
        setPayPreset(preset);
        if (pending <= 0) {
            setPayAmount('');
            return;
        }
        if (preset === 'full') {
            setPayAmount(String(pending.toFixed(2)));
        } else if (preset === 'half') {
            setPayAmount(String(Math.round(pending / 2)));
        } else if (preset === 'quarter') {
            setPayAmount(String(Math.round(pending / 4)));
        } else {
            setPayAmount(''); // 'custom'
        }
    };

    // When the user types into the amount input directly, drop the preset
    // highlight so the presets don't lie about what's in the field.
    const onPayAmountChange = (text) => {
        setPayAmount(text);
        if (payPreset !== 'custom') {
            setPayPreset('custom');
        }
    };

    // loads on mount too (focus), so no separate mount effect
    useFocusEffect(
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on every focus
        useCallback(() => { loadDetail(); }, [])
    );

    // Full-screen loading is only for the first load; reloads keep the record on screen.
    const loadDetail = async () => {
        const requestId = ++loadRequest.current;
        try {
            const resp = await ApiService.getSalaryTrackerDetail({ tracker_id: trackerId });
            if (requestId !== loadRequest.current) {
                return;
            }
            const result = resp?.data?.message || resp?.data;
            const record = resp?.success ? result?.data || null : null;
            setData(record);
            setLoadError(record ? null : failMessage(resp, null, 'Could not load this record'));
        } catch (err) {
            console.error('Load tracker detail error:', err);
            if (requestId === loadRequest.current) {
                setData(null);
                setLoadError('Could not load this record');
            }
        } finally {
            if (requestId === loadRequest.current) {
                setLoading(false);
            }
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadDetail();
        setRefreshing(false);
    };

    const handleApprove = async (action) => {
        try {
            const resp = await ApiService.approveSalaryTracker({
                tracker_id: trackerId,
                action: action,
            });
            const result = resp?.data?.message || resp?.data;
            if (resp?.success && result?.status === 'success') {
                showToast({ type: 'success', text1: action === 'approve' ? 'Approved' : 'Rejected', text2: result.message });
                await loadDetail();
            } else {
                showToast({ type: 'error', text1: 'Not updated', text2: failMessage(resp, result) });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Not updated', text2: err.message || 'Failed' });
        }
    };

    const decide = async (action) => {
        if (busy.current) {
            return;
        }
        busy.current = true;
        setApproving(action);
        await handleApprove(action);
        busy.current = false;
        setApproving(null);
    };

    const handleRecordPayment = async () => {
        if (!payAmount || isNaN(parseFloat(payAmount)) || parseFloat(payAmount) <= 0) {
            showToast({ type: 'error', text1: 'Check the amount', text2: 'Enter a valid amount' });
            return;
        }
        if (!isValidYMD(payDate)) {
            showToast({ type: 'error', text1: 'Check the date', text2: 'Enter the payment date as YYYY-MM-DD' });
            return;
        }
        if (busy.current) {
            return;
        }
        busy.current = true;
        setPayLoading(true);
        try {
            const resp = await ApiService.recordSalaryPayment({
                tracker_id: trackerId,
                amount: parseFloat(payAmount),
                payment_date: payDate.trim(),
                payment_mode: payMode,
                reference: payRef,
                remarks: payRemarks,
            });
            const result = resp?.data?.message || resp?.data;
            if (resp?.success && result?.status === 'success') {
                showToast({ type: 'success', text1: 'Payment recorded', text2: result.message });
                setShowPaymentModal(false);
                setPayAmount('');
                setPayPreset('custom');
                setPayRef('');
                setPayRemarks('');
                loadDetail();
            } else {
                showToast({ type: 'error', text1: 'Not recorded', text2: failMessage(resp, result) });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Not recorded', text2: err.message || 'Failed' });
        } finally {
            busy.current = false;
            setPayLoading(false);
        }
    };

    const handleDeletePayment = (rowIdx) => {
        if (busy.current) {
            return;
        }
        Alert.alert(
            'Delete payment',
            'This payment entry will be removed and the pending amount updated.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive', onPress: async () => {
                        // row indexes shift after a delete: never run two at once
                        if (busy.current) {
                            return;
                        }
                        busy.current = true;
                        setDeleting(true);
                        try {
                            const resp = await ApiService.deleteSalaryPayment({
                                tracker_id: trackerId,
                                row_idx: rowIdx,
                            });
                            const result = resp?.data?.message || resp?.data;
                            if (resp?.success && result?.status === 'success') {
                                showToast({ type: 'success', text1: 'Payment deleted', text2: result.message });
                                await loadDetail();
                            } else {
                                showToast({ type: 'error', text1: 'Not deleted', text2: failMessage(resp, result) });
                            }
                        } catch (err) {
                            showToast({ type: 'error', text1: 'Not deleted', text2: err.message || 'Failed' });
                        } finally {
                            busy.current = false;
                            setDeleting(false);
                        }
                    },
                },
            ]
        );
    };

    // eslint-disable-next-line no-unused-vars -- not offered on this screen; kept with the other tracker actions
    const handleRecalculate = async () => {
        try {
            const resp = await ApiService.recalculateSalaryTracker({ tracker_id: trackerId });
            const result = resp?.data?.message || resp?.data;
            if (resp?.success && result?.status === 'success') {
                showToast({ type: 'success', text1: 'Recalculated', text2: result.message });
                loadDetail();
            } else {
                showToast({ type: 'error', text1: 'Not recalculated', text2: failMessage(resp, result) });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Not recalculated', text2: err.message });
        }
    };

    if (loading) {
        return (
            <View style={styles.screen}>
                <Loading />
            </View>
        );
    }

    if (!data) {
        return (
            <Screen refreshing={refreshing} onRefresh={onRefresh}>
                <EmptyState
                    icon="file-text"
                    title="Could not load this record"
                    message={loadError || 'Pull down to try again.'}
                    action="Try again"
                    onAction={onRefresh}
                />
            </Screen>
        );
    }

    const salaryToPay = Number(data.salary_to_pay) || 0;
    const paidPct = salaryToPay > 0 ? Math.max(0, ((Number(data.total_paid) || 0) / salaryToPay) * 100) : 0;
    const payments = data.payments || [];
    const isPendingReview = data.status === 'Pending Review';
    const pendingAmount = Number(data.pending_amount || 0);
    const presentDays = data.attended_days != null
        ? data.attended_days
        : ((data.present_days || 0) + (data.wfh_days || 0) + (data.onsite_days || 0));
    const officeDays = data.office_days != null ? data.office_days : data.present_days;

    const canRecordPayment = data.status === 'Approved' && Number(data.pending_amount) > 0;
    const footer = isPendingReview ? (
        <View style={styles.footerRow}>
            <Button title="Reject" variant="danger" onPress={() => decide('reject')} loading={approving === 'reject'} disabled={Boolean(approving)} style={styles.flex} />
            <Button title="Approve" onPress={() => decide('approve')} loading={approving === 'approve'} disabled={Boolean(approving)} style={styles.flex} />
        </View>
    ) : canRecordPayment ? (
        <Button title="Record payment" onPress={() => setShowPaymentModal(true)} />
    ) : null;

    return (
        <View style={styles.screen}>
            <Screen refreshing={refreshing} onRefresh={onRefresh} footer={footer}>
                <Group>
                    <Row
                        left={<Avatar name={data.employee_name} size={40} />}
                        title={data.employee_name || data.employee}
                        titleLines={2}
                        subtitle={[
                            [data.salary_month || [data.month, data.year].filter(Boolean).join(' '), data.employee].filter(Boolean).join('  ·  '),
                            [data.designation, String(data.department || '').replace(' - DG', '')].filter(Boolean).join('  ·  '),
                        ].filter(Boolean).join('\n')}
                    />
                    <Row title="Payment" right={data.payment_status ? <StatusText label={data.payment_status} tone={PAY_TONE[data.payment_status]} /> : null} />
                    <Row title="Approval" right={data.status ? <StatusText label={data.status} tone={APPROVAL_TONE[data.status] || 'neutral'} /> : null} />
                </Group>

                {/* Salary breakdown, in the order of the All-Employees Excel columns
                    O–U: Total Earnings → TDS → WFH → Absent → Total Deductions →
                    Salary to Pay, so the math reads top-to-bottom. */}
                <Group title="Salary">
                    <Row title="Total earnings" value={inr(data.total_earnings)} />
                    <Row title="TDS" value={minus(data.tds_deduction)} />
                    <Row title="WFH deduction" value={minus(data.wfh_deduction)} />
                    <Row title="Absent deduction" value={minus(data.absent_deduction)} />
                    <Row title="Total deductions" value={minus(data.total_deductions)} />
                </Group>
                <Group>
                    <Row title="Salary to pay" titleLines={2} right={<Text style={styles.total} numberOfLines={1}>{inr(data.salary_to_pay)}</Text>} />
                </Group>

                <Group
                    title="Payment"
                    action={undefined}
                    onAction={() => setShowPaymentModal(true)}
                >
                    <Row title="Paid" value={inr(data.total_paid)} />
                    <Row title="Pending" value={inr(data.pending_amount)} />
                    <View style={styles.progress}>
                        <View style={styles.progressHeader}>
                            <Text style={type.secondary}>Paid so far</Text>
                            <Text style={styles.progressValue}>{`${paidPct.toFixed(1)}%`}</Text>
                        </View>
                        <ProgressBar value={paidPct} tone="success" />
                    </View>
                </Group>

                {/* Attendance, as in Excel columns F–O. Present = Office + WFH +
                    On site, the composite used for the absent-shortfall calc. */}
                <Group title="Attendance">
                    <View style={styles.statsBlock}>
                        <StatStrip
                            style={styles.flatStrip}
                            items={[
                                { label: 'Working', value: data.working_days || 0 },
                                { label: 'Present', value: presentDays || 0 },
                                { label: 'Office', value: officeDays || 0 },
                            ]}
                        />
                        <View style={styles.stripDivider} />
                        <StatStrip
                            style={styles.flatStrip}
                            items={[
                                { label: 'WFH', value: data.wfh_days || 0 },
                                { label: 'On site', value: data.onsite_days || 0 },
                                { label: 'Absent', value: data.absent_days || 0, tone: data.absent_days ? 'danger' : undefined },
                            ]}
                        />
                    </View>
                </Group>

                <Group title={payments.length ? `Payment history  ·  ${payments.length}` : 'Payment history'}>
                    {payments.length === 0 ? (
                        <Row title="No payments recorded yet" />
                    ) : (
                        payments.map((p, index) => {
                            // Employee-recorded receipts are tagged with a
                            // "[employee]" prefix in remarks by the backend.
                            // Strip it for display and show a small tag so
                            // admin can spot self-acknowledged entries.
                            const rawRemarks = p.remarks || '';
                            const isEmployeeRecorded = rawRemarks.startsWith('[employee]');
                            const displayRemarks = isEmployeeRecorded
                                ? rawRemarks.replace(/^\[employee\]\s*/, '')
                                : rawRemarks;
                            return (
                                // amount as the title: a value column next to the delete button
                                // left too little room for the payment details on narrow phones
                                <Row
                                    key={p.idx ?? `p-${index}`}
                                    title={inr(p.amount)}
                                    subtitle={[
                                        [p.payment_mode, dateLabel(p.payment_date)].filter(Boolean).join('  ·  '),
                                        p.reference ? `Ref ${p.reference}` : null,
                                        displayRemarks,
                                        p.recorded_by ? `By ${p.recorded_by}` : null,
                                    ].filter(Boolean).join('\n') || undefined}
                                    subtitleLines={5}
                                    meta={isEmployeeRecorded ? <Tag label="Recorded by employee" tone="info" /> : null}
                                    right={(
                                        <IconButton
                                            name="trash-2"
                                            size={18}
                                            color={color.textTertiary}
                                            label="Delete payment"
                                            disabled={deleting}
                                            onPress={() => handleDeletePayment(p.idx)}
                                        />
                                    )}
                                />
                            );
                        })
                    )}
                </Group>
            </Screen>

            <Sheet
                visible={showPaymentModal}
                title="Record payment"
                subtitle={`${inr(data.pending_amount)} pending`}
                onClose={() => !payLoading && setShowPaymentModal(false)}
                dismissable={!payLoading}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={() => setShowPaymentModal(false)} disabled={payLoading} style={styles.flex} />
                        <Button title="Record payment" onPress={handleRecordPayment} loading={payLoading} style={styles.flex} />
                    </>
                )}
            >
                <TextField
                    label="Amount"
                    placeholder="Enter amount"
                    keyboardType="numeric"
                    value={payAmount}
                    onChangeText={onPayAmountChange}
                    style={pendingAmount > 0 ? styles.amountField : undefined}
                />
                {/* Quick presets fill the amount with a share of the pending
                    amount; typing in the field switches back to Custom. */}
                {pendingAmount > 0 ? (
                    <Segmented options={PRESETS} value={payPreset} onChange={applyPaymentPreset} style={styles.presets} />
                ) : null}
                <TextField
                    label="Payment date"
                    placeholder="YYYY-MM-DD"
                    value={payDate}
                    onChangeText={setPayDate}
                />
                <Field label="Payment mode">
                    <Segmented options={PAYMENT_MODES} value={payMode} onChange={setPayMode} />
                </Field>
                <TextField
                    label="Reference (optional)"
                    placeholder="Transaction ID or cheque number"
                    value={payRef}
                    onChangeText={setPayRef}
                />
                <TextField
                    label="Remarks (optional)"
                    placeholder="Notes"
                    multiline
                    value={payRemarks}
                    onChangeText={setPayRemarks}
                />
            </Sheet>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: color.bg },
    footerRow: { flexDirection: 'row', gap: space.sm },
    amountField: { marginBottom: space.sm },
    presets: { marginBottom: space.lg },
    total: { fontSize: 17, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    progress: { paddingHorizontal: space.lg, paddingVertical: space.md },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
    progressValue: { fontSize: 15, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    statsBlock: { backgroundColor: color.surface },
    flatStrip: { borderWidth: 0, borderRadius: 0 },
    stripDivider: { height: StyleSheet.hairlineWidth, backgroundColor: color.divider, marginHorizontal: space.lg },
});

export default AdminSalaryTrackerDetailScreen;
