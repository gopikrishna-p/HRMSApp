import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    StatusBar,
    Modal,
    Alert,
    Platform,
    FlatList,
    Dimensions,
    Linking,
    PermissionsAndroid,
    BackHandler,
    RefreshControl,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import RNFS from 'react-native-fs';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

const { width } = Dimensions.get('window');

function AllAttendanceAnalyticsScreen({ navigation }) {
    // ===========================================
    // STATE MANAGEMENT
    // ===========================================
    const [employees, setEmployees] = useState([]);
    const [filteredEmployees, setFilteredEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [attendanceRecords, setAttendanceRecords] = useState([]);
    const [summaryStats, setSummaryStats] = useState({});
    const [holidays, setHolidays] = useState([]);
    const [leaveApplications, setLeaveApplications] = useState([]);

    // Loading states
    const [loading, setLoading] = useState(false);
    const [loadingAttendance, setLoadingAttendance] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);

    // Date states
    const [dateRange, setDateRange] = useState({ startDate: null, endDate: null });
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);

    // ===========================================
    // LIFECYCLE METHODS
    // ===========================================
    
    // Define handleGoBack first with useCallback
    const handleGoBack = useCallback(() => {
        try {
            if (navigation?.canGoBack()) {
                navigation.goBack();
            } else {
                navigation.navigate('AdminDashboard');
            }
        } catch (error) {
            console.warn('Navigation error:', error);
            navigation.navigate('AdminDashboard');
        }
    }, [navigation]);

    useEffect(() => {
        console.log('AllAttendanceAnalyticsScreen mounted');
        initializeComponent();
    }, []);

    useEffect(() => {
        if (selectedEmployee && dateRange.startDate && dateRange.endDate) {
            loadAttendanceData();
        }
    }, [selectedEmployee, dateRange.startDate, dateRange.endDate]);

    // Handle Android back button
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                handleGoBack();
                return true;
            };
            const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => subscription.remove();
        }, [handleGoBack])
    );

    // ===========================================
    // INITIALIZATION
    // ===========================================
    const initializeComponent = async () => {
        await Promise.all([
            loadEmployees(),
            loadDepartments(),
            requestStoragePermission()
        ]);
    };

    const requestStoragePermission = async () => {
        if (Platform.OS === 'android' && Platform.Version < 33) {
            try {
                await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                    {
                        title: 'Storage Permission',
                        message: 'App needs access to storage to save exported files',
                        buttonPositive: 'OK',
                    }
                );
            } catch (err) {
                console.warn(err);
            }
        }
    };

    // ===========================================
    // DATA LOADING FUNCTIONS
    // ===========================================
    const loadEmployees = async () => {
        setLoading(true);
        try {
            const response = await ApiService.getAllEmployees();
            if (response.success && response.data?.message) {
                const responseData = response.data.message;
                const data = responseData.employees || responseData;
                
                if (Array.isArray(data)) {
                    const activeEmployees = data.filter(emp => emp.status === 'Active');
                    activeEmployees.sort((a, b) =>
                        (a.employee_name || a.name).localeCompare(b.employee_name || b.name)
                    );
                    setEmployees(activeEmployees);
                    setFilteredEmployees(activeEmployees);
                } else {
                    setEmployees([]);
                    setFilteredEmployees([]);
                }
            }
        } catch (error) {
            console.error('Error loading employees:', error);
            showToast({ type: 'error', text1: 'Error', text2: 'Failed to load employees' });
        } finally {
            setLoading(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await ApiService.getDepartments();
            if (response.success && response.data?.message) {
                setDepartments(response.data.message);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    };

    const loadAttendanceData = async () => {
        if (!selectedEmployee || !dateRange.startDate || !dateRange.endDate) return;

        setLoadingAttendance(true);
        try {
            const startDateStr = formatDateForAPI(dateRange.startDate);
            const endDateStr = formatDateForAPI(dateRange.endDate);

            // Load attendance, holidays, and leaves in parallel
            const [attendanceRes, holidaysRes, leavesRes] = await Promise.all([
                ApiService.getEmployeeAttendanceHistory({
                    employee_id: selectedEmployee,
                    start_date: startDateStr,
                    end_date: endDateStr
                }),
                ApiService.getHolidays({ start_date: startDateStr, end_date: endDateStr }),
                ApiService.getLeaveApplications({ employee: selectedEmployee })
            ]);

            // Process attendance
            if (attendanceRes.success && attendanceRes.data?.message) {
                const responseData = attendanceRes.data.message;
                const records = responseData.attendance_records || responseData || [];
                setAttendanceRecords(Array.isArray(records) ? records : []);
                setSummaryStats(responseData.summary_stats || calculateSummaryStats(records));
            } else {
                setAttendanceRecords([]);
                setSummaryStats({});
            }

            // Process holidays
            if (holidaysRes.success && holidaysRes.data?.message) {
                const holidayData = holidaysRes.data.message;
                setHolidays(Array.isArray(holidayData) ? holidayData : []);
            } else {
                setHolidays([]);
            }

            // Process leaves
            if (leavesRes.success && leavesRes.data?.message) {
                const leaves = leavesRes.data.message?.leave_applications || leavesRes.data.message || [];
                setLeaveApplications(Array.isArray(leaves) ? leaves : []);
            }
        } catch (error) {
            console.error('Error loading attendance:', error);
            showToast({ type: 'error', text1: 'Error', text2: 'Failed to load attendance records' });
            setAttendanceRecords([]);
            setSummaryStats({});
        } finally {
            setLoadingAttendance(false);
        }
    };

    const calculateSummaryStats = (records) => {
        if (!Array.isArray(records) || records.length === 0) return {};
        
        const stats = {
            total_days: records.length,
            present_days: 0,
            absent_days: 0,
            wfh_days: 0,
            onsite_days: 0,
            leave_days: 0,
            late_arrivals: 0,
            total_working_hours: 0,
            holiday_days: 0
        };

        records.forEach(record => {
            const status = (record.status || '').toLowerCase();
            if (status === 'present') stats.present_days++;
            else if (status === 'absent') stats.absent_days++;
            else if (status === 'work from home' || status === 'wfh') stats.wfh_days++;
            else if (status === 'on site' || status === 'onsite') stats.onsite_days++;
            else if (status === 'on leave') stats.leave_days++;
            else if (status === 'holiday') stats.holiday_days++;

            if (record.late_entry) stats.late_arrivals++;
            stats.total_working_hours += parseFloat(record.working_hours || 0);
        });

        const attended = stats.present_days + stats.wfh_days + stats.onsite_days;
        const workingDays = stats.total_days - stats.holiday_days;
        stats.attendance_percentage = workingDays > 0 ? ((attended / workingDays) * 100).toFixed(1) : 0;
        stats.total_working_hours = stats.total_working_hours.toFixed(1);
        stats.avg_working_hours = (stats.total_working_hours / (attended || 1)).toFixed(1);

        return stats;
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadEmployees();
        if (selectedEmployee && dateRange.startDate && dateRange.endDate) {
            await loadAttendanceData();
        }
        setRefreshing(false);
    };

    // ===========================================
    // DATE FUNCTIONS
    // ===========================================
    const formatDateForAPI = (date) => {
        if (!date) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const formatDisplayDate = (date) => {
        if (!date) return 'Select';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const applyDatePreset = (preset) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let startDate, endDate;

        switch (preset) {
            case 'today':
                startDate = new Date(today);
                endDate = new Date(today);
                break;
            case 'yesterday':
                startDate = new Date(today.getTime() - 86400000);
                endDate = new Date(today.getTime() - 86400000);
                break;
            case 'week':
                startDate = new Date(today.getTime() - 6 * 86400000);
                endDate = new Date(today);
                break;
            case 'month':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case 'lastMonth':
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                endDate = new Date(today.getFullYear(), today.getMonth(), 0);
                break;
            case 'quarter':
                const quarterStart = Math.floor(today.getMonth() / 3) * 3;
                startDate = new Date(today.getFullYear(), quarterStart, 1);
                endDate = new Date(today);
                break;
            default:
                return;
        }
        setDateRange({ startDate, endDate });
    };

    const onStartDateChange = (event, selectedDate) => {
        setShowStartPicker(false);
        if (event.type === 'dismissed') return;
        
        if (selectedDate) {
            const newStart = new Date(selectedDate);
            newStart.setHours(0, 0, 0, 0);
            
            // If end date is before new start date, set end date to last day of start month
            let newEnd = dateRange.endDate;
            if (!newEnd || newEnd < newStart) {
                newEnd = new Date(newStart.getFullYear(), newStart.getMonth() + 1, 0);
            }
            
            setDateRange({ startDate: newStart, endDate: newEnd });
        }
    };

    const onEndDateChange = (event, selectedDate) => {
        setShowEndPicker(false);
        if (event.type === 'dismissed') return;
        
        if (selectedDate) {
            const newEnd = new Date(selectedDate);
            newEnd.setHours(23, 59, 59, 999);
            setDateRange(prev => ({ ...prev, endDate: newEnd }));
        }
    };

    // ===========================================
    // EXPORT FUNCTIONS
    // ===========================================
    const downloadFile = async (base64Data, fileName, mimeType) => {
        try {
            const base64Content = base64Data.replace(/^data:.*?;base64,/, '');
            const downloadPath = Platform.OS === 'ios'
                ? `${RNFS.DocumentDirectoryPath}/${fileName}`
                : `${RNFS.DownloadDirectoryPath}/${fileName}`;

            await RNFS.writeFile(downloadPath, base64Content, 'base64');
            
            showToast({ type: 'success', text1: 'Download Complete', text2: `File saved: ${fileName}` });

            if (Platform.OS === 'android') {
                Linking.openURL(`file://${downloadPath}`).catch(() => {
                    showToast({ type: 'info', text1: 'File Saved', text2: 'Check Downloads folder' });
                });
            }
            return downloadPath;
        } catch (error) {
            console.error('Download error:', error);
            throw error;
        }
    };

    const handleExport = async (format, exportAll = false) => {
        if (!dateRange.startDate || !dateRange.endDate) {
            showToast({ type: 'warning', text1: 'Select Date Range', text2: 'Please select a date range first' });
            return;
        }

        if (!exportAll && !selectedEmployee) {
            showToast({ type: 'warning', text1: 'Select Employee', text2: 'Please select an employee first' });
            return;
        }

        if (exportAll) {
            Alert.alert(
                'Export All Employees',
                'This will export attendance for all employees. Continue?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Export', onPress: () => performExport(format, true) }
                ]
            );
        } else {
            performExport(format, false);
        }
    };

    const performExport = async (format, exportAll) => {
        setExportLoading(true);
        setShowExportModal(false);
        try {
            const params = {
                start_date: formatDateForAPI(dateRange.startDate),
                end_date: formatDateForAPI(dateRange.endDate),
                export_format: format,
                department: selectedDepartment || null
            };

            if (!exportAll) {
                params.employee_id = selectedEmployee;
            }

            const response = await ApiService.exportAttendanceReport(params);

            if (response.success && response.data?.message) {
                const result = response.data.message;
                if (result.status === 'success' && result.content) {
                    await downloadFile(result.content, result.file_name, result.content_type);
                } else {
                    throw new Error(result.message || 'Export failed');
                }
            } else {
                throw new Error(response.message || 'Export failed');
            }
        } catch (error) {
            console.error('Export error:', error);
            showToast({ type: 'error', text1: 'Export Failed', text2: error.message || 'Failed to export report' });
        } finally {
            setExportLoading(false);
        }
    };

    // ===========================================
    // GENERATE ALL DATES IN RANGE
    // ===========================================
    // Safely get arrays with fallbacks
    const safeHolidays = Array.isArray(holidays) ? holidays : [];
    const safeLeaveApplications = Array.isArray(leaveApplications) ? leaveApplications : [];
    const safeAttendanceRecords = Array.isArray(attendanceRecords) ? attendanceRecords : [];

    const allDatesInRange = useMemo(() => {
        try {
            if (!dateRange.startDate || !dateRange.endDate) return [];
            
            const dates = [];
            const current = new Date(dateRange.startDate);
            const end = new Date(dateRange.endDate);
            
            // Limit to prevent infinite loops
            let loopCount = 0;
            const maxDays = 366;
            
            while (current <= end && loopCount < maxDays) {
                loopCount++;
                const dateStr = formatDateForAPI(current);
                
                // Find attendance record for this date
                const attendanceRecord = safeAttendanceRecords.find(r => 
                    r?.attendance_date === dateStr || 
                    (r?.attendance_date && r.attendance_date.split('T')[0] === dateStr)
                ) || null;
                
                // Check if holiday
                const holiday = safeHolidays.find(h => h?.holiday_date === dateStr) || null;
                
                // Check if on leave
                const leave = safeLeaveApplications.find(l => {
                    if (!l?.from_date || !l?.to_date) return false;
                    const fromDate = new Date(l.from_date);
                    const toDate = new Date(l.to_date);
                    return current >= fromDate && current <= toDate && l.docstatus === 1;
                }) || null;

                const isWeekend = current.getDay() === 0 || current.getDay() === 6;
                
                dates.push({
                    date: new Date(current),
                    dateStr,
                    attendance: attendanceRecord,
                    holiday,
                    leave,
                    isWeekend,
                    dayName: current.toLocaleDateString('en-US', { weekday: 'short' })
                });
                
                current.setDate(current.getDate() + 1);
            }
            
            return dates.reverse(); // Most recent first
        } catch (error) {
            console.warn('Error generating date range:', error);
            return [];
        }
    }, [dateRange, safeAttendanceRecords, safeHolidays, safeLeaveApplications]);

    // ===========================================
    // RENDER HELPERS
    // ===========================================
    const getStatusConfig = (item) => {
        if (item.holiday) {
            return { label: 'Holiday', color: '#8B5CF6', bgColor: '#F3E8FF', icon: 'umbrella-beach' };
        }
        if (item.leave) {
            return { label: item.leave.leave_type || 'Leave', color: '#F59E0B', bgColor: '#FEF3C7', icon: 'plane-departure' };
        }
        if (item.attendance) {
            const status = (item.attendance.status || '').toLowerCase();
            switch (status) {
                case 'present':
                    return { label: 'Present', color: '#10B981', bgColor: '#ECFDF5', icon: 'check-circle' };
                case 'absent':
                    return { label: 'Absent', color: '#EF4444', bgColor: '#FEE2E2', icon: 'times-circle' };
                case 'work from home':
                case 'wfh':
                    return { label: 'WFH', color: '#3B82F6', bgColor: '#EFF6FF', icon: 'home' };
                case 'on site':
                case 'onsite':
                    return { label: 'Onsite', color: '#8B5CF6', bgColor: '#F3E8FF', icon: 'building' };
                case 'half day':
                    return { label: 'Half Day', color: '#F59E0B', bgColor: '#FEF3C7', icon: 'adjust' };
                case 'on leave':
                    return { label: 'On Leave', color: '#F59E0B', bgColor: '#FEF3C7', icon: 'plane-departure' };
                default:
                    return { label: status || 'Unknown', color: '#6B7280', bgColor: '#F3F4F6', icon: 'question-circle' };
            }
        }
        if (item.isWeekend) {
            return { label: 'Weekend', color: '#9CA3AF', bgColor: '#F9FAFB', icon: 'coffee' };
        }
        return { label: 'No Record', color: '#9CA3AF', bgColor: '#F9FAFB', icon: 'minus-circle' };
    };

    const renderDateItem = ({ item }) => {
        const statusConfig = getStatusConfig(item);
        const checkIn = item.attendance?.in_time || item.attendance?.check_in;
        const checkOut = item.attendance?.out_time || item.attendance?.check_out;
        const hours = item.attendance?.working_hours;
        const isLate = item.attendance?.late_entry;
        const isEarlyOut = item.attendance?.early_exit;

        return (
            <View style={styles.dateCard}>
                <View style={styles.dateCardLeft}>
                    <Text style={styles.dateDay}>{item.date.getDate()}</Text>
                    <Text style={styles.dateDayName}>{item.dayName}</Text>
                </View>
                
                <View style={styles.dateCardMiddle}>
                    <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                        <Icon name={statusConfig.icon} size={12} color={statusConfig.color} />
                        <Text style={[styles.statusText, { color: statusConfig.color }]}>
                            {statusConfig.label}
                        </Text>
                    </View>
                    
                    {item.holiday && (
                        <Text style={styles.holidayName} numberOfLines={1}>
                            {item.holiday.description || item.holiday.holiday_name || 'Holiday'}
                        </Text>
                    )}
                    
                    {item.leave && (
                        <Text style={styles.leaveType} numberOfLines={1}>
                            {item.leave.leave_type}
                        </Text>
                    )}
                    
                    {item.attendance && checkIn && (
                        <View style={styles.timeRow}>
                            <Text style={styles.timeLabel}>In:</Text>
                            <Text style={[styles.timeValue, isLate && styles.lateText]}>
                                {formatTime(checkIn)} {isLate && '⚠️'}
                            </Text>
                            {checkOut && (
                                <>
                                    <Text style={styles.timeLabel}>Out:</Text>
                                    <Text style={[styles.timeValue, isEarlyOut && styles.earlyText]}>
                                        {formatTime(checkOut)} {isEarlyOut && '⚡'}
                                    </Text>
                                </>
                            )}
                        </View>
                    )}
                </View>
                
                <View style={styles.dateCardRight}>
                    {hours > 0 && (
                        <View style={styles.hoursBox}>
                            <Text style={styles.hoursText}>{parseFloat(hours).toFixed(1)}</Text>
                            <Text style={styles.hoursLabel}>hrs</Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    const formatTime = (timeStr) => {
        if (!timeStr) return '--';
        try {
            if (timeStr.includes(':')) {
                const parts = timeStr.split(':');
                const hour = parseInt(parts[0]);
                const minute = parts[1];
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const hour12 = hour % 12 || 12;
                return `${hour12}:${minute} ${ampm}`;
            }
            return timeStr;
        } catch {
            return timeStr;
        }
    };

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            {/* Employee Selection */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>👤 Select Employee</Text>
                {loading ? (
                    <ActivityIndicator size="small" color="#6366F1" />
                ) : (
                    <View style={styles.pickerContainer} pointerEvents="box-none">
                        <Picker
                            selectedValue={selectedEmployee}
                            onValueChange={(value) => setSelectedEmployee(value)}
                            style={styles.picker}
                            dropdownIconColor="#6366F1"
                            mode="dropdown"
                        >
                            <Picker.Item label="-- Select Employee --" value="" />
                            {filteredEmployees.map((emp) => (
                                <Picker.Item
                                    key={emp.name}
                                    label={`${emp.employee_name || emp.name} ${emp.designation ? `(${emp.designation})` : ''}`}
                                    value={emp.name}
                                />
                            ))}
                        </Picker>
                    </View>
                )}
            </View>

            {/* Date Range Selection */}
            <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>📅 Date Range</Text>
                    {(dateRange.startDate || dateRange.endDate) && (
                        <TouchableOpacity onPress={() => setDateRange({ startDate: null, endDate: null })}>
                            <Text style={styles.clearBtn}>Clear</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Presets */}
                <View style={styles.presetRow}>
                    {[
                        { label: 'Today', value: 'today' },
                        { label: 'This Week', value: 'week' },
                        { label: 'This Month', value: 'month' },
                        { label: 'Last Month', value: 'lastMonth' },
                    ].map(preset => (
                        <TouchableOpacity
                            key={preset.value}
                            style={styles.presetBtn}
                            onPress={() => applyDatePreset(preset.value)}
                        >
                            <Text style={styles.presetText}>{preset.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Date Buttons */}
                <View style={styles.dateRow}>
                    <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
                        <Icon name="calendar" size={14} color="#6366F1" />
                        <Text style={styles.dateBtnText}>{formatDisplayDate(dateRange.startDate)}</Text>
                    </TouchableOpacity>
                    <Icon name="arrow-right" size={12} color="#9CA3AF" />
                    <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
                        <Icon name="calendar" size={14} color="#6366F1" />
                        <Text style={styles.dateBtnText}>{formatDisplayDate(dateRange.endDate)}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Summary Stats */}
            {selectedEmployee && Object.keys(summaryStats).length > 0 && renderSummaryCard()}

            {/* Export Buttons */}
            {selectedEmployee && dateRange.startDate && dateRange.endDate && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📤 Export Reports</Text>
                    <View style={styles.exportBtnRow}>
                        <TouchableOpacity
                            style={[styles.exportBtn, { backgroundColor: '#DC2626' }]}
                            onPress={() => handleExport('pdf')}
                            disabled={exportLoading}
                        >
                            <Icon name="file-pdf" size={16} color="white" />
                            <Text style={styles.exportBtnText}>PDF</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.exportBtn, { backgroundColor: '#16A34A' }]}
                            onPress={() => handleExport('excel')}
                            disabled={exportLoading}
                        >
                            <Icon name="file-excel" size={16} color="white" />
                            <Text style={styles.exportBtnText}>Excel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.exportBtn, { backgroundColor: '#6366F1' }]}
                            onPress={() => setShowExportModal(true)}
                            disabled={exportLoading}
                        >
                            <Icon name="cog" size={16} color="white" />
                            <Text style={styles.exportBtnText}>More</Text>
                        </TouchableOpacity>
                    </View>
                    {exportLoading && (
                        <View style={styles.exportingRow}>
                            <ActivityIndicator size="small" color="#6366F1" />
                            <Text style={styles.exportingText}>Generating export...</Text>
                        </View>
                    )}
                </View>
            )}

            {/* Records Header */}
            {selectedEmployee && (
                <View style={styles.recordsHeader}>
                    <Text style={styles.recordsTitle}>
                        📋 Attendance Records {allDatesInRange.length > 0 ? `(${allDatesInRange.length} days)` : ''}
                    </Text>
                </View>
            )}
        </View>
    );

    const renderSummaryCard = () => {
        const stats = summaryStats;
        const attendanceRate = parseFloat(stats.attendance_percentage || 0);

        return (
            <View style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                    <Text style={styles.summaryTitle}>📊 Summary</Text>
                    <View style={[
                        styles.rateBadge,
                        { backgroundColor: attendanceRate >= 90 ? '#ECFDF5' : attendanceRate >= 75 ? '#FEF3C7' : '#FEE2E2' }
                    ]}>
                        <Text style={[
                            styles.rateText,
                            { color: attendanceRate >= 90 ? '#10B981' : attendanceRate >= 75 ? '#F59E0B' : '#EF4444' }
                        ]}>
                            {attendanceRate}%
                        </Text>
                    </View>
                </View>

                <View style={styles.statsGrid}>
                    {[
                        { label: 'Present', value: stats.present_days || 0, color: '#10B981', icon: 'check-circle' },
                        { label: 'WFH', value: stats.wfh_days || 0, color: '#3B82F6', icon: 'home' },
                        { label: 'Onsite', value: stats.onsite_days || 0, color: '#8B5CF6', icon: 'building' },
                        { label: 'Absent', value: stats.absent_days || 0, color: '#EF4444', icon: 'times-circle' },
                        { label: 'Leave', value: stats.leave_days || 0, color: '#F59E0B', icon: 'plane-departure' },
                        { label: 'Holiday', value: stats.holiday_days || holidays.length || 0, color: '#EC4899', icon: 'umbrella-beach' },
                        { label: 'Late', value: stats.late_arrivals || 0, color: '#EF4444', icon: 'clock' },
                        { label: 'Hours', value: stats.total_working_hours || 0, color: '#6366F1', icon: 'hourglass-half' },
                    ].map((stat, idx) => (
                        <View key={idx} style={styles.statItem}>
                            <Icon name={stat.icon} size={16} color={stat.color} />
                            <Text style={styles.statValue}>{stat.value}</Text>
                            <Text style={styles.statLabel}>{stat.label}</Text>
                        </View>
                    ))}
                </View>
            </View>
        );
    };

    const renderEmptyState = () => {
        if (!selectedEmployee) {
            return (
                <View style={styles.emptyState}>
                    <Icon name="user-friends" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyTitle}>Select an Employee</Text>
                    <Text style={styles.emptyText}>Choose an employee from the dropdown to view attendance</Text>
                </View>
            );
        }
        if (!dateRange.startDate || !dateRange.endDate) {
            return (
                <View style={styles.emptyState}>
                    <Icon name="calendar-alt" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyTitle}>Select Date Range</Text>
                    <Text style={styles.emptyText}>Choose a date range to view attendance records</Text>
                </View>
            );
        }
        return (
            <View style={styles.emptyState}>
                <Icon name="calendar-times" size={48} color="#9CA3AF" />
                <Text style={styles.emptyTitle}>No Records Found</Text>
                <Text style={styles.emptyText}>No attendance records found for selected period</Text>
            </View>
        );
    };

    const renderExportModal = () => (
        <Modal
            visible={showExportModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowExportModal(false)}
        >
            <View style={styles.modalBackdrop}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Export Options</Text>
                        <TouchableOpacity onPress={() => setShowExportModal(false)}>
                            <Icon name="times" size={20} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.modalBody}>
                        <Text style={styles.modalSectionTitle}>📊 Individual Employee</Text>
                        <View style={styles.modalBtnRow}>
                            <TouchableOpacity
                                style={[styles.modalBtn, { backgroundColor: '#FEE2E2' }]}
                                onPress={() => handleExport('pdf', false)}
                                disabled={!selectedEmployee}
                            >
                                <Icon name="file-pdf" size={24} color="#DC2626" />
                                <Text style={styles.modalBtnText}>PDF Report</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, { backgroundColor: '#ECFDF5' }]}
                                onPress={() => handleExport('excel', false)}
                                disabled={!selectedEmployee}
                            >
                                <Icon name="file-excel" size={24} color="#16A34A" />
                                <Text style={styles.modalBtnText}>Excel Report</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalSectionTitle}>👥 All Employees</Text>
                        <View style={styles.modalBtnRow}>
                            <TouchableOpacity
                                style={[styles.modalBtn, { backgroundColor: '#FEF3C7' }]}
                                onPress={() => handleExport('pdf', true)}
                            >
                                <Icon name="file-pdf" size={24} color="#D97706" />
                                <Text style={styles.modalBtnText}>All PDF</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, { backgroundColor: '#EFF6FF' }]}
                                onPress={() => handleExport('excel', true)}
                            >
                                <Icon name="file-excel" size={24} color="#2563EB" />
                                <Text style={styles.modalBtnText}>All Excel</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalNote}>
                            <Icon name="info-circle" size={14} color="#6366F1" />
                            <Text style={styles.modalNoteText}>
                                Files will be saved to Downloads folder. Large exports may take time.
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );

    // ===========================================
    // MAIN RENDER
    // ===========================================
    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            <FlatList
                data={loadingAttendance ? [] : (selectedEmployee && dateRange.startDate && dateRange.endDate ? allDatesInRange : [])}
                keyExtractor={(item) => item.dateStr}
                renderItem={renderDateItem}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={loadingAttendance ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#6366F1" />
                        <Text style={styles.loadingText}>Loading attendance...</Text>
                    </View>
                ) : renderEmptyState()}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366F1']} />
                }
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                nestedScrollEnabled={true}
            />

            {/* Date Pickers */}
            {showStartPicker && (
                <DateTimePicker
                    value={dateRange.startDate || new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onStartDateChange}
                    maximumDate={new Date()}
                />
            )}

            {showEndPicker && (
                <DateTimePicker
                    value={dateRange.endDate || dateRange.startDate || new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onEndDateChange}
                    minimumDate={dateRange.startDate || undefined}
                    maximumDate={new Date()}
                />
            )}

            {renderExportModal()}
        </View>
    );
}

