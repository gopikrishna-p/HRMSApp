import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, View, Image, StyleSheet, Text } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

// Import Admin Screens
import AdminDashboard from '../screens/admin/AdminDashboard';
import EmployeeManagement from '../screens/admin/EmployeeManagement';
import ReportsScreen from '../screens/admin/ReportsScreen';
import AdminCheckInOutScreen from '../screens/admin/AdminCheckInOutScreen';
import AllAttendanceAnalyticsScreen from '../screens/admin/AllAttendanceAnalyticsScreen';
import AttendanceAnalyticsScreen from '../screens/admin/AttendanceAnalyticsScreen';
import TodayEmployeeAnalyticsScreen from '../screens/admin/TodayEmployeeAnalyticsScreen';
import ManualCheckInOutScreen from '../screens/admin/ManualCheckInOutScreen';
import TodayAttendanceScreen from '../screens/admin/TodayAttendanceScreen';
import WFHSettingsScreen from '../screens/admin/WFHSettingsScreen';
import WFHApprovalsScreen from '../screens/admin/WFHApprovalsScreen';
import OnSiteSettingsScreen from '../screens/admin/OnSiteSettingsScreen';
import OnSiteApprovalsScreen from '../screens/admin/OnSiteApprovalsScreen';
import LeaveApprovalsScreen from '../screens/admin/LeaveApprovalsScreen';
import CompApprovalScreen from '../screens/admin/CompApprovalScreen';
import AdvanceSettlementsAdminScreen from '../screens/admin/AdvanceSettlementsAdminScreen';
import AdminSelfServiceScreen from '../screens/admin/AdminSelfServiceScreen';
import ExpenseClaimApprovalScreen from '../screens/admin/ExpenseClaimApprovalScreen';
import TravelRequestApproval from '../screens/admin/TravelRequestApproval';
import CreateNotificationScreen from '../screens/admin/CreateNotificationScreen';
import SalaryStructureAdminScreen from '../screens/admin/SalaryStructureAdminScreen';
import AdminSalaryTrackerScreen from '../screens/admin/AdminSalaryTrackerScreen';
import AdminSalaryTrackerDetailScreen from '../screens/admin/AdminSalaryTrackerDetailScreen';

// Import Employee Screen for Admin Self Leave / Self Expense / Self Travel
import LeaveApplicationScreen from '../screens/employee/LeaveApplicationScreen';
import CompensatoryLeaveScreen from '../screens/employee/CompensatoryLeaveScreen';
import PendingSettlementsScreen from '../screens/employee/PendingSettlementsScreen';
import ExpenseClaimScreen from '../screens/employee/ExpenseClaimScreen';
import TravelRequestScreen from '../screens/employee/TravelRequestScreen';
import WFHRequestScreen from '../screens/employee/WFHRequestScreen';
import OnSiteRequestScreen from '../screens/employee/OnSiteRequestScreen';
import HolidayListScreen from '../screens/employee/HolidayListScreen';
import ProfileScreen from '../screens/employee/ProfileScreen';
import SalaryStructureScreen from '../screens/employee/SalaryStructureScreen';
import MyTasksScreen from '../screens/employee/MyTasksScreen';
import MyProjectsScreen from '../screens/employee/MyProjectsScreen';
import MyLogsScreen from '../screens/employee/MyLogsScreen';

import ProjectsOverviewScreen from '../screens/admin/ProjectsOverviewScreen';
import ProjectLogsScreen from '../screens/admin/ProjectLogsScreen';
import ProjectTasksScreen from '../screens/admin/ProjectTasksScreen';

