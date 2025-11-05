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

    /* -------------------------
     * GEO / ATTENDANCE (Employee)
     * -----------------------*/
    getOfficeLocation({ employee }) {
        return this.get(m('get_office_location'), { employee });
    }

    getUserWfhInfo() {
        return this.get(m('get_user_wfh_info'));
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
