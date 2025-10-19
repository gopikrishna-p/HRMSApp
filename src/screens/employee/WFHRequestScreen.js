// src/screens/employee/WFHRequestScreen.js
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text, Button, Card, useTheme } from 'react-native-paper';
import AppHeader from '../../components/ui/AppHeader';
import AttendanceService from '../../services/attendance.service';

const WFHRequestScreen = ({ navigation }) => {
    const { custom } = useTheme();
    const [eligible, setEligible] = useState(false);
    const [info, setInfo] = useState(null);

    useEffect(() => {
        (async () => {
            const res = await AttendanceService.getUserWFHInfo();
            if (res.success && res.data?.message) {
                setEligible(!!res.data.message.wfh_eligible);
                setInfo(res.data.message);
            }
        })();
    }, []);

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
            <AppHeader title="WFH" />
            <View style={{ padding: 16 }}>
                <Card>
                    <Card.Title title="Work From Home" />
                    <Card.Content>
                        <Text>Eligibility: {eligible ? 'Eligible' : 'Not Eligible'}</Text>
                        {!!info?.employee_name && <Text style={{ marginTop: 6 }}>Employee: {info.employee_name}</Text>}
                        {!!info?.department && <Text>Department: {info.department}</Text>}
                        {!!info?.designation && <Text>Designation: {info.designation}</Text>}
                        <Text style={{ marginTop: 12, color: custom.palette.textSecondary }}>
                            If you are eligible, open Check In/Out and switch to WFH to mark attendance without geofence.
                        </Text>
                        <Button
                            mode="contained"
                            style={{ marginTop: 16 }}
                            onPress={() => navigation.navigate('CheckInOut')}
                        >
                            Go to Check In/Out
                        </Button>
                    </Card.Content>
                </Card>
            </View>
        </View>
    );
};

export default WFHRequestScreen;
