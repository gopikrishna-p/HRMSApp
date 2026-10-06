// src/screens/admin/AdminSalaryTrackerScreen.js
//
// Monthly salary records (Employee Salary Tracker) with what has been paid and what is
// still pending. "Pending review" holds records employees submitted themselves; approving
// or rejecting one takes effect immediately. "Add salaries" creates a month's records for
// every employee (optionally one department), or a pending-salary record for the admin's
// own employee profile.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    StatusText,
    Segmented,
    Sheet,
    Button,
    TextField,
    SelectField,
    EmptyState,
    Loading,
    Icon,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const PAYMENT_STATUSES = ['Unpaid', 'Partially Paid', 'Fully Paid'];
const PAY_TONE = { 'Fully Paid': 'success', 'Partially Paid': 'warning', 'Unpaid': 'danger' };

// ₹1,50,000: Indian grouping, whole rupees
const inr = (value) => {
    const n = Math.round(Number(value) || 0);
    const s = String(Math.abs(n));
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
    return `${n < 0 ? '-' : ''}₹${grouped}`;
};

const monthOf = (item) => item?.salary_month || `${item?.month} ${item?.year}`;
const deptLabel = (dept) => String(dept || '').replace(' - DG', '');

// Options shown inside a sheet in place of a nested picker
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

