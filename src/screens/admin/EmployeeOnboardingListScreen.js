// src/screens/admin/EmployeeOnboardingListScreen.js
//
// Admin-side list of Employee Onboarding Requests:
//
//   Admin sends invitation -> new hire fills the web form -> admin reviews
//   -> "Approve and onboard" creates Employee + User + assignments.
//
// A status filter sits in the top bar next to "Invite"; tapping a row opens the
// detail/review screen. The list reloads whenever the screen regains focus.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    StatusText,
    Tag,
    Button,
    SelectField,
    Sheet,
    EmptyState,
    Loading,
    Icon,
    color,
    space,
    type,
    formatShortDate,
} from '../../components/ds';

const STATUS_CHIPS = [
    { key: null, label: 'All statuses' },
    { key: 'Pending Submission', label: 'Invited' },
    { key: 'Submitted', label: 'Submitted' },
    { key: 'Employee Created', label: 'Onboarded' },
    { key: 'Rejected', label: 'Rejected' },
    { key: 'Expired', label: 'Expired' },
];

// server status -> label and tone shown in the list
const STATUS_LABEL = {
    'Pending Submission': 'Invited',
    'Employee Created': 'Onboarded',
};
const STATUS_TONE = {
    'Pending Submission': 'info',
    'Submitted': 'warning',
    'Approved': 'success',
    'Employee Created': 'success',
    'Rejected': 'danger',
    'Cancelled': 'neutral',
    'Expired': 'neutral',
};

// 'YYYY-MM-DD[ HH:mm:ss]' as a local calendar date (no timezone shift; `new Date()` cannot
// parse the datetime form on Hermes), or null
const parseLocalDate = (s) => {
    const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
};

const formatDate = (s) => {
    const d = parseLocalDate(s);
    return d ? formatShortDate(d) : '';
};

// whole days from today to the date (negative once it has passed); null when unknown
const daysUntil = (s) => {
    const d = parseLocalDate(s);
    if (!d) {
        return null;
    }
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / (1000 * 60 * 60 * 24));
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const expiryText = (days) => {
    if (days < 0) {
        return `Expired ${plural(Math.abs(days), 'day')} ago`;
    }
    return days === 0 ? 'Expires today' : `Expires in ${plural(days, 'day')}`;
};

const EmployeeOnboardingListScreen = ({ navigation }) => {
    const [statusFilter, setStatusFilter] = useState(null);
    const [requests, setRequests] = useState([]);
    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [loadError, setLoadError] = useState(null);
    // only the newest request may fill the list (a slower one for the previous filter is dropped)
    const requestSeq = useRef(0);
    const loadedOnce = useRef(false);

    const load = useCallback(async () => {
        const seq = ++requestSeq.current;
        const fail = (reason) => {
            showToast({ type: 'error', text1: 'Could not load requests', text2: reason });
            setRequests([]);
            setLoadError(reason);
        };
        try {
            const response = await apiService.getOnboardingRequests({ status: statusFilter });
            if (seq !== requestSeq.current) {
                return;
            }
            if (!isApiSuccess(response)) {
                fail(getApiErrorMessage(response, 'Failed to load onboarding requests'));
                return;
            }
            const data = extractFrappeData(response, {});
            setRequests(Array.isArray(data?.requests) ? data.requests : []);
            setLoadError(null);
            // by_status only counts the rows returned: a filtered load updates just its own count
            if (statusFilter === null) {
                setCounts(data?.by_status || {});
            } else {
                setCounts((prev) => ({ ...prev, [statusFilter]: data?.by_status?.[statusFilter] || 0 }));
            }
        } catch (err) {
            if (seq === requestSeq.current) {
                fail(err?.message || 'Failed to load');
            }
        }
    }, [statusFilter]);

    useEffect(() => {
        let active = true;
        (async () => {
            setLoading(true);
            await load();
            if (active) {
                setLoading(false);
                loadedOnce.current = true;
            }
        })();
        return () => {
            active = false;
        };
    }, [load]);

    // Refresh when screen regains focus (e.g. after creating an invitation). The first focus is
    // skipped: the load above is already running.
    useEffect(() => {
        const unsub = navigation.addListener?.('focus', () => {
            if (loadedOnce.current) {
                load();
            }
        });
        return unsub;
    }, [navigation, load]);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    const retry = async () => {
        setLoading(true);
        await load();
        setLoading(false);
    };

    const activeLabel = STATUS_CHIPS.find((c) => c.key === statusFilter)?.label || 'All statuses';

    const renderRow = (r) => {
        const hasName = Boolean(r.first_name || r.last_name);
        const displayName = (hasName ? `${r.first_name || ''} ${r.last_name || ''}`.trim() : r.invitation_email) || r.name;
        const expDays = r.status === 'Pending Submission' ? daysUntil(r.invitation_expires_on) : null;
        const isUrgent = expDays !== null && expDays <= 2;

        let fact = null;
        if (r.status === 'Pending Submission' && expDays !== null && !isUrgent) {
            fact = expiryText(expDays);
        } else if (r.status === 'Submitted') {
            fact = formatDate(r.submitted_on) ? `Submitted ${formatDate(r.submitted_on)}` : null;
        } else if (r.status === 'Employee Created' && r.created_employee) {
            fact = `Employee ${r.created_employee}`;
        }

        const subtitle = [
            hasName ? r.invitation_email : null,
            [r.designation, r.department].filter(Boolean).join('  ·  ') || null,
        ].filter(Boolean).join('\n');

        // status and the key date sit under the text, so a long name or email keeps the full
        // row width on a narrow phone
        const meta = [
            statusFilter === null && r.status ? (
                <StatusText key="status" label={STATUS_LABEL[r.status] || r.status} tone={STATUS_TONE[r.status]} />
            ) : null,
            isUrgent ? <Tag key="expiry" label={expiryText(expDays)} tone="danger" /> : null,
            fact ? <Text key="fact" style={styles.fact} numberOfLines={1}>{fact}</Text> : null,
        ].filter(Boolean);

        return (
            <Row
                key={r.name}
                left={<Avatar name={displayName} />}
                title={displayName}
                subtitle={subtitle || undefined}
                subtitleLines={3}
                meta={meta.length ? <View style={styles.meta}>{meta}</View> : null}
                onPress={() => navigation.navigate('EmployeeOnboardingDetail', { name: r.name })}
            />
        );
    };

    return (
        <View style={styles.flex}>
            <View style={styles.toolbar}>
                <SelectField
                    value={activeLabel}
                    onPress={() => setFilterOpen(true)}
                    style={styles.filter}
                />
                <Button
                    title="Invite"
                    icon="plus"
                    onPress={() => navigation.navigate('CreateOnboardingInvitation')}
                    style={styles.invite}
                />
            </View>

            {loading && !refreshing ? (
                <Loading />
            ) : (
                <Screen refreshing={refreshing} onRefresh={onRefresh}>
                    {requests.length === 0 && loadError ? (
                        <EmptyState
                            icon="alert-circle"
                            title="Could not load requests"
                            message={loadError}
                            action="Try again"
                            onAction={retry}
                        />
                    ) : requests.length === 0 ? (
                        statusFilter === null ? (
                            <EmptyState
                                icon="user-plus"
                                title="No onboarding requests"
                                message="Invite a new hire to get started."
                                action="New invitation"
                                onAction={() => navigation.navigate('CreateOnboardingInvitation')}
                            />
                        ) : (
                            <EmptyState icon="inbox" title={`No ${activeLabel.toLowerCase()} requests`} message="Try another status." />
                        )
                    ) : (
                        <Group title={plural(requests.length, 'request')}>
                            {requests.map(renderRow)}
                        </Group>
                    )}
                </Screen>
            )}

            <Sheet visible={filterOpen} title="Status" onClose={() => setFilterOpen(false)}>
                <Group>
                    {STATUS_CHIPS.map((c) => {
                        const active = statusFilter === c.key;
                        return (
                            <Row
                                key={c.label}
                                title={c.label}
                                value={c.key && counts[c.key] ? String(counts[c.key]) : undefined}
                                selected={active}
                                right={active ? <Icon name="check" size={18} color={color.accent} /> : null}
                                chevron={false}
                                onPress={() => {
                                    setStatusFilter(c.key);
                                    setFilterOpen(false);
                                }}
                            />
                        );
                    })}
                </Group>
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: color.bg },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    filter: { flex: 1, marginBottom: 0 },
    invite: { flexShrink: 0 },
    meta: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: 4 },
    fact: { ...type.secondary, flexShrink: 1 },
});

export default EmployeeOnboardingListScreen;
