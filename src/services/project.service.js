// src/services/project.service.js
import api from './api.service';

const unwrap = (res) => res?.data?.message ?? res?.data ?? res;

/** Projects */
export const listProjects = async ({ q = '', limit = 200 } = {}) => {
    const res = await api.post('/api/method/hrms.api.list_projects', { q, limit });
    return unwrap(res);
};

export const getProjectDetail = async (project) => {
    const res = await api.post('/api/method/hrms.api.get_project_detail', { project });
    return unwrap(res);
};

/** Membership (PM/Admin only) */
export const assignMembers = async (project, employee_ids) => {
    const res = await api.post('/api/method/hrms.api.assign_members', {
        project,
        employee_ids: JSON.stringify(employee_ids),
    });
    return unwrap(res);
};

export const removeMember = async (project, employee) => {
    const res = await api.post('/api/method/hrms.api.remove_member', { project, employee });
    return unwrap(res);
};

/** Tasks */
export const listTasks = async (project, { status, limit = 200 } = {}) => {
    const res = await api.post('/api/method/hrms.api.list_tasks', { project, status, limit });
    return unwrap(res);
};

export const createTask = async (project, title, description = '') => {
    const res = await api.post('/api/method/hrms.api.create_task', {
        project,
        title,
        description,
    });
    return unwrap(res);
};

/** Logs */
export const listProjectLogs = async (project, { task, limit = 200 } = {}) => {
    const res = await api.post('/api/method/hrms.api.list_project_logs', {
        project,
        task,
        limit,
    });
    return unwrap(res);
};

export const startLog = async ({ project, task = null, message = '' }) => {
    const res = await api.post('/api/method/hrms.api.start_log', {
        project,
        task,
        message,
    });
    return unwrap(res);
};

export const stopLog = async ({ log_name, message = '', new_status = 'Completed' }) => {
    const res = await api.post('/api/method/hrms.api.stop_log', {
        log_name,
        message,
        new_status,
    });
    return unwrap(res);
};

/** Helpers used by member modal (from your backend) */
export const getAllEmployees = async () => {
    const res = await api.get('/api/method/hrms.api.get_all_employees');
    return unwrap(res);
};