import AdminNotifications from '../screens/admin/AdminNotifications';
import AdminDailyTasksScreen from '../screens/admin/AdminDailyTasksScreen';

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
            <Stack.Screen name="AttendanceAnalytics" component={AttendanceAnalyticsScreen} options={{ title: 'Attendance Analytics' }} />
            <Stack.Screen name="TodayEmployeeAnalytics" component={TodayEmployeeAnalyticsScreen} options={{ title: 'Today Analytics' }} />
            <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports & Analytics' }} />
            <Stack.Screen name="ManualCheckInOut" component={ManualCheckInOutScreen} options={{ title: 'Manual Attendance' }} />
            <Stack.Screen name="TodayAttendance" component={TodayAttendanceScreen} options={{ title: "Today's Attendance" }} />
            <Stack.Screen name="WFHSettings" component={WFHSettingsScreen} options={{ title: 'WFH Settings' }} />
            <Stack.Screen name="WFHApprovals" component={WFHApprovalsScreen} options={{ title: 'WFH Approvals' }} />
            <Stack.Screen name="OnSiteSettings" component={OnSiteSettingsScreen} options={{ title: 'On Site Settings' }} />
            <Stack.Screen name="OnSiteApprovals" component={OnSiteApprovalsScreen} options={{ title: 'On Site Approvals' }} />
            <Stack.Screen name="LeaveApprovals" component={LeaveApprovalsScreen} options={{ title: 'Leave Approvals' }} />
            <Stack.Screen name="MyLeaveApplication" component={LeaveApplicationScreen} options={{ title: 'My Leave Application' }} />
            <Stack.Screen name="CompApprovals" component={CompApprovalScreen} options={{ title: 'Compensatory Leave Approvals' }} />
            <Stack.Screen name="AdvanceSettlementsAdmin" component={AdvanceSettlementsAdminScreen} options={{ title: 'Advance Settlement Monitor' }} />
            <Stack.Screen name="AdminSelfService" component={AdminSelfServiceScreen} options={{ title: 'My Self-Service' }} />
            <Stack.Screen name="MyCompensatoryLeave" component={CompensatoryLeaveScreen} options={{ title: 'My Comp-Off Request' }} />
            <Stack.Screen name="MyPendingSettlements" component={PendingSettlementsScreen} options={{ title: 'My Pending Settlements' }} />
            <Stack.Screen name="ExpenseClaimApproval" component={ExpenseClaimApprovalScreen} options={{ title: 'Expense Claim Approvals' }} />
            <Stack.Screen name="MyExpenseClaim" component={ExpenseClaimScreen} options={{ title: 'My Expense Claim' }} />
            <Stack.Screen name="TravelRequestApproval" component={TravelRequestApproval} options={{ title: 'Travel Request Approvals' }} />
            <Stack.Screen name="MyTravelRequest" component={TravelRequestScreen} options={{ title: 'My Travel Request' }} />
            <Stack.Screen name="MyWFHRequest" component={WFHRequestScreen} options={{ title: 'My WFH Request' }} />
            <Stack.Screen name="MyOnSiteRequest" component={OnSiteRequestScreen} options={{ title: 'My On-Site Request' }} />
            <Stack.Screen name="MyHolidayList" component={HolidayListScreen} options={{ title: 'My Holiday List' }} />
            <Stack.Screen name="MyProfile" component={ProfileScreen} options={{ title: 'My Profile' }} />
            <Stack.Screen name="MySalaryStructure" component={SalaryStructureScreen} options={{ title: 'My Salary Structure' }} />
            <Stack.Screen name="MyTasks" component={MyTasksScreen} options={{ headerShown: false }} />
            <Stack.Screen name="MyProjects" component={MyProjectsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="MyLogs" component={MyLogsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CreateNotification" component={CreateNotificationScreen} options={{ title: 'Create Notification' }} />

            <Stack.Screen name="ProjectsOverview" component={ProjectsOverviewScreen} options={{ title: 'Projects Overview' }} />
            <Stack.Screen name="ProjectLogsScreen" component={ProjectLogsScreen} options={{ title: 'Project Logs' }} />
            <Stack.Screen name="ProjectTasksScreen" component={ProjectTasksScreen} options={{ title: 'Project Tasks' }} />

            <Stack.Screen name="AdminNotifications" component={AdminNotifications} options={{ title: 'Notifications' }} />
            <Stack.Screen name="SalaryStructureAdmin" component={SalaryStructureAdminScreen} options={{ title: 'Salary Structures' }} />
            <Stack.Screen name="AdminSalaryTracker" component={AdminSalaryTrackerScreen} options={{ title: 'Salary Tracker' }} />
            <Stack.Screen name="AdminSalaryTrackerDetail" component={AdminSalaryTrackerDetailScreen} options={{ title: 'Salary Detail' }} />
            <Stack.Screen name="AdminDailyTasksScreen" component={AdminDailyTasksScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
    );
};

export default AdminNavigator;