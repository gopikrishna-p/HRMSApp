import axios from 'axios';
import Config from 'react-native-config';
import { Platform, Alert } from 'react-native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import showToast from '../../utils/Toast';
import { getSession, makeAPIRequest } from '../../screens/auth/authStore';

const BASE_URL = Config.BASE_URL;

const getHeaders = async () => {
    const session = await getSession();
    return {
        'Content-Type': 'application/json',
        'Cookie': `sid=${session?.sid}`,
    };
};

// Enhanced employee statistics function
export const fetchEmployeeStats = async () => {
    try {
        const headers = await getHeaders();
        const response = await axios.get(`${BASE_URL}/api/method/hrms.api.get_employee_statistics`, { headers });
        return response.data.message || {
            totalEmployees: 0,
            presentToday: 0,
            absentToday: 0,
            wfhToday: 0,
            onLeave: 0,
            lateArrivals: 0
        };
    } catch (error) {
        console.error('Error fetching employee statistics:', error);
        return {
            totalEmployees: 0,
            presentToday: 0,
            absentToday: 0,
            wfhToday: 0,
            onLeave: 0,
            lateArrivals: 0
        };
    }
};

// Department-wise statistics with fallback
export const fetchDepartmentStats = async () => {
    try {
        const headers = await getHeaders();

        try {
            const response = await axios.get(`${BASE_URL}/api/method/hrms.api.get_department_statistics`, { headers });
            return response.data.message || [];
        } catch (specificError) {
            console.log('Department stats endpoint not available, using fallback');

            const employeesResponse = await axios.get(`${BASE_URL}/api/method/hrms.api.get_all_employees`, { headers });
            const employees = employeesResponse.data.message || [];

            const departmentMap = {};
            employees.forEach(emp => {
                const dept = emp.department || 'Not Assigned';
                if (!departmentMap[dept]) {
                    departmentMap[dept] = { total: 0, present: 0 };
                }
                departmentMap[dept].total++;
                if (emp.status === 'Active') {
                    departmentMap[dept].present++;
                }
            });

            return Object.keys(departmentMap).map(dept => ({
                department: dept,
                total: departmentMap[dept].total,
                present: departmentMap[dept].present
            }));
        }
    } catch (error) {
        console.error('Error fetching department statistics:', error);
        return [];
    }
};

// Enhanced attendance analytics with fallback
export const fetchAttendanceAnalytics = async (period = 'week') => {
    try {
        const headers = await getHeaders();

        try {
            const response = await axios.get(
                `${BASE_URL}/api/method/hrms.api.get_attendance_analytics?period=${period}`,
                { headers }
            );
            return response.data.message || {};
        } catch (specificError) {
            console.log('Attendance analytics endpoint not available, using fallback');
            return {
                weeklyTrend: [],
                averageAttendance: 0,
                trends: {}
            };
        }
    } catch (error) {
        console.error('Error fetching attendance analytics:', error);
        return {
            weeklyTrend: [],
            averageAttendance: 0,
            trends: {}
        };
    }
};

// Existing functions (unchanged)
export const fetchEmployeeCount = async () => {
    try {
        const headers = await getHeaders();
        const response = await axios.get(`${BASE_URL}/api/method/hrms.api.get_employee_count`, { headers });
        return response.data.message.count;
    } catch (error) {
        showToast({ type: 'error', text1: 'Error', text2: 'Failed to fetch employee count' });
        throw error;
    }
};

export const fetchEmployeeWFHList = async () => {
    try {
        const headers = await getHeaders();
        const response = await axios.get(`${BASE_URL}/api/method/hrms.api.get_employee_wfh_list`, { headers });
        return response.data.message || [];
    } catch (error) {
        showToast({ type: 'error', text1: 'Error', text2: 'Failed to fetch WFH list' });
        throw error;
    }
};

