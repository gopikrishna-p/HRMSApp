import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Modal, Alert, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { Picker } from '@react-native-picker/picker';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function MySalaryTrackerScreen({ navigation }) {
    const [records, setRecords] = useState([]);
    const [overview, setOverview] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestMonth, setRequestMonth] = useState(MONTHS[new Date().getMonth()]);
    const [requestYear, setRequestYear] = useState(new Date().getFullYear());
    const [entryMode, setEntryMode] = useState('manual'); // 'manual' | 'auto'
    const [manualAmount, setManualAmount] = useState('');
    const [requestRemarks, setRequestRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [employeeId, setEmployeeId] = useState(null);

    useEffect(() => { loadData(); }, []);

    useFocusEffect(
        useCallback(() => { loadData(); }, [])
    );

    const loadData = async () => {
        setLoading(true);
        try {
            // Get employee ID
            const empResp = await ApiService.getCurrentEmployee();
            const empData = empResp?.data?.message;
            const empId = empData?.name || empData?.employee_id;
            setEmployeeId(empId);

            const [listResp, overviewResp] = await Promise.all([
                ApiService.getSalaryTrackerList({}),
                ApiService.getEmployeeSalaryOverview({ employee_id: empId }),
            ]);

            const listData = listResp?.data?.message || listResp?.data;
            const listArr = listData?.data || [];
            setRecords(Array.isArray(listArr) ? listArr : []);

            const ovData = overviewResp?.data?.message || overviewResp?.data;
            setOverview(ovData?.data || {});
        } catch (err) {
            console.error('Load salary tracker error:', err);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleRequest = async () => {
        if (!employeeId) {
            showToast({ type: 'error', text1: 'Error', text2: 'Employee not found' });
            return;
        }
        if (entryMode === 'manual' && (!manualAmount || isNaN(parseFloat(manualAmount)) || parseFloat(manualAmount) <= 0)) {
            showToast({ type: 'error', text1: 'Error', text2: 'Enter a valid pending salary amount' });
            return;
        }
        setSubmitting(true);
        try {
            const params = {
                employee_id: employeeId,
                month: requestMonth,
                year: requestYear,
                remarks: requestRemarks || undefined,
            };
            if (entryMode === 'manual') {
                params.manual_amount = parseFloat(manualAmount);
            }
            const resp = await ApiService.requestPendingSalary(params);
            const data = resp?.data?.message || resp?.data;
            if (data?.status === 'success') {
                showToast({ type: 'success', text1: 'Success', text2: data.message });
                setShowRequestModal(false);
                setManualAmount('');
                setRequestRemarks('');
                loadData();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: data?.message || 'Failed to submit' });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Error', text2: err.message || 'Failed' });
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

    const getStatusIcon = (status) => {
        switch (status) {
            case 'Fully Paid': return 'check-circle';
            case 'Partially Paid': return 'clock';
            case 'Unpaid': return 'times-circle';
            default: return 'question-circle';
        }
    };

    const formatCurrency = (amt) => `₹${(amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const renderOverview = () => {
        if (!overview.total_salary) return null;
        const paidPct = overview.total_salary > 0 ? (overview.total_paid / overview.total_salary) * 100 : 0;
        return (
            <View style={styles.overviewCard}>
                <Text style={styles.overviewTitle}>💰 Salary Overview</Text>
                <View style={styles.overviewRow}>
                    <View style={styles.overviewItem}>
                        <Text style={styles.overviewLabel}>Total Salary</Text>
                        <Text style={[styles.overviewValue, { color: '#6366F1' }]}>{formatCurrency(overview.total_salary)}</Text>
                    </View>
                    <View style={styles.overviewItem}>
                        <Text style={styles.overviewLabel}>Total Paid</Text>
                        <Text style={[styles.overviewValue, { color: '#10B981' }]}>{formatCurrency(overview.total_paid)}</Text>
                    </View>
                    <View style={styles.overviewItem}>
                        <Text style={styles.overviewLabel}>Pending</Text>
                        <Text style={[styles.overviewValue, { color: '#EF4444' }]}>{formatCurrency(overview.total_pending)}</Text>
                    </View>
                </View>
                <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBar, { width: `${Math.min(paidPct, 100)}%` }]} />
                </View>
                <Text style={styles.progressText}>{paidPct.toFixed(1)}% Paid</Text>
                <View style={styles.monthsRow}>
                    <Text style={styles.monthsBadge}>✅ {overview.fully_paid_months || 0} Paid</Text>
                    <Text style={[styles.monthsBadge, { backgroundColor: '#FEF3C7', color: '#F59E0B' }]}>
                        ⏳ {overview.partially_paid_months || 0} Partial
                    </Text>
                    <Text style={[styles.monthsBadge, { backgroundColor: '#FEE2E2', color: '#EF4444' }]}>
                        ❌ {overview.unpaid_months || 0} Unpaid
                    </Text>
                </View>
            </View>
        );
    };

    const renderItem = ({ item }) => {
        const paidPct = item.salary_to_pay > 0 ? (item.total_paid / item.salary_to_pay) * 100 : 0;
        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('SalaryTrackerDetail', { trackerId: item.name })}
                activeOpacity={0.7}
            >
                <View style={styles.cardHeader}>
                    <View>
                        <Text style={styles.cardMonth}>{item.salary_month || `${item.month} ${item.year}`}</Text>
                        <Text style={styles.cardSubtext}>Working Days: {item.working_days} | Present: {item.present_days}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.payment_status) + '20' }]}>
                        <Icon name={getStatusIcon(item.payment_status)} size={12} color={getStatusColor(item.payment_status)} />
                        <Text style={[styles.statusText, { color: getStatusColor(item.payment_status) }]}>
                            {item.payment_status}
                        </Text>
                    </View>
                </View>

                <View style={styles.cardBody}>
                    <View style={styles.salaryRow}>
                        <View style={styles.salaryItem}>
                            <Text style={styles.salaryLabel}>Net Salary</Text>
                            <Text style={styles.salaryValue}>{formatCurrency(item.salary_to_pay)}</Text>
                        </View>
                        <View style={styles.salaryItem}>
                            <Text style={styles.salaryLabel}>Paid</Text>
                            <Text style={[styles.salaryValue, { color: '#10B981' }]}>{formatCurrency(item.total_paid)}</Text>
                        </View>
                        <View style={styles.salaryItem}>
                            <Text style={styles.salaryLabel}>Pending</Text>
                            <Text style={[styles.salaryValue, { color: '#EF4444' }]}>{formatCurrency(item.pending_amount)}</Text>
                        </View>
                    </View>
                    <View style={styles.miniProgressContainer}>
                        <View style={[styles.miniProgress, { width: `${Math.min(paidPct, 100)}%` }]} />
                    </View>
                </View>

                <View style={styles.cardFooter}>
                    <Icon name="chevron-right" size={14} color="#9CA3AF" />
                </View>
            </TouchableOpacity>
        );
    };

    const renderRequestModal = () => (
        <Modal visible={showRequestModal} transparent animationType="slide" onRequestClose={() => setShowRequestModal(false)}>
            <View style={styles.modalBackdrop}>
                <View style={styles.modalContainer}>
                    <Text style={styles.modalTitle}>Request Pending Salary</Text>
                    <Text style={styles.modalSubtitle}>Add a salary record for admin review</Text>

                    {/* Entry mode toggle */}
                    <View style={styles.modeToggle}>
                        <TouchableOpacity
                            style={[styles.modeBtn, entryMode === 'manual' && styles.modeBtnActive]}
                            onPress={() => setEntryMode('manual')}
                        >
                            <Icon name="edit" size={12} color={entryMode === 'manual' ? '#fff' : '#6366F1'} />
                            <Text style={[styles.modeBtnText, entryMode === 'manual' && styles.modeBtnTextActive]}>Enter Amount</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modeBtn, entryMode === 'auto' && styles.modeBtnActive]}
                            onPress={() => setEntryMode('auto')}
                        >
                            <Icon name="calculator" size={12} color={entryMode === 'auto' ? '#fff' : '#6366F1'} />
                            <Text style={[styles.modeBtnText, entryMode === 'auto' && styles.modeBtnTextActive]}>Auto Calculate</Text>
                        </TouchableOpacity>
                    </View>

                    {entryMode === 'manual' && (
                        <Text style={styles.modeHint}>For past months — enter your pending salary amount. Admin will review and approve.</Text>
                    )}
                    {entryMode === 'auto' && (
                        <Text style={styles.modeHint}>Calculates from attendance records & salary structure. Best for recent months.</Text>
                    )}

                    <Text style={styles.inputLabel}>Month</Text>
                    <View style={styles.pickerContainer}>
                        <Picker selectedValue={requestMonth} onValueChange={setRequestMonth} style={styles.picker}>
                            {MONTHS.map(m => <Picker.Item key={m} label={m} value={m} />)}
                        </Picker>
                    </View>

                    <Text style={styles.inputLabel}>Year</Text>
                    <View style={styles.pickerContainer}>
                        <Picker selectedValue={requestYear} onValueChange={setRequestYear} style={styles.picker}>
                            {[2024, 2025, 2026, 2027].map(y => <Picker.Item key={y} label={String(y)} value={y} />)}
                        </Picker>
                    </View>

                    {entryMode === 'manual' && (
                        <>
                            <Text style={styles.inputLabel}>Pending Salary Amount *</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Enter pending amount (e.g. 30000)"
                                placeholderTextColor="#9CA3AF"
                                keyboardType="numeric"
                                value={manualAmount}
                                onChangeText={setManualAmount}
                            />
                        </>
                    )}

                    <Text style={styles.inputLabel}>Remarks (Optional)</Text>
                    <TextInput
                        style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
                        placeholder="e.g. Pending from October, partial payment received"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        value={requestRemarks}
                        onChangeText={setRequestRemarks}
                    />

                    <View style={styles.modalButtons}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRequestModal(false)}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.submitBtn} onPress={handleRequest} disabled={submitting}>
                            {submitting ? <ActivityIndicator color="#fff" size="small" /> :
                                <Text style={styles.submitBtnText}>Submit Request</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={{ marginTop: 10, color: '#6B7280' }}>Loading salary records...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={records}
                keyExtractor={(item) => item.name}
                renderItem={renderItem}
                ListHeaderComponent={renderOverview}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Icon name="wallet" size={48} color="#D1D5DB" />
                        <Text style={styles.emptyText}>No salary records yet</Text>
                        <Text style={styles.emptySubtext}>Request a pending month or wait for admin to add</Text>
                    </View>
                }
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366F1']} />}
                contentContainerStyle={{ paddingBottom: 20 }}
            />

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => setShowRequestModal(true)} activeOpacity={0.8}>
                <Icon name="plus" size={18} color="#fff" />
            </TouchableOpacity>

            {renderRequestModal()}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F3F4F6' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    fab: {
        position: 'absolute', bottom: 24, right: 20,
        backgroundColor: '#6366F1', width: 52, height: 52, borderRadius: 26,
        justifyContent: 'center', alignItems: 'center',
        elevation: 6, shadowColor: '#6366F1', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    },
    overviewCard: {
        backgroundColor: '#fff', margin: 16, marginBottom: 8, borderRadius: 16,
        padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8,
    },
    overviewTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 12 },
    overviewRow: { flexDirection: 'row', justifyContent: 'space-between' },
    overviewItem: { alignItems: 'center', flex: 1 },
    overviewLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
    overviewValue: { fontSize: 14, fontWeight: '700' },
    progressBarContainer: {
        height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, marginTop: 12, overflow: 'hidden',
    },
    progressBar: { height: '100%', backgroundColor: '#10B981', borderRadius: 4 },
    progressText: { fontSize: 11, color: '#6B7280', textAlign: 'right', marginTop: 4 },
    monthsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
    monthsBadge: {
        fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
        backgroundColor: '#ECFDF5', color: '#10B981', fontWeight: '600', overflow: 'hidden',
    },
    card: {
        backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 6, borderRadius: 12,
        padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    cardMonth: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
    cardSubtext: { fontSize: 11, color: '#6B7280', marginTop: 2 },
    statusBadge: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 12, gap: 4,
    },
    statusText: { fontSize: 11, fontWeight: '600' },
    cardBody: {},
    salaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
    salaryItem: { alignItems: 'center', flex: 1 },
    salaryLabel: { fontSize: 10, color: '#9CA3AF', marginBottom: 2 },
    salaryValue: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
    miniProgressContainer: { height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, marginTop: 10, overflow: 'hidden' },
    miniProgress: { height: '100%', backgroundColor: '#10B981', borderRadius: 2 },
    cardFooter: { alignItems: 'flex-end', marginTop: 6 },
    empty: { alignItems: 'center', marginTop: 80 },
    emptyText: { fontSize: 16, fontWeight: '600', color: '#6B7280', marginTop: 12 },
    emptySubtext: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContainer: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
    modalSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 20 },
    inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 8 },
    pickerContainer: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, overflow: 'hidden' },
    picker: { height: 50 },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
    cancelBtn: {
        flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1,
        borderColor: '#D1D5DB', alignItems: 'center',
    },
    cancelBtnText: { color: '#6B7280', fontWeight: '600' },
    submitBtn: {
        flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#6366F1', alignItems: 'center',
    },
    submitBtnText: { color: '#fff', fontWeight: '600' },
    modeToggle: {
        flexDirection: 'row', backgroundColor: '#EEF2FF', borderRadius: 12, padding: 3, marginBottom: 8,
    },
    modeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 10, borderRadius: 10, gap: 6,
    },
    modeBtnActive: { backgroundColor: '#6366F1' },
    modeBtnText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
    modeBtnTextActive: { color: '#fff' },
    modeHint: { fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginBottom: 10 },
    textInput: {
        borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14,
        paddingVertical: 10, fontSize: 14, color: '#1F2937', backgroundColor: '#F9FAFB',
    },
});

export default MySalaryTrackerScreen;
