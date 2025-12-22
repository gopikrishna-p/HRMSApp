import ApiService from './api.service';

class StandupService {
  // ============== HELPER METHODS ==============

  /**
   * Normalize standup data from API response to common format
   * @param {object} apiData - Raw data from API
   */
  _normalizeStandupData(apiData) {
    if (!apiData) return null;

    return {
      name: apiData.standup_id || apiData.name,
      standup_id: apiData.standup_id || apiData.name,
      employee_name: apiData.employee_name,
      department: apiData.department,
      date: apiData.standup_date || apiData.date,
      standup_date: apiData.standup_date || apiData.date,
      time: apiData.standup_time || apiData.time,
      remarks: apiData.remarks || apiData.manager_remarks,
      manager_remarks: apiData.remarks || apiData.manager_remarks,
      status: apiData.is_submitted ? 'Submitted' : 'Draft',
      is_submitted: apiData.is_submitted,
      docstatus: apiData.docstatus,
      tasks: apiData.tasks || [],
      task_count: apiData.tasks?.length || 0,
      statistics: apiData.statistics,
    };
  }

  // ============== EMPLOYEE APIs ==============

  /**
   * Get or create today's standup for the logged-in employee
   */
  async getOrCreateTodayStandup() {
    try {
      const response = await ApiService.get('/api/method/hrms.api.get_or_create_today_standup');
      if (response.success && response.data?.message) {
        return response.data.message;
      }
      throw new Error(response.data?.message || 'Failed to fetch standup');
    } catch (error) {
      console.error('Error getting today standup:', error);
      throw error;
    }
  }

  /**
   * Submit employee's morning standup task
   * @param {string} standupId - Standup ID
   * @param {string} taskTitle - Task title
   * @param {string} plannedOutput - What employee plans to do
   * @param {number} completionPercentage - Initial completion % (usually 0)
   */
  async submitEmployeeStandupTask(standupId, taskTitle, plannedOutput, completionPercentage = 0) {
    try {
      const payload = {
        standup_id: standupId,
        task_title: taskTitle,
        planned_output: plannedOutput,
        completion_percentage: completionPercentage,
      };

      const response = await ApiService.post('/api/method/hrms.api.submit_employee_standup_task', payload);
      if (response.success && response.data?.message) {
        return response.data.message;
      }
      throw new Error(response.data?.message || 'Failed to submit standup task');
    } catch (error) {
      console.error('Error submitting standup task:', error);
      throw error;
    }
  }

  /**
   * Update employee's standup task (typically evening entry)
   * @param {string} standupId - Standup ID
   * @param {string} actualWorkDone - What was actually accomplished
   * @param {number} completionPercentage - Updated completion %
   * @param {string} taskStatus - Task status (Draft, Completed, etc)
   * @param {number} carryForward - 1 if carrying forward to next day, 0 otherwise
   * @param {string} nextWorkingDate - Date to carry forward to (if applicable)
   */
  async updateEmployeeStandupTask(
    standupId,
    actualWorkDone,
    completionPercentage,
    taskStatus,
    carryForward = 0,
    nextWorkingDate = null
  ) {
    try {
      const payload = {
        standup_id: standupId,
        actual_work_done: actualWorkDone,
        completion_percentage: completionPercentage,
        task_status: taskStatus,
        carry_forward: carryForward,
        next_working_date: nextWorkingDate,
      };

      const response = await ApiService.post('/api/method/hrms.api.update_employee_standup_task', payload);
      if (response.success && response.data?.message) {
        return response.data.message;
      }
      throw new Error(response.data?.message || 'Failed to update standup task');
    } catch (error) {
      console.error('Error updating standup task:', error);
      throw new Error(`Failed to update standup task: ${error.message}`);
    }
  }

  /**
   * Get employee's standup history
   * @param {string} fromDate - Start date (YYYY-MM-DD)
   * @param {string} toDate - End date (YYYY-MM-DD)
   * @param {number} limit - Max results (default 10)
   */
  async getEmployeeStandupHistory(fromDate = null, toDate = null, limit = 10) {
    try {
      const params = { limit };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const response = await ApiService.get('/api/method/hrms.api.get_employee_standup_history', { params });
      if (response.success && response.data?.message) {
        return response.data.message;
      }
      throw new Error(response.data?.message || 'Failed to fetch standup history');
    } catch (error) {
      console.error('Error fetching standup history:', error);
      throw error;
    }
  }

  // ============== ADMIN APIs ==============

  /**
   * Get all standups (Admin only)
   * @param {string} fromDate - Filter from date
   * @param {string} toDate - Filter to date
   * @param {string} department - Filter by department
   * @param {number} limit - Max results
   */
  async getAllStandups(fromDate = null, toDate = null, department = null, limit = 100) {
    try {
      const params = { limit };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (department) params.department = department;

      console.log('📊 Fetching all standups with params:', params);
      const response = await ApiService.get('/api/method/hrms.api.get_all_standups', { params });
      
      if (response.success === false) {
        throw new Error(response.message || 'Failed to fetch all standups');
      }

      const frappeResponse = response.data?.message || response.data;
      
      if (frappeResponse?.status === 'success' && frappeResponse?.data) {
        console.log('✅ All standups fetched successfully');
        
        // Normalize the standup items in the list
        const normalizedData = {
          ...frappeResponse.data,
          standups: (frappeResponse.data.standups || []).map(standup => 
            this._normalizeStandupData(standup)
          ),
        };
        
        return {
          ...frappeResponse,
          data: normalizedData,
        };
      }
      
      throw new Error(frappeResponse?.message || 'Failed to fetch all standups');
    } catch (error) {
      console.error('❌ Error fetching all standups:', error.message);
      throw error;
    }
  }