export const toggleWFH = async (employeeId, wfhEligible) => {
    try {
        const headers = await getHeaders();
        const response = await axios.post(
            `${BASE_URL}/api/method/hrms.api.toggle_wfh_eligibility`,
            { employee_id: employeeId, wfh_eligible: wfhEligible ? 1 : 0 },
            { headers }
        );
        if (response.data.message.status === 'success') {
            showToast({ type: 'success', text1: 'Success', text2: response.data.message.message });
            return true;
        }
        throw new Error(response.data.message || 'Failed to toggle WFH eligibility');
    } catch (error) {
        showToast({ type: 'error', text1: 'Error', text2: 'Failed to update WFH settings' });
        throw error;
    }
};

// Enhanced admin service with working hours and export functionality
export const fetchAttendanceHistory = async (employeeId, startDate = null, endDate = null) => {
    try {
        const headers = await getHeaders();

        let url = `${BASE_URL}/api/method/hrms.api.get_employee_attendance_history?employee_id=${employeeId}`;
        if (startDate) {
            url += `&start_date=${startDate}`;
        }
        if (endDate) {
            url += `&end_date=${endDate}`;
        }

        const response = await axios.get(url, { headers });

        const responseData = response.data.message || {};
        const attendanceRecords = responseData.attendance_records || [];
        const summaryStats = responseData.summary_stats || {};

        const processedRecords = attendanceRecords.map(record => ({
            ...record,
            checkout_time: record.out_time || record.custom_out_time_copy || null,
            in_time: formatTime(record.in_time),
            out_time: formatTime(record.out_time || record.custom_out_time_copy),
            custom_out_time_copy: formatTime(record.out_time || record.custom_out_time_copy),
            formatted_date: formatDate(record.attendance_date),
            working_hours: record.working_hours || null,
            shift_start: record.shift_start,
            shift_end: record.shift_end
        }));

        return {
            attendance_records: processedRecords,
            summary_stats: summaryStats,
            date_range: responseData.date_range || {}
        };
    } catch (error) {
        console.error('Error loading attendance:', error);
        showToast({
            type: 'error',
            text1: 'Error',
            text2: 'Failed to load attendance records',
            time: 5000,
        });
        throw error;
    }
};

// Get all employees attendance summary
export const fetchAllEmployeesAttendanceSummary = async (startDate = null, endDate = null, department = null) => {
    try {
        const headers = await getHeaders();

        let url = `${BASE_URL}/api/method/hrms.api.get_all_employees_attendance_summary`;
        const params = new URLSearchParams();

        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (department) params.append('department', department);

        if (params.toString()) {
            url += `?${params.toString()}`;
        }

        const response = await axios.get(url, { headers });
        return response.data.message || {};
    } catch (error) {
        console.error('Error fetching all employees summary:', error);
        showToast({
            type: 'error',
            text1: 'Error',
            text2: 'Failed to fetch employees attendance summary'
        });
        throw error;
    }
};

