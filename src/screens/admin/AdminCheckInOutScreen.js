// src/screens/admin/AdminCheckInOutScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import { View, Alert, StyleSheet, ScrollView } from 'react-native';
import { Text, Switch, Card, useTheme, ProgressBar, Searchbar, Chip, IconButton } from 'react-native-paper';
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

const AdminCheckInOutScreen = () => {
    const { user, employee } = useAuth();
    const { custom } = useTheme();

    const [loading, setLoading] = useState(false);
    const [isWFH, setIsWFH] = useState(false);
    const [wfhEligible, setWfhEligible] = useState(false);
    const [officeLocation, setOfficeLocation] = useState(null);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [locationStatus, setLocationStatus] = useState('checking'); // checking | inside | outside | error | wfh
    const [distance, setDistance] = useState(null);
    const [locationError, setLocationError] = useState(null);

    const [kioskMode, setKioskMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employeeList, setEmployeeList] = useState([]);
    const [filteredEmployees, setFilteredEmployees] = useState([]);

    const adminEmployeeId = employee?.name;

    const fetchWFHInfo = useCallback(async () => {
        const res = await AttendanceService.getUserWFHInfo();
        if (res.success && res.data?.message) {
            setWfhEligible(!!res.data.message.wfh_eligible);
        }
    }, []);

    const fetchOfficeLocation = useCallback(async () => {
        if (!adminEmployeeId) return;
        const res = await AttendanceService.getOfficeLocation(adminEmployeeId);
        if (res.success && res.data?.message) {
            setOfficeLocation(res.data.message); // {latitude, longitude, radius}
        }
    }, [adminEmployeeId]);

    const fetchEmployeeList = useCallback(async () => {
        try {
            const res = await AttendanceService.getEmployeeWFHList();
            if (res.success && res.data?.message) {
                setEmployeeList(res.data.message);
                setFilteredEmployees(res.data.message);
            }
        } catch (e) {
            console.error('Failed to fetch employee list:', e);
        }
    }, []);

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

    // Initial data loads
    useEffect(() => {
        if (adminEmployeeId) {
            fetchWFHInfo();
            fetchOfficeLocation();
        }
    }, [adminEmployeeId, fetchWFHInfo, fetchOfficeLocation]);

    // Run location check exactly once, after officeLocation becomes available
    useEffect(() => {
        if (officeLocation) {
            checkGeofenceStatus();
        } else {
            setLocationStatus(isWFH ? 'wfh' : 'checking');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [officeLocation]);

    // Kiosk list load (once when enabled)
    useEffect(() => {
        if (kioskMode) fetchEmployeeList();
    }, [kioskMode, fetchEmployeeList]);

    // Search filter
    useEffect(() => {
        if (!searchQuery.trim()) setFilteredEmployees(employeeList);
        else {
            const q = searchQuery.toLowerCase();
            setFilteredEmployees(
                employeeList.filter(
                    (e) => e.employee_name?.toLowerCase().includes(q) || e.name?.toLowerCase().includes(q)
                )
            );
        }
    }, [searchQuery, employeeList]);

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
        const targetEmployee = kioskMode && selectedEmployee ? selectedEmployee.name : adminEmployeeId;
        const targetName = kioskMode && selectedEmployee ? selectedEmployee.employee_name : (user?.full_name || 'Admin');

        if (kioskMode && !selectedEmployee) {
            Alert.alert('Select Employee', 'Please select an employee to proceed.');
            return;
        }

        if (!isWFH && locationStatus === 'outside') {
            Alert.alert(
                'Outside Geofence',
                `${kioskMode ? 'This device is' : 'You are'} ${distance}m away. Must be within ${officeLocation?.radius}m to ${action === 'Check-In' ? 'check in' : 'check out'}.`
            );
            return;
        }
        if (!isWFH && (locationStatus === 'error' || locationStatus === 'checking')) {
            Alert.alert('Location Error', 'Cannot determine location. Tap the refresh icon to retry.', [
                { text: 'OK' }
            ]);
            return;
        }

        if (kioskMode) {
            Alert.alert('Confirm', `${action} for:\n${targetName} (${targetEmployee})\n${isWFH ? 'Mode: WFH' : `Distance: ${distance}m`}`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Confirm', onPress: () => performCheck(action, targetEmployee, targetName) },
            ]);
        } else {
            await performCheck(action, targetEmployee, targetName);
        }
    };

    const performCheck = async (action, emp, displayName) => {
        try {
            setLoading(true);

            let latitude, longitude, work_type;

            if (isWFH) {
                if (!wfhEligible && !kioskMode) {
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
                employee: emp,
                action, // "Check-In" | "Check-Out"
                latitude,
                longitude,
                work_type,
            });

            if (res.success && res.data?.message) {
                const m = res.data.message;
                Alert.alert(
                    'Success',
                    `${action} successful for ${displayName}!\nRef: ${m.geo_log || m.attendance}\n${isWFH ? 'Mode: WFH' : `Distance: ${distance}m`}`,
                    [{ text: 'OK', onPress: () => { if (kioskMode) { setSelectedEmployee(null); setSearchQuery(''); } } }]
                );
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
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
                {/* Admin identity */}
                <Card style={styles.card}>
                    <Card.Content>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Icon name="user-shield" size={20} color={custom.palette.primary} />
                            <Text style={{ fontSize: 18, fontWeight: '800', marginLeft: 10 }}>
                                {user?.full_name || 'Admin'}
                            </Text>
                        </View>
                        <View style={styles.rowCenter}>
                            <Icon name="id-badge" size={14} color={custom.palette.textSecondary} />
                            <Text style={styles.subtleText}>{adminEmployeeId || 'N/A'}</Text>
                        </View>
                    </Card.Content>
                </Card>

                {/* Kiosk Mode */}
                <Card style={styles.card}>
                    <Card.Title
                        title="Kiosk Mode"
                        subtitle="Check in/out for other employees"
                        left={(props) => <Icon {...props} name="desktop" size={20} color={custom.palette.warning} />}
                    />
                    <Card.Content>
                        <View style={styles.rowBetween}>
                            <View style={styles.rowCenter}>
                                <Icon name="users" size={16} color={custom.palette.warning} />
                                <Text style={styles.boldText}>Enable Kiosk Mode</Text>
                            </View>
                            <Switch
                                value={kioskMode}
                                onValueChange={(val) => {
                                    setKioskMode(val);
                                    if (!val) {
                                        setSelectedEmployee(null);
                                        setSearchQuery('');
                                    }
                                }}
                            />
                        </View>
                        {kioskMode && (
                            <View style={styles.bannerWarn}>
                                <Text style={styles.bannerWarnText}>💡 In kiosk mode, you can check in/out any employee using this device.</Text>
                            </View>
                        )}
                    </Card.Content>
                </Card>

                {/* Employee Picker */}
                {kioskMode && (
                    <Card style={styles.card}>
                        <Card.Title title="Select Employee" />
                        <Card.Content>
                            <Searchbar
                                placeholder="Search by name or ID..."
                                onChangeText={setSearchQuery}
                                value={searchQuery}
                                style={{ marginBottom: 12 }}
                            />
                            {selectedEmployee ? (
                                <View style={styles.selectedEmployee}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontWeight: '800', fontSize: 16 }}>{selectedEmployee.employee_name}</Text>
                                        <Text style={{ color: custom.palette.textSecondary, fontSize: 13 }}>{selectedEmployee.name}</Text>
                                        {!!selectedEmployee.department && (
                                            <Text style={{ color: custom.palette.textSecondary, fontSize: 12, marginTop: 4 }}>
                                                {selectedEmployee.department}
                                            </Text>
                                        )}
                                    </View>
                                    <Button variant="outline" onPress={() => { setSelectedEmployee(null); setSearchQuery(''); }} compact>
                                        Change
                                    </Button>
                                </View>
                            ) : (
                                <ScrollView style={{ maxHeight: 220 }}>
                                    {filteredEmployees.length === 0 ? (
                                        <Text style={styles.subtleCenter}>{searchQuery ? 'No employees found' : 'Loading employees...'}</Text>
                                    ) : (
                                        filteredEmployees.slice(0, 10).map((emp) => (
                                            <Card key={emp.name} style={{ marginBottom: 8 }} onPress={() => setSelectedEmployee(emp)}>
                                                <Card.Content style={{ paddingVertical: 10 }}>
                                                    <View style={styles.rowBetween}>
                                                        <View style={{ flex: 1, paddingRight: 8 }}>
                                                            <Text style={{ fontWeight: '700' }}>{emp.employee_name}</Text>
                                                            <Text style={{ fontSize: 12, color: custom.palette.textSecondary }}>{emp.name}</Text>
                                                        </View>
                                                        <Chip mode="outlined" textStyle={{ fontSize: 10 }} style={{ height: 24 }}>
                                                            {emp.status || 'Active'}
                                                        </Chip>
                                                    </View>
                                                </Card.Content>
                                            </Card>
                                        ))
                                    )}
                                    {filteredEmployees.length > 10 && (
                                        <Text style={styles.subtleCenter}>Showing 10 of {filteredEmployees.length} results. Refine your search.</Text>
                                    )}
                                </ScrollView>
                            )}
                        </Card.Content>
                    </Card>
                )}

                {/* Work Mode */}
                <Card style={styles.card}>
                    <Card.Title title="Work Mode" subtitle="Choose working location" />
                    <Card.Content>
                        <View style={styles.rowBetween}>
                            <View style={styles.rowCenter}>
                                <Icon name="home" size={16} color={custom.palette.primary} />
                                <Text style={styles.boldText}>Work From Home</Text>
                            </View>
                            <Switch value={isWFH} onValueChange={setIsWFH} disabled={!kioskMode && !wfhEligible} />
                        </View>
                        {!kioskMode && !wfhEligible && (
                            <View style={styles.bannerWarn}>
                                <Text style={styles.bannerWarnText}>⚠️ You are not eligible for WFH. Contact administrator.</Text>
                            </View>
                        )}
                    </Card.Content>
                </Card>

                {/* Location Status (with REFRESH icon at top-right) */}
                {!isWFH && (
                    <Card style={styles.card}>
                        <Card.Title
                            title="Location Status"
                            subtitle={locationStatus === 'checking' ? 'Verifying location...' : 'Tap refresh to re-check'}
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

                            {locationStatus === 'checking' && (
                                <ProgressBar indeterminate color={custom.palette.primary} style={{ marginTop: 12 }} />
                            )}

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

                {/* Office Details */}
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
                        </Card.Content>
                    </Card>
                )}

                {/* Actions */}
                <Button
                    onPress={() => doAction('Check-In')}
                    style={{ marginBottom: 12 }}
                    disabled={loading || (!isWFH && locationStatus !== 'inside') || (kioskMode && !selectedEmployee)}
                >
                    <Icon name="sign-in-alt" size={14} /> {kioskMode && selectedEmployee ? `Check In - ${selectedEmployee.employee_name}` : 'Check In'}
                </Button>

                <Button
                    variant="outline"
                    onPress={() => doAction('Check-Out')}
                    disabled={loading || (!isWFH && locationStatus !== 'inside') || (kioskMode && !selectedEmployee)}
                >
                    <Icon name="sign-out-alt" size={14} /> {kioskMode && selectedEmployee ? `Check Out - ${selectedEmployee.employee_name}` : 'Check Out'}
                </Button>

                {!isWFH && locationStatus === 'outside' && (
                    <View style={[styles.bannerError, { borderLeftColor: custom.palette.danger }]}>
                        <Text style={[styles.errorTitle, { color: custom.palette.danger }]}>⚠️ Check-in/out disabled</Text>
                        <Text style={[styles.errorText, { color: custom.palette.danger }]}>
                            Device is {distance}m away. Move closer to office or enable WFH mode.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
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
    subtleText: { fontSize: 13, color: '#6B7280', marginLeft: 8 },
    subtleCenter: { textAlign: 'center', color: '#6B7280', padding: 10, fontSize: 12 },
    statusContainer: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0' },
    statusTitle: { fontWeight: '800', fontSize: 16 },
    secondaryText: { marginTop: 4, color: '#6B7280', fontSize: 13 },
    errorText: { marginTop: 4, fontSize: 12 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0' },
    infoLabel: { fontSize: 13, color: '#757575', fontWeight: '500' },
    infoValue: { fontSize: 13, color: '#111827', fontWeight: '700' },
    bannerWarn: { marginTop: 12, padding: 10, backgroundColor: '#FFF3CD', borderRadius: 10 },
    bannerWarnText: { color: '#856404', fontSize: 13 },
    bannerError: { marginTop: 12, padding: 12, backgroundColor: '#FFEBEE', borderRadius: 10, borderLeftWidth: 4 },
    errorTitle: { fontWeight: '700', fontSize: 13 },
    selectedEmployee: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#E3F2FD', borderRadius: 12, borderWidth: 1.5, borderColor: '#2196F3' },
});

export default AdminCheckInOutScreen;
