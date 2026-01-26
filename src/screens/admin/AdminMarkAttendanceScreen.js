// src/screens/admin/AdminMarkAttendanceScreen.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    RefreshControl,
    Alert,
    TextInput,
    FlatList,
    Modal,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { Text, useTheme, Checkbox } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import DateTimePicker from '@react-native-community/datetimepicker';
import AttendanceService from '../../services/attendance.service';
import showToast from '../../utils/Toast';

const ATTENDANCE_STATUSES = [
    { label: 'Present', value: 'Present', icon: 'check-circle', color: '#10B981' },
    { label: 'Absent', value: 'Absent', icon: 'times-circle', color: '#EF4444' },
    { label: 'Half Day', value: 'Half Day', icon: 'adjust', color: '#F59E0B' },
    { label: 'Work From Home', value: 'Work From Home', icon: 'home', color: '#3B82F6' },
    { label: 'On Site', value: 'On Site', icon: 'map-marker-alt', color: '#8B5CF6' },
    { label: 'On Leave', value: 'On Leave', icon: 'umbrella-beach', color: '#EC4899' },
];

const TAB_OPTIONS = [
    { key: 'single', label: 'Single', icon: 'user' },
    { key: 'bulk', label: 'Bulk', icon: 'users' },
    { key: 'unmarked', label: 'Unmarked', icon: 'user-times' },
    { key: 'marked', label: 'Marked', icon: 'user-check' },
];

