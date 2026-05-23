// src/utils/employeeData.js
//
// Shared employee-list loader. Previously inlined identically in
// LeaveApprovalsScreen, CompApprovalScreen, ExpenseClaimApprovalScreen and
// TravelRequestApproval — each calling `apiService.getAllEmployees()` and
// unwrapping the same nested `.employees` array. Centralized here so the
// shape contract lives in one place (the backend returns
// `{status, employees:[...], statistics, filters}`).

import apiService, { extractFrappeData, isApiSuccess } from '../services/api.service';

/**
 * Fetch the admin's full employee directory. Returns an array of employee
 * objects (or an empty array on error). Caller is expected to pass the
 * `setEmployees` setter — failures fall back to an empty list rather than
 * leaving the previous data stale.
 *
 * @returns {Promise<Array<object>>} list of employees (empty on failure)
 */
export const loadAllEmployees = async () => {
    try {
        const response = await apiService.getAllEmployees();
        if (!isApiSuccess(response)) return [];
        const data = extractFrappeData(response, {});
        // Backend returns the array under `.employees`. Defensive: accept
        // a bare array shape too in case the contract ever changes.
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.employees)) return data.employees;
        return [];
    } catch (err) {
        // Keep the original logging behavior — callers usually console.error
        // their own context too, but a central swallow here prevents the
        // screen from crashing if the network blows up.
        console.error('loadAllEmployees error:', err?.message || err);
        return [];
    }
};

export default loadAllEmployees;
