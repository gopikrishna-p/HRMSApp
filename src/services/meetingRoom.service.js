import ApiService from './api.service';

class MeetingRoomService {
  // ============== HELPER METHODS ==============

  /**
   * Normalize booking data from API response
   * @param {object} booking - Raw booking data from API
   */
  _normalizeBooking(booking) {
    if (!booking) return null;

    return {
      id: booking.booking_id || booking.name,
      booking_id: booking.booking_id || booking.name,
      meeting_room: booking.meeting_room,
      room_name: booking.room_name || booking.meeting_room,
      location: booking.location,
      capacity: booking.capacity,
      employee: booking.employee,
      employee_name: booking.employee_name,
      booking_date: booking.booking_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      duration_hours: booking.duration_hours,
      reason: booking.reason,
      cost: booking.cost,
      is_own_booking: booking.is_own_booking,
    };
  }

  // ============== MEETING ROOM APIs ==============

  /**
   * Get all available meeting rooms
   * @param {string} location - Filter by location (optional)
   * @param {number} minCapacity - Filter by minimum capacity (optional)
   */
  async getMeetingRooms(location = null, minCapacity = null) {
    try {
      const params = {};
      if (location) params.location = location;
      if (minCapacity) params.min_capacity = minCapacity;

      console.log('🏢 Fetching meeting rooms...');
      // Only pass params if there are any filters
      const response = Object.keys(params).length > 0
        ? await ApiService.get('/api/method/hrms.api.get_meeting_rooms', params)
        : await ApiService.get('/api/method/hrms.api.get_meeting_rooms');

      if (response.success === false) {
        throw new Error(response.message || 'Failed to fetch meeting rooms');
      }

      const frappeResponse = response.data?.message || response.data;

      if (frappeResponse?.status === 'success') {
        console.log('✅ Meeting rooms fetched:', frappeResponse.data?.rooms?.length || 0);
        return frappeResponse;
      }

      throw new Error(frappeResponse?.message || 'Failed to fetch meeting rooms');
    } catch (error) {
      console.error('❌ Error fetching meeting rooms:', error.message);
      throw error;
    }
  }

  /**
   * Get room availability for a specific date
   * @param {string} meetingRoom - Meeting room name
   * @param {string} date - Date to check (YYYY-MM-DD)
   */
  async getRoomAvailability(meetingRoom, date) {
    try {
      console.log('📅 Fetching room availability:', meetingRoom, date);
      const response = await ApiService.get('/api/method/hrms.api.get_room_availability', {
        meeting_room: meetingRoom,
        date,
      });

      if (response.success === false) {
        throw new Error(response.message || 'Failed to fetch room availability');
      }

      const frappeResponse = response.data?.message || response.data;

      if (frappeResponse?.status === 'success') {
        console.log('✅ Room availability fetched');
        return frappeResponse;
      }

      throw new Error(frappeResponse?.message || 'Failed to fetch room availability');
    } catch (error) {
      console.error('❌ Error fetching room availability:', error.message);
      throw error;
    }
  }

  // ============== BOOKING APIs ==============

  /**
   * Get meeting room bookings
   * @param {string} fromDate - Start date filter
   * @param {string} toDate - End date filter
   * @param {string} meetingRoom - Filter by room (optional)
   * @param {boolean} myBookingsOnly - Show only current user's bookings
   */
  async getBookings(fromDate = null, toDate = null, meetingRoom = null, myBookingsOnly = false) {
    try {
      const params = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (meetingRoom) params.meeting_room = meetingRoom;
      if (myBookingsOnly) params.my_bookings_only = 1;

      console.log('📋 Fetching bookings with params:', params);
      const response = await ApiService.get('/api/method/hrms.api.get_meeting_room_bookings', params);

      if (response.success === false) {
        throw new Error(response.message || 'Failed to fetch bookings');
      }

      const frappeResponse = response.data?.message || response.data;

      if (frappeResponse?.status === 'success') {
        console.log('✅ Bookings fetched:', frappeResponse.data?.statistics?.total_bookings || 0);
        
        // Normalize bookings
        if (frappeResponse.data?.bookings) {
          frappeResponse.data.bookings = frappeResponse.data.bookings.map(b => this._normalizeBooking(b));
        }
        
        return frappeResponse;
      }

      throw new Error(frappeResponse?.message || 'Failed to fetch bookings');
    } catch (error) {
      console.error('❌ Error fetching bookings:', error.message);
      throw error;
    }
  }

  /**
   * Create a new meeting room booking
   * @param {string} meetingRoom - Meeting room name
   * @param {string} bookingDate - Date (YYYY-MM-DD)
   * @param {string} startTime - Start time (HH:MM)
   * @param {string} endTime - End time (HH:MM)
   * @param {string} reason - Reason for booking (optional)
   * @param {string} employee - Employee ID (admin only, for booking on behalf)
   */
  async createBooking(meetingRoom, bookingDate, startTime, endTime, reason = null, employee = null) {
    try {
      const payload = {
        meeting_room: meetingRoom,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
      };
      if (reason) payload.reason = reason;
      if (employee) payload.employee = employee;

      console.log('📝 Creating booking:', payload);
      const response = await ApiService.post('/api/method/hrms.api.create_meeting_room_booking', payload);

      if (response.success === false) {
        throw new Error(response.message || 'Failed to create booking');
      }

      const frappeResponse = response.data?.message || response.data;

      if (frappeResponse?.status === 'success') {
        console.log('✅ Booking created:', frappeResponse.data?.booking_id);
        return frappeResponse;
      }

      throw new Error(frappeResponse?.message || 'Failed to create booking');
    } catch (error) {
      console.error('❌ Error creating booking:', error.message);
      throw error;
    }
  }

  /**
   * Update an existing booking
   * @param {string} bookingId - Booking ID
   * @param {object} updates - Fields to update (start_time, end_time, reason)
   */
  async updateBooking(bookingId, updates) {
    try {
      const payload = { booking_id: bookingId, ...updates };

      console.log('✏️ Updating booking:', bookingId);
      const response = await ApiService.post('/api/method/hrms.api.update_meeting_room_booking', payload);

      if (response.success === false) {
        throw new Error(response.message || 'Failed to update booking');
      }

      const frappeResponse = response.data?.message || response.data;

      if (frappeResponse?.status === 'success') {
        console.log('✅ Booking updated');
        return frappeResponse;
      }

      throw new Error(frappeResponse?.message || 'Failed to update booking');
    } catch (error) {
      console.error('❌ Error updating booking:', error.message);
      throw error;
    }
  }

  /**
   * Cancel a booking
   * @param {string} bookingId - Booking ID to cancel
   */
  async cancelBooking(bookingId) {
    try {
      console.log('🗑️ Cancelling booking:', bookingId);
      const response = await ApiService.post('/api/method/hrms.api.cancel_meeting_room_booking', {
        booking_id: bookingId,
      });

      if (response.success === false) {
        throw new Error(response.message || 'Failed to cancel booking');
      }

      const frappeResponse = response.data?.message || response.data;

      if (frappeResponse?.status === 'success') {
        console.log('✅ Booking cancelled');
        return frappeResponse;
      }

      throw new Error(frappeResponse?.message || 'Failed to cancel booking');
    } catch (error) {
      console.error('❌ Error cancelling booking:', error.message);
      throw error;
    }
  }

  // ============== UTILITY METHODS ==============

  /**
   * Get dates with bookings for a month (for calendar highlighting)
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   */
  async getMonthBookingDates(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    
    const result = await this.getBookings(startDate, endDate);
    
    if (result?.data?.bookings_by_date) {
      return Object.keys(result.data.bookings_by_date);
    }
    
    return [];
  }

  /**
   * Format time for display (e.g., "09:00:00" -> "9:00 AM")
   */
  formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  /**
   * Generate time slots for picker (30-min intervals from 9 AM to 6 PM)
   */
  getTimeSlots() {
    const slots = [];
    for (let hour = 9; hour <= 18; hour++) {
      for (let min = 0; min < 60; min += 30) {
        if (hour === 18 && min > 0) break;
        const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        slots.push({
          value: timeStr,
          label: this.formatTime(timeStr),
        });
      }
    }
    return slots;
  }
}

export default new MeetingRoomService();