// FIXED: Export attendance report with proper mobile file handling
export const exportAttendanceReport = async (employeeId = null, startDate, endDate, exportFormat = 'pdf', department = null) => {
    try {
        const headers = await getHeaders();

        const params = {
            start_date: startDate,
            end_date: endDate,
            export_format: exportFormat
        };

        if (employeeId) {
            params.employee_id = employeeId;
        }
        if (department) {
            params.department = department;
        }

        console.log('Export request params:', params);

        const response = await axios.get(
            `${BASE_URL}/api/method/hrms.api.export_attendance_report`,
            {
                headers,
                params,
                timeout: 60000,
                responseType: 'json'
            }
        );

        console.log('Export response:', response.data);

        const result = response.data.message || response.data;

        if (result.status === 'error') {
            throw new Error(result.message || 'Export failed');
        }

        // Handle different response formats
        if (result.status === 'success' && result.content) {
            return {
                status: 'success',
                fileName: result.file_name || `attendance_report.${exportFormat}`,
                content: result.content,
                contentType: result.content_type || (exportFormat === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            };
        }

        // If the response is base64 content directly
        if (typeof result === 'string' && result.length > 100) {
            return {
                status: 'success',
                fileName: `attendance_report_${startDate}_${endDate}.${exportFormat}`,
                content: result,
                contentType: exportFormat === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            };
        }

        throw new Error('Invalid response format from server');

    } catch (error) {
        console.error('Error exporting report:', error);

        let errorMessage = 'Export failed';
        if (error.response?.status === 417) {
            errorMessage = 'Export temporarily unavailable. Please try with a smaller date range.';
        } else if (error.response?.data?.message) {
            errorMessage = error.response.data.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        showToast({
            type: 'error',
            text1: 'Export Failed',
            text2: errorMessage
        });

        throw new Error(errorMessage);
    }
};

// FIXED: Generate attendance report using existing exportAttendanceReport function
export const generateAttendanceReport = async (options) => {
    try {
        const {
            employeeId,
            startDate,
            endDate,
            format,
            department,
            action = 'download'
        } = options;

        console.log('Generating report with options:', options);

        // Validate parameters
        const errors = validateExportParams(startDate, endDate, employeeId);
        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }

        showToast({
            type: 'info',
            text1: 'Generating Report',
            text2: 'Please wait while we prepare your report...',
        });

        // Use the existing exportAttendanceReport function
        const result = await exportAttendanceReport(
            employeeId, 
            startDate, 
            endDate, 
            format.toLowerCase(), 
            department
        );

        if (result.status === 'error') {
            throw new Error(result.message || 'Export failed');
        }

        // Handle file download
        await handleFileDownload(result, format, employeeId, startDate, endDate);

        showToast({
            type: 'success',
            text1: 'Export Complete',
            text2: `${format.toUpperCase()} report has been saved successfully`,
        });

    } catch (error) {
        console.error('Export error:', error);

        showToast({
            type: 'error',
            text1: 'Export Failed',
            text2: error.message || 'Failed to generate report',
        });

        throw error;
    }
};

// Handle file download and sharing
const handleFileDownload = async (exportData, format, employeeId, startDate, endDate) => {
    try {
        const { content, fileName: file_name, contentType: content_type } = exportData;

        // Generate filename if not provided
        const timestamp = new Date().toISOString().slice(0, 10);
        const scope = employeeId ? 'individual' : 'all_employees';
        const fileName = file_name || `attendance_report_${scope}_${timestamp}.${format.toLowerCase()}`;

        // Determine file path
        const documentsPath = Platform.OS === 'ios'
            ? RNFS.DocumentDirectoryPath
            : RNFS.DownloadDirectoryPath;

        const filePath = `${documentsPath}/${fileName}`;

        // Handle different content types
        let fileContent;
        if (content_type && content_type.includes('base64')) {
            // Content is already base64 encoded
            fileContent = content.split(',')[1] || content;
        } else if (typeof content === 'string' && content.startsWith('data:')) {
            // Data URL format
            fileContent = content.split(',')[1];
        } else {
            // Assume it's base64 content
            fileContent = content;
        }

        // Write file
        await RNFS.writeFile(filePath, fileContent, 'base64');

        // Verify file was created
        const fileExists = await RNFS.exists(filePath);
        if (!fileExists) {
            throw new Error('Failed to save file');
        }

        // Share or open file
        await shareFile(filePath, fileName, format);

    } catch (error) {
        console.error('File download error:', error);
        throw new Error(`Failed to save file: ${error.message}`);
    }
};

// Share file using react-native-share
const shareFile = async (filePath, fileName, format) => {
    try {
        const shareOptions = {
            title: 'Attendance Report',
            message: `Attendance report generated on ${new Date().toLocaleDateString()}`,
            url: Platform.OS === 'ios' ? filePath : `file://${filePath}`,
            type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: fileName,
            showAppsToView: true,
        };

        const result = await Share.open(shareOptions);
        console.log('Share result:', result);

    } catch (error) {
        if (error.message !== 'User did not share') {
            console.error('Share error:', error);

            // Fallback: show alert with file location
            Alert.alert(
                'File Saved',
                `Report saved to: ${filePath}`,
                [
                    {
                        text: 'OK',
                        style: 'default',
                    },
                ]
            );
        }
    }
};

export const quickPdfExport = async (employeeId, startDate, endDate) => {
    return generateAttendanceReport({
        employeeId,
        startDate,
        endDate,
        format: 'pdf',
        action: 'download'
    });
};

// Export individual employee report
export const exportIndividualReport = async (employeeId, startDate, endDate, format = 'pdf') => {
    return generateAttendanceReport({
        employeeId,
        startDate,
        endDate,
        format,
        action: 'download'
    });
};

// Export all employees report
export const exportAllEmployeesReport = async (startDate, endDate, format = 'pdf', department = null) => {
    return generateAttendanceReport({
        employeeId: null,
        startDate,
        endDate,
        format,
        department,
        action: 'download'
    });
};

// Check if file permissions are available
export const checkFilePermissions = async () => {
    try {
        if (Platform.OS === 'android') {
            const granted = await RNFS.exists(RNFS.DownloadDirectoryPath);
            return granted;
        }
        return true; // iOS doesn't need special permissions for document directory
    } catch (error) {
        console.error('Permission check error:', error);
        return false;
    }
};

// Get departments list for filtering
export const fetchDepartmentsList = async () => {
    try {
        const headers = await getHeaders();
        const response = await axios.get(
            `${BASE_URL}/api/resource/Department`,
            {
                headers,
                params: {
                    fields: JSON.stringify(['name', 'department_name']),
                    filters: JSON.stringify({ 'disabled': 0 }),
                    limit_page_length: 999
                }
            }
        );

        return response.data.data || [];
    } catch (error) {
        console.error('Error fetching departments:', error);
        return [];
    }
};

// Validate export parameters
export const validateExportParams = (startDate, endDate, employeeId = null) => {
    const errors = [];

    if (!startDate || !endDate) {
        errors.push('Start date and end date are required');
        return errors;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
        errors.push('Start date must be before end date');
    }

    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
        errors.push('Date range cannot exceed 365 days');
    }

    if (daysDiff < 1) {
        errors.push('Date range must be at least 1 day');
    }

    if (employeeId && !employeeId.trim()) {
        errors.push('Invalid employee selection');
    }

    return errors;
};

