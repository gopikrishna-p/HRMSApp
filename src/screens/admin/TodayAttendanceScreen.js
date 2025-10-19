// src/screens/admin/TodayAttendanceScreen.js (minimal wiring)
import React, { useEffect, useState } from 'react';
import { View, FlatList } from 'react-native';
import { Text, Card, useTheme, ActivityIndicator } from 'react-native-paper';
import AppHeader from '../../components/ui/AppHeader';
import AttendanceService from '../../services/attendance.service';

const TodayAttendanceScreen = () => {
    const { custom } = useTheme();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ present: [], absent: [], holiday: [] });

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await AttendanceService.getTodayAttendance();
            if (res.success && res.data?.message) setData(res.data.message);
            setLoading(false);
        })();
    }, []);

    const renderGroup = (title, arr, accent) => (
        <Card style={{ marginBottom: 10 }}>
            <Card.Title title={`${title} (${arr.length})`} />
            <Card.Content>
                {arr.length === 0 ? (
                    <Text style={{ color: custom.palette.textSecondary }}>No records</Text>
                ) : (
                    arr.map((it) => (
                        <View key={it.employee_id} style={{ paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#eee' }}>
                            <Text style={{ fontWeight: '600', color: accent }}>{it.employee_name}</Text>
                            <Text style={{ color: custom.palette.textSecondary }}>{it.employee_id}</Text>
                            {it.check_in && <Text>Check-in: {String(it.check_in)}</Text>}
                        </View>
                    ))
                )}
            </Card.Content>
        </Card>
    );

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
            <AppHeader title="Today's Attendance" />
            {loading ? (
                <ActivityIndicator style={{ marginTop: 24 }} />
            ) : (
                <FlatList
                    contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
                    data={[1]}
                    renderItem={() => (
                        <View>
                            {renderGroup('Present / WFH', data.present, custom.palette.success)}
                            {renderGroup('Absent', data.absent, custom.palette.danger)}
                            {renderGroup('Holiday', data.holiday, custom.palette.warning)}
                        </View>
                    )}
                />
            )}
        </View>
    );
};

export default TodayAttendanceScreen;
