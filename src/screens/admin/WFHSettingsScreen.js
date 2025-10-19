// src/screens/admin/WFHSettingsScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import { View, Alert, FlatList } from 'react-native';
import { Text, Card, Switch, useTheme, ActivityIndicator } from 'react-native-paper';
import AppHeader from '../../components/ui/AppHeader';
import AttendanceService from '../../services/attendance.service';

const WFHSettingsScreen = () => {
    const { custom } = useTheme();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const res = await AttendanceService.getEmployeeWFHList();
        if (res.success && res.data?.message) {
            setRows(res.data.message); // [{name, employee_name, custom_wfh_eligible, status}]
        } else {
            Alert.alert('Error', res.message || 'Failed to load WFH list');
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const toggle = async (employee_id, value) => {
        const res = await AttendanceService.toggleWFHEligibility(employee_id, value);
        if (!res.success) {
            Alert.alert('Error', res.message || 'Failed to update');
            return;
        }
        setRows(prev => prev.map(r => r.name === employee_id ? { ...r, custom_wfh_eligible: value ? 1 : 0 } : r));
    };

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
            <AppHeader title="WFH Settings" />
            {loading ? (
                <ActivityIndicator style={{ marginTop: 24 }} />
            ) : (
                <FlatList
                    contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
                    data={rows}
                    keyExtractor={(item) => item.name}
                    renderItem={({ item }) => (
                        <Card style={{ marginBottom: 10 }}>
                            <Card.Title title={item.employee_name} subtitle={item.name} />
                            <Card.Content style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text>Status: {item.status}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={{ marginRight: 8 }}>WFH Eligible</Text>
                                    <Switch
                                        value={!!item.custom_wfh_eligible}
                                        onValueChange={(val) => toggle(item.name, val)}
                                    />
                                </View>
                            </Card.Content>
                        </Card>
                    )}
                />
            )}
        </View>
    );
};

export default WFHSettingsScreen;