  /**
   * Get detailed view of a specific standup (Admin only)
   * @param {string} standupId - Standup ID
   */
  async getStandupDetail(standupId) {
    try {
      if (!standupId) {
        throw new Error('Standup ID is required');
      }

      console.log('🔍 Fetching standup detail for:', standupId);
      
      // Use POST to ensure parameter is passed correctly
      const response = await ApiService.post('/api/method/hrms.api.get_standup_detail', {
        standup_id: standupId,
      });
      
      console.log('📋 Raw response:', response);
      
      // Check for API service error
      if (response.success === false) {
        throw new Error(response.message || 'API request failed');
      }

      // Extract the actual response
      // ApiService wraps response as { success: true, data: {...}, status: 200 }
      // Frappe wraps our return as { message: {...}, status: 'success', data: {...} }
      // So response.data contains what Frappe returned
      const frappeResponse = response.data;
      
      // Handle case where response is wrapped in 'message' by Frappe
      const apiResponse = frappeResponse?.message || frappeResponse;
      
      console.log('🔍 Extracted response:', apiResponse);
      
      if (apiResponse?.status === 'success' && apiResponse?.data) {
        console.log('✅ Standup detail fetched successfully');
        
        // Normalize the data to consistent format
        const normalizedData = this._normalizeStandupData(apiResponse.data);
        console.log('✅ Normalized standup data:', normalizedData);
        
        return {
          status: 'success',
          data: normalizedData,
          message: apiResponse.message,
        };
      }
      
      // If response has error structure
      if (apiResponse?.status === 'error') {
        throw new Error(apiResponse?.message || 'Server returned error');
      }
      
      throw new Error('Invalid response format from server');
    } catch (error) {
      console.error('❌ Error fetching standup detail:', error.message);
      throw error;
    }
  }

  /**
   * Submit/finalize a standup (Admin only)
   * @param {string} standupId - Standup ID
   * @param {string} remarks - Optional manager remarks
   */
  async submitStandup(standupId, remarks = null) {
    try {
      const payload = { standup_id: standupId };
      if (remarks) payload.remarks = remarks;

      console.log('📤 Submitting standup:', payload);
      const response = await ApiService.post('/api/method/hrms.api.submit_standup', payload);
      
      if (response.success === false) {
        throw new Error(response.message || 'Failed to submit standup');
      }

      const frappeResponse = response.data?.message || response.data;
      
      if (frappeResponse?.status === 'success') {
        console.log('✅ Standup submitted successfully');
        return frappeResponse;
      }
      
      throw new Error(frappeResponse?.message || 'Failed to submit standup');
    } catch (error) {
      console.error('❌ Error submitting standup:', error.message);
      throw error;
    }
  }

  /**
   * Amend/unlock a submitted standup (Admin only)
   * @param {string} standupId - Standup ID
   */
  async amendStandup(standupId) {
    try {
      console.log('🔓 Amending standup:', standupId);
      const response = await ApiService.post('/api/method/hrms.api.amend_standup', {
        standup_id: standupId,
      });
      
      if (response.success === false) {
        throw new Error(response.message || 'Failed to amend standup');
      }

      const frappeResponse = response.data?.message || response.data;
      
      if (frappeResponse?.status === 'success') {
        console.log('✅ Standup amended successfully');
        return frappeResponse;
      }
      
      throw new Error(frappeResponse?.message || 'Failed to amend standup');
    } catch (error) {
      console.error('❌ Error amending standup:', error.message);
      throw error;
    }
  }

  /**
   * Get department standup summary (Admin only)
   * Per API docs: GET /api/method/hrms.api.get_department_standup_summary?department=X&from_date=Y&to_date=Z
   * @param {string} fromDate - Filter from date (YYYY-MM-DD)
   * @param {string} toDate - Filter to date (YYYY-MM-DD)
   * @param {string} department - Department name (optional for getting all departments summary)
   */
  async getDepartmentStandupSummary(fromDate = null, toDate = null, department = null) {
    try {
      const params = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (department) params.department = department;

      console.log('🏢 Fetching department standup summary:', params);
      
      // Use GET with query params as per API docs
      const response = await ApiService.get('/api/method/hrms.api.get_department_standup_summary', { params });
      
      console.log('📨 Department summary raw response:', response);
      
      if (response.success === false) {
        console.error('❌ API returned error:', response.message);
        throw new Error(response.message || 'Failed to fetch department standup summary');
      }

      const frappeResponse = response.data?.message || response.data;
      
      console.log('📦 Frappe response:', frappeResponse);
      
      if (frappeResponse?.status === 'success' && frappeResponse?.data) {
        console.log('✅ Department standup summary fetched successfully');
        
        // Handle both department-specific and all-departments response
        const data = frappeResponse.data;
        
        // If it's a single department response with employee_summary
        if (data.employee_summary) {
          console.log('✅ Single department response with employee summary');
          return frappeResponse;
        }
        
        // If it's all departments (array)
        if (Array.isArray(data)) {
          console.log('✅ All departments response (array format)');
          return { data, status: 'success', message: frappeResponse.message };
        }
        
        return frappeResponse;
      } else if (Array.isArray(frappeResponse)) {
        // Handle case where response is directly an array
        console.log('✅ Department standup summary fetched (array format)');
        return { data: frappeResponse, status: 'success' };
      }
      
      console.error('⚠️ Unexpected response format:', frappeResponse);
      throw new Error(frappeResponse?.message || 'Failed to fetch department standup summary');
    } catch (error) {
      console.error('❌ Error fetching department standup summary:', error);
      console.error('📋 Error details:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new StandupService();
