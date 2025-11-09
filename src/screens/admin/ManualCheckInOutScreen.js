// src/screens/admin/ManualCheckInOutScreen.js
import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    Modal,
    Alert,
    ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { format as fmtDate, addDays, subDays } from 'date-fns';

import {
    Text,
    TextInput,
    Snackbar,
    HelperText,
    ActivityIndicator,
    Divider,
} from 'react-native-paper';

import ApiService from '../../services/api.service';

const fmt = (d) =>
    typeof d === 'string'
        ? d
        : d?.toISOString?.().slice(0, 19).replace('T', ' ') ?? '';

const hhmmss = (dt) => {
    try {
        const d = typeof dt === 'string' ? new Date(dt) : dt;
        return d ? fmtDate(d, 'HH:mm:ss') : '—';
    } catch {
        return '—';
    }
};

const ManualCheckInOutScreen = ({ navigation }) => {
    // ---- core state
    const [date, setDate] = useState(new Date());
    const [showDate, setShowDate] = useState(false);

    const ymd = useMemo(() => date.toISOString().slice(0, 10), [date]);
    const displayDate = useMemo(() => fmtDate(date, 'dd-MM-yyyy'), [date]);

    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [snack, setSnack] = useState({ visible: false, msg: '' });

    // stats + mode
    const [stats, setStats] = useState(null);
    const [mode, setMode] = useState('all');

    // selection for bulk ops
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState([]);
    const toggleSelect = (id) =>
        setSelected((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));

    // busy flags
    const [bulkBusy, setBulkBusy] = useState(false);

    // edit single times
    const [editDialog, setEditDialog] = useState({
        open: false,
        row: null,
        mode: null, // 'in' | 'out' | 'both'
        checkIn: null,
        checkOut: null,
        showPicker: null, // 'in' | 'out'
    });

    // bulk operations menu
    const [bulkMenu, setBulkMenu] = useState(false);
    const [bulkOpDialog, setBulkOpDialog] = useState({
        open: false,
        type: '', // 'checkin' | 'checkout' | 'both'
        checkIn: '',
        checkOut: '',
    });

    // ---- data fetchers
    const fetchStats = useCallback(async () => {
        const res = await ApiService.getAttendanceStatisticsForDate({ date: ymd });
        if (res.success) setStats(res.data?.message ?? res.data ?? null);
    }, [ymd]);

    const fetchList = useCallback(async () => {
        setLoading(true);
        const res =
            mode === 'pending'
                ? await ApiService.getPendingCheckouts({ date: ymd })
                : await ApiService.getAttendanceRecordsForDate({ date: ymd });

        if (res.success) {
            if (mode === 'pending') {
                const out =
                    res.data?.message?.pending_checkouts ??
                    res.data?.data?.pending_checkouts ??
                    res.data?.pending_checkouts ??
                    [];
                setList(out);
            } else {
                const out =
                    res.data?.message?.attendance_records ??
                    res.data?.data?.attendance_records ??
                    res.data?.attendance_records ??
                    [];
                setList(out);
            }
        } else {
            setSnack({ visible: true, msg: res.message || 'Failed to load' });
        }
        setLoading(false);
    }, [ymd, mode]);

    useFocusEffect(
        useCallback(() => {
            fetchList();
            fetchStats();
        }, [fetchList, fetchStats])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchList();
        await fetchStats();
        setRefreshing(false);
    }, [fetchList, fetchStats]);

    // ---- actions (single)
    const doManualCheckout = async (attendance_id, hour = 18) => {
        const res = await ApiService.manualCheckout({ attendance_id });
        setSnack({
            visible: true,
            msg: res.success ? `Checkout added (${hour === 18 ? '6 PM' : '7 PM'})` : res.message || 'Failed to checkout',
        });
        if (res.success) fetchList();
    };

    const doQuickCheckIn = async (attendance_id, hour = 10) => {
        const t = new Date(date);
        t.setHours(hour, 0, 0, 0);
        const res = await ApiService.updateAttendanceTimes({
            attendance_id,
            check_in_time: fmt(t),
        });
        setSnack({
            visible: true,
            msg: res.success ? `Check-in added (${hour} AM)` : res.message || 'Failed to add check-in',
        });
        if (res.success) fetchList();
    };

    const doQuickCheckOut = async (attendance_id, hour = 19) => {
        const t = new Date(date);
        t.setHours(hour, 0, 0, 0);
        const res = await ApiService.updateAttendanceTimes({
            attendance_id,
            check_out_time: fmt(t),
        });
        setSnack({
            visible: true,
            msg: res.success ? `Check-out added (${hour - 12} PM)` : res.message || 'Failed to add check-out',
        });
        if (res.success) fetchList();
    };

    const openEditTimes = (row, mode = 'both') => {
        const t = new Date(date);
        const defaultCheckIn = new Date(date);
        defaultCheckIn.setHours(10, 0, 0, 0);
        const defaultCheckOut = new Date(date);
        defaultCheckOut.setHours(19, 0, 0, 0);

        setEditDialog({
            open: true,
            row,
            mode, // 'in', 'out', or 'both'
            checkIn: row.in_time ? new Date(row.in_time) : defaultCheckIn,
            checkOut: row.out_time || row.custom_out_time_copy ? new Date(row.out_time || row.custom_out_time_copy) : defaultCheckOut,
            showPicker: null,
        });
    };

    const doUpdateTimes = async () => {
        const { row, checkIn, checkOut, mode } = editDialog;
        if (!row) return;
        
        const payload = {
            attendance_id: row.name,
        };
        
        // Only include the fields based on mode
        if (mode === 'in' || mode === 'both') {
            payload.check_in_time = checkIn ? fmt(checkIn) : undefined;
        }
        if (mode === 'out' || mode === 'both') {
            payload.check_out_time = checkOut ? fmt(checkOut) : undefined;
        }
        
        const res = await ApiService.updateAttendanceTimes(payload);
        setSnack({
            visible: true,
            msg: res.success ? 'Times updated' : res.message || 'Failed to update',
        });
        if (res.success) {
            setEditDialog({ open: false, row: null, mode: null, checkIn: null, checkOut: null, showPicker: null });
            fetchList();
        }
    };

    const doDeleteRecord = async (row) => {
        Alert.alert(
            'Delete/Cancel Attendance',
            `Are you sure you want to ${row.docstatus === 1 ? 'cancel' : 'delete'} record ${row.name}?`,
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes',
                    style: 'destructive',
                    onPress: async () => {
                        const res = await ApiService.deleteAttendanceRecord({ attendance_id: row.name, reason: 'Admin action' });
                        setSnack({
                            visible: true,
                            msg: res.success ? 'Record removed' : res.message || 'Failed to remove',
                        });
                        if (res.success) fetchList();
                    },
                },
            ]
        );
    };

    // ---- actions (bulk)
    const getTargetRecords = () => (selectMode ? selected : list.map((r) => r.name));

    const openBulkOperation = (type) => {
        const ids = getTargetRecords();
        if (!ids.length) {
            setSnack({ visible: true, msg: 'No records selected' });
            return;
        }
        
        // Set default times based on operation type
        const t = new Date(date);
        const defaultCheckIn = new Date(date);
        defaultCheckIn.setHours(9, 0, 0, 0);
        const defaultCheckOut = new Date(date);
        defaultCheckOut.setHours(18, 0, 0, 0);

        setBulkOpDialog({
            open: true,
            type,
            checkIn: type === 'checkin' || type === 'both' ? fmt(defaultCheckIn) : '',
            checkOut: type === 'checkout' || type === 'both' ? fmt(defaultCheckOut) : '',
        });
        setBulkMenu(false);
    };

    const doBulkOperation = async () => {
        setBulkBusy(true);
        const ids = getTargetRecords();
        
        if (!ids.length) {
            setSnack({ visible: true, msg: 'No records selected' });
            setBulkBusy(false);
            return;
        }

        const { type, checkIn, checkOut } = bulkOpDialog;

        try {
            if (type === 'checkout' && !checkIn) {
                // Quick checkout with default time
                const t = new Date(date);
                t.setHours(18, 0, 0, 0);
                const res = await ApiService.bulkManualCheckout({
                    attendance_ids: ids,
                    default_checkout_time: checkOut || fmt(t),
                });
                
                setSnack({
                    visible: true,
                    msg: res.success
                        ? `Bulk checkout: ${res.data?.successful ?? 0} OK, ${res.data?.failed ?? 0} failed`
                        : res.message || 'Bulk checkout failed',
                });
                
                if (res.success) {
                    setBulkOpDialog({ open: false, type: '', checkIn: '', checkOut: '' });
                    setSelected([]);
                    setSelectMode(false);
                    fetchList();
                }
            } else {
                // Use bulk update for check-in or both
                const payload = ids.map((id) => ({
                    attendance_id: id,
                    check_in_time: checkIn || undefined,
                    check_out_time: checkOut || undefined,
                }));
                
                const res = await ApiService.bulkUpdateAttendanceTimes({ attendance_updates: payload });
                
                setSnack({
                    visible: true,
                    msg: res.success
                        ? `Bulk update: ${res.data?.successful ?? 0} OK, ${res.data?.failed ?? 0} failed`
                        : res.message || 'Bulk update failed',
                });
                
                if (res.success) {
                    setBulkOpDialog({ open: false, type: '', checkIn: '', checkOut: '' });
                    setSelected([]);
                    setSelectMode(false);
                    fetchList();
                }
            }
        } catch (error) {
            setSnack({ visible: true, msg: 'Operation failed: ' + error.message });
        }

        setBulkBusy(false);
    };

    const toggleSelectAll = () => {
        if (selected.length === list.length) {
            setSelected([]);
        } else {
            setSelected(list.map((r) => r.name));
        }
    };

    // ---- UI helpers
    const getStatusColor = (item) => {
        if (item.status === 'On Leave') return '#F59E0B';
        if (!item.in_time) return '#EF4444';
        if (!item.out_time && !item.custom_out_time_copy) return '#F59E0B';
        return '#10B981';
    };
    const getStatusText = (item) => {
        if (item.status === 'On Leave') return 'On Leave';
        if (!item.in_time) return 'No Check-In';
        if (!item.out_time && !item.custom_out_time_copy) return 'Missing Check-Out';
        return 'Complete';
    };
    const navigateDate = (dir) => {
        setDate((d) => (dir === 'prev' ? subDays(d, 1) : addDays(d, 1)));
    };

    // ---- row render
    const renderItem = ({ item }) => {
        const checked = selected.includes(item.name);
        const isOnLeave = item.status === 'On Leave';
        
        return (
            <View style={styles.attendanceItem}>
                {selectMode ? (
                    <TouchableOpacity
                        style={[styles.checkbox, checked && styles.checkboxSelected]}
                        onPress={() => toggleSelect(item.name)}
                        activeOpacity={0.8}
                    >
                        {checked ? <Icon name="check" size={12} color="white" /> : null}
                    </TouchableOpacity>
                ) : null}

                <View style={styles.employeeInfo}>
                    <Text style={styles.employeeName}>{item.employee_name}</Text>
                    <Text style={styles.employeeId}>ID: {item.employee}</Text>

                    {isOnLeave ? (
                        <View style={styles.leaveContainer}>
                            <Icon name="plane-departure" size={12} color="#F59E0B" />
                            <Text style={styles.leaveText}>Employee is on leave today</Text>
                        </View>
                    ) : (
                        <View style={styles.timeContainer}>
                            {item.in_time ? (
                                <View style={styles.timeInfo}>
                                    <Icon name="sign-in-alt" size={12} color="#10B981" />
                                    <Text style={styles.timeText}>In: {hhmmss(item.in_time)}</Text>
                                </View>
                            ) : (
                                <View style={styles.timeInfo}>
                                    <Icon name="exclamation-circle" size={12} color="#EF4444" />
                                    <Text style={[styles.timeText, { color: '#EF4444' }]}>No check-in</Text>
                                </View>
                            )}

                            {(item.out_time || item.custom_out_time_copy) ? (
                                <View style={styles.timeInfo}>
                                    <Icon name="sign-out-alt" size={12} color="#EF4444" />
                                    <Text style={styles.timeText}>
                                        Out: {hhmmss(item.out_time || item.custom_out_time_copy)}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.timeInfo}>
                                    <Icon name="exclamation-circle" size={12} color="#F59E0B" />
                                    <Text style={[styles.timeText, { color: '#F59E0B' }]}>No check-out</Text>
                                </View>
                            )}
                        </View>
                    )}

                    <View style={styles.statusContainer}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item) }]}>
                            <Text style={styles.statusText}>{getStatusText(item)}</Text>
                        </View>

                        <View
                            style={[
                                styles.statusBadge,
                                { backgroundColor: item.docstatus === 1 ? '#10B981' : '#F59E0B' },
                            ]}
                        >
                            <Text style={styles.statusText}>{item.docstatus === 1 ? 'Submitted' : 'Draft'}</Text>
                        </View>
                    </View>
                </View>

                {!selectMode && !isOnLeave && (
                    <View style={styles.actionButtons}>
                        {/* Edit Check-In */}
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                            onPress={() => openEditTimes(item, 'in')}
                        >
                            <Icon name="sign-in-alt" size={10} color="white" />
                            <Text style={styles.buttonText}>Edit In</Text>
                        </TouchableOpacity>

                        {/* Edit Check-Out */}
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#8B5CF6' }]}
                            onPress={() => openEditTimes(item, 'out')}
                        >
                            <Icon name="sign-out-alt" size={10} color="white" />
                            <Text style={styles.buttonText}>Edit Out</Text>
                        </TouchableOpacity>

                        {/* Edit Both */}
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}
                            onPress={() => openEditTimes(item, 'both')}
                        >
                            <Icon name="edit" size={10} color="white" />
                            <Text style={styles.buttonText}>Both</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Date Navigation */}
            <View style={styles.dateNavigation}>
                <TouchableOpacity style={styles.dateNavButton} onPress={() => navigateDate('prev')} activeOpacity={0.8}>
                    <Icon name="chevron-left" size={16} color="#6366F1" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.dateInfo} onPress={() => setShowDate(true)} activeOpacity={0.8}>
                    <Text style={styles.dateLabel}>{displayDate}</Text>
                    <Text style={styles.recordCount}>{list.length} records</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.dateNavButton} onPress={() => navigateDate('next')} activeOpacity={0.8}>
                    <Icon name="chevron-right" size={16} color="#6366F1" />
                </TouchableOpacity>
            </View>

            {/* Mode Switch & Actions */}
            <View style={styles.controlBar}>
                <View style={styles.modeSwitch}>
                    <TouchableOpacity 
                        onPress={() => setMode('pending')} 
                        style={[styles.modeBtn, mode === 'pending' && styles.modeBtnActive]}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.modeText, mode === 'pending' && styles.modeTextActive]}>Pending</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setMode('all')} 
                        style={[styles.modeBtn, mode === 'all' && styles.modeBtnActive]}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.modeText, mode === 'all' && styles.modeTextActive]}>All</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.actionBar}>
                    {selectMode && (
                        <TouchableOpacity
                            style={styles.selectAllBtn}
                            onPress={toggleSelectAll}
                            activeOpacity={0.8}
                        >
                            <Icon 
                                name={selected.length === list.length ? "check-square" : "square"} 
                                size={16} 
                                color="#6366F1" 
                            />
                            <Text style={styles.selectAllText}>
                                {selected.length === list.length ? 'Deselect All' : 'Select All'}
                            </Text>
                        </TouchableOpacity>
                    )}
                    
                    <TouchableOpacity
                        style={[styles.bulkBtn, selectMode && styles.bulkBtnActive]}
                        onPress={() => {
                            if (selectMode && selected.length === 0) {
                                setSelectMode(false);
                            } else {
                                setSelectMode(!selectMode);
                                if (!selectMode) setSelected([]);
                            }
                        }}
                        activeOpacity={0.8}
                    >
                        <Icon name={selectMode ? "times" : "tasks"} size={14} color="white" />
                        <Text style={styles.bulkBtnText}>
                            {selectMode 
                                ? (selected.length > 0 ? `${selected.length} Selected` : 'Cancel')
                                : 'Bulk'}
                        </Text>
                    </TouchableOpacity>

                    {selectMode && (
                        <TouchableOpacity
                            style={[styles.bulkActionBtn, (!list.length || bulkBusy) && styles.buttonDisabled]}
                            onPress={() => setBulkMenu(true)}
                            disabled={!list.length || bulkBusy}
                            activeOpacity={0.8}
                        >
                            <Icon name="bolt" size={14} color="white" />
                            <Text style={styles.bulkActionText}>Actions</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Quick Stats row */}
            {stats ? (
                <View style={styles.quickStats}>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{stats.attendance_statistics?.total_records ?? 0}</Text>
                        <Text style={styles.statLabel}>Total</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statNumber, { color: '#F59E0B' }]}>
                            {stats.attendance_statistics?.missing_checkout ?? 0}
                        </Text>
                        <Text style={styles.statLabel}>No Out</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statNumber, { color: '#EF4444' }]}>
                            {stats.attendance_statistics?.missing_checkin ?? 0}
                        </Text>
                        <Text style={styles.statLabel}>No In</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statNumber, { color: '#10B981' }]}>
                            {stats.attendance_rate ?? 0}%
                        </Text>
                        <Text style={styles.statLabel}>Rate</Text>
                    </View>
                </View>
            ) : null}

            {/* Content */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#6366F1" size="large" />
                    <Text style={styles.loadingText}>Loading attendance records...</Text>
                </View>
            ) : list.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Icon name="calendar-times" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyTitle}>No Records Found</Text>
                    <Text style={styles.emptyText}>
                        {mode === 'pending' ? 'No pending checkouts' : 'No attendance records'} for {ymd}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={list}
                    keyExtractor={(item) => item.name}
                    renderItem={renderItem}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={{ paddingBottom: 20, paddingTop: 8 }}
                />
            )}

            {/* Date picker */}
            {showDate && (
                <DateTimePicker
                    value={date}
                    mode="date"
                    onChange={(_, d) => {
                        setShowDate(false);
                        if (d) setDate(d);
                    }}
                />
            )}

            {/* Bulk Operations Menu */}
            <Modal visible={bulkMenu} transparent animationType="fade">
                <TouchableOpacity 
                    style={styles.menuOverlay} 
                    activeOpacity={1} 
                    onPress={() => setBulkMenu(false)}
                >
                    <View style={styles.menuContent}>
                        <Text style={styles.menuTitle}>Bulk Operations</Text>
                        <Text style={styles.menuSubtitle}>
                            {selectMode && selected.length > 0 
                                ? `${selected.length} records selected` 
                                : `All ${list.length} records`}
                        </Text>
                        
                        <Divider style={{ marginVertical: 12 }} />

                        <TouchableOpacity 
                            style={styles.menuItem}
                            onPress={() => openBulkOperation('checkin')}
                            activeOpacity={0.7}
                        >
                            <Icon name="sign-in-alt" size={18} color="#10B981" />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.menuItemTitle}>Bulk Check-In</Text>
                                <Text style={styles.menuItemDesc}>Set check-in time (default 9:00 AM)</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={styles.menuItem}
                            onPress={() => openBulkOperation('checkout')}
                            activeOpacity={0.7}
                        >
                            <Icon name="sign-out-alt" size={18} color="#EF4444" />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.menuItemTitle}>Bulk Check-Out</Text>
                                <Text style={styles.menuItemDesc}>Set check-out time (default 6:00 PM)</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={styles.menuItem}
                            onPress={() => openBulkOperation('both')}
                            activeOpacity={0.7}
                        >
                            <Icon name="edit" size={18} color="#6366F1" />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.menuItemTitle}>Bulk Update Both</Text>
                                <Text style={styles.menuItemDesc}>Set both check-in and check-out times</Text>
                            </View>
                        </TouchableOpacity>

                        <Divider style={{ marginVertical: 12 }} />

                        <TouchableOpacity 
                            style={[styles.menuItem, { justifyContent: 'center' }]}
                            onPress={() => setBulkMenu(false)}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.menuItemTitle, { color: '#6B7280' }]}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Bulk Operation Dialog */}
            <Modal visible={bulkOpDialog.open} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {bulkOpDialog.type === 'checkin' && 'Bulk Check-In'}
                            {bulkOpDialog.type === 'checkout' && 'Bulk Check-Out'}
                            {bulkOpDialog.type === 'both' && 'Bulk Update Times'}
                        </Text>
                        <Text style={styles.modalSubtitle}>
                            {selectMode && selected.length > 0 
                                ? `${selected.length} records selected` 
                                : `All ${list.length} records`}
                        </Text>

                        <HelperText type="info" visible>
                            Date: {ymd}. Enter custom times or use defaults.
                        </HelperText>

                        <ScrollView style={{ maxHeight: 350 }}>
                            {(bulkOpDialog.type === 'checkin' || bulkOpDialog.type === 'both') && (
                                <View style={styles.timeInputContainer}>
                                    <Text style={styles.inputLabel}>
                                        Check-In Time (YYYY-MM-DD HH:mm:ss)
                                    </Text>
                                    <TextInput
                                        mode="outlined"
                                        value={bulkOpDialog.checkIn}
                                        placeholder="2024-01-01 09:00:00"
                                        onChangeText={(t) => setBulkOpDialog((s) => ({ ...s, checkIn: t }))}
                                        style={{ backgroundColor: 'white' }}
                                    />
                                    <HelperText type="info">
                                        Default: 9:00 AM on {ymd}
                                    </HelperText>
                                </View>
                            )}

                            {(bulkOpDialog.type === 'checkout' || bulkOpDialog.type === 'both') && (
                                <View style={styles.timeInputContainer}>
                                    <Text style={styles.inputLabel}>
                                        Check-Out Time (YYYY-MM-DD HH:mm:ss)
                                    </Text>
                                    <TextInput
                                        mode="outlined"
                                        value={bulkOpDialog.checkOut}
                                        placeholder="2024-01-01 18:00:00"
                                        onChangeText={(t) => setBulkOpDialog((s) => ({ ...s, checkOut: t }))}
                                        style={{ backgroundColor: 'white' }}
                                    />
                                    <HelperText type="info">
                                        Default: 6:00 PM on {ymd}
                                    </HelperText>
                                </View>
                            )}
                        </ScrollView>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setBulkOpDialog({ open: false, type: '', checkIn: '', checkOut: '' })}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.modalButton, styles.confirmButton]} 
                                onPress={doBulkOperation}
                                disabled={bulkBusy}
                                activeOpacity={0.8}
                            >
                                {bulkBusy ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <Text style={styles.confirmButtonText}>Apply</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Edit Single Record Modal */}
            <Modal visible={editDialog.open} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {editDialog.mode === 'in' && 'Edit Check-In Time'}
                            {editDialog.mode === 'out' && 'Edit Check-Out Time'}
                            {editDialog.mode === 'both' && 'Edit Times'}
                        </Text>
                        <Text style={styles.modalSubtitle}>
                            {editDialog.row?.employee_name} • {editDialog.row?.name}
                        </Text>

                        <HelperText type="info" visible>
                            Date: {ymd} • {editDialog.mode === 'in' ? 'Default: 10:00 AM' : editDialog.mode === 'out' ? 'Default: 7:00 PM' : 'Defaults: 10 AM / 7 PM'}
                        </HelperText>

                        {(editDialog.mode === 'in' || editDialog.mode === 'both') && (
                            <View style={styles.timeInputContainer}>
                                <Text style={styles.inputLabel}>Check-In (YYYY-MM-DD HH:mm:ss)</Text>
                                <TextInput
                                    mode="outlined"
                                    value={editDialog.checkIn ? fmt(editDialog.checkIn) : ''}
                                    placeholder="YYYY-MM-DD HH:mm:ss"
                                    right={
                                        <TextInput.Icon 
                                            icon="clock" 
                                            onPress={() => setEditDialog((s) => ({ ...s, showPicker: 'in' }))} 
                                        />
                                    }
                                    onChangeText={(t) =>
                                        setEditDialog((s) => ({ 
                                            ...s, 
                                            checkIn: t ? new Date(t.replace(' ', 'T')) : null 
                                        }))
                                    }
                                    style={{ backgroundColor: 'white' }}
                                />
                            </View>
                        )}

                        {(editDialog.mode === 'out' || editDialog.mode === 'both') && (
                            <View style={styles.timeInputContainer}>
                                <Text style={styles.inputLabel}>Check-Out (YYYY-MM-DD HH:mm:ss)</Text>
                                <TextInput
                                    mode="outlined"
                                    value={editDialog.checkOut ? fmt(editDialog.checkOut) : ''}
                                    placeholder="YYYY-MM-DD HH:mm:ss"
                                    right={
                                        <TextInput.Icon 
                                            icon="clock-end" 
                                            onPress={() => setEditDialog((s) => ({ ...s, showPicker: 'out' }))} 
                                        />
                                    }
                                    onChangeText={(t) =>
                                        setEditDialog((s) => ({ 
                                            ...s, 
                                            checkOut: t ? new Date(t.replace(' ', 'T')) : null 
                                        }))
                                    }
                                    style={{ backgroundColor: 'white' }}
                                />
                            </View>
                        )}

                        {editDialog.showPicker && (
                            <View style={{ marginTop: 8 }}>
                                <DateTimePicker
                                    value={
                                        editDialog[editDialog.showPicker === 'in' ? 'checkIn' : 'checkOut'] || new Date()
                                    }
                                    mode="datetime"
                                    is24Hour
                                    onChange={(_, d) => {
                                        if (!d) {
                                            setEditDialog((s) => ({ ...s, showPicker: null }));
                                            return;
                                        }
                                        setEditDialog((s) =>
                                            s.showPicker === 'in'
                                                ? { ...s, checkIn: d, showPicker: null }
                                                : { ...s, checkOut: d, showPicker: null }
                                        );
                                    }}
                                />
                            </View>
                        )}

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() =>
                                    setEditDialog({ open: false, row: null, mode: null, checkIn: null, checkOut: null, showPicker: null })
                                }
                                activeOpacity={0.8}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.modalButton, styles.confirmButton]} 
                                onPress={doUpdateTimes}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.confirmButtonText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Snackbar
                visible={snack.visible}
                onDismiss={() => setSnack({ visible: false, msg: '' })}
                duration={2500}
            >
                {snack.msg}
            </Snackbar>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },

    dateNavigation: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    dateNavButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    dateInfo: { alignItems: 'center' },
    dateLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
    recordCount: { fontSize: 11, color: '#6B7280', marginTop: 2, fontWeight: '500' },

    controlBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    modeSwitch: {
        flexDirection: 'row',
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
        padding: 2,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    modeBtn: {
        paddingHorizontal: 14,
        paddingVertical: 5,
        borderRadius: 6,
    },
    modeBtnActive: {
        backgroundColor: '#6366F1',
    },
    modeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6B7280',
    },
    modeTextActive: {
        color: 'white',
    },
    actionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    selectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 5,
        backgroundColor: '#F8FAFC',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    selectAllText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#6366F1',
    },
    bulkBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#6366F1',
        borderRadius: 8,
    },
    bulkBtnActive: {
        backgroundColor: '#8B5CF6',
    },
    bulkBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: 'white',
    },
    bulkActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#10B981',
        borderRadius: 8,
    },
    bulkActionText: {
        fontSize: 11,
        fontWeight: '700',
        color: 'white',
    },
    buttonDisabled: {
        backgroundColor: '#9CA3AF',
    },

    quickStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 16, fontWeight: '700', color: '#374151' },
    statLabel: { fontSize: 9, color: '#6B7280', marginTop: 1, fontWeight: '500' },

    attendanceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        marginHorizontal: 12,
        marginVertical: 5,
        padding: 12,
        borderRadius: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#6366F1',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    checkboxSelected: { backgroundColor: '#6366F1' },
    employeeInfo: { flex: 1 },
    employeeName: { fontSize: 14, fontWeight: '600', color: '#111827' },
    employeeId: { fontSize: 11, color: '#6B7280', marginTop: 1 },

    timeContainer: { marginTop: 6, gap: 3 },
    timeInfo: { flexDirection: 'row', alignItems: 'center' },
    timeText: { fontSize: 11, color: '#374151', marginLeft: 6, fontWeight: '500' },

    leaveContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: '#FEF3C7',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#FCD34D',
    },
    leaveText: {
        fontSize: 11,
        color: '#D97706',
        marginLeft: 6,
        fontWeight: '600',
    },

    statusContainer: { flexDirection: 'row', marginTop: 6, gap: 4 },
    statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
    statusText: { fontSize: 9, color: 'white', fontWeight: '600' },

    actionButtons: { flexDirection: 'column', gap: 4, marginLeft: 6 },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 7,
        paddingVertical: 5,
        borderRadius: 6,
        minWidth: 62,
    },
    buttonText: { color: 'white', fontSize: 9, fontWeight: '600', marginLeft: 3 },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 30,
    },
    loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },

    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 30,
    },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: '#6B7280', marginTop: 12 },
    emptyText: {
        fontSize: 13,
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 6,
        paddingHorizontal: 32,
    },

    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    menuContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
    },
    menuTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        textAlign: 'center',
    },
    menuSubtitle: {
        fontSize: 13,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 3,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    menuItemTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111827',
    },
    menuItemDesc: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 14,
        padding: 20,
        margin: 16,
        width: '90%',
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        textAlign: 'center',
    },
    modalSubtitle: {
        fontSize: 13,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 3,
        marginBottom: 6,
    },
    timeInputContainer: { marginTop: 10 },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 6,
    },

    modalButtons: { flexDirection: 'row', gap: 10, marginTop: 16 },
    modalButton: {
        flex: 1,
        paddingVertical: 11,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: { backgroundColor: '#F3F4F6' },
    cancelButtonText: { color: '#6B7280', fontWeight: '600', fontSize: 14 },
    confirmButton: { backgroundColor: '#6366F1' },
    confirmButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
});

export default ManualCheckInOutScreen;