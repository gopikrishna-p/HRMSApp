// src/services/attendance.service.js
import ApiService from './api.service';

const ENDPOINTS = {
    GEO_ATTENDANCE: '/api/method/hrms.api.geo_attendance',
    GET_OFFICE_LOCATION: '/api/method/hrms.api.get_office_location',
    GET_USER_WFH_INFO: '/api/method/hrms.api.get_user_wfh_info',
    GET_EMPLOYEE_WFH_LIST: '/api/method/hrms.api.get_employee_wfh_list',
    TOGGLE_WFH_ELIGIBILITY: '/api/method/hrms.api.toggle_wfh_eligibility',
    TODAY_ATTENDANCE: '/api/method/hrms.api.get_today_attendance',
    GET_HOLIDAYS: '/api/method/hrms.api.get_holidays',
    GET_LEAVE_APPLICATIONS: '/api/method/hrms.api.get_leave_applications',
};

class AttendanceService {
    
    // Helper function for consistent date formatting (timezone-safe)
    formatDateLocal(date) {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    async geoAttendance({ employee, action, latitude, longitude, work_type }) {
        const isWFH = work_type === 'WFH';
        const lat = isWFH ? 0 : Number(latitude ?? 0);
        const lon = isWFH ? 0 : Number(longitude ?? 0);
        return ApiService.post(ENDPOINTS.GEO_ATTENDANCE, { employee, action, latitude: lat, longitude: lon, work_type: isWFH ? 'WFH' : undefined });
    }

    async getOfficeLocation(employee) {
        return ApiService.get(ENDPOINTS.GET_OFFICE_LOCATION, { employee });
    }

    async getUserWFHInfo() {
        return ApiService.get(ENDPOINTS.GET_USER_WFH_INFO);
    }

    // Get today's attendance status for current employee (check-in/out times)
    async getTodayAttendanceStatus(employee) {
        try {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const response = await ApiService.get('/api/method/hrms.api.get_attendance_records', {
                employee: employee,
                start_date: today,
                end_date: today
            });
            
            console.log('Today attendance response:', response);
            
            // Extract attendance data from response
            let attendanceRecords = [];
            if (response?.success || response?.data?.message?.status === 'success') {
                attendanceRecords = response.data?.message?.data || response.data?.data || [];
            }
            
            // Get the first (today's) record if exists
            if (attendanceRecords && attendanceRecords.length > 0) {
                const record = attendanceRecords[0];
                return {
                    hasCheckedIn: !!record.in_time,
                    hasCheckedOut: !!(record.out_time || record.custom_out_time_copy),
                    checkInTime: record.in_time,
                    checkOutTime: record.out_time || record.custom_out_time_copy,
                    status: record.status,
                    workType: record.work_type || 'Office'
                };
            }
            
            // No attendance record for today
            return {
                hasCheckedIn: false,
                hasCheckedOut: false,
                checkInTime: null,
                checkOutTime: null,
                status: null,
                workType: null
            };
        } catch (error) {
            console.error('Error fetching today attendance status:', error);
            return {
                hasCheckedIn: false,
                hasCheckedOut: false,
                checkInTime: null,
                checkOutTime: null,
                status: null,
                workType: null
            };
        }
    }

    async getEmployeeWFHList() {
        return ApiService.get(ENDPOINTS.GET_EMPLOYEE_WFH_LIST);
    }

    async toggleWFHEligibility(employee_id, wfh_eligible) {
        return ApiService.post(ENDPOINTS.TOGGLE_WFH_ELIGIBILITY, { employee_id, wfh_eligible: !!wfh_eligible ? 1 : 0 });
    }

    // ✅ date is optional: 'YYYY-MM-DD'
    async getTodayAttendance(date) {
        const resp = await ApiService.get(ENDPOINTS.TODAY_ATTENDANCE, date ? { date } : {});
        // unwrap envelope to the raw payload the screen expects
        if (resp?.success) {
            return resp.data?.message ?? resp.data ?? {};
        }
        // normalize error case to empty payload to avoid .length crash
        return { present: [], absent: [], holiday: [], total_employees: 0, working_employees: 0, date: date || '' };
    }

    // Get comprehensive attendance history including holidays and leaves
    async getEmployeeAttendanceHistory(employee_id, start_date = null, end_date = null) {
        try {
            if (!employee_id || !start_date || !end_date) {
                console.warn('Missing required parameters for attendance history');
                return { attendance_records: [], summary_stats: {}, date_range: {}, holidays: [], leaves: [] };
            }
            
            // Ensure dates are properly formatted and inclusive
            const formattedStartDate = start_date;
            const formattedEndDate = end_date;
            
            // Validate date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(formattedStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(formattedEndDate)) {
                console.error('Invalid date format. Expected YYYY-MM-DD');
                return { attendance_records: [], summary_stats: {}, date_range: {}, holidays: [], leaves: [] };
            }
            
            console.log('Fetching comprehensive attendance data:', { 
                employee_id, 
                start_date: formattedStartDate, 
                end_date: formattedEndDate,
                inclusive: 'Both start and end dates included',
                dateRange: `From ${formattedStartDate} to ${formattedEndDate} (inclusive)`
            });
            
            // Fetch all data in parallel with proper date range
            const [attendanceResp, holidaysResp, leavesResp] = await Promise.all([
                ApiService.getAttendanceRecords({
                    employee: employee_id,
                    start_date: formattedStartDate,
                    end_date: formattedEndDate
                }),
                ApiService.get('/api/method/hrms.api.get_holidays', {
                    start_date: formattedStartDate,
                    end_date: formattedEndDate
                }),
                ApiService.get('/api/method/hrms.api.get_leave_applications', {
                    employee: employee_id
                })
            ]);
            
            console.log('Attendance response:', attendanceResp);
            console.log('Holidays response:', holidaysResp);
            console.log('Leaves response:', leavesResp);
            
            // Extract data from responses
            const attendanceRecords = this.extractAttendanceData(attendanceResp);
            const holidays = this.extractHolidaysData(holidaysResp);
            const leaves = this.extractLeavesData(leavesResp, start_date, end_date);
            
            // Create comprehensive calendar data
            const comprehensiveData = this.createComprehensiveCalendar(
                attendanceRecords, holidays, leaves, start_date, end_date
            );
            
            // Calculate enhanced summary stats
            const summary_stats = this.calculateEnhancedSummaryStats(
                comprehensiveData, start_date, end_date, holidays.length
            );
            
            console.log('Final comprehensive data:', {
                attendance_count: comprehensiveData.length,
                holidays_count: holidays.length,
                leaves_count: leaves.length,
                summary_stats
            });
            
            return {
                attendance_records: comprehensiveData,
                summary_stats: summary_stats,
                date_range: {
                    start_date: start_date,
                    end_date: end_date
                },
                holidays: holidays,
                leaves: leaves
            };
        } catch (error) {
            console.error('Error fetching comprehensive attendance history:', error);
            return { attendance_records: [], summary_stats: {}, date_range: {}, holidays: [], leaves: [] };
        }
    }

    // Extract attendance data from API response
    extractAttendanceData(response) {
        if (response?.success || response?.data?.message?.status === 'success') {
            return response.data?.message?.data || response.data?.data || response.data?.message || [];
        }
        return [];
    }

    // Extract holidays data from API response
    extractHolidaysData(response) {
        console.log('Extracting holidays data from:', response);
        
        if (response?.success || response?.data?.message?.status === 'success') {
            const holidays = response.data?.message?.data || response.data?.data || response.data?.message || [];
            console.log('Extracted holidays:', holidays);
            return Array.isArray(holidays) ? holidays : [];
        }
        console.log('No holidays data found, returning empty array');
        return [];
    }

    // Extract leaves data from API response and filter by date range
    extractLeavesData(response, start_date, end_date) {
        console.log('Extracting leaves data from:', response);
        
        let leaves = [];
        if (response?.success || response?.data?.message?.status === 'success') {
            leaves = response.data?.message || response.data?.data || [];
        }
        
        console.log('Raw leaves data:', leaves);
        
        // Ensure leaves is an array
        if (!Array.isArray(leaves)) {
            console.log('Leaves data is not an array, returning empty array');
            return [];
        }
        
        // Filter leaves that fall within the date range
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
        
        const filteredLeaves = leaves.filter(leave => {
            if (!leave.from_date || !leave.to_date) return false;
            const fromDate = new Date(leave.from_date);
            const toDate = new Date(leave.to_date);
            return (fromDate <= endDate && toDate >= startDate);
        });
        
        console.log('Filtered leaves:', filteredLeaves);
        return filteredLeaves;
    }

