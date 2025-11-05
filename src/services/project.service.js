// src/services/project.service.js
import ApiService from './api.service';

const unwrap = (res) => res?.data?.message ?? res?.data ?? res;

// Base API path - change if your backend module name is different
const BASE = '/api/method/hrms.api';

/**
 * Handle API errors consistently
 */
const handleError = (error, context = '') => {
    console.error(`${context} Error:`, error);

    let message = 'An unexpected error occurred';

    if (error?.response?.data?.message) {
        message = error.response.data.message;
    } else if (error?.response?.data?.exc) {
        // Frappe exception format
        try {
            const exc = JSON.parse(error.response.data.exc);
            message = exc[0] || message;
        } catch (e) {
            message = error.response.data.exc;
        }
    } else if (error?.message) {
        message = error.message;
    }

    throw new Error(message);
};

/** ============ Employee-scoped: Projects ============ */

/**
 * Get list of projects for current user
 */
export const listProjects = async ({ q = '', limit = 200 } = {}) => {
    try {
        const res = await ApiService.post(`${BASE}.my_projects`, { q, limit });
        return unwrap(res);
    } catch (error) {
        handleError(error, 'List Projects');
    }
};

/**
 * Get detailed information about a project
 */
export const getProjectDetail = async (project) => {
    try {
        if (!project) {
            throw new Error('Project ID is required');
        }
        const res = await ApiService.post(`${BASE}.my_project_summary`, { project });
        return unwrap(res);
    } catch (error) {
        handleError(error, 'Get Project Detail');
    }
};

/** ============ Membership Management (Admin/HR/PM) ============ */

/**
 * Assign members to a project
 */
export const assignMembers = async (project, employee_ids, role_in_project = 'Contributor') => {
    try {
        if (!project) {
            throw new Error('Project ID is required');
        }
        if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
            throw new Error('At least one employee must be selected');
        }

        console.log('Assigning members:', { project, employee_ids, role_in_project });

        const res = await ApiService.post(`${BASE}.assign_members`, {
            project,
            employee_ids: JSON.stringify(employee_ids),
            role_in_project,
        });

        const result = unwrap(res);
        console.log('Assign members response:', result);

        return result;
    } catch (error) {
        handleError(error, 'Assign Members');
    }
};

/**
 * Remove a member from a project
 */
export const removeMember = async (project, employee) => {
    try {
        if (!project) {
            throw new Error('Project ID is required');
        }
        if (!employee) {
            throw new Error('Employee ID is required');
        }

        const res = await ApiService.post(`${BASE}.remove_member`, { project, employee });
        return unwrap(res);
    } catch (error) {
        handleError(error, 'Remove Member');
    }
};

/** ============ Tasks ============ */

/**
 * Get list of tasks for a project
 */
export const listTasks = async (project, { status, limit = 200 } = {}) => {
    try {
        if (!project) {
            throw new Error('Project ID is required');
        }

        const res = await ApiService.post(`${BASE}.my_tasks`, { project, status, limit });
        return unwrap(res);
    } catch (error) {
        handleError(error, 'List Tasks');
    }
};

/**
 * Create a new task
 */
export const createTask = async (project, title, description = '', extra = {}) => {
    try {
        if (!project) {
            throw new Error('Project ID is required');
        }
        if (!title || !title.trim()) {
            throw new Error('Task title is required');
        }

        const payload = {
            project,
            subject: title.trim(),
            description: description?.trim() || '',
            ...extra
        };

        console.log('Creating task with payload:', payload);

        const res = await ApiService.post(`${BASE}.create_task`, payload);
        const result = unwrap(res);

        console.log('Create task response:', result);

        return result;
    } catch (error) {
        handleError(error, 'Create Task');
    }
};

/** ============ Task Logs ============ */

/**
 * Get list of logs for a project/task
 */
export const listProjectLogs = async (project, { task, limit = 200 } = {}) => {
    try {
        if (!project) {
            throw new Error('Project ID is required');
        }

        const res = await ApiService.post(`${BASE}.my_task_logs`, { project, task, limit });
        return unwrap(res);
    } catch (error) {
        handleError(error, 'List Project Logs');
    }
};

