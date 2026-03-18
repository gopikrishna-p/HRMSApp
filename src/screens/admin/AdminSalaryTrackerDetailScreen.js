import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { Picker } from '@react-native-picker/picker';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

function AdminSalaryTrackerDetailScreen({ route, navigation }) {
    const { trackerId } = route.params;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Payment modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [payAmount, setPayAmount] = useState('');
    const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
    const [payMode, setPayMode] = useState('Bank Transfer');
    const [payRef, setPayRef] = useState('');
    const [payRemarks, setPayRemarks] = useState('');
    const [payLoading, setPayLoading] = useState(false);

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

    const handleApprove = async (action) => {
        try {
            const resp = await ApiService.approveSalaryTracker({
                tracker_id: trackerId,
                action: action,
            });
            const result = resp?.data?.message || resp?.data;
            if (result?.status === 'success') {
                showToast({ type: 'success', text1: 'Success', text2: result.message });
                loadDetail();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: result?.message || 'Failed' });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Error', text2: err.message });
        }
    };

    const handleRecordPayment = async () => {
        if (!payAmount || isNaN(parseFloat(payAmount)) || parseFloat(payAmount) <= 0) {
            showToast({ type: 'error', text1: 'Error', text2: 'Enter a valid amount' });
            return;
        }
        setPayLoading(true);
        try {
            const resp = await ApiService.recordSalaryPayment({
                tracker_id: trackerId,
                amount: parseFloat(payAmount),
                payment_date: payDate,
                payment_mode: payMode,
                reference: payRef,
                remarks: payRemarks,
            });
            const result = resp?.data?.message || resp?.data;
            if (result?.status === 'success') {
                showToast({ type: 'success', text1: 'Success', text2: result.message });
                setShowPaymentModal(false);
                setPayAmount('');
                setPayRef('');
                setPayRemarks('');
                loadDetail();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: result?.message || 'Failed' });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Error', text2: err.message });
        } finally {
            setPayLoading(false);
        }
    };

    const handleDeletePayment = (rowIdx) => {
        Alert.alert(
            'Delete Payment',
            'Are you sure you want to delete this payment entry?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive', onPress: async () => {
                        try {
                            const resp = await ApiService.deleteSalaryPayment({
                                tracker_id: trackerId,
                                row_idx: rowIdx,
                            });
                            const result = resp?.data?.message || resp?.data;
                            if (result?.status === 'success') {
                                showToast({ type: 'success', text1: 'Deleted', text2: result.message });
                                loadDetail();
                            } else {
                                showToast({ type: 'error', text1: 'Error', text2: result?.message || 'Failed' });
                            }
                        } catch (err) {
                            showToast({ type: 'error', text1: 'Error', text2: err.message });
                        }
                    }
                },
            ]
        );
    };

    const handleRecalculate = async () => {
        try {
            const resp = await ApiService.recalculateSalaryTracker({ tracker_id: trackerId });
            const result = resp?.data?.message || resp?.data;
            if (result?.status === 'success') {
                showToast({ type: 'success', text1: 'Success', text2: result.message });
                loadDetail();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: result?.message || 'Failed' });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Error', text2: err.message });
        }
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
                {/* Employee Info */}
                <View style={styles.empCard}>
                    <View style={styles.empAvatar}>
                        <Icon name="user" size={20} color="#6366F1" />
                    </View>
                    <View style={styles.empDetails}>
                        <Text style={styles.empName}>{data.employee_name}</Text>
                        <Text style={styles.empMonth}>{data.salary_month || `${data.month} ${data.year}`}</Text>
                        <Text style={styles.empId}>{data.employee}</Text>
                    </View>
                    <View style={styles.statusBadges}>
                        <View style={[styles.badge, { backgroundColor: getStatusColor(data.payment_status) + '20' }]}>
                            <Text style={[styles.badgeText, { color: getStatusColor(data.payment_status) }]}>
                                {data.payment_status}
                            </Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: getApprovalColor(data.status) + '20', marginTop: 4 }]}>
                            <Text style={[styles.badgeText, { color: getApprovalColor(data.status) }]}>
                                {data.status}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Approval Actions */}
                {data.status === 'Pending Review' && (
                    <View style={styles.approvalBar}>
                        <Text style={styles.approvalLabel}>⏳ Pending Review - Employee Submitted</Text>
                        <View style={styles.approvalActions}>
                            <TouchableOpacity
                                style={[styles.approvalBtn, { backgroundColor: '#10B981' }]}
                                onPress={() => handleApprove('approve')}
                            >
                                <Icon name="check" size={14} color="#fff" />
                                <Text style={styles.approvalBtnText}>Approve</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.approvalBtn, { backgroundColor: '#EF4444' }]}
                                onPress={() => handleApprove('reject')}
                            >
                                <Icon name="times" size={14} color="#fff" />
                                <Text style={styles.approvalBtnText}>Reject</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

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

                {/* Payment Summary + Record Payment Button */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>💳 Payment Summary</Text>
                        <TouchableOpacity style={styles.recordPayBtn} onPress={() => setShowPaymentModal(true)}>
                            <Icon name="plus" size={12} color="#fff" />
                            <Text style={styles.recordPayBtnText}>Record Payment</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.paymentSummaryCard}>
                        <View style={styles.paymentSummaryRow}>
                            <View style={styles.paymentSummaryItem}>
                                <Text style={styles.paymentSummaryLabel}>Total Paid</Text>
                                <Text style={[styles.paymentSummaryValue, { color: '#10B981' }]}>{formatCurrency(data.total_paid)}</Text>
                            </View>
                            <View style={styles.paymentSummaryItem}>
                                <Text style={styles.paymentSummaryLabel}>Pending</Text>
                                <Text style={[styles.paymentSummaryValue, { color: '#EF4444' }]}>{formatCurrency(data.pending_amount)}</Text>
                            </View>
                        </View>
                        <View style={styles.progressContainer}>
                            <View style={[styles.progressBar, { width: `${Math.min(paidPct, 100)}%` }]} />
                        </View>
                        <Text style={styles.progressLabel}>{paidPct.toFixed(1)}% Paid</Text>
                    </View>
                </View>

                {/* Attendance */}
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
                                        <View style={styles.paymentActions}>
                                            <Text style={styles.paymentDate}>{p.payment_date}</Text>
                                            <TouchableOpacity
                                                onPress={() => handleDeletePayment(p.idx)}
                                                style={styles.deleteBtn}
                                            >
                                                <Icon name="trash-alt" size={12} color="#EF4444" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <View style={styles.paymentMeta}>
                                        {p.payment_mode ? (
                                            <Text style={styles.paymentMode}>{p.payment_mode}</Text>
                                        ) : null}
                                        {p.reference ? (
                                            <Text style={styles.paymentRefText}>Ref: {p.reference}</Text>
                                        ) : null}
                                    </View>
                                    {p.remarks ? <Text style={styles.paymentRemarks}>{p.remarks}</Text> : null}
                                    {p.recorded_by ? <Text style={styles.paymentRecordedBy}>by {p.recorded_by}</Text> : null}
                                </View>
                            </View>
                        ))
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Payment Modal */}
            <Modal visible={showPaymentModal} transparent animationType="slide" onRequestClose={() => setShowPaymentModal(false)}>
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>Record Payment</Text>
                        <Text style={styles.modalSubtitle}>
                            Pending: {formatCurrency(data.pending_amount)}
                        </Text>

                        <Text style={styles.inputLabel}>Amount *</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Enter amount"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="numeric"
                            value={payAmount}
                            onChangeText={setPayAmount}
                        />

                        <Text style={styles.inputLabel}>Payment Date</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor="#9CA3AF"
                            value={payDate}
                            onChangeText={setPayDate}
                        />

                        <Text style={styles.inputLabel}>Payment Mode</Text>
                        <View style={styles.pickerBox}>
                            <Picker selectedValue={payMode} onValueChange={setPayMode} style={styles.pickerInner}>
                                <Picker.Item label="Bank Transfer" value="Bank Transfer" />
                                <Picker.Item label="Cash" value="Cash" />
                                <Picker.Item label="UPI" value="UPI" />
                                <Picker.Item label="Cheque" value="Cheque" />
                                <Picker.Item label="Other" value="Other" />
                            </Picker>
                        </View>

                        <Text style={styles.inputLabel}>Reference (Optional)</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Transaction ref / cheque no."
                            placeholderTextColor="#9CA3AF"
                            value={payRef}
                            onChangeText={setPayRef}
                        />

                        <Text style={styles.inputLabel}>Remarks (Optional)</Text>
                        <TextInput
                            style={[styles.textInput, { height: 60 }]}
                            placeholder="Any notes..."
                            placeholderTextColor="#9CA3AF"
                            multiline
                            value={payRemarks}
                            onChangeText={setPayRemarks}
                        />

                        <View style={styles.quickAmounts}>
                            {data.pending_amount > 0 && (
                                <TouchableOpacity
                                    style={styles.quickBtn}
                                    onPress={() => setPayAmount(String(data.pending_amount))}
                                >
                                    <Text style={styles.quickBtnText}>Full: {formatCurrency(data.pending_amount)}</Text>
                                </TouchableOpacity>
                            )}
                            {data.pending_amount > 0 && (
                                <TouchableOpacity
                                    style={styles.quickBtn}
                                    onPress={() => setPayAmount(String(Math.round(data.pending_amount / 2)))}
                                >
                                    <Text style={styles.quickBtnText}>Half: {formatCurrency(data.pending_amount / 2)}</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPaymentModal(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.submitBtn} onPress={handleRecordPayment} disabled={payLoading}>
                                {payLoading ? <ActivityIndicator color="#fff" size="small" /> :
                                    <Text style={styles.submitBtnText}>Record Payment</Text>}
                            </TouchableOpacity>
                        </View>
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
    // Employee card
    empCard: {
        flexDirection: 'row', backgroundColor: '#fff', margin: 16, borderRadius: 12,
        padding: 14, elevation: 2, alignItems: 'center',
    },
    empAvatar: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF2FF',
        justifyContent: 'center', alignItems: 'center',
    },
    empDetails: { flex: 1, marginLeft: 12 },
    empName: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
    empMonth: { fontSize: 13, color: '#6B7280', marginTop: 2 },
    empId: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
    statusBadges: { alignItems: 'flex-end' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    badgeText: { fontSize: 11, fontWeight: '600' },
    // Approval bar
    approvalBar: {
        backgroundColor: '#FEF3C7', marginHorizontal: 16, borderRadius: 12,
        padding: 14, borderLeftWidth: 3, borderLeftColor: '#F59E0B',
    },
    approvalLabel: { fontSize: 13, fontWeight: '600', color: '#92400E', marginBottom: 10 },
    approvalActions: { flexDirection: 'row', gap: 10 },
    approvalBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 10, borderRadius: 10, gap: 6,
    },
    approvalBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    // Sections
    section: { marginHorizontal: 16, marginTop: 16 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 10 },
    // Breakdown
    breakdownCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2 },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    breakdownLabel: { fontSize: 13, color: '#6B7280' },
    breakdownValue: { fontSize: 13, fontWeight: '600' },
    divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
    // Record payment button
    recordPayBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B981',
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 10,
    },
    recordPayBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    // Payment summary
    paymentSummaryCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2 },
    paymentSummaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
    paymentSummaryItem: { alignItems: 'center' },
    paymentSummaryLabel: { fontSize: 12, color: '#6B7280' },
    paymentSummaryValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
    progressContainer: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, marginTop: 16, overflow: 'hidden' },
    progressBar: { height: '100%', backgroundColor: '#10B981', borderRadius: 4 },
    progressLabel: { fontSize: 11, color: '#6B7280', textAlign: 'right', marginTop: 4 },
    // Attendance
    attendanceGrid: {
        flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#fff', borderRadius: 12,
        padding: 12, elevation: 2,
    },
    attendanceItem: { width: '33.3%', alignItems: 'center', paddingVertical: 10 },
    attendanceValue: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginTop: 4 },
    attendanceLabel: { fontSize: 10, color: '#6B7280', marginTop: 2 },
    // Payments
    noPayments: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#fff', borderRadius: 12 },
    noPaymentsText: { fontSize: 13, color: '#9CA3AF', marginTop: 8 },
    paymentItem: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, elevation: 1 },
    paymentDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981', marginTop: 4, marginRight: 12 },
    paymentContent: { flex: 1 },
    paymentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    paymentAmount: { fontSize: 15, fontWeight: '700', color: '#10B981' },
    paymentActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    paymentDate: { fontSize: 12, color: '#6B7280' },
    deleteBtn: { padding: 4 },
    paymentMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
    paymentMode: { fontSize: 11, color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
    paymentRefText: { fontSize: 11, color: '#6B7280' },
    paymentRemarks: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
    paymentRecordedBy: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
    // Modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContainer: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
    modalSubtitle: { fontSize: 14, color: '#EF4444', fontWeight: '600', marginTop: 4, marginBottom: 16 },
    inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 8 },
    textInput: {
        borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14,
        paddingVertical: 10, fontSize: 14, color: '#1F2937', backgroundColor: '#F9FAFB',
    },
    pickerBox: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, overflow: 'hidden' },
    pickerInner: { height: 50 },
    quickAmounts: { flexDirection: 'row', gap: 8, marginTop: 12 },
    quickBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    quickBtnText: { color: '#6366F1', fontSize: 12, fontWeight: '600' },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelBtn: {
        flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1,
        borderColor: '#D1D5DB', alignItems: 'center',
    },
    cancelBtnText: { color: '#6B7280', fontWeight: '600' },
    submitBtn: {
        flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#10B981', alignItems: 'center',
    },
    submitBtnText: { color: '#fff', fontWeight: '600' },
});

export default AdminSalaryTrackerDetailScreen;
