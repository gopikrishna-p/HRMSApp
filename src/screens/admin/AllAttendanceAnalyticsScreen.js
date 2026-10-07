// src/screens/admin/AllAttendanceAnalyticsScreen.js
//
// Attendance and salary are worked out on the server exactly like payroll
// (hrms.api.attendance_report): only submitted attendance counts, Leave Without Pay
// is absent, and today is never counted as absent. Salary is returned only when the
// range is one full calendar month.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ActivityIndicator,
    Alert,
    Platform,
    BackHandler,
    PermissionsAndroid,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import RNFS from 'react-native-fs';
import ReactNativeBlobUtil from 'react-native-blob-util';
import ApiService from '../../services/api.service';
import { formatLocalDate } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import { attendanceRow } from '../../components/admin/AttendanceList';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    SearchField,
    SelectField,
    StatStrip,
    ProgressBar,
    Sheet,
    Button,
    EmptyState,
    Loading,
    Notice,
    Icon,
    color,
    space,
    type,
} from '../../components/ds';

const PRESETS = [
    { label: 'This month', value: 'month' },
    { label: 'Last month', value: 'lastMonth' },
    { label: '7 days', value: 'week' },
    { label: 'Today', value: 'today' },
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const presetRange = (preset) => {
    const today = startOfDay(new Date());
    const day = 24 * 60 * 60 * 1000;
    switch (preset) {
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
// the two date fields share one row: the year is left out when it is this year, so they fit on narrow phones
const formatFieldDate = (date) =>
    date && date.getFullYear() === new Date().getFullYear()
        ? `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`
        : formatDisplayDate(date);

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
    const [attendanceError, setAttendanceError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(null); // e.g. 'employee-pdf'
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [showExport, setShowExport] = useState(false);

    const requestId = useRef(0);
    const exportingRef = useRef(false); // blocks a second tap before the re-render disables the rows

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
                    showToast({ type: 'warning', text1: 'No active employees', text2: 'No active employees found' });
                }
            } else {
                showToast({ type: 'error', text1: 'Could not load employees', text2: response.message || 'Please try again' });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Could not load employees', text2: error?.message || 'Please try again' });
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

    // a pull-to-refresh keeps the current numbers on screen; a new employee or period clears them first
    // (the screen shows Loading while there are no numbers), so the previous employee's figures are
    // never shown under the new name
    const loadAttendance = useCallback(async (isRefresh = false) => {
        const id = ++requestId.current; // ignore answers to older requests
        if (!isRefresh) {
            setAttendance([]);
            setSummaryStats(null);
            setSalary(null);
            setIsFullMonth(false);
        }
        setAttendanceError(null);
        if (!selectedEmployee || !dateRange.startDate || !dateRange.endDate) {
            return;
        }
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
                setSummaryStats(data.summary_stats || {});
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
            setIsFullMonth(false);
            setAttendanceError(error?.message || 'Failed to load attendance records');
        }
    }, [selectedEmployee, dateRange]);

    useEffect(() => {
        loadAttendance();
    }, [loadAttendance]);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([loadEmployees(), loadAttendance(true), departments.length ? null : loadDepartments()]);
        setRefreshing(false);
    };

    // ------------------------------------------------------------------ dates
    const applyPreset = (value) => {
        setActivePreset(value);
        setDateRange(presetRange(value));
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
                Alert.alert('Export successful', `Saved: ${fileName}\nUse the Share sheet to send it elsewhere.`);
                showToast({ type: 'success', text1: 'Export complete', text2: fileName });
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
                    'Export successful',
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
                        'Saved to app storage',
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
                'Export successful',
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
                    'Saved to app storage',
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
            showToast({ type: 'warning', text1: 'Select dates', text2: 'Please select a date range first' });
            return;
        }
        if (scope === 'employee' && !selectedEmployee) {
            showToast({ type: 'warning', text1: 'Select an employee', text2: 'Please select an employee first' });
            return;
        }
        if (exportingRef.current) {
            return;
        }
        exportingRef.current = true;
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
            showToast({ type: 'error', text1: 'Export failed', text2: error?.message || 'Could not create the file' });
        } finally {
            exportingRef.current = false;
            setExporting(null);
        }
    };

    // ------------------------------------------------------------------ pickers and header
    const [pickEmployee, setPickEmployee] = useState(false);
    const [employeeQuery, setEmployeeQuery] = useState('');
    const [showDepartments, setShowDepartments] = useState(false);

    useLayoutEffect(() => {
        navigation.setOptions({
            // eslint-disable-next-line react/no-unstable-nested-components -- React Navigation header render prop
            headerRight: () => (
                <Pressable onPress={() => setShowExport(true)} hitSlop={10} style={styles.headerAction}>
                    <Text style={styles.headerActionText}>Export</Text>
                </Pressable>
            ),
        });
    }, [navigation]);

    const employeeName = employees.find((e) => e.name === selectedEmployee)?.employee_name;
    const pickerList = useMemo(() => {
        const q = employeeQuery.trim().toLowerCase();
        return q ? employees.filter((e) => e.employee_name?.toLowerCase().includes(q) || e.name?.toLowerCase().includes(q)) : employees;
    }, [employees, employeeQuery]);
    const departmentName = departments.find((d) => d.name === exportDepartment)?.department_name || exportDepartment;
    const periodText = `${formatDisplayDate(dateRange.startDate)} \u2013 ${formatDisplayDate(dateRange.endDate)}`;

    // ------------------------------------------------------------------ sections
    const renderAttendance = () => {
        const s = summaryStats;
        const pct = s.attendance_percentage;
        return (
            <Group title="Attendance">
                <View style={styles.statsBlock}>
                    <StatStrip
                        style={styles.flatStrip}
                        items={[
                            { label: 'Working days', value: num(s.total_working_days) },
                            { label: 'Present', value: num(s.present_days) },
                            { label: 'WFH', value: num(s.wfh_days) },
                            { label: 'On site', value: num(s.onsite_days) },
                        ]}
                    />
                    <View style={styles.stripDivider} />
                    <StatStrip
                        style={styles.flatStrip}
                        items={[
                            { label: 'Leave', value: num(s.leave_days ?? s.on_leave) },
                            { label: 'Absent', value: num(s.absent_days), tone: s.absent_days ? 'danger' : undefined },
                            { label: 'Holidays', value: num(s.holiday_days ?? s.holidays) },
                            { label: 'Late', value: num(s.late_arrivals), tone: s.late_arrivals ? 'warning' : undefined },
                        ]}
                    />
                </View>
                <View style={styles.rate}>
                    <View style={styles.rateHeader}>
                        <Text style={styles.rateText}>
                            {`${s.attended_days_so_far ?? 0} of ${s.working_days_so_far ?? 0} working days attended${rangeIncludesToday() ? ', today not counted yet' : ''}`}
                        </Text>
                        <Text style={styles.rateValue}>{pct == null ? '\u2013' : `${num(pct)}%`}</Text>
                    </View>
                    <ProgressBar value={pct || 0} tone={pct == null ? 'neutral' : pct >= 90 ? 'success' : pct >= 75 ? 'warning' : 'danger'} />
                </View>
                <Row title="Hours worked" value={`${num(s.total_working_hours)} h`} subtitle={`${num(s.avg_working_hours)} h per day on average`} />
            </Group>
        );
    };

    const renderSalary = () => {
        if (!isFullMonth) {
            return (
                <Notice tone="neutral" icon="info">
                    Salary is shown for a full calendar month. Choose This month or Last month.
                </Notice>
            );
        }
        if (!salary) {
            return null;
        }
        const earnings = salary.earnings || [];
        const deductions = salary.deductions || [];
        if (!earnings.length) {
            return <Notice tone="neutral" icon="info" title="No salary data">{salary.source_label || null}</Notice>;
        }
        const isSlip = salary.source === 'slip';
        const footer = [salary.source_label, !isSlip && !salary.month_complete ? 'Month in progress: absent and WFH days so far.' : null]
            .filter(Boolean).join('. ') || undefined;
        return (
            <>
                <Group title={isSlip ? 'Earnings (from payslip)' : 'Earnings (estimate)'}>
                    {earnings.map((r, i) => <Row key={`e-${r.component}-${i}`} title={r.component} titleLines={2} value={inr(r.amount)} />)}
                    <Row title="Gross pay" value={inr(salary.gross_pay)} />
                </Group>
                <Group title="Deductions">
                    {deductions.length
                        ? deductions.map((r, i) => <Row key={`d-${r.component}-${i}`} title={r.component} titleLines={2} value={`\u2212${inr(r.amount)}`} />)
                        : <Row title="No deductions" />}
                    <Row title="Total deductions" value={`\u2212${inr(salary.total_deduction)}`} />
                </Group>
                <Group footer={footer}>
                    <Row title="Net pay" right={<Text style={styles.netPay} numberOfLines={1}>{inr(salary.net_pay)}</Text>} />
                </Group>
            </>
        );
    };

    const exportRow = (scope, format) => {
        const busy = exporting === `${scope}-${format}`;
        const blocked = scope === 'employee' && !selectedEmployee;
        return (
            <Row
                key={`${scope}-${format}`}
                icon={format === 'pdf' ? 'file-text' : 'grid'}
                title={format === 'pdf' ? 'PDF report' : 'Excel sheet'}
                subtitle={scope === 'employee'
                    ? (blocked ? 'Choose an employee first' : `Summary${isFullMonth ? ', salary' : ''} and daily records`)
                    : `One row per employee${isFullMonth ? ' with salary' : ''}`}
                right={busy ? <ActivityIndicator size="small" color={color.accent} /> : <Icon name="download" size={18} color={color.textTertiary} />}
                chevron={false}
                disabled={blocked || Boolean(exporting)}
                onPress={() => runExport(scope, format)}
            />
        );
    };

    // ------------------------------------------------------------------ main
    return (
        <View style={styles.flex}>
            <View style={styles.controls}>
                <SelectField
                    value={employeeName ? `${employeeName}  (${selectedEmployee})` : null}
                    placeholder="Choose an employee"
                    onPress={() => setPickEmployee(true)}
                    style={styles.noMargin}
                />
                <Segmented options={PRESETS} value={activePreset} onChange={applyPreset} style={styles.presets} />
                <View style={styles.dateRow}>
                    <SelectField value={formatFieldDate(dateRange.startDate)} icon="calendar" onPress={() => setShowStartPicker(true)} style={[styles.flex, styles.noMargin]} />
                    <Text style={styles.dateDash}>{'\u2013'}</Text>
                    <SelectField value={formatFieldDate(dateRange.endDate)} icon="calendar" onPress={() => setShowEndPicker(true)} style={[styles.flex, styles.noMargin]} />
                </View>
            </View>

            <Screen refreshing={refreshing} onRefresh={onRefresh}>
                {!selectedEmployee ? (
                    <EmptyState
                        icon="user"
                        title="Choose an employee"
                        message="Their attendance, salary and daily records appear here. Export for everyone is under Export."
                        action="Choose employee"
                        onAction={() => setPickEmployee(true)}
                    />
                ) : attendanceError ? (
                    <EmptyState
                        icon="alert-circle"
                        title="Could not load attendance"
                        message={attendanceError}
                        action="Try again"
                        onAction={() => loadAttendance()}
                    />
                ) : summaryStats ? (
                    <>
                        {renderAttendance()}
                        {renderSalary()}
                        {attendance.length ? (
                            <Group title={`Daily records  \u00B7  ${attendance.length} days`}>{attendance.map(attendanceRow)}</Group>
                        ) : (
                            <EmptyState icon="calendar" title="No records" message="Nothing to show for this period." />
                        )}
                    </>
                ) : (
                    <Loading label="Loading attendance" />
                )}
            </Screen>

            {/* employee picker */}
            <Sheet visible={pickEmployee} title="Choose employee" onClose={() => setPickEmployee(false)}>
                <SearchField value={employeeQuery} onChangeText={setEmployeeQuery} placeholder="Search by name or ID" style={styles.sheetSearch} />
                {loadingEmployees && employees.length === 0 ? (
                    <Loading />
                ) : employees.length === 0 ? (
                    <EmptyState icon="users" title="No employees" message="No active employees were loaded." action="Try again" onAction={loadEmployees} />
                ) : pickerList.length === 0 ? (
                    <EmptyState icon="search" title="No match" message={`No employee matches \u201C${employeeQuery.trim()}\u201D.`} />
                ) : (
                    <Group>
                        {pickerList.map((e) => (
                            <Row
                                key={e.name}
                                left={<Avatar name={e.employee_name} />}
                                title={e.employee_name || e.name}
                                titleLines={2}
                                subtitle={e.name}
                                selected={e.name === selectedEmployee}
                                right={e.name === selectedEmployee ? <Icon name="check" size={18} color={color.accent} /> : null}
                                chevron={false}
                                onPress={() => {
                                    setSelectedEmployee(e.name);
                                    setPickEmployee(false);
                                    setEmployeeQuery('');
                                }}
                            />
                        ))}
                    </Group>
                )}
            </Sheet>

            {/* export */}
            <Sheet
                visible={showExport}
                title="Export"
                subtitle={periodText}
                onClose={() => !exporting && setShowExport(false)}
                dismissable={!exporting}
                footer={<Button title="Close" variant="secondary" onPress={() => setShowExport(false)} disabled={Boolean(exporting)} style={styles.flex} />}
            >
                <Group title={employeeName || 'This employee'}>
                    {exportRow('employee', 'pdf')}
                    {exportRow('employee', 'excel')}
                </Group>
                <Group title="All employees" footer="Files are saved to your phone's Downloads folder.">
                    {departments.length ? (
                        <Row
                            icon="layers"
                            title="Department"
                            value={exportDepartment ? departmentName : 'All departments'}
                            onPress={() => setShowDepartments((v) => !v)}
                        />
                    ) : null}
                    {showDepartments ? [{ name: '', department_name: 'All departments' }, ...departments].map((d) => (
                        <Row
                            key={d.name || 'all'}
                            title={d.department_name || d.name}
                            titleLines={2}
                            right={exportDepartment === d.name ? <Icon name="check" size={18} color={color.accent} /> : null}
                            chevron={false}
                            onPress={() => {
                                setExportDepartment(d.name);
                                setShowDepartments(false);
                            }}
                        />
                    )) : null}
                    {exportRow('all', 'pdf')}
                    {exportRow('all', 'excel')}
                </Group>
            </Sheet>

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

const styles = StyleSheet.create({
    flex: { flex: 1 },
    noMargin: { marginBottom: 0 },
    headerAction: { paddingHorizontal: 4, paddingVertical: 4 },
    headerActionText: { fontSize: 16, fontWeight: '600', color: color.accent },
    controls: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        paddingBottom: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    presets: { marginTop: space.md },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
    dateDash: { color: color.textTertiary },
    statsBlock: { backgroundColor: color.surface },
    flatStrip: { borderWidth: 0, borderRadius: 0 },
    stripDivider: { height: StyleSheet.hairlineWidth, backgroundColor: color.divider, marginHorizontal: space.lg },
    rate: { paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.divider },
    rateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, marginBottom: 6 },
    rateText: { ...type.secondary, flex: 1 },
    rateValue: { fontSize: 15, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    netPay: { fontSize: 17, fontWeight: '700', color: color.text, fontVariant: ['tabular-nums'] },
    sheetSearch: { marginBottom: space.md },
});

export default AllAttendanceAnalyticsScreen;
