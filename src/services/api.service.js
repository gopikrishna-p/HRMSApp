// src/services/api.service.js
import axios from 'axios';

/**
 * Frappe REST rules:
 *  - Python @frappe.whitelist def foo(): -> /api/method/<module>.foo
 *  - DocType REST: /api/resource/<doctype>
 *  - Must send cookies: withCredentials = true
 */

const BASE_URL = process.env.BASE_URL || 'https://hr.deepgrid.in';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT || '30000', 10);

// Helper to build /api/method/hrms.api.<name>
const m = (name) => `/api/method/hrms.api.${name}`;

/**
 * Helper to extract data from Frappe API responses.
 * Handles nested response structures consistently.
 * 
 * Frappe whitelist functions wrap returns in 'message' key.
 * If backend also wraps in {success, data: {message: ...}}, we extract properly.
 * 
 * @param {object} response - The axios response object from ApiService
 * @param {any} defaultValue - Default value if extraction fails
 * @returns {any} Extracted data or default value
 */
export const extractFrappeData = (response, defaultValue = null) => {
    if (!response || !response.success) {
        return defaultValue;
    }
    
    // Level 1: response.data.message (Frappe's standard wrapper)
    let data = response.data?.message;
    
    if (data === undefined || data === null) {
        // Some APIs return data directly without message wrapper
        data = response.data;
    }
    
    // Level 2: Check if backend wrapped with {success, data: {message: ...}}
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        // Check if it's a custom backend response wrapper
        if (data.success !== undefined && data.data?.message !== undefined) {
            return data.data.message;
        }
        // Check if it has a 'data' key with actual content
        if (data.data !== undefined && data.message === undefined) {
            return data.data;
        }
        // Check for status-based responses from backend
        if (data.status === 'success' && data.data !== undefined) {
            return data.data;
        }
    }
    
    return data ?? defaultValue;
};

/**
 * Helper to check if API response indicates success.
 * Handles both interceptor success and backend success flags.
 * 
 * @param {object} response - The axios response object from ApiService
 * @returns {boolean} True if both HTTP and backend indicate success
 */
export const isApiSuccess = (response) => {
    if (!response || !response.success) {
        return false;
    }
    
    // Check backend success indicators in response.data.message
    const message = response.data?.message;
    if (message && typeof message === 'object') {
        // If backend returns {success: false, ...}, return false
        if (message.success === false) {
            return false;
        }
        // If backend returns {status: 'error', ...}, return false
        if (message.status === 'error') {
            return false;
        }
    }
    
    return true;
};

/**
 * Get error message from API response.
 * 
 * @param {object} response - The axios response object from ApiService
 * @param {string} defaultMsg - Default message if none found
 * @returns {string} Error message
 */
export const getApiErrorMessage = (response, defaultMsg = 'An error occurred') => {
    if (!response) {
        return defaultMsg;
    }
    
    // Check various locations for error messages
    const message = response.data?.message;
    if (typeof message === 'string') {
        return message;
    }
    if (message?.message) {
        return message.message;
    }
    if (message?.error) {
        return message.error;
    }
    if (response.message) {
        return response.message;
    }
    
    return defaultMsg;
};

// Optional: centralise GET with params.body for POST-like GETs, if needed
class ApiService {
    constructor() {
        this.api = axios.create({
            baseURL: BASE_URL,
            timeout: API_TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            withCredentials: true,
        });

        // Request interceptor
        this.api.interceptors.request.use(
            (config) => {
                // You can attach CSRF token here if needed:
                // const token = getCookie('sid'); // Frappe session cookie
                // if (token) config.headers['X-Frappe-CSRF-Token'] = token;
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Response interceptor
        this.api.interceptors.response.use(
            (response) => ({
                success: true,
                data: response.data,
                status: response.status,
            }),
            (error) => {
                const rawMessage =
                    error.response?.data?._error_message ||
                    error.response?.data?.message ||
                    error.message;
                // Strip HTML tags from error messages for clean display
                const cleanMessage = typeof rawMessage === 'string'
                    ? rawMessage.replace(/<[^>]+>/g, '')
                    : rawMessage;
                const payload = {
                    success: false,
                    status: error.response?.status,
                    message: cleanMessage,
                    data: error.response?.data,
                };
                return payload; // NOTE: not rejecting — callers check success flag
            }
        );
    }

    // Generic verbs
    get(endpoint, params = {}) {
        return this.api.get(endpoint, { params });
    }

    post(endpoint, data = {}) {
        return this.api.post(endpoint, data);
    }

    put(endpoint, data = {}) {
        return this.api.put(endpoint, data);
    }

    delete(endpoint) {
        return this.api.delete(endpoint);
    }

    getBaseURL() {
        return BASE_URL;
    }

    /* -------------------------
     * AUTH / USER
     * -----------------------*/
    login({ usr, pwd }) {
        return this.post('/api/method/login', { usr, pwd });
    }

    logout() {
        return this.post('/api/method/logout');
    }

    getCurrentUser() {
        return this.get(m('get_current_user_info'));
    }

    getCurrentEmployee() {
        return this.get(m('get_current_employee_info'));
    }

    /* -------------------------
     * EMPLOYEES / ADMIN
     * -----------------------*/
    getAllEmployees() {
        return this.get(m('get_all_employees'));
    }

    getEmployeeCount() {
        // You had this twice in Python; both names mapped to same method name
        return this.get(m('get_employee_count'));
    }

    getDepartments() {
        return this.get(m('get_departments_list'));
    }

    /* -------------------------
     * NOTIFICATIONS
     * -----------------------*/
    getUnreadNotificationCount() {
        return this.get(m('get_unread_notifications_count'));
    }

    markAllNotificationsRead() {
        return this.post(m('mark_all_notifications_as_read'));
    }

    arePushNotificationsEnabled() {
        return this.get(m('are_push_notifications_enabled'));
    }

    saveFcmToken({ token, device_type }) {
        return this.post(m('save_fcm_token'), { token, device_type });
    }

    sendAdminNotification({ docname }) {
        return this.post(m('send_admin_notification'), { docname });
    }

    // New notification APIs
    sendAdminBroadcast({ title, body, target_type, target_ids, department_id }) {
        return this.post(m('send_admin_broadcast'), { 
            title, 
            body, 
            target_type, 
            target_ids, 
            department_id 
        });
    }

    createNotification({ title, message, target_type, target_employees, department }) {
        return this.post(m('create_notification'), {
            title,
            message,
            target_type,
            target_employees,
            department
        });
    }

    sendWFHNotification(requestData) {
        return this.post(m('send_wfh_notification'), requestData);
    }

    getNotificationSettings() {
        return this.get(m('get_notification_settings'));
    }

    updateNotificationSettings(settings) {
        return this.post(m('update_notification_settings'), settings);
    }

    /* -------------------------
     * GEO / ATTENDANCE (Employee)
     * -----------------------*/
    getOfficeLocation({ employee }) {
        return this.get(m('get_office_location'), { employee });
    }

    getUserWfhInfo() {
        return this.get(m('get_user_wfh_info'));
    }

    getWFHRequests() {
        return this.get(m('get_wfh_requests'));
    }

    getPendingWFHRequests() {
        return this.get(m('get_pending_wfh_requests'));
    }

    getAllWFHRequestsForAdmin() {
        // Get all WFH requests for admin (pending, approved, rejected)
        return this.get(m('get_all_wfh_requests_admin'));
    }

    submitWFHRequest(requestData) {
        return this.post(m('submit_wfh_request'), requestData);
    }

    deleteWFHRequest(requestId) {
        return this.post(m('delete_wfh_request'), { 
            request_id: requestId 
        });
    }

    approveWFHRequest(requestId) {
        return this.post(m('wfh_request_action'), { 
            request_id: requestId, 
            action: 'approve' 
        });
    }

    rejectWFHRequest(requestId) {
        return this.post(m('wfh_request_action'), { 
            request_id: requestId, 
            action: 'reject' 
        });
    }

    enableWFHForEmployee(employeeId) {
        return this.post(m('enable_wfh_for_employee'), { 
            employee_id: employeeId 
        });
    }

    // On Site APIs
    getOnSiteRequests() {
        return this.get(m('get_on_site_requests'));
    }

    getPendingOnSiteRequests() {
        return this.get(m('get_pending_on_site_requests'));
    }

    getAllOnSiteRequestsForAdmin() {
        return this.get(m('get_all_on_site_requests_admin'));
    }

    submitOnSiteRequest(requestData) {
        return this.post(m('submit_on_site_request'), requestData);
    }

    deleteOnSiteRequest(requestId) {
        return this.post(m('delete_on_site_request'), { 
            request_id: requestId 
        });
    }

    approveOnSiteRequest(requestId) {
        return this.post(m('on_site_request_action'), { 
            request_id: requestId, 
            action: 'approve' 
        });
    }

    rejectOnSiteRequest(requestId) {
        return this.post(m('on_site_request_action'), { 
            request_id: requestId, 
            action: 'reject' 
        });
    }

    enableOnSiteForEmployee(employeeId) {
        return this.post(m('enable_on_site_for_employee'), { 
            employee_id: employeeId 
        });
    }

    geoAttendance({ employee, action, latitude, longitude, work_type }) {
        // action: "Check-In" | "Check-Out"
        return this.post(m('geo_attendance'), {
            employee,
            action,
            latitude,
            longitude,
            work_type,
        });
    }

    /* -------------------------
     * ATTENDANCE (Admin)
     * -----------------------*/
    getTodayAttendance({ date }) {
        return this.get(m('get_today_attendance'), { date });
    }

    getAttendanceByDate({ date, employee_id, department }) {
        return this.get(m('get_attendance_by_date'), { date, employee_id, department });
    }

    getAttendanceRecordsForDate({ date }) {
        return this.get(m('get_attendance_records_for_date'), { date });
    }

    getAttendanceRecords({ employee, start_date, end_date }) {
        return this.get(m('get_attendance_records'), { employee, start_date, end_date });
    }

    getHolidays({ start_date, end_date }) {
        return this.get(m('get_holidays'), { start_date, end_date });
    }

    /**
     * Get holidays for employee from their holiday list
     * Uses: get_holidays_for_employee from backend (line ~1166)
     * @param {string} employee - Employee ID
     * @returns {Promise} Response with array of holidays
     */
    getHolidaysForEmployee(employee) {
        return this.get(m('get_holidays_for_employee'), { employee });
    }

    /**
     * Get comprehensive employee holidays with statistics (NEW API)
     * Uses: get_employee_holidays from backend
     * @param {string} employee - Employee ID (optional, defaults to current user)
     * @param {string} year - Year filter (optional, e.g., "2025")
     * @returns {Promise} Response with holidays, statistics, and grouped data
     */
    getEmployeeHolidays(employee = null, year = null) {
        const params = {};
        if (employee) params.employee = employee;
        if (year) params.year = year;
        return this.get(m('get_employee_holidays'), params);
    }

    getLeaveApplications({ employee }) {
        return this.get(m('get_leave_applications'), { employee });
    }

    manualCheckout({ attendance_id, checkout_time }) {
        return this.post(m('manual_checkout'), { attendance_id, checkout_time });
    }

    getPendingCheckouts({ date }) {
        return this.get(m('get_pending_checkouts'), { date });
    }

    updateAttendanceTimes({ attendance_id, check_in_time, check_out_time }) {
        return this.post(m('update_attendance_times'), {
            attendance_id,
            check_in_time,
            check_out_time,
        });
    }

    bulkManualCheckout({ attendance_ids, default_checkout_time }) {
        return this.post(m('bulk_manual_checkout'), {
            attendance_ids,
            default_checkout_time,
        });
    }

    bulkUpdateAttendanceTimes({ attendance_updates }) {
        return this.post(m('bulk_update_attendance_times'), { attendance_updates });
    }

    deleteAttendanceRecord({ attendance_id, reason }) {
        return this.post(m('delete_attendance_record'), { attendance_id, reason });
    }

    getAttendanceStatisticsForDate({ date }) {
        return this.get(m('get_attendance_statistics_for_date'), { date });
    }

    /* -------------------------
     * ANALYTICS / REPORTS
     * -----------------------*/
    getAttendanceAnalytics(period = 'week') {
        return this.get(m('get_attendance_analytics'), { period });
    }

    getAttendanceAnalyticsByRange({ start_date, end_date, department, employee_id }) {
        return this.get(m('get_attendance_analytics_by_date_range'), {
            start_date,
            end_date,
            department,
            employee_id,
        });
    }

    getEmployeeStatistics() {
        return this.get(m('get_employee_statistics'));
    }

    getDepartmentStatistics() {
        return this.get(m('get_department_statistics'));
    }

    getAbsentEmployeesList() {
        return this.get(m('get_absent_employees_list'));
    }

    getLateArrivalsList() {
        return this.get(m('get_late_arrivals_list'));
    }

    exportAttendanceReport({
        employee_id,
        start_date,
        end_date,
        export_format = 'pdf',
        department,
    }) {
        return this.post(m('export_attendance_report'), {
            employee_id,
            start_date,
            end_date,
            export_format,
            department,
        });
    }

    /* -------------------------
     * LEAVES / HOLIDAYS / SHIFTS
     * -----------------------*/
    getLeaveApplications({ employee, for_approval = false, include_balances = false } = {}) {
        return this.get(m('get_leave_applications'), { employee, for_approval, include_balances });
    }

    createLeaveApplication(payload) {
        // {employee, leave_type, from_date, to_date, half_day, half_day_date, description, leave_approver}
        return this.post(m('create_leave_application'), payload);
    }

    getLeaveBalanceMap({ employee }) {
        return this.get(m('get_leave_balance_map'), { employee });
    }

    getHolidays({ start_date, end_date }) {
        return this.get(m('get_holidays'), { start_date, end_date });
    }

    getShiftAssignments({ employee, start_date, end_date }) {
        return this.get(m('get_shift_assignments'), { employee, start_date, end_date });
    }

    /**
     * Get attendance history for a specific employee with date range
     * @param {Object} params - {employee_id, start_date, end_date}
     * @returns {Promise} Response with attendance records and summary stats
     */
    getEmployeeAttendanceHistory({ employee_id, start_date, end_date }) {
        return this.get(m('get_employee_attendance_history'), {
            employee_id,
            start_date,
            end_date,
        });
    }

    /**
   * Get all employees attendance summary
   * @param {Object} params - {start_date, end_date, department}
   * @returns {Promise} Response with summary data for all employees
   */
    getAllEmployeesAttendanceSummary({ start_date, end_date, department }) {
        return this.get(m('get_all_employees_attendance_summary'), {
            start_date,
            end_date,
            department,
        });
    }

    /**
 * Export all employees attendance report
 * @param {Object} params - {start_date, end_date, format, department}
 * @returns {Promise} Response with file download info
 */
    exportAllEmployeesReport({ start_date, end_date, format = 'pdf', department }) {
        return this.post(m('export_all_employees_attendance'), {
            start_date,
            end_date,
            export_format: format,
            department,
        });
    }



    /**
  * Get employee attendance analytics
  * @param {Object} params - {employee_id, start_date, end_date}
  * @returns {Promise} Response with analytics data
  */
    getEmployeeAttendanceAnalytics({ employee_id, start_date, end_date }) {
        return this.get(m('get_employee_attendance_analytics'), {
            employee_id,
            start_date,
            end_date,
        });
    }

    /**
     * Get comprehensive employee analytics (NEW)
     * Single API call for all dashboard metrics
     * @param {Object} params - {employee, from_date, to_date, period}
     * @returns {Promise} Response with complete analytics including attendance, leave, expense, travel, projects, performance
     */
    getEmployeeAnalytics(params = {}) {
        return this.get(m('get_employee_analytics'), {
            employee: params.employee || null,
            from_date: params.from_date || null,
            to_date: params.to_date || null,
            period: params.period || 'current_month'
        });
    }

    /* -------------------------
     * LEAVE MANAGEMENT - COMPREHENSIVE APIs
     * Based on hrms.api leave management documentation
     * -----------------------*/
    
    // ===== EMPLOYEE LEAVE APIs =====
    
    /**
     * Submit a new leave application (Enhanced)
     * Uses: submit_leave_application from line ~613 in backend
     * @param {Object} leaveData - Leave application data
     * @returns {Promise} Response with application details and updated balance
     */
    submitLeave(leaveData) {
        return this.post(m('submit_leave_application'), {
            employee: leaveData.employee,
            leave_type: leaveData.leave_type,
            from_date: leaveData.from_date,
            to_date: leaveData.to_date,
            half_day: leaveData.half_day || 0,
            half_day_date: leaveData.half_day_date || null,
            description: leaveData.description || '',
            leave_approver: leaveData.leave_approver || null
        });
    }

    /**
     * Get employee's own leave applications with filters
     * Uses: get_employee_leave_applications from backend
     * @param {Object} filters - {from_date, to_date, status_filter, leave_type, limit}
     * @returns {Promise} Response with applications list and summary
     */
    getMyLeaves(filters = {}) {
        return this.get(m('get_employee_leave_applications'), {
            employee: filters.employee || null, // Optional - defaults to current user
            from_date: filters.from_date || null,
            to_date: filters.to_date || null,
            status_filter: filters.status || null, // 'Open', 'Approved', 'Rejected', 'Cancelled'
            leave_type: filters.leave_type || null,
            limit: filters.limit || 100
        });
    }

    /**
     * Cancel employee's own leave application
     * Uses: cancel_leave_application from backend
     * @param {string} applicationId - Leave Application ID
     * @param {string} reason - Cancellation reason
     * @returns {Promise} Response with updated balance
     */
    cancelMyLeave(applicationId, reason) {
        return this.post(m('cancel_leave_application'), {
            application_id: applicationId,
            reason: reason || ''
        });
    }

    // ===== ADMIN LEAVE APIs =====
    
    /**
     * Approve leave application (Admin/Approver)
     * Uses: approve_leave_application from backend
     * @param {string} applicationId - Leave Application ID
     * @param {string} remarks - Optional approval remarks
     * @returns {Promise} Response with updated status and balance
     */
    approveLeave(applicationId, remarks = '') {
        return this.post(m('approve_leave_application'), {
            application_id: applicationId,
            remarks: remarks
        });
    }

    /**
     * Reject leave application (Admin/Approver)
     * Uses: reject_leave_application from backend
     * @param {string} applicationId - Leave Application ID
     * @param {string} reason - Rejection reason (required)
     * @returns {Promise} Response with updated status
     */
    rejectLeave(applicationId, reason) {
        return this.post(m('reject_leave_application'), {
            application_id: applicationId,
            reason: reason
        });
    }

    /**
     * Get all leave applications for admin with advanced filters
     * Uses: get_admin_leave_applications from backend
     * @param {Object} filters - {department, employee, from_date, to_date, status_filter, leave_type, limit}
     * @returns {Promise} Response with applications and statistics
     */
    getAllLeaves(filters = {}) {
        return this.get(m('get_admin_leave_applications'), {
            department: filters.department || null,
            employee: filters.employee || null,
            from_date: filters.from_date || null,
            to_date: filters.to_date || null,
            status_filter: filters.status || null,
            leave_type: filters.leave_type || null,
            limit: filters.limit || 500
        });
    }

    getLeaveStatistics(department = null) {
        return this.get(m('get_leave_statistics'), { department });
    }

    getEmployeeShiftInfo(employee_id = null) {
        return this.get(m('get_employee_shift_info'), { employee_id });
    }

    /**
     * Admin submits leave application for any employee
     * Uses: admin_submit_leave_application from backend
     * @param {Object} leaveData - Leave application data
     * @returns {Promise} Response with application details
     */
    adminSubmitLeave(leaveData) {
        return this.post(m('admin_submit_leave_application'), {
            employee: leaveData.employee,
            leave_type: leaveData.leave_type,
            from_date: leaveData.from_date,
            to_date: leaveData.to_date,
            half_day: leaveData.half_day || 0,
            half_day_date: leaveData.half_day_date || null,
            description: leaveData.description || '',
            leave_approver: leaveData.leave_approver || null,
            auto_approve: leaveData.auto_approve || 0
        });
    }

    /**
     * Get leave balance for any employee (Admin use)
     * Uses: get_leave_balance_for_employee from backend
     * @param {string} employee - Employee ID
     * @returns {Promise} Response with leave balances
     */
    getEmployeeLeaveBalance(employee) {
        return this.get(m('get_leave_balance_for_employee'), {
            employee: employee
        });
    }

    /**
     * Get leave types for any employee (Admin use)
     * Uses: get_leave_types_for_employee from backend
     * @param {string} employee - Employee ID
     * @param {string} date - Optional date
     * @returns {Promise} Response with leave types
     */
    getEmployeeLeaveTypes(employee, date = null) {
        return this.get(m('get_leave_types_for_employee'), {
            employee: employee,
            date: date
        });
    }

    /**
     * Get pending leave count for admin dashboard
     * Uses: get_pending_leave_count from backend
     * @returns {Promise} Response with pending count
     */
    getPendingLeaveCount() {
        return this.get(m('get_pending_leave_count'));
    }

    // ===== EXISTING/LEGACY APIs (Kept for compatibility) =====

    /**
     * Get leave balance map for employee
     * Uses: get_leave_balance_map from backend (line ~496)
     * @param {string} employee - Employee ID
     * @returns {Promise} Response with leave balances by type
     */
    getLeaveBalances(employee) {
        return this.get(m('get_leave_balance_map'), { 
            employee: employee
        });
    }

    /**
     * Get available leave types for employee
     * Uses: get_leave_types from backend (line ~601)
     * @param {string} employee - Employee ID
     * @param {string} date - Date (YYYY-MM-DD format)
     * @returns {Promise} Response with leave types array
     */
    getLeaveTypes(employee, date) {
        const targetDate = date || new Date().toISOString().split('T')[0];
        return this.get(m('get_leave_types'), { 
            employee: employee,
            date: targetDate
        });
    }

    /**
     * Get leave approval details for employee
     * Uses: get_leave_approval_details from backend (line ~542)
     * @param {string} employee - Employee ID
     * @returns {Promise} Response with approver information
     */
    getLeaveApprovalDetails(employee) {
        return this.get(m('get_leave_approval_details'), {
            employee: employee
        });
    }

    /**
     * Get leave applications (legacy method)
     * Uses: get_leave_applications from backend (line ~350)
     * @param {Object} params - {employee, approver_id, for_approval, limit}
     * @returns {Promise} Response with applications list
     */
    getLeaveApplications(params = {}) {
        return this.get(m('get_leave_applications'), { 
            employee: params.employee || null,
            approver_id: params.approver_id || null,
            for_approval: params.for_approval || false,
            limit: params.limit || null
        });
    }

    /**
     * Get leave history (legacy method)
     * Uses: get_leave_history from backend (line ~400)
     * @param {Object} params - {employee, status_filter, limit}
     * @returns {Promise} Response with historical applications
     */
    getLeaveHistory(params = {}) {
        return this.get(m('get_leave_history'), {
            employee: params.employee || null,
            status_filter: params.status_filter || null,
            limit: params.limit || 500
        });
    }

    /**
     * Get current user's employee ID
     * @returns {Promise} Employee ID
     */
    getUserEmployee() {
        return this.get(m('get_user_wfh_info')).then(response => {
            if (response.success && response.data?.message?.employee_id) {
                return response.data.message.employee_id;
            }
            throw new Error('Employee not found for current user');
        });
    }

    /* -------------------------
     * COMPENSATORY LEAVE REQUEST APIs
     * Based on hrms.api compensatory leave documentation (line ~1147)
     * -----------------------*/
    
    /**
     * Submit compensatory leave request for working on holidays
     * Uses: submit_compensatory_leave_request from backend
     * @param {Object} compLeaveData - Comp leave request data
     * @returns {Promise} Response with request details and status
     */
    submitCompLeave(compLeaveData) {
        return this.post(m('submit_compensatory_leave_request'), {
            employee: compLeaveData.employee,
            work_from_date: compLeaveData.work_from_date,
            work_end_date: compLeaveData.work_end_date,
            reason: compLeaveData.reason,
            leave_type: compLeaveData.leave_type || null,
            half_day: compLeaveData.half_day || 0,
            half_day_date: compLeaveData.half_day_date || null
        });
    }

    /**
     * Approve compensatory leave request (Admin)
     * Uses: approve_compensatory_leave_request from backend
     * @param {string} requestId - Comp Leave Request ID
     * @param {string} remarks - Optional approval remarks
     * @returns {Promise} Response with allocated days and leave allocation
     */
    approveCompLeave(requestId, remarks = '') {
        return this.post(m('approve_compensatory_leave_request'), {
            request_id: requestId,
            remarks: remarks
        });
    }

    /**
     * Reject compensatory leave request (Admin)
     * Uses: reject_compensatory_leave_request from backend
     * @param {string} requestId - Comp Leave Request ID
     * @param {string} reason - Rejection reason (required)
     * @returns {Promise} Response with rejection status
     */
    rejectCompLeave(requestId, reason) {
        return this.post(m('reject_compensatory_leave_request'), {
            request_id: requestId,
            reason: reason
        });
    }

    /**
     * Cancel compensatory leave request
     * Uses: cancel_compensatory_leave_request from backend
     * @param {string} requestId - Comp Leave Request ID
     * @param {string} reason - Cancellation reason
     * @returns {Promise} Response with cancellation status
     */
    cancelCompLeave(requestId, reason = '') {
        return this.post(m('cancel_compensatory_leave_request'), {
            request_id: requestId,
            reason: reason
        });
    }

    /**
     * Get employee's own compensatory leave requests with filters
     * Uses: get_employee_compensatory_requests from backend
     * @param {Object} filters - {employee, from_date, to_date, docstatus, limit}
     * @returns {Promise} Response with requests list and summary
     */
    getMyCompLeaves(filters = {}) {
        return this.get(m('get_employee_compensatory_requests'), {
            employee: filters.employee || null, // Optional - defaults to current user
            from_date: filters.from_date || null,
            to_date: filters.to_date || null,
            docstatus: filters.docstatus !== undefined ? filters.docstatus : null, // 0=Pending, 1=Approved, 2=Cancelled
            limit: filters.limit || 100
        });
    }

    /**
     * Get all compensatory leave requests for admin with filters
     * Uses: get_admin_compensatory_requests from backend
     * @param {Object} filters - {department, employee, from_date, to_date, docstatus, limit}
     * @returns {Promise} Response with requests and statistics
     */
    getAllCompLeaves(filters = {}) {
        return this.get(m('get_admin_compensatory_requests'), {
            department: filters.department || null,
            employee: filters.employee || null,
            from_date: filters.from_date || null,
            to_date: filters.to_date || null,
            docstatus: filters.docstatus !== undefined ? filters.docstatus : null,
            limit: filters.limit || 500
        });
    }


    /* -------------------------
     * EXPENSE CLAIMS
     * -----------------------*/
    
    /**
     * Submit expense claim with multiple expense items
     * @param {string} employee - Employee ID
     * @param {Array} expenses - Array of expense items
     * @param {Object} options - {expense_approver, project, cost_center, remark}
     * @returns {Promise} Response with claim details
     */
    submitExpenseClaim(employee, expenses, options = {}) {
        const params = {
            employee,
            expenses: JSON.stringify(expenses)
        };

        // Add optional parameters as separate fields (backend expects them this way)
        if (options.expense_approver) {
            params.expense_approver = options.expense_approver;
        }
        if (options.project) {
            params.project = options.project;
        }
        if (options.cost_center) {
            params.cost_center = options.cost_center;
        }
        if (options.remark) {
            params.remark = options.remark;
        }

        return this.post(m('submit_expense_claim'), params);
    }

    /**
     * Approve expense claim (Admin/Approver)
     * @param {string} claimId - Expense Claim ID
     * @param {string} remarks - Optional approval remarks
     * @param {object} sanctionedAmounts - Custom sanctioned amounts per expense item
     * @param {string} payableAccount - Payable account for the expense claim
     * @returns {Promise} Response with approval status
     */
    approveExpenseClaim(claimId, remarks = '', sanctionedAmounts = {}, payableAccount = null) {
        const data = {
            claim_id: claimId,
            remarks,
            sanctioned_amounts: sanctionedAmounts
        };
        
        if (payableAccount) {
            data.payable_account = payableAccount;
        }
        
        return this.post(m('approve_expense_claim'), data);
    }

    /**
     * Get list of payable accounts for expense claims (Admin/Approver)
     * @param {string} company - Company name (optional)
     * @returns {Promise} Response with list of payable accounts
     */
    getPayableAccounts(company = null) {
        const params = company ? { company } : {};
        return this.get(m('get_payable_accounts'), params);
    }

    /**
     * Reject expense claim (Admin/Approver)
     * @param {string} claimId - Expense Claim ID
     * @param {string} reason - Rejection reason (required)
     * @returns {Promise} Response with rejection status
     */
    rejectExpenseClaim(claimId, reason) {
        return this.post(m('reject_expense_claim'), {
            claim_id: claimId,
            reason
        });
    }

    /**
     * Get employee's expense claims with filters
     * @param {Object} filters - {employee, from_date, to_date, approval_status, limit}
     * @returns {Promise} Response with claims list and summary
     */
    getEmployeeExpenseClaims(filters = {}) {
        return this.get(m('get_employee_expense_claims'), {
            employee: filters.employee || null,
            from_date: filters.from_date || null,
            to_date: filters.to_date || null,
            approval_status: filters.approval_status || null,
            limit: filters.limit || 100
        });
    }

    /**
     * Get all expense claims for admin with advanced filters
     * @param {Object} filters - {department, employee, from_date, to_date, approval_status, limit}
     * @returns {Promise} Response with claims and statistics
     */
    getAdminExpenseClaims(filters = {}) {
        return this.get(m('get_admin_expense_claims'), {
            department: filters.department || null,
            employee: filters.employee || null,
            from_date: filters.from_date || null,
            to_date: filters.to_date || null,
            approval_status: filters.approval_status || null,
            limit: filters.limit || 500
        });
    }

    /**
     * Get all expense claim types for dropdown
     * @returns {Promise} Array of expense types
     */
    getExpenseClaimTypes() {
        return this.get(m('get_expense_claim_types'));
    }

    /* -------------------------
     * TRAVEL REQUEST APIs - Clean Implementation
     * Based on hrms.api Travel Request documentation (line ~2230+)
     * -----------------------*/
    
    /**
     * Submit new travel request (matches all 31 database fields)
     * Uses: submit_travel_request from backend
     * @param {Object} travelData - Travel request data
     * @returns {Promise} Response with request details and status
     */
    submitTravelRequest(travelData) {
        return this.post(m('submit_travel_request'), {
            employee: travelData.employee,
            travel_type: travelData.travel_type, // "Domestic" or "International"
            purpose_of_travel: travelData.purpose_of_travel, // Link to Purpose of Travel
            description: travelData.description || null,
            travel_funding: travelData.travel_funding || null,
            details_of_sponsor: travelData.details_of_sponsor || null,
            travel_proof: travelData.travel_proof || null, // Attachment URL
            cell_number: travelData.cell_number || null,
            prefered_email: travelData.prefered_email || null,
            personal_id_type: travelData.personal_id_type || null,
            personal_id_number: travelData.personal_id_number || null,
            passport_number: travelData.passport_number || null,
            cost_center: travelData.cost_center || null,
            name_of_organizer: travelData.name_of_organizer || null,
            address_of_organizer: travelData.address_of_organizer || null,
            other_details: travelData.other_details || null
        });
    }

    /**
     * Approve travel request (Admin only)
     * Uses: approve_travel_request from backend
     * @param {string} requestId - Travel Request ID
     * @param {string} remarks - Optional approval remarks
     * @returns {Promise} Response with approval status
     */
    approveTravelRequest(requestId, remarks = '') {
        return this.post(m('approve_travel_request'), {
            request_id: requestId,
            remarks: remarks
        });
    }

    /**
     * Reject travel request (Admin only)
     * Uses: reject_travel_request from backend
     * @param {string} requestId - Travel Request ID
     * @param {string} reason - Rejection reason (required)
     * @returns {Promise} Response with rejection status
     */
    rejectTravelRequest(requestId, reason) {
        return this.post(m('reject_travel_request'), {
            request_id: requestId,
            reason: reason
        });
    }

    /**
     * Get travel requests with filters (employee or admin view)
     * Uses: get_travel_requests from backend
     * For employees: returns their own requests
     * For admins: can see all requests or filter by employee
     * @param {Object} filters - {employee, travel_type, purpose_of_travel, status, from_date, to_date, limit}
     * @returns {Promise} Response with requests list and summary
     */
    getTravelRequests(filters = {}) {
        return this.get(m('get_travel_requests'), {
            employee: filters.employee || null,
            travel_type: filters.travel_type || null, // "Domestic" or "International"
            purpose_of_travel: filters.purpose_of_travel || null,
            status: filters.status || null, // "pending", "approved", "rejected"
            from_date: filters.from_date || null,
            to_date: filters.to_date || null,
            limit: filters.limit || 100
        });
    }

    /**
     * Get detailed information about a specific travel request
     * Uses: get_travel_request_details from backend
     * @param {string} requestId - Travel Request ID
     * @returns {Promise} Response with complete request details and comments
     */
    getTravelRequestDetails(requestId) {
        return this.get(m('get_travel_request_details'), {
            request_id: requestId
        });
    }

    /**
     * Get all available purposes of travel for dropdown
     * Uses: get_purpose_of_travel_list from backend
     * @returns {Promise} Response with array of purpose names
     */
    getPurposeOfTravelList() {
        return this.get(m('get_purpose_of_travel_list'));
    }

    /**
     * Get all travel requests for admin with advanced filters
     * Uses: get_admin_travel_requests from backend
     * @param {Object} filters - {department, employee, travel_type, status, from_date, to_date, limit}
     * @returns {Promise} Response with requests and statistics
     */
    getAdminTravelRequests(filters = {}) {
        return this.get(m('get_admin_travel_requests'), {
            department: filters.department || null,
            employee: filters.employee || null,
            travel_type: filters.travel_type || null,
            status: filters.status || null,
            from_date: filters.from_date || null,
            to_date: filters.to_date || null,
            limit: filters.limit || 500
        });
    }

    /* -------------------------
     * FILES (upload/download/attach)
     * -----------------------*/
    getAttachments({ dt, dn }) {
        return this.get(m('get_attachments'), { dt, dn });
    }

    uploadBase64File({ content, filename, dt, dn, fieldname }) {
        return this.post(m('upload_base64_file'), { content, filename, dt, dn, fieldname });
    }

    deleteAttachment({ filename }) {
        return this.post(m('delete_attachment'), { filename });
    }

    downloadSalarySlip({ name }) {
        return this.get(m('download_salary_slip'), { name });
    }

    /**
     * Debug endpoint to check user session and employee data
     * Uses: debug_user_session from backend
     * @returns {Promise} Response with debug information
     */
    debugUserSession() {
        return this.get(m('debug_user_session'));
    }

    /* -------------------------
     * EMPLOYEE PROFILE MANAGEMENT
     * -----------------------*/
    
    /**
     * Get complete employee profile with edit permission status
     * Uses: get_employee_profile from backend
     * @param {string} employee - Employee ID
     * @returns {Promise} Response with employee profile data
     */
    getEmployeeProfile(employee) {
        return this.get(m('get_employee_profile'), { employee });
    }

    /**
     * Request edit permission for employee profile
     * Uses: request_profile_edit from backend
     * @param {string} employee - Employee ID
     * @param {string} reason - Reason for requesting edit access
     * @returns {Promise} Response with request result
     */
    requestProfileEdit(employee, reason = '') {
        return this.post(m('request_profile_edit'), { employee, reason });
    }

    /**
     * Check employee's edit permission status
     * Uses: check_edit_permission from backend
     * @param {string} employee - Employee ID
     * @returns {Promise} Response with permission status
     */
    checkEditPermission(employee) {
        return this.get(m('check_edit_permission'), { employee });
    }

    /**
     * Update employee profile (requires edit permission)
     * Uses: update_employee_profile from backend
     * @param {string} employee - Employee ID
     * @param {Object} updates - Fields to update
     * @returns {Promise} Response with update result
     */
    updateEmployeeProfile(employee, updates) {
        return this.post(m('update_employee_profile'), { 
            employee, 
            updates: typeof updates === 'string' ? updates : JSON.stringify(updates)
        });
    }

    /**
     * Get all employees for admin management
     * Uses: get_all_employees from backend
     * @param {Object} filters - Optional filters (status, department, company, search, limit)
     * @returns {Promise} Response with employee list and statistics
     */
    getAllEmployees(filters = {}) {
        return this.get(m('get_all_employees'), {
            status: filters.status || null,
            department: filters.department || null,
            company: filters.company || null,
            search: filters.search || null,
            limit: filters.limit || 500
        });
    }

    /**
     * Get detailed employee information for admin
     * Uses: get_employee_details from backend
     * @param {string} employee - Employee ID
     * @returns {Promise} Response with full employee details
     */
    getEmployeeDetails(employee) {
        return this.get(m('get_employee_details'), { employee });
    }

    /**
     * Get all pending edit requests for admin
     * Uses: get_pending_edit_requests from backend
     * @returns {Promise} Response with pending requests list
     */
    getPendingEditRequests() {
        return this.get(m('get_pending_edit_requests'));
    }

    /**
     * Grant edit permission to an employee (admin only)
     * Uses: grant_edit_permission from backend
     * @param {string} employee - Employee ID
     * @param {string} remarks - Optional remarks
     * @returns {Promise} Response with grant result
     */
    grantEditPermission(employee, remarks = '') {
        return this.post(m('grant_edit_permission'), { employee, remarks });
    }

    /**
     * Revoke edit permission from an employee (admin only)
     * Uses: revoke_edit_permission from backend
     * @param {string} employee - Employee ID
     * @param {string} remarks - Optional remarks
     * @returns {Promise} Response with revoke result
     */
    revokeEditPermission(employee, remarks = '') {
        return this.post(m('revoke_edit_permission'), { employee, remarks });
    }

    /**
     * Reject an edit request (admin only)
     * Uses: reject_edit_request from backend
     * @param {string} employee - Employee ID
     * @param {string} reason - Rejection reason
     * @returns {Promise} Response with rejection result
     */
    rejectEditRequest(employee, reason = '') {
        return this.post(m('reject_edit_request'), { employee, reason });
    }

    /**
     * Admin update any employee's profile
     * Uses: admin_update_employee from backend
     * @param {string} employee - Employee ID
     * @param {Object} updates - Fields to update
     * @returns {Promise} Response with update result
     */
    adminUpdateEmployee(employee, updates) {
        return this.post(m('admin_update_employee'), { 
            employee, 
            updates: typeof updates === 'string' ? updates : JSON.stringify(updates)
        });
    }

    /**
     * Get departments and designations for dropdowns
     * Uses: get_departments_and_designations from backend
     * @returns {Promise} Response with lists
     */
    getDepartmentsAndDesignations() {
        return this.get(m('get_departments_and_designations'));
    }

    // ============================================================================
    // NOTIFICATION MANAGEMENT APIs
    // ============================================================================

    /**
     * Create notification(s) for employee(s)
     * Uses: create_notification from backend
     * @param {Object} notificationData - Notification data
     * @returns {Promise} Response with notification count
     */
    createNotification(notificationData) {
        return this.post(m('create_notification'), notificationData);
    }

    /**
     * Get notifications for current employee
     * Uses: get_my_notifications from backend
     * @param {Object} params - Query parameters (limit, skip, unread_only, category)
     * @returns {Promise} Response with notifications list
     */
    getMyNotifications(params = {}) {
        const queryParams = new URLSearchParams(params).toString();
        const url = m('get_my_notifications') + (queryParams ? `?${queryParams}` : '');
        return this.get(url);
    }

    /**
     * Mark notification as read
     * Uses: mark_notification_read from backend
     * @param {string} notificationId - Notification ID
     * @returns {Promise} Response with success status
     */
    markNotificationRead(notificationId) {
        return this.post(m('mark_notification_read'), {
            notification_id: notificationId
        });
    }

    /**
     * Archive notification
     * Uses: archive_notification from backend
     * @param {string} notificationId - Notification ID
     * @returns {Promise} Response with success status
     */
    archiveNotification(notificationId) {
        return this.post(m('archive_notification'), {
            notification_id: notificationId
        });
    }

    /**
     * Delete notification permanently
     * Uses: delete_notification from backend
     * @param {string} notificationId - Notification ID
     * @returns {Promise} Response with success status
     */
    deleteNotification(notificationId) {
        return this.post(m('delete_notification'), {
            notification_id: notificationId
        });
    }

    /**
     * Mark all notifications as read
     * Uses: mark_all_notifications_read from backend
     * @param {string} employee - Employee ID (optional, auto-detected)
     * @returns {Promise} Response with success status
     */
    markAllNotificationsRead(employee = null) {
        return this.post(m('mark_all_notifications_read'), {
            employee: employee
        });
    }

    /**
     * Get notification statistics
     * Uses: get_notification_stats from backend
     * @param {string} employee - Employee ID (optional, auto-detected)
     * @returns {Promise} Response with notification counts
     */
    getNotificationStats(employee = null) {
        const queryParams = employee ? `?employee=${employee}` : '';
        return this.get(m('get_notification_stats') + queryParams);
    }

    /**
     * Get notification settings for employee
     * Uses: get_notification_settings from backend
     * @param {string} employee - Employee ID (optional, auto-detected)
     * @returns {Promise} Response with notification settings
     */
    getNotificationSettings(employee = null) {
        const queryParams = employee ? `?employee=${employee}` : '';
        return this.get(m('get_notification_settings') + queryParams);
    }

    /**
     * Update notification settings
     * Uses: update_notification_settings from backend
     * @param {Object} settings - Settings object
     * @returns {Promise} Response with success status
     */
    updateNotificationSettings(settings) {
        return this.post(m('update_notification_settings'), settings);
    }

    // ============================================================================
    // END NOTIFICATION MANAGEMENT APIs
    // ============================================================================

    // ============================================================================
    // FCM PUSH NOTIFICATION APIs
    // ============================================================================

    /**
     * Register FCM token with backend
     * Uses: register_fcm_token from backend
     * @param {Object} tokenData - {fcm_token, device_platform, device_id, employee}
     * @returns {Promise} Response with registration status
     */
    registerFCMToken(tokenData) {
        return this.post(m('register_fcm_token'), tokenData);
    }

    /**
     * Unregister FCM token from backend
     * Uses: unregister_fcm_token from backend  
     * @param {string} employee - Employee ID (optional, auto-detected)
     * @returns {Promise} Response with unregistration status
     */
    unregisterFCMToken(employee = null) {
        const data = employee ? { employee } : {};
        return this.post(m('unregister_fcm_token'), data);
    }

    /**
     * Send push notifications to specific employees
     * Uses: send_push_notification_to_employees from backend
     * @param {Object} notificationData - Notification data with employee_ids array
     * @returns {Promise} Response with send status and delivery stats
     */
    sendPushNotificationToEmployees(notificationData) {
        return this.post(m('send_push_notification_to_employees'), notificationData);
    }

    /**
     * Get FCM delivery statistics for a notification
     * Uses: get_fcm_delivery_stats from backend
     * @param {string} notificationId - Notification ID
     * @returns {Promise} Response with delivery statistics
     */
    getFCMDeliveryStats(notificationId) {
        return this.get(m('get_fcm_delivery_stats'), { notification_id: notificationId });
    }

    /**
     * Test FCM connection and configuration
     * Uses: test_fcm_connection from backend
     * @returns {Promise} Response with connection test results
     */
    testFCMConnection() {
        return this.get(m('test_fcm_connection'));
    }

    // ============================================================================
    // END FCM PUSH NOTIFICATION APIs  
    // ============================================================================

    // ============================================================================
    // ADVANCED NOTIFICATION FEATURES APIs
    // ============================================================================

    /**
     * Get notification templates
     * Uses: get_notification_templates from backend
     * @param {string} category - Filter by category (optional)
     * @param {boolean} activeOnly - Only return active templates
     * @returns {Promise} Response with templates list
     */
    getNotificationTemplates(category = null, activeOnly = true) {
        const params = {};
        if (category) params.category = category;
        if (activeOnly !== undefined) params.active_only = activeOnly ? 1 : 0;
        
        return this.get(m('get_notification_templates'), params);
    }

    /**
     * Create notifications from template
     * Uses: create_notification_from_template from backend
     * @param {Object} templateData - Template notification data
     * @returns {Promise} Response with creation result
     */
    createNotificationFromTemplate(templateData) {
        return this.post(m('create_notification_from_template'), {
            template_name: templateData.template_name,
            recipients: JSON.stringify(templateData.recipients),
            variables: templateData.variables ? JSON.stringify(templateData.variables) : null,
            override_settings: templateData.override_settings ? JSON.stringify(templateData.override_settings) : null
        });
    }

    /**
     * Get template preview with sample data
     * Uses: get_template_preview from backend
     * @param {string} templateName - Template name
     * @param {Object} sampleVariables - Sample variables for preview
     * @returns {Promise} Response with template preview
     */
    getTemplatePreview(templateName, sampleVariables = null) {
        return this.post(m('get_template_preview'), {
            template_name: templateName,
            sample_variables: sampleVariables ? JSON.stringify(sampleVariables) : null
        });
    }

    /**
     * Perform bulk operations on notifications
     * Uses: bulk_notification_operations from backend
     * @param {string} operation - Operation to perform
     * @param {Array} notificationIds - Array of notification IDs
     * @param {Object} data - Additional data for operation
     * @returns {Promise} Response with operation results
     */
    bulkNotificationOperations(operation, notificationIds, data = null) {
        return this.post(m('bulk_notification_operations'), {
            operation: operation,
            notification_ids: JSON.stringify(notificationIds),
            data: data ? JSON.stringify(data) : null
        });
    }

    /**
     * Get advanced notification analytics
     * Uses: get_notification_analytics from backend
     * @param {Object} filters - Analytics filters
     * @returns {Promise} Response with analytics data
     */
    getNotificationAnalytics(filters = {}) {
        return this.get(m('get_notification_analytics'), filters);
    }

    /**
     * Schedule notification for future delivery
     * Uses: schedule_notification from backend
     * @param {Object} scheduleData - Schedule configuration
     * @returns {Promise} Response with schedule result
     */
    scheduleNotification(scheduleData) {
        return this.post(m('schedule_notification'), {
            schedule_type: scheduleData.schedule_type,
            schedule_data: JSON.stringify(scheduleData.schedule_info),
            notification_data: JSON.stringify(scheduleData.notification_data),
            recipients: JSON.stringify(scheduleData.recipients)
        });
    }

    // ============================================================================
    // END ADVANCED NOTIFICATION FEATURES APIs
    // ============================================================================

    // ============================================================================
    // SALARY STRUCTURE APIs
    // ============================================================================

    /**
     * Get employee's salary structure with earnings and deductions
     * Uses: get_employee_salary_structure from backend
     * @param {string} employee - Optional employee ID (defaults to current user's employee)
     * @returns {Promise} Response with salary structure details
     */
    getEmployeeSalaryStructure(employee = null) {
        return this.post(m('get_employee_salary_structure'), { employee });
    }

    /**
     * Get all salary structure assignments for admin view
     * Uses: get_all_salary_structure_assignments from backend
     * @param {Object} filters - Optional filters (department, designation, company, salary_structure)
     * @returns {Promise} Response with all salary structure assignments
     */
    getAllSalaryStructureAssignments(filters = {}) {
        return this.post(m('get_all_salary_structure_assignments'), {
            department: filters.department || null,
            designation: filters.designation || null,
            company: filters.company || null,
            salary_structure: filters.salary_structure || null,
            limit: filters.limit || 500
        });
    }

    /**
     * Get list of salary structures for dropdown
     * Uses: get_salary_structure_list from backend
     * @returns {Promise} Response with salary structures list
     */
    getSalaryStructureList() {
        return this.get(m('get_salary_structure_list'));
    }

    // ============================================================================
    // END SALARY STRUCTURE APIs
    // ============================================================================

    // ============================================================================
    // SALARY TRACKER APIs
    // ============================================================================

    /** Admin: Create salary trackers for all employees for a month */
    addMonthlySalaries({ month, year, department }) {
        return this.post(m('add_monthly_salaries'), { month, year, department });
    }

    /** Employee: Request a pending salary record for admin review */
    requestPendingSalary({ employee_id, month, year, remarks, manual_amount }) {
        return this.post(m('request_pending_salary'), { employee_id, month, year, remarks, manual_amount });
    }

    /** Admin: Approve/reject employee-submitted salary tracker */
    approveSalaryTracker({ tracker_id, action, remarks }) {
        return this.post(m('approve_salary_tracker'), { tracker_id, action, remarks });
    }

    /** Admin: Record a payment chunk */
    recordSalaryPayment({ tracker_id, amount, payment_date, payment_mode, reference, remarks }) {
        return this.post(m('record_salary_payment'), {
            tracker_id, amount, payment_date, payment_mode, reference, remarks,
        });
    }

    /** Admin: Delete a payment entry */
    deleteSalaryPayment({ tracker_id, row_idx }) {
        return this.post(m('delete_salary_payment'), { tracker_id, row_idx });
    }

    /** Get salary tracker list (employee or admin) */
    getSalaryTrackerList(filters = {}) {
        return this.post(m('get_salary_tracker_list'), filters);
    }

    /** Get single tracker with payment history */
    getSalaryTrackerDetail({ tracker_id }) {
        return this.post(m('get_salary_tracker_detail'), { tracker_id });
    }

    /** Get employee salary overview (totals) */
    getEmployeeSalaryOverview({ employee_id }) {
        return this.post(m('get_employee_salary_overview'), { employee_id });
    }

    /** Admin: Get pending summary across all employees */
    getPendingSalarySummary() {
        return this.get(m('get_pending_salary_summary'));
    }

    /** Admin: Get trackers pending review */
    getPendingReviewTrackers() {
        return this.get(m('get_pending_review_trackers'));
    }

    /** Admin: Recalculate salary for a tracker */
    recalculateSalaryTracker({ tracker_id }) {
        return this.post(m('recalculate_salary_tracker'), { tracker_id });
    }

    // ============================================================================
    // END SALARY TRACKER APIs
    // ============================================================================

    // ============================================================================
    // DAILY TASKS APIs
    // ============================================================================

    createDailyTask({ task_title, task_description, priority, tasks }) {
        if (tasks) {
            return this.post(m('create_daily_task'), { tasks: JSON.stringify(tasks) });
        }
        return this.post(m('create_daily_task'), { task_title, task_description, priority });
    }

    getMyDailyTasks(date = null, status_filter = null) {
        return this.get(m('get_my_daily_tasks'), { date, status_filter });
    }

    updateTaskStatus({ task_name, new_status }) {
        return this.post(m('update_task_status'), { task_name, new_status });
    }

    updateDailyTask({ task_name, task_title, task_description, priority, remarks }) {
        return this.post(m('update_daily_task'), { task_name, task_title, task_description, priority, remarks });
    }

    getDailyTaskSummary() {
        return this.get(m('get_daily_task_summary'));
    }

    deleteDailyTask(task_name) {
        return this.post(m('delete_daily_task'), { task_name });
    }

    // Admin Daily Tasks
    adminGetAllTasks(date = null, department = null, employee = null, status_filter = null) {
        return this.get(m('admin_get_all_tasks'), { date, department, employee, status_filter });
    }

    adminGetTaskAnalytics(period = 'week') {
        return this.get(m('admin_get_task_analytics'), { period });
    }

    adminUpdateTask({ task_name, task_title, task_description, priority, status, remarks }) {
        return this.post(m('admin_update_task'), { task_name, task_title, task_description, priority, status, remarks });
    }

    adminAssignTask({ employee, employees, task_title, task_description, priority, tasks }) {
        const params = { task_title, task_description, priority };
        if (employees && employees.length > 0) {
            params.employees = JSON.stringify(employees);
        } else if (employee) {
            params.employee = employee;
        }
        if (tasks) {
            params.tasks = JSON.stringify(tasks);
        }
        return this.post(m('admin_assign_task'), params);
    }

    // ============================================================================
    // END DAILY TASKS APIs
    // ============================================================================


}

export default new ApiService();
