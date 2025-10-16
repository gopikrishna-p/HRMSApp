import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, View, Image, StyleSheet, Text } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

// Import Employee Screens
import HomeScreen from '../screens/employee/EmployeeDashboard';
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
import MyTasksScreen from '../screens/employee/MyTasksScreen';
import TasksScreen from '../screens/employee/TasksScreen';
import SalaryStructureScreen from '../screens/employee/SalaryStructureScreen';
import PayslipScreen from '../screens/employee/PayslipScreen';
import NotificationsScreen from '../screens/employee/NotificationsScreen';
import ProfileScreen from '../screens/employee/ProfileScreen';
import EmployeeDashboard from '../screens/employee/EmployeeDashboard';

const Stack = createNativeStackNavigator();

const HeaderTitle = ({ title, showLogo = false }) => (
    <View style={styles.headerTitleContainer}>
        {showLogo ? (
            <View style={styles.logoContainer}>
                <Image 
                    source={require('../assets/images/mainLogo.jpg')} 
                    style={styles.logo} 
                />
            </View>
        ) : (
            <View style={styles.titleContainer}>
                <Text style={styles.headerTitleText}>{title}</Text>
            </View>
        )}
    </View>
);

const HeaderLeft = ({ navigation, canGoBack = true }) => {
    if (!canGoBack) return null;

    return (
        <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
        >
            <Icon name="arrow-left" size={18} color="#6366F1" />
        </TouchableOpacity>
    );
};

const EmployeeNavigator = () => {
    return (
        <Stack.Navigator
            initialRouteName="EmployeeDashboard"
            screenOptions={({ navigation, route }) => ({
                headerStyle: styles.header,
                headerTintColor: '#111827',
                headerTitleAlign: 'center',
                headerShadowVisible: true,
                headerTitle: () => (
                    <HeaderTitle
                        title={route.params?.title || route.name}
                        showLogo={route.name === 'EmployeeDashboard'}
                    />
                ),
                headerLeft: () => (
                    <HeaderLeft
                        navigation={navigation}
                        canGoBack={route.name !== 'EmployeeDashboard'}
                    />
                ),
            })}
        >
            {/* Main Dashboard */}
            <Stack.Screen
                name="EmployeeDashboard"
                component={EmployeeDashboard}
                options={{
                    title: 'Home',
                    headerLeft: () => null,
                }}
            />

            {/* Attendance Module */}
            <Stack.Screen
                name="CheckInOut"
                component={CheckInOutScreen}
                options={{ title: 'Check In/Out' }}
            />
            <Stack.Screen
                name="AttendanceHistory"
                component={AttendanceHistoryScreen}
                options={{ title: 'Attendance History' }}
            />
            <Stack.Screen
                name="Attendance"
                component={AttendanceScreen}
                options={{ title: 'My Attendance' }}
            />
            <Stack.Screen
                name="WFHRequest"
                component={WFHRequestScreen}
                options={{ title: 'WFH Request' }}
            />

            {/* Leave Module */}
            <Stack.Screen
                name="HolidayList"
                component={HolidayListScreen}
                options={{ title: 'Holiday List' }}
            />
            <Stack.Screen
                name="LeaveApplication"
                component={LeaveApplicationScreen}
                options={{ title: 'Apply Leave' }}
            />
            <Stack.Screen
                name="Leaves"
                component={LeavesScreen}
                options={{ title: 'My Leaves' }}
            />
            <Stack.Screen
                name="CompensatoryLeave"
                component={CompensatoryLeaveScreen}
                options={{ title: 'Comp-Off Request' }}
            />

            {/* Expense & Travel Module */}
            <Stack.Screen
                name="ExpenseClaim"
                component={ExpenseClaimScreen}
                options={{ title: 'Expense Claim' }}
            />
            <Stack.Screen
                name="TravelRequest"
                component={TravelRequestScreen}
                options={{ title: 'Travel Request' }}
            />

            {/* Projects & Tasks Module */}
            <Stack.Screen
                name="MyProjects"
                component={MyProjectsScreen}
                options={{ title: 'My Projects' }}
            />
            <Stack.Screen
                name="MyTasks"
                component={MyTasksScreen}
                options={{ title: 'My Tasks' }}
            />
            <Stack.Screen
                name="Tasks"
                component={TasksScreen}
                options={{ title: 'Tasks' }}
            />

            {/* Payroll Module */}
            <Stack.Screen
                name="SalaryStructure"
                component={SalaryStructureScreen}
                options={{ title: 'Salary Structure' }}
            />
            <Stack.Screen
                name="Payslip"
                component={PayslipScreen}
                options={{ title: 'Payslips' }}
            />

            {/* Notifications & Profile */}
            <Stack.Screen
                name="Notifications"
                component={NotificationsScreen}
                options={{ title: 'Notifications' }}
            />
            <Stack.Screen
                name="Profile"
                component={ProfileScreen}
                options={{ title: 'My Profile' }}
            />
        </Stack.Navigator>
    );
};

const styles = StyleSheet.create({
    header: {
        backgroundColor: '#FFFFFF',
        height: 80,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    headerTitleContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 120,
        height: 40,
        resizeMode: 'contain',
    },
    titleContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        textAlign: 'center',
    },
    screenTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    headerButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
});

export default EmployeeNavigator;