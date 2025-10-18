// src/components/attendance/GeoAttendanceCard.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { Text, ActivityIndicator } from 'react-native-paper';
import debounce from 'lodash.debounce';
import { colors } from '../../../theme/colors';

import { getCurrentLocation } from '../attendanceService/locationService';
import { markGeoAttendance, getTodayAttendanceStatus, getOfficeLocation } from '../attendanceService/attendanceService';
import showToast from '../../../utils/Toast';

export default function GeoAttendanceCard({ employeeId, title = 'Geo Attendance' }) {
    const [loading, setLoading] = useState(false);
    const [checkInTime, setCheckInTime] = useState(null);
    const [checkOutTime, setCheckOutTime] = useState(null);

    const fetchStatus = useCallback(async () => {
        if (!employeeId) return;
        try {
            const status = await getTodayAttendanceStatus(employeeId);
            setCheckInTime(status.checkIn || null);
            setCheckOutTime(status.checkOut || null);
        } catch { }
    }, [employeeId]);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    const distanceMeters = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3;
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;
        const a =
            Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const core = useCallback(async (action) => {
        if (!employeeId) {
            showToast({ type: 'error', text1: 'Error', text2: 'User not authenticated. Please log in.', time: 5000 });
            return;
        }
        if (loading) return;
        setLoading(true);

        try {
            // Guard rails
            const status = await getTodayAttendanceStatus(employeeId);
            if (action === 'Check-In' && status.checkIn) {
                showToast({ type: 'error', text1: 'Already Checked In', text2: "You've already marked today's check-in.", time: 5000 });
                return;
            }
            if (action === 'Check-Out' && !status.checkIn) {
                showToast({ type: 'error', text1: 'No Check-In Found', text2: 'Please check-in first.', time: 5000 });
                return;
            }

            const loc = await getCurrentLocation();

            // Optional client geofence
            try {
                const office = await getOfficeLocation(employeeId);
                const d = distanceMeters(loc.latitude, loc.longitude, office.latitude, office.longitude);
                if (d > office.radius) {
                    showToast({ type: 'error', text1: 'Outside Geofence', text2: 'Please mark from office or use WFH (if allowed).', time: 5000 });
                    return;
                }
            } catch {
                // backend will validate anyway
            }

            const resp = await markGeoAttendance(action, employeeId, loc.latitude, loc.longitude);
            showToast({
                type: resp.status === 'Queued' ? 'info' : 'success',
                text1: resp.status === 'Queued' ? 'Saved Offline' : 'Success',
                text2: resp.message,
                backgroundColor: resp.status === 'Queued' ? '#2196F3' : (action === 'Check-In' ? '#10B981' : '#3B82F6'),
                time: 4500,
            });

            if (resp.status === 'success') await fetchStatus();
        } catch (error) {
            let msg = 'Failed to mark attendance. Please try again.';
            const em = String(error?.message || '');
            if (em.includes('outside the office geofence')) msg = 'You are outside the office geofence.';
            else if (em.includes('Invalid Employee ID')) msg = 'Invalid employee details. Contact HR.';
            else if (em.includes('already performed')) msg = "You've already marked today's attendance.";
            else if (em.includes('No Check-In found')) msg = 'Please check-in first.';
            else if (em.includes('No office location assigned')) msg = 'No office location assigned. Contact HR.';
            else if (em.includes('not authorized to mark Work From Home')) msg = 'WFH not authorized for your profile.';
            else if (em.includes('lack permission')) msg = 'You lack permission to submit attendance.';
            else if (em.includes('Session expired')) msg = 'Session expired. Please log in again.';
            else if (em.includes('Location permission denied')) msg = 'Please grant location permission in Settings.';
            else if (em.includes('GPS unavailable')) msg = 'GPS unavailable. Enable location services.';

            showToast({ type: 'error', text1: 'Error', text2: msg, time: 5000 });
        } finally {
            setLoading(false);
        }
    }, [employeeId, loading, fetchStatus]);

    const debounced = useMemo(() => debounce(core, 1000, { leading: true, trailing: false }), [core]);

    const fmtTime = (ts) =>
        new Date(ts).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Icon name="map-marker-alt" size={20} color={colors.primary} />
                <Text style={styles.title}>{title}</Text>
            </View>

            <View style={styles.row}>
                <TouchableOpacity
                    style={[
                        styles.btn,
                        { backgroundColor: colors.primary },
                        checkInTime && { backgroundColor: colors.success },
                        loading && styles.disabled,
                    ]}
                    onPress={() => debounced('Check-In')}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                        <>
                            <Icon name={checkInTime ? 'check-circle' : 'play-circle'} size={18} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.btnText}>{checkInTime ? 'Checked In' : 'Check-In'}</Text>
                        </>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.btn,
                        { backgroundColor: '#EF4444' },
                        checkOutTime && { backgroundColor: '#059669' },
                        loading && styles.disabled,
                    ]}
                    onPress={() => debounced('Check-Out')}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                        <>
                            <Icon name={checkOutTime ? 'check-circle' : 'stop-circle'} size={18} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.btnText}>{checkOutTime ? 'Checked Out' : 'Check-Out'}</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            {(checkInTime || checkOutTime) && (
                <View style={styles.status}>
                    {checkInTime && (
                        <View style={styles.statusRow}>
                            <Icon name="sign-in-alt" size={14} color={colors.success} />
                            <Text style={styles.statusText}>Check-In: {fmtTime(checkInTime)}</Text>
                        </View>
                    )}
                    {checkOutTime && (
                        <View style={styles.statusRow}>
                            <Icon name="sign-out-alt" size={14} color="#EF4444" />
                            <Text style={styles.statusText}>Check-Out: {fmtTime(checkOutTime)}</Text>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFF',
        marginHorizontal: 16,
        marginTop: 8,
        padding: 20,
        borderRadius: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    title: { fontSize: 18, fontWeight: '700', color: '#111827', marginLeft: 8 },
    row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    btn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 1,
    },
    btnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    disabled: { opacity: 0.6 },
    status: { backgroundColor: '#F3F4F6', borderRadius: 8, padding: 12 },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    statusText: { marginLeft: 8, fontSize: 14, color: '#374151', fontWeight: '500' },
});
