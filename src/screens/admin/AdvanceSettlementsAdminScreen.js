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

/**
 * AdvanceSettlementsAdminScreen
 *
 * Admin-only browser for Mode-2 (Take-First) compensatory leave settlements
 * across all employees. Lets HR identify forfeit risk before month-end and
 * intervene if needed (e.g., remind an employee with 2 days left and no
 * holiday work logged).
 *
 * Backs the B4 gap from ADMIN_EMPLOYEE_PARITY_AUDIT.md Phase 3.
 */

const STATUS_TINTS = {
    Pending: { bg: colors.warningLight, fg: '#92400E' },
    Settled: { bg: colors.successLight, fg: '#065F46' },
    Forfeited: { bg: colors.errorLight, fg: '#991B1B' },
    Cancelled: { bg: colors.lightGray, fg: colors.darkGray },
};

const STATUS_FILTERS = ['Pending', 'Settled', 'Forfeited', 'All'];

const formatDate = (s) => {
    if (!s) return '';
    try {
        return new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return s; }
};

const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

const AdvanceSettlementsAdminScreen = ({ navigation, route }) => {
    // When deep-linked from EmployeeManagement, scope the list to that one
    // employee. Default is empty (= all employees).
    const preselectEmployee = route?.params?.preselectEmployee || '';
    const [settlements, setSettlements] = useState([]);
    const [counts, setCounts] = useState({ Pending: 0, Settled: 0, Forfeited: 0, Cancelled: 0 });
    const [statusFilter, setStatusFilter] = useState('Pending');
    const [urgentOnly, setUrgentOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const response = await apiService.getAllPendingSettlements({
                employee: preselectEmployee || null,
                status: statusFilter === 'All' ? null : statusFilter,
                urgent_only: urgentOnly,
            });
            if (!isApiSuccess(response)) {
                Alert.alert('Error', getApiErrorMessage(response, 'Failed to load settlements'));
                setSettlements([]);
                return;
            }
            const data = extractFrappeData(response, {});
            setSettlements(Array.isArray(data?.settlements) ? data.settlements : []);
            setCounts(data?.by_status || { Pending: 0, Settled: 0, Forfeited: 0, Cancelled: 0 });
        } catch (err) {
            Alert.alert('Error', err?.message || 'Failed to load settlements');
            setSettlements([]);
        }
    }, [statusFilter, urgentOnly, preselectEmployee]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await load();
            setLoading(false);
        })();
    }, [load]);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    if (loading && !refreshing) {
        return <Loading message="Loading settlements..." />;
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {/* Summary cards */}
            <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { borderLeftColor: colors.warning }]}>
                    <Text style={styles.summaryValue}>{counts.Pending || 0}</Text>
                    <Text style={styles.summaryLabel}>Pending</Text>
                </View>
                <View style={[styles.summaryCard, { borderLeftColor: colors.success }]}>
                    <Text style={styles.summaryValue}>{counts.Settled || 0}</Text>
                    <Text style={styles.summaryLabel}>Settled</Text>
                </View>
                <View style={[styles.summaryCard, { borderLeftColor: colors.error }]}>
                    <Text style={styles.summaryValue}>{counts.Forfeited || 0}</Text>
                    <Text style={styles.summaryLabel}>Forfeited</Text>
                </View>
            </View>

            {/* Filter chips */}
            <View style={styles.filterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {STATUS_FILTERS.map((s) => (
                        <TouchableOpacity
                            key={s}
                            style={[styles.chip, statusFilter === s && styles.chipActive]}
                            onPress={() => setStatusFilter(s)}
                        >
                            <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>{s}</Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                        style={[styles.chip, urgentOnly && styles.chipActiveDanger]}
                        onPress={() => setUrgentOnly(!urgentOnly)}
                    >
                        <Icon name="exclamation-triangle" size={10} color={urgentOnly ? colors.white : colors.error} />
                        <Text style={[styles.chipText, urgentOnly && styles.chipTextActive, { marginLeft: 4 }]}>
                            Urgent (≤7 days)
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* List */}
            {settlements.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <EmptyState
                        icon="check-circle"
                        title="Nothing to show"
                        subtitle={
                            statusFilter === 'Pending'
                                ? 'No pending compensatory advance settlements right now.'
                                : `No ${statusFilter.toLowerCase()} settlements matched the filters.`
                        }
                    />
                </View>
            ) : (
                settlements.map((s) => {
                    const tint = STATUS_TINTS[s.status] || STATUS_TINTS.Pending;
                    const remaining = daysUntil(s.month_end);
                    const urgent = s.status === 'Pending' && remaining !== null && remaining <= 7;
                    return (
                        <View key={s.name} style={[styles.row, urgent && styles.rowUrgent]}>
                            <View style={styles.rowHead}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.employeeName}>{s.employee_name || s.employee}</Text>
                                    <Text style={styles.employeeId}>{s.employee}</Text>
                                </View>
                                <View style={[styles.chipMini, { backgroundColor: tint.bg }]}>
                                    <Text style={[styles.chipMiniText, { color: tint.fg }]}>{s.status}</Text>
                                </View>
                            </View>
                            <View style={styles.rowBody}>
                                <Text style={styles.leaveDate}>
                                    Leave date: {formatDate(s.leave_date)} · {s.leaves} day{s.leaves > 1 ? 's' : ''}
                                </Text>
                                <Text style={styles.leaveType}>{s.leave_type}</Text>
                                <Text style={[styles.deadline, urgent && styles.deadlineUrgent]}>
                                    {s.status === 'Pending'
                                        ? `Settle by ${formatDate(s.month_end)}${
                                              remaining !== null
                                                  ? ` (${remaining < 0 ? 'overdue' : `${remaining} day${remaining === 1 ? '' : 's'} left`})`
                                                  : ''
                                          }`
                                        : s.status === 'Settled'
                                            ? `Settled on ${formatDate(s.settled_on)}`
                                            : s.status === 'Forfeited'
                                                ? `Forfeited on ${formatDate(s.forfeited_on)}`
                                                : ''}
                                </Text>
                            </View>
                        </View>
                    );
                })
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, paddingBottom: 32 },
    summaryRow: {
        flexDirection: 'row',
        marginBottom: 12,
        marginHorizontal: -4,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: colors.surface,
        borderLeftWidth: 4,
        borderRadius: 10,
        padding: 12,
        marginHorizontal: 4,
        alignItems: 'flex-start',
    },
    summaryValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
    summaryLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    filterRow: { marginBottom: 12 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: colors.surface,
        borderRadius: 16,
        marginRight: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    chipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    chipActiveDanger: {
        backgroundColor: colors.error,
        borderColor: colors.error,
    },
    chipText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
    chipTextActive: { color: colors.white },
    emptyWrap: {
        marginTop: 32,
        backgroundColor: colors.surface,
        borderRadius: 14,
    },
    row: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderLeftWidth: 4,
        borderLeftColor: colors.warning,
    },
    rowUrgent: { borderLeftColor: colors.error, backgroundColor: '#FFF7F7' },
    rowHead: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 6,
    },
    employeeName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    employeeId: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    chipMini: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    chipMiniText: { fontSize: 11, fontWeight: '700' },
    rowBody: { marginTop: 2 },
    leaveDate: { fontSize: 13, color: colors.textPrimary, marginTop: 2 },
    leaveType: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    deadline: { fontSize: 12, marginTop: 6, color: colors.darkGray, fontWeight: '600' },
    deadlineUrgent: { color: colors.error },
});

export default AdvanceSettlementsAdminScreen;
