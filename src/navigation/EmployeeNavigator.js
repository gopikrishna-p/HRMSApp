import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import Employee Screens
import CheckInOutScreen from '../screens/employee/CheckInOutScreen';
import AttendanceHistoryScreen from '../screens/employee/AttendanceHistoryScreen';
import WFHRequestScreen from '../screens/employee/WFHRequestScreen';
import OnSiteRequestScreen from '../screens/employee/OnSiteRequestScreen';
import HolidayListScreen from '../screens/employee/HolidayListScreen';
import LeaveApplicationScreen from '../screens/employee/LeaveApplicationScreen';
import CompensatoryLeaveScreen from '../screens/employee/CompensatoryLeaveScreen';
import ExpenseClaimScreen from '../screens/employee/ExpenseClaimScreen';
import TravelRequestScreen from '../screens/employee/TravelRequestScreen';

import MyProjectsScreen from '../screens/employee/MyProjectsScreen';
import MyLogsScreen from '../screens/employee/MyLogsScreen';

import SalaryStructureScreen from '../screens/employee/SalaryStructureScreen';
import PayslipScreen from '../screens/employee/PayslipScreen';
import MySalaryTrackerScreen from '../screens/employee/MySalaryTrackerScreen';
import SalaryTrackerDetailScreen from '../screens/employee/SalaryTrackerDetailScreen';
import NotificationsScreen from '../screens/employee/NotificationsScreen';
import ProfileScreen from '../screens/employee/ProfileScreen';
import EmployeeDashboard from '../screens/employee/EmployeeDashboard';
import MyTasksScreen from '../screens/employee/MyTasksScreen';
import DailyTasksScreen from '../screens/employee/DailyTasksScreen';

const Stack = createNativeStackNavigator();

const EmployeeNavigator = () => {
    return (
        <Stack.Navigator
            initialRouteName="EmployeeDashboard"
            screenOptions={{
                headerStyle: { backgroundColor: '#FFFFFF' },
                headerTintColor: '#101828',
                headerTitleAlign: 'center',
                headerTitleStyle: { fontSize: 17, fontWeight: '600', color: '#101828' },
                headerShadowVisible: false,
                headerBackTitleVisible: false,
                contentStyle: { backgroundColor: '#F4F5F7' },
            }}
        >
            {/* Dashboard draws its own top bar */}
            <Stack.Screen
                name="EmployeeDashboard"
                component={EmployeeDashboard}
                options={{ headerShown: false }}
            />

            <Stack.Screen name="CheckInOut" component={CheckInOutScreen} options={{ title: 'Check In / Out' }} />
            <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={{ title: 'Attendance' }} />
            <Stack.Screen name="WFHRequest" component={WFHRequestScreen} options={{ title: 'Work From Home' }} />
            <Stack.Screen name="OnSiteRequest" component={OnSiteRequestScreen} options={{ title: 'On-Site' }} />

            <Stack.Screen name="HolidayList" component={HolidayListScreen} options={{ title: 'Holidays' }} />
            <Stack.Screen name="LeaveApplication" component={LeaveApplicationScreen} options={{ title: 'Leave' }} />
            <Stack.Screen name="CompensatoryLeave" component={CompensatoryLeaveScreen} options={{ title: 'Comp-Off' }} />

            <Stack.Screen name="ExpenseClaim" component={ExpenseClaimScreen} options={{ title: 'Expense Claims' }} />
            <Stack.Screen name="TravelRequest" component={TravelRequestScreen} options={{ title: 'Travel' }} />

            <Stack.Screen name="MyProjectsScreen" component={MyProjectsScreen} options={{ title: 'My Projects' }} />
            <Stack.Screen name="MyTasksScreen" component={MyTasksScreen} options={{ title: 'Tasks' }} />
            <Stack.Screen name="MyLogsScreen" component={MyLogsScreen} options={{ title: 'Work Logs' }} />
            <Stack.Screen name="DailyTasksScreen" component={DailyTasksScreen} options={{ title: 'Daily Tasks' }} />

            <Stack.Screen name="SalaryStructure" component={SalaryStructureScreen} options={{ title: 'Salary Structure' }} />
            <Stack.Screen name="Payslip" component={PayslipScreen} options={{ title: 'Payslips' }} />
            <Stack.Screen name="MySalaryTracker" component={MySalaryTrackerScreen} options={{ title: 'Salary Payments' }} />
            <Stack.Screen name="SalaryTrackerDetail" component={SalaryTrackerDetailScreen} options={{ title: 'Salary Detail' }} />

            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
        </Stack.Navigator>
    );
};

export default EmployeeNavigator;
