export const APP_NAME = 'HRMS DeepGrid';

export const STORAGE_KEYS = {
    AUTH_TOKEN: '@auth_token',
    USER_DATA: '@user_data',
    EMPLOYEE_DATA: '@employee_data',
    FCM_TOKEN: '@fcm_token',
};

export const USER_ROLES = {
    ADMIN: ['System Manager', 'HR Manager', 'HR User'],
    EMPLOYEE: ['Employee'],
};

export const ROUTES = {
    // Auth
    SPLASH: 'Splash',
    LOGIN: 'Login',
    FORGOT_PASSWORD: 'ForgotPassword',

    // Employee
    EMPLOYEE_HOME: 'EmployeeHome',
    EMPLOYEE_ATTENDANCE: 'EmployeeAttendance',
    EMPLOYEE_TASKS: 'EmployeeTasks',
    EMPLOYEE_LEAVES: 'EmployeeLeaves',
    EMPLOYEE_PROFILE: 'EmployeeProfile',

    // Admin
    ADMIN_DASHBOARD: 'AdminDashboard',
    ADMIN_EMPLOYEES: 'AdminEmployees',
    ADMIN_ATTENDANCE: 'AdminAttendance',
    ADMIN_REPORTS: 'AdminReports',
};