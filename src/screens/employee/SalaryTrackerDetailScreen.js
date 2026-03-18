import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import ApiService from '../../services/api.service';

function SalaryTrackerDetailScreen({ route, navigation }) {
    const { trackerId } = route.params;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { loadDetail(); }, []);

    useFocusEffect(
        useCallback(() => { loadDetail(); }, [])
    );

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

    const formatCurrency = (amt) => `₹${(amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const getStatusColor = (status) => {
        switch (status) {
            case 'Fully Paid': return '#10B981';
            case 'Partially Paid': return '#F59E0B';
            case 'Unpaid': return '#EF4444';
            default: return '#6B7280';
        }
    };

    const getApprovalColor = (status) => {
        switch (status) {
            case 'Approved': return '#10B981';
            case 'Pending Review': return '#F59E0B';
            case 'Rejected': return '#EF4444';
            case 'Draft': return '#6B7280';
            default: return '#6B7280';
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#6366F1" />
            </View>
        );
    }

    if (!data) {
        return (
            <View style={styles.center}>
                <Icon name="exclamation-circle" size={48} color="#D1D5DB" />
                <Text style={{ color: '#6B7280', marginTop: 12 }}>Record not found</Text>
            </View>
        );
    }

    const paidPct = data.salary_to_pay > 0 ? ((data.total_paid / data.salary_to_pay) * 100) : 0;
    const payments = data.payments || [];

    return (
        <View style={styles.container}>
            <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366F1']} />}>
                {/* Status Bar */}
                <View style={styles.statusBar}>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(data.payment_status) + '20' }]}>
                        <Text style={[styles.statusBadgeText, { color: getStatusColor(data.payment_status) }]}>
                            {data.payment_status}
                        </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getApprovalColor(data.status) + '20' }]}>
                        <Text style={[styles.statusBadgeText, { color: getApprovalColor(data.status) }]}>
                            {data.status}
                        </Text>
                    </View>
                </View>

                {/* Salary Breakdown */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>💵 Salary Breakdown</Text>
                    <View style={styles.breakdownCard}>
                        <BreakdownRow label="Total Earnings" value={formatCurrency(data.total_earnings)} color="#6366F1" />
                        <BreakdownRow label="Total Deductions" value={`- ${formatCurrency(data.total_deductions)}`} color="#EF4444" />
                        <BreakdownRow label="Net Salary" value={formatCurrency(data.net_salary)} color="#1F2937" bold />
                        {(data.wfh_deduction > 0) && (
                            <BreakdownRow label="WFH Deduction" value={`- ${formatCurrency(data.wfh_deduction)}`} color="#F59E0B" />
                        )}
                        {(data.absent_deduction > 0) && (
                            <BreakdownRow label="Absent Deduction" value={`- ${formatCurrency(data.absent_deduction)}`} color="#EF4444" />
                        )}
                        <View style={styles.divider} />
                        <BreakdownRow label="Salary to Pay" value={formatCurrency(data.salary_to_pay)} color="#6366F1" bold />
                    </View>
                </View>

                {/* Payment Summary */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>💳 Payment Summary</Text>
                    <View style={styles.paymentSummaryCard}>
                        <View style={styles.summaryRow}>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>Total Paid</Text>
                                <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(data.total_paid)}</Text>
                            </View>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>Pending</Text>
                                <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{formatCurrency(data.pending_amount)}</Text>
                            </View>
                        </View>
                        <View style={styles.progressContainer}>
                            <View style={[styles.progressBar, { width: `${Math.min(paidPct, 100)}%` }]} />
                        </View>
                        <Text style={styles.progressLabel}>{paidPct.toFixed(1)}% Paid</Text>
                    </View>
                </View>

                {/* Attendance Summary */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📋 Attendance</Text>
                    <View style={styles.attendanceGrid}>
                        <AttendanceItem icon="calendar-check" label="Working" value={data.working_days} color="#6366F1" />
                        <AttendanceItem icon="user-check" label="Present" value={data.present_days} color="#10B981" />
                        <AttendanceItem icon="home" label="WFH" value={data.wfh_days} color="#F59E0B" />
                        <AttendanceItem icon="times-circle" label="Absent" value={data.absent_days} color="#EF4444" />
                        <AttendanceItem icon="calendar-minus" label="Leave" value={data.leave_days} color="#8B5CF6" />
                        <AttendanceItem icon="map-marker-alt" label="On-site" value={data.onsite_days} color="#3B82F6" />
                    </View>
                </View>

                {/* Payment History */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📝 Payment History ({payments.length})</Text>
                    {payments.length === 0 ? (
                        <View style={styles.noPayments}>
                            <Icon name="receipt" size={32} color="#D1D5DB" />
                            <Text style={styles.noPaymentsText}>No payments recorded yet</Text>
                        </View>
                    ) : (
                        payments.map((p, index) => (
                            <View key={index} style={styles.paymentItem}>
                                <View style={styles.paymentDot} />
                                <View style={styles.paymentContent}>
                                    <View style={styles.paymentHeader}>
                                        <Text style={styles.paymentAmount}>{formatCurrency(p.amount)}</Text>
                                        <Text style={styles.paymentDate}>{p.payment_date}</Text>
                                    </View>
                                    <View style={styles.paymentMeta}>
                                        {p.payment_mode ? (
                                            <Text style={styles.paymentMode}>{p.payment_mode}</Text>
                                        ) : null}
                                        {p.reference ? (
                                            <Text style={styles.paymentRef}>Ref: {p.reference}</Text>
                                        ) : null}
                                    </View>
                                    {p.remarks ? <Text style={styles.paymentRemarks}>{p.remarks}</Text> : null}
                                </View>
                            </View>
                        ))
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

function BreakdownRow({ label, value, color, bold }) {
    return (
        <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, bold && { fontWeight: '700' }]}>{label}</Text>
            <Text style={[styles.breakdownValue, { color }, bold && { fontWeight: '700', fontSize: 15 }]}>{value}</Text>
        </View>
    );
}

function AttendanceItem({ icon, label, value, color }) {
    return (
        <View style={styles.attendanceItem}>
            <Icon name={icon} size={16} color={color} />
            <Text style={styles.attendanceValue}>{value || 0}</Text>
            <Text style={styles.attendanceLabel}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F3F4F6' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    statusBar: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 12 },
    statusBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
    statusBadgeText: { fontSize: 13, fontWeight: '600' },
    section: { marginHorizontal: 16, marginTop: 16 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 10 },
    breakdownCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2 },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    breakdownLabel: { fontSize: 13, color: '#6B7280' },
    breakdownValue: { fontSize: 13, fontWeight: '600' },
    divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
    paymentSummaryCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
    summaryItem: { alignItems: 'center' },
    summaryLabel: { fontSize: 12, color: '#6B7280' },
    summaryValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
    progressContainer: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, marginTop: 16, overflow: 'hidden' },
    progressBar: { height: '100%', backgroundColor: '#10B981', borderRadius: 4 },
    progressLabel: { fontSize: 11, color: '#6B7280', textAlign: 'right', marginTop: 4 },
    attendanceGrid: {
        flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#fff', borderRadius: 12,
        padding: 12, elevation: 2, gap: 0,
    },
    attendanceItem: { width: '33.3%', alignItems: 'center', paddingVertical: 10 },
    attendanceValue: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginTop: 4 },
    attendanceLabel: { fontSize: 10, color: '#6B7280', marginTop: 2 },
    noPayments: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#fff', borderRadius: 12 },
    noPaymentsText: { fontSize: 13, color: '#9CA3AF', marginTop: 8 },
    paymentItem: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, elevation: 1 },
    paymentDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981', marginTop: 4, marginRight: 12 },
    paymentContent: { flex: 1 },
    paymentHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    paymentAmount: { fontSize: 15, fontWeight: '700', color: '#10B981' },
    paymentDate: { fontSize: 12, color: '#6B7280' },
    paymentMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
    paymentMode: { fontSize: 11, color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
    paymentRef: { fontSize: 11, color: '#6B7280' },
    paymentRemarks: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
});

export default SalaryTrackerDetailScreen;
