import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    StatusBar,
    Alert,
    Modal,
    ScrollView,
    Platform,
    BackHandler,
    RefreshControl,
    PermissionsAndroid,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import RNFS from 'react-native-fs';
import ReactNativeBlobUtil from 'react-native-blob-util';
import ApiService from '../../services/api.service';
import { formatLocalDate } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import AttendanceList, { STATUS_COLORS } from '../../components/admin/AttendanceList';
import { colors } from '../../theme/colors';

// Attendance and salary are worked out on the server exactly like payroll
// (hrms.api.attendance_report): only submitted attendance counts, Leave Without Pay
// is absent, and today is never counted as absent. Salary is returned only when the
// range is one full calendar month.

const PRESETS = [
    { label: 'This Month', type: 'month' },
    { label: 'Last Month', type: 'lastMonth' },
    { label: '7 Days', type: 'week' },
    { label: 'Yesterday', type: 'yesterday' },
    { label: 'Today', type: 'today' },
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const presetRange = (type) => {
    const today = startOfDay(new Date());
    const day = 24 * 60 * 60 * 1000;
    switch (type) {
        case 'today':
            return { startDate: today, endDate: today };
        case 'yesterday': {
            const y = new Date(today.getTime() - day);
            return { startDate: y, endDate: y };
        }
        case 'week':
            return { startDate: new Date(today.getTime() - 6 * day), endDate: today };
        case 'lastMonth':
            return {
                startDate: new Date(today.getFullYear(), today.getMonth() - 1, 1),
                endDate: new Date(today.getFullYear(), today.getMonth(), 0),
            };
        case 'month':
        default:
            return {
                startDate: new Date(today.getFullYear(), today.getMonth(), 1),
                endDate: new Date(today.getFullYear(), today.getMonth() + 1, 0),
            };
    }
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDisplayDate = (date) =>
    date ? `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}` : 'Select';

// Indian grouping: 1,50,000
const inr = (value) => {
    const n = Math.round(Number(value) || 0);
    const s = String(Math.abs(n));
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
    return `${n < 0 ? '-' : ''}₹${grouped}`;
};

const num = (value) => {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

function AllAttendanceAnalyticsScreen({ navigation, route }) {
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [exportDepartment, setExportDepartment] = useState('');
    const [dateRange, setDateRange] = useState(() => presetRange('month'));
    const [activePreset, setActivePreset] = useState('month');

    const [attendance, setAttendance] = useState([]);
    const [summaryStats, setSummaryStats] = useState(null);
    const [salary, setSalary] = useState(null);
    const [isFullMonth, setIsFullMonth] = useState(false);

    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [loadingAttendance, setLoadingAttendance] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(null); // e.g. 'employee-pdf'
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [showExport, setShowExport] = useState(false);

    const requestId = useRef(0);

    // ------------------------------------------------------------------ lifecycle
    useEffect(() => {
        loadEmployees();
        loadDepartments();
    }, []);

    // AdminDashboard's "My Attendance" shortcut opens this screen with { preselectEmployee }
    useEffect(() => {
        const target = route?.params?.preselectEmployee;
        if (target && employees.some((e) => e.name === target)) {
            setSelectedEmployee(target);
        }
    }, [route?.params?.preselectEmployee, employees]);

    const handleGoBack = useCallback(() => {
        if (navigation?.canGoBack()) {
            navigation.goBack();
        } else {
            navigation.navigate('AdminDashboard');
        }
    }, [navigation]);

    useFocusEffect(
        useCallback(() => {
            const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
                handleGoBack();
                return true;
            });
            return () => subscription.remove();
        }, [handleGoBack])
    );

    // ------------------------------------------------------------------ data
    const loadEmployees = async () => {
        setLoadingEmployees(true);
        try {
            const response = await ApiService.getAllEmployees();
            if (response.success && response.data?.message) {
                const raw = response.data.message;
                const list = (Array.isArray(raw) ? raw : raw.employees || []).filter((e) => e.status === 'Active');
                // ascending by the number at the end of the Employee ID (HR-EMP-00001, ...)
                const idNum = (s) => {
                    const m = String(s || '').match(/(\d+)\s*$/);
                    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
                };
                list.sort((a, b) => idNum(a.name) - idNum(b.name) || String(a.name).localeCompare(String(b.name)));
                setEmployees(list);
                if (list.length === 0) {
                    showToast({ type: 'warning', text1: 'No Active Employees', text2: 'No active employees found' });
                }
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Error', text2: 'Failed to load employees' });
        } finally {
            setLoadingEmployees(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await ApiService.getDepartments();
            if (response.success && Array.isArray(response.data?.message)) {
                setDepartments(response.data.message.filter((d) => !d.is_group));
            }
        } catch (error) {
            // the department filter is optional; exports still work without it
        }
    };

    const loadAttendance = useCallback(async () => {
        const id = ++requestId.current; // ignore answers to older requests
        if (!selectedEmployee || !dateRange.startDate || !dateRange.endDate) {
            setAttendance([]);
            setSummaryStats(null);
            setSalary(null);
            return;
        }
        setLoadingAttendance(true);
        try {
            const response = await ApiService.getEmployeeAttendanceHistory({
                employee_id: selectedEmployee,
                start_date: formatLocalDate(dateRange.startDate),
                end_date: formatLocalDate(dateRange.endDate),
            });
            if (id !== requestId.current) {return;}
            const data = response.data?.message;
            if (response.success && data?.status === 'success') {
                setAttendance(data.attendance_records || []);
                setSummaryStats(data.summary_stats || null);
                setSalary(data.salary || null);
                setIsFullMonth(Boolean(data.is_full_month));
            } else {
                throw new Error(data?.message || response.message || 'Failed to load attendance');
            }
        } catch (error) {
            if (id !== requestId.current) {return;}
            setAttendance([]);
            setSummaryStats(null);
            setSalary(null);
            showToast({ type: 'error', text1: 'Error', text2: error.message || 'Failed to load attendance records' });
        } finally {
            if (id === requestId.current) {
                setLoadingAttendance(false);
            }
        }
    }, [selectedEmployee, dateRange]);

    useEffect(() => {
        loadAttendance();
    }, [loadAttendance]);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([loadEmployees(), loadAttendance()]);
        setRefreshing(false);
    };

    // ------------------------------------------------------------------ dates
    const applyPreset = (type) => {
        setActivePreset(type);
        setDateRange(presetRange(type));
    };

    const onStartDateChange = (event, date) => {
        setShowStartPicker(false);
        if (event?.type === 'dismissed' || !date) {return;}
        const startDate = startOfDay(date);
        setActivePreset(null);
        setDateRange((prev) => ({
            startDate,
            endDate: prev.endDate && prev.endDate < startDate ? startDate : prev.endDate,
        }));
    };

    const onEndDateChange = (event, date) => {
        setShowEndPicker(false);
        if (event?.type === 'dismissed' || !date) {return;}
        setActivePreset(null);
        setDateRange((prev) => ({ ...prev, endDate: startOfDay(date) }));
    };

    const rangeIncludesToday = () => {
        const today = startOfDay(new Date());
        return dateRange.startDate <= today && dateRange.endDate >= today;
    };

    // ------------------------------------------------------------------ exports
    const downloadFile = async (base64Data, fileName, mimeType) => {
        const base64Content = base64Data.replace(/^data:.*?;base64,/, '');

        const writeToFallback = async () => {
            const baseDir = Platform.OS === 'ios'
                ? RNFS.DocumentDirectoryPath
                : (RNFS.ExternalDirectoryPath || RNFS.DocumentDirectoryPath);
            const exportDir = `${baseDir}/exports`;
            if (!(await RNFS.exists(exportDir))) {
                await RNFS.mkdir(exportDir);
            }
            const filePath = `${exportDir}/${fileName}`;
            await RNFS.writeFile(filePath, base64Content, 'base64');
            return filePath;
        };

        try {
            // iOS doesn't have a public Downloads folder — save in app docs.
            if (Platform.OS === 'ios') {
                const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
                await RNFS.writeFile(filePath, base64Content, 'base64');
                Alert.alert('Export Successful', `Saved: ${fileName}\nUse the Share sheet to send it elsewhere.`);
                showToast({ type: 'success', text1: 'Export Complete', text2: fileName });
                return filePath;
            }

            // Android 10+ (API 29+): use MediaStore via react-native-blob-util.
            if (Platform.Version >= 29) {
                // MediaStore requires a valid mimeType — derive one from the
                // file extension if the API didn't return a usable content_type.
                const lower = (fileName || '').toLowerCase();
                const resolvedMime = mimeType
                    || (lower.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        : lower.endsWith('.xls') ? 'application/vnd.ms-excel'
                        : lower.endsWith('.pdf') ? 'application/pdf'
                        : lower.endsWith('.csv') ? 'text/csv'
                        : 'application/octet-stream');

                // Write to a temp file in app cache first, then hand it to MediaStore.
                const tempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
                await ReactNativeBlobUtil.fs.writeFile(tempPath, base64Content, 'base64');
                try {
                    await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
                        {
                            name: fileName,
                            parentFolder: '',
                            mimeType: resolvedMime,
                        },
                        'Download',
                        tempPath,
                    );
                } finally {
                    // Clean up the temp copy regardless of outcome.
                    ReactNativeBlobUtil.fs.unlink(tempPath).catch(() => {});
                }

                Alert.alert(
                    'Export Successful',
                    `Saved to Downloads:\n${fileName}\n\nOpen any file manager (or the Files / Downloads app) to find it.`,
                    [{ text: 'OK' }]
                );
                showToast({ type: 'success', text1: 'Saved to Downloads', text2: fileName });
                return `Download/${fileName}`;
            }

            // Android 9 and below (API < 29): legacy storage. Request permission
            // and write straight to the public Downloads folder.
            try {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                    {
                        title: 'Save to Downloads',
                        message: 'HRMS needs permission to save your exported file to your Downloads folder.',
                        buttonPositive: 'Allow',
                        buttonNegative: 'Cancel',
                    }
                );
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    const fp = await writeToFallback();
                    Alert.alert(
                        'Saved to App Storage',
                        `Storage permission was denied, so we saved the file to the app's private folder instead:\n\n${fileName}`,
                    );
                    showToast({ type: 'warning', text1: 'Saved to app storage', text2: fileName });
                    return fp;
                }
            } catch (_) {
                // PermissionsAndroid throws on misconfigured environments —
                // continue and let the write attempt either succeed or fail
                // through to the catch block.
            }

            const downloadsDir = RNFS.DownloadDirectoryPath;
            const filePath = `${downloadsDir}/${fileName}`;
            await RNFS.writeFile(filePath, base64Content, 'base64');

            Alert.alert(
                'Export Successful',
                `Saved to Downloads:\n${fileName}\n\nOpen any file manager (or the Files / Downloads app) to find it.`,
                [{ text: 'OK' }]
            );
            showToast({ type: 'success', text1: 'Saved to Downloads', text2: fileName });
            return filePath;
        } catch (error) {
            console.error('Download error (Downloads folder):', error?.message || error);
            // Last-ditch fallback: write to app's private dir so user still gets the file.
            try {
                const filePath = await writeToFallback();
                Alert.alert(
                    'Saved to App Storage',
                    `Could not save to the public Downloads folder. Saved to the app's private folder instead:\n${fileName}`,
                );
                showToast({ type: 'warning', text1: 'Saved to app storage', text2: fileName });
                return filePath;
            } catch (fallbackErr) {
                console.error('Download fallback also failed:', fallbackErr?.message || fallbackErr);
                throw error;
            }
        }
    };

    const runExport = async (scope, format) => {
        if (!dateRange.startDate || !dateRange.endDate) {
            showToast({ type: 'warning', text1: 'Select Dates', text2: 'Please select a date range first' });
            return;
        }
        if (scope === 'employee' && !selectedEmployee) {
            showToast({ type: 'warning', text1: 'Select Employee', text2: 'Please select an employee first' });
            return;
        }
        setExporting(`${scope}-${format}`);
        try {
            const params = {
                start_date: formatLocalDate(dateRange.startDate),
                end_date: formatLocalDate(dateRange.endDate),
                export_format: format,
            };
            if (scope === 'employee') {
                params.employee_id = selectedEmployee;
            } else if (exportDepartment) {
                params.department = exportDepartment;
            }
            const response = await ApiService.exportAttendanceReport(params);
            const result = response.data?.message;
            if (!response.success || result?.status !== 'success' || !result.content) {
                throw new Error(result?.message || response.message || 'Export failed');
            }
            setShowExport(false);
            await downloadFile(result.content, result.file_name, result.content_type);
        } catch (error) {
            showToast({ type: 'error', text1: 'Export Failed', text2: error.message || 'Could not create the file' });
        } finally {
            setExporting(null);
        }
    };

    // ------------------------------------------------------------------ render pieces
    // Layout and styling follow the other admin screens (Today's Attendance in particular):
    // white full-width filter bars, compact icon stat cards, an attendance-rate bar, then
    // white shadowed cards on the light page background.
    const renderFilters = () => (
        <View style={styles.filterBar}>
            <View style={styles.pickerContainer}>
                {loadingEmployees && employees.length === 0 ? (
                    <ActivityIndicator size="small" color={colors.primary} style={styles.pickerLoader} />
                ) : (
                    <Picker selectedValue={selectedEmployee} onValueChange={setSelectedEmployee} style={styles.picker}>
                        <Picker.Item label="Select an employee" value="" />
                        {employees.map((emp) => (
                            <Picker.Item
                                key={emp.name}
                                label={`${emp.employee_name || emp.name} (${emp.name})`}
                                value={emp.name}
                            />
                        ))}
                    </Picker>
                )}
            </View>

            {/* period: one row of tabs, like the tabs on Today's Attendance */}
            <View style={styles.tabRow}>
                {PRESETS.map((p) => {
                    const active = activePreset === p.type;
                    return (
                        <TouchableOpacity
                            key={p.type}
                            style={[styles.tab, { flexGrow: p.label.length + 4 }, active && styles.tabActive]}
                            onPress={() => applyPreset(p.type)}
                            activeOpacity={0.8}
                        >
                            <Text
                                style={[styles.tabText, active && styles.tabTextActive]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.75}
                            >
                                {p.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={styles.dateRow}>
                <TouchableOpacity style={styles.dateButton} onPress={() => setShowStartPicker(true)} activeOpacity={0.8}>
                    <Icon name="calendar-alt" size={13} color={colors.primary} />
                    <Text style={styles.dateText}>{formatDisplayDate(dateRange.startDate)}</Text>
                </TouchableOpacity>
                <Icon name="arrow-right" size={12} color={colors.textMuted} />
                <TouchableOpacity style={styles.dateButton} onPress={() => setShowEndPicker(true)} activeOpacity={0.8}>
                    <Icon name="calendar-alt" size={13} color={colors.primary} />
                    <Text style={styles.dateText}>{formatDisplayDate(dateRange.endDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.exportButton} onPress={() => setShowExport(true)} activeOpacity={0.8}>
                    <Icon name="file-download" size={13} color={colors.primary} />
                    <Text style={styles.exportButtonText}>Export</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderStats = () => {
        if (!summaryStats) {
            return null;
        }
        const s = summaryStats;
        const stats = [
            { label: 'Present', value: s.present_days, icon: 'check-circle', color: STATUS_COLORS.present },
            { label: 'WFH', value: s.wfh_days, icon: 'home', color: STATUS_COLORS.wfh },
            { label: 'On Site', value: s.onsite_days, icon: 'building', color: STATUS_COLORS.onsite },
            { label: 'Absent', value: s.absent_days, icon: 'times-circle', color: STATUS_COLORS.absent },
            { label: 'Leave', value: s.leave_days ?? s.on_leave, icon: 'calendar-times', color: STATUS_COLORS.leave },
            { label: 'Holidays', value: s.holiday_days ?? s.holidays, icon: 'calendar-day', color: STATUS_COLORS.holiday },
            { label: 'Late', value: s.late_arrivals, icon: 'clock', color: STATUS_COLORS.late },
            { label: 'Hours', value: s.total_working_hours, icon: 'hourglass-half', color: colors.primary },
        ];
        const pct = s.attendance_percentage;
        const rateColor = pct == null ? colors.textMuted
            : pct >= 80 ? STATUS_COLORS.present : pct >= 60 ? STATUS_COLORS.late : STATUS_COLORS.absent;
        return (
            <>
                <View style={styles.summaryContainer}>
                    {stats.map((st) => (
                        <View key={st.label} style={styles.statCard}>
                            <Icon name={st.icon} size={16} color={st.color} />
                            <View style={styles.statContent}>
                                <Text style={[styles.statNumber, { color: st.color }]}>{num(st.value)}</Text>
                                <Text style={styles.statLabel}>{st.label}</Text>
                            </View>
                        </View>
                    ))}
                </View>

                <View style={styles.rateContainer}>
                    <View style={styles.rateHeader}>
                        <Text style={styles.rateLabel}>Attendance Rate</Text>
                        <Text style={[styles.ratePercentage, { color: rateColor }]}>
                            {pct == null ? '-' : `${num(pct)}%`}
                        </Text>
                    </View>
                    <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBarFill, { width: `${Math.min(pct || 0, 100)}%`, backgroundColor: rateColor }]} />
                    </View>
                    <Text style={styles.rateSubtext}>
                        {s.attended_days_so_far ?? 0} of {s.working_days_so_far ?? 0} working days attended
                        {rangeIncludesToday() ? ' \u00B7 today not counted yet' : ''}
                    </Text>
                </View>
            </>
        );
    };

    const renderSalary = () => {
        if (!summaryStats) {
            return null;
        }
        if (!isFullMonth) {
            return (
                <View style={styles.infoCard}>
                    <Icon name="info-circle" size={13} color={colors.info} />
                    <Text style={styles.infoText}>Salary is shown for a full month. Choose This Month or Last Month.</Text>
                </View>
            );
        }
        if (!salary) {
            return null;
        }
        const hasRows = (salary.earnings || []).length > 0;
        const isSlip = salary.source === 'slip';
        return (
            <View style={[styles.card, styles.cardAccent]}>
                <View style={styles.cardHeader}>
                    <View style={styles.cardTitleRow}>
                        <Icon name="wallet" size={14} color={colors.primary} />
                        <Text style={styles.cardTitle}>Salary</Text>
                    </View>
                    {hasRows ? (
                        <View style={[styles.statusBadge, isSlip ? styles.badgeSlip : styles.badgeEstimate]}>
                            <Text style={styles.statusText}>{isSlip ? 'Payslip' : 'Estimate'}</Text>
                        </View>
                    ) : null}
                </View>
                {hasRows ? (
                    <>
                        <Text style={styles.groupTitle}>Earnings</Text>
                        {salary.earnings.map((r) => (
                            <View key={`e-${r.component}`} style={styles.moneyRow}>
                                <Text style={styles.moneyLabel}>{r.component}</Text>
                                <Text style={styles.moneyValue}>{inr(r.amount)}</Text>
                            </View>
                        ))}
                        <View style={[styles.moneyRow, styles.moneyTotalRow]}>
                            <Text style={styles.moneyTotalLabel}>Gross pay</Text>
                            <Text style={styles.moneyTotalLabel}>{inr(salary.gross_pay)}</Text>
                        </View>
                        <Text style={styles.groupTitle}>Deductions</Text>
                        {salary.deductions.length ? (
                            salary.deductions.map((r) => (
                                <View key={`d-${r.component}`} style={styles.moneyRow}>
                                    <Text style={styles.moneyLabel}>{r.component}</Text>
                                    <Text style={[styles.moneyValue, styles.moneyNegative]}>-{inr(r.amount)}</Text>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.smallText}>No deductions</Text>
                        )}
                        <View style={styles.netRow}>
                            <Text style={styles.netLabel}>Net Pay</Text>
                            <Text style={styles.netValue}>{inr(salary.net_pay)}</Text>
                        </View>
                        <Text style={styles.smallText}>
                            {salary.source_label}
                            {!isSlip && !salary.month_complete ? '. Month in progress: absent and WFH days so far.' : ''}
                        </Text>
                    </>
                ) : (
                    <Text style={styles.smallText}>{salary.source_label}</Text>
                )}
            </View>
        );
    };

    const renderExportOption = (scope, format) => {
        const busy = exporting === `${scope}-${format}`;
        const isPdf = format === 'pdf';
        const blocked = scope === 'employee' && !selectedEmployee;
        return (
            <TouchableOpacity
                key={`${scope}-${format}`}
                style={[styles.option, (blocked || (exporting && !busy)) && styles.disabled]}
                onPress={() => runExport(scope, format)}
                disabled={Boolean(exporting) || blocked}
                activeOpacity={0.8}
            >
                <Icon name={isPdf ? 'file-pdf' : 'file-excel'} size={18} color={isPdf ? STATUS_COLORS.absent : STATUS_COLORS.present} />
                <View style={styles.optionTextBox}>
                    <Text style={styles.optionText}>{isPdf ? 'PDF report' : 'Excel sheet'}</Text>
                    <Text style={styles.optionSub}>
                        {scope === 'employee'
                            ? `Summary${isFullMonth ? ', salary' : ''} and daily records`
                            : `One row per employee${isFullMonth ? ' with salary' : ''}`}
                    </Text>
                </View>
                {busy ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                    <Icon name="download" size={13} color={colors.textMuted} />
                )}
            </TouchableOpacity>
        );
    };

    const renderExportModal = () => (
        <Modal
            visible={showExport}
            transparent
            animationType="fade"
            onRequestClose={() => !exporting && setShowExport(false)}
        >
            <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => !exporting && setShowExport(false)}
            >
                <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Export Reports</Text>
                    <Text style={styles.modalSubtitle}>
                        {formatDisplayDate(dateRange.startDate)} - {formatDisplayDate(dateRange.endDate)}
                    </Text>

                    <Text style={styles.modalSection}>
                        {selectedEmployee ? employees.find((e) => e.name === selectedEmployee)?.employee_name || selectedEmployee : 'This employee'}
                    </Text>
                    {selectedEmployee ? null : <Text style={styles.optionHint}>Select an employee first</Text>}
                    {renderExportOption('employee', 'pdf')}
                    {renderExportOption('employee', 'excel')}

                    <Text style={styles.modalSection}>All employees</Text>
                    {departments.length > 0 ? (
                        <View style={[styles.pickerContainer, styles.modalPicker]}>
                            <Picker selectedValue={exportDepartment} onValueChange={setExportDepartment} style={styles.picker}>
                                <Picker.Item label="All departments" value="" />
                                {departments.map((d) => (
                                    <Picker.Item key={d.name} label={d.department_name || d.name} value={d.name} />
                                ))}
                            </Picker>
                        </View>
                    ) : null}
                    {renderExportOption('all', 'pdf')}
                    {renderExportOption('all', 'excel')}

                    <Text style={styles.modalNote}>Files are saved to your phone's Downloads folder.</Text>
                    <TouchableOpacity
                        style={[styles.closeButton, exporting && styles.disabled]}
                        onPress={() => setShowExport(false)}
                        disabled={Boolean(exporting)}
                    >
                        <Text style={styles.closeButtonText}>Close</Text>
                    </TouchableOpacity>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );

    // ------------------------------------------------------------------ main
    const employeeName = employees.find((e) => e.name === selectedEmployee)?.employee_name;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollBottom}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            >
                {renderFilters()}

                {!selectedEmployee ? (
                    <View style={styles.scrollContent}>
                        <View style={styles.emptyContainer}>
                            <Icon name="user-friends" size={48} color={colors.textMuted} />
                            <Text style={styles.emptyTitle}>Select an Employee</Text>
                            <Text style={styles.emptyText}>Attendance, salary and daily records will appear here.</Text>
                        </View>
                    </View>
                ) : loadingAttendance && !summaryStats ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator color={colors.primary} size="large" />
                        <Text style={styles.loadingText}>Loading attendance data...</Text>
                    </View>
                ) : (
                    <>
                        {renderStats()}
                        <View style={styles.scrollContent}>
                            {renderSalary()}

                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>Daily Records</Text>
                                <Text style={styles.sectionCount} numberOfLines={1}>
                                    {employeeName ? `${employeeName} · ` : ''}{attendance.length} days
                                </Text>
                            </View>
                            {loadingAttendance ? <ActivityIndicator size="small" color={colors.primary} style={styles.inlineLoader} /> : null}
                            {attendance.length === 0 ? (
                                <View style={styles.emptyContainer}>
                                    <Icon name="inbox" size={48} color={colors.textMuted} />
                                    <Text style={styles.emptyTitle}>No Records</Text>
                                    <Text style={styles.emptyText}>Nothing to show for this period.</Text>
                                </View>
                            ) : (
                                <AttendanceList attendance={attendance} />
                            )}
                        </View>
                    </>
                )}
            </ScrollView>

            {renderExportModal()}
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
                    maximumDate={presetRange('month').endDate}
                />
            )}
        </View>
    );
}

const SHADOW = {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollBottom: { paddingBottom: 20 },
    scrollContent: { padding: 12 },

    // filter bar (white, full width)
    filterBar: {
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: 8,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: '#F9FAFB',
        overflow: 'hidden',
        justifyContent: 'center',
    },
    picker: { height: 50, color: colors.textPrimary },
    pickerLoader: { paddingVertical: 15 },
    tabRow: { flexDirection: 'row', gap: 6 },
    tab: {
        flexBasis: 0,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
        backgroundColor: colors.background,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tabActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        elevation: 1,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
    },
    tabText: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
    tabTextActive: { color: colors.white },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dateButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        backgroundColor: colors.background,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    dateText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

    // stat cards (same as Today's Attendance)
    summaryContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: colors.surface,
    },
    statCard: {
        width: '23.8%',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
        padding: 8,
        borderRadius: 8,
        gap: 6,
    },
    statContent: { flex: 1 },
    statNumber: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    statLabel: { fontSize: 9, color: colors.textSecondary, marginTop: 1, fontWeight: '500' },

    // attendance rate bar (same as Today's Attendance)
    rateContainer: {
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    rateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    rateLabel: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
    ratePercentage: { fontSize: 16, fontWeight: '700', color: colors.primary },
    progressBarContainer: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
    progressBarFill: { height: '100%', borderRadius: 3 },
    rateSubtext: { fontSize: 10, color: colors.textSecondary, textAlign: 'center' },

    // cards
    card: {
        backgroundColor: colors.surface,
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...SHADOW,
    },
    cardAccent: { borderLeftWidth: 3, borderLeftColor: colors.primary },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    statusText: { fontSize: 10, color: colors.white, fontWeight: '600' },
    badgeSlip: { backgroundColor: STATUS_COLORS.present },
    badgeEstimate: { backgroundColor: STATUS_COLORS.late },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#F0F9FF',
        padding: 10,
        borderRadius: 8,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    infoText: { flex: 1, fontSize: 11, fontWeight: '600', color: '#1E40AF' },

    groupTitle: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginTop: 6, marginBottom: 2 },
    moneyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    moneyLabel: { fontSize: 13, color: '#374151', flex: 1, paddingRight: 8 },
    moneyValue: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    moneyNegative: { color: STATUS_COLORS.absent },
    moneyTotalRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 2 },
    moneyTotalLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
    netRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.primaryLight,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: 10,
    },
    netLabel: { fontSize: 13, fontWeight: '700', color: colors.primary },
    netValue: { fontSize: 17, fontWeight: '800', color: colors.primary },
    smallText: { fontSize: 11, color: colors.textSecondary, marginTop: 8 },

    exportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: colors.background,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    exportButtonText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
    disabled: { opacity: 0.5 },

    // export pop-up (same look as the filter pop-ups on the approval screens)
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
    modalContent: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
        width: '100%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    modalSubtitle: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 2, marginBottom: 8 },
    modalSection: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 8, marginBottom: 6 },
    modalPicker: { marginBottom: 6 },
    modalNote: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        marginBottom: 6,
        backgroundColor: colors.background,
        gap: 12,
    },
    optionTextBox: { flex: 1 },
    optionText: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
    optionSub: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    optionHint: { fontSize: 11, color: STATUS_COLORS.late, marginBottom: 6 },
    closeButton: {
        marginTop: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    closeButtonText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 8 },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    sectionCount: { fontSize: 11, color: colors.textSecondary, flexShrink: 1, marginLeft: 8, textAlign: 'right' },
    inlineLoader: { marginBottom: 8 },

    loadingContainer: { justifyContent: 'center', alignItems: 'center', paddingVertical: 30 },
    loadingText: { marginTop: 10, fontSize: 14, color: colors.textSecondary },
    emptyContainer: { justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.textSecondary, marginTop: 12 },
    emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 6, paddingHorizontal: 32 },
});

export default AllAttendanceAnalyticsScreen;
