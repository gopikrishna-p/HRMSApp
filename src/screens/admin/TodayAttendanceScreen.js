// src/screens/admin/TodayAttendanceScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, Platform } from 'react-native';
import { Text, Card, useTheme, ActivityIndicator, Divider, Button } from 'react-native-paper';
import AppHeader from '../../components/ui/AppHeader';
import AttendanceService from '../../services/attendance.service';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

const fmtTime = (val) => {
    if (!val) return null;
    try {
        const d = new Date(String(val).replace(' ', 'T'));
        if (isNaN(d.getTime())) return null;
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return null; }
};
const ymd = (d) => d.toISOString().slice(0, 10);

const TodayAttendanceScreen = () => {
    const { custom } = useTheme();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [data, setData] = useState({ present: [], absent: [], holiday: [], total_employees: 0, working_employees: 0, date: '' });

    const load = useCallback(async (isRefresh = false) => {
        try {
            isRefresh ? setRefreshing(true) : setLoading(true);
            const payload = await AttendanceService.getTodayAttendance(ymd(selectedDate));
            setData({
                present: Array.isArray(payload.present) ? payload.present : [],
                absent: Array.isArray(payload.absent) ? payload.absent : [],
                holiday: Array.isArray(payload.holiday) ? payload.holiday : [],
                total_employees: payload.total_employees ?? 0,
                working_employees: payload.working_employees ?? 0,
                date: payload.date ?? ymd(selectedDate),
            });
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => { load(false); }, [load]);

    const pickDate = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: selectedDate,
                mode: 'date',
                onChange: (_, d) => d && setSelectedDate(d),
            });
        } else {
            setShowPicker(true);
        }
    };
    const [showPicker, setShowPicker] = useState(false);

    useEffect(() => { load(false); }, [selectedDate]);

    const renderGroup = (title, arr, accent) => {
        const list = Array.isArray(arr) ? arr : [];
        return (
            <Card style={{ marginBottom: 10 }}>
                <Card.Title title={`${title} (${list.length})`} />
                <Card.Content>
                    {list.length === 0 ? (
                        <Text style={{ color: custom.palette.textSecondary }}>No records</Text>
                    ) : (
                        list.map((it) => {
                            const ci = fmtTime(it.check_in);
                            const co = fmtTime(it.check_out);
                            return (
                                <View key={`${it.employee_id}-${it.status}-${ci || '-'}`}>
                                    <Text style={{ fontWeight: '700', color: accent }}>{it.employee_name}</Text>
                                    <Text style={{ color: custom.palette.textSecondary }}>{it.employee_id}</Text>
                                    {ci && <Text>Check-in: <Text style={{ fontWeight: '700' }}>{ci}</Text></Text>}
                                    {co && <Text>Check-out: <Text style={{ fontWeight: '700' }}>{co}</Text></Text>}
                                    <Divider style={{ marginVertical: 8 }} />
                                </View>
                            );
                        })
                    )}
                </Card.Content>
            </Card>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>

            {showPicker && Platform.OS === 'ios' && (
                <DateTimePicker
                    mode="date"
                    value={selectedDate}
                    onChange={(_, d) => { setShowPicker(false); d && setSelectedDate(d); }}
                    display="inline"
                />
            )}

            {loading ? (
                <ActivityIndicator style={{ marginTop: 24 }} />
            ) : (
                <FlatList
                    contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
                    data={[1]}
                    keyExtractor={() => 'today-attendance'}
                    renderItem={() => (
                        <View>
                            <Card style={{ marginBottom: 12 }}>
                                <Card.Content style={{ rowGap: 6 }}>
                                    <Text style={{ fontWeight: '800', fontSize: 16 }}>Summary — {data.date || ymd(selectedDate)}</Text>
                                    <Text>Total Employees: <Text style={{ fontWeight: '700' }}>{data.total_employees}</Text></Text>
                                    <Text>Working (excl. holidays): <Text style={{ fontWeight: '700' }}>{data.working_employees}</Text></Text>
                                    <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
                                        <Button mode="outlined" onPress={pickDate}>Change Date</Button>
                                        <Button mode="contained" onPress={() => load(true)}>Refresh</Button>
                                    </View>
                                </Card.Content>
                            </Card>

                            {renderGroup('Present / WFH', data.present, custom.palette.success)}
                            {renderGroup('Absent', data.absent, custom.palette.danger)}
                            {renderGroup('Holiday', data.holiday, '#6366F1')}
                        </View>
                    )}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
                />
            )}
        </View>
    );
};

export default TodayAttendanceScreen;