// Calculate working hours helper (fallback for frontend calculation)
export const calculateWorkingHours = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return null;

    try {
        const parseTime = (timeStr) => {
            if (!timeStr) return null;

            if (timeStr.includes('T')) {
                return new Date(timeStr);
            }

            const today = new Date().toISOString().split('T')[0];
            return new Date(`${today}T${timeStr}`);
        };

        const inTime = parseTime(checkIn);
        const outTime = parseTime(checkOut);

        if (!inTime || !outTime) return null;

        const diffMs = outTime - inTime;
        const hours = diffMs / (1000 * 60 * 60);

        return hours > 0 ? parseFloat(hours.toFixed(2)) : null;
    } catch (error) {
        console.error('Error calculating working hours:', error);
        return null;
    }
};

// Format working hours for display
export const formatWorkingHours = (hours) => {
    if (!hours && hours !== 0) return 'N/A';

    if (hours < 1) {
        const minutes = Math.round(hours * 60);
        return `${minutes}m`;
    }

    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);

    if (minutes === 0) {
        return `${wholeHours}h`;
    }

    return `${wholeHours}h ${minutes}m`;
};

// Get working hours color (for UI indicators)
export const getWorkingHoursColor = (hours, shiftHours = 8) => {
    if (!hours) return '#9CA3AF';

    const percentage = (hours / shiftHours) * 100;

    if (percentage >= 100) return '#10B981';
    if (percentage >= 75) return '#F59E0B';
    if (percentage >= 50) return '#EF4444';
    return '#7C3AED';
};

// Helper function to format time
const formatTime = (timeValue) => {
    if (!timeValue) return null;

    try {
        if (typeof timeValue === 'string') {
            if (timeValue.includes('T')) {
                const timePart = timeValue.split('T')[1];
                return timePart.split('.')[0];
            }
            if (timeValue.match(/^\d{2}:\d{2}:\d{2}$/)) {
                return timeValue;
            }
            if (timeValue.includes(' ')) {
                return timeValue.split(' ')[1];
            }
        }

        if (timeValue instanceof Date) {
            return timeValue.toTimeString().split(' ')[0];
        }

        return timeValue;
    } catch (error) {
        console.error('Error formatting time:', error);
        return timeValue;
    }
};

