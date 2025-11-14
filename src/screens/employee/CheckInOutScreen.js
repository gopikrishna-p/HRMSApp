// src/screens/employee/CheckInOutScreen.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Alert, StyleSheet, ScrollView } from 'react-native';
import { Text, Switch, Card, useTheme, ProgressBar, IconButton } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import AttendanceService from '../../services/attendance.service';
import { ensureLocationPermission, getCurrentPosition } from '../../utils/location';
import Button from '../../components/common/Button';

// Haversine (meters)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const CheckInOutScreen = () => {
    const { employee } = useAuth();
    const { custom } = useTheme();

    const [loading, setLoading] = useState(false);
    const [isWFH, setIsWFH] = useState(false);
    const [wfhEligible, setWfhEligible] = useState(false);
    const [officeLocation, setOfficeLocation] = useState(null);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [locationStatus, setLocationStatus] = useState('checking'); // checking | inside | outside | error | wfh
    const [distance, setDistance] = useState(null);
    const [locationError, setLocationError] = useState(null);
    
    // Today's attendance status
    const [todayAttendance, setTodayAttendance] = useState({
        hasCheckedIn: false,
        hasCheckedOut: false,
        checkInTime: null,
        checkOutTime: null,
        status: null,
        workType: null
    });

    const employeeId = employee?.name;

    const fetchWFHInfo = useCallback(async () => {
        const res = await AttendanceService.getUserWFHInfo();
        if (res.success && res.data?.message) {
            setWfhEligible(!!res.data.message.wfh_eligible);
        }
    }, []);

    const fetchTodayAttendance = useCallback(async () => {
        if (!employeeId) return;
        try {
            const attendanceStatus = await AttendanceService.getTodayAttendanceStatus(employeeId);
            setTodayAttendance(attendanceStatus);
            console.log('Today attendance status:', attendanceStatus);
        } catch (error) {
            console.error('Error fetching today attendance:', error);
        }
    }, [employeeId]);

    const fetchOfficeLocation = useCallback(async () => {
        if (!employeeId) return;
        const res = await AttendanceService.getOfficeLocation(employeeId);
        if (res.success && res.data?.message) {
            setOfficeLocation(res.data.message); // {latitude, longitude, radius}
        }
    }, [employeeId]);

    const checkGeofenceStatus = useCallback(async () => {
        if (isWFH || !officeLocation) {
            setLocationStatus('wfh');
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
    }, [isWFH, officeLocation]);

    // Initial loads
    useEffect(() => {
        if (employeeId) {
            fetchWFHInfo();
            fetchOfficeLocation();
            fetchTodayAttendance(); // Fetch today's attendance on load
        }
    }, [employeeId, fetchWFHInfo, fetchOfficeLocation, fetchTodayAttendance]);

    // Run location check exactly once after officeLocation is available
    useEffect(() => {
        if (officeLocation) {
            checkGeofenceStatus();
        } else {
            setLocationStatus(isWFH ? 'wfh' : 'checking');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [officeLocation]);

    const canDoWFH = useMemo(() => wfhEligible, [wfhEligible]);

    const parseBackendError = (errorResponse) => {
        try {
            if (errorResponse._server_messages) {
                const arr = JSON.parse(errorResponse._server_messages);
                const first = JSON.parse(arr?.[0] || '{}');
                return first.message || 'Operation failed';
            }
            return errorResponse.message || 'Operation failed';
        } catch {
            return 'Operation failed';
        }
    };

    const doAction = async (action) => {
        if (!isWFH && locationStatus === 'outside') {
            Alert.alert(
                'Outside Geofence',
                `You are ${distance}m away. You must be within ${officeLocation?.radius}m to ${action === 'Check-In' ? 'check in' : 'check out'}.`
            );
            return;
        }
        if (!isWFH && (locationStatus === 'error' || locationStatus === 'checking')) {
            Alert.alert('Location Error', 'Cannot determine your location. Tap the refresh icon to retry.', [{ text: 'OK' }]);
            return;
        }

        try {
            setLoading(true);
            let latitude, longitude, work_type;

            if (isWFH) {
                if (!canDoWFH) {
                    Alert.alert('WFH Not Allowed', 'You are not eligible for WFH.');
                    return;
                }
                work_type = 'WFH'; // will force (0,0) in service
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

            if (res.success && res.data?.message) {
                const m = res.data.message;
                Alert.alert('Success', `${action} successful!\nRef: ${m.geo_log || m.attendance}\n${isWFH ? 'Mode: WFH' : `Distance: ${distance}m`}`);
                
                // Refresh today's attendance after check-in/out
                fetchTodayAttendance();
            } else {
                const msg = parseBackendError(res);
                Alert.alert('Failed', msg);
            }
        } catch (e) {
            Alert.alert('Error', e?.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const statusColor = (() => {
        switch (locationStatus) {
            case 'inside': return custom.palette.success;
            case 'outside': return custom.palette.danger;
            case 'checking': return custom.palette.warning;
            case 'wfh': return custom.palette.primary;
            default: return custom.palette.textSecondary;
        }
    })();

    const statusIcon = (() => {
        switch (locationStatus) {
            case 'inside': return 'check-circle';
            case 'outside': return 'times-circle';
            case 'checking': return 'sync';
            case 'wfh': return 'home';
            default: return 'question-circle';
        }
    })();

    const statusText = (() => {
        switch (locationStatus) {
            case 'inside': return 'Inside Office Geofence';
            case 'outside': return 'Outside Office Geofence';
            case 'checking': return 'Checking Location...';
            case 'wfh': return 'Work From Home Mode';
            case 'error': return 'Location Error';
            default: return 'Unknown Status';
        }
    })();

    return (
        <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
            <ScrollView 
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* 1. Work Mode */}
                <Card style={styles.card}>
                    <Card.Title title="Work Mode" subtitle="Choose your working location" />
                    <Card.Content>
                        <View style={styles.rowBetween}>
                            <View style={styles.rowCenter}>
                                <Icon name="home" size={16} color={custom.palette.primary} />
                                <Text style={styles.boldText}>Work From Home</Text>
                            </View>
                            <Switch value={isWFH} onValueChange={setIsWFH} disabled={!canDoWFH} />
                        </View>
                        {!canDoWFH && (
                            <View style={styles.bannerWarn}>
                                <Text style={styles.bannerWarnText}>⚠️ You are not eligible for WFH. Contact your administrator.</Text>
                            </View>
                        )}
                    </Card.Content>
                </Card>

                {/* 2. Check-In/Check-Out Actions */}
                <View style={styles.actionsContainer}>
                    <Button onPress={() => doAction('Check-In')} style={styles.actionButton} disabled={loading || (!isWFH && locationStatus !== 'inside')}>
                        <Icon name="sign-in-alt" size={14} /> Check In
                    </Button>

                    <Button variant="outline" onPress={() => doAction('Check-Out')} style={styles.actionButton} disabled={loading || (!isWFH && locationStatus !== 'inside')}>
                        <Icon name="sign-out-alt" size={14} /> Check Out
                    </Button>
                </View>

                {!isWFH && locationStatus === 'outside' && (
                    <View style={[styles.bannerError, { borderLeftColor: custom.palette.danger }]}>
                        <Text style={[styles.errorTitle, { color: custom.palette.danger }]}>⚠️ Check-in/out disabled</Text>
                        <Text style={[styles.errorText, { color: custom.palette.danger }]}>You are currently {distance}m away. Move closer to the office or enable WFH mode.</Text>
                    </View>
                )}

                {/* 3. Today's Attendance Status */}
                {(todayAttendance.hasCheckedIn || todayAttendance.hasCheckedOut) && (
                    <Card style={styles.card}>
                        <Card.Title 
                            title="Today's Attendance" 
                            subtitle="Your check-in and check-out times"
                            left={(props) => <Icon {...props} name="calendar-check" size={20} color={custom.palette.primary} />}
                        />
                        <Card.Content>
                            <View style={styles.attendanceInfoContainer}>
                                {todayAttendance.hasCheckedIn && (
                                    <View style={styles.timeRow}>
                                        <View style={styles.timeIconContainer}>
                                            <Icon name="sign-in-alt" size={18} color={custom.palette.success} />
                                            <Text style={styles.timeLabel}>Check In</Text>
                                        </View>
                                        <Text style={styles.timeValue}>
                                            {todayAttendance.checkInTime 
                                                ? new Date(todayAttendance.checkInTime).toLocaleTimeString('en-US', { 
                                                    hour: '2-digit', 
                                                    minute: '2-digit',
                                                    hour12: true 
                                                })
                                                : 'N/A'}
                                        </Text>
                                    </View>
                                )}
                                
                                {todayAttendance.hasCheckedOut && (
                                    <View style={styles.timeRow}>
                                        <View style={styles.timeIconContainer}>
                                            <Icon name="sign-out-alt" size={18} color={custom.palette.danger} />
                                            <Text style={styles.timeLabel}>Check Out</Text>
                                        </View>
                                        <Text style={styles.timeValue}>
                                            {todayAttendance.checkOutTime 
                                                ? new Date(todayAttendance.checkOutTime).toLocaleTimeString('en-US', { 
                                                    hour: '2-digit', 
                                                    minute: '2-digit',
                                                    hour12: true 
                                                })
                                                : 'N/A'}
                                        </Text>
                                    </View>
                                )}
                                
                                {todayAttendance.workType && (
                                    <View style={[styles.workTypeBadge, { backgroundColor: `${custom.palette.primary}20` }]}>
                                        <Icon 
                                            name={todayAttendance.workType === 'WFH' ? 'home' : 'building'} 
                                            size={14} 
                                            color={custom.palette.primary} 
                                        />
                                        <Text style={[styles.workTypeText, { color: custom.palette.primary }]}>
                                            {todayAttendance.workType === 'WFH' ? 'Work From Home' : 'Office'}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </Card.Content>
                    </Card>
                )}

                {/* 4. Location Status (with REFRESH icon at top-right) */}
                {!isWFH && (
                    <Card style={styles.card}>
                        <Card.Title
                            title="Location Status"
                            subtitle={locationStatus === 'checking' ? 'Verifying your location...' : 'Tap refresh to re-check'}
                            right={() => (
                                <IconButton
                                    icon="refresh"
                                    onPress={checkGeofenceStatus}
                                    disabled={loading}
                                    accessibilityLabel="Refresh location"
                                />
                            )}
                        />
                        <Card.Content>
                            <View style={[styles.statusContainer, { backgroundColor: `${statusColor}15` }]}>
                                <Icon name={statusIcon} size={24} color={statusColor} />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[styles.statusTitle, { color: statusColor }]}>{statusText}</Text>
                                    {distance !== null && locationStatus !== 'checking' && (
                                        <Text style={styles.secondaryText}>Distance: {distance}m from office</Text>
                                    )}
                                    {locationError && <Text style={[styles.errorText]}>{locationError}</Text>}
                                </View>
                            </View>

                            {locationStatus === 'checking' && <ProgressBar indeterminate color={custom.palette.primary} style={{ marginTop: 12 }} />}

                            {locationStatus !== 'checking' && distance !== null && officeLocation && (
                                <View style={{ marginTop: 16 }}>
                                    <View style={styles.rowBetween}>
                                        <Text style={styles.secondaryText}>Geofence Radius: {officeLocation.radius}m</Text>
                                        <Text style={[styles.secondaryText, { fontWeight: '700', color: statusColor }]}>
                                            {locationStatus === 'inside' ? 'Within Range' : 'Out of Range'}
                                        </Text>
                                    </View>
                                    <ProgressBar
                                        progress={Math.min(distance / (officeLocation.radius * 2), 1)}
                                        color={locationStatus === 'inside' ? custom.palette.success : custom.palette.danger}
                                        style={{ marginTop: 6 }}
                                    />
                                </View>
                            )}
                        </Card.Content>
                    </Card>
                )}

                {/* 5. Office Geofence Details */}
                {!isWFH && officeLocation && (
                    <Card style={styles.card}>
                        <Card.Title
                            title="Office Geofence Details"
                            left={(props) => <Icon {...props} name="map-marker-alt" size={20} color={custom.palette.primary} />}
                        />
                        <Card.Content>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Latitude:</Text>
                                <Text style={styles.infoValue}>{officeLocation.latitude.toFixed(6)}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Longitude:</Text>
                                <Text style={styles.infoValue}>{officeLocation.longitude.toFixed(6)}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Radius:</Text>
                                <Text style={styles.infoValue}>{officeLocation.radius}m</Text>
                            </View>
                            <View style={styles.bannerInfo}>
                                <Text style={styles.bannerInfoText}>💡 You must be within the geofence radius to check in/out from office.</Text>
                            </View>
                        </Card.Content>
                    </Card>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 32, // Extra bottom padding for better scrolling experience
    },
    card: {
        marginBottom: 14,
        backgroundColor: '#FFF',
        borderRadius: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
    },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rowCenter: { flexDirection: 'row', alignItems: 'center' },
    boldText: { marginLeft: 8, fontWeight: '600' },
    actionsContainer: {
        marginTop: 8,
        marginBottom: 16,
    },
    actionButton: {
        marginBottom: 12,
    },
    statusContainer: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0' },
    statusTitle: { fontWeight: '800', fontSize: 16 },
    secondaryText: { marginTop: 4, color: '#6B7280', fontSize: 13 },
    errorText: { marginTop: 4, fontSize: 12 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0' },
    infoLabel: { fontSize: 13, color: '#757575', fontWeight: '500' },
    infoValue: { fontSize: 13, color: '#111827', fontWeight: '700' },
    bannerInfo: { marginTop: 12, padding: 10, backgroundColor: '#E3F2FD', borderRadius: 10 },
    bannerInfoText: { color: '#1565C0', fontSize: 12 },
    bannerWarn: { marginTop: 12, padding: 10, backgroundColor: '#FFF3CD', borderRadius: 10 },
    bannerWarnText: { color: '#856404', fontSize: 13 },
    bannerError: { marginTop: 12, padding: 12, backgroundColor: '#FFEBEE', borderRadius: 10, borderLeftWidth: 4 },
    errorTitle: { fontWeight: '700', fontSize: 13 },
    attendanceInfoContainer: { 
        gap: 12 
    },
    timeRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: '#E0E0E0'
    },
    timeIconContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 10 
    },
    timeLabel: { 
        fontSize: 14, 
        fontWeight: '600', 
        color: '#4B5563' 
    },
    timeValue: { 
        fontSize: 15, 
        fontWeight: '700', 
        color: '#111827' 
    },
    workTypeBadge: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 8, 
        padding: 10, 
        borderRadius: 8,
        marginTop: 8
    },
    workTypeText: { 
        fontSize: 13, 
        fontWeight: '600' 
    },
});

export default CheckInOutScreen;
