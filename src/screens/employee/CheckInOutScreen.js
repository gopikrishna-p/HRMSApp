// src/screens/employee/CheckInOutScreen.js
//
// The employee's own check-in / check-out. Office mode needs the phone inside the office
// geofence; WFH and On-site need permission for today (standing, set by HR, or an approved
// request covering today). The server checks the geofence and eligibility again.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import AttendanceService from '../../services/attendance.service';
import { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import { ensureLocationPermission, getCurrentPosition } from '../../utils/location';
import { formatTimeOfDay } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Segmented,
    StatusText,
    Button,
    IconButton,
    formatLongDate,
    color,
    space,
    type,
} from '../../components/ds';

// Haversine (meters)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const WORK_MODES = [
    { value: 'Office', label: 'Office' },
    { value: 'WFH', label: 'WFH' },
    { value: 'Onsite', label: 'On-site' },
];

// The server's reason for a refused check-in / check-out, from the ApiService result
const parseBackendError = (res) => {
    const data = res?.data;
    try {
        if (data?._server_messages) {
            const arr = JSON.parse(data._server_messages);
            const first = JSON.parse(arr?.[0] || '{}');
            if (first.message) {
                return String(first.message).replace(/<[^>]+>/g, '').trim();
            }
        }
    } catch {
        // fall through to the other places a message can be
    }
    // geo_attendance reports refusals as { message: { status: 'Error', message } }
    const msg = data?.message;
    if (msg && typeof msg === 'object' && msg.message) {
        return String(msg.message);
    }
    if (typeof msg === 'string' && msg) {
        return msg;
    }
    // network errors and non-Frappe error pages: the wrapper's own message
    return (typeof res?.message === 'string' && res.message) || 'Please try again.';
};

// "100 m", or null when the office location has no radius set
const metres = (value) => {
    const n = Number(value);
    return value !== null && value !== undefined && value !== '' && Number.isFinite(n) ? `${Math.round(n)} m` : null;
};

// "2026-10-06 09:48:53.442343" -> local Date, without relying on the JS engine's date parser
const parseDateTime = (value) => {
    const m = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
};

const formatDuration = (ms) => {
    if (!(ms > 0)) {
        return null;
    }
    const minutes = Math.floor(ms / 60000);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
};

const workTypeLabel = (workType) => {
    if (workType === 'WFH' || workType === 'Work From Home') {
        return 'Work from home';
    }
    if (workType === 'Onsite' || workType === 'On Site') {
        return 'On-site';
    }
    return 'Office';
};