const AdminMarkAttendanceScreen = ({ navigation }) => {
    const { custom } = useTheme();
    
    // State
    const [activeTab, setActiveTab] = useState('single');
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [unmarkedEmployees, setUnmarkedEmployees] = useState([]);
    const [markedAttendance, setMarkedAttendance] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Date picker
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    
    // Time pickers
    const [inTime, setInTime] = useState(null); // Date object or null
    const [outTime, setOutTime] = useState(null); // Date object or null
    const [showInTimePicker, setShowInTimePicker] = useState(false);
    const [showOutTimePicker, setShowOutTimePicker] = useState(false);
    const [includeTime, setIncludeTime] = useState(false); // Toggle for time entry
    
    // Single mode
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState('Present');
    
    // Bulk mode
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [bulkStatus, setBulkStatus] = useState('Present');
    
    // Status picker modal
    const [showStatusPicker, setShowStatusPicker] = useState(false);
    const [statusPickerMode, setStatusPickerMode] = useState('single'); // 'single' or 'bulk'
    
    // Summary stats
    const [stats, setStats] = useState({ total_active: 0, marked_count: 0, unmarked_count: 0 });

    // Format date for API (YYYY-MM-DD)
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Format datetime for API (YYYY-MM-DD HH:mm:ss)
    const formatDateTime = (date, time) => {
        if (!time) return null;
        const dateStr = formatDate(date);
        const hours = String(time.getHours()).padStart(2, '0');
        const minutes = String(time.getMinutes()).padStart(2, '0');
        return `${dateStr} ${hours}:${minutes}:00`;
    };

    // Format time for display (HH:mm)
    const formatTimeDisplay = (time) => {
        if (!time) return '--:--';
        const hours = String(time.getHours()).padStart(2, '0');
        const minutes = String(time.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    const formatDisplayDate = (date) => {
        return date.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    };

    // Set default times when toggling time entry
    useEffect(() => {
        if (includeTime && !inTime) {
            const defaultIn = new Date();
            defaultIn.setHours(9, 0, 0, 0);
            setInTime(defaultIn);
        }
        if (includeTime && !outTime) {
            const defaultOut = new Date();
            defaultOut.setHours(18, 0, 0, 0);
            setOutTime(defaultOut);
        }
    }, [includeTime]);

    // Fetch all active employees
    const fetchEmployees = useCallback(async () => {
        try {
            setLoading(true);
            const response = await AttendanceService.getAllActiveEmployees();
            console.log('Active employees response:', response);
            
            if (response?.success && response?.data?.message?.ok) {
                const empList = response.data.message.employees || [];
                setEmployees(empList);
                setStats(prev => ({ ...prev, total_active: response.data.message.count || empList.length }));
            } else {
                showToast({ type: 'error', text1: 'Failed to load employees' });
            }
        } catch (error) {
            console.error('Error fetching employees:', error);
            showToast({ type: 'error', text1: 'Error loading employees' });
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch unmarked employees for selected date
    const fetchUnmarkedEmployees = useCallback(async () => {
        try {
            setLoading(true);
            const dateStr = formatDate(selectedDate);
            const response = await AttendanceService.adminGetUnmarkedEmployees(dateStr);
            console.log('Unmarked employees response:', response);
            
            if (response?.success && response?.data?.message?.ok) {
                const data = response.data.message;
                setUnmarkedEmployees(data.unmarked_employees || []);
                setStats({
                    total_active: data.total_active || 0,
                    marked_count: data.marked_count || 0,
                    unmarked_count: data.unmarked_count || 0,
                });
            } else {
                showToast({ type: 'error', text1: 'Failed to load unmarked employees' });
            }
        } catch (error) {
            console.error('Error fetching unmarked employees:', error);
            showToast({ type: 'error', text1: 'Error loading data' });
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    // Fetch marked attendance for selected date
    const fetchMarkedAttendance = useCallback(async () => {
        try {
            setLoading(true);
            const dateStr = formatDate(selectedDate);
            const response = await AttendanceService.adminGetAttendance({
                from_date: dateStr,
                to_date: dateStr,
                limit: 500,
            });
            console.log('Marked attendance response:', response);
            
            if (response?.success && response?.data?.message?.ok) {
                const data = response.data.message;
                setMarkedAttendance(data.attendance || []);
            } else {
                showToast({ type: 'error', text1: 'Failed to load marked attendance' });
            }
        } catch (error) {
            console.error('Error fetching marked attendance:', error);
            showToast({ type: 'error', text1: 'Error loading data' });
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchEmployees();
    }, [fetchEmployees]);

    useEffect(() => {
        if (activeTab === 'unmarked') {
            fetchUnmarkedEmployees();
        } else if (activeTab === 'marked') {
            fetchMarkedAttendance();
        }
    }, [activeTab, selectedDate, fetchUnmarkedEmployees, fetchMarkedAttendance]);

    const onRefresh = async () => {
        setRefreshing(true);
        if (activeTab === 'unmarked') {
            await fetchUnmarkedEmployees();
        } else if (activeTab === 'marked') {
            await fetchMarkedAttendance();
        } else {
            await fetchEmployees();
        }
        setRefreshing(false);
    };

    // Filter employees based on search
    const filteredEmployees = useMemo(() => {
        let list;
        if (activeTab === 'unmarked') {
            list = unmarkedEmployees;
        } else if (activeTab === 'marked') {
            list = markedAttendance;
        } else {
            list = employees;
        }
        
        if (!searchQuery.trim()) return list;
        
        const query = searchQuery.toLowerCase();
        return list.filter(emp => 
            emp.employee_name?.toLowerCase().includes(query) ||
            emp.name?.toLowerCase().includes(query) ||
            emp.employee?.toLowerCase().includes(query) ||
            emp.department?.toLowerCase().includes(query)
        );
    }, [employees, unmarkedEmployees, searchQuery, activeTab]);

    // Handle date change
    const onDateChange = (event, date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (date) {
            setSelectedDate(date);
            // Reset selections when date changes
            setSelectedEmployee(null);
            setSelectedEmployees([]);
        }
    };

    // Handle in time change
    const onInTimeChange = (event, time) => {
        setShowInTimePicker(Platform.OS === 'ios');
        if (time) {
            setInTime(time);
        }
    };

    // Handle out time change
    const onOutTimeChange = (event, time) => {
        setShowOutTimePicker(Platform.OS === 'ios');
        if (time) {
            setOutTime(time);
        }
    };

    // Toggle employee selection for bulk mode
    const toggleEmployeeSelection = (emp) => {
        setSelectedEmployees(prev => {
            const isSelected = prev.some(e => e.name === emp.name);
            if (isSelected) {
                return prev.filter(e => e.name !== emp.name);
            } else {
                return [...prev, emp];
            }
        });
    };

    // Select/deselect all visible employees
    const toggleSelectAll = () => {
        if (selectedEmployees.length === filteredEmployees.length) {
            setSelectedEmployees([]);
        } else {
            setSelectedEmployees([...filteredEmployees]);
        }
    };

    // Mark single employee attendance
    const markSingleAttendance = async () => {
        if (!selectedEmployee) {
            Alert.alert('Error', 'Please select an employee');
            return;
        }

        try {
            setLoading(true);
            
            const params = {
                employee: selectedEmployee.name,
                attendance_date: formatDate(selectedDate),
                status: selectedStatus,
            };
            
            // Add time fields if enabled
            if (includeTime) {
                if (inTime) params.in_time = formatDateTime(selectedDate, inTime);
                if (outTime) params.out_time = formatDateTime(selectedDate, outTime);
            }
            
            console.log('Marking attendance with params:', params);
            const response = await AttendanceService.adminMarkAttendance(params);
            
            console.log('Mark attendance response:', response);
            
            if (response?.success && response?.data?.message?.ok) {
                showToast({ type: 'success', text1: 'Success', text2: `Attendance marked for ${selectedEmployee.employee_name}` });
                setSelectedEmployee(null);
                // Refresh unmarked list if on that tab
                if (activeTab === 'unmarked') {
                    fetchUnmarkedEmployees();
                }
            } else {
                const msg = response?.data?.message?.error || response?.data?.message || 'Failed to mark attendance';
                Alert.alert('Error', msg);
            }
        } catch (error) {
            console.error('Error marking attendance:', error);
            Alert.alert('Error', error?.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    // Mark bulk attendance
    const markBulkAttendance = async () => {
        if (selectedEmployees.length === 0) {
            Alert.alert('Error', 'Please select at least one employee');
            return;
        }

        const timeInfo = includeTime ? `\nIn: ${formatTimeDisplay(inTime)}, Out: ${formatTimeDisplay(outTime)}` : '';
        
        Alert.alert(
            'Confirm Bulk Attendance',
            `Mark ${selectedEmployees.length} employee(s) as "${bulkStatus}" for ${formatDisplayDate(selectedDate)}?${timeInfo}`,
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Confirm', 
                    onPress: async () => {
                        try {
                            setLoading(true);
                            const employeeIds = selectedEmployees.map(e => e.name);
                            
                            const params = {
                                employees: employeeIds,
                                attendance_date: formatDate(selectedDate),
                                status: bulkStatus,
                            };
                            
                            // Add time fields if enabled
                            if (includeTime) {
                                if (inTime) params.in_time = formatDateTime(selectedDate, inTime);
                                if (outTime) params.out_time = formatDateTime(selectedDate, outTime);
                            }
                            
                            console.log('Bulk marking with params:', params);
                            const response = await AttendanceService.adminBulkMarkAttendance(params);
                            
                            console.log('Bulk mark response:', response);
                            
                            if (response?.success && response?.data?.message?.ok) {
                                const summary = response.data.message.summary;
                                showToast({
                                    type: 'success',
                                    text1: 'Bulk Attendance Marked',
                                    text2: `Success: ${summary?.success || 0}, Failed: ${summary?.failed || 0}, Skipped: ${summary?.skipped || 0}`,
                                });
                                setSelectedEmployees([]);
                                // Refresh unmarked list if on that tab
                                if (activeTab === 'unmarked') {
                                    fetchUnmarkedEmployees();
                                }
                            } else {
                                const msg = response?.data?.message?.error || 'Bulk operation failed';
                                Alert.alert('Error', msg);
                            }
                        } catch (error) {
                            console.error('Error bulk marking:', error);
                            Alert.alert('Error', error?.message || 'Something went wrong');
                        } finally {
                            setLoading(false);
                        }
                    }
                },
            ]
        );
    };

    // Delete attendance record
    const deleteAttendance = async (attendanceRecord) => {
        Alert.alert(
            'Delete Attendance',
            `Are you sure you want to delete attendance for ${attendanceRecord.employee_name} on ${formatDisplayDate(selectedDate)}?\n\nStatus: ${attendanceRecord.status}`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            const response = await AttendanceService.adminDeleteAttendance(attendanceRecord.name);
                            console.log('Delete attendance response:', response);
                            
                            if (response?.success && response?.data?.message?.ok) {
                                showToast({ 
                                    type: 'success', 
                                    text1: 'Deleted', 
                                    text2: `Attendance deleted for ${attendanceRecord.employee_name}` 
                                });
                                // Refresh the marked list
                                fetchMarkedAttendance();
                                // Also refresh stats
                                fetchUnmarkedEmployees();
                            } else {
                                const msg = response?.data?.message?.error || response?.data?.message || 'Failed to delete attendance';
                                Alert.alert('Error', msg);
                            }
                        } catch (error) {
                            console.error('Error deleting attendance:', error);
                            Alert.alert('Error', error?.message || 'Something went wrong');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    // Get status color and icon
    const getStatusInfo = (status) => {
        return ATTENDANCE_STATUSES.find(s => s.value === status) || ATTENDANCE_STATUSES[0];
    };

    // Render employee item
    const renderEmployeeItem = ({ item }) => {
        // For marked tab, item is an attendance record with different structure
        if (activeTab === 'marked') {
            const statusInfo = getStatusInfo(item.status);
            return (
                <View style={[styles.employeeItem, styles.markedItem]}>
                    <View style={styles.employeeInfo}>
                        <Text style={styles.employeeName}>{item.employee_name}</Text>
                        <Text style={styles.employeeMeta}>{item.employee}</Text>
                        <View style={styles.statusBadgeRow}>
                            <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}15` }]}>
                                <Icon name={statusInfo.icon} size={12} color={statusInfo.color} />
                                <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                                    {item.status}
                                </Text>
                            </View>
                            {item.in_time && (
                                <Text style={styles.timeText}>In: {item.in_time?.split(' ')[1]?.slice(0, 5) || '--:--'}</Text>
                            )}
                            {item.out_time && (
                                <Text style={styles.timeText}>Out: {item.out_time?.split(' ')[1]?.slice(0, 5) || '--:--'}</Text>
                            )}
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => deleteAttendance(item)}
                    >
                        <Icon name="trash-alt" size={16} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            );
        }
        
        // For other tabs (single, bulk, unmarked)
        const isSelected = activeTab === 'single' 
            ? selectedEmployee?.name === item.name
            : activeTab === 'unmarked'
            ? selectedEmployee?.name === item.name
            : selectedEmployees.some(e => e.name === item.name);
        
        return (
            <TouchableOpacity
                style={[
                    styles.employeeItem,
                    isSelected && { backgroundColor: `${custom.palette.primary}15`, borderColor: custom.palette.primary }
                ]}
                onPress={() => {
                    if (activeTab === 'single' || activeTab === 'unmarked') {
                        setSelectedEmployee(isSelected ? null : item);
                    } else {
                        toggleEmployeeSelection(item);
                    }
                }}
            >
                {activeTab === 'bulk' && (
                    <Checkbox
                        status={isSelected ? 'checked' : 'unchecked'}
                        onPress={() => toggleEmployeeSelection(item)}
                        color={custom.palette.primary}
                    />
                )}
                <View style={styles.employeeInfo}>
                    <Text style={styles.employeeName}>{item.employee_name}</Text>
                    <Text style={styles.employeeMeta}>{item.name}</Text>
                    {item.department && (
                        <Text style={styles.employeeDept}>{item.department}</Text>
                    )}
                </View>
                {(activeTab === 'single' || activeTab === 'unmarked') && isSelected && (
                    <Icon name="check-circle" size={20} color={custom.palette.primary} solid />
                )}
            </TouchableOpacity>
        );
    };

    // Status Picker Modal
    const StatusPickerModal = () => (
        <Modal
            visible={showStatusPicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowStatusPicker(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Status</Text>
                        <TouchableOpacity onPress={() => setShowStatusPicker(false)}>
                            <Icon name="times" size={20} color="#666" />
                        </TouchableOpacity>
                    </View>
                    {ATTENDANCE_STATUSES.map(status => (
                        <TouchableOpacity
                            key={status.value}
                            style={[
                                styles.statusOption,
                                (statusPickerMode === 'single' ? selectedStatus : bulkStatus) === status.value && 
                                    { backgroundColor: `${status.color}15`, borderColor: status.color }
                            ]}
                            onPress={() => {
                                if (statusPickerMode === 'single') {
                                    setSelectedStatus(status.value);
                                } else {
                                    setBulkStatus(status.value);
                                }
                                setShowStatusPicker(false);
                            }}
                        >
                            <Icon name={status.icon} size={18} color={status.color} />
                            <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </Modal>
    );

    // Time Entry Section
    const TimeEntrySection = () => (
        <View style={styles.timeSection}>
            <TouchableOpacity 
                style={styles.timeToggle}
                onPress={() => setIncludeTime(!includeTime)}
            >
                <Checkbox
                    status={includeTime ? 'checked' : 'unchecked'}
                    onPress={() => setIncludeTime(!includeTime)}
                    color={custom.palette.primary}
                />
                <Text style={styles.timeToggleText}>Include Check-in/Check-out Time</Text>
            </TouchableOpacity>
            
            {includeTime && (
                <View style={styles.timeRow}>
                    <TouchableOpacity 
                        style={styles.timeButton}
                        onPress={() => setShowInTimePicker(true)}
                    >
                        <Icon name="sign-in-alt" size={14} color="#10B981" />
                        <Text style={styles.timeLabel}>In:</Text>
                        <Text style={styles.timeValue}>{formatTimeDisplay(inTime)}</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        style={styles.timeButton}
                        onPress={() => setShowOutTimePicker(true)}
                    >
                        <Icon name="sign-out-alt" size={14} color="#EF4444" />
                        <Text style={styles.timeLabel}>Out:</Text>
                        <Text style={styles.timeValue}>{formatTimeDisplay(outTime)}</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        style={styles.clearTimeButton}
                        onPress={() => {
                            setInTime(null);
                            setOutTime(null);
                            setIncludeTime(false);
                        }}
                    >
                        <Icon name="times" size={14} color="#666" />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
            {/* Date Selector */}
            <View style={styles.dateSection}>
                <TouchableOpacity 
                    style={styles.dateButton}
                    onPress={() => setShowDatePicker(true)}
                >
                    <Icon name="calendar-alt" size={18} color={custom.palette.primary} />
                    <Text style={styles.dateText}>{formatDisplayDate(selectedDate)}</Text>
                    <Icon name="chevron-down" size={14} color="#666" />
                </TouchableOpacity>
            </View>

            {showDatePicker && (
                <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDateChange}
                    maximumDate={new Date()}
                />
            )}

            {showInTimePicker && (
                <DateTimePicker
                    value={inTime || new Date()}
                    mode="time"
                    is24Hour={true}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onInTimeChange}
                />
            )}

            {showOutTimePicker && (
                <DateTimePicker
                    value={outTime || new Date()}
                    mode="time"
                    is24Hour={true}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onOutTimeChange}
                />
            )}

            {/* Tab Switcher */}
            <View style={styles.tabContainer}>
                {TAB_OPTIONS.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[
                            styles.tab,
                            activeTab === tab.key && { backgroundColor: custom.palette.primary }
                        ]}
                        onPress={() => {
                            setActiveTab(tab.key);
                            setSearchQuery('');
                            setSelectedEmployee(null);
                            setSelectedEmployees([]);
                        }}
                    >
                        <Icon 
                            name={tab.icon} 
                            size={14} 
                            color={activeTab === tab.key ? '#FFF' : '#666'} 
                        />
                        <Text style={[
                            styles.tabText,
                            activeTab === tab.key && { color: '#FFF' }
                        ]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Time Entry Toggle - hide for marked tab */}
            {activeTab !== 'marked' && <TimeEntrySection />}

            {/* Stats Summary for Unmarked/Marked Tab */}
            {(activeTab === 'unmarked' || activeTab === 'marked') && (
                <View style={styles.statsRow}>
                    <View style={[styles.statBox, { backgroundColor: '#10B98115' }]}>
                        <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.marked_count}</Text>
                        <Text style={styles.statLabel}>Marked</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: '#EF444415' }]}>
                        <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.unmarked_count}</Text>
                        <Text style={styles.statLabel}>Unmarked</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: '#3B82F615' }]}>
                        <Text style={[styles.statValue, { color: '#3B82F6' }]}>{stats.total_active}</Text>
                        <Text style={styles.statLabel}>Total</Text>
                    </View>
                </View>
            )}

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Icon name="search" size={16} color="#999" style={{ marginRight: 10 }} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search employees..."
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Icon name="times-circle" size={16} color="#999" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Bulk Select All */}
            {activeTab === 'bulk' && filteredEmployees.length > 0 && (
                <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll}>
                    <Checkbox
                        status={selectedEmployees.length === filteredEmployees.length ? 'checked' : 
                                selectedEmployees.length > 0 ? 'indeterminate' : 'unchecked'}
                        onPress={toggleSelectAll}
                        color={custom.palette.primary}
                    />
                    <Text style={styles.selectAllText}>
                        {selectedEmployees.length === filteredEmployees.length 
                            ? 'Deselect All' 
                            : `Select All (${filteredEmployees.length})`}
                    </Text>
                    {selectedEmployees.length > 0 && (
                        <Text style={styles.selectedCount}>{selectedEmployees.length} selected</Text>
                    )}
                </TouchableOpacity>
            )}

            {/* Employee List */}
            {loading && !refreshing ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={custom.palette.primary} />
                    <Text style={styles.loadingText}>Loading employees...</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredEmployees}
                    keyExtractor={(item) => item.name}
                    renderItem={renderEmployeeItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Icon name="users" size={48} color="#CCC" />
                            <Text style={styles.emptyText}>
                                {activeTab === 'unmarked' 
                                    ? 'All employees have attendance marked!' 
                                    : activeTab === 'marked'
                                    ? 'No attendance records for this date'
                                    : 'No employees found'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Action Panel - Single/Unmarked Mode */}
            {(activeTab === 'single' || activeTab === 'unmarked') && selectedEmployee && (
                <View style={styles.actionPanel}>
                    <View style={styles.selectedInfo}>
                        <Text style={styles.selectedName}>{selectedEmployee.employee_name}</Text>
                        <Text style={styles.selectedId}>{selectedEmployee.name}</Text>
                        {includeTime && (
                            <Text style={styles.selectedTime}>
                                {formatTimeDisplay(inTime)} - {formatTimeDisplay(outTime)}
                            </Text>
                        )}
                    </View>
                    
                    <TouchableOpacity 
                        style={styles.statusSelector}
                        onPress={() => {
                            setStatusPickerMode('single');
                            setShowStatusPicker(true);
                        }}
                    >
                        <Icon 
                            name={getStatusInfo(selectedStatus).icon} 
                            size={16} 
                            color={getStatusInfo(selectedStatus).color} 
                        />
                        <Text style={[styles.statusText, { color: getStatusInfo(selectedStatus).color }]}>
                            {selectedStatus}
                        </Text>
                        <Icon name="chevron-down" size={12} color="#666" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        style={[styles.markButton, { backgroundColor: custom.palette.primary }]}
                        onPress={markSingleAttendance}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <>
                                <Icon name="check" size={16} color="#FFF" />
                                <Text style={styles.markButtonText}>Mark</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {/* Action Panel - Bulk Mode */}
            {activeTab === 'bulk' && selectedEmployees.length > 0 && (
                <View style={styles.actionPanel}>
                    <View style={styles.selectedInfo}>
                        <Text style={styles.selectedName}>{selectedEmployees.length} Employees</Text>
                        <Text style={styles.selectedId}>selected for bulk marking</Text>
                        {includeTime && (
                            <Text style={styles.selectedTime}>
                                {formatTimeDisplay(inTime)} - {formatTimeDisplay(outTime)}
                            </Text>
                        )}
                    </View>
                    
                    <TouchableOpacity 
                        style={styles.statusSelector}
                        onPress={() => {
                            setStatusPickerMode('bulk');
                            setShowStatusPicker(true);
                        }}
                    >
                        <Icon 
                            name={getStatusInfo(bulkStatus).icon} 
                            size={16} 
                            color={getStatusInfo(bulkStatus).color} 
                        />
                        <Text style={[styles.statusText, { color: getStatusInfo(bulkStatus).color }]}>
                            {bulkStatus}
                        </Text>
                        <Icon name="chevron-down" size={12} color="#666" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        style={[styles.markButton, { backgroundColor: custom.palette.primary }]}
                        onPress={markBulkAttendance}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <>
                                <Icon name="check-double" size={16} color="#FFF" />
                                <Text style={styles.markButtonText}>Mark All</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            <StatusPickerModal />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    dateSection: {
        padding: 16,
        paddingBottom: 8,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 12,
        borderRadius: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
    },
    dateText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        marginLeft: 10,
        color: '#333',
    },
    timeSection: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    timeToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 8,
        paddingLeft: 4,
        borderRadius: 8,
    },
    timeToggleText: {
        fontSize: 13,
        color: '#333',
        fontWeight: '500',
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 8,
    },
    timeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 10,
        borderRadius: 8,
        gap: 6,
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    timeLabel: {
        fontSize: 12,
        color: '#666',
    },
    timeValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    clearTimeButton: {
        padding: 10,
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
    },
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 8,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: '#FFF',
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 2,
        gap: 6,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
    },
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 8,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 8,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
    },
    statLabel: {
        fontSize: 11,
        color: '#666',
        marginTop: 2,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        marginHorizontal: 16,
        marginBottom: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#333',
        padding: 0,
    },
    selectAllRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    selectAllText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
        flex: 1,
    },
    selectedCount: {
        fontSize: 12,
        color: '#666',
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 120,
    },
    employeeItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 14,
        borderRadius: 10,
        marginBottom: 8,
        borderWidth: 1.5,
        borderColor: 'transparent',
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    employeeInfo: {
        flex: 1,
    },
    employeeName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#333',
    },
    employeeMeta: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    employeeDept: {
        fontSize: 11,
        color: '#999',
        marginTop: 2,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#666',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
    },
    actionPanel: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -4 },
    },
    selectedInfo: {
        flex: 1,
    },
    selectedName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    selectedId: {
        fontSize: 11,
        color: '#666',
    },
    selectedTime: {
        fontSize: 10,
        color: '#3B82F6',
        marginTop: 2,
    },
    statusSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginRight: 10,
        gap: 6,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    markButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    markButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFF',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#333',
    },
    statusOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 10,
        marginBottom: 8,
        borderWidth: 1.5,
        borderColor: 'transparent',
        backgroundColor: '#F9FAFB',
        gap: 12,
    },
    statusLabel: {
        fontSize: 15,
        fontWeight: '600',
    },
    // Marked tab styles
    markedItem: {
        borderLeftWidth: 3,
        borderLeftColor: '#10B981',
    },
    statusBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 8,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    statusBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    timeText: {
        fontSize: 11,
        color: '#666',
    },
    deleteButton: {
        padding: 10,
        backgroundColor: '#FEE2E2',
        borderRadius: 8,
    },
});

export default AdminMarkAttendanceScreen;
