import ApiService from './api.service';

class StandupService {
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
        return frappeResponse;
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
        return apiResponse;
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
   * @param {string} department - Department name
   * @param {string} fromDate - Filter from date
   * @param {string} toDate - Filter to date
   */
  async getDepartmentStandupSummary(department, fromDate = null, toDate = null) {
    try {
      const params = { department };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      console.log('🏢 Fetching department standup summary:', params);
      const response = await ApiService.get('/api/method/hrms.api.get_department_standup_summary', {
        params,
      });
      
      if (response.success === false) {
        throw new Error(response.message || 'Failed to fetch department standup summary');
      }

      const frappeResponse = response.data?.message || response.data;
      
      if (frappeResponse?.status === 'success' && frappeResponse?.data) {
        console.log('✅ Department standup summary fetched successfully');
        return frappeResponse;
      }
      
      throw new Error(frappeResponse?.message || 'Failed to fetch department standup summary');
    } catch (error) {
      console.error('❌ Error fetching department standup summary:', error.message);
      throw error;
    }
  }
}

export default new StandupService();
