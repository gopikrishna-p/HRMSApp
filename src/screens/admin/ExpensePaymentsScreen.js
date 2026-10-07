// src/screens/admin/ExpensePaymentsScreen.js
//
// Paying employees for approved expense claims. The list shows who is owed money; an
// employee's sheet lists their approved claims in payment order (oldest first) and the
// payments recorded so far. A payment is split by the server over the oldest claims first.
// Opened from the dashboard, or from a claim with `{ employee, employee_name }` to go
// straight to that employee.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import ApiService, { isApiSuccess, extractFrappeData, getApiErrorMessage } from '../../services/api.service';
import { formatLocalDate } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    StatStrip,
    Segmented,
    Sheet,
    Button,
    IconButton,
    Field,
    TextField,
    SelectField,
    EmptyState,
    Loading,
    Notice,
    color,
    space,
    formatShortDate,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PRESETS = [
    { value: 'full', label: 'Full' },
    { value: 'half', label: 'Half' },
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

// 'YYYY-MM-DD' -> '05 Mar 2026' (read as a local date, no timezone shift)
const dateLabel = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}` : String(value || '');
};

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

// 1000 -> "1000", 999.5 -> "999.5" (value for the amount input)
const amountText = (value) => String(Math.round((Number(value) || 0) * 100) / 100);

// digits and one decimal point, at most 2 decimals
const sanitizeAmount = (text) => {
    const parts = String(text || '').replace(/[^0-9.]/g, '').split('.');
    return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('').substring(0, 2)}` : parts[0];
};

