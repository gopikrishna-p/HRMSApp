import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, View, Image, StyleSheet, Text } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

// Import Admin Screens
import AdminDashboard from '../screens/admin/AdminDashboard';
import EmployeeManagement from '../screens/admin/EmployeeManagement';
import AttendanceManagementScreen from '../screens/admin/AttendanceManagementScreen';
import ReportsScreen from '../screens/admin/ReportsScreen';

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

const AdminNavigator = () => {
    return (
        <Stack.Navigator
            initialRouteName="AdminDashboard"
            screenOptions={({ navigation, route }) => ({
                headerStyle: styles.header,
                headerTintColor: '#111827',
                headerTitleAlign: 'center',
                headerShadowVisible: true,
                headerTitle: () => (
                    <HeaderTitle
                        title={route.params?.title || route.name}
                        showLogo={route.name === 'AdminDashboard'}
                    />
                ),
                headerLeft: () => (
                    <HeaderLeft
                        navigation={navigation}
                        canGoBack={route.name !== 'AdminDashboard'}
                    />
                ),
            })}
        >
            <Stack.Screen
                name="AdminDashboard"
                component={AdminDashboard}
                options={{
                    title: 'Admin Dashboard',
                    headerLeft: () => null,
                }}
            />
            {/* <Stack.Screen
                name="EmployeeManagement"
                component={EmployeeManagement}
                options={{
                    title: 'Employee Management',
                    headerTitleStyle: styles.screenTitle,
                }}
            />
            <Stack.Screen
                name="AttendanceManagement"
                component={AttendanceManagementScreen}
                options={{
                    title: 'Attendance Management',
                    headerTitleStyle: styles.screenTitle,
                }}
            />
            <Stack.Screen
                name="Reports"
                component={ReportsScreen}
                options={{
                    title: 'Reports & Analytics',
                    headerTitleStyle: styles.screenTitle,
                }}
            /> */}
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

export default AdminNavigator;