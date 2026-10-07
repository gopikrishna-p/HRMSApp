import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import Admin Screens
import AdminDashboard from '../screens/admin/AdminDashboard';
import EmployeeManagement from '../screens/admin/EmployeeManagement';
import AdminCheckInOutScreen from '../screens/admin/AdminCheckInOutScreen';
import AllAttendanceAnalyticsScreen from '../screens/admin/AllAttendanceAnalyticsScreen';
import ManualCheckInOutScreen from '../screens/admin/ManualCheckInOutScreen';
import TodayAttendanceScreen from '../screens/admin/TodayAttendanceScreen';
import WFHSettingsScreen from '../screens/admin/WFHSettingsScreen';
import WFHApprovalsScreen from '../screens/admin/WFHApprovalsScreen';
import OnSiteSettingsScreen from '../screens/admin/OnSiteSettingsScreen';
import OnSiteApprovalsScreen from '../screens/admin/OnSiteApprovalsScreen';
import LeaveApprovalsScreen from '../screens/admin/LeaveApprovalsScreen';
import CompApprovalScreen from '../screens/admin/CompApprovalScreen';
import AdminSelfServiceScreen from '../screens/admin/AdminSelfServiceScreen';
import ExpenseClaimApprovalScreen from '../screens/admin/ExpenseClaimApprovalScreen';
import ExpensePaymentsScreen from '../screens/admin/ExpensePaymentsScreen';
import TravelRequestApproval from '../screens/admin/TravelRequestApproval';
import CreateNotificationScreen from '../screens/admin/CreateNotificationScreen';
import SalaryStructureAdminScreen from '../screens/admin/SalaryStructureAdminScreen';
import AdminSalaryTrackerScreen from '../screens/admin/AdminSalaryTrackerScreen';
import AdminSalaryTrackerDetailScreen from '../screens/admin/AdminSalaryTrackerDetailScreen';

// Import Employee Screen for Admin Self Leave / Self Expense / Self Travel
import LeaveApplicationScreen from '../screens/employee/LeaveApplicationScreen';
import CompensatoryLeaveScreen from '../screens/employee/CompensatoryLeaveScreen';
import ExpenseClaimScreen from '../screens/employee/ExpenseClaimScreen';
import TravelRequestScreen from '../screens/employee/TravelRequestScreen';
import WFHRequestScreen from '../screens/employee/WFHRequestScreen';
import OnSiteRequestScreen from '../screens/employee/OnSiteRequestScreen';
import HolidayListScreen from '../screens/employee/HolidayListScreen';
import ProfileScreen from '../screens/employee/ProfileScreen';
import SalaryStructureScreen from '../screens/employee/SalaryStructureScreen';
import MySalaryTrackerScreen from '../screens/employee/MySalaryTrackerScreen';
import SalaryTrackerDetailScreen from '../screens/employee/SalaryTrackerDetailScreen';
import MyTasksScreen from '../screens/employee/MyTasksScreen';
import MyProjectsScreen from '../screens/employee/MyProjectsScreen';
import MyLogsScreen from '../screens/employee/MyLogsScreen';

import ProjectsOverviewScreen from '../screens/admin/ProjectsOverviewScreen';
import ProjectLogsScreen from '../screens/admin/ProjectLogsScreen';
import ProjectTasksScreen from '../screens/admin/ProjectTasksScreen';

import AdminNotifications from '../screens/admin/AdminNotifications';
import AdminDailyTasksScreen from '../screens/admin/AdminDailyTasksScreen';

import EmployeeOnboardingListScreen from '../screens/admin/EmployeeOnboardingListScreen';
import EmployeeOnboardingDetailScreen from '../screens/admin/EmployeeOnboardingDetailScreen';
import CreateOnboardingInvitationScreen from '../screens/admin/CreateOnboardingInvitationScreen';

const Stack = createNativeStackNavigator();