function ExpensePaymentsScreen({ navigation, route }) {
    const [payables, setPayables] = useState(null); // { employees, total_outstanding, employees_due }
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    // Employee sheet: 'account' (what is owed, payments) or 'pay' (record a payment)
    const [sheet, setSheet] = useState({ visible: false, employee: null, employeeName: '' });
    const [mode, setMode] = useState('account');
    const [account, setAccount] = useState(null);
    const [accountError, setAccountError] = useState('');
    const [lastPayment, setLastPayment] = useState(null); // { amount, claims, stillOwed } after recording
    const [removing, setRemoving] = useState(null); // payout being removed
    const accountFor = useRef(null); // ignores a response for an employee that is no longer open

    // Payment form
    const [payAmount, setPayAmount] = useState('');
    const [payPreset, setPayPreset] = useState('full');
    const [payDate, setPayDate] = useState(new Date());
    const [showIosDate, setShowIosDate] = useState(false);
    const [payMode, setPayMode] = useState('Bank Transfer');
    const [payRef, setPayRef] = useState('');
    const [payRemarks, setPayRemarks] = useState('');
    const [saving, setSaving] = useState(false);

    const loadPayables = useCallback(async () => {
        try {
            const res = await ApiService.getExpensePayables();
            if (isApiSuccess(res)) {
                setPayables(extractFrappeData(res, {}) || {});
                setError('');
            } else {
                setError(getApiErrorMessage(res, 'Please try again.'));
            }
        } catch (err) {
            setError(err?.message || 'Please try again.');
        }
    }, []);

    const loadAccount = useCallback(async (employee) => {
        accountFor.current = employee;
        setAccountError('');
        try {
            const res = await ApiService.getExpensePaymentAccount(employee);
            if (accountFor.current !== employee) {
                return;
            }
            const data = isApiSuccess(res) ? extractFrappeData(res, null) : null;
            if (data?.employee) {
                setAccount(data);
            } else {
                setAccountError(getApiErrorMessage(res, 'Please try again.'));
            }
        } catch (err) {
            if (accountFor.current === employee) {
                setAccountError(err?.message || 'Please try again.');
            }
        }
    }, []);

    // reload on every focus: claims approved elsewhere show up here
    useFocusEffect(
        useCallback(() => {
            loadPayables().finally(() => setLoading(false));
        }, [loadPayables])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadPayables();
        if (sheet.visible && sheet.employee) {
            loadAccount(sheet.employee);
        }
        setRefreshing(false);
    };

    const openEmployee = useCallback((employee, employeeName) => {
        setAccount(null);
        setAccountError('');
        setLastPayment(null);
        setMode('account');
        setSheet({ visible: true, employee, employeeName: employeeName || '' });
        loadAccount(employee);
    }, [loadAccount]);

    // opened from a claim: go straight to that employee
    useEffect(() => {
        const employee = route?.params?.employee;
        if (employee) {
            openEmployee(employee, route.params.employee_name);
            navigation.setParams?.({ employee: undefined, employee_name: undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the route param only
    }, [route?.params?.employee]);

    const closeSheet = () => {
        if (saving) {
            return;
        }
        if (mode === 'pay') {
            setMode('account');
            setShowIosDate(false);
            return;
        }
        accountFor.current = null;
        setSheet((s) => ({ ...s, visible: false }));
    };

    const owed = Number(account?.outstanding || 0);

    // ------------------------------------------------------------------ payment form
    const openPayForm = () => {
        setPayPreset('full');
        setPayAmount(owed > 0 ? amountText(owed) : '');
        setPayDate(new Date());
        setShowIosDate(false);
        setPayMode('Bank Transfer');
        setPayRef('');
        setPayRemarks('');
        setMode('pay');
    };

    const applyPreset = (preset) => {
        setPayPreset(preset);
        if (owed <= 0) {
            setPayAmount('');
        } else if (preset === 'full') {
            setPayAmount(amountText(owed));
        } else if (preset === 'half') {
            // whole rupees, as on the salary tracker
            setPayAmount(amountText(owed >= 2 ? Math.round(owed / 2) : owed / 2));
        } else {
            setPayAmount('');
        }
    };

    // typing drops the preset highlight so it never disagrees with the field
    const onPayAmountChange = (text) => {
        setPayAmount(sanitizeAmount(text));
        if (payPreset !== 'custom') {
            setPayPreset('custom');
        }
    };

    const pickDate = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: payDate,
                mode: 'date',
                maximumDate: new Date(),
                onChange: (event, d) => event?.type !== 'dismissed' && d && setPayDate(d),
            });
        } else {
            setShowIosDate((v) => !v);
        }
    };

    const recordPayment = async () => {
        const amount = Number(payAmount);
        if (!payAmount || Number.isNaN(amount) || amount <= 0) {
            showToast({ type: 'error', text1: 'Check the amount', text2: 'Enter the amount paid' });
            return;
        }
        if (amount > owed + 0.004) {
            showToast({ type: 'error', text1: 'Check the amount', text2: `More than the ${inr(owed)} owed` });
            return;
        }
        const ymd = formatLocalDate(payDate);
        if (ymd > formatLocalDate(new Date())) {
            showToast({ type: 'error', text1: 'Check the date', text2: "The payment date can't be in the future" });
            return;
        }

        const employee = sheet.employee;
        setSaving(true);
        try {
            const res = await ApiService.recordExpensePayout({
                employee,
                amount: Math.round(amount * 100) / 100,
                payout_date: ymd,
                payment_mode: payMode,
                reference: payRef.trim(),
                remarks: payRemarks.trim(),
            });
            const body = res?.data?.message;
            if (isApiSuccess(res) && body?.status === 'success') {
                showToast({ type: 'success', text1: 'Payment recorded', text2: body.message });
                setLastPayment({
                    amount,
                    claims: Array.isArray(body.claims_paid) ? body.claims_paid : [],
                    stillOwed: Number(body.still_owed || 0),
                });
                setMode('account');
                setShowIosDate(false);
                loadAccount(employee);
                loadPayables();
            } else {
                showToast({ type: 'error', text1: 'Payment not recorded', text2: getApiErrorMessage(res, 'Please try again') });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Payment not recorded', text2: err?.message || 'Please try again' });
        } finally {
            setSaving(false);
        }
    };

    const removePayout = (payout) => {
        const employee = sheet.employee;
        Alert.alert(
            'Remove payment',
            `The ${inr(payout.amount)} paid on ${dateLabel(payout.payout_date)} will be removed and the claims it covered will be owed again.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        setRemoving(payout.name);
                        try {
                            const res = await ApiService.deleteExpensePayout(payout.name);
                            if (isApiSuccess(res)) {
                                showToast({ type: 'success', text1: 'Payment removed', text2: res?.data?.message?.message });
                                setLastPayment(null);
                                loadAccount(employee);
                                loadPayables();
                            } else {
                                showToast({ type: 'error', text1: 'Not removed', text2: getApiErrorMessage(res, 'Please try again') });
                            }
                        } catch (err) {
                            showToast({ type: 'error', text1: 'Not removed', text2: err?.message || 'Please try again' });
                        } finally {
                            setRemoving(null);
                        }
                    },
                },
            ]
        );
    };

    // ------------------------------------------------------------------ sheet content
    const renderAccount = () => {
        if (!account) {
            return accountError ? (
                <EmptyState
                    icon="alert-circle"
                    title="Could not load payments"
                    message={accountError}
                    action="Try again"
                    onAction={() => loadAccount(sheet.employee)}
                />
            ) : (
                <Loading />
            );
        }
        const due = account.due_claims || [];
        const payouts = account.payouts || [];
        return (
            <>
                {lastPayment ? (
                    <Notice tone="success" title={`${inr(lastPayment.amount)} recorded`}>
                        {[
                            lastPayment.claims.length ? `Paid towards ${lastPayment.claims.join(', ')}.` : null,
                            lastPayment.stillOwed > 0.004 ? `${inr(lastPayment.stillOwed)} still owed.` : 'Nothing more is owed.',
                        ].filter(Boolean).join(' ')}
                    </Notice>
                ) : null}

                <StatStrip
                    style={styles.stats}
                    items={[
                        { label: 'Owed', value: inr(account.outstanding) },
                        { label: 'Paid so far', value: inr(account.total_paid) },
                    ]}
                />

                <Group title="To be paid" footer={due.length > 1 ? 'Payments go to the oldest claim first.' : undefined}>
                    {due.length === 0 ? (
                        <Row title="Nothing owed" />
                    ) : (
                        due.map((c) => (
                            <Row
                                key={c.name}
                                title={dateLabel(c.posting_date)}
                                subtitle={[
                                    c.name,
                                    `Approved ${inr(c.sanctioned)}`,
                                    Number(c.paid) > 0 ? `Paid ${inr(c.paid)}` : null,
                                ].filter(Boolean).join('  ·  ')}
                                value={inr(c.outstanding)}
                            />
                        ))
                    )}
                </Group>

                <Group title={payouts.length ? `Payments  ·  ${payouts.length}` : 'Payments'}>
                    {payouts.length === 0 ? (
                        <Row title="No payments yet" />
                    ) : (
                        payouts.map((p) => {
                            const covered = (p.claims || []).map((c) => c.expense_claim).filter(Boolean);
                            return (
                                <Row
                                    key={p.name}
                                    title={dateLabel(p.payout_date)}
                                    subtitle={[
                                        [p.payment_mode, p.reference].filter(Boolean).join('  ·  '),
                                        covered.length ? `Covers ${covered.join(', ')}` : null,
                                        p.remarks,
                                    ].filter(Boolean).join('\n')}
                                    subtitleLines={5}
                                    value={inr(p.amount)}
                                    right={(
                                        <IconButton
                                            name="trash-2"
                                            size={18}
                                            color={color.textTertiary}
                                            label="Remove payment"
                                            disabled={Boolean(removing)}
                                            onPress={() => removePayout(p)}
                                        />
                                    )}
                                />
                            );
                        })
                    )}
                </Group>
            </>
        );
    };

    const renderPayForm = () => {
        const amount = Number(payAmount);
        const left = payAmount && !Number.isNaN(amount) && amount > 0 && amount < owed - 0.004 ? owed - amount : 0;
        return (
            <>
                <TextField
                    label="Amount"
                    placeholder="0"
                    keyboardType="decimal-pad"
                    value={payAmount}
                    onChangeText={onPayAmountChange}
                    editable={!saving}
                    hint={left > 0 ? `${inr(left)} will still be owed` : undefined}
                    style={styles.amountField}
                />
                <Segmented options={PRESETS} value={payPreset} onChange={applyPreset} style={styles.presets} />
                <SelectField label="Date" value={formatShortDate(payDate)} icon="calendar" onPress={pickDate} disabled={saving} />
                {Platform.OS === 'ios' && showIosDate ? (
                    <DateTimePicker
                        mode="date"
                        display="spinner"
                        value={payDate}
                        maximumDate={new Date()}
                        onChange={(_, d) => d && setPayDate(d)}
                    />
                ) : null}
                <Field label="Payment mode">
                    <Segmented options={PAYMENT_MODES} value={payMode} onChange={setPayMode} />
                </Field>
                <TextField
                    label="Reference (optional)"
                    placeholder="Transaction ID or cheque number"
                    value={payRef}
                    onChangeText={setPayRef}
                    editable={!saving}
                />
                <TextField
                    label="Remarks (optional)"
                    placeholder="Notes"
                    multiline
                    value={payRemarks}
                    onChangeText={setPayRemarks}
                    editable={!saving}
                    inputStyle={styles.shortMultiline}
                />
            </>
        );
    };

    // ------------------------------------------------------------------ main
    const employees = payables?.employees || [];
    const employeeName = account?.employee_name || sheet.employeeName || sheet.employee;

    return (
        <View style={styles.screen}>
            {loading ? (
                <Loading label="Loading expense payments" />
            ) : (
                <Screen refreshing={refreshing} onRefresh={onRefresh}>
                    {error ? (
                        <Notice tone="danger" title="Could not load expense payments" onPress={onRefresh}>
                            {error}
                        </Notice>
                    ) : null}

                    {payables ? (
                        <StatStrip
                            style={styles.stats}
                            items={[
                                { label: 'Owed', value: inr(payables.total_outstanding) },
                                { label: 'Employees', value: payables.employees_due || 0 },
                            ]}
                        />
                    ) : null}

                    {employees.length > 0 ? (
                        <Group title="Awaiting payment">
                            {employees.map((e, i) => (
                                <Row
                                    key={`${e.employee}-${i}`}
                                    left={<Avatar name={e.employee_name || e.employee} />}
                                    title={e.employee_name || e.employee}
                                    subtitle={[
                                        plural(e.claims || 0, 'claim', 'claims'),
                                        e.oldest_claim ? `oldest ${dateLabel(e.oldest_claim)}` : null,
                                    ].filter(Boolean).join('  ·  ')}
                                    value={inr(e.outstanding)}
                                    onPress={() => openEmployee(e.employee, e.employee_name)}
                                />
                            ))}
                        </Group>
                    ) : !error ? (
                        <EmptyState icon="check-circle" title="Nothing to pay" message="Approved expense claims waiting for payment appear here." />
                    ) : null}
                </Screen>
            )}

            <Sheet
                visible={sheet.visible}
                title={mode === 'pay' ? 'Record payment' : employeeName}
                subtitle={mode === 'pay'
                    ? `${employeeName}  ·  ${inr(owed)} owed`
                    : sheet.employee}
                onClose={closeSheet}
                dismissable={!saving}
                footer={mode === 'pay' ? (
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeSheet} disabled={saving} style={styles.flex} />
                        <Button title="Record" onPress={recordPayment} loading={saving} style={styles.flex} />
                    </>
                ) : (
                    <>
                        <Button title="Close" variant="secondary" onPress={closeSheet} style={styles.flex} />
                        <Button title="Record payment" onPress={openPayForm} disabled={!account || owed <= 0} style={styles.flex} />
                    </>
                )}
            >
                {mode === 'pay' ? renderPayForm() : renderAccount()}
            </Sheet>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: color.bg },
    stats: { marginBottom: space.xl },
    amountField: { marginBottom: space.sm },
    presets: { marginBottom: space.lg },
    shortMultiline: { minHeight: 72 },
});

export default ExpensePaymentsScreen;