const CheckInOutScreen = () => {
    const { employee } = useAuth();

    const [loading, setLoading] = useState(false);
    const [workMode, setWorkMode] = useState('Office'); // 'Office' | 'WFH' | 'Onsite'
    const [wfhEligible, setWfhEligible] = useState(false);
    const [onsiteEligible, setOnsiteEligible] = useState(false); // set from get_user_wfh_info (allowed today)
    const [officeLocation, setOfficeLocation] = useState(null);
    const [officeError, setOfficeError] = useState(null); // display only: why there is no office location
    const [currentLocation, setCurrentLocation] = useState(null);
    const [locationStatus, setLocationStatus] = useState('checking'); // checking | inside | outside | error | wfh | onsite
    const [distance, setDistance] = useState(null);
    const [locationError, setLocationError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [todayLoaded, setTodayLoaded] = useState(false);
    const [todayError, setTodayError] = useState(null); // today's status could not be loaded
    const [now, setNow] = useState(() => new Date());
    const busy = useRef(false); // blocks a second check-in / check-out while one is being sent

    // Today's attendance status
    const [todayAttendance, setTodayAttendance] = useState({
        hasCheckedIn: false,
        hasCheckedOut: false,
        checkInTime: null,
        checkOutTime: null,
        status: null,
        workType: null,
    });

    const employeeId = employee?.name;
    const radiusText = metres(officeLocation?.radius);

    const fetchWFHInfo = useCallback(async () => {
        const res = await AttendanceService.getUserWFHInfo();
        if (isApiSuccess(res)) {
            const data = extractFrappeData(res, {});
            setWfhEligible(!!data.wfh_eligible);
            // On-site today: standing on-site or an approved request for today
            setOnsiteEligible(!!data.on_site_eligible);
        }
    }, []);

    const fetchTodayAttendance = useCallback(async () => {
        if (!employeeId) {
            return;
        }
        try {
            const attendanceStatus = await AttendanceService.getTodayAttendanceStatus(employeeId);
            if (attendanceStatus.error) {
                // keep what we knew; never fall back to "not checked in"
                setTodayError(attendanceStatus.error);
                return;
            }
            setTodayError(null);
            setTodayAttendance(attendanceStatus);
            // checked in but not out: check out in the same mode (a WFH day shouldn't need the office geofence)
            if (attendanceStatus.hasCheckedIn && !attendanceStatus.hasCheckedOut) {
                const t = attendanceStatus.workType;
                setWorkMode(t === 'WFH' || t === 'Work From Home' ? 'WFH' : t === 'On Site' || t === 'Onsite' ? 'Onsite' : 'Office');
            }
        } catch (error) {
            console.error('Error fetching today attendance:', error);
            setTodayError(error?.message || "Could not load today's attendance");
        }
    }, [employeeId]);

    const fetchOfficeLocation = useCallback(async () => {
        if (!employeeId) {
            return;
        }
        const res = await AttendanceService.getOfficeLocation(employeeId);
        if (isApiSuccess(res)) {
            setOfficeLocation(extractFrappeData(res, {})); // {latitude, longitude, radius}
            setOfficeError(null);
        } else {
            setOfficeError(getApiErrorMessage(res, 'No office location assigned').replace('Error getting office location: ', ''));
        }
    }, [employeeId]);

    const checkGeofenceStatus = useCallback(async () => {
        if (workMode === 'WFH' || workMode === 'Onsite' || !officeLocation) {
            setLocationStatus(workMode === 'WFH' ? 'wfh' : workMode === 'Onsite' ? 'onsite' : 'checking');
            return;
        }
        try {
            setLocationStatus('checking');
            setLocationError(null);

            await ensureLocationPermission();
            const pos = await getCurrentPosition();

            const userLat = pos.coords.latitude;
            const userLon = pos.coords.longitude;
            setCurrentLocation({ latitude: userLat, longitude: userLon });

            const dist = calculateDistance(userLat, userLon, officeLocation.latitude, officeLocation.longitude);
            const rounded = Math.round(dist);
            setDistance(rounded);

            setLocationStatus(rounded <= officeLocation.radius ? 'inside' : 'outside');
        } catch (err) {
            setLocationError(err?.message || 'Location unavailable');
            setLocationStatus('error');
        }
    }, [workMode, officeLocation]);

    // Initial loads
    useEffect(() => {
        if (employeeId) {
            fetchWFHInfo();
            fetchOfficeLocation();
            fetchTodayAttendance().finally(() => setTodayLoaded(true));
        }
    }, [employeeId, fetchWFHInfo, fetchOfficeLocation, fetchTodayAttendance]);

    // Run location check when officeLocation becomes available OR when work mode changes
    useEffect(() => {
        if (workMode === 'WFH') {
            setLocationStatus('wfh');
            setDistance(null);
            setLocationError(null);
        } else if (workMode === 'Onsite') {
            setLocationStatus('onsite');
            setDistance(null);
            setLocationError(null);
        } else if (officeLocation) {
            checkGeofenceStatus();
        } else {
            setLocationStatus('checking');
        }
        // checkGeofenceStatus is recreated with these same two values; listing it would not add runs
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [officeLocation, workMode]);

    // keep "hours so far" current while checked in
    const running = todayAttendance.hasCheckedIn && !todayAttendance.hasCheckedOut;
    useEffect(() => {
        if (!running) {
            return undefined;
        }
        setNow(new Date());
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, [running]);

    const canDoWFH = wfhEligible;
    const canDoOnsite = onsiteEligible;

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                fetchWFHInfo(),
                fetchTodayAttendance(),
                officeLocation ? Promise.resolve() : fetchOfficeLocation(),
                workMode === 'Office' ? checkGeofenceStatus() : Promise.resolve(),
            ]);
        } finally {
            setRefreshing(false);
        }
    };

    const doAction = async (action) => {
        if (busy.current) {
            return;
        }
        if (workMode === 'Office' && locationStatus === 'outside') {
            const verb = action === 'Check-In' ? 'check in' : 'check out';
            showToast({
                type: 'error',
                text1: 'Outside the office area',
                text2: radiusText
                    ? `You are ${distance} m away. Move within ${radiusText} to ${verb}.`
                    : `You are ${distance} m away. Move closer to the office to ${verb}.`,
            });
            return;
        }
        if (workMode === 'Office' && (locationStatus === 'error' || locationStatus === 'checking')) {
            showToast({ type: 'error', text1: 'Location unavailable', text2: 'Tap refresh under Location to try again.' });
            return;
        }

        busy.current = true;
        try {
            setLoading(true);
            let latitude, longitude, work_type;

            if (workMode === 'WFH') {
                if (!canDoWFH) {
                    showToast({ type: 'info', text1: 'WFH not available today', text2: 'Request WFH for today first.' });
                    setLoading(false);
                    return;
                }
                work_type = 'WFH'; // will force (0,0) in service
            } else if (workMode === 'Onsite') {
                if (!canDoOnsite) {
                    showToast({ type: 'info', text1: 'On-site not available today', text2: 'Request On-site for today first.' });
                    setLoading(false);
                    return;
                }
                work_type = 'Onsite'; // service will convert to 'On Site' for backend
                // Get current location for onsite work
                await ensureLocationPermission();
                const pos = await getCurrentPosition();
                latitude = pos.coords.latitude;
                longitude = pos.coords.longitude;
            } else {
                if (currentLocation) {
                    latitude = currentLocation.latitude;
                    longitude = currentLocation.longitude;
                } else {
                    await ensureLocationPermission();
                    const pos = await getCurrentPosition();
                    latitude = pos.coords.latitude;
                    longitude = pos.coords.longitude;
                }
            }

            const res = await AttendanceService.geoAttendance({
                employee: employeeId,
                action, // "Check-In" | "Check-Out"
                latitude,
                longitude,
                work_type,
            });

            // Check actual response status (Frappe wraps errors in HTTP 200)
            const responseData = res.data?.message;
            const isActualSuccess = res.success && responseData && responseData.status !== 'error' && responseData.status !== 'Error';

            if (isActualSuccess) {
                const time = formatTimeOfDay(responseData.timestamp || responseData.checkout_time || new Date());
                showToast({
                    type: 'success',
                    text1: action === 'Check-In' ? 'Checked in' : 'Checked out',
                    text2: time ? `at ${time}` : undefined,
                });

                // Wait for today's record so the button can't send the same action again
                await fetchTodayAttendance();
                // Also refresh location after action
                if (workMode === 'Office') {
                    checkGeofenceStatus();
                }
            } else {
                Alert.alert(action === 'Check-In' ? 'Check-in failed' : 'Check-out failed', parseBackendError(res));
            }
        } catch (e) {
            Alert.alert('Something went wrong', e?.message || 'Please try again.');
        } finally {
            busy.current = false;
            setLoading(false);
        }
    };

    // ------------------------------------------------------------------ derived (display)
    const today = todayAttendance;
    // a record without a check-in (e.g. HR marked the day Absent or On Leave) can't be checked into
    const markedWithoutCheckIn = !today.hasCheckedIn && Boolean(today.status);
    const nextAction = markedWithoutCheckIn ? null : !today.hasCheckedIn ? 'Check-In' : !today.hasCheckedOut ? 'Check-Out' : null;
    const checkIn = formatTimeOfDay(today.checkInTime);
    const checkOut = formatTimeOfDay(today.checkOutTime);
    const inAt = parseDateTime(today.checkInTime);
    const outAt = parseDateTime(today.checkOutTime);
    const hours = inAt ? formatDuration((outAt || now) - inAt) : null;

    const todayState = !today.hasCheckedIn
        ? (today.status || 'Not checked in')
        : !today.hasCheckedOut ? 'Checked in' : 'Completed';

    const modeAllowed = (key) => (key === 'WFH' ? canDoWFH : key === 'Onsite' ? canDoOnsite : true);
    const unavailable = [!canDoWFH && 'WFH', !canDoOnsite && 'On-site'].filter(Boolean);
    const modeFooter = unavailable.length
        ? `${unavailable.join(' and ')} ${unavailable.length > 1 ? 'are' : 'is'} not available for you today. ${unavailable.length > 1 ? 'Request them' : 'Request it'} for today first.`
        : undefined;

    const knownDistance = Number.isFinite(distance);
    const placeName = officeLocation?.location_name || 'the office';
    const location = (() => {
        if (locationStatus === 'checking' && officeError && !officeLocation) {
            return { title: 'No office location', subtitle: officeError, tone: 'danger' };
        }
        if (locationStatus === 'checking') {
            return { title: 'Checking location', subtitle: 'Getting your position', tone: 'neutral' };
        }
        if (locationStatus === 'error') {
            return { title: 'Location unavailable', subtitle: locationError, tone: 'danger' };
        }
        const allowed = radiusText ? `allowed ${radiusText}` : null;
        const where = knownDistance
            ? [`${distance} m from ${placeName}`, allowed].filter(Boolean).join(', ')
            : allowed ? `Allowed ${radiusText} from ${placeName}` : `Distance from ${placeName} not known`;
        return locationStatus === 'inside'
            ? { title: 'Inside the office area', subtitle: where, tone: 'success', label: 'In range' }
            : { title: 'Outside the office area', subtitle: where, tone: 'danger', label: 'Out of range' };
    })();

    const blockedReason = (() => {
        if (todayError) {
            return "Couldn't load today's attendance. Pull down to try again.";
        }
        if (markedWithoutCheckIn) {
            return `Today is already marked ${String(today.status).toLowerCase()}. Ask HR if this is wrong.`;
        }
        if (!nextAction || !todayLoaded) {
            return null;
        }
        if (workMode === 'WFH' && !canDoWFH) {
            return 'WFH is not available for you today.';
        }
        if (workMode === 'Onsite' && !canDoOnsite) {
            return 'On-site is not available for you today.';
        }
        if (workMode !== 'Office') {
            return null;
        }
        const others = [canDoWFH && 'WFH', canDoOnsite && 'On-site'].filter(Boolean);
        if (officeError && !officeLocation) {
            return `Office check-in needs an office location. ${others.length ? `Choose ${others.join(' or ')}, or ask HR to set one.` : 'Ask HR to set one.'}`;
        }
        if (locationStatus === 'error') {
            return 'Location unavailable. Tap refresh under Location.';
        }
        if (locationStatus === 'outside') {
            const move = radiusText ? `Move within ${radiusText} of the office` : 'Move closer to the office';
            return `${move}${others.length ? `, or choose ${others.join(' or ')}` : ''}.`;
        }
        return null;
    })();

    const actionTitle = nextAction === 'Check-In' ? 'Check in' : nextAction === 'Check-Out' ? 'Check out'
        : markedWithoutCheckIn ? 'Check in' : 'Completed for today';
    const actionDisabled = loading
        || (workMode === 'Office' && locationStatus !== 'inside')
        || !nextAction
        || (Boolean(employeeId) && !todayLoaded)
        || Boolean(todayError);

    const onModeChange = (value) => {
        if (modeAllowed(value)) {
            setWorkMode(value);
        } else {
            const label = WORK_MODES.find((m) => m.value === value)?.label;
            showToast({ type: 'info', text1: `${label} not available today`, text2: `Request ${label} for today first.` });
        }
    };

    // ------------------------------------------------------------------ render
    return (
        <Screen
            refreshing={refreshing}
            onRefresh={onRefresh}
            footer={(
                <View>
                    {blockedReason ? <Text style={styles.blocked}>{blockedReason}</Text> : null}
                    <Button
                        title={actionTitle}
                        onPress={() => nextAction && doAction(nextAction)}
                        loading={loading}
                        disabled={actionDisabled}
                        full
                        style={styles.mainButton}
                    />
                </View>
            )}
        >
            <Group title="Today">
                <Row
                    title={formatLongDate(now)}
                    titleLines={2}
                    subtitle={today.hasCheckedIn ? workTypeLabel(today.workType) : null}
                    right={todayLoaded || !employeeId
                        ? <StatusText label={todayState} tone={todayState === 'Not checked in' ? 'neutral' : undefined} />
                        : <ActivityIndicator size="small" color={color.textTertiary} />}
                />
                <Row title="Check in" value={checkIn || '–'} />
                <Row title="Check out" value={checkOut || '–'} />
                <Row title={running ? 'Hours so far' : 'Hours'} value={hours || '–'} />
            </Group>

            <Group title="Work mode" footer={modeFooter} flush>
                <Segmented options={WORK_MODES} value={workMode} onChange={onModeChange} />
            </Group>

            <Group title="Location">
                {workMode === 'Office' ? (
                    <Row
                        icon="map-pin"
                        title={location.title}
                        titleLines={2}
                        subtitle={location.subtitle}
                        subtitleLines={3}
                        meta={location.label ? <StatusText label={location.label} tone={location.tone} /> : null}
                        right={(
                            <View style={styles.locationRight}>
                                {locationStatus === 'checking' && !officeError ? (
                                    <ActivityIndicator size="small" color={color.textTertiary} />
                                ) : null}
                                <IconButton
                                    name="refresh-cw"
                                    onPress={officeLocation ? checkGeofenceStatus : fetchOfficeLocation}
                                    disabled={loading}
                                    label="Refresh location"
                                />
                            </View>
                        )}
                    />
                ) : workMode === 'WFH' ? (
                    <Row icon="home" title="Working from home" subtitle="No location check" />
                ) : (
                    <Row icon="briefcase" title="On-site" subtitle="No office geofence check" />
                )}
            </Group>
        </Screen>
    );
};

const styles = StyleSheet.create({
    locationRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    blocked: { ...type.secondary, textAlign: 'center', marginBottom: space.sm },
    mainButton: { minHeight: 50 },
});

export default CheckInOutScreen;
