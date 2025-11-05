import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, View, Image, StyleSheet, Text } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

// Import Employee Screens
import CheckInOutScreen from '../screens/employee/CheckInOutScreen';
import AttendanceHistoryScreen from '../screens/employee/AttendanceHistoryScreen';
import AttendanceScreen from '../screens/employee/AttendanceScreen';
import WFHRequestScreen from '../screens/employee/WFHRequestScreen';
import HolidayListScreen from '../screens/employee/HolidayListScreen';
import LeaveApplicationScreen from '../screens/employee/LeaveApplicationScreen';
import LeavesScreen from '../screens/employee/LeavesScreen';
import CompensatoryLeaveScreen from '../screens/employee/CompensatoryLeaveScreen';
import ExpenseClaimScreen from '../screens/employee/ExpenseClaimScreen';
import TravelRequestScreen from '../screens/employee/TravelRequestScreen';

import MyProjectsScreen from '../screens/employee/MyProjectsScreen';
import MyLogsScreen from '../screens/employee/MyLogsScreen';

import SalaryStructureScreen from '../screens/employee/SalaryStructureScreen';
import PayslipScreen from '../screens/employee/PayslipScreen';
import NotificationsScreen from '../screens/employee/NotificationsScreen';
import ProfileScreen from '../screens/employee/ProfileScreen';
import EmployeeDashboard from '../screens/employee/EmployeeDashboard';
import MyTasksScreen from '../screens/employee/MyTasksScreen';

const Stack = createNativeStackNavigator();

const EmployeeNavigator = () => {
    return (
        <Stack.Navigator
            initialRouteName="EmployeeDashboard"
            screenOptions={{
                headerStyle: { backgroundColor: '#FFFFFF' },
                headerTintColor: '#111827',
                headerTitleAlign: 'center',
                headerShadowVisible: true,
            }}
        >
            {/* Dashboard renders its own <AppHeader/> */}
            <Stack.Screen
                name="EmployeeDashboard"
                component={EmployeeDashboard}
                options={{ headerShown: false }}
            />

            
            <Stack.Screen name="CheckInOut" component={CheckInOutScreen} options={{ title: 'Check In/Out' }} />
            <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={{ title: 'Attendance History' }} />
            <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'My Attendance' }} />
            <Stack.Screen name="WFHRequest" component={WFHRequestScreen} options={{ title: 'WFH Request' }} />

            <Stack.Screen name="HolidayList" component={HolidayListScreen} options={{ title: 'Holiday List' }} />
            <Stack.Screen name="LeaveApplication" component={LeaveApplicationScreen} options={{ title: 'Apply Leave' }} />
            <Stack.Screen name="Leaves" component={LeavesScreen} options={{ title: 'My Leaves' }} />
            <Stack.Screen name="CompensatoryLeave" component={CompensatoryLeaveScreen} options={{ title: 'Comp-Off Request' }} />

            <Stack.Screen name="ExpenseClaim" component={ExpenseClaimScreen} options={{ title: 'Expense Claim' }} />
            <Stack.Screen name="TravelRequest" component={TravelRequestScreen} options={{ title: 'Travel Request' }} />

            <Stack.Screen name="MyProjectsScreen" component={MyProjectsScreen} options={{ title: 'My Projects' }} />
            <Stack.Screen name="MyTasksScreen" component={MyTasksScreen} options={{ title: 'Tasks' }} />
            <Stack.Screen name="MyLogsScreen" component={MyLogsScreen} options={{ title: 'My Tasks Logs' }} />

            <Stack.Screen name="SalaryStructure" component={SalaryStructureScreen} options={{ title: 'Salary Structure' }} />
            <Stack.Screen name="Payslip" component={PayslipScreen} options={{ title: 'Payslips' }} />

            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'My Profile' }} />
        </Stack.Navigator>
    );
};

export default EmployeeNavigator;