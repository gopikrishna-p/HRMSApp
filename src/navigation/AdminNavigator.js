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
import CompApprovalScreen from '../screens/admin/CompApprovalScreen';
import ExpenseClaimApprovalScreen from '../screens/admin/ExpenseClaimApprovalScreen';
import TravelRequestApproval from '../screens/admin/TravelRequestApproval';
import CreateNotificationScreen from '../screens/admin/CreateNotificationScreen';

import ProjectsOverviewScreen from '../screens/admin/ProjectsOverviewScreen';
import ProjectLogsScreen from '../screens/admin/ProjectLogsScreen';
import ProjectTasksScreen from '../screens/admin/ProjectTasksScreen';

import AdminNotifications from '../screens/admin/AdminNotifications';
import AdminAllStandupsScreen from '../screens/admin/AdminAllStandupsScreen';
import AdminStandupDetailScreen from '../screens/admin/AdminStandupDetailScreen';
import AdminDepartmentStandupScreen from '../screens/admin/AdminDepartmentStandupScreen';

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
            <Stack.Screen name="CompApprovals" component={CompApprovalScreen} options={{ title: 'Compensatory Leave Approvals' }} />
            <Stack.Screen name="ExpenseClaimApproval" component={ExpenseClaimApprovalScreen} options={{ title: 'Expense Claim Approvals' }} />
            <Stack.Screen name="TravelRequestApproval" component={TravelRequestApproval} options={{ title: 'Travel Request Approvals' }} />
            <Stack.Screen name="CreateNotification" component={CreateNotificationScreen} options={{ title: 'Create Notification' }} />

            <Stack.Screen name="AdminAllStandups" component={AdminAllStandupsScreen} options={{ title: 'All Standups' }} />
            <Stack.Screen name="AdminStandupDetail" component={AdminStandupDetailScreen} options={{ title: 'Standup Detail' }} />
            <Stack.Screen name="AdminDepartmentStandup" component={AdminDepartmentStandupScreen} options={{ title: 'Department Standups' }} />

            <Stack.Screen name="ProjectsOverview" component={ProjectsOverviewScreen} options={{ title: 'Projects Overview' }} />
            <Stack.Screen name="ProjectLogsScreen" component={ProjectLogsScreen} options={{ title: 'Project Logs' }} />
            <Stack.Screen name="ProjectTasksScreen" component={ProjectTasksScreen} options={{ title: 'Project Tasks' }} />

            <Stack.Screen name="AdminNotifications" component={AdminNotifications} options={{ title: 'Notifications' }} />
        </Stack.Navigator>
    );
};

export default AdminNavigator;