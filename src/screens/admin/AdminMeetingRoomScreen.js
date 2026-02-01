import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  RefreshControl,
  TouchableOpacity,
  FlatList,
  Modal,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import {
  Text,
  useTheme,
  ActivityIndicator,
  FAB,
  Searchbar,
} from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import MeetingRoomService from '../../services/meetingRoom.service';

const AdminMeetingRoomScreen = ({ navigation }) => {
  const { custom } = useTheme();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingsByDate, setBookingsByDate] = useState({});
  const [statistics, setStatistics] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [viewMode, setViewMode] = useState('all'); // 'all', 'mine'
  const [filterRoom, setFilterRoom] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Booking form state
  const [selectedRoom, setSelectedRoom] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingDateObj, setBookingDateObj] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [roomAvailability, setRoomAvailability] = useState(null);

  // Edit mode
  const [editingBooking, setEditingBooking] = useState(null);

  // Time slots
  const timeSlots = MeetingRoomService.getTimeSlots();

  // Get date range for selected month
  const getMonthDateRange = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];
    return { firstDay, lastDay };
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { firstDay, lastDay } = getMonthDateRange(selectedMonth);

      // Fetch rooms and bookings in parallel
      const [roomsResult, bookingsResult] = await Promise.all([
        MeetingRoomService.getMeetingRooms(),
        MeetingRoomService.getBookings(
          firstDay,
          lastDay,
          filterRoom || null,
          viewMode === 'mine'
        ),
      ]);

      if (roomsResult?.data?.rooms) {
        setRooms(roomsResult.data.rooms);
      }

      if (bookingsResult?.data) {
        setBookings(bookingsResult.data.bookings || []);
        setBookingsByDate(bookingsResult.data.bookings_by_date || {});
        setStatistics(bookingsResult.data.statistics);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', error.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, viewMode, filterRoom]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Check room availability when date or room changes
  const checkAvailability = useCallback(async () => {
    if (!selectedRoom || !bookingDate) {
      setRoomAvailability(null);
      return;
    }

    try {
      const result = await MeetingRoomService.getRoomAvailability(selectedRoom, bookingDate);
      if (result?.data) {
        setRoomAvailability(result.data);
      }
    } catch (error) {
      console.error('Error checking availability:', error);
    }
  }, [selectedRoom, bookingDate]);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  // Handle booking submission
  const handleCreateBooking = async () => {
    if (!selectedRoom) {
      Alert.alert('Validation', 'Please select a meeting room');
      return;
    }
    if (!bookingDate) {
      Alert.alert('Validation', 'Please select a date');
      return;
    }
    if (!startTime || !endTime) {
      Alert.alert('Validation', 'Please select start and end times');
      return;
    }

    setSubmitting(true);
    try {
      if (editingBooking) {
        // Update existing booking
        await MeetingRoomService.updateBooking(
          editingBooking.booking_id,
          startTime,
          endTime,
          reason || null
        );
        Alert.alert('Success', 'Booking updated successfully!');
      } else {
        // Create new booking
        await MeetingRoomService.createBooking(
          selectedRoom,
          bookingDate,
          startTime,
          endTime,
          reason || null
        );
        Alert.alert('Success', 'Meeting room booked successfully!');
      }

      setShowBookingModal(false);
      resetBookingForm();
      fetchData();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save booking');
    } finally {
      setSubmitting(false);
    }
  };

  // Edit booking
  const handleEditBooking = (booking) => {
    setEditingBooking(booking);
    setSelectedRoom(booking.meeting_room);
    setBookingDate(booking.booking_date);
    setStartTime(booking.start_time);
    setEndTime(booking.end_time);
    setReason(booking.reason || '');
    setShowBookingModal(true);
  };

  // Cancel booking
  const handleCancelBooking = async (bookingId, employeeName) => {
    Alert.alert(
      'Cancel Booking',
      `Are you sure you want to cancel this booking${employeeName ? ` for ${employeeName}` : ''}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await MeetingRoomService.cancelBooking(bookingId);
              Alert.alert('Success', 'Booking cancelled');
              fetchData();
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to cancel booking');
            }
          },
        },
      ]
    );
  };

  const resetBookingForm = () => {
    setEditingBooking(null);
    setSelectedRoom('');
    setBookingDate('');
    setStartTime('09:00');
    setEndTime('10:00');
    setReason('');
    setRoomAvailability(null);
  };

  // Navigate months
  const changeMonth = (direction) => {
    const newDate = new Date(selectedMonth);
    newDate.setMonth(newDate.getMonth() + direction);
    setSelectedMonth(newDate);
  };

  // Format month display
  const formatMonth = (date) => {
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };

  // Get today's date in YYYY-MM-DD format
  const getTodayString = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Filter bookings by search query
  const filteredBookings = bookings.filter((booking) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      booking.room_name?.toLowerCase().includes(query) ||
      booking.employee_name?.toLowerCase().includes(query) ||
      booking.reason?.toLowerCase().includes(query)
    );
  });

  // Group bookings by date
  const groupedBookings = filteredBookings.reduce((groups, booking) => {
    const date = booking.booking_date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(booking);
    return groups;
  }, {});

  // Sort dates
  const sortedDates = Object.keys(groupedBookings).sort((a, b) => new Date(a) - new Date(b));

  // Render booking item
  const renderBookingItem = (item) => {
    const isOwnBooking = item.is_own_booking;
    const isPast = item.booking_date < getTodayString();
    const canModify = isOwnBooking && !isPast;

    return (
      <View key={item.booking_id} style={[styles.bookingCard, isOwnBooking && styles.ownBookingCard]}>
        <View style={styles.bookingHeader}>
          <View style={styles.bookingRoomInfo}>
            <View style={[styles.roomIcon, { backgroundColor: custom.palette.primary + '15' }]}>
              <Icon name="door-open" size={14} color={custom.palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.roomName}>{item.room_name}</Text>
              {item.location && (
                <Text style={styles.locationText}>{item.location}</Text>
              )}
            </View>
          </View>
          <View style={styles.bookingBadges}>
            {isOwnBooking && (
              <View style={styles.myBookingBadge}>
                <Text style={styles.myBookingText}>Mine</Text>
              </View>
            )}
            {isPast && (
              <View style={styles.pastBadge}>
                <Text style={styles.pastBadgeText}>Past</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.bookingDetails}>
          <View style={styles.detailRow}>
            <Icon name="clock" size={12} color="#6B7280" />
            <Text style={styles.detailText}>
              {MeetingRoomService.formatTime(item.start_time)} - {MeetingRoomService.formatTime(item.end_time)}
              <Text style={styles.durationText}> ({item.duration_hours || '-'}h)</Text>
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Icon name="user" size={12} color="#6B7280" />
            <Text style={[styles.detailText, isOwnBooking && { fontWeight: '600' }]}>
              {item.employee_name}
              {isOwnBooking ? ' (You)' : ''}
            </Text>
          </View>

          {item.cost > 0 && (
            <View style={styles.detailRow}>
              <Icon name="rupee-sign" size={12} color="#6B7280" />
              <Text style={styles.detailText}>₹{item.cost}</Text>
            </View>
          )}
        </View>

        {item.reason && (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonText} numberOfLines={2}>{item.reason}</Text>
          </View>
        )}

        {canModify && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => handleEditBooking(item)}
            >
              <Icon name="edit" size={12} color="#3B82F6" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => handleCancelBooking(item.booking_id, item.employee_name)}
            >
              <Icon name="times" size={12} color="#DC2626" />
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading && bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <AppHeader title="Meeting Room Management" canGoBack onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <AppHeader title="Meeting Room Management" canGoBack onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[custom.palette.primary]} />
        }
      >
        {/* Month Navigator */}
        <View style={styles.monthNavigator}>
          <TouchableOpacity style={styles.monthNavBtn} onPress={() => changeMonth(-1)}>
            <Icon name="chevron-left" size={16} color={custom.palette.primary} />
          </TouchableOpacity>
          <Text style={styles.monthText}>{formatMonth(selectedMonth)}</Text>
          <TouchableOpacity style={styles.monthNavBtn} onPress={() => changeMonth(1)}>
            <Icon name="chevron-right" size={16} color={custom.palette.primary} />
          </TouchableOpacity>
        </View>

        {/* Statistics */}
        {statistics && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Icon name="calendar-check" size={16} color="#3B82F6" />
              </View>
              <Text style={[styles.statValue, { color: '#3B82F6' }]}>{statistics.total_bookings}</Text>
              <Text style={styles.statLabel}>Bookings</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#F0FDF4' }]}>
                <Icon name="clock" size={16} color="#22C55E" />
              </View>
              <Text style={[styles.statValue, { color: '#22C55E' }]}>{statistics.total_hours}h</Text>
              <Text style={styles.statLabel}>Hours</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Icon name="door-open" size={16} color="#F59E0B" />
              </View>
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>{statistics.unique_rooms}</Text>
              <Text style={styles.statLabel}>Rooms</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#FCE7F3' }]}>
                <Icon name="users" size={16} color="#EC4899" />
              </View>
              <Text style={[styles.statValue, { color: '#EC4899' }]}>{statistics.unique_employees}</Text>
              <Text style={styles.statLabel}>People</Text>
            </View>
          </View>
        )}

        {/* Filters */}
        <View style={styles.filtersSection}>
          {/* View Mode Toggle */}
          <View style={styles.viewModeContainer}>
            <TouchableOpacity
              style={[styles.viewModeBtn, viewMode === 'all' && styles.viewModeBtnActive]}
              onPress={() => setViewMode('all')}
            >
              <Text style={[styles.viewModeBtnText, viewMode === 'all' && styles.viewModeBtnTextActive]}>
                All Bookings
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewModeBtn, viewMode === 'mine' && styles.viewModeBtnActive]}
              onPress={() => setViewMode('mine')}
            >
              <Text style={[styles.viewModeBtnText, viewMode === 'mine' && styles.viewModeBtnTextActive]}>
                My Bookings
              </Text>
            </TouchableOpacity>
          </View>

          {/* Room Filter */}
          <View style={styles.inputGroup}>
            <Text style={styles.filterLabel}>Filter by Room</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={filterRoom}
                onValueChange={(value) => setFilterRoom(value)}
                style={styles.picker}
              >
                <Picker.Item label="All Rooms" value="" />
                {rooms.map((room) => (
                  <Picker.Item
                    key={room.name}
                    label={`${room.room_name} - ${room.location || 'N/A'}`}
                    value={room.name}
                  />
                ))}
              </Picker>
            </View>
          </View>

          {/* Search */}
          <Searchbar
            placeholder="Search by name, room, reason..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchbar}
            inputStyle={styles.searchbarInput}
            iconColor="#9CA3AF"
          />
        </View>

        {/* Bookings by Date */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Icon name="calendar-alt" size={14} color="#8B5CF6" />
            <Text style={styles.sectionTitle}>Bookings</Text>
          </View>

          {sortedDates.length > 0 ? (
            sortedDates.map((date) => (
              <View key={date} style={styles.dateGroup}>
                <View style={styles.dateHeader}>
                  <Icon name="calendar-day" size={12} color="#6B7280" />
                  <Text style={styles.dateText}>
                    {new Date(date).toLocaleDateString('en-IN', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{groupedBookings[date].length}</Text>
                  </View>
                </View>
                {groupedBookings[date].map(renderBookingItem)}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBox}>
                <Icon name="calendar-times" size={32} color="#D1D5DB" />
              </View>
              <Text style={styles.emptyTitle}>No Bookings Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'No bookings match your search criteria'
                  : viewMode === 'mine'
                  ? "You haven't made any bookings this month"
                  : 'No meeting room bookings for this month'}
              </Text>
            </View>
          )}
        </View>

        {/* Room Summary */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Icon name="door-closed" size={14} color="#10B981" />
            <Text style={styles.sectionTitle}>Rooms</Text>
          </View>

          {rooms.map((room) => {
            const roomBookings = bookings.filter((b) => b.meeting_room === room.name);
            const roomHours = roomBookings.reduce((sum, b) => sum + (b.duration_hours || 0), 0);
            return (
              <View key={room.name} style={styles.roomSummaryCard}>
                <View style={styles.roomSummaryHeader}>
                  <View style={styles.roomSummaryInfo}>
                    <View style={[styles.roomSummaryIcon, { backgroundColor: '#10B981' + '15' }]}>
                      <Icon name="door-open" size={14} color="#10B981" />
                    </View>
                    <View>
                      <Text style={styles.roomSummaryName}>{room.room_name}</Text>
                      <Text style={styles.roomSummaryLocation}>
                        <Icon name="map-marker-alt" size={10} color="#9CA3AF" /> {room.location || 'N/A'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.capacityBadge}>
                    <Icon name="users" size={10} color="#059669" />
                    <Text style={styles.capacityBadgeText}>{room.capacity}</Text>
                  </View>
                </View>
                <View style={styles.roomSummaryStats}>
                  <Text style={styles.roomSummaryStatText}>
                    <Text style={styles.roomSummaryStatValue}>{roomBookings.length}</Text> bookings • <Text style={styles.roomSummaryStatValue}>{roomHours}h</Text> this month
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB for new booking */}
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: custom.palette.primary }]}
        onPress={() => {
          resetBookingForm();
          setBookingDate(getTodayString());
          setShowBookingModal(true);
        }}
        color="#FFFFFF"
      />

      {/* Booking Modal - Bottom Sheet Style */}
      <Modal
        transparent
        animationType="slide"
        visible={showBookingModal}
        onRequestClose={() => !submitting && setShowBookingModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !submitting && setShowBookingModal(false)}
        >
          <View />
        </Pressable>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingBooking ? 'Edit Booking' : 'Book Meeting Room'}</Text>
            <TouchableOpacity
              onPress={() => !submitting && setShowBookingModal(false)}
              style={styles.closeButton}
            >
              <Icon name="times" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Room Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Select Room *</Text>
              <View style={[styles.pickerContainer, editingBooking && styles.disabledPicker]}>
                <Picker
                  selectedValue={selectedRoom}
                  onValueChange={setSelectedRoom}
                  enabled={!submitting && !editingBooking}
                  style={styles.picker}
                >
                  <Picker.Item label="-- Select Room --" value="" />
                  {rooms.map((room) => (
                    <Picker.Item
                      key={room.name}
                      label={`${room.room_name} (${room.capacity} pax) - ${room.location || 'N/A'}`}
                      value={room.name}
                    />
                  ))}
                </Picker>
              </View>
            </View>

            {/* Date Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Date *</Text>
              <TouchableOpacity
                style={[styles.dateButton, editingBooking && styles.disabledDateButton]}
                onPress={() => !editingBooking && setShowDatePicker(true)}
                disabled={submitting || editingBooking}
              >
                <Icon name="calendar-alt" size={16} color={editingBooking ? '#9CA3AF' : '#6B7280'} />
                <Text style={[styles.dateButtonText, !bookingDate && { color: '#9CA3AF' }, editingBooking && { color: '#6B7280' }]}>
                  {bookingDate ? new Date(bookingDate).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }) : 'Select Date'}
                </Text>
                <Icon name="chevron-down" size={12} color={editingBooking ? '#9CA3AF' : '#6B7280'} />
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={bookingDateObj}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate) {
                    setBookingDateObj(selectedDate);
                    setBookingDate(selectedDate.toISOString().split('T')[0]);
                  }
                }}
              />
            )}

            {/* Time Selection */}
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Start Time *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={startTime}
                    onValueChange={setStartTime}
                    enabled={!submitting}
                    style={styles.picker}
                  >
                    {timeSlots.map((slot) => (
                      <Picker.Item key={slot.value} label={slot.label} value={slot.value} />
                    ))}
                  </Picker>
                </View>
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>End Time *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={endTime}
                    onValueChange={setEndTime}
                    enabled={!submitting}
                    style={styles.picker}
                  >
                    {timeSlots.map((slot) => (
                      <Picker.Item key={slot.value} label={slot.label} value={slot.value} />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>

            {/* Room Availability Info */}
            {roomAvailability && !editingBooking && (
              <View style={styles.availabilityBox}>
                <View style={styles.availabilityHeader}>
                  <Icon name="info-circle" size={14} color="#3B82F6" />
                  <Text style={styles.availabilityTitle}>Availability for {bookingDate}</Text>
                </View>
                {roomAvailability.is_fully_booked ? (
                  <Text style={styles.fullyBookedText}>⚠️ Room is fully booked</Text>
                ) : roomAvailability.bookings?.length > 0 ? (
                  <View>
                    <Text style={styles.existingBookingsLabel}>Existing bookings:</Text>
                    {roomAvailability.bookings.map((b, idx) => (
                      <Text key={idx} style={styles.existingBookingText}>
                        • {MeetingRoomService.formatTime(b.start_time)} - {MeetingRoomService.formatTime(b.end_time)} ({b.employee_name})
                      </Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.availableText}>✅ Room is available all day</Text>
                )}
              </View>
            )}

            {/* Reason */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Reason (Optional)</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Meeting purpose..."
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={[styles.input, styles.textArea]}
                placeholderTextColor="#9CA3AF"
                editable={!submitting}
              />
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowBookingModal(false)}
                style={styles.cancelButton}
                disabled={submitting}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateBooking}
                style={[styles.submitButton, (!selectedRoom || !bookingDate || submitting) && styles.submitButtonDisabled]}
                disabled={submitting || !selectedRoom || !bookingDate}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="check" size={14} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>{editingBooking ? 'Update' : 'Book Room'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Month Navigator
  monthNavigator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  // Statistics
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  // Filters
  filtersSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  viewModeContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
  },
  viewModeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  viewModeBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  viewModeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  viewModeBtnTextActive: {
    color: '#111827',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
  },
  disabledPicker: {
    backgroundColor: '#E5E7EB',
  },
  picker: {
    marginVertical: -8,
  },
  searchbar: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
    borderRadius: 12,
    height: 46,
  },
  searchbarInput: {
    fontSize: 14,
  },
  // Section
  sectionContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  // Date Group
  dateGroup: {
    marginBottom: 16,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  // Booking Card
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  ownBookingCard: {
    borderWidth: 2,
    borderColor: '#93C5FD',
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bookingRoomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  roomIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  locationText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  bookingBadges: {
    flexDirection: 'row',
    gap: 4,
  },
  myBookingBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  myBookingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1E40AF',
  },
  pastBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pastBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  bookingDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#374151',
  },
  durationText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  reasonBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  reasonText: {
    fontSize: 12,
    color: '#374151',
    fontStyle: 'italic',
  },
  // Actions
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 10,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  // Room Summary
  roomSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  roomSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roomSummaryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roomSummaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomSummaryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  roomSummaryLocation: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  capacityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  capacityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  roomSummaryStats: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  roomSummaryStatText: {
    fontSize: 11,
    color: '#6B7280',
  },
  roomSummaryStatValue: {
    fontWeight: '700',
    color: '#374151',
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  // FAB
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  disabledInput: {
    backgroundColor: '#E5E7EB',
    color: '#6B7280',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#F9FAFB',
    gap: 10,
  },
  disabledDateButton: {
    backgroundColor: '#E5E7EB',
  },
  dateButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  timeRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  // Availability Info
  availabilityBox: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  availabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  availabilityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
  },
  existingBookingsLabel: {
    fontSize: 12,
    color: '#374151',
    marginBottom: 6,
  },
  existingBookingText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 8,
    marginBottom: 2,
  },
  fullyBookedText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
  },
  availableText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
  },
  // Modal Actions
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 2,
    shadowColor: '#111827',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default AdminMeetingRoomScreen;
