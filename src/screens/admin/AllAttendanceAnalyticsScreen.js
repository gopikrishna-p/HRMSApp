import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    TextInput,
    StatusBar,
    Modal,
    Alert,
    ScrollView,
    Platform,
    Switch,
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
import AttendanceList from '../../components/admin/AttendanceList';

function AllAttendanceAnalyticsScreen({ navigation }) {
    // ===========================================
    // STATE MANAGEMENT
    // ===========================================
    const [employees, setEmployees] = useState([]);
    const [filteredEmployees, setFilteredEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [attendance, setAttendance] = useState([]);
    const [summaryStats, setSummaryStats] = useState({});

    // Loading states
    const [loading, setLoading] = useState(false);
    const [loadingAttendance, setLoadingAttendance] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);

    // UI states
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState({ startDate: null, endDate: null });
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);

    // Export options
    const [exportOptions, setExportOptions] = useState({
        includeWorkingHours: true,
        includeLateArrivals: true,
        includeHolidays: false,
        includeSummaryStats: true,
        splitByDepartment: false
    });

    // ===========================================
    // LIFECYCLE METHODS
    // ===========================================
    useEffect(() => {
        console.log('AllAttendanceAnalyticsScreen mounted');
        initializeComponent();
    }, []);

    useEffect(() => {
        if (selectedEmployee) {
            loadAttendance();
        }
    }, [selectedEmployee, dateRange]);

    useEffect(() => {
        filterEmployees();
    }, [employees, searchQuery]);

    // Handle Android back button
    useFocusEffect(
        React.useCallback(() => {
            const onBackPress = () => {
                console.log('Android back button pressed');
                handleGoBack();
                return true; // Prevent default behavior
            };

            const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => subscription.remove();
        }, [])
    );

    // ===========================================
    // INITIALIZATION
    // ===========================================
    const handleGoBack = () => {
        try {
            console.log('AllAttendanceAnalyticsScreen - handleGoBack called');
            
            if (navigation && navigation.canGoBack()) {
                navigation.goBack();
            } else {
                navigation.navigate('AdminDashboard');
            }
        } catch (error) {
            console.error('Navigation error:', error);
            // Simple fallback
            navigation.navigate('AdminDashboard');
        }
    };

    const initializeComponent = async () => {
        try {
            await Promise.all([
                loadEmployees(),
                loadDepartments(),
                requestStoragePermission()
            ]);
        } catch (error) {
            console.error('Initialization error:', error);
        }
    };

    const requestStoragePermission = async () => {
        if (Platform.OS === 'android') {
            try {
                if (Platform.Version >= 33) {
                    // Android 13+, no need for WRITE_EXTERNAL_STORAGE
                    return true;
                }
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                    {
                        title: 'Storage Permission',
                        message: 'App needs access to storage to save exported files',
                        buttonNeutral: 'Ask Me Later',
                        buttonNegative: 'Cancel',
                        buttonPositive: 'OK',
                    }
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            } catch (err) {
                console.warn(err);
                return false;
            }
        }
        return true;
    };

    // ===========================================
    // DATA LOADING FUNCTIONS
    // ===========================================
    const loadEmployees = async () => {
        setLoading(true);
        try {
            const response = await ApiService.getAllEmployees();

            if (response.success && response.data?.message) {
                const data = response.data.message;
                const activeEmployees = data.filter(emp => emp.status === 'Active');
                activeEmployees.sort((a, b) =>
                    (a.employee_name || a.name).localeCompare(b.employee_name || b.name)
                );

                setEmployees(activeEmployees);
                setFilteredEmployees(activeEmployees);
                setSelectedEmployee('');

                if (activeEmployees.length === 0) {
                    showToast({
                        type: 'warning',
                        text1: 'No Active Employees',
                        text2: 'No active employees found in the system',
                    });
                }
            }
        } catch (error) {
            console.error('Error loading employees:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to load employees',
            });
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

    const loadAttendance = async () => {
        if (!selectedEmployee || selectedEmployee === '') {
            setAttendance([]);
            setSummaryStats({});
            return;
        }

        setLoadingAttendance(true);
        try {
            const params = {
                employee_id: selectedEmployee,
                start_date: dateRange.startDate?.toISOString().split('T')[0],
                end_date: dateRange.endDate?.toISOString().split('T')[0]
            };

            const response = await ApiService.getEmployeeAttendanceHistory(params);

            if (response.success && response.data?.message) {
                const responseData = response.data.message;
                setAttendance(responseData.attendance_records || responseData || []);
                setSummaryStats(responseData.summary_stats || {});
            }
        } catch (error) {
            console.error('Error loading attendance:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to load attendance records',
            });
            setAttendance([]);
            setSummaryStats({});
        } finally {
            setLoadingAttendance(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadEmployees();
        if (selectedEmployee) {
            await loadAttendance();
        }
        setRefreshing(false);
    };

    // ===========================================
    // SEARCH AND FILTER FUNCTIONS
    // ===========================================
    const filterEmployees = () => {
        if (searchQuery.trim()) {
            const filtered = employees.filter(emp => {
                if (emp.status !== 'Active') return false;
                const employeeName = (emp.employee_name || '').toLowerCase();
                const name = (emp.name || '').toLowerCase();
                const designation = (emp.designation || '').toLowerCase();
                const department = (emp.department || '').toLowerCase();
                const searchTerm = searchQuery.toLowerCase();
                return employeeName.includes(searchTerm) || name.includes(searchTerm) ||
                    designation.includes(searchTerm) || department.includes(searchTerm);
            });
            setFilteredEmployees(filtered);
        } else {
            setFilteredEmployees(employees.filter(emp => emp.status === 'Active'));
        }
    };

    // ===========================================
    // DATE RANGE FUNCTIONS
    // ===========================================
    const applyDatePreset = (preset) => {
        const today = new Date();
        let startDate, endDate;

        switch (preset.type) {
            case 'today':
                startDate = endDate = today;
                break;
            case 'yesterday':
                const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
                startDate = endDate = yesterday;
                break;
            case 'week':
                startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = today;
                break;
            case 'month':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case 'lastMonth':
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                endDate = new Date(today.getFullYear(), today.getMonth(), 0);
                break;
            default:
                return;
        }
        setDateRange({ startDate, endDate });
    };

    const clearDateRange = () => {
        setDateRange({ startDate: null, endDate: null });
    };

    const onStartDateChange = (event, selectedDate) => {
        setShowStartPicker(false);
        if (selectedDate) {
            setDateRange(prev => ({ ...prev, startDate: selectedDate }));
        }
    };

    const onEndDateChange = (event, selectedDate) => {
        setShowEndPicker(false);
        if (selectedDate) {
            setDateRange(prev => ({ ...prev, endDate: selectedDate }));
        }
    };

    // ===========================================
    // FILE DOWNLOAD FUNCTIONS
    // ===========================================
    const downloadFile = async (base64Data, fileName, mimeType) => {
        try {
            // Remove data URI prefix if present
            const base64Content = base64Data.replace(/^data:.*?;base64,/, '');

            // Determine file path based on platform
            const downloadPath = Platform.OS === 'ios'
                ? `${RNFS.DocumentDirectoryPath}/${fileName}`
                : `${RNFS.DownloadDirectoryPath}/${fileName}`;

            // Write file
            await RNFS.writeFile(downloadPath, base64Content, 'base64');

            // Show success message
            showToast({
                type: 'success',
                text1: 'Download Complete',
                text2: `File saved: ${fileName}`,
            });

            // Open file on Android
            if (Platform.OS === 'android') {
                const fileUri = `file://${downloadPath}`;
                Linking.openURL(fileUri).catch(err => {
                    console.log('Error opening file:', err);
                    showToast({
                        type: 'info',
                        text1: 'File Saved',
                        text2: `Check Downloads folder for ${fileName}`,
                    });
                });
            }

            return downloadPath;
        } catch (error) {
            console.error('Download error:', error);
            throw error;
        }
    };

    // ===========================================
    // EXPORT FUNCTIONS
    // ===========================================
    const handleQuickExport = async (format) => {
        if (!selectedEmployee) {
            showToast({
                type: 'warning',
                text1: 'Select Employee',
                text2: 'Please select an employee first',
            });
            return;
        }

        if (!dateRange.startDate || !dateRange.endDate) {
            showToast({
                type: 'warning',
                text1: 'Select Date Range',
                text2: 'Please select a date range first',
            });
            return;
        }

        setExportLoading(true);
        try {
            const params = {
                employee_id: selectedEmployee,
                start_date: dateRange.startDate.toISOString().split('T')[0],
                end_date: dateRange.endDate.toISOString().split('T')[0],
                export_format: format
            };

            const response = await ApiService.exportAttendanceReport(params);

            if (response.success && response.data?.message) {
                const result = response.data.message;

                if (result.status === 'success' && result.content) {
                    await downloadFile(result.content, result.file_name, result.content_type);
                } else {
                    throw new Error('Invalid export response');
                }
            } else {
                throw new Error('Export failed');
            }
        } catch (error) {
            console.error('Export error:', error);
            showToast({
                type: 'error',
                text1: 'Export Failed',
                text2: error.message || 'Failed to export attendance report',
            });
        } finally {
            setExportLoading(false);
        }
    };

    const handleExportWithOptions = async (format) => {
        setShowExportModal(false);
        await handleQuickExport(format);
    };

    const handleExportAll = async (format) => {
        if (!dateRange.startDate || !dateRange.endDate) {
            showToast({
                type: 'warning',
                text1: 'Select Date Range',
                text2: 'Please select a date range first',
            });
            return;
        }

        Alert.alert(
            'Export All Employees',
            'This will export attendance for all employees. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Export',
                    onPress: async () => {
                        setExportLoading(true);
                        try {
                            const params = {
                                start_date: dateRange.startDate.toISOString().split('T')[0],
                                end_date: dateRange.endDate.toISOString().split('T')[0],
                                export_format: format,
                                department: selectedDepartment || null
                            };

                            const response = await ApiService.exportAttendanceReport(params);

                            if (response.success && response.data?.message) {
                                const result = response.data.message;

                                if (result.status === 'success' && result.content) {
                                    await downloadFile(result.content, result.file_name, result.content_type);
                                }
                            }
                        } catch (error) {
                            console.error('Export error:', error);
                            showToast({
                                type: 'error',
                                text1: 'Export Failed',
                                text2: 'Failed to export all employees report',
                            });
                        } finally {
                            setExportLoading(false);
                            setShowExportModal(false);
                        }
                    }
                }
            ]
        );
    };

    // ===========================================
    // RENDER HELPERS
    // ===========================================
    const formatDate = (date) => {
        if (!date) return 'Not selected';
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const calculateDateRangeDays = () => {
        if (!dateRange.startDate || !dateRange.endDate) return 0;
        const diffTime = Math.abs(dateRange.endDate - dateRange.startDate);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    };

    const renderDatePresets = () => {
        const presets = [
            { label: 'Today', type: 'today', icon: 'calendar-day' },
            { label: 'Yesterday', type: 'yesterday', icon: 'calendar-minus' },
            { label: 'Last 7 Days', type: 'week', icon: 'calendar-week' },
            { label: 'This Month', type: 'month', icon: 'calendar' },
            { label: 'Last Month', type: 'lastMonth', icon: 'calendar-alt' },
        ];

        return (
            <View style={styles.presetContainer}>
                {presets.map((preset) => (
                    <TouchableOpacity
                        key={preset.type}
                        style={styles.presetButton}
                        onPress={() => applyDatePreset(preset)}
                    >
                        <Icon name={preset.icon} size={14} color="#6366F1" />
                        <Text style={styles.presetText}>{preset.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    };

    const renderSummaryCard = () => {
        if (!summaryStats || Object.keys(summaryStats).length === 0) return null;

        const primaryStats = [
            {
                label: 'Working Days',
                value: summaryStats.total_working_days || summaryStats.total_days || 0,
                icon: 'calendar-check',
                color: '#6366F1',
                bgColor: '#EEF2FF'
            },
            {
                label: 'Present',
                value: summaryStats.present_days || 0,
                icon: 'check-circle',
                color: '#10B981',
                bgColor: '#ECFDF5'
            },
            {
                label: 'WFH',
                value: summaryStats.wfh_days || 0,
                icon: 'home',
                color: '#F59E0B',
                bgColor: '#FEF3C7'
            },
            {
                label: 'Absent',
                value: summaryStats.absent_days || 0,
                icon: 'times-circle',
                color: '#EF4444',
                bgColor: '#FEE2E2'
            },
        ];

        const secondaryStats = [
            {
                label: 'Holiday',
                value: summaryStats.holiday_days || 0,
                icon: 'umbrella-beach',
                color: '#8B5CF6'
            },
            {
                label: 'Late Arrivals',
                value: summaryStats.late_arrivals || 0,
                icon: 'clock',
                color: '#EF4444'
            },
        ];

        const attendanceRate = summaryStats.attendance_percentage || 0;
        const totalHours = summaryStats.total_working_hours || 0;
        const avgHours = summaryStats.avg_working_hours || 0;

        return (
            <View style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                    <View style={styles.summaryHeaderLeft}>
                        <Icon name="chart-bar" size={18} color="#6366F1" />
                        <Text style={styles.summaryTitle}>Attendance Summary</Text>
                    </View>
                    <View style={[
                        styles.attendanceRateBadge,
                        { backgroundColor: attendanceRate >= 90 ? '#ECFDF5' : attendanceRate >= 75 ? '#FEF3C7' : '#FEE2E2' }
                    ]}>
                        <Text style={[
                            styles.attendanceRateText,
                            { color: attendanceRate >= 90 ? '#10B981' : attendanceRate >= 75 ? '#F59E0B' : '#EF4444' }
                        ]}>
                            {attendanceRate.toFixed(1)}%
                        </Text>
                    </View>
                </View>

                <View style={styles.primaryStatsGrid}>
                    {primaryStats.map((stat, index) => (
                        <View key={index} style={[styles.primaryStatItem, { backgroundColor: stat.bgColor }]}>
                            <Icon name={stat.icon} size={18} color={stat.color} />
                            <Text style={styles.primaryStatValue}>{stat.value}</Text>
                            <Text style={styles.primaryStatLabel}>{stat.label}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.secondaryStatsRow}>
                    {secondaryStats.map((stat, index) => (
                        <View key={index} style={styles.secondaryStatItem}>
                            <Icon name={stat.icon} size={12} color={stat.color} />
                            <Text style={[styles.secondaryStatText, { color: stat.color }]}>
                                {stat.label}: {stat.value}
                            </Text>
                        </View>
                    ))}
                </View>

                <View style={styles.hoursContainer}>
                    <View style={styles.hoursItem}>
                        <Icon name="clock" size={14} color="#6366F1" />
                        <Text style={styles.hoursLabel}>Total Hours</Text>
                        <Text style={styles.hoursValue}>{totalHours}h</Text>
                    </View>
                    <View style={styles.hoursDivider} />
                    <View style={styles.hoursItem}>
                        <Icon name="chart-line" size={14} color="#10B981" />
                        <Text style={styles.hoursLabel}>Avg/Day</Text>
                        <Text style={styles.hoursValue}>{avgHours}h</Text>
                    </View>
                </View>
            </View>
        );
    };

    const renderExportModal = () => {
        return (
            <Modal
                visible={showExportModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowExportModal(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeaderFixed}>
                            <Text style={styles.modalTitleFixed}>Export Options</Text>
                            <TouchableOpacity
                                style={styles.closeButtonFixed}
                                onPress={() => setShowExportModal(false)}
                            >
                                <Text style={styles.closeButtonText}>×</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalScrollView}>
                            <View style={styles.sectionFixed}>
                                <Text style={styles.sectionHeaderFixed}>Export Range</Text>
                                <View style={styles.dateRangeDisplay}>
                                    <Text style={styles.dateRangeText}>
                                        {formatDate(dateRange.startDate)} - {formatDate(dateRange.endDate)}
                                    </Text>
                                    <Text style={styles.dateRangeDays}>
                                        {calculateDateRangeDays()} days
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.sectionFixed}>
                                <Text style={styles.sectionHeaderFixed}>Include</Text>
                                <View style={styles.optionItem}>
                                    <Text style={styles.optionLabel}>Working Hours</Text>
                                    <Switch
                                        value={exportOptions.includeWorkingHours}
                                        onValueChange={(value) =>
                                            setExportOptions(prev => ({ ...prev, includeWorkingHours: value }))
                                        }
                                    />
                                </View>
                                <View style={styles.optionItem}>
                                    <Text style={styles.optionLabel}>Late Arrivals</Text>
                                    <Switch
                                        value={exportOptions.includeLateArrivals}
                                        onValueChange={(value) =>
                                            setExportOptions(prev => ({ ...prev, includeLateArrivals: value }))
                                        }
                                    />
                                </View>
                            </View>

                            <View style={styles.sectionFixed}>
                                <Text style={styles.sectionHeaderFixed}>Export Individual</Text>

                                <TouchableOpacity
                                    style={[styles.exportButtonFixed, styles.pdfButton]}
                                    onPress={() => handleExportWithOptions('pdf')}
                                    disabled={!selectedEmployee}
                                >
                                    <View style={styles.buttonContent}>
                                        <Icon name="file-pdf" size={24} color="#DC2626" />
                                        <View style={styles.buttonTextContainer}>
                                            <Text style={styles.buttonTitle}>Export as PDF</Text>
                                            <Text style={styles.buttonSubtitle}>
                                                {selectedEmployee ? 'Ready to export' : 'Select an employee first'}
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.exportButtonFixed, styles.excelButton]}
                                    onPress={() => handleExportWithOptions('excel')}
                                    disabled={!selectedEmployee}
                                >
                                    <View style={styles.buttonContent}>
                                        <Icon name="file-excel" size={24} color="#16A34A" />
                                        <View style={styles.buttonTextContainer}>
                                            <Text style={styles.buttonTitle}>Export as Excel</Text>
                                            <Text style={styles.buttonSubtitle}>
                                                {selectedEmployee ? 'Ready to export' : 'Select an employee first'}
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.sectionFixed}>
                                <Text style={styles.sectionHeaderFixed}>Export All Employees</Text>

                                <TouchableOpacity
                                    style={[styles.exportButtonFixed, styles.allPdfButton]}
                                    onPress={() => handleExportAll('pdf')}
                                >
                                    <View style={styles.buttonContent}>
                                        <Icon name="file-pdf" size={24} color="#D97706" />
                                        <View style={styles.buttonTextContainer}>
                                            <Text style={styles.buttonTitle}>Export All as PDF</Text>
                                            <Text style={styles.buttonSubtitle}>
                                                Comprehensive report for all employees
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.exportButtonFixed, styles.allExcelButton]}
                                    onPress={() => handleExportAll('excel')}
                                >
                                    <View style={styles.buttonContent}>
                                        <Icon name="file-excel" size={24} color="#DC2626" />
                                        <View style={styles.buttonTextContainer}>
                                            <Text style={styles.buttonTitle}>Export All as Excel</Text>
                                            <Text style={styles.buttonSubtitle}>
                                                Comprehensive report for all employees
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.warningsSection}>
                                <Text style={styles.warningTitle}>⚠️ Note</Text>
                                <Text style={styles.warningText}>
                                    Files will be saved to your Downloads folder. Large exports may take some time to generate.
                                </Text>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        );
    };

    // ===========================================
    // MAIN RENDER
    // ===========================================
    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            <ScrollView
                contentContainerStyle={styles.flatListContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                    />
                }
            >
                {/* Employee Selection */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Select Employee</Text>
                    {loading ? (
                        <ActivityIndicator size="small" color="#6366F1" />
                    ) : (
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={selectedEmployee}
                                onValueChange={setSelectedEmployee}
                                style={styles.picker}
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

                {/* Date Range Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Date Range</Text>
                        {(dateRange.startDate || dateRange.endDate) && (
                            <TouchableOpacity onPress={clearDateRange}>
                                <Text style={styles.clearButton}>Clear</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {renderDatePresets()}

                    <View style={styles.dateRow}>
                        <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() => setShowStartPicker(true)}
                        >
                            <Icon name="calendar" size={14} color="#6366F1" />
                            <Text style={styles.dateButtonText}>
                                {formatDate(dateRange.startDate)}
                            </Text>
                        </TouchableOpacity>

                        <Icon name="arrow-right" size={14} color="#9CA3AF" />

                        <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() => setShowEndPicker(true)}
                        >
                            <Icon name="calendar" size={14} color="#6366F1" />
                            <Text style={styles.dateButtonText}>
                                {formatDate(dateRange.endDate)}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Summary Stats */}
                {selectedEmployee && renderSummaryCard()}

                {/* Export Section */}
                {selectedEmployee && (dateRange.startDate && dateRange.endDate) && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Export Reports</Text>
                        <View style={styles.actionButtons}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#DC2626' }]}
                                onPress={() => handleQuickExport('pdf')}
                                disabled={exportLoading}
                            >
                                <Icon name="file-pdf" size={16} color="white" />
                                <Text style={styles.actionButtonText}>Quick PDF</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#16A34A' }]}
                                onPress={() => handleQuickExport('excel')}
                                disabled={exportLoading}
                            >
                                <Icon name="file-excel" size={16} color="white" />
                                <Text style={styles.actionButtonText}>Quick Excel</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#6366F1', marginTop: 12 }]}
                            onPress={() => setShowExportModal(true)}
                            disabled={exportLoading}
                        >
                            <Icon name="cog" size={16} color="white" />
                            <Text style={styles.actionButtonText}>Advanced Export</Text>
                        </TouchableOpacity>

                        {exportLoading && (
                            <View style={styles.exportingContainer}>
                                <ActivityIndicator size="small" color="#6366F1" />
                                <Text style={styles.exportingText}>Generating export...</Text>
                            </View>
                        )}

                        <Text style={styles.exportNote}>
                            Files will be saved to Downloads folder
                        </Text>
                    </View>
                )}

                {/* Attendance List Header */}
                {selectedEmployee && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>
                            Attendance Records
                            {attendance.length > 0 && ` (${attendance.length})`}
                        </Text>
                    </View>
                )}

                {/* Attendance Records or Empty State */}
                {loadingAttendance ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#6366F1" />
                        <Text style={styles.loadingText}>Loading attendance...</Text>
                    </View>
                ) : !selectedEmployee ? (
                    <View style={styles.emptyState}>
                        <Icon name="user-friends" size={48} color="#9CA3AF" />
                        <Text style={styles.emptyStateTitle}>Select an Employee</Text>
                        <Text style={styles.emptyStateText}>
                            Choose an employee from the dropdown above to view their attendance records
                        </Text>
                    </View>
                ) : selectedEmployee && attendance.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Icon name="calendar-times" size={48} color="#9CA3AF" />
                        <Text style={styles.emptyStateTitle}>No Records Found</Text>
                        <Text style={styles.emptyStateText}>
                            No attendance records found for selected period
                        </Text>
                    </View>
                ) : (
                    attendance.map((item, index) => (
                        <AttendanceList 
                            key={item.name || item.employee || index.toString()} 
                            attendance={[item]} 
                        />
                    ))
                )}
            </ScrollView>

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
                    value={dateRange.endDate || new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onEndDateChange}
                    minimumDate={dateRange.startDate || undefined}
                    maximumDate={new Date()}
                />
            )}

            {/* Export Modal */}
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
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#EF4444',
        marginTop: 16,
        marginBottom: 8,
    },
    errorText: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
    },
    flatListContent: {
        paddingBottom: 20,
    },
    headerSection: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        padding: 8,
        marginRight: 12,
    },
    headerTitleContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    section: {
        padding: 16,
        backgroundColor: '#FFFFFF',
        marginVertical: 8,
        borderRadius: 12,
        marginHorizontal: 16,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 12,
    },
    clearButton: {
        fontSize: 14,
        color: '#6366F1',
        fontWeight: '500',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 14,
        color: '#111827',
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        backgroundColor: '#F9FAFB',
        overflow: 'hidden',
    },
    picker: {
        height: 50,
    },
    presetContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    presetButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#EEF2FF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        gap: 6,
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
    dateButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 8,
    },
    dateButtonText: {
        fontSize: 12,
        color: '#374151',
        fontWeight: '500',
    },
    summaryCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 16,
        marginVertical: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    summaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    summaryHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    attendanceRateBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    attendanceRateText: {
        fontSize: 14,
        fontWeight: '700',
    },
    primaryStatsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    primaryStatItem: {
        flex: 1,
        minWidth: '22%',
        alignItems: 'center',
        padding: 10,
        borderRadius: 8,
        gap: 4,
    },
    primaryStatValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    primaryStatLabel: {
        fontSize: 10,
        color: '#6B7280',
        fontWeight: '500',
    },
    secondaryStatsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 8,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#E5E7EB',
        marginBottom: 12,
    },
    secondaryStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    secondaryStatText: {
        fontSize: 12,
        fontWeight: '500',
    },
    hoursContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
        padding: 12,
    },
    hoursItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    hoursDivider: {
        width: 1,
        height: 20,
        backgroundColor: '#D1D5DB',
        marginHorizontal: 8,
    },
    hoursLabel: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
    },
    hoursValue: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        elevation: 1,
        gap: 8,
    },
    actionButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    },
    exportNote: {
        textAlign: 'center',
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 8,
        fontStyle: 'italic',
    },
    exportingContainer: {
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
        fontSize: 14,
        color: '#6366F1',
        fontWeight: '500',
    },
    loadingContainer: {
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#6B7280',
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
        marginTop: 40,
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#374151',
        marginTop: 16,
        marginBottom: 8,
    },
    emptyStateText: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContainer: {
        backgroundColor: 'white',
        borderRadius: 16,
        width: '100%',
        maxHeight: '90%',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    modalHeaderFixed: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    modalTitleFixed: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    closeButtonFixed: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeButtonText: {
        fontSize: 18,
        color: '#6B7280',
        fontWeight: '600',
    },
    modalScrollView: {
        maxHeight: 500,
    },
    sectionFixed: {
        padding: 20,
        paddingTop: 10,
    },
    sectionHeaderFixed: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 12,
    },
    dateRangeDisplay: {
        padding: 12,
        backgroundColor: '#F0F9FF',
        borderRadius: 8,
    },
    dateRangeText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0369A1',
    },
    dateRangeDays: {
        fontSize: 12,
        color: '#0284C7',
        marginTop: 4,
    },
    optionItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    optionLabel: {
        fontSize: 14,
        color: '#374151',
        flex: 1,
    },
    exportButtonFixed: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    pdfButton: {
        backgroundColor: '#FEF2F2',
    },
    excelButton: {
        backgroundColor: '#F0FDF4',
    },
    allPdfButton: {
        backgroundColor: '#FEF3C7',
    },
    allExcelButton: {
        backgroundColor: '#FEF2F2',
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    buttonTextContainer: {
        marginLeft: 12,
        flex: 1,
    },
    buttonTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 4,
    },
    buttonSubtitle: {
        fontSize: 13,
        color: '#6B7280',
    },
    warningsSection: {
        margin: 20,
        padding: 16,
        backgroundColor: '#FEF3C7',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#F59E0B',
        marginTop: 0,
    },
    warningTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#D97706',
        marginBottom: 8,
    },
    warningText: {
        fontSize: 12,
        color: '#D97706',
        lineHeight: 18,
    },
});

export default AllAttendanceAnalyticsScreen;