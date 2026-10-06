// src/screens/admin/AdminCheckInOutScreen.js
//
// The admin's own check-in / check-out, plus kiosk mode: check in or out any employee from this
// device. Shows the person's attendance for today so only the right action is offered
// (Check In -> Check Out -> done). Office mode needs the device inside the office geofence;
// the server checks the geofence and WFH / On Site eligibility again.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import AttendanceService from '../../services/attendance.service';
import { ensureLocationPermission, getCurrentPosition } from '../../utils/location';
import { formatTimeOfDay } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    SearchField,
    StatusText,
    Button,
    IconButton,
    EmptyState,
    color,
    space,
    type,
} from '../../components/ds';

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
    { value: 'Office', label: 'Office' },
    { value: 'WFH', label: 'WFH' },
    { value: 'Onsite', label: 'On site' },
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
    const wfhAllowed = kioskMode ? Boolean(selectedEmployee?.wfh_today ?? selectedEmployee?.custom_wfh_eligible) : adminWfhEligible;
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
                return 'Location unavailable. Tap Refresh under Location.';
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
            const mode = WORK_MODES.find((m) => m.value === workMode)?.label;
            Alert.alert('Confirm', `${nextAction} for ${targetName} (${targetId})\nWork mode: ${mode}`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Confirm', onPress: performAction },
            ]);
        } else {
            performAction();
        }
    };

    // ------------------------------------------------------------------ render
    const checkIn = formatTimeOfDay(today.checkInTime);
    const checkOut = formatTimeOfDay(today.checkOutTime);
    const todayState = !today.hasCheckedIn ? 'Not checked in' : !today.hasCheckedOut ? 'Checked in' : 'Completed';
    const todayDetail = [checkIn && `In ${checkIn}`, checkOut && `Out ${checkOut}`].filter(Boolean).join('  \u00B7  ');

    const location = (() => {
        if (officeError) {
            return { title: 'No office location', subtitle: officeError, tone: 'danger' };
        }
        if (locationStatus === 'checking') {
            return { title: 'Checking location', subtitle: 'Getting your position', tone: 'neutral' };
        }
        if (locationStatus === 'error') {
            return { title: 'Location unavailable', subtitle: locationError, tone: 'danger' };
        }
        const where = `${distance} m from ${officeLocation?.location_name || 'the office'}, allowed ${officeLocation?.radius} m`;
        return locationStatus === 'inside'
            ? { title: 'Inside the office area', subtitle: where, tone: 'success' }
            : { title: 'Outside the office area', subtitle: where, tone: 'danger' };
    })();

    const actionTitle = !targetId
        ? 'Check in'
        : nextAction === 'Check-In'
            ? (kioskMode ? `Check in ${targetName}` : 'Check in')
            : nextAction === 'Check-Out'
                ? (kioskMode ? `Check out ${targetName}` : 'Check out')
                : 'Completed for today';

    return (
        <Screen
            refreshing={refreshing}
            onRefresh={onRefresh}
            footer={(
                <View>
                    {blockedReason ? <Text style={styles.blocked}>{blockedReason}</Text> : null}
                    <Button
                        title={actionTitle}
                        variant={nextAction === 'Check-Out' ? 'dangerSolid' : 'primary'}
                        icon={nextAction === 'Check-In' ? 'log-in' : nextAction === 'Check-Out' ? 'log-out' : 'check'}
                        onPress={onActionPress}
                        loading={busy}
                        disabled={busy || !nextAction || Boolean(blockedReason) || statusLoading}
                        full
                    />
                </View>
            )}
        >
            <Group title={kioskMode ? 'Kiosk' : 'You'}>
                {kioskMode && !selectedEmployee ? (
                    <Row icon="monitor" title="Kiosk mode is on" subtitle="Choose the employee below" />
                ) : (
                    <Row
                        left={<Avatar name={targetName} />}
                        title={targetName}
                        subtitle={todayDetail || targetId}
                        right={statusLoading ? <ActivityIndicator size="small" color={color.textTertiary} /> : <StatusText label={todayState} tone={todayState === 'Not checked in' ? 'neutral' : undefined} />}
                    />
                )}
                <Row
                    icon="monitor"
                    title="Kiosk mode"
                    subtitle="Check in or out another employee on this device"
                    right={(
                        <Switch
                            value={kioskMode}
                            onValueChange={(val) => {
                                setKioskMode(val);
                                setSelectedEmployee(null);
                                setSearchQuery('');
                            }}
                            trackColor={{ true: '#C7D2FE', false: '#EAECF0' }}
                            thumbColor={kioskMode ? color.accent : '#FFFFFF'}
                        />
                    )}
                />
            </Group>

            {kioskMode ? (
                selectedEmployee ? (
                    <Group title="Employee" action="Change" onAction={() => { setSelectedEmployee(null); setSearchQuery(''); }}>
                        <Row left={<Avatar name={selectedEmployee.employee_name} />} title={selectedEmployee.employee_name}
                            subtitle={[selectedEmployee.name, (selectedEmployee.department || '').replace(' - DG', '')].filter(Boolean).join('  \u00B7  ')} />
                    </Group>
                ) : (
                    <View style={styles.block}>
                        <SearchField value={searchQuery} onChangeText={setSearchQuery} placeholder="Search by name or ID" style={styles.search} />
                        {employeeList.length === 0 ? (
                            <ActivityIndicator color={color.accent} style={styles.loader} />
                        ) : filteredEmployees.length === 0 ? (
                            <EmptyState icon="search" title="No match" message={`No employee matches \u201C${searchQuery}\u201D.`} />
                        ) : (
                            <Group>
                                {filteredEmployees.map((emp) => (
                                    <Row key={emp.name} left={<Avatar name={emp.employee_name} />} title={emp.employee_name} subtitle={emp.name} onPress={() => setSelectedEmployee(emp)} />
                                ))}
                            </Group>
                        )}
                    </View>
                )
            ) : null}

            <Group
                title="Work mode"
                footer={!wfhAllowed || !onsiteAllowed
                    ? `${[!wfhAllowed && 'WFH', !onsiteAllowed && 'On site'].filter(Boolean).join(' and ')} not available ${kioskMode ? (selectedEmployee ? `for ${targetName} today` : 'until an employee is chosen') : 'for you today'}.`
                    : undefined}
                flush
            >
                <Segmented
                    options={WORK_MODES}
                    value={workMode}
                    onChange={(v) => {
                        if (modeAllowed(v)) {
                            setWorkMode(v);
                        } else {
                            showToast({ type: 'info', text1: `${WORK_MODES.find((m) => m.value === v)?.label} not available`, text2: v === 'WFH' ? 'Request WFH for today first' : 'Not enabled for this employee' });
                        }
                    }}
                />
            </Group>

            {workMode === 'Office' ? (
                <Group title="Location">
                    <Row
                        icon="map-pin"
                        title={location.title}
                        subtitle={location.subtitle}
                        right={(
                            <View style={styles.locationRight}>
                                <StatusText label={location.tone === 'success' ? 'In range' : location.tone === 'danger' ? 'Blocked' : 'Wait'} tone={location.tone} />
                                <IconButton name="refresh-cw" onPress={checkGeofence} disabled={!officeLocation || locationStatus === 'checking'} label="Refresh location" />
                            </View>
                        )}
                    />
                </Group>
            ) : (
                <Text style={styles.modeNote}>
                    {workMode === 'WFH' ? 'Working from home: no location check.' : 'On site: your current location is recorded.'}
                </Text>
            )}
        </Screen>
    );
};

const styles = StyleSheet.create({
    block: { marginBottom: space.xl },
    search: { marginBottom: space.md },
    loader: { marginVertical: space.lg },
    locationRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    modeNote: { ...type.secondary, paddingHorizontal: space.xs, marginTop: -space.md },
    blocked: { ...type.secondary, textAlign: 'center', marginBottom: space.sm },
});

export default AdminCheckInOutScreen;