    // Create comprehensive calendar with all data types
    createComprehensiveCalendar(attendanceRecords, holidays, leaves, start_date, end_date) {
        console.log('Creating comprehensive calendar with:', {
            attendanceRecords: attendanceRecords?.length || 0,
            holidays: holidays?.length || 0,
            leaves: leaves?.length || 0
        });
        
        const calendar = new Map();
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
        
        // Ensure all inputs are arrays
        const safeAttendanceRecords = Array.isArray(attendanceRecords) ? attendanceRecords : [];
        const safeHolidays = Array.isArray(holidays) ? holidays : [];
        const safeLeaves = Array.isArray(leaves) ? leaves : [];
        
        // Add attendance records with proper field mapping
        safeAttendanceRecords.forEach(record => {
            const date = record.attendance_date;
            
            // Map database fields to UI fields and determine actual status
            const mappedRecord = {
                ...record,
                // Map database fields to UI expected fields
                check_in: record.in_time || record.check_in,
                check_out: record.out_time || record.check_out,
                // Status logic:
                // - If docstatus = 0 (draft) AND in_time exists = Present (checked in, waiting for checkout)
                // - If docstatus = 1 (submitted) = use actual status from database (Present/Work From Home/On Leave)
                // - If no in_time = Absent
                status: record.docstatus === 0 && record.in_time 
                    ? 'Present' 
                    : record.status || 'Absent',
                type: 'attendance',
                work_mode: this.determineWorkMode(record),
                docstatus: record.docstatus
            };
            
            calendar.set(date, mappedRecord);
        });
        
        // Add holidays
        safeHolidays.forEach(holiday => {
            const date = holiday.holiday_date;
            if (!calendar.has(date)) {
                calendar.set(date, {
                    attendance_date: date,
                    type: 'holiday',
                    status: 'Holiday',
                    description: holiday.description,
                    check_in: null,
                    check_out: null,
                    work_mode: 'Holiday'
                });
            }
        });
        
        // Add leave days
        safeLeaves.forEach(leave => {
            if (!leave.from_date || !leave.to_date) return;
            
            const fromDate = new Date(leave.from_date);
            const toDate = new Date(leave.to_date);
            
            for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
                const dateStr = this.formatDateLocal(d);
                if (d >= startDate && d <= endDate && !calendar.has(dateStr)) {
                    calendar.set(dateStr, {
                        attendance_date: dateStr,
                        type: 'leave',
                        status: 'On Leave',
                        leave_type: leave.leave_type,
                        description: leave.description,
                        check_in: null,
                        check_out: null,
                        work_mode: 'On Leave'
                    });
                }
            }
        });
        
        // Add missing weekdays as absent (inclusive of both start and end dates)
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = this.formatDateLocal(d);
            const dayOfWeek = d.getDay();
            
            console.log(`Processing date: ${dateStr}, Day: ${dayOfWeek}, In calendar: ${calendar.has(dateStr)}`);
            
