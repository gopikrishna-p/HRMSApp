// src/screens/admin/EmployeeOnboardingListScreen.js
//
// Admin-side list of Employee Onboarding Requests. Replaces the old
// Excel-by-email onboarding loop with a self-serve flow:
//
//   Admin sends invitation → New hire fills web form → Admin reviews
//   → "Approve & Onboard" tap creates Employee + User + assignments.
//
// This screen surfaces every Onboarding Request with a status chip,
// filter chips at the top, and a + button that opens the create-invitation
// screen. Tapping a row opens the detail/review screen.

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
    Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { colors } from '../../theme/colors';
import Loading from '../../components/common/Loading';
import EmptyState from '../../components/ui/EmptyState';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';

const STATUS_CHIPS = [
    { key: null, label: 'All' },
    { key: 'Pending Submission', label: 'Pending' },
    { key: 'Submitted', label: 'Submitted' },
    { key: 'Employee Created', label: 'Onboarded' },
    { key: 'Rejected', label: 'Rejected' },
    { key: 'Expired', label: 'Expired' },
];

const STATUS_TINTS = {
    'Pending Submission': { bg: colors.infoLight, fg: colors.info },
    'Submitted': { bg: colors.warningLight, fg: '#92400E' },
    'Approved': { bg: colors.successLight, fg: '#065F46' },
    'Employee Created': { bg: colors.successLight, fg: '#065F46' },
    'Rejected': { bg: colors.errorLight, fg: '#991B1B' },
    'Cancelled': { bg: colors.lightGray, fg: colors.darkGray },
    'Expired': { bg: colors.lightGray, fg: colors.darkGray },
};

const formatDate = (s) => {
    if (!s) return '';
    try { return new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return s; }
};

const daysUntil = (s) => {
    if (!s) return null;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const d = new Date(s); d.setHours(0, 0, 0, 0);
    return Math.round((d - t) / (1000 * 60 * 60 * 24));
};

const EmployeeOnboardingListScreen = ({ navigation }) => {
    const [statusFilter, setStatusFilter] = useState(null);
    const [requests, setRequests] = useState([]);
    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const response = await apiService.getOnboardingRequests({ status: statusFilter });
            if (!isApiSuccess(response)) {
                Alert.alert('Error', getApiErrorMessage(response, 'Failed to load onboarding requests'));
                setRequests([]);
                return;
            }
            const data = extractFrappeData(response, {});
            setRequests(Array.isArray(data?.requests) ? data.requests : []);
            setCounts(data?.by_status || {});
        } catch (err) {
            Alert.alert('Error', err?.message || 'Failed to load');
            setRequests([]);
        }
    }, [statusFilter]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await load();
            setLoading(false);
        })();
    }, [load]);

    // Refresh when screen regains focus (e.g. after creating an invitation)
    useEffect(() => {
        const unsub = navigation.addListener?.('focus', load);
        return unsub;
    }, [navigation, load]);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    if (loading && !refreshing) {
        return <Loading message="Loading onboarding requests..." />;
    }

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Filter chips */}
                <View style={styles.filterRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {STATUS_CHIPS.map((c) => (
                            <TouchableOpacity
                                key={c.label}
                                style={[styles.chip, statusFilter === c.key && styles.chipActive]}
                                onPress={() => setStatusFilter(c.key)}
                            >
                                <Text style={[styles.chipText, statusFilter === c.key && styles.chipTextActive]}>
                                    {c.label}{c.key && counts[c.key] ? ` (${counts[c.key]})` : ''}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* List */}
                {requests.length === 0 ? (
                    <View style={styles.emptyWrap}>
                        <EmptyState
                            icon="user-plus"
                            title="No onboarding requests"
                            subtitle="Tap the + button below to invite a new hire."
                        />
                    </View>
                ) : (
                    requests.map((r) => {
                        const tint = STATUS_TINTS[r.status] || STATUS_TINTS['Pending Submission'];
                        const expDays = r.status === 'Pending Submission' ? daysUntil(r.invitation_expires_on) : null;
                        const isUrgent = expDays !== null && expDays <= 2;
                        return (
                            <TouchableOpacity
                                key={r.name}
                                style={[styles.row, isUrgent && styles.rowUrgent]}
                                activeOpacity={0.7}
                                onPress={() => navigation.navigate('EmployeeOnboardingDetail', { name: r.name })}
                            >
                                <View style={styles.rowHead}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.title}>
                                            {(r.first_name || r.last_name)
                                                ? `${r.first_name || ''} ${r.last_name || ''}`.trim()
                                                : r.invitation_email}
                                        </Text>
                                        <Text style={styles.subtitle}>{r.invitation_email}</Text>
                                    </View>
                                    <View style={[styles.statusChip, { backgroundColor: tint.bg }]}>
                                        <Text style={[styles.statusChipText, { color: tint.fg }]}>{r.status}</Text>
                                    </View>
                                </View>
                                <View style={styles.rowBody}>
                                    {(r.department || r.designation) ? (
                                        <Text style={styles.bodyLine}>
                                            {[r.designation, r.department].filter(Boolean).join(' · ')}
                                        </Text>
                                    ) : null}
                                    {r.status === 'Pending Submission' && expDays !== null ? (
                                        <Text style={[styles.deadline, isUrgent && styles.deadlineUrgent]}>
                                            {expDays < 0
                                                ? `Expired ${Math.abs(expDays)} day${Math.abs(expDays) === 1 ? '' : 's'} ago`
                                                : `Expires in ${expDays} day${expDays === 1 ? '' : 's'}`}
                                        </Text>
                                    ) : null}
                                    {r.status === 'Submitted' ? (
                                        <Text style={styles.deadline}>
                                            Submitted on {formatDate(r.submitted_on)} — awaiting your review
                                        </Text>
                                    ) : null}
                                    {r.status === 'Employee Created' && r.created_employee ? (
                                        <Text style={[styles.deadline, { color: colors.success }]}>
                                            ✓ {r.created_employee}
                                        </Text>
                                    ) : null}
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* Floating + button */}
            <TouchableOpacity
                style={styles.fab}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('CreateOnboardingInvitation')}
            >
                <Icon name="plus" size={20} color={colors.white} />
                <Text style={styles.fabText}>New Invitation</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 12, paddingBottom: 96 },
    filterRow: { marginBottom: 12 },
    chip: {
        paddingHorizontal: 12, paddingVertical: 6,
        backgroundColor: colors.surface, borderRadius: 16,
        marginRight: 8, borderWidth: 1, borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
    chipTextActive: { color: colors.white },
    emptyWrap: { marginTop: 32, backgroundColor: colors.surface, borderRadius: 14 },
    row: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderLeftWidth: 4,
        borderLeftColor: colors.border,
    },
    rowUrgent: { borderLeftColor: colors.error, backgroundColor: '#FFF7F7' },
    rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    statusChipText: { fontSize: 11, fontWeight: '700' },
    rowBody: { marginTop: 8 },
    bodyLine: { fontSize: 12, color: colors.textSecondary },
    deadline: { fontSize: 12, color: colors.darkGray, fontWeight: '600', marginTop: 4 },
    deadlineUrgent: { color: colors.error },
    fab: {
        position: 'absolute',
        right: 16, bottom: 24,
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: colors.primary,
        paddingHorizontal: 18, paddingVertical: 12,
        borderRadius: 28,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    fabText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});

export default EmployeeOnboardingListScreen;