// Helper function to format date
const formatDate = (dateValue) => {
    if (!dateValue) return null;

    try {
        const date = new Date(dateValue);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit'
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return dateValue;
    }
};

export const fetchAllEmployees = async () => {
    try {
        const headers = await getHeaders();
        const response = await axios.get(`${BASE_URL}/api/method/hrms.api.get_all_employees`, { 
            headers,
            params: {
                filters: JSON.stringify({ 'status': 'Active' }),
                limit_page_length: 999999
            }
        });
        
        // Filter on frontend as well to ensure only active employees
        const employees = response.data.message || [];
        return employees.filter(emp => emp.status === 'Active');
        
    } catch (error) {
        console.error('Error fetching employees:', error);
        showToast({ 
            type: 'error', 
            text1: 'Error', 
            text2: 'Failed to fetch employees' 
        });
        throw error;
    }
};

export const fetchAllTaskLogs = async () => {
    try {
        const headers = await getHeaders();
        const response = await axios.get(`${BASE_URL}/api/method/hrms.api.get_all_task_logs`, { headers });
        return response.data.message || [];
    } catch (error) {
        showToast({ type: 'error', text1: 'Error', text2: 'Failed to fetch task logs' });
        throw error;
    }
};

export const fetchTodayAttendance = async () => {
    try {
        const headers = await getHeaders();
        const response = await axios.get(`${BASE_URL}/api/method/hrms.api.get_today_attendance`, { headers });
        return response.data.message || { present: [], absent: [] };
    } catch (error) {
        showToast({ type: 'error', text1: 'Error', text2: 'Failed to fetch today\'s attendance' });
        throw error;
    }
};

const handleApiError = (error, defaultMessage) => {
    console.error('API Error:', error);

    let errorMessage = defaultMessage;

    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        switch (status) {
            case 417:
                errorMessage = 'Server processing error. Please try with a smaller date range or contact support.';
                break;
            case 500:
                errorMessage = 'Server error. Please try again later.';
                break;
            case 403:
                errorMessage = 'Access denied. Please check your permissions.';
                break;
            case 401:
                errorMessage = 'Session expired. Please login again.';
                break;
            case 404:
                errorMessage = 'Resource not found. Please check your selection.';
                break;
            default:
                if (data && data.message) {
                    errorMessage = data.message;
                } else if (data && data.error) {
                    errorMessage = data.error;
                }
        }
    } else if (error.request) {
        errorMessage = 'Network error. Please check your connection.';
    }

    return errorMessage;
};

// Get individual employee attendance analytics with retry
export const fetchEmployeeAttendanceAnalytics = async (employeeId, startDate, endDate, retryCount = 0) => {
    try {
        const headers = await getHeaders();
        const response = await axios.get(
            `${BASE_URL}/api/method/hrms.api.get_employee_attendance_analytics`,
            {
                headers,
                params: {
                    employee_id: employeeId,
                    start_date: startDate,
                    end_date: endDate
                },
                timeout: 30000,
            }
        );
        return response.data.message || {};
    } catch (error) {
        const errorMessage = handleApiError(error, 'Failed to fetch employee attendance analytics');

        if (retryCount === 0 && (error.code === 'ECONNABORTED' || error.code === 'NETWORK_ERROR')) {
            console.log('Retrying employee analytics request...');
            return fetchEmployeeAttendanceAnalytics(employeeId, startDate, endDate, 1);
        }

        showToast({
            type: 'error',
            text1: 'Error',
            text2: errorMessage
        });
        throw new Error(errorMessage);
    }
};

export const fetchAbsentEmployeesList = async () => {
    try {
        const headers = await getHeaders();
        const response = await axios.get(`${BASE_URL}/api/method/hrms.api.get_absent_employees_list`, { headers });
        return response.data.message || { absent_employees: [], total_absent: 0 };
    } catch (error) {
        console.error('Error fetching absent employees list:', error);
        showToast({ type: 'error', text1: 'Error', text2: 'Failed to fetch absent employees list' });
        throw error;
    }
};

