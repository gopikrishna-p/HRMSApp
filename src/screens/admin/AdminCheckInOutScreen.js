// src/screens/admin/AdminCheckInOutScreen.js
//
// The admin's own check-in / check-out, plus kiosk mode: check in or out any employee from this
// device. Shows the person's attendance for today so only the right action is offered
// (Check In -> Check Out -> done). Office mode needs the device inside the office geofence;
// the server checks the geofence and WFH / On Site eligibility again.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Switch,
    Alert,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import AttendanceService from '../../services/attendance.service';
import { ensureLocationPermission, getCurrentPosition } from '../../utils/location';
import { colors } from '../../theme/colors';
import { getAvatarColor, getInitials } from '../../theme/adminStyles';
import { formatTimeOfDay } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import { STATUS_COLORS } from '../../components/admin/AttendanceList';

// Haversine distance in metres
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const WORK_MODES = [
    { key: 'Office', label: 'Office', icon: 'building', color: colors.primary },
    { key: 'WFH', label: 'WFH', icon: 'home', color: STATUS_COLORS.wfh },
    { key: 'Onsite', label: 'On Site', icon: 'map-marker-alt', color: STATUS_COLORS.onsite },
];

const NO_STATUS = { hasCheckedIn: false, hasCheckedOut: false, checkInTime: null, checkOutTime: null, status: null, workType: null };

const errorMessage = (res) => {
    const msg = res?.data?.message;
    if (msg && typeof msg === 'object' && msg.message) {
        return msg.message;
    }
    return res?.message || 'Something went wrong';
};

const AdminCheckInOutScreen = () => {
    const { user, employee } = useAuth();
    const adminId = employee?.name;
    const adminName = employee?.employee_name || user?.full_name || 'Admin';

    const [kioskMode, setKioskMode] = useState(false);
    const [employeeList, setEmployeeList] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);

    const [workMode, setWorkMode] = useState('Office');
    const [adminWfhEligible, setAdminWfhEligible] = useState(false);
    const [adminOnsiteEligible, setAdminOnsiteEligible] = useState(false);

    const [officeLocation, setOfficeLocation] = useState(null);
    const [officeError, setOfficeError] = useState(null);
    const [locationStatus, setLocationStatus] = useState('checking'); // checking | inside | outside | error
    const [distance, setDistance] = useState(null);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [locationError, setLocationError] = useState(null);

    const [today, setToday] = useState(NO_STATUS);
    const [statusLoading, setStatusLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // the person being checked in / out
    const targetId = kioskMode ? selectedEmployee?.name : adminId;
    const targetName = kioskMode ? selectedEmployee?.employee_name : adminName;

    // ------------------------------------------------------------------ data
    const loadEligibility = useCallback(async () => {
        const res = await AttendanceService.getUserWFHInfo();
        const info = res.success ? res.data?.message : null;
        if (info) {
            setAdminWfhEligible(Boolean(info.wfh_eligible));
            setAdminOnsiteEligible(Boolean(info.on_site_eligible));
        }
    }, []);

    const loadOfficeLocation = useCallback(async (empId) => {
        if (!empId) {
            return;
        }
        setOfficeError(null);
        const res = await AttendanceService.getOfficeLocation(empId);
        if (res.success && res.data?.message?.latitude != null) {
            setOfficeLocation(res.data.message);
        } else {
            setOfficeLocation(null);
            setOfficeError(errorMessage(res).replace('Error getting office location: ', ''));
        }
    }, []);

    const loadToday = useCallback(async (empId) => {
        if (!empId) {
            setToday(NO_STATUS);
            return;
        }
        setStatusLoading(true);
        try {
            setToday(await AttendanceService.getTodayAttendanceStatus(empId));
        } finally {
            setStatusLoading(false);
        }
    }, []);

    const checkGeofence = useCallback(async () => {
        if (!officeLocation) {
            return;
        }
        setLocationStatus('checking');
        setLocationError(null);
        try {
            await ensureLocationPermission();
            const pos = await getCurrentPosition();
            const { latitude, longitude } = pos.coords;
            setCurrentLocation({ latitude, longitude });
            const d = Math.round(calculateDistance(latitude, longitude, officeLocation.latitude, officeLocation.longitude));
            setDistance(d);
            setLocationStatus(d <= officeLocation.radius ? 'inside' : 'outside');
        } catch (err) {
            setLocationError(err?.message || 'Location unavailable');
            setLocationStatus('error');
        }
    }, [officeLocation]);

    useEffect(() => {
        if (adminId) {
            loadEligibility();
        }
    }, [adminId, loadEligibility]);

    // office location and today's status follow the person being checked in
    useEffect(() => {
        loadOfficeLocation(targetId || adminId);
        loadToday(targetId);
    }, [targetId, adminId, loadOfficeLocation, loadToday]);

    useEffect(() => {
        if (workMode === 'Office' && officeLocation) {
            checkGeofence();
        }
    }, [workMode, officeLocation, checkGeofence]);

    useEffect(() => {
        if (kioskMode && employeeList.length === 0) {
            AttendanceService.getEmployeeWFHList().then((res) => {
                if (res.success && Array.isArray(res.data?.message)) {
                    setEmployeeList(res.data.message);
                } else {
                    showToast({ type: 'error', text1: 'Could not load employees', text2: errorMessage(res) });
                }
            });
        }
    }, [kioskMode, employeeList.length]);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([loadToday(targetId), workMode === 'Office' ? checkGeofence() : Promise.resolve()]);
        setRefreshing(false);
    };

    // ------------------------------------------------------------------ derived
    const filteredEmployees = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const list = q
            ? employeeList.filter((e) => e.employee_name?.toLowerCase().includes(q) || e.name?.toLowerCase().includes(q))
            : employeeList;
        return list.slice(0, 8);
    }, [employeeList, searchQuery]);

    // eligibility: own flags for the admin; for kiosk the server decides per employee
    const wfhAllowed = kioskMode ? Boolean(selectedEmployee?.custom_wfh_eligible) : adminWfhEligible;
    const onsiteAllowed = kioskMode ? true : adminOnsiteEligible;
    const modeAllowed = (key) => (key === 'WFH' ? wfhAllowed : key === 'Onsite' ? onsiteAllowed : true);

    useEffect(() => {
        if (!modeAllowed(workMode)) {
            setWorkMode('Office');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wfhAllowed, onsiteAllowed]);

    const nextAction = !today.hasCheckedIn ? 'Check-In' : !today.hasCheckedOut ? 'Check-Out' : null;
    const blockedReason = (() => {
        if (kioskMode && !selectedEmployee) {
            return 'Select an employee first.';
        }
        if (!nextAction) {
            return null;
        }
        if (workMode === 'Office') {
            if (officeError) {
                return officeError;
            }
            if (locationStatus === 'checking') {
                return 'Checking location...';
            }
            if (locationStatus === 'error') {
                return 'Location unavailable. Tap refresh on the location card.';
            }
            if (locationStatus === 'outside') {
                return `${distance} m from the office. Move within ${officeLocation?.radius} m or choose WFH / On Site.`;
            }
        }
        return null;
    })();

    // ------------------------------------------------------------------ action
    const performAction = async () => {
        setBusy(true);
        try {
            let latitude;
            let longitude;
            if (workMode !== 'WFH') {
                if (workMode === 'Office' && currentLocation) {
                    ({ latitude, longitude } = currentLocation);
                } else {
                    await ensureLocationPermission();
                    const pos = await getCurrentPosition();
                    ({ latitude, longitude } = pos.coords);
                }
            }
            const res = await AttendanceService.geoAttendance({
                employee: targetId,
                action: nextAction,
                latitude,
                longitude,
                work_type: workMode,
            });
            const result = res.data?.message;
            if (res.success && result && String(result.status).toLowerCase() !== 'error') {
                const time = formatTimeOfDay(result.timestamp || result.checkout_time || new Date());
                showToast({
                    type: 'success',
                    text1: `${nextAction === 'Check-In' ? 'Checked in' : 'Checked out'}: ${targetName}`,
                    text2: time ? `at ${time}` : undefined,
                });
                if (kioskMode) {
                    setSelectedEmployee(null);
                    setSearchQuery('');
                }
                loadToday(kioskMode ? null : targetId);
            } else {
                Alert.alert(`${nextAction} failed`, errorMessage(res));
            }
        } catch (e) {
            Alert.alert('Error', e?.message || 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    const onActionPress = () => {
        if (!nextAction || blockedReason) {
            return;
        }
        if (kioskMode) {
            const mode = WORK_MODES.find((m) => m.key === workMode)?.label;
            Alert.alert('Confirm', `${nextAction} for ${targetName} (${targetId})\nWork mode: ${mode}`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Confirm', onPress: performAction },
            ]);
        } else {
            performAction();
        }
    };

    // ------------------------------------------------------------------ render pieces
    const renderToday = () => {
        if (!targetId) {
            return null;
        }
        const checkIn = formatTimeOfDay(today.checkInTime);
        const checkOut = formatTimeOfDay(today.checkOutTime);
        const state = !today.hasCheckedIn
            ? { label: 'Not checked in', color: colors.textSecondary, icon: 'hourglass-start' }
            : !today.hasCheckedOut
                ? { label: 'Checked in', color: STATUS_COLORS.late, icon: 'user-clock' }
                : { label: 'Completed', color: STATUS_COLORS.present, icon: 'check-circle' };
        return (
            <View style={styles.todayRow}>
                {statusLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                    <>
                        <View style={[styles.badge, { backgroundColor: state.color }]}>
                            <Icon name={state.icon} size={9} color={colors.white} />
                            <Text style={styles.badgeText}>{state.label}</Text>
                        </View>
                        {checkIn ? (
                            <View style={styles.timeInfo}>
                                <Icon name="sign-in-alt" size={11} color={STATUS_COLORS.present} />
                                <Text style={styles.timeText}>{checkIn}</Text>
                            </View>
                        ) : null}
                        {checkOut ? (
                            <View style={styles.timeInfo}>
                                <Icon name="sign-out-alt" size={11} color={STATUS_COLORS.absent} />
                                <Text style={styles.timeText}>{checkOut}</Text>
                            </View>
                        ) : null}
                    </>
                )}
            </View>
        );
    };

    const renderPerson = (id, name, subtitle) => (
        <View style={styles.personRow}>
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(name) }]}>
                <Text style={styles.avatarText}>{getInitials(name)}</Text>
            </View>
            <View style={styles.flex}>
                <Text style={styles.personName}>{name}</Text>
                <Text style={styles.personId}>{subtitle || id}</Text>
            </View>
        </View>
    );

    const renderLocation = () => {
        if (workMode !== 'Office') {
            const mode = WORK_MODES.find((m) => m.key === workMode);
            return (
                <View style={styles.infoCard}>
                    <Icon name={mode.icon} size={14} color={mode.color} />
                    <Text style={styles.infoText}>
                        {workMode === 'WFH' ? 'Work From Home: no location check.' : 'On Site: your current location is recorded.'}
                    </Text>
                </View>
            );
        }
        const s = officeError
            ? { color: STATUS_COLORS.absent, icon: 'exclamation-triangle', text: 'No office location' }
            : {
                checking: { color: STATUS_COLORS.late, icon: 'location-arrow', text: 'Checking location...' },
                inside: { color: STATUS_COLORS.present, icon: 'check-circle', text: 'Inside office area' },
                outside: { color: STATUS_COLORS.absent, icon: 'times-circle', text: 'Outside office area' },
                error: { color: STATUS_COLORS.absent, icon: 'exclamation-triangle', text: 'Location unavailable' },
            }[locationStatus];
        const progress = officeLocation && distance != null ? Math.min(distance / (officeLocation.radius * 2), 1) : 0;
        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={styles.cardTitleRow}>
                        <Icon name="map-marked-alt" size={14} color={colors.primary} />
                        <Text style={styles.cardTitle}>Location</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={checkGeofence}
                        disabled={!officeLocation || locationStatus === 'checking'}
                        activeOpacity={0.8}
                    >
                        {locationStatus === 'checking' && officeLocation ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <Icon name="sync-alt" size={13} color={colors.primary} />
                        )}
                    </TouchableOpacity>
                </View>
                <View style={[styles.locationStatus, { backgroundColor: `${s.color}14`, borderColor: `${s.color}40` }]}>
                    <Icon name={s.icon} size={18} color={s.color} />
                    <View style={styles.flex}>
                        <Text style={[styles.locationTitle, { color: s.color }]}>{s.text}</Text>
                        <Text style={styles.locationSub}>
                            {officeError
                                || locationError
                                || (distance != null && officeLocation
                                    ? `${distance} m from ${officeLocation.location_name || 'office'} · allowed ${officeLocation.radius} m`
                                    : 'Getting your position')}
                        </Text>
                    </View>
                </View>
                {distance != null && officeLocation && !officeError ? (
                    <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: s.color }]} />
                    </View>
                ) : null}
            </View>
        );
    };

    const actionStyle = nextAction === 'Check-In' ? styles.actionCheckIn : nextAction === 'Check-Out' ? styles.actionCheckOut : styles.actionDone;
    const actionDisabled = busy || !nextAction || Boolean(blockedReason) || statusLoading;

    // ------------------------------------------------------------------ main
    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            >
                {/* Who */}
                <View style={styles.card}>
                    {kioskMode && selectedEmployee
                        ? renderPerson(selectedEmployee.name, selectedEmployee.employee_name, `${selectedEmployee.name}${selectedEmployee.department ? ` · ${selectedEmployee.department.replace(' - DG', '')}` : ''}`)
                        : kioskMode
                            ? renderPerson('', 'Kiosk mode', 'Choose an employee below')
                            : renderPerson(adminId, adminName, adminId)}
                    {renderToday()}
                    <View style={styles.divider} />
                    <View style={styles.kioskRow}>
                        <View style={styles.flex}>
                            <Text style={styles.kioskTitle}>Kiosk mode</Text>
                            <Text style={styles.kioskSub}>Check in or out another employee on this device</Text>
                        </View>
                        <Switch
                            value={kioskMode}
                            onValueChange={(val) => {
                                setKioskMode(val);
                                setSelectedEmployee(null);
                                setSearchQuery('');
                            }}
                            trackColor={{ true: colors.primaryLight, false: colors.border }}
                            thumbColor={kioskMode ? colors.primary : '#F4F4F5'}
                        />
                    </View>
                </View>

                {/* Kiosk: pick the employee */}
                {kioskMode ? (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View style={styles.cardTitleRow}>
                                <Icon name="users" size={14} color={colors.primary} />
                                <Text style={styles.cardTitle}>Employee</Text>
                            </View>
                            {selectedEmployee ? (
                                <TouchableOpacity
                                    style={styles.linkButton}
                                    onPress={() => {
                                        setSelectedEmployee(null);
                                        setSearchQuery('');
                                    }}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.linkButtonText}>Change</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                        {selectedEmployee ? (
                            <Text style={styles.kioskSub}>Selected. Choose the work mode and tap the button below.</Text>
                        ) : (
                            <>
                                <View style={styles.searchContainer}>
                                    <Icon name="search" size={13} color={colors.textMuted} />
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder="Search by name or ID"
                                        placeholderTextColor={colors.textMuted}
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                    />
                                </View>
                                {employeeList.length === 0 ? (
                                    <ActivityIndicator size="small" color={colors.primary} style={styles.listLoader} />
                                ) : filteredEmployees.length === 0 ? (
                                    <Text style={styles.emptyText}>No employees match "{searchQuery}"</Text>
                                ) : (
                                    filteredEmployees.map((emp) => (
                                        <TouchableOpacity
                                            key={emp.name}
                                            style={styles.employeeOption}
                                            onPress={() => setSelectedEmployee(emp)}
                                            activeOpacity={0.8}
                                        >
                                            {renderPerson(emp.name, emp.employee_name, emp.name)}
                                            <Icon name="chevron-right" size={12} color={colors.textMuted} />
                                        </TouchableOpacity>
                                    ))
                                )}
                            </>
                        )}
                    </View>
                ) : null}

                {/* Work mode */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={styles.cardTitleRow}>
                            <Icon name="briefcase" size={14} color={colors.primary} />
                            <Text style={styles.cardTitle}>Work Mode</Text>
                        </View>
                    </View>
                    <View style={styles.modeRow}>
                        {WORK_MODES.map((m) => {
                            const active = workMode === m.key;
                            const allowed = modeAllowed(m.key);
                            return (
                                <TouchableOpacity
                                    key={m.key}
                                    style={[styles.modeOption, active && { backgroundColor: m.color, borderColor: m.color }, !allowed && styles.disabled]}
                                    onPress={() => allowed && setWorkMode(m.key)}
                                    disabled={!allowed}
                                    activeOpacity={0.8}
                                >
                                    <Icon name={m.icon} size={16} color={active ? colors.white : m.color} />
                                    <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {!wfhAllowed || !onsiteAllowed ? (
                        <Text style={styles.kioskSub}>
                            {[!wfhAllowed && 'WFH', !onsiteAllowed && 'On Site'].filter(Boolean).join(' and ')} not enabled for{' '}
                            {kioskMode ? (selectedEmployee ? targetName : 'this employee') : 'you'}.
                        </Text>
                    ) : null}
                </View>

                {renderLocation()}

                {/* Action */}
                <TouchableOpacity
                    style={[styles.actionButton, actionStyle, actionDisabled && styles.actionDisabled]}
                    onPress={onActionPress}
                    disabled={actionDisabled}
                    activeOpacity={0.85}
                >
                    {busy ? (
                        <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                        <Icon
                            name={nextAction === 'Check-In' ? 'sign-in-alt' : nextAction === 'Check-Out' ? 'sign-out-alt' : 'check-circle'}
                            size={16}
                            color={colors.white}
                        />
                    )}
                    <Text style={styles.actionText}>
                        {!targetId
                            ? 'Check In'
                            : nextAction === 'Check-In'
                                ? `Check In${kioskMode ? ` ${targetName}` : ''}`
                                : nextAction === 'Check-Out'
                                    ? `Check Out${kioskMode ? ` ${targetName}` : ''}`
                                    : 'Completed for today'}
                    </Text>
                </TouchableOpacity>
                {blockedReason ? (
                    <View style={styles.hintRow}>
                        <Icon name="info-circle" size={12} color={colors.textSecondary} />
                        <Text style={styles.hintText}>{blockedReason}</Text>
                    </View>
                ) : null}
            </ScrollView>
        </View>
    );
};

const SHADOW = {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { padding: 12, paddingBottom: 32 },
    flex: { flex: 1 },
    disabled: { opacity: 0.4 },

    card: {
        backgroundColor: colors.surface,
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...SHADOW,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },

    personRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    avatarText: { fontSize: 15, fontWeight: '700', color: colors.white },
    personName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    personId: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },

    todayRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    badgeText: { fontSize: 10, color: colors.white, fontWeight: '600' },
    timeInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    timeText: { fontSize: 12, color: '#374151', fontWeight: '500' },

    kioskRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    kioskTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    kioskSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

    linkButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.primary },
    linkButtonText: { fontSize: 12, fontWeight: '600', color: colors.primary },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.background,
        borderRadius: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 8,
    },
    searchInput: { flex: 1, paddingVertical: 9, fontSize: 14, color: colors.textPrimary },
    listLoader: { marginVertical: 12 },
    employeeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    emptyText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingVertical: 12 },

    modeRow: { flexDirection: 'row', gap: 8 },
    modeOption: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
    },
    modeText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
    modeTextActive: { color: colors.white },

    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#F0F9FF',
        padding: 10,
        borderRadius: 8,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    infoText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#1E40AF' },
    iconButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
    },
    locationStatus: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
    locationTitle: { fontSize: 14, fontWeight: '700' },
    locationSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    progressBarContainer: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginTop: 10 },
    progressBarFill: { height: '100%', borderRadius: 3 },

    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 4,
        ...SHADOW,
    },
    actionCheckIn: { backgroundColor: STATUS_COLORS.present },
    actionCheckOut: { backgroundColor: STATUS_COLORS.absent },
    actionDone: { backgroundColor: colors.textSecondary },
    actionDisabled: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },
    actionText: { fontSize: 15, fontWeight: '700', color: colors.white },
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 4 },
    hintText: { flex: 1, fontSize: 12, color: colors.textSecondary },
});

export default AdminCheckInOutScreen;