            // Skip weekends (Saturday = 6, Sunday = 0)
            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !calendar.has(dateStr)) {
                calendar.set(dateStr, {
                    attendance_date: dateStr,
                    type: 'absent',
                    status: 'Absent',
                    check_in: null,
                    check_out: null,
                    work_mode: 'Absent'
                });
                console.log(`Added absent day: ${dateStr}`);
            }
        }
        
        // Convert to array and sort by date (newest first)
        const result = Array.from(calendar.values()).sort((a, b) => 
            new Date(b.attendance_date) - new Date(a.attendance_date)
        );
        
        console.log('Comprehensive calendar created:', {
            totalEntries: result.length,
            dateRange: `${start_date} to ${end_date} (inclusive)`,
            startDate: this.formatDateLocal(startDate),
            endDate: this.formatDateLocal(endDate),
            firstEntry: result[result.length - 1]?.attendance_date,
            lastEntry: result[0]?.attendance_date,
            entryTypes: {
                attendance: result.filter(r => r.type === 'attendance').length,
                holidays: result.filter(r => r.type === 'holiday').length,
                leaves: result.filter(r => r.type === 'leave').length,
                absent: result.filter(r => r.type === 'absent').length
            }
        });
        
        return result;
    }

    // Determine work mode from attendance record
    determineWorkMode(record) {
        // Check if it's WFH based on location or work type indicators
        if (record.work_type === 'WFH' || 
            (record.check_in && record.check_in.includes('WFH')) ||
            record.status === 'Work From Home') {
            return 'Work From Home';
        }
        return 'Office';
    }

    // Calculate enhanced summary statistics
    calculateEnhancedSummaryStats(records, start_date, end_date, holidayCount) {
        console.log('Calculating enhanced summary stats for:', records.length, 'records');
        
        if (!records || !Array.isArray(records) || records.length === 0) {
            return {
                total_records: 0,
                present_days: 0,
                wfh_days: 0,
                absent_days: 0,
                leave_days: 0,
                holiday_days: 0,
                late_arrivals: 0,
                total_working_hours: 0,
                avg_working_hours: 0,
                attendance_percentage: 0
            };
        }

        // Count different types of days more accurately
        // Present days: attendance records with in_time (includes both draft check-ins and submitted Present/WFH)
        const present_days = records.filter(r => 
            r.type === 'attendance' && 
            (r.check_in || r.in_time) && 
            (r.status === 'Present' || (r.docstatus === 0 && r.in_time))
        ).length;
        
        // WFH days: attendance records with check-in and WFH work mode (submitted only)
        const wfh_days = records.filter(r => 
            r.type === 'attendance' && 
            (r.check_in || r.in_time) && 
            r.docstatus === 1 &&
            (r.work_mode === 'Work From Home' || r.status === 'Work From Home')
        ).length;
        
        // Absent days: marked as absent or no check-in on working days
        const absent_days = records.filter(r => 
            r.type === 'absent' || 
            (r.type === 'attendance' && !r.check_in && !r.in_time && r.status === 'Absent')
        ).length;
        
        const leave_days = records.filter(r => 
            r.status === 'On Leave' || r.type === 'leave'
        ).length;
        
        // Count holidays from actual calendar records within date range
        const holiday_days = records.filter(r => 
            r.type === 'holiday' || r.status === 'Holiday'
        ).length;
        
        // Calculate total working days (excluding weekends) - inclusive of both boundary dates
        const start = new Date(start_date);
        const end = new Date(end_date);
        let workingDays = 0;
        
        console.log(`Calculating working days from ${start_date} to ${end_date} (inclusive)`);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            const dateStr = this.formatDateLocal(d);
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
                workingDays++;
                console.log(`Working day counted: ${dateStr}`);
            }
        }
        
        console.log(`Total working days in range: ${workingDays}`);
        
        const totalAttendedDays = present_days + wfh_days;
        
        // Calculate available working days (excluding holidays and leaves from total working days)
        const availableWorkingDays = workingDays - holiday_days - leave_days;
        
        // Calculate attendance percentage based on available working days
        const attendance_percentage = availableWorkingDays > 0 ? 
            Math.min(100, (totalAttendedDays / availableWorkingDays) * 100) : 0;
        
        console.log('Attendance calculation:', {
            workingDays,
            holiday_days,
            leave_days,
            availableWorkingDays,
            totalAttendedDays,
            attendance_percentage
        });

        const stats = {
            total_records: records.length,
            present_days: present_days,
            wfh_days: wfh_days,
            absent_days: absent_days,
            leave_days: leave_days,
            holiday_days: holiday_days,
            late_arrivals: 0, // Can be calculated with shift times
            total_working_hours: this.calculateTotalWorkingHours(records),
            avg_working_hours: 0,
            attendance_percentage: Math.round(attendance_percentage * 10) / 10,
            working_days: workingDays,
            attended_days: totalAttendedDays
        };
        
        stats.avg_working_hours = stats.total_working_hours > 0 ? 
            Math.round((stats.total_working_hours / totalAttendedDays) * 10) / 10 : 0;

        console.log('Enhanced summary stats calculated:', stats);
        return stats;
    }

    // Calculate total working hours from records
    calculateTotalWorkingHours(records) {
        let totalHours = 0;
        records.forEach(record => {
            if (record.check_in && record.check_out) {
                try {
                    const checkIn = new Date(record.check_in);
                    const checkOut = new Date(record.check_out);
                    const diffMs = checkOut.getTime() - checkIn.getTime();
                    const hours = diffMs / (1000 * 60 * 60);
                    if (hours > 0 && hours < 24) { // Sanity check
                        totalHours += hours;
                    }
                } catch (error) {
                    console.warn('Error calculating hours for record:', record, error);
                }
            }
        });
        return Math.round(totalHours * 10) / 10;
    }

}

export default new AttendanceService();