/**
 * Add a task log entry
 */
export const addTaskLog = async ({ task, description, log_time = null }) => {
    try {
        if (!task) {
            throw new Error('Task ID is required');
        }
        if (!description || !description.trim()) {
            throw new Error('Log description is required');
        }

        const res = await ApiService.post(`${BASE}.add_task_log`, {
            task,
            description: description.trim(),
            log_time
        });

        return unwrap(res);
    } catch (error) {
        handleError(error, 'Add Task Log');
    }
};

/**
 * Legacy: Start a log (now just creates a log entry)
 */
export const startLog = async ({ project, task = null, message = '' }) => {
    try {
        if (!task) {
            throw new Error('Task ID is required');
        }
        if (!message || !message.trim()) {
            throw new Error('Log message is required');
        }

        const res = await ApiService.post(`${BASE}.add_task_log`, {
            task,
            description: message.trim()
        });

        return unwrap(res);
    } catch (error) {
        handleError(error, 'Start Log');
    }
};

/**
 * Legacy: Stop a log (no-op with single-entry logs)
 */
export const stopLog = async ({ log_name, message = '', new_status = 'Completed' }) => {
    // No-op with single-entry logs to maintain backward compatibility
    return {
        ok: true,
        message: 'Stop not required with single-entry logs'
    };
};

/** ============ Admin Views ============ */

/**
 * Admin: Get all projects
 */
export const adminListProjects = async ({ q = '', limit = 200 } = {}) => {
    try {
        const res = await ApiService.post(`${BASE}.admin_projects`, { q, limit });
        return unwrap(res);
    } catch (error) {
        handleError(error, 'Admin List Projects');
    }
};

/**
 * Admin: Get all tasks (optionally filtered by project)
 */
export const adminListTasks = async (project = null, { limit = 500 } = {}) => {
    try {
        const res = await ApiService.post(`${BASE}.admin_tasks`, { project, limit });
        return unwrap(res);
    } catch (error) {
        handleError(error, 'Admin List Tasks');
    }
};

/**
 * Admin: Get all task logs (optionally filtered by project/task)
 */
export const adminListProjectLogs = async (project = null, { task = null, limit = 500 } = {}) => {
    try {
        const res = await ApiService.post(`${BASE}.admin_task_logs`, { project, task, limit });
        return unwrap(res);
    } catch (error) {
        handleError(error, 'Admin List Project Logs');
    }
};

/** ============ Helper Functions ============ */

/**
 * Get all employees (for member selection modal)
 */
export const getAllEmployees = async () => {
    try {
        const res = await ApiService.get('/api/method/hrms.api.get_all_employees');
        return unwrap(res);
    } catch (error) {
        handleError(error, 'Get All Employees');
    }
};

/**
 * Validate project access for current user
 */
export const validateProjectAccess = async (projectId) => {
    try {
        const detail = await getProjectDetail(projectId);
        return !!detail;
    } catch (error) {
        return false;
    }
};

/**
 * Get project statistics
 */
export const getProjectStats = async (projectId) => {
    try {
        const detail = await getProjectDetail(projectId);

        const tasks = detail?.tasks || [];
        const logs = detail?.logs || [];

        return {
            totalTasks: tasks.length,
            completedTasks: tasks.filter(t => t.status === 'Completed').length,
            openTasks: tasks.filter(t => t.status === 'Open').length,
            totalLogs: logs.length,
            recentLogs: logs.slice(0, 10),
        };
    } catch (error) {
        handleError(error, 'Get Project Stats');
    }
};

export default {
    // Employee functions
    listProjects,
    getProjectDetail,
    listTasks,
    createTask,
    listProjectLogs,
    addTaskLog,
    startLog,
    stopLog,

    // Admin functions
    adminListProjects,
    adminListTasks,
    adminListProjectLogs,
    assignMembers,
    removeMember,

    // Helper functions
    getAllEmployees,
    validateProjectAccess,
    getProjectStats,
};