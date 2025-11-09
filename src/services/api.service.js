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
                const payload = {
                    success: false,
                    status: error.response?.status,
                    message:
                        error.response?.data?._error_message ||
                        error.response?.data?.message ||
                        error.message,
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
     * @returns {Promise} Response with approval status
     */
    approveExpenseClaim(claimId, remarks = '') {
        return this.post(m('approve_expense_claim'), {
            claim_id: claimId,
            remarks
        });
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


}

export default new ApiService();
