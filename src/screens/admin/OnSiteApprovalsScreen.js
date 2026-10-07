// src/screens/admin/OnSiteApprovalsScreen.js
//
// Review on-site work requests. Approving a request allows on-site check-in on the requested
// dates only; standing on-site eligibility is changed in On-site settings.
import React, { useState, useEffect, useRef } from 'react';
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
    Notice,
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
const statusLabel = (status) => {
    const s = String(status || '');
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '-';
};
// the API returns `location`; older payloads used `client_location`
const placeOf = (r) => r?.client_location || r?.location || '';

const DATE_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: '7 days' },
    { value: 'month', label: '1 month' },
];

const OnSiteApprovalsScreen = ({ route }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [historyRequests, setHistoryRequests] = useState([]);
    const [allHistoryRequests, setAllHistoryRequests] = useState([]);
    const [processingRequest, setProcessingRequest] = useState(null);
    const [processingAction, setProcessingAction] = useState(null); // 'approve' | 'reject'
    const [activeTab, setActiveTab] = useState(route?.params?.tab || 'pending');
    const [selectedDateFilter, setSelectedDateFilter] = useState('all');
    const [selected, setSelected] = useState(null); // request shown in the sheet
    // Deep-link from EmployeeManagement Quick Actions.
    const [preselectFilter, setPreselectFilter] = useState(route?.params?.preselectEmployee || '');
    const [loadError, setLoadError] = useState('');
    const deciding = useRef(false); // blocks a second tap while a decision is being sent

    useEffect(() => {
        loadRequests();
        // load once on mount; later reloads come from pull-to-refresh and decisions
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (route?.params?.preselectEmployee) {
            setPreselectFilter(route.params.preselectEmployee);
        }
        if (route?.params?.tab) {
            setActiveTab(route.params.tab);
        }
    }, [route?.params?.preselectEmployee, route?.params?.tab]);

    const loadRequests = async (isRefresh = false) => {
        try {
            isRefresh ? setRefreshing(true) : setLoading(true);

            // Load pending requests
            const pendingResponse = await ApiService.getPendingOnSiteRequests();

            let pendingData = [];
            const problems = [];
            if (!pendingResponse.success) {
                problems.push(pendingResponse.message || 'Pending requests did not load');
            } else {
                if (pendingResponse.data?.message && Array.isArray(pendingResponse.data.message)) {
                    pendingData = pendingResponse.data.message;
                } else if (Array.isArray(pendingResponse.data)) {
                    pendingData = pendingResponse.data;
                }
            }

            setPendingRequests(pendingData);

            // Load all requests for history (approved/rejected)
            const allResponse = await ApiService.getAllOnSiteRequestsForAdmin();

            let historyData = [];
            if (!allResponse.success) {
                problems.push(allResponse.message || 'History did not load');
            } else {
                let allData = [];
                if (allResponse.data?.message && Array.isArray(allResponse.data.message)) {
                    allData = allResponse.data.message;
                } else if (Array.isArray(allResponse.data)) {
                    allData = allResponse.data;
                }

                // Filter to only approved and rejected
                historyData = allData.filter(req =>
                    req.status?.toLowerCase() === 'approved' ||
                    req.status?.toLowerCase() === 'rejected'
                );
            }

            setAllHistoryRequests(historyData);
            applyDateFilter(historyData, selectedDateFilter);
            setLoadError(problems.join(' '));
            if (problems.length) {
                showToast({ type: 'error', text1: 'Could not load all requests', text2: problems[0] });
            }
        } catch (error) {
            console.error('Error loading on-site requests:', error);
            setLoadError(error?.message || 'Please try again');
            showToast({
                type: 'error',
                text1: 'Could not load on-site requests',
                text2: error?.message || 'Please try again',
            });
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
    };

    const applyDateFilter = (data, filter) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        // the day a request was decided, read from the digits of `modified`: Hermes can't parse
        // 'YYYY-MM-DD HH:MM:SS.ffffff', and every bound below is a local midnight
        const decidedOn = (req) => toDate(req.modified);

        let filtered = data;

        if (filter === 'today') {
            filtered = data.filter(req => decidedOn(req)?.getTime() === today.getTime());
        } else if (filter === 'week') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            filtered = data.filter(req => {
                const day = decidedOn(req);
                return day ? day >= weekAgo : false;
            });
        } else if (filter === 'month') {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            filtered = data.filter(req => {
                const day = decidedOn(req);
                return day ? day >= monthAgo : false;
            });
        }

        setHistoryRequests(filtered);
    };

    const handleDateFilterChange = (filter) => {
        setSelectedDateFilter(filter);
        applyDateFilter(allHistoryRequests, filter);
    };

    const getFilteredRequests = () => {
        const source = activeTab === 'pending' ? pendingRequests : historyRequests;
        if (preselectFilter) {
            return source.filter((r) => r.employee === preselectFilter);
        }
        return source;
    };

    const getTabCounts = () => {
        return {
            pending: pendingRequests.length,
            history: historyRequests.length,
        };
    };

    const processRequest = async (requestId, action, requestData) => {
        try {
            setProcessingRequest(requestId);
            deciding.current = true;

            let response;
            if (action === 'approve') {
                response = await ApiService.approveOnSiteRequest(requestId);
            } else {
                response = await ApiService.rejectOnSiteRequest(requestId);
            }

            const backendData = response.data?.message || response.data || {};
            const isSuccess = response.success && (backendData.success === true || backendData.status === 'success');

            if (isSuccess) {
                setSelected(null);

                // Reload to get updated data
                await loadRequests(true);

                // The server notifies the employee. Approval covers the requested dates only;
                // standing on-site eligibility is changed from On-Site Settings.
                showToast({
                    type: 'success',
                    text1: action === 'approve' ? 'Request approved' : 'Request rejected',
                    text2: `${requestData.employee_name} has been notified`,
                });
            } else {
                showToast({
                    type: 'error',
                    text1: 'Not updated',
                    text2: backendData.message || response.message || `Failed to ${action} request`,
                });
            }
        } catch (error) {
            console.error(`Error trying to ${action} on-site request:`, error);
            showToast({
                type: 'error',
                text1: 'Not updated',
                text2: error.message || `Failed to ${action} request`,
            });
        } finally {
            deciding.current = false;
            setProcessingRequest(null);
        }
    };

    const decide = async (action) => {
        if (!selected || deciding.current) {
            return;
        }
        setProcessingAction(action);
        await processRequest(selected.name, action, selected);
        setProcessingAction(null);
    };

    const counts = getTabCounts();
    const visible = getFilteredRequests();
    const isPending = String(selected?.status).toLowerCase() === 'pending';
    const busy = Boolean(processingRequest);

    return (
        <View style={styles.flex}>
            <View style={styles.toolbar}>
                <Segmented
                    value={activeTab}
                    onChange={setActiveTab}
                    options={[
                        { value: 'pending', label: 'Pending', count: counts.pending },
                        { value: 'history', label: 'History', count: counts.history },
                    ]}
                />
                {activeTab === 'history' ? (
                    <Segmented value={selectedDateFilter} onChange={handleDateFilterChange} options={DATE_FILTERS} style={styles.rangeControl} />
                ) : null}
                {preselectFilter ? (
                    <Pressable style={styles.filterChip} onPress={() => setPreselectFilter('')} hitSlop={6}>
                        <Text style={styles.filterChipText} numberOfLines={1}>Employee {preselectFilter}</Text>
                        <Icon name="x" size={14} color={color.textSecondary} />
                    </Pressable>
                ) : null}
            </View>

            {loading ? (
                <Loading />
            ) : (
                <Screen refreshing={refreshing} onRefresh={() => loadRequests(true)}>
                    {loadError && visible.length > 0 ? (
                        <Notice tone="danger" icon="alert-circle" title="Could not load all requests" onPress={() => loadRequests(true)}>
                            {`${loadError} Tap to try again.`}
                        </Notice>
                    ) : null}
                    {loadError && visible.length === 0 ? (
                        <EmptyState icon="alert-circle" title="Could not load requests" message={loadError} action="Try again" onAction={() => loadRequests(false)} />
                    ) : visible.length === 0 ? (
                        <EmptyState
                            icon={activeTab === 'pending' ? 'check-circle' : 'clock'}
                            title={activeTab === 'pending' ? 'No pending requests' : 'No decisions yet'}
                            message={activeTab === 'pending'
                                ? 'New on-site requests will appear here.'
                                : selectedDateFilter === 'all'
                                    ? 'Approved and rejected requests will appear here.'
                                    : 'Nothing was approved or rejected in this period.'}
                        />
                    ) : (
                        <Group>
                            {visible.map((r) => {
                                const second = [placeOf(r), r.reason].filter(Boolean).join('  ·  ');
                                return (
                                    <Row
                                        key={r.name}
                                        left={<Avatar name={r.employee_name} />}
                                        title={r.employee_name}
                                        subtitle={second ? `${dateRange(r.from_date, r.to_date)}\n${second}` : dateRange(r.from_date, r.to_date)}
                                        subtitleLines={3}
                                        right={activeTab === 'history' ? <StatusText label={statusLabel(r.status)} /> : null}
                                        onPress={() => setSelected(r)}
                                    />
                                );
                            })}
                        </Group>
                    )}
                </Screen>
            )}

            <Sheet
                visible={Boolean(selected)}
                title={selected?.employee_name}
                subtitle="On-site request"
                onClose={() => !busy && setSelected(null)}
                dismissable={!busy}
                footer={isPending ? (
                    <>
                        <Button title="Reject" variant="danger" onPress={() => decide('reject')} loading={processingAction === 'reject'} disabled={busy} style={styles.flex} />
                        <Button title="Approve" onPress={() => decide('approve')} loading={processingAction === 'approve'} disabled={busy} style={styles.flex} />
                    </>
                ) : (
                    <Button title="Close" variant="secondary" onPress={() => setSelected(null)} style={styles.flex} />
                )}
            >
                {selected ? (
                    <>
                        <Detail label="Dates" value={dateRange(selected.from_date, selected.to_date)} />
                        {placeOf(selected) ? <Detail label="Location" value={placeOf(selected)} /> : null}
                        <Detail label="Reason" value={selected.reason || 'No reason given'} />
                        <Detail label="Employee ID" value={selected.employee || '-'} />
                        {!isPending ? <Detail label="Status" value={<StatusText label={statusLabel(selected.status)} size={15} />} /> : null}
                        {!isPending && selected.approved_by ? <Detail label="Approved by" value={selected.approved_by} /> : null}
                        {isPending ? (
                            <Text style={styles.sheetNote}>
                                Approving allows on-site check-in on these dates only. To let someone check in on site any day, turn it on in On-site settings.
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
        maxWidth: '100%',
        gap: 6,
        marginTop: space.sm,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: color.neutralSoft,
    },
    filterChipText: { fontSize: 13, color: color.textSecondary, fontWeight: '500', flexShrink: 1 },
    detail: { marginBottom: space.lg },
    detailLabel: { ...type.caption, marginBottom: 4 },
    sheetNote: { ...type.caption, lineHeight: 17, marginBottom: space.sm },
});

export default OnSiteApprovalsScreen;
