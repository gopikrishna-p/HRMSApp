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
} from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import MeetingRoomService from '../../services/meetingRoom.service';

const EmployeeMeetingRoomScreen = ({ navigation }) => {
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
  const [showMyBookingsOnly, setShowMyBookingsOnly] = useState(false);

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
        MeetingRoomService.getBookings(firstDay, lastDay, null, showMyBookingsOnly),
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
  }, [selectedMonth, showMyBookingsOnly]);

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
      await MeetingRoomService.createBooking(
        selectedRoom,
        bookingDate,
        startTime,
        endTime,
        reason || null
      );

      Alert.alert('Success', 'Meeting room booked successfully!');
      setShowBookingModal(false);
      resetBookingForm();
      fetchData();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel booking
  const handleCancelBooking = async (bookingId) => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
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

  // Render booking item
  const renderBookingItem = ({ item }) => {
    const isOwnBooking = item.is_own_booking;
    const isPast = item.booking_date < getTodayString();

    return (
      <View style={[styles.bookingCard, isOwnBooking && styles.ownBookingCard]}>
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
          {isOwnBooking && (
            <View style={styles.myBookingBadge}>
              <Icon name="user-check" size={10} color="#1E40AF" />
              <Text style={styles.myBookingText}>My Booking</Text>
            </View>
          )}
        </View>

        <View style={styles.bookingDetails}>
          <View style={styles.detailRow}>
            <Icon name="calendar" size={12} color="#6B7280" />
            <Text style={styles.detailText}>
              {new Date(item.booking_date).toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Icon name="clock" size={12} color="#6B7280" />
            <Text style={styles.detailText}>
              {MeetingRoomService.formatTime(item.start_time)} - {MeetingRoomService.formatTime(item.end_time)}
            </Text>
          </View>

          {!isOwnBooking && item.employee_name && (
            <View style={styles.detailRow}>
              <Icon name="user" size={12} color="#6B7280" />
              <Text style={styles.detailText}>{item.employee_name}</Text>
            </View>
          )}
        </View>

        {item.reason && (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonText} numberOfLines={2}>{item.reason}</Text>
          </View>
        )}

        {isOwnBooking && !isPast && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancelBooking(item.booking_id)}
          >
            <Icon name="times" size={12} color="#DC2626" />
            <Text style={styles.cancelBtnText}>Cancel Booking</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading && bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <AppHeader title="Meeting Room Booking" canGoBack onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <AppHeader title="Meeting Room Booking" canGoBack onBack={() => navigation.goBack()} />

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
              <Text style={styles.statValue}>{statistics.total_bookings}</Text>
              <Text style={styles.statLabel}>Bookings</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#F0FDF4' }]}>
                <Icon name="clock" size={16} color="#22C55E" />
              </View>
              <Text style={styles.statValue}>{statistics.total_hours}h</Text>
              <Text style={styles.statLabel}>Hours</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Icon name="door-open" size={16} color="#F59E0B" />
              </View>
              <Text style={styles.statValue}>{statistics.unique_rooms}</Text>
              <Text style={styles.statLabel}>Rooms</Text>
            </View>
          </View>
        )}

        {/* Filter Toggle */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, showMyBookingsOnly && styles.filterChipActive]}
            onPress={() => setShowMyBookingsOnly(!showMyBookingsOnly)}
          >
            <Icon
              name={showMyBookingsOnly ? 'check-circle' : 'circle'}
              size={12}
              color={showMyBookingsOnly ? '#FFFFFF' : '#6B7280'}
              solid={showMyBookingsOnly}
            />
            <Text style={[styles.filterChipText, showMyBookingsOnly && styles.filterChipTextActive]}>
              My Bookings Only
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bookings List */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Icon name="list" size={14} color="#8B5CF6" />
            <Text style={styles.sectionTitle}>Bookings</Text>
          </View>
          
          {bookings.length > 0 ? (
            <FlatList
              data={bookings}
              renderItem={renderBookingItem}
              keyExtractor={(item) => item.booking_id}
              scrollEnabled={false}
            />
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBox}>
                <Icon name="calendar-times" size={32} color="#D1D5DB" />
              </View>
              <Text style={styles.emptyTitle}>No Bookings</Text>
              <Text style={styles.emptySubtitle}>
                {showMyBookingsOnly ? "You haven't made any bookings this month" : 'No bookings found for this month'}
              </Text>
            </View>
          )}
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
            <Text style={styles.modalTitle}>Book Meeting Room</Text>
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
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedRoom}
                  onValueChange={setSelectedRoom}
                  enabled={!submitting}
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
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
                disabled={submitting}
              >
                <Icon name="calendar-alt" size={16} color="#6B7280" />
                <Text style={[styles.dateButtonText, !bookingDate && { color: '#9CA3AF' }]}>
                  {bookingDate ? new Date(bookingDate).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }) : 'Select Date'}
                </Text>
                <Icon name="chevron-down" size={12} color="#6B7280" />
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
            {roomAvailability && (
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
                    <Text style={styles.submitButtonText}>Book Room</Text>
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
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  // Filter
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    gap: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  filterChipActive: {
    backgroundColor: '#6366F1',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  // Section
  sectionContainer: {
    paddingHorizontal: 16,
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
  myBookingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  myBookingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1E40AF',
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
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#FEE2E2',
    gap: 6,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
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
  dateButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
  },
  picker: {
    marginVertical: -8,
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

export default EmployeeMeetingRoomScreen;
