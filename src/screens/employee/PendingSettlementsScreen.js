import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { colors } from '../../theme/colors';
import Loading from '../../components/common/Loading';
import EmptyState from '../../components/ui/EmptyState';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import { useAuth } from '../../context/AuthContext';

const STATUS_TINTS = {
    Pending: { bg: colors.warningLight, fg: '#92400E' },
    Settled: { bg: colors.successLight, fg: '#065F46' },
    Forfeited: { bg: colors.errorLight, fg: '#991B1B' },
    Cancelled: { bg: colors.lightGray, fg: colors.darkGray },
};

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

const PendingSettlementsScreen = ({ navigation }) => {
    const { employee } = useAuth();
    const [settlements, setSettlements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await apiService.getMyPendingSettlements({
                employee: employee?.name || null,
            });
            if (!isApiSuccess(res)) {
                Alert.alert('Error', getApiErrorMessage(res, 'Failed to load settlements'));
                setSettlements([]);
                return;
            }
            const data = extractFrappeData(res, {});
            setSettlements(Array.isArray(data?.settlements) ? data.settlements : []);
        } catch (err) {
            Alert.alert('Error', err?.message || 'Failed to load settlements');
            setSettlements([]);
        }
    }, [employee]);

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

    if (loading) {
        return <Loading message="Loading pending settlements..." />;
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <View style={styles.headerCard}>
                <Icon name="info-circle" size={16} color={colors.info} />
                <Text style={styles.headerText}>
                    Each row is a leave-day taken on credit. Work a holiday or weekend in the
                    same month to settle it. Anything still pending at month-end is converted
                    to Absent and your balance is restored.
                </Text>
            </View>

            {settlements.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <EmptyState
                        icon="check-circle"
                        title="All clear"
                        subtitle="No pending compensatory settlements."
                    />
                </View>
            ) : (
                settlements.map((s) => {
                    const tint = STATUS_TINTS[s.status] || STATUS_TINTS.Pending;
                    const remaining = daysUntil(s.month_end);
                    const urgent = s.status === 'Pending' && remaining !== null && remaining <= 7;
                    return (
                        <View
                            key={s.name}
                            style={[styles.row, urgent && styles.rowUrgent]}
                        >
                            <View style={styles.rowHead}>
                                <Text style={styles.leaveDate}>{formatDate(s.leave_date)}</Text>
                                <View style={[styles.chip, { backgroundColor: tint.bg }]}>
                                    <Text style={[styles.chipText, { color: tint.fg }]}>
                                        {s.status}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.rowSub}>
                                {s.leaves} day{s.leaves > 1 ? 's' : ''} on credit · {s.leave_type}
                            </Text>
                            <Text style={[styles.deadline, urgent && styles.deadlineUrgent]}>
                                {s.status === 'Pending'
                                    ? `Settle by ${formatDate(s.month_end)}${
                                          remaining !== null
                                              ? ` (${remaining < 0 ? 'overdue' : `${remaining} day${remaining === 1 ? '' : 's'} left`})`
                                              : ''
                                      }`
                                    : s.status === 'Settled'
                                      ? 'Settled by holiday/weekend work'
                                      : s.status === 'Forfeited'
                                        ? 'Auto-converted to Absent at month-end'
                                        : ''}
                            </Text>
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
    headerCard: {
        flexDirection: 'row',
        backgroundColor: colors.infoLight,
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        gap: 10,
    },
    headerText: {
        flex: 1,
        color: colors.darkGray,
        fontSize: 13,
        lineHeight: 18,
    },
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
    rowUrgent: {
        borderLeftColor: colors.error,
        backgroundColor: '#FFF7F7',
    },
    rowHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    leaveDate: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    chip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    chipText: { fontSize: 11, fontWeight: '700' },
    rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    deadline: { fontSize: 12, marginTop: 6, color: colors.darkGray, fontWeight: '600' },
    deadlineUrgent: { color: colors.error },
});

export default PendingSettlementsScreen;
