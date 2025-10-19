// src/services/attendance.service.js
import ApiService from './api.service';

const ENDPOINTS = {
    GEO_ATTENDANCE: '/api/method/hrms.api.geo_attendance',
    GET_OFFICE_LOCATION: '/api/method/hrms.api.get_office_location',
    GET_USER_WFH_INFO: '/api/method/hrms.api.get_user_wfh_info',
    GET_EMPLOYEE_WFH_LIST: '/api/method/hrms.api.get_employee_wfh_list',
    TOGGLE_WFH_ELIGIBILITY: '/api/method/hrms.api.toggle_wfh_eligibility',
    TODAY_ATTENDANCE: '/api/method/hrms.api.get_today_attendance',
};

class AttendanceService {
    async geoAttendance({ employee, action, latitude, longitude, work_type }) {
        const isWFH = work_type === 'WFH';
        const lat = isWFH ? 0 : Number(latitude ?? 0);
        const lon = isWFH ? 0 : Number(longitude ?? 0);

        return ApiService.post(ENDPOINTS.GEO_ATTENDANCE, {
            employee,
            action,
            latitude: lat,
            longitude: lon,
            work_type: isWFH ? 'WFH' : undefined,
        });
    }

    async getOfficeLocation(employee) {
        return ApiService.get(ENDPOINTS.GET_OFFICE_LOCATION, { employee });
    }

    async getUserWFHInfo() {
        return ApiService.get(ENDPOINTS.GET_USER_WFH_INFO);
    }

    async getEmployeeWFHList() {
        return ApiService.get(ENDPOINTS.GET_EMPLOYEE_WFH_LIST);
    }

    async toggleWFHEligibility(employee_id, wfh_eligible) {
        return ApiService.post(ENDPOINTS.TOGGLE_WFH_ELIGIBILITY, {
            employee_id,
            wfh_eligible: !!wfh_eligible ? 1 : 0,
        });
    }

    async getTodayAttendance() {
        return ApiService.get(ENDPOINTS.TODAY_ATTENDANCE);
    }
}

export default new AttendanceService();