// ===========================================
// STYLES
// ===========================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    listContent: {
        paddingBottom: 20,
    },
    headerContainer: {
        paddingBottom: 8,
    },
    section: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginTop: 12,
        padding: 16,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 12,
    },
    clearBtn: {
        fontSize: 14,
        color: '#6366F1',
        fontWeight: '500',
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        backgroundColor: '#F9FAFB',
        overflow: 'hidden',
    },
    picker: {
        height: 50,
    },
    presetRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    presetBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#EEF2FF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    presetText: {
        fontSize: 12,
        color: '#6366F1',
        fontWeight: '500',
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    dateBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 8,
    },
    dateBtnText: {
        fontSize: 13,
        color: '#374151',
        fontWeight: '500',
    },
    summaryCard: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginTop: 12,
        padding: 16,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    summaryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    rateBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    rateText: {
        fontSize: 14,
        fontWeight: '700',
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    statItem: {
        width: (width - 64 - 24) / 4,
        alignItems: 'center',
        paddingVertical: 10,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginTop: 4,
    },
    statLabel: {
        fontSize: 10,
        color: '#6B7280',
        marginTop: 2,
    },
    exportBtnRow: {
        flexDirection: 'row',
        gap: 10,
    },
    exportBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 10,
        gap: 6,
    },
    exportBtnText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    },
    exportingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
        padding: 8,
        backgroundColor: '#EEF2FF',
        borderRadius: 8,
    },
    exportingText: {
        marginLeft: 8,
        fontSize: 13,
        color: '#6366F1',
    },
    recordsHeader: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    recordsTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    dateCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 12,
        borderRadius: 10,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    dateCardLeft: {
        width: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: '#E5E7EB',
        marginRight: 12,
    },
    dateDay: {
        fontSize: 22,
        fontWeight: '700',
        color: '#111827',
    },
    dateDayName: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 2,
    },
    dateCardMiddle: {
        flex: 1,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
        marginBottom: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    holidayName: {
        fontSize: 12,
        color: '#8B5CF6',
        fontWeight: '500',
    },
    leaveType: {
        fontSize: 12,
        color: '#F59E0B',
        fontWeight: '500',
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 4,
    },
    timeLabel: {
        fontSize: 11,
        color: '#9CA3AF',
    },
    timeValue: {
        fontSize: 12,
        color: '#374151',
        fontWeight: '500',
        marginRight: 8,
    },
    lateText: {
        color: '#EF4444',
    },
    earlyText: {
        color: '#F59E0B',
    },
    dateCardRight: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: 8,
    },
    hoursBox: {
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    hoursText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#6366F1',
    },
    hoursLabel: {
        fontSize: 10,
        color: '#6366F1',
    },
    loadingContainer: {
        alignItems: 'center',
        padding: 60,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#6B7280',
    },
    emptyState: {
        alignItems: 'center',
        padding: 60,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#374151',
        marginTop: 16,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    modalBody: {
        padding: 20,
    },
    modalSectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 12,
        marginTop: 8,
    },
    modalBtnRow: {
        flexDirection: 'row',
        gap: 12,
    },
    modalBtn: {
        flex: 1,
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
    },
    modalBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
        marginTop: 8,
    },
    modalNote: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        padding: 12,
        borderRadius: 8,
        marginTop: 20,
        gap: 8,
    },
    modalNoteText: {
        flex: 1,
        fontSize: 12,
        color: '#6366F1',
    },
});

export default AllAttendanceAnalyticsScreen;