// Get list of late arrival employees
export const fetchLateArrivalsList = async () => {
    try {
        const headers = await getHeaders();
        const response = await axios.get(`${BASE_URL}/api/method/hrms.api.get_late_arrivals_list`, { headers });
        return response.data.message || { late_employees: [], total_late: 0 };
    } catch (error) {
        console.error('Error fetching late arrivals list:', error);
        showToast({ type: 'error', text1: 'Error', text2: 'Failed to fetch late arrivals list' });
        throw error;
    }
};

// Use makeAPIRequest for the remaining functions that were using the undefined function
export const fetchPendingCheckouts = async (date) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.get_pending_checkouts',
            { date: date }
        );
        return response;
    } catch (error) {
        console.error('Error fetching pending checkouts:', error);
        throw error;
    }
};

export const addManualCheckout = async (attendanceId, checkoutTime = null) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.manual_checkout',
            {
                attendance_id: attendanceId,
                checkout_time: checkoutTime
            }
        );
        return response;
    } catch (error) {
        console.error('Error adding manual checkout:', error);
        throw error;
    }
};

export const bulkManualCheckout = async (attendanceIds, defaultCheckoutTime = null) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.bulk_manual_checkout',
            {
                attendance_ids: attendanceIds,
                default_checkout_time: defaultCheckoutTime
            }
        );
        return response;
    } catch (error) {
        console.error('Error processing bulk checkout:', error);
        throw error;
    }
};

export const fetchAttendanceRecordsForDate = async (date) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.get_attendance_records_for_date',
            { date: date }
        );
        return response;
    } catch (error) {
        console.error('Error fetching attendance records for date:', error);
        throw error;
    }
};

export const updateAttendanceTimes = async (attendanceId, checkInTime = null, checkOutTime = null) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.update_attendance_times',
            {
                attendance_id: attendanceId,
                check_in_time: checkInTime,
                check_out_time: checkOutTime
            }
        );
        return response;
    } catch (error) {
        console.error('Error updating attendance times:', error);
        throw error;
    }
};

export const fetchAttendanceStatistics = async (date) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.get_attendance_statistics_for_date',
            { date: date }
        );
        return response;
    } catch (error) {
        console.error('Error fetching attendance statistics:', error);
        throw error;
    }
};

export const bulkUpdateAttendanceTimes = async (attendanceUpdates) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.bulk_update_attendance_times',
            { attendance_updates: attendanceUpdates }
        );
        return response;
    } catch (error) {
        console.error('Error processing bulk attendance update:', error);
        throw error;
    }
};

export const deleteAttendanceRecord = async (attendanceId, reason = null) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.delete_attendance_record',
            {
                attendance_id: attendanceId,
                reason: reason
            }
        );
        return response;
    } catch (error) {
        console.error('Error deleting attendance record:', error);
        throw error;
    }
};

export const fetchAttendanceByDate = async (date, department = null, employeeId = null) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.get_attendance_by_date',
            {
                date: date,
                department: department,
                employee_id: employeeId
            }
        );
        return response;
    } catch (error) {
        console.error('Error fetching attendance by date:', error);
        throw error;
    }
};

export const getDepartmentsList = async () => {
    try {
        const response = await makeAPIRequest('hrms.api.get_departments_list');
        return response;
    } catch (error) {
        console.error('Error fetching departments:', error);
        throw error;
    }
};

// Quick fix functions
export const fixMissingCheckouts = async (date, defaultCheckoutHour = 18) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.fix_missing_checkouts',
            {
                date: date,
                default_checkout_hour: defaultCheckoutHour
            }
        );
        return response;
    } catch (error) {
        console.error('Error fixing missing checkouts:', error);
        throw error;
    }
};

export const getAttendanceSummaryWithMissing = async (date) => {
    try {
        const response = await makeAPIRequest(
            'hrms.api.get_attendance_summary_with_missing_checkouts',
            { date: date }
        );
        return response;
    } catch (error) {
        console.error('Error fetching attendance summary:', error);
        throw error;
    }
};