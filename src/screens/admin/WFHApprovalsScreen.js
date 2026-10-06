// src/screens/admin/WFHApprovalsScreen.js
//
// Review Work From Home requests. Approving a request lets the employee work from home on
// the requested dates only; their standing arrangement is set in WFH Settings. The server
// notifies the employee of the decision.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    Sheet,
    Button,
    EmptyState,
    Loading,
    StatusText,
    Icon,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 'YYYY-MM-DD' as a local date (no timezone shift)
const toDate = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};
const dayLabel = (value) => {
    const d = toDate(value);
    return d ? `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}` : '-';
};
const dayCount = (from, to) => {
    const a = toDate(from);
    const b = toDate(to);
    return a && b ? Math.round((b - a) / 86400000) + 1 : 1;
};
const dateRange = (from, to) => {
    const n = dayCount(from, to);
    return n === 1 ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}  ·  ${n} days`;
};
const listOf = (res) => (Array.isArray(res?.data?.message) ? res.data.message : Array.isArray(res?.data) ? res.data : []);

const HISTORY_RANGES = [
    { value: 'all', label: 'All' },
    { value: 'week', label: '7 days' },
    { value: 'month', label: '30 days' },
];

const WFHApprovalsScreen = ({ route }) => {
    const [tab, setTab] = useState(route?.params?.tab || 'pending');
    const [range, setRange] = useState('all');
    const [pending, setPending] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [employeeFilter, setEmployeeFilter] = useState(route?.params?.preselectEmployee || '');
    const [selected, setSelected] = useState(null);
    const [processing, setProcessing] = useState(null); // 'approve' | 'reject'

    const load = useCallback(async (isRefresh = false) => {
        isRefresh ? setRefreshing(true) : setLoading(true);
        try {
            const [pendingRes, allRes] = await Promise.all([ApiService.getPendingWFHRequests(), ApiService.getAllWFHRequestsForAdmin()]);
            setPending(listOf(pendingRes));
            setHistory(listOf(allRes).filter((r) => ['approved', 'rejected'].includes(String(r.status).toLowerCase())));
            if (!pendingRes.success || !allRes.success) {
                showToast({ type: 'error', text1: 'Could not load all requests', text2: pendingRes.message || allRes.message || 'Please try again' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Could not load WFH requests', text2: error.message });
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(false);
    }, [load]);

    useEffect(() => {
        if (route?.params?.preselectEmployee) {
            setEmployeeFilter(route.params.preselectEmployee);
        }
        if (route?.params?.tab) {
            setTab(route.params.tab);
        }
    }, [route?.params?.preselectEmployee, route?.params?.tab]);

    const visible = useMemo(() => {
        let list = tab === 'pending' ? pending : history;
        if (tab === 'history' && range !== 'all') {
            const since = new Date();
            since.setHours(0, 0, 0, 0);
            since.setDate(since.getDate() - (range === 'week' ? 7 : 30));
            list = list.filter((r) => new Date(String(r.modified).replace(' ', 'T')) >= since);
        }
        return employeeFilter ? list.filter((r) => r.employee === employeeFilter) : list;
    }, [tab, range, pending, history, employeeFilter]);

    const decide = async (action) => {
        if (!selected) {
            return;
        }
        setProcessing(action);
        try {
            const res = action === 'approve'
                ? await ApiService.approveWFHRequest(selected.name)
                : await ApiService.rejectWFHRequest(selected.name);
            const body = res.data?.message || res.data || {};
            if (res.success && (body.success === true || body.status === 'success')) {
                showToast({
                    type: 'success',
                    text1: action === 'approve' ? 'Request approved' : 'Request rejected',
                    text2: `${selected.employee_name} has been notified`,
                });
                setSelected(null);
                load(true);
            } else {
                showToast({ type: 'error', text1: 'Not updated', text2: body.message || res.message || 'Please try again' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Not updated', text2: error.message });
        } finally {
            setProcessing(null);
        }
    };

    const isPending = String(selected?.status).toLowerCase() === 'pending';

    return (
        <View style={styles.flex}>
            <View style={styles.toolbar}>
                <Segmented
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'pending', label: 'Pending', count: pending.length },
                        { value: 'history', label: 'History', count: history.length },
                    ]}
                />
                {tab === 'history' ? (
                    <Segmented value={range} onChange={setRange} options={HISTORY_RANGES} style={styles.rangeControl} />
                ) : null}
                {employeeFilter ? (
                    <Pressable style={styles.filterChip} onPress={() => setEmployeeFilter('')} hitSlop={6}>
                        <Text style={styles.filterChipText}>Employee {employeeFilter}</Text>
                        <Icon name="x" size={14} color={color.textSecondary} />
                    </Pressable>
                ) : null}
            </View>

            {loading ? (
                <Loading />
            ) : (
                <Screen refreshing={refreshing} onRefresh={() => load(true)}>
                    {visible.length === 0 ? (
                        <EmptyState
                            icon={tab === 'pending' ? 'check-circle' : 'clock'}
                            title={tab === 'pending' ? 'No pending requests' : 'No decisions yet'}
                            message={tab === 'pending' ? 'New WFH requests will appear here.' : 'Approved and rejected requests will appear here.'}
                        />
                    ) : (
                        <Group>
                            {visible.map((r) => (
                                <Row
                                    key={r.name}
                                    left={<Avatar name={r.employee_name} />}
                                    title={r.employee_name}
                                    subtitle={r.reason ? `${dateRange(r.from_date, r.to_date)}\n${r.reason}` : dateRange(r.from_date, r.to_date)}
                                    right={tab === 'history' ? <StatusText label={r.status} /> : null}
                                    onPress={() => setSelected(r)}
                                />
                            ))}
                        </Group>
                    )}
                </Screen>
            )}

            <Sheet
                visible={Boolean(selected)}
                title={selected?.employee_name}
                subtitle="Work from home request"
                onClose={() => !processing && setSelected(null)}
                dismissable={!processing}
                footer={isPending ? (
                    <>
                        <Button title="Reject" variant="danger" onPress={() => decide('reject')} loading={processing === 'reject'} disabled={Boolean(processing)} style={styles.flex} />
                        <Button title="Approve" onPress={() => decide('approve')} loading={processing === 'approve'} disabled={Boolean(processing)} style={styles.flex} />
                    </>
                ) : (
                    <Button title="Close" variant="secondary" onPress={() => setSelected(null)} style={styles.flex} />
                )}
            >
                {selected ? (
                    <>
                        <Detail label="Dates" value={dateRange(selected.from_date, selected.to_date)} />
                        <Detail label="Reason" value={selected.reason || 'No reason given'} />
                        <Detail label="Employee ID" value={selected.employee} />
                        {!isPending ? <Detail label="Status" value={<StatusText label={selected.status} size={15} />} /> : null}
                        {isPending ? (
                            <Text style={styles.sheetNote}>
                                Approving allows WFH on these dates only. 30% of a day's pay is deducted for each WFH day unless the employee is on permanent WFH.
                            </Text>
                        ) : null}
                    </>
                ) : null}
            </Sheet>
        </View>
    );
};

const Detail = ({ label, value }) => (
    <View style={styles.detail}>
        <Text style={styles.detailLabel}>{label}</Text>
        {typeof value === 'string' ? <Text style={type.body}>{value}</Text> : value}
    </View>
);

const styles = StyleSheet.create({
    flex: { flex: 1 },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    rangeControl: { marginTop: space.sm },
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
    detail: { marginBottom: space.lg },
    detailLabel: { ...type.caption, marginBottom: 4 },
    sheetNote: { ...type.caption, lineHeight: 17, marginBottom: space.sm },
});

export default WFHApprovalsScreen;
