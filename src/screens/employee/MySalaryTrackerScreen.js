// src/screens/employee/MySalaryTrackerScreen.js
//
// The employee's monthly salary records and what has been paid against each. Approved
// records feed the overview totals. "Request pending salary" sends a month to HR for
// review, either with an amount the employee enters or calculated from attendance.
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    StatusText,
    Tag,
    ProgressBar,
    Segmented,
    Sheet,
    Button,
    TextField,
    SelectField,
    EmptyState,
    Loading,
    Notice,
    Icon,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const PAY_TONE = { 'Fully Paid': 'success', 'Partially Paid': 'warning', 'Unpaid': 'danger' };
const REVIEW_TAG = { 'Pending Review': { label: 'In review', tone: 'warning' }, 'Rejected': { label: 'Rejected', tone: 'danger' } };

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

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

// "30000" or "30000.50" -> number; anything else (e.g. "30,000", where parseFloat would read 30) -> NaN
const parseAmount = (text) => {
    const t = String(text || '').trim();
    return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
};

// Options shown inside the sheet in place of a nested picker
const OptionList = ({ options, value, onSelect }) => (
    <Group>
        {options.map((o) => {
            const active = o.value === value;
            return (
                <Row
                    key={`opt-${o.value}`}
                    title={o.label}
                    selected={active}
                    right={active ? <Icon name="check" size={18} color={color.accent} /> : null}
                    chevron={false}
                    onPress={() => onSelect(o.value)}
                />
            );
        })}
    </Group>
);

function MySalaryTrackerScreen({ navigation }) {
    const [records, setRecords] = useState([]);
    const [overview, setOverview] = useState({});
    const [loaded, setLoaded] = useState(false); // first load finished (successfully or not)
    const [loadError, setLoadError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestMonth, setRequestMonth] = useState(MONTHS[new Date().getMonth()]);
    const [requestYear, setRequestYear] = useState(new Date().getFullYear());
    const [entryMode, setEntryMode] = useState('manual'); // 'manual' | 'auto'
    const [manualAmount, setManualAmount] = useState('');
    const [requestRemarks, setRequestRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const submitBusy = useRef(false); // blocks a second Submit tap before the re-render disables it
    const [employeeId, setEmployeeId] = useState(null);
    const [picker, setPicker] = useState(null); // 'month' | 'year' inside the request sheet

    // runs on mount too, so there is no separate mount effect
    useFocusEffect(
        useCallback(() => { loadData(); }, [])
    );

    const loadData = async () => {
        try {
            // Get employee ID
            const empResp = await ApiService.getCurrentEmployee();
            const empData = empResp?.data?.message;
            const empId = empData?.name || empData?.employee_id;
            if (!empId) {
                // without our own employee id an HR login would get everyone's records
                throw new Error((empResp?.success === false && empResp.message) || 'Your employee record was not found');
            }
            setEmployeeId(empId);

            const [listResp, overviewResp] = await Promise.all([
                // employee_id keeps the list to our own months (the server returns everyone's for HR)
                ApiService.getSalaryTrackerList({ employee_id: empId }),
                ApiService.getEmployeeSalaryOverview({ employee_id: empId }),
            ]);
            // the API wrapper never throws: a failed call comes back with success false and the
            // server's message, and must not read as "no salary records"
            if (!listResp?.success) {
                throw new Error(listResp?.message || 'Could not load salary records');
            }

            const listData = listResp?.data?.message || listResp?.data;
            const listArr = listData?.data || [];
            setRecords(Array.isArray(listArr) ? listArr : []);

            // totals are optional; when they fail to load the overview is hidden, not left stale
            const ovData = overviewResp?.success ? (overviewResp.data?.message || overviewResp.data) : null;
            setOverview(ovData?.data || {});
            setLoadError(null);
        } catch (err) {
            console.error('Load salary tracker error:', err);
            setLoadError(err?.message || 'Could not load salary records');
        } finally {
            setLoaded(true);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleRequest = async () => {
        if (!employeeId) {
            showToast({ type: 'error', text1: 'No employee profile', text2: 'Employee not found' });
            return;
        }
        const amount = parseAmount(manualAmount);
        if (entryMode === 'manual' && !(amount > 0)) {
            showToast({ type: 'error', text1: 'Check the amount', text2: 'Enter the pending amount in digits only, e.g. 30000' });
            return;
        }
        if (submitBusy.current) {
            return;
        }
        submitBusy.current = true;
        setSubmitting(true);
        try {
            const params = {
                employee_id: employeeId,
                month: requestMonth,
                year: requestYear,
                remarks: requestRemarks || undefined,
            };
            if (entryMode === 'manual') {
                params.manual_amount = amount;
            }
            const resp = await ApiService.requestPendingSalary(params);
            const data = resp?.data?.message || resp?.data;
            if (data?.status === 'success') {
                showToast({ type: 'success', text1: 'Request sent', text2: data.message });
                setShowRequestModal(false);
                setManualAmount('');
                setRequestRemarks('');
                await loadData();
            } else {
                showToast({ type: 'error', text1: 'Not sent', text2: (resp?.success === false && resp.message) || data?.message || 'Failed to submit' });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Not sent', text2: err.message || 'Failed' });
        } finally {
            submitBusy.current = false;
            setSubmitting(false);
        }
    };

    const openRequest = () => {
        setPicker(null);
        setShowRequestModal(true);
    };

    const closeRequest = () => {
        setShowRequestModal(false);
        setPicker(null);
    };

    // A full-screen spinner only on the first load; later reloads (focus, pull to refresh)
    // keep the list or the empty state on screen
    if (!loaded) {
        return (
            <View style={styles.screen}>
                <Loading label="Loading salary records" />
            </View>
        );
    }

    const renderOverview = () => {
        const totalSalary = Number(overview.total_salary) || 0;
        if (totalSalary <= 0) {
            return null;
        }
        const paidPct = ((Number(overview.total_paid) || 0) / totalSalary) * 100;
        const months = [
            plural(overview.fully_paid_months || 0, 'month paid', 'months paid'),
            `${overview.partially_paid_months || 0} partly paid`,
            `${overview.unpaid_months || 0} unpaid`,
        ].join('  ·  ');
        return (
            <Group title="Overview" footer={months}>
                <Row title="Total salary" value={inr(overview.total_salary)} />
                <Row title="Paid" value={inr(overview.total_paid)} />
                <Row title="Pending" right={<Text style={styles.total} numberOfLines={1}>{inr(overview.total_pending)}</Text>} />
                <View style={styles.progress}>
                    <View style={styles.progressHeader}>
                        <Text style={type.secondary}>Paid so far</Text>
                        <Text style={styles.progressValue}>{`${paidPct.toFixed(1)}%`}</Text>
                    </View>
                    <ProgressBar value={paidPct} tone="success" />
                </View>
            </Group>
        );
    };

    const renderRecord = (item) => {
        const partlyPaid = Number(item.total_paid) > 0 && Number(item.pending_amount) > 0;
        // "Present" counts office, WFH and on-site days, as on the detail screen
        const present = (Number(item.present_days) || 0) + (Number(item.wfh_days) || 0) + (Number(item.onsite_days) || 0);
        const review = REVIEW_TAG[item.status];
        return (
            <Row
                key={item.name}
                title={item.salary_month || [item.month, item.year].filter(Boolean).join(' ') || 'Salary record'}
                subtitle={item.working_days != null ? `${item.working_days} working days  ·  ${present} present` : undefined}
                meta={item.payment_status || review ? (
                    <>
                        {item.payment_status ? (
                            <StatusText label={item.payment_status} tone={PAY_TONE[item.payment_status]} size={12} />
                        ) : null}
                        {partlyPaid ? <Text style={styles.metaText}>{`${inr(item.pending_amount)} pending`}</Text> : null}
                        {review ? <Tag label={review.label} tone={review.tone} /> : null}
                    </>
                ) : null}
                value={inr(item.salary_to_pay)}
                onPress={() => navigation.navigate('SalaryTrackerDetail', { trackerId: item.name })}
            />
        );
    };

    const monthOptions = MONTHS.map((m) => ({ value: m, label: m }));
    const yearOptions = Array.from({ length: new Date().getFullYear() - 2023 }, (_, i) => 2024 + i).map((y) => ({ value: y, label: String(y) }));

    return (
        <View style={styles.screen}>
            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={<Button title="Request pending salary" onPress={openRequest} />}
            >
                {loadError && records.length > 0 ? (
                    <Notice tone="danger" icon="alert-circle" title="Could not refresh">{loadError}</Notice>
                ) : null}

                {renderOverview()}

                {records.length > 0 ? (
                    <Group title="Months">
                        {records.map(renderRecord)}
                    </Group>
                ) : loadError ? (
                    <EmptyState
                        icon="alert-circle"
                        title="Could not load salary records"
                        message={loadError}
                        action="Try again"
                        onAction={onRefresh}
                    />
                ) : (
                    <EmptyState
                        icon="credit-card"
                        title="No salary records"
                        message="Request a pending month, or wait for HR to add one."
                    />
                )}
            </Screen>

            <Sheet
                visible={showRequestModal}
                title={picker === 'month' ? 'Month' : picker === 'year' ? 'Year' : 'Request pending salary'}
                subtitle={picker ? undefined : 'HR reviews the request before it is added'}
                onClose={() => !submitting && closeRequest()}
                dismissable={!submitting}
                footer={picker ? (
                    <Button title="Back" variant="secondary" onPress={() => setPicker(null)} style={styles.flex} />
                ) : (
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeRequest} disabled={submitting} style={styles.flex} />
                        <Button title="Submit" onPress={handleRequest} loading={submitting} style={styles.flex} />
                    </>
                )}
            >
                {picker === 'month' ? (
                    <OptionList options={monthOptions} value={requestMonth} onSelect={(v) => { setRequestMonth(v); setPicker(null); }} />
                ) : picker === 'year' ? (
                    <OptionList options={yearOptions} value={requestYear} onSelect={(v) => { setRequestYear(v); setPicker(null); }} />
                ) : (
                    <>
                        <Segmented
                            value={entryMode}
                            onChange={setEntryMode}
                            options={[
                                { value: 'manual', label: 'Enter amount' },
                                { value: 'auto', label: 'Calculate' },
                            ]}
                        />
                        <Text style={styles.modeHint}>
                            {entryMode === 'manual'
                                ? 'For past months. Enter the amount still owed to you.'
                                : 'Worked out from your attendance and salary structure. Best for recent months.'}
                        </Text>
                        <View style={styles.fieldRow}>
                            <SelectField label="Month" value={requestMonth} onPress={() => setPicker('month')} disabled={submitting} style={styles.monthField} />
                            <SelectField label="Year" value={String(requestYear)} onPress={() => setPicker('year')} disabled={submitting} style={styles.yearField} />
                        </View>
                        {entryMode === 'manual' ? (
                            <TextField
                                label="Pending amount"
                                placeholder="e.g. 30000"
                                keyboardType="numeric"
                                value={manualAmount}
                                onChangeText={setManualAmount}
                            />
                        ) : null}
                        <TextField
                            label="Remarks (optional)"
                            placeholder="e.g. Pending from October, part paid"
                            multiline
                            value={requestRemarks}
                            onChangeText={setRequestRemarks}
                        />
                    </>
                )}
            </Sheet>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: color.bg },
    total: { fontSize: 17, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'], marginLeft: space.sm },
    progress: { paddingHorizontal: space.lg, paddingVertical: space.md },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
    progressValue: { fontSize: 15, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    metaText: { ...type.caption, color: color.textSecondary },
    modeHint: { ...type.caption, color: color.textSecondary, marginTop: space.sm, marginBottom: space.lg, paddingHorizontal: space.xs, lineHeight: 17 },
    fieldRow: { flexDirection: 'row', gap: space.sm },
    // "September" needs more room than "2026" on a 320 dp phone
    monthField: { flex: 3 },
    yearField: { flex: 2 },
});

export default MySalaryTrackerScreen;
