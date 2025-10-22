import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, View, Image, StyleSheet, Text } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

// Import Admin Screens
import AdminDashboard from '../screens/admin/AdminDashboard';
import EmployeeManagement from '../screens/admin/EmployeeManagement';
import AttendanceManagementScreen from '../screens/admin/AttendanceManagementScreen';
import ReportsScreen from '../screens/admin/ReportsScreen';
import AdminCheckInOutScreen from '../screens/admin/AdminCheckInOutScreen';
import AllAttendanceAnalyticsScreen from '../screens/admin/AllAttendanceAnalyticsScreen';
import ManualCheckInOutScreen from '../screens/admin/ManualCheckInOutScreen';
import TodayAttendanceScreen from '../screens/admin/TodayAttendanceScreen';
import WFHSettingsScreen from '../screens/admin/WFHSettingsScreen';
import WFHApprovalsScreen from '../screens/admin/WFHApprovalsScreen';
import AttendanceAnalyticsScreen from '../screens/admin/AttendanceAnalyticsScreen';
import TodayEmployeeAnalyticsScreen from '../screens/admin/TodayEmployeeAnalyticsScreen';
import LeaveApprovalsScreen from '../screens/admin/LeaveApprovalsScreen';
import CreateNotificationScreen from '../screens/admin/CreateNotificationScreen';
import ProjectsOverviewScreen from '../screens/admin/ProjectsOverviewScreen';
import ProjectLogsScreen from '../screens/admin/ProjectLogsScreen';
import AdminNotifications from '../screens/admin/AdminNotifications';

const Stack = createNativeStackNavigator();

const AdminNavigator = () => {
    return (
        <Stack.Navigator
            initialRouteName="AdminDashboard"
            screenOptions={{
                headerStyle: { backgroundColor: '#FFFFFF' },
                headerTintColor: '#111827',
                headerTitleAlign: 'center',
                headerShadowVisible: true,
            }}
        >
            {/* Dashboard renders its own <AppHeader/> */}
            <Stack.Screen
                name="AdminDashboard"
                component={AdminDashboard}
                options={{ headerShown: false }}
            />

            {/* Keep RN header for the rest (or migrate gradually) */}
            <Stack.Screen name="EmployeeManagement" component={EmployeeManagement} options={{ title: 'Employee Management' }} />
            <Stack.Screen name="AdminCheckInOut" component={AdminCheckInOutScreen} options={{ title: 'Admin Check In/Out' }} />
            <Stack.Screen name="AllAttendanceAnalyticsScreen" component={AllAttendanceAnalyticsScreen} options={{ title: 'All Attendance' }} />
            <Stack.Screen name="ManualCheckInOut" component={ManualCheckInOutScreen} options={{ title: 'Manual Attendance' }} />
            <Stack.Screen name="TodayAttendance" component={TodayAttendanceScreen} options={{ title: "Today's Attendance" }} />
            <Stack.Screen name="AttendanceManagement" component={AttendanceManagementScreen} options={{ title: 'Attendance Management' }} />
            <Stack.Screen name="WFHSettings" component={WFHSettingsScreen} options={{ title: 'WFH Settings' }} />
            <Stack.Screen name="WFHApprovals" component={WFHApprovalsScreen} options={{ title: 'WFH Approvals' }} />
            <Stack.Screen name="AttendanceAnalytics" component={AttendanceAnalyticsScreen} options={{ title: 'Attendance Analytics' }} />
            <Stack.Screen name="TodayEmployeeAnalytics" component={TodayEmployeeAnalyticsScreen} options={{ title: 'Today Analytics' }} />
            <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports & Analytics' }} />
            <Stack.Screen name="LeaveApprovals" component={LeaveApprovalsScreen} options={{ title: 'Leave Approvals' }} />
            <Stack.Screen name="CreateNotification" component={CreateNotificationScreen} options={{ title: 'Create Notification' }} />
            <Stack.Screen name="ProjectsOverview" component={ProjectsOverviewScreen} options={{ title: 'Projects Overview' }} />
            <Stack.Screen name="ProjectLogs" component={ProjectLogsScreen} options={{ title: 'Project Logs' }} />
            <Stack.Screen name="AdminNotifications" component={AdminNotifications} options={{ title: 'Notifications' }} />
        </Stack.Navigator>
    );
};

export default AdminNavigator;