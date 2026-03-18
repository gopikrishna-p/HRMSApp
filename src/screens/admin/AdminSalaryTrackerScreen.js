import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Modal, Alert, TextInput, ScrollView,
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

function AdminSalaryTrackerScreen({ navigation }) {
    const [tab, setTab] = useState('all'); // 'all' | 'pending'
    const [records, setRecords] = useState([]);
    const [pendingReviews, setPendingReviews] = useState([]);
    const [summary, setSummary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [filterMonth, setFilterMonth] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [tempFilterMonth, setTempFilterMonth] = useState('');
    const [tempFilterStatus, setTempFilterStatus] = useState('');

    // Add month modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [addMode, setAddMode] = useState('bulk'); // 'bulk' | 'self'
    const [addMonth, setAddMonth] = useState(MONTHS[new Date().getMonth()]);
    const [addYear, setAddYear] = useState(new Date().getFullYear());
    const [addDept, setAddDept] = useState('');
    const [selfAmount, setSelfAmount] = useState('');
    const [selfRemarks, setSelfRemarks] = useState('');
    const [departments, setDepartments] = useState([]);
    const [addLoading, setAddLoading] = useState(false);
    const [adminEmployeeId, setAdminEmployeeId] = useState(null);

    useEffect(() => { loadData(); loadDepartments(); loadAdminEmployee(); }, []);

    useFocusEffect(
        useCallback(() => { loadData(); }, [filterMonth, filterStatus])
    );

    const loadAdminEmployee = async () => {
        try {
            const resp = await ApiService.getCurrentEmployee();
            const empData = resp?.data?.message;
            setAdminEmployeeId(empData?.name || empData?.employee_id || null);
        } catch (err) { /* admin may not have employee record */ }
    };

    const loadDepartments = async () => {
        try {
            const resp = await ApiService.getDepartments();
            const data = resp?.data?.message || resp?.data?.data || [];
            setDepartments(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Load departments error:', err);
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const filters = {};
            if (filterMonth) filters.month = filterMonth;
            if (filterStatus) filters.payment_status = filterStatus;

            const [listResp, pendingResp, summaryResp] = await Promise.all([
                ApiService.getSalaryTrackerList(filters),
                ApiService.getPendingReviewTrackers(),
                ApiService.getPendingSalarySummary(),
            ]);

            const listData = listResp?.data?.message || listResp?.data;
            const listArr = listData?.data || [];
            setRecords(Array.isArray(listArr) ? listArr : []);

            const pendingData = pendingResp?.data?.message || pendingResp?.data;
            const pendingArr = pendingData?.data || [];
            setPendingReviews(Array.isArray(pendingArr) ? pendingArr : []);

            const sumData = summaryResp?.data?.message || summaryResp?.data;
            const sumObj = sumData?.data || {};
            setSummary(Array.isArray(sumObj?.employees) ? sumObj.employees : (Array.isArray(sumObj) ? sumObj : []));
        } catch (err) {
            console.error('Load admin salary tracker error:', err);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleAddMonth = async () => {
        setAddLoading(true);
        try {
            const resp = await ApiService.addMonthlySalaries({
                month: addMonth,
                year: addYear,
                department: addDept || undefined,
            });
            const data = resp?.data?.message || resp?.data;
            if (data?.status === 'success') {
                showToast({ type: 'success', text1: 'Success', text2: data.message });
                setShowAddModal(false);
                loadData();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: data?.message || 'Failed' });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Error', text2: err.message || 'Failed' });
        } finally {
            setAddLoading(false);
        }
    };

    const handleAddSelf = async () => {
        if (!adminEmployeeId) {
            showToast({ type: 'error', text1: 'Error', text2: 'No employee record found for your account' });
            return;
        }
        if (!selfAmount || isNaN(parseFloat(selfAmount)) || parseFloat(selfAmount) <= 0) {
            showToast({ type: 'error', text1: 'Error', text2: 'Enter a valid salary amount' });
            return;
        }
        setAddLoading(true);
        try {
            const resp = await ApiService.requestPendingSalary({
                employee_id: adminEmployeeId,
                month: addMonth,
                year: addYear,
                manual_amount: parseFloat(selfAmount),
                remarks: selfRemarks || undefined,
            });
            const data = resp?.data?.message || resp?.data;
            if (data?.status === 'success') {
                showToast({ type: 'success', text1: 'Success', text2: data.message });
                setShowAddModal(false);
                setSelfAmount('');
                setSelfRemarks('');
                loadData();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: data?.message || 'Failed' });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Error', text2: err.message || 'Failed' });
        } finally {
            setAddLoading(false);
        }
    };

    const handleApprove = async (trackerId, action) => {
        try {
            const resp = await ApiService.approveSalaryTracker({
                tracker_id: trackerId,
                action: action,
            });
            const data = resp?.data?.message || resp?.data;
            if (data?.status === 'success') {
                showToast({ type: 'success', text1: 'Success', text2: data.message });
                loadData();
            } else {
                showToast({ type: 'error', text1: 'Error', text2: data?.message || 'Failed' });
            }
        } catch (err) {
            showToast({ type: 'error', text1: 'Error', text2: err.message });
        }
    };

    const applyFilters = () => {
        setFilterMonth(tempFilterMonth);
        setFilterStatus(tempFilterStatus);
        setShowFilterModal(false);
        // loadData will be triggered by useFocusEffect deps
        setTimeout(() => loadData(), 100);
    };

    const clearFilters = () => {
        setTempFilterMonth('');
        setTempFilterStatus('');
        setFilterMonth('');
        setFilterStatus('');
        setShowFilterModal(false);
        setTimeout(() => loadData(), 100);
    };

    const formatCurrency = (amt) => `₹${(amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const getStatusColor = (status) => {
        switch (status) {
            case 'Fully Paid': return '#10B981';
            case 'Partially Paid': return '#F59E0B';
            case 'Unpaid': return '#EF4444';
            default: return '#6B7280';
        }
    };

    const totalPending = summary.reduce((sum, e) => sum + (e.total_pending || 0), 0);
    const totalSalary = summary.reduce((sum, e) => sum + (e.total_salary || 0), 0);
    const totalPaid = summary.reduce((sum, e) => sum + (e.total_paid || 0), 0);
    const hasFilters = filterMonth || filterStatus;

    const renderRecordItem = ({ item }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('AdminSalaryTrackerDetail', { trackerId: item.name })}
            activeOpacity={0.7}
        >
            <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.cardEmpName}>{item.employee_name}</Text>
                    <Text style={styles.cardMonth}>{item.salary_month || `${item.month} ${item.year}`}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: getStatusColor(item.payment_status) + '20' }]}>
                    <Text style={[styles.badgeText, { color: getStatusColor(item.payment_status) }]}>
                        {item.payment_status}
                    </Text>
                </View>
            </View>
            <View style={styles.cardAmounts}>
                <View style={styles.amountCol}>
                    <Text style={styles.amountLabel}>Salary</Text>
                    <Text style={styles.amountValue}>{formatCurrency(item.salary_to_pay)}</Text>
                </View>
                <View style={styles.amountCol}>
                    <Text style={styles.amountLabel}>Paid</Text>
                    <Text style={[styles.amountValue, { color: '#10B981' }]}>{formatCurrency(item.total_paid)}</Text>
                </View>
                <View style={styles.amountCol}>
                    <Text style={styles.amountLabel}>Pending</Text>
                    <Text style={[styles.amountValue, { color: '#EF4444' }]}>{formatCurrency(item.pending_amount)}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    const renderPendingItem = ({ item }) => (
        <View style={styles.pendingCard}>
            <View style={styles.pendingInfo}>
                <Text style={styles.cardEmpName}>{item.employee_name}</Text>
                <Text style={styles.cardMonth}>{item.salary_month || `${item.month} ${item.year}`}</Text>
                <Text style={styles.pendingSalary}>Salary: {formatCurrency(item.salary_to_pay)}</Text>
            </View>
            <View style={styles.pendingActions}>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                    onPress={() => handleApprove(item.name, 'approve')}
                >
                    <Icon name="check" size={14} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                    onPress={() => handleApprove(item.name, 'reject')}
                >
                    <Icon name="times" size={14} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderListHeader = () => (
        <View>
            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
                <View style={[styles.summaryCard, { borderLeftColor: '#6366F1' }]}>
                    <Text style={styles.summaryLabel}>Total Salary</Text>
                    <Text style={[styles.summaryValue, { color: '#6366F1' }]}>{formatCurrency(totalSalary)}</Text>
                </View>
                <View style={[styles.summaryCard, { borderLeftColor: '#10B981' }]}>
                    <Text style={styles.summaryLabel}>Total Paid</Text>
                    <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(totalPaid)}</Text>
                </View>
                <View style={[styles.summaryCard, { borderLeftColor: '#EF4444' }]}>
                    <Text style={styles.summaryLabel}>Total Pending</Text>
                    <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{formatCurrency(totalPending)}</Text>
                </View>
            </View>

            {/* Per Employee Summary */}
            {summary.length > 0 && (
                <View style={styles.empSummarySection}>
                    <Text style={styles.empSummaryTitle}>Per Employee Pending</Text>
                    {summary.slice(0, 5).map((emp, idx) => (
                        <View key={idx} style={styles.empSummaryRow}>
                            <View style={styles.empInfo}>
                                <Text style={styles.empName}>{emp.employee_name}</Text>
                                <Text style={styles.empDept}>{emp.department || '-'}</Text>
                            </View>
                            <View style={styles.empAmounts}>
                                <Text style={[styles.empPending, { color: '#EF4444' }]}>{formatCurrency(emp.total_pending)}</Text>
                                <Text style={styles.empTrackers}>{emp.tracker_count} months</Text>
                            </View>
                        </View>
                    ))}
                    {summary.length > 5 && (
                        <Text style={styles.moreText}>+{summary.length - 5} more employees</Text>
                    )}
                </View>
            )}

            {/* Tabs */}
            <View style={styles.tabRow}>
                <TouchableOpacity
                    style={[styles.tab, tab === 'all' && styles.tabActive]}
                    onPress={() => setTab('all')}
                >
                    <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>All Records</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, tab === 'pending' && styles.tabActive]}
                    onPress={() => setTab('pending')}
                >
                    <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>
                        Pending Review {pendingReviews.length > 0 && `(${pendingReviews.length})`}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Filter bar (no Pickers here—just buttons) */}
            {tab === 'all' && (
                <View style={styles.filterBar}>
                    <TouchableOpacity style={[styles.filterChip, hasFilters && styles.filterChipActive]}
                        onPress={() => { setTempFilterMonth(filterMonth); setTempFilterStatus(filterStatus); setShowFilterModal(true); }}>
                        <Icon name="filter" size={12} color={hasFilters ? '#fff' : '#6366F1'} />
                        <Text style={[styles.filterChipText, hasFilters && { color: '#fff' }]}>
                            {hasFilters ? `${filterMonth || 'All'} · ${filterStatus || 'All'}` : 'Filter'}
                        </Text>
                    </TouchableOpacity>
                    {hasFilters && (
                        <TouchableOpacity onPress={clearFilters} style={styles.clearBtn}>
                            <Icon name="times" size={12} color="#6B7280" />
                            <Text style={styles.clearBtnText}>Clear</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );

    const currentData = tab === 'all' ? records : pendingReviews;
    const renderFn = tab === 'all' ? renderRecordItem : renderPendingItem;

    // Filter Modal (Pickers in a Modal to avoid addView crash)
    const renderFilterModal = () => (
        <Modal visible={showFilterModal} transparent animationType="slide" onRequestClose={() => setShowFilterModal(false)}>
            <View style={styles.modalBackdrop}>
                <View style={styles.modalContainer}>
                    <Text style={styles.modalTitle}>Filter Records</Text>

                    <Text style={styles.inputLabel}>Month</Text>
                    <View style={styles.pickerBox}>
                        <Picker selectedValue={tempFilterMonth} onValueChange={setTempFilterMonth} style={styles.pickerInner}>
                            <Picker.Item label="All Months" value="" />
                            {MONTHS.map(m => <Picker.Item key={m} label={m} value={m} />)}
                        </Picker>
                    </View>

                    <Text style={styles.inputLabel}>Payment Status</Text>
                    <View style={styles.pickerBox}>
                        <Picker selectedValue={tempFilterStatus} onValueChange={setTempFilterStatus} style={styles.pickerInner}>
                            <Picker.Item label="All Status" value="" />
                            <Picker.Item label="Unpaid" value="Unpaid" />
                            <Picker.Item label="Partially Paid" value="Partially Paid" />
                            <Picker.Item label="Fully Paid" value="Fully Paid" />
                        </Picker>
                    </View>

                    <View style={styles.modalButtons}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowFilterModal(false)}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.submitBtn} onPress={applyFilters}>
                            <Text style={styles.submitBtnText}>Apply</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    // Add modal with bulk + self options
    const renderAddModal = () => (
        <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
            <View style={styles.modalBackdrop}>
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
                    <View style={styles.modalContainer}>
                        {/* Mode toggle */}
                        <View style={styles.modeToggle}>
                            <TouchableOpacity
                                style={[styles.modeBtn, addMode === 'bulk' && styles.modeBtnActive]}
                                onPress={() => setAddMode('bulk')}
                            >
                                <Icon name="users" size={12} color={addMode === 'bulk' ? '#fff' : '#6366F1'} />
                                <Text style={[styles.modeBtnText, addMode === 'bulk' && styles.modeBtnTextActive]}>All Employees</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modeBtn, addMode === 'self' && styles.modeBtnActive]}
                                onPress={() => setAddMode('self')}
                            >
                                <Icon name="user" size={12} color={addMode === 'self' ? '#fff' : '#6366F1'} />
                                <Text style={[styles.modeBtnText, addMode === 'self' && styles.modeBtnTextActive]}>My Pending</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalTitle}>
                            {addMode === 'bulk' ? "Add This Month's Salary" : 'Add My Pending Salary'}
                        </Text>
                        <Text style={styles.modalSubtitle}>
                            {addMode === 'bulk'
                                ? 'Generate salary records for all employees'
                                : 'Add your own pending salary record'}
                        </Text>

                        <Text style={styles.inputLabel}>Month</Text>
                        <View style={styles.pickerBox}>
                            <Picker selectedValue={addMonth} onValueChange={setAddMonth} style={styles.pickerInner}>
                                {MONTHS.map(m => <Picker.Item key={m} label={m} value={m} />)}
                            </Picker>
                        </View>

                        <Text style={styles.inputLabel}>Year</Text>
                        <View style={styles.pickerBox}>
                            <Picker selectedValue={addYear} onValueChange={setAddYear} style={styles.pickerInner}>
                                {[2024, 2025, 2026, 2027].map(y => <Picker.Item key={y} label={String(y)} value={y} />)}
                            </Picker>
                        </View>

                        {addMode === 'bulk' && (
                            <>
                                <Text style={styles.inputLabel}>Department (optional)</Text>
                                <View style={styles.pickerBox}>
                                    <Picker selectedValue={addDept} onValueChange={setAddDept} style={styles.pickerInner}>
                                        <Picker.Item label="All Departments" value="" />
                                        {departments.map((d, i) => (
                                            <Picker.Item key={i} label={typeof d === 'string' ? d : d.name} value={typeof d === 'string' ? d : d.name} />
                                        ))}
                                    </Picker>
                                </View>
                            </>
                        )}

                        {addMode === 'self' && (
                            <>
                                <Text style={styles.inputLabel}>Pending Salary Amount *</Text>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Enter pending amount (e.g. 30000)"
                                    placeholderTextColor="#9CA3AF"
                                    keyboardType="numeric"
                                    value={selfAmount}
                                    onChangeText={setSelfAmount}
                                />
                                <Text style={styles.inputLabel}>Remarks (Optional)</Text>
                                <TextInput
                                    style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
                                    placeholder="e.g. Pending from last month"
                                    placeholderTextColor="#9CA3AF"
                                    multiline
                                    value={selfRemarks}
                                    onChangeText={setSelfRemarks}
                                />
                            </>
                        )}

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddModal(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.submitBtn}
                                onPress={addMode === 'bulk' ? handleAddMonth : handleAddSelf}
                                disabled={addLoading}
                            >
                                {addLoading ? <ActivityIndicator color="#fff" size="small" /> :
                                    <Text style={styles.submitBtnText}>
                                        {addMode === 'bulk' ? 'Add Salaries' : 'Submit'}
                                    </Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );

    if (loading && records.length === 0) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={{ marginTop: 10, color: '#6B7280' }}>Loading salary tracker...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={currentData}
                keyExtractor={(item) => item.name}
                renderItem={renderFn}
                ListHeaderComponent={renderListHeader}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Icon name="wallet" size={48} color="#D1D5DB" />
                        <Text style={styles.emptyText}>
                            {tab === 'all' ? 'No salary records found' : 'No pending reviews'}
                        </Text>
                    </View>
                }
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366F1']} />}
                contentContainerStyle={{ paddingBottom: 20 }}
            />

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)} activeOpacity={0.8}>
                <Icon name="plus" size={18} color="#fff" />
            </TouchableOpacity>

            {renderAddModal()}
            {renderFilterModal()}
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
    // Summary
    summaryContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 8 },
    summaryCard: {
        flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12,
        elevation: 2, borderLeftWidth: 3,
    },
    summaryLabel: { fontSize: 10, color: '#6B7280' },
    summaryValue: { fontSize: 14, fontWeight: '700', marginTop: 4 },
    // Employee summary
    empSummarySection: {
        backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, padding: 14, elevation: 2,
    },
    empSummaryTitle: { fontSize: 14, fontWeight: '700', color: '#1F2937', marginBottom: 10 },
    empSummaryRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB',
    },
    empInfo: {},
    empName: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
    empDept: { fontSize: 11, color: '#6B7280' },
    empAmounts: { alignItems: 'flex-end' },
    empPending: { fontSize: 14, fontWeight: '700' },
    empTrackers: { fontSize: 10, color: '#6B7280' },
    moreText: { fontSize: 12, color: '#6366F1', textAlign: 'center', marginTop: 8 },
    // Tabs
    tabRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, backgroundColor: '#E5E7EB', borderRadius: 12, padding: 3 },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    tabActive: { backgroundColor: '#fff', elevation: 1 },
    tabText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
    tabTextActive: { color: '#6366F1', fontWeight: '700' },
    // Filter bar (buttons instead of Pickers to avoid AdapterView crash)
    filterBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, alignItems: 'center', gap: 8 },
    filterChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
        borderWidth: 1, borderColor: '#6366F1', backgroundColor: '#fff',
    },
    filterChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
    filterChipText: { fontSize: 12, fontWeight: '600', color: '#6366F1' },
    clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
    clearBtnText: { fontSize: 12, color: '#6B7280' },
    // Cards
    card: {
        backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 12,
        padding: 14, elevation: 2,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    cardEmpName: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
    cardMonth: { fontSize: 12, color: '#6B7280', marginTop: 2 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    badgeText: { fontSize: 11, fontWeight: '600' },
    cardAmounts: { flexDirection: 'row', justifyContent: 'space-between' },
    amountCol: { alignItems: 'center', flex: 1 },
    amountLabel: { fontSize: 10, color: '#9CA3AF' },
    amountValue: { fontSize: 13, fontWeight: '600', color: '#1F2937', marginTop: 2 },
    // Pending cards
    pendingCard: {
        backgroundColor: '#FFF7ED', marginHorizontal: 16, marginTop: 10, borderRadius: 12,
        padding: 14, elevation: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        borderLeftWidth: 3, borderLeftColor: '#F59E0B',
    },
    pendingInfo: { flex: 1 },
    pendingSalary: { fontSize: 12, color: '#6366F1', marginTop: 4, fontWeight: '600' },
    pendingActions: { flexDirection: 'row', gap: 8 },
    actionBtn: {
        width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center',
    },
    // Empty
    empty: { alignItems: 'center', marginTop: 60 },
    emptyText: { fontSize: 14, color: '#6B7280', marginTop: 12 },
    // Modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContainer: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
    modalSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 20 },
    inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 8 },
    pickerBox: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, overflow: 'hidden' },
    pickerInner: { height: 50 },
    textInput: {
        borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14,
        paddingVertical: 10, fontSize: 14, color: '#1F2937', backgroundColor: '#fff',
    },
    // Mode toggle in add modal
    modeToggle: {
        flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 3, marginBottom: 16,
    },
    modeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 10, borderRadius: 10, gap: 6,
    },
    modeBtnActive: { backgroundColor: '#6366F1' },
    modeBtnText: { fontSize: 12, fontWeight: '600', color: '#6366F1' },
    modeBtnTextActive: { color: '#fff' },
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
});

export default AdminSalaryTrackerScreen;
