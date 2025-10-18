// src/components/attendance/CheckInOutScreen.js
import React from 'react';
import { View, ScrollView } from 'react-native';
import AppHeader from '../../ui/AppHeader';
import GeoAttendanceCard from './GeoAttendanceCard';
import { useAuth } from '../../../context/AuthContext';
import { colors } from '../../../theme/colors';

export default function CheckInOutScreen({ route, navigation }) {
    const { employee } = useAuth();
    const employeeId = route?.params?.employeeId || employee?.name;

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <AppHeader title="Check In / Out" canGoBack onBack={() => navigation.goBack()} />
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                <GeoAttendanceCard employeeId={employeeId} />
            </ScrollView>
        </View>
    );
}