function AdminSalaryTrackerScreen({ navigation, route }) {
    const [tab, setTab] = useState('all'); // 'all' | 'pending'
    const [records, setRecords] = useState([]);
    const [pendingReviews, setPendingReviews] = useState([]);
    const [summary, setSummary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [filterMonth, setFilterMonth] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [tempFilterMonth, setTempFilterMonth] = useState('');
    const [tempFilterStatus, setTempFilterStatus] = useState('');
    const [filterPicker, setFilterPicker] = useState(null); // 'month' | 'status'

    // Add sheet
    const [showAddModal, setShowAddModal] = useState(false);
    const [addMode, setAddMode] = useState('bulk'); // 'bulk' | 'self'
    const [addMonth, setAddMonth] = useState(MONTHS[new Date().getMonth()]);
    const [addYear, setAddYear] = useState(new Date().getFullYear());
    const [addDept, setAddDept] = useState('');
    const [selfAmount, setSelfAmount] = useState('');
    const [selfRemarks, setSelfRemarks] = useState('');
    const [departments, setDepartments] = useState([]);
    const [addLoading, setAddLoading] = useState(false);
    const [adminEmployeeId, setAdminEmployeeId] = useState(null);
    const [addPicker, setAddPicker] = useState(null); // 'month' | 'year' | 'department'

    // Review sheet for an employee-submitted record
    const [reviewing, setReviewing] = useState(null);
    const [processing, setProcessing] = useState(null); // 'approve' | 'reject'

    useEffect(() => {
        loadData();
        loadDepartments();
        loadAdminEmployee();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
    }, []);

    // When AdminDashboard's "My Salary Tracker" shortcut routes here with
    // `{ preselectEmployee: <admin's own id> }`, jump straight into the
    // self-request Add sheet so admin can submit their own pending-salary
    // request without scrolling through everyone else's records.
    useEffect(() => {
        if (route?.params?.preselectEmployee) {
            setAddMode('self');
            setShowAddModal(true);
            // Clear the param so a subsequent focus doesn't re-open the sheet
            // after the user dismisses it. Safe because we already captured intent.
            navigation.setParams?.({ preselectEmployee: undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the route param only
    }, [route?.params?.preselectEmployee]);

    useFocusEffect(
        // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData reads these filters; reload when they change
        useCallback(() => { loadData(); }, [filterMonth, filterStatus])
    );

    const loadAdminEmployee = async () => {
        try {
            const resp = await ApiService.getCurrentEmployee();
            const empData = resp?.data?.message;
            setAdminEmployeeId(empData?.name || empData?.employee_id || null);
        } catch (err) { /* admin may not have employee record */ }
    };

    const loadDepartments = async () => {
        try {
            const resp = await ApiService.getDepartments();
            const data = resp?.data?.message || resp?.data?.data || [];
            setDepartments(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Load departments error:', err);
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const filters = {};
            if (filterMonth) {
                filters.month = filterMonth;
            }
            if (filterStatus) {
                filters.payment_status = filterStatus;
            }

            const [listResp, pendingResp, summaryResp] = await Promise.all([
                ApiService.getSalaryTrackerList(filters),
                ApiService.getPendingReviewTrackers(),
                ApiService.getPendingSalarySummary(),
            ]);

            // Stable comparator on the trailing numeric segment of the
            // Employee ID (HR-EMP-00001 → 00037). Used to sort the three
            // lists below so admin sees records grouped by employee in a
            // predictable order.
            const empIdNum = (s) => {
                const m = String(s || '').match(/(\d+)\s*$/);
                return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
            };
            const byEmpId = (a, b) => empIdNum(a?.employee) - empIdNum(b?.employee);

            const listData = listResp?.data?.message || listResp?.data;
            const listArr = listData?.data || [];
            const sortedList = (Array.isArray(listArr) ? [...listArr] : []).sort(byEmpId);
            setRecords(sortedList);

            const pendingData = pendingResp?.data?.message || pendingResp?.data;
            const pendingArr = pendingData?.data || [];
            const sortedPending = (Array.isArray(pendingArr) ? [...pendingArr] : []).sort(byEmpId);
            setPendingReviews(sortedPending);

            const sumData = summaryResp?.data?.message || summaryResp?.data;
            const sumObj = sumData?.data || {};
            const rawSummary = Array.isArray(sumObj?.employees) ? sumObj.employees : (Array.isArray(sumObj) ? sumObj : []);
            // Per-employee summary uses `employee_id` (not `employee`) — sort
            // by the trailing numeric segment so the top-5 list shows in
            // employee-ID order.
            const sortedSummary = [...rawSummary].sort(
                (a, b) => empIdNum(a?.employee_id || a?.employee) - empIdNum(b?.employee_id || b?.employee)
            );
            setSummary(sortedSummary);
        } catch (err) {
            console.error('Load admin salary tracker error:', err);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleAddMonth = async () => {
        setAddLoading(true);
        try {
            const resp = await ApiService.addMonthlySalaries({
                month: addMonth,
                year: addYear,
                department: addDept || undefined,
            });
            const data = resp?.data?.message || resp?.data;
            if (data?.status === 'success') {
                showToast({ type: 'success', text1: 'Salaries added', text2: data.message });
                setShowAddModal(false);
                loadData();
            } else {
                showToast({ type: 'error', text1: 'Not added', text2: data?.message || 'Failed' });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Not added', text2: err.message || 'Failed' });
        } finally {
            setAddLoading(false);
        }
    };

    const handleAddSelf = async () => {
        if (!adminEmployeeId) {
            showToast({ type: 'error', text1: 'No employee profile', text2: 'No employee record found for your account' });
            return;
        }
        if (!selfAmount || isNaN(parseFloat(selfAmount)) || parseFloat(selfAmount) <= 0) {
            showToast({ type: 'error', text1: 'Check the amount', text2: 'Enter a valid salary amount' });
            return;
        }
        setAddLoading(true);
        try {
            const resp = await ApiService.requestPendingSalary({
                employee_id: adminEmployeeId,
                month: addMonth,
                year: addYear,
                manual_amount: parseFloat(selfAmount),
                remarks: selfRemarks || undefined,
            });
            const data = resp?.data?.message || resp?.data;
            if (data?.status === 'success') {
                showToast({ type: 'success', text1: 'Salary added', text2: data.message });
                setShowAddModal(false);
                setSelfAmount('');
                setSelfRemarks('');
                loadData();
            } else {
                showToast({ type: 'error', text1: 'Not added', text2: data?.message || 'Failed' });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Not added', text2: err.message || 'Failed' });
        } finally {
            setAddLoading(false);
        }
    };

    // Returns true when the server accepted the decision (used to close the review sheet).
    const handleApprove = async (trackerId, action) => {
        try {
            const resp = await ApiService.approveSalaryTracker({
                tracker_id: trackerId,
                action: action,
            });
            const data = resp?.data?.message || resp?.data;
            if (data?.status === 'success') {
                showToast({ type: 'success', text1: action === 'approve' ? 'Approved' : 'Rejected', text2: data.message });
                loadData();
                return true;
            }
            showToast({ type: 'error', text1: 'Not updated', text2: data?.message || 'Failed' });
        } catch (err) {
            showToast({ type: 'error', text1: 'Not updated', text2: err.message });
        }
        return false;
    };

    const decide = async (action) => {
        if (!reviewing) {
            return;
        }
        setProcessing(action);
        const ok = await handleApprove(reviewing.name, action);
        setProcessing(null);
        if (ok) {
            setReviewing(null);
        }
    };

    const openFilters = () => {
        setTempFilterMonth(filterMonth);
        setTempFilterStatus(filterStatus);
        setFilterPicker(null);
        setShowFilterModal(true);
    };

    const applyFilters = () => {
        setFilterMonth(tempFilterMonth);
        setFilterStatus(tempFilterStatus);
        setShowFilterModal(false);
        // the focus effect reloads when the filters change
    };

    const clearFilters = () => {
        setTempFilterMonth('');
        setTempFilterStatus('');
        setFilterMonth('');
        setFilterStatus('');
        setShowFilterModal(false);
    };

    const openAdd = () => {
        setAddPicker(null);
        setShowAddModal(true);
    };

    const closeAdd = () => {
        setShowAddModal(false);
        setAddPicker(null);
    };

    const totalPending = summary.reduce((sum, e) => sum + (e.total_pending || 0), 0);
    const totalSalary = summary.reduce((sum, e) => sum + (e.total_salary || 0), 0);
    const totalPaid = summary.reduce((sum, e) => sum + (e.total_paid || 0), 0);
    const hasFilters = filterMonth || filterStatus;

    const monthOptions = MONTHS.map((m) => ({ value: m, label: m }));
    const yearOptions = Array.from({ length: new Date().getFullYear() - 2023 }, (_, i) => 2024 + i).map((y) => ({ value: y, label: String(y) }));
    const departmentOptions = [
        { value: '', label: 'All departments' },
        ...departments.map((d) => {
            const name = typeof d === 'string' ? d : d.name;
            return { value: name, label: name };
        }),
    ];

    if (loading && records.length === 0) {
        return (
            <View style={styles.screen}>
                <Loading label="Loading salary tracker" />
            </View>
        );
    }

    // ------------------------------------------------------------------ rows
    const renderRecordRow = (item) => {
        const partlyPaid = Number(item.total_paid) > 0 && Number(item.pending_amount) > 0;
        return (
            <Row
                key={item.name}
                left={<Avatar name={item.employee_name} />}
                title={item.employee_name}
                subtitle={monthOf(item)}
                meta={item.payment_status ? (
                    <>
                        <StatusText label={item.payment_status} tone={PAY_TONE[item.payment_status]} size={12} />
                        {partlyPaid ? <Text style={styles.metaText}>{`${inr(item.pending_amount)} pending`}</Text> : null}
                    </>
                ) : null}
                value={inr(item.salary_to_pay)}
                onPress={() => navigation.navigate('AdminSalaryTrackerDetail', { trackerId: item.name })}
            />
        );
    };

    const renderAll = () => (
        <>
            <Group title="Outstanding">
                <Row title="Salary" value={inr(totalSalary)} />
                <Row title="Paid" value={inr(totalPaid)} />
                <Row title="Pending" right={<Text style={styles.total}>{inr(totalPending)}</Text>} />
            </Group>

            {summary.length > 0 ? (
                <Group
                    title="Pending by employee"
                    footer={summary.length > 5 ? `${summary.length - 5} more ${summary.length - 5 === 1 ? 'employee' : 'employees'} not shown` : undefined}
                >
                    {summary.slice(0, 5).map((emp, idx) => {
                        const months = emp.tracker_count ?? emp.total_months;
                        return (
                            <Row
                                key={emp.employee_id || emp.employee || idx}
                                left={<Avatar name={emp.employee_name} />}
                                title={emp.employee_name}
                                subtitle={[
                                    deptLabel(emp.department) || '-',
                                    months != null ? `${months} ${Number(months) === 1 ? 'month' : 'months'}` : null,
                                ].filter(Boolean).join('  ·  ')}
                                value={inr(emp.total_pending)}
                            />
                        );
                    })}
                </Group>
            ) : null}

            {records.length > 0 ? (
                <Group title={`${records.length} ${records.length === 1 ? 'record' : 'records'}`}>
                    {records.map(renderRecordRow)}
                </Group>
            ) : (
                <EmptyState
                    icon="credit-card"
                    title="No salary records"
                    message={hasFilters ? 'Nothing matches these filters.' : 'Add a month of salaries to start tracking payments.'}
                />
            )}
        </>
    );

    const renderPending = () => (pendingReviews.length > 0 ? (
        <Group>
            {pendingReviews.map((item) => (
                <Row
                    key={item.name}
                    left={<Avatar name={item.employee_name} />}
                    title={item.employee_name}
                    subtitle={item.remarks ? `${monthOf(item)}\n${item.remarks}` : monthOf(item)}
                    value={inr(item.salary_to_pay)}
                    onPress={() => setReviewing(item)}
                />
            ))}
        </Group>
    ) : (
        <EmptyState icon="check-circle" title="No pending reviews" message="Salary records submitted by employees appear here." />
    ));

    // ------------------------------------------------------------------ main
    const addTitle = {
        month: 'Month',
        year: 'Year',
        department: 'Department',
    }[addPicker] || (addMode === 'bulk' ? 'Add salaries' : 'Add my pending salary');

    return (
        <View style={styles.screen}>
            <View style={styles.toolbar}>
                <Segmented
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'all', label: 'All records', count: records.length },
                        { value: 'pending', label: 'Pending review', count: pendingReviews.length },
                    ]}
                />
                {tab === 'all' ? (
                    <View style={styles.filterBar}>
                        <Pressable style={[styles.chip, hasFilters && styles.chipActive]} onPress={openFilters} hitSlop={6}>
                            <Icon name="sliders" size={14} color={hasFilters ? color.accent : color.textSecondary} />
                            <Text style={[styles.chipText, hasFilters && styles.chipTextActive]} numberOfLines={1}>
                                {hasFilters ? [filterMonth, filterStatus].filter(Boolean).join('  ·  ') : 'Filter'}
                            </Text>
                        </Pressable>
                        {hasFilters ? (
                            <Pressable onPress={clearFilters} hitSlop={8}>
                                <Text style={styles.clearText}>Clear</Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}
            </View>

            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={<Button title="Add salaries" onPress={openAdd} />}
            >
                {tab === 'all' ? renderAll() : renderPending()}
            </Screen>

            {/* review an employee-submitted record */}
            <Sheet
                visible={Boolean(reviewing)}
                title={reviewing?.employee_name}
                subtitle="Submitted for review"
                onClose={() => !processing && setReviewing(null)}
                dismissable={!processing}
                footer={(
                    <>
                        <Button title="Reject" variant="danger" onPress={() => decide('reject')} loading={processing === 'reject'} disabled={Boolean(processing)} style={styles.flex} />
                        <Button title="Approve" onPress={() => decide('approve')} loading={processing === 'approve'} disabled={Boolean(processing)} style={styles.flex} />
                    </>
                )}
            >
                {reviewing ? (
                    <>
                        <Group>
                            <Row title="Month" value={monthOf(reviewing)} />
                            <Row title="Salary" value={inr(reviewing.salary_to_pay)} />
                            <Row title="Employee ID" value={reviewing.employee} />
                            {reviewing.department ? <Row title="Department" value={deptLabel(reviewing.department)} /> : null}
                        </Group>
                        {reviewing.remarks ? (
                            <View style={styles.detail}>
                                <Text style={styles.detailLabel}>Remarks</Text>
                                <Text style={type.body}>{reviewing.remarks}</Text>
                            </View>
                        ) : null}
                        <Group>
                            <Row
                                title="Open record"
                                onPress={() => {
                                    const trackerId = reviewing.name;
                                    setReviewing(null);
                                    navigation.navigate('AdminSalaryTrackerDetail', { trackerId });
                                }}
                                disabled={Boolean(processing)}
                            />
                        </Group>
                    </>
                ) : null}
            </Sheet>

            {/* filter */}
            <Sheet
                visible={showFilterModal}
                title={filterPicker === 'month' ? 'Month' : filterPicker === 'status' ? 'Payment status' : 'Filter records'}
                onClose={() => setShowFilterModal(false)}
                footer={filterPicker ? (
                    <Button title="Back" variant="secondary" onPress={() => setFilterPicker(null)} style={styles.flex} />
                ) : (
                    <>
                        <Button title="Cancel" variant="secondary" onPress={() => setShowFilterModal(false)} style={styles.flex} />
                        <Button title="Apply" onPress={applyFilters} style={styles.flex} />
                    </>
                )}
            >
                {filterPicker === 'month' ? (
                    <OptionList
                        options={[{ value: '', label: 'All months' }, ...monthOptions]}
                        value={tempFilterMonth}
                        onSelect={(v) => {
                            setTempFilterMonth(v);
                            setFilterPicker(null);
                        }}
                    />
                ) : filterPicker === 'status' ? (
                    <OptionList
                        options={[{ value: '', label: 'All statuses' }, ...PAYMENT_STATUSES.map((st) => ({ value: st, label: st }))]}
                        value={tempFilterStatus}
                        onSelect={(v) => {
                            setTempFilterStatus(v);
                            setFilterPicker(null);
                        }}
                    />
                ) : (
                    <>
                        <SelectField label="Month" value={tempFilterMonth || 'All months'} onPress={() => setFilterPicker('month')} />
                        <SelectField label="Payment status" value={tempFilterStatus || 'All statuses'} onPress={() => setFilterPicker('status')} />
                    </>
                )}
            </Sheet>

            {/* add salaries (all employees) or the admin's own pending salary */}
            <Sheet
                visible={showAddModal}
                title={addTitle}
                subtitle={addPicker ? undefined : addMode === 'bulk' ? 'Creates a salary record for each employee' : 'Adds a pending salary record to your own profile'}
                onClose={() => !addLoading && closeAdd()}
                dismissable={!addLoading}
                footer={addPicker ? (
                    <Button title="Back" variant="secondary" onPress={() => setAddPicker(null)} style={styles.flex} />
                ) : (
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeAdd} disabled={addLoading} style={styles.flex} />
                        <Button
                            title={addMode === 'bulk' ? 'Add salaries' : 'Submit'}
                            onPress={addMode === 'bulk' ? handleAddMonth : handleAddSelf}
                            loading={addLoading}
                            style={styles.flex}
                        />
                    </>
                )}
            >
                {addPicker === 'month' ? (
                    <OptionList options={monthOptions} value={addMonth} onSelect={(v) => { setAddMonth(v); setAddPicker(null); }} />
                ) : addPicker === 'year' ? (
                    <OptionList options={yearOptions} value={addYear} onSelect={(v) => { setAddYear(v); setAddPicker(null); }} />
                ) : addPicker === 'department' ? (
                    <OptionList options={departmentOptions} value={addDept} onSelect={(v) => { setAddDept(v); setAddPicker(null); }} />
                ) : (
                    <>
                        <Segmented
                            value={addMode}
                            onChange={setAddMode}
                            options={[
                                { value: 'bulk', label: 'All employees' },
                                { value: 'self', label: 'My salary' },
                            ]}
                            style={styles.modeControl}
                        />
                        <View style={styles.fieldRow}>
                            <SelectField label="Month" value={addMonth} onPress={() => setAddPicker('month')} style={styles.flex} />
                            <SelectField label="Year" value={String(addYear)} onPress={() => setAddPicker('year')} style={styles.flex} />
                        </View>
                        {addMode === 'bulk' ? (
                            <SelectField label="Department" value={addDept || 'All departments'} onPress={() => setAddPicker('department')} />
                        ) : (
                            <>
                                <TextField
                                    label="Pending amount"
                                    placeholder="e.g. 30000"
                                    keyboardType="numeric"
                                    value={selfAmount}
                                    onChangeText={setSelfAmount}
                                />
                                <TextField
                                    label="Remarks (optional)"
                                    placeholder="e.g. Pending from last month"
                                    multiline
                                    value={selfRemarks}
                                    onChangeText={setSelfRemarks}
                                />
                            </>
                        )}
                    </>
                )}
            </Sheet>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: color.bg },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    filterBar: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: color.neutralSoft,
    },
    chipActive: { backgroundColor: color.accentSoft },
    chipText: { fontSize: 13, fontWeight: '500', color: color.textSecondary, flexShrink: 1 },
    chipTextActive: { color: color.accent },
    clearText: { fontSize: 13, fontWeight: '600', color: color.accent },
    metaText: { ...type.caption, color: color.textSecondary },
    total: { fontSize: 17, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    detail: { marginBottom: space.xl, paddingHorizontal: space.xs },
    detailLabel: { ...type.caption, marginBottom: 4 },
    modeControl: { marginBottom: space.lg },
    fieldRow: { flexDirection: 'row', gap: space.sm },
});

export default AdminSalaryTrackerScreen;
