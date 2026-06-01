import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import { formatLocalDate } from '../../utils/dateFormat';

function SalaryTrackerDetailScreen({ route, navigation }) {
    const { trackerId } = route.params;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // "Record Received Amount" modal state
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [receiptAmount, setReceiptAmount] = useState('');
    const [receiptMode, setReceiptMode] = useState('Bank Transfer');
    const [receiptReference, setReceiptReference] = useState('');
    const [receiptRemarks, setReceiptRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    // 'full' | 'half' | 'quarter' | 'custom' — drives the chip highlight in
    // the receipt modal so the user can fill the most common partial
    // amounts in one tap.
    const [receiptPreset, setReceiptPreset] = useState('full');

    const applyReceiptPreset = (preset) => {
        const pending = Math.max(0, Number(data?.pending_amount || 0));
        setReceiptPreset(preset);
        if (pending <= 0) {
            setReceiptAmount('');
            return;
        }
        if (preset === 'full') setReceiptAmount(pending.toFixed(2));
        else if (preset === 'half') setReceiptAmount(String(Math.round(pending / 2)));
        else if (preset === 'quarter') setReceiptAmount(String(Math.round(pending / 4)));
        else setReceiptAmount('');                  // 'custom'
    };

    const onReceiptAmountChange = (text) => {
        setReceiptAmount(text);
        if (receiptPreset !== 'custom') setReceiptPreset('custom');
    };

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

    const openReceiptModal = () => {
        // Start with the "Full" preset selected — most common case is
        // "received exactly what was owed", one tap to confirm.
        const pending = Math.max(0, Number(data?.pending_amount || 0));
        setReceiptAmount(pending > 0 ? pending.toFixed(2) : '');
        setReceiptPreset('full');
        setReceiptMode('Bank Transfer');
        setReceiptReference('');
        setReceiptRemarks('');
        setShowReceiptModal(true);
    };

    const submitReceipt = async () => {
        const parsed = parseFloat(receiptAmount);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            Alert.alert('Invalid amount', 'Enter a positive received amount.');
            return;
        }
        const pending = Math.max(0, Number(data?.pending_amount || 0));
        if (pending > 0 && parsed > pending + 0.01) {
            Alert.alert(
                'Exceeds pending',
                `You can record up to ₹${pending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (the pending balance).`,
            );
            return;
        }
        setSubmitting(true);
        try {
            const resp = await ApiService.recordReceivedAmountByEmployee({
                tracker_id: trackerId,
                amount: parsed,
                payment_date: formatLocalDate(new Date()),
                payment_mode: receiptMode,
                reference: receiptReference,
                remarks: receiptRemarks,
            });
            const result = resp?.data?.message || resp?.data;
            if (result?.status === 'success') {
                showToast({ type: 'success', text1: 'Receipt recorded', text2: result.message });
                setShowReceiptModal(false);
                await loadDetail();
            } else {
                throw new Error(result?.message || 'Could not record receipt');
            }
        } catch (err) {
            const msg = err?.response?.data?.exception
                || err?.response?.data?._server_messages
                || err?.message
                || 'Failed to record receipt';
            Alert.alert('Could not record receipt', String(msg).slice(0, 300));
        } finally {
            setSubmitting(false);
        }
    };

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
    const presentTotal = data.attended_days != null
        ? data.attended_days
        : ((data.present_days || 0) + (data.wfh_days || 0) + (data.onsite_days || 0));
    const officeDays = data.office_days != null ? data.office_days : data.present_days;

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

                {/* Salary Breakdown — mirrors the All-Employees Excel columns
                    O–U: Total Earnings → TDS → WFH → Absent → Total Deductions
                    → Salary to Pay. Sub-deductions are listed before the
                    "Total Deductions" sum so the math reads top-to-bottom. */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>💵 Salary Breakdown</Text>
                    <View style={styles.breakdownCard}>
                        <BreakdownRow label="💰 Total Earnings"   value={formatCurrency(data.total_earnings)}   color="#1F2937" bold />
                        <View style={styles.divider} />
                        <BreakdownRow label="➖ TDS Deductions"   value={`- ${formatCurrency(data.tds_deduction)}`}    color="#EF4444" />
                        <BreakdownRow label="🏠 WFH Deduction"    value={`- ${formatCurrency(data.wfh_deduction)}`}    color="#F59E0B" />
                        <BreakdownRow label="❌ Absent Ded."       value={`- ${formatCurrency(data.absent_deduction)}`} color="#EF4444" />
                        <View style={styles.divider} />
                        <BreakdownRow label="➖ Total Deductions" value={`- ${formatCurrency(data.total_deductions)}`}  color="#EF4444" bold />
                        <View style={styles.divider} />
                        <BreakdownRow label="💳 Salary to Pay"    value={formatCurrency(data.salary_to_pay)}   color="#10B981" bold />
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

                        {/* Employee can acknowledge receipt only on Approved records
                            that still have a pending balance. */}
                        {data.status === 'Approved' && Number(data.pending_amount || 0) > 0 ? (
                            <TouchableOpacity style={styles.receiptButton} onPress={openReceiptModal}>
                                <Icon name="hand-holding-usd" size={14} color="#fff" />
                                <Text style={styles.receiptButtonText}>I Received This Amount</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>

                {/* Attendance Summary — mirrors Excel columns F–O.
                    `Present = Office + WFH + Onsite` so the employee sees the
                    same composite used to compute the absent shortfall. */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📋 Attendance</Text>
                    <View style={styles.attendanceGrid}>
                        <AttendanceItem icon="calendar-check" label="Working" value={data.working_days} color="#6366F1" />
                        <AttendanceItem icon="check-circle"   label="Present" value={presentTotal} color="#10B981" />
                        <AttendanceItem icon="building"       label="Office"  value={officeDays} color="#10B981" />
                        <AttendanceItem icon="home"           label="WFH"     value={data.wfh_days} color="#F59E0B" />
                        <AttendanceItem icon="map-marker-alt" label="Onsite"  value={data.onsite_days} color="#3B82F6" />
                        <AttendanceItem icon="times-circle"   label="Absent"  value={data.absent_days} color="#EF4444" />
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

            {/* Record-receipt modal */}
            <Modal
                visible={showReceiptModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowReceiptModal(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Acknowledge Receipt</Text>
                            <TouchableOpacity onPress={() => setShowReceiptModal(false)}>
                                <Icon name="times" size={20} color="#6B7280" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalHint}>
                            Pending: {formatCurrency(data?.pending_amount)}. Enter what you actually received.
                        </Text>

                        {/* Quick presets — Full / Half / Quarter / Custom.
                            Active chip is highlighted; typing into the input
                            switches back to "Custom" so the chips never lie
                            about what's in the field. */}
                        {Number(data?.pending_amount || 0) > 0 ? (
                            <>
                                <Text style={styles.modalLabel}>Quick Amount</Text>
                                <View style={styles.presetRow}>
                                    {[
                                        { key: 'full',    label: 'Full',    sub: formatCurrency(data.pending_amount) },
                                        { key: 'half',    label: 'Half',    sub: formatCurrency(Math.round(data.pending_amount / 2)) },
                                        { key: 'quarter', label: 'Quarter', sub: formatCurrency(Math.round(data.pending_amount / 4)) },
                                        { key: 'custom',  label: 'Custom',  sub: 'Type below' },
                                    ].map((p) => {
                                        const active = receiptPreset === p.key;
                                        return (
                                            <TouchableOpacity
                                                key={p.key}
                                                style={[styles.presetChip, active && styles.presetChipActive]}
                                                onPress={() => applyReceiptPreset(p.key)}
                                            >
                                                <Text style={[styles.presetChipLabel, active && styles.presetChipLabelActive]}>
                                                    {p.label}
                                                </Text>
                                                <Text style={[styles.presetChipSub, active && styles.presetChipSubActive]}>
                                                    {p.sub}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </>
                        ) : null}

                        <Text style={styles.modalLabel}>Amount Received *</Text>
                        <TextInput
                            style={styles.modalInput}
                            keyboardType="decimal-pad"
                            placeholder="e.g. 25000"
                            value={receiptAmount}
                            onChangeText={onReceiptAmountChange}
                        />

                        <Text style={styles.modalLabel}>Payment Mode</Text>
                        <View style={styles.modeRow}>
                            {['Bank Transfer', 'Cash', 'UPI', 'Cheque'].map((mode) => (
                                <TouchableOpacity
                                    key={mode}
                                    style={[
                                        styles.modeChip,
                                        receiptMode === mode && styles.modeChipActive,
                                    ]}
                                    onPress={() => setReceiptMode(mode)}
                                >
                                    <Text
                                        style={[
                                            styles.modeChipText,
                                            receiptMode === mode && styles.modeChipTextActive,
                                        ]}
                                    >
                                        {mode}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.modalLabel}>Reference (optional)</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="UTR / transaction id"
                            value={receiptReference}
                            onChangeText={setReceiptReference}
                        />

                        <Text style={styles.modalLabel}>Remarks (optional)</Text>
                        <TextInput
                            style={[styles.modalInput, { minHeight: 60, textAlignVertical: 'top' }]}
                            placeholder="Anything to flag for HR…"
                            value={receiptRemarks}
                            onChangeText={setReceiptRemarks}
                            multiline
                        />

                        <TouchableOpacity
                            style={[styles.modalSubmit, submitting && { opacity: 0.6 }]}
                            onPress={submitReceipt}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.modalSubmitText}>Confirm Receipt</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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

    receiptButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, marginTop: 16, paddingVertical: 12, backgroundColor: '#10B981',
        borderRadius: 10,
    },
    receiptButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
    modalHint: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
    modalLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 10, marginBottom: 6 },
    modalInput: {
        borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8,
        paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827',
        backgroundColor: '#F9FAFB',
    },
    modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    modeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
    modeChipActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
    modeChipText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
    modeChipTextActive: { color: '#6366F1' },

    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    presetChip: {
        flexGrow: 1, minWidth: '22%',
        paddingHorizontal: 10, paddingVertical: 8,
        borderRadius: 10, borderWidth: 1,
        borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
        alignItems: 'center',
    },
    presetChipActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
    presetChipLabel: { fontSize: 12, fontWeight: '700', color: '#374151' },
    presetChipLabelActive: { color: '#6366F1' },
    presetChipSub: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
    presetChipSubActive: { color: '#4F46E5' },
    modalSubmit: {
        marginTop: 18, backgroundColor: '#6366F1', paddingVertical: 14,
        borderRadius: 10, alignItems: 'center',
    },
    modalSubmitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default SalaryTrackerDetailScreen;