const AdminNavigator = () => {
    return (
        <Stack.Navigator
            initialRouteName="AdminDashboard"
            screenOptions={{
                headerStyle: { backgroundColor: '#FFFFFF' },
                headerTintColor: '#101828',
                headerTitleAlign: 'center',
                headerTitleStyle: { fontSize: 17, fontWeight: '600', color: '#101828' },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: '#F4F5F7' },
            }}
        >
            {/* Dashboard renders its own <AppHeader/> */}
            <Stack.Screen
                name="AdminDashboard"
                component={AdminDashboard}
                options={{ headerShown: false }}
            />

            {/* Keep RN header for the rest (or migrate gradually) */}
            <Stack.Screen name="EmployeeManagement" component={EmployeeManagement} options={{ title: 'Employees' }} />
            <Stack.Screen name="AdminCheckInOut" component={AdminCheckInOutScreen} options={{ title: 'Check In / Out' }} />
            <Stack.Screen name="AllAttendanceAnalyticsScreen" component={AllAttendanceAnalyticsScreen} options={{ title: 'Attendance Reports' }} />
            <Stack.Screen name="ManualCheckInOut" component={ManualCheckInOutScreen} options={{ title: 'Manual Attendance' }} />
            <Stack.Screen name="TodayAttendance" component={TodayAttendanceScreen} options={{ title: "Today's Attendance" }} />
            <Stack.Screen name="WFHSettings" component={WFHSettingsScreen} options={{ title: 'WFH Settings' }} />
            <Stack.Screen name="WFHApprovals" component={WFHApprovalsScreen} options={{ title: 'WFH Requests' }} />
            <Stack.Screen name="OnSiteSettings" component={OnSiteSettingsScreen} options={{ title: 'On-Site Settings' }} />
            <Stack.Screen name="OnSiteApprovals" component={OnSiteApprovalsScreen} options={{ title: 'On-Site Requests' }} />
            <Stack.Screen name="LeaveApprovals" component={LeaveApprovalsScreen} options={{ title: 'Leave Requests' }} />
            <Stack.Screen name="MyLeaveApplication" component={LeaveApplicationScreen} options={{ title: 'My Leave' }} />
            <Stack.Screen name="CompApprovals" component={CompApprovalScreen} options={{ title: 'Comp-Off Requests' }} />
            <Stack.Screen name="AdminSelfService" component={AdminSelfServiceScreen} options={{ title: 'Self-Service' }} />
            <Stack.Screen name="MyCompensatoryLeave" component={CompensatoryLeaveScreen} options={{ title: 'My Comp-Off' }} />
            <Stack.Screen name="ExpenseClaimApproval" component={ExpenseClaimApprovalScreen} options={{ title: 'Expense Claims' }} />
            <Stack.Screen name="ExpensePayments" component={ExpensePaymentsScreen} options={{ title: 'Expense Payments' }} />
            <Stack.Screen name="MyExpenseClaim" component={ExpenseClaimScreen} options={{ title: 'My Expense Claims' }} />
            <Stack.Screen name="TravelRequestApproval" component={TravelRequestApproval} options={{ title: 'Travel Requests' }} />
            <Stack.Screen name="MyTravelRequest" component={TravelRequestScreen} options={{ title: 'My Travel' }} />
            <Stack.Screen name="MyWFHRequest" component={WFHRequestScreen} options={{ title: 'My WFH' }} />
            <Stack.Screen name="MyOnSiteRequest" component={OnSiteRequestScreen} options={{ title: 'My On-Site' }} />
            <Stack.Screen name="MyHolidayList" component={HolidayListScreen} options={{ title: 'Holidays' }} />
            <Stack.Screen name="MyProfile" component={ProfileScreen} options={{ title: 'My Profile' }} />
            <Stack.Screen name="MySalaryStructure" component={SalaryStructureScreen} options={{ title: 'My Salary Structure' }} />
            {/* Self-Service: own salary months only (MySalaryTracker opens SalaryTrackerDetail) */}
            <Stack.Screen name="MySalaryTracker" component={MySalaryTrackerScreen} options={{ title: 'My Salary Payments' }} />
            <Stack.Screen name="SalaryTrackerDetail" component={SalaryTrackerDetailScreen} options={{ title: 'Salary Detail' }} />
            <Stack.Screen name="MyTasks" component={MyTasksScreen} options={{ title: 'Tasks' }} />
            <Stack.Screen name="MyProjects" component={MyProjectsScreen} options={{ title: 'My Projects' }} />
            <Stack.Screen name="MyLogs" component={MyLogsScreen} options={{ title: 'Work Logs' }} />
            {/* the employee project screens navigate by these names */}
            <Stack.Screen name="MyTasksScreen" component={MyTasksScreen} options={{ title: 'Tasks' }} />
            <Stack.Screen name="MyLogsScreen" component={MyLogsScreen} options={{ title: 'Work Logs' }} />
            <Stack.Screen name="CreateNotification" component={CreateNotificationScreen} options={{ title: 'New Notification' }} />

            <Stack.Screen name="ProjectsOverview" component={ProjectsOverviewScreen} options={{ title: 'Projects' }} />
            <Stack.Screen name="ProjectLogsScreen" component={ProjectLogsScreen} options={{ title: 'Project Logs' }} />
            <Stack.Screen name="ProjectTasksScreen" component={ProjectTasksScreen} options={{ title: 'Project Tasks' }} />

            <Stack.Screen name="AdminNotifications" component={AdminNotifications} options={{ title: 'Notifications' }} />
            <Stack.Screen name="SalaryStructureAdmin" component={SalaryStructureAdminScreen} options={{ title: 'Salary Structures' }} />
            <Stack.Screen name="AdminSalaryTracker" component={AdminSalaryTrackerScreen} options={{ title: 'Salary Tracker' }} />
            <Stack.Screen name="AdminSalaryTrackerDetail" component={AdminSalaryTrackerDetailScreen} options={{ title: 'Salary Detail' }} />
            <Stack.Screen name="AdminDailyTasksScreen" component={AdminDailyTasksScreen} options={{ headerShown: false }} />

            <Stack.Screen name="EmployeeOnboardingList" component={EmployeeOnboardingListScreen} options={{ title: 'Employee Onboarding' }} />
            <Stack.Screen name="EmployeeOnboardingDetail" component={EmployeeOnboardingDetailScreen} options={{ title: 'Onboarding Request' }} />
            <Stack.Screen name="CreateOnboardingInvitation" component={CreateOnboardingInvitationScreen} options={{ title: 'New Invitation' }} />
        </Stack.Navigator>
    );
};

export default AdminNavigator;
