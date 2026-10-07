// src/screens/employee/SalaryTrackerDetailScreen.js
//
// One month's salary record for the signed-in employee: how the salary was worked out,
// what has been paid, the attendance it was based on and every payment entry. On an
// approved record with a balance, the employee can record an amount they received.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import { formatLocalDate } from '../../utils/dateFormat';
import {
    Screen,
    Group,
    Row,
    StatusText,
    StatStrip,
    ProgressBar,
    Segmented,
    Sheet,
    Button,
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
];

// ₹12,34,567 (Indian grouping); paise only when the amount has them
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

// 'YYYY-MM-DD' -> '05 Mar 2026', read as a local date
const dateLabel = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}` : String(value || '');
};

function SalaryTrackerDetailScreen({ route, navigation }) {
    const { trackerId } = route.params;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // "Record received amount" sheet state
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [receiptAmount, setReceiptAmount] = useState('');
    const [receiptMode, setReceiptMode] = useState('Bank Transfer');
    const [receiptReference, setReceiptReference] = useState('');
    const [receiptRemarks, setReceiptRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    // 'full' | 'half' | 'quarter' | 'custom' — drives the preset highlight in
    // the receipt sheet so the user can fill the most common partial
    // amounts in one tap.
    const [receiptPreset, setReceiptPreset] = useState('full');

    const applyReceiptPreset = (preset) => {
        const pending = Math.max(0, Number(data?.pending_amount || 0));
        setReceiptPreset(preset);
        if (pending <= 0) {
            setReceiptAmount('');
            return;
        }
        if (preset === 'full') {
            setReceiptAmount(pending.toFixed(2));
        } else if (preset === 'half') {
            setReceiptAmount(String(Math.round(pending / 2)));
        } else if (preset === 'quarter') {
            setReceiptAmount(String(Math.round(pending / 4)));
        } else {
            setReceiptAmount(''); // 'custom'
        }
    };

    const onReceiptAmountChange = (text) => {
        setReceiptAmount(text);
        if (receiptPreset !== 'custom') {
            setReceiptPreset('custom');
        }
    };

    // runs on mount too, so there is no separate mount effect
    useFocusEffect(
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on every focus
        useCallback(() => { loadDetail(); }, [])
    );

    // The month is the screen title once the record has loaded
    const monthTitle = data ? (data.salary_month || [data.month, data.year].filter(Boolean).join(' ')) : '';
    useEffect(() => {
        if (monthTitle) {
            navigation.setOptions({ title: monthTitle });
        }
    }, [monthTitle, navigation]);

    const loadDetail = async () => {
        setLoading(true);
        try {
            const resp = await ApiService.getSalaryTrackerDetail({ tracker_id: trackerId });
            const result = resp?.data?.message || resp?.data;
            setData(result?.data || null);
        } catch (err) {
            console.error('Load tracker detail error:', err);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadDetail();
        setRefreshing(false);
    };

    const openReceiptModal = () => {
        // Start with the "Full" preset selected — most common case is
        // "received exactly what was owed", one tap to confirm.
        const pending = Math.max(0, Number(data?.pending_amount || 0));
        setReceiptAmount(pending > 0 ? pending.toFixed(2) : '');
        setReceiptPreset('full');
        setReceiptMode('Bank Transfer');
        setReceiptReference('');
        setReceiptRemarks('');
        setShowReceiptModal(true);
    };

    const submitReceipt = async () => {
        const parsed = parseFloat(receiptAmount);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            showToast({ type: 'error', text1: 'Check the amount', text2: 'Enter a positive received amount.' });
            return;
        }
        const pending = Math.max(0, Number(data?.pending_amount || 0));
        if (pending > 0 && parsed > pending + 0.01) {
            showToast({
                type: 'error',
                text1: 'More than pending',
                text2: `You can record up to ${inr(pending)} (the pending balance).`,
            });
            return;
        }
        setSubmitting(true);
        try {
            const resp = await ApiService.recordReceivedAmountByEmployee({
                tracker_id: trackerId,
                amount: parsed,
                payment_date: formatLocalDate(new Date()),
                payment_mode: receiptMode,
                reference: receiptReference,
                remarks: receiptRemarks,
            });
            const result = resp?.data?.message || resp?.data;
            if (result?.status === 'success') {
                showToast({ type: 'success', text1: 'Receipt recorded', text2: result.message });
                setShowReceiptModal(false);
                await loadDetail();
            } else {
                // on an HTTP error the interceptor puts the server's message on resp.message
                throw new Error((resp?.success === false && resp.message) || result?.message || 'Could not record receipt');
            }
        } catch (err) {
            const msg = err?.response?.data?.exception
                || err?.response?.data?._server_messages
                || err?.message
                || 'Failed to record receipt';
            showToast({ type: 'error', text1: 'Not recorded', text2: String(msg).slice(0, 300) });
        } finally {
            setSubmitting(false);
        }
    };

    // A full-screen spinner only until the record first loads; later reloads keep it on screen
    if (loading && !data) {
        return (
            <View style={styles.screen}>
                <Loading />
            </View>
        );
    }

    if (!data) {
        return (
            <Screen refreshing={refreshing} onRefresh={onRefresh}>
                <EmptyState icon="file-text" title="Record not found" message="Pull down to try again." />
            </Screen>
        );
    }

    const paidPct = data.salary_to_pay > 0 ? ((data.total_paid / data.salary_to_pay) * 100) : 0;
    const payments = data.payments || [];
    const pendingAmount = Number(data.pending_amount || 0);
    const presentTotal = data.attended_days != null
        ? data.attended_days
        : ((data.present_days || 0) + (data.wfh_days || 0) + (data.onsite_days || 0));
    const officeDays = data.office_days != null ? data.office_days : data.present_days;
    // Employee can acknowledge receipt only on Approved records that still have a pending balance.
    const canRecordReceipt = data.status === 'Approved' && pendingAmount > 0;

    return (
        <View style={styles.screen}>
            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={canRecordReceipt ? <Button title="Record amount received" onPress={openReceiptModal} /> : undefined}
            >
                <Group>
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
                    <Row title="Salary to pay" right={<Text style={styles.total}>{inr(data.salary_to_pay)}</Text>} />
                </Group>

                <Group title="Payment">
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
                                { label: 'Present', value: presentTotal || 0 },
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
                        payments.map((p, index) => (
                            <Row
                                key={index}
                                title={p.payment_mode || 'Payment'}
                                subtitle={[
                                    [dateLabel(p.payment_date), p.reference ? `Ref ${p.reference}` : null].filter(Boolean).join('  ·  '),
                                    String(p.remarks || '').replace(/^\[employee\]\s*/, ''),
                                ].filter(Boolean).join('\n') || undefined}
                                subtitleLines={3}
                                value={inr(p.amount)}
                            />
                        ))
                    )}
                </Group>
            </Screen>

            <Sheet
                visible={showReceiptModal}
                title="Record amount received"
                subtitle={`${inr(data.pending_amount)} pending`}
                onClose={() => !submitting && setShowReceiptModal(false)}
                dismissable={!submitting}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={() => setShowReceiptModal(false)} disabled={submitting} style={styles.flex} />
                        <Button title="Confirm" onPress={submitReceipt} loading={submitting} style={styles.flex} />
                    </>
                )}
            >
                <TextField
                    label="Amount received"
                    placeholder="e.g. 25000"
                    keyboardType="decimal-pad"
                    value={receiptAmount}
                    onChangeText={onReceiptAmountChange}
                    style={pendingAmount > 0 ? styles.amountField : undefined}
                />
                {/* Quick presets fill the amount with a share of the pending
                    amount; typing in the field switches back to Custom. */}
                {pendingAmount > 0 ? (
                    <Segmented options={PRESETS} value={receiptPreset} onChange={applyReceiptPreset} style={styles.presets} />
                ) : null}
                <Field label="Payment mode">
                    <Segmented options={PAYMENT_MODES} value={receiptMode} onChange={setReceiptMode} />
                </Field>
                <TextField
                    label="Reference (optional)"
                    placeholder="UTR or transaction ID"
                    value={receiptReference}
                    onChangeText={setReceiptReference}
                />
                <TextField
                    label="Remarks (optional)"
                    placeholder="Anything HR should know"
                    multiline
                    value={receiptRemarks}
                    onChangeText={setReceiptRemarks}
                />
            </Sheet>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: color.bg },
    amountField: { marginBottom: space.sm },
    presets: { marginBottom: space.lg },
    total: { fontSize: 17, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'], marginLeft: space.sm },
    progress: { paddingHorizontal: space.lg, paddingVertical: space.md },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
    progressValue: { fontSize: 15, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    statsBlock: { backgroundColor: color.surface },
    flatStrip: { borderWidth: 0, borderRadius: 0 },
    stripDivider: { height: StyleSheet.hairlineWidth, backgroundColor: color.divider, marginHorizontal: space.lg },
});

export default SalaryTrackerDetailScreen;
