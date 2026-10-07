// src/screens/employee/HolidayListScreen.js
//
// Holidays for the current year from the employee's holiday list (hrms.api.get_employee_holidays).
// Calendar shows one month at a time; Upcoming / All list them grouped by month. Weekly offs
// (Saturdays, Sundays) are hidden unless the employee turns them on.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import ApiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Tag,
    StatStrip,
    Segmented,
    IconButton,
    EmptyState,
    Loading,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Strip HTML to clean holiday descriptions
const stripHtml = (html) => {
    if (!html) {
        return '';
    }
    // Remove HTML tags and decode common HTML entities
    return String(html)
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
};

// 'YYYY-MM-DD' as a local date, so the day never shifts with the phone's timezone; null if not a date
const parseDay = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
};

// Helper functions for date formatting
const formatDate = (date) => `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
const getDayName = (date) => DAYS[date.getDay()];
const getMonthName = (date) => MONTHS[date.getMonth()].slice(0, 3);

const getDaysUntil = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((date - today) / (1000 * 60 * 60 * 24));

    if (diff === 0) {
        return 'Today';
    }
    if (diff === 1) {
        return 'Tomorrow';
    }
    if (diff < 0) {
        return `${Math.abs(diff)} days ago`;
    }
    if (diff <= 7) {
        return `In ${diff} days`;
    }
    if (diff <= 30) {
        return `In ${Math.ceil(diff / 7)} weeks`;
    }
    return `In ${Math.ceil(diff / 30)} months`;
};

const DayBlock = ({ date, muted }) => (
    <View style={styles.day}>
        <Text style={[styles.dayNumber, muted && styles.muted]}>{date.getDate()}</Text>
        <Text style={styles.dayName}>{WEEKDAYS[date.getDay()]}</Text>
    </View>
);

const HolidayListScreen = ({ navigation }) => {
    const { employee } = useAuth();
    const employeeName = employee?.name;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState(null); // shown when no holidays have loaded yet
    const [holidays, setHolidays] = useState([]);
    const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' or 'all'
    const [viewMode, setViewMode] = useState('calendar'); // 'list' or 'calendar' - DEFAULT: calendar
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [showWeeklyOffs, setShowWeeklyOffs] = useState(false); // Toggle to show/hide weekly offs - DEFAULT: HIDE
    const [stats, setStats] = useState({
        total: 0,
        upcoming: 0,
        past: 0,
        thisMonth: 0,
        weeklyOffs: 0,
        regularHolidays: 0,
    });

    // Fetch holidays from backend using new comprehensive API
    const fetchHolidays = useCallback(async () => {
        try {
            if (!employeeName) {
                return;
            }

            // Use new comprehensive API
            const yearValue = new Date().getFullYear().toString();
            const response = await ApiService.getEmployeeHolidays(employeeName, yearValue);

            // Check if API call was successful
            if (!isApiSuccess(response)) {
                const errorMsg = getApiErrorMessage(response, 'Failed to load holidays');
                console.error('Holidays API Error:', errorMsg);
                showToast({
                    type: 'error',
                    text1: 'Could not load holidays',
                    text2: errorMsg,
                });
                // the holidays already on screen stay (a failed refresh does not blank the screen)
                setLoadError(errorMsg);
                return;
            }

            // Extract data using helper
            const extractedData = extractFrappeData(response, {});

            // Handle nested structure - data might be in 'data' key or direct
            const holidayData = extractedData.data || extractedData;
            const holidaysList = (holidayData.holidays || extractedData.holidays || []).filter((h) => parseDay(h?.holiday_date));
            const statistics = holidayData.statistics || extractedData.statistics || {};

            // Process holidays
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const currentMonth = today.getMonth();
            const currentYearNum = today.getFullYear();

            const processedHolidays = holidaysList.map(holiday => {
                const holidayDate = parseDay(holiday.holiday_date);

                // Detect weekly offs (weekends) based on day of week or description
                const dayOfWeek = holidayDate.getDay(); // 0 = Sunday, 6 = Saturday
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
                const cleanDescription = stripHtml(holiday.description);
                const isDescriptionWeekend = cleanDescription &&
                    (cleanDescription.toLowerCase().includes('saturday') ||
                     cleanDescription.toLowerCase().includes('sunday'));

                const isWeeklyOff = holiday.weekly_off === 1 ||
                                   holiday.weekly_off === true ||
                                   isWeekend ||
                                   isDescriptionWeekend;

                return {
                    ...holiday,
                    dateObj: holidayDate,
                    isPast: holidayDate < today,
                    isFuture: holidayDate >= today,
                    isThisMonth: holidayDate.getMonth() === currentMonth &&
                                holidayDate.getFullYear() === currentYearNum,
                    isWeeklyOff: isWeeklyOff,
                    formattedDate: formatDate(holidayDate),
                    dayName: getDayName(holidayDate),
                    monthName: getMonthName(holidayDate),
                    dayOfMonth: holidayDate.getDate(),
                };
            });

            // Sort by date (ascending)
            processedHolidays.sort((a, b) => a.dateObj - b.dateObj);

            // Use statistics from API or calculate as fallback
            setHolidays(processedHolidays);
            setLoadError(null);
            setStats({
                total: statistics.total || processedHolidays.length,
                upcoming: statistics.upcoming || processedHolidays.filter(h => h.isFuture).length,
                past: statistics.past || processedHolidays.filter(h => h.isPast).length,
                thisMonth: statistics.this_month || processedHolidays.filter(h => h.isThisMonth).length,
                weeklyOffs: statistics.weekly_offs || processedHolidays.filter(h => h.isWeeklyOff).length,
                regularHolidays: statistics.public_holidays || processedHolidays.filter(h => !h.isWeeklyOff).length,
            });
        } catch (error) {
            console.error('Error fetching holidays:', error);
            showToast({
                type: 'error',
                text1: 'Could not load holidays',
                text2: 'Pull down to try again.',
            });
            setLoadError(error?.message || 'Could not load holidays');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [employeeName]);

    useEffect(() => {
        if (employeeName) {
            fetchHolidays();
        } else {
            setLoading(false);
        }
    }, [employeeName, fetchHolidays]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchHolidays();
    }, [fetchHolidays]);

    // Filter holidays based on active tab
    const getFilteredHolidays = () => {
        let filtered = holidays;

        // Filter by tab
        if (activeTab === 'upcoming') {
            filtered = filtered.filter(h => h.isFuture);
        }

        // Filter by weekly offs toggle
        if (!showWeeklyOffs) {
            filtered = filtered.filter(h => !h.isWeeklyOff);
        }

        return filtered;
    };

    // Get holidays for selected month (calendar view)
    const getHolidaysForMonth = () => {
        const month = selectedMonth.getMonth();
        const year = selectedMonth.getFullYear();
        let filtered = holidays.filter(h => {
            return h.dateObj.getMonth() === month && h.dateObj.getFullYear() === year;
        });

        // Apply weekly offs filter
        if (!showWeeklyOffs) {
            filtered = filtered.filter(h => !h.isWeeklyOff);
        }

        return filtered;
    };

    // Generate calendar grid
    const generateCalendarDays = () => {
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days = [];

        // Add empty cells for days before the month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push({ empty: true, key: `empty-${i}` });
        }

        // Add days of the month
        const monthHolidays = getHolidaysForMonth();
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const holiday = monthHolidays.find(h => h.dateObj.getDate() === day);
            days.push({
                day,
                date,
                holiday,
                key: `day-${day}`,
            });
        }

        return days;
    };

    // Always the 1st: moving from the 31st with setMonth() would skip a shorter month
    const changeMonth = (offset) => {
        setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + offset, 1));
    };
    // Only this year's holidays are loaded, so the calendar stays inside this year
    const loadedYear = new Date().getFullYear();
    const canGoBack = selectedMonth.getFullYear() > loadedYear || (selectedMonth.getFullYear() === loadedYear && selectedMonth.getMonth() > 0);
    const canGoForward = selectedMonth.getFullYear() < loadedYear || (selectedMonth.getFullYear() === loadedYear && selectedMonth.getMonth() < 11);

    // ------------------------------------------------------------------ derived (display)
    const publicHolidays = useMemo(() => holidays.filter(h => !h.isWeeklyOff), [holidays]);
    const visibleCount = (tab) => holidays.filter(h => (tab === 'all' || h.isFuture) && (showWeeklyOffs || !h.isWeeklyOff)).length;

    const tabValue = viewMode === 'calendar' ? 'calendar' : activeTab;
    const onTabChange = (value) => {
        if (value === 'calendar') {
            setViewMode('calendar');
        } else {
            setViewMode('list');
            setActiveTab(value);
        }
    };

    // ------------------------------------------------------------------ rows
    const renderHolidayRow = (item, index) => (
        <Row
            key={`${item.holiday_date}-${index}`}
            left={<DayBlock date={item.dateObj} muted={item.isPast} />}
            title={stripHtml(item.description) || 'Holiday'}
            titleLines={2}
            subtitle={item.isFuture ? getDaysUntil(item.dateObj) : null}
            meta={item.isWeeklyOff ? [<Tag key="wo" label="Weekly off" />] : null}
        />
    );

    const renderCalendarView = () => {
        const days = generateCalendarDays();
        const monthHolidays = getHolidaysForMonth();
        const monthName = `${MONTHS[selectedMonth.getMonth()]} ${selectedMonth.getFullYear()}`;
        const todayText = new Date().toDateString();

        return (
            <>
                <Group>
                    <View style={styles.calendar}>
                        {/* Month Navigator */}
                        <View style={styles.monthNav}>
                            <IconButton name="chevron-left" onPress={() => changeMonth(-1)} disabled={!canGoBack} label="Previous month" />
                            <Text style={styles.monthTitle} numberOfLines={1}>{monthName}</Text>
                            <IconButton name="chevron-right" onPress={() => changeMonth(1)} disabled={!canGoForward} label="Next month" />
                        </View>

                        {/* Day Headers */}
                        <View style={styles.weekRow}>
                            {WEEKDAYS.map((day) => (
                                <Text key={day} style={styles.weekday}>{day}</Text>
                            ))}
                        </View>

                        {/* Calendar Grid */}
                        <View style={styles.grid}>
                            {days.map((item) => {
                                if (item.empty) {
                                    return <View key={item.key} style={styles.cell} />;
                                }
                                const isToday = item.date.toDateString() === todayText;
                                const hasHoliday = !!item.holiday;
                                const isWeeklyOff = item.holiday?.isWeeklyOff;
                                return (
                                    <View key={item.key} style={styles.cell}>
                                        <View
                                            style={[
                                                styles.dayCircle,
                                                hasHoliday && !isWeeklyOff && styles.holidayCircle,
                                                hasHoliday && isWeeklyOff && styles.offCircle,
                                                isToday && styles.todayCircle,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.cellText,
                                                    hasHoliday && !isWeeklyOff && styles.holidayText,
                                                    hasHoliday && isWeeklyOff && styles.offText,
                                                    isToday && styles.todayText,
                                                ]}
                                            >
                                                {item.day}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                </Group>

                {/* Holidays in Selected Month */}
                <Group title={`Holidays in ${MONTHS[selectedMonth.getMonth()]}`}>
                    {monthHolidays.length ? (
                        monthHolidays.map(renderHolidayRow)
                    ) : (
                        <Text style={styles.none}>No holidays this month</Text>
                    )}
                </Group>
            </>
        );
    };

    const renderListView = () => {
        const filteredHolidays = getFilteredHolidays();
        if (filteredHolidays.length === 0) {
            return (
                <EmptyState
                    icon="calendar"
                    title={activeTab === 'upcoming' ? 'No upcoming holidays' : 'No holidays'}
                    message={activeTab === 'upcoming' ? 'Nothing else is scheduled this year.' : 'Your holiday list has nothing for this year.'}
                />
            );
        }
        const groups = [];
        filteredHolidays.forEach((h) => {
            const key = `${h.dateObj.getFullYear()}-${h.dateObj.getMonth()}`;
            let group = groups[groups.length - 1];
            if (!group || group.key !== key) {
                group = { key, title: `${MONTHS[h.dateObj.getMonth()]} ${h.dateObj.getFullYear()}`, items: [] };
                groups.push(group);
            }
            group.items.push(h);
        });
        return groups.map((group) => (
            <Group key={group.key} title={group.title}>
                {group.items.map(renderHolidayRow)}
            </Group>
        ));
    };

    // ------------------------------------------------------------------ render
    return (
        <View style={styles.flex}>
            <View style={styles.controls}>
                <Segmented
                    value={tabValue}
                    onChange={onTabChange}
                    options={[
                        { value: 'calendar', label: 'Calendar' },
                        { value: 'upcoming', label: 'Upcoming', count: loading ? undefined : visibleCount('upcoming') },
                        { value: 'all', label: 'All', count: loading ? undefined : visibleCount('all') },
                    ]}
                />
            </View>

            {loading ? (
                <Loading />
            ) : holidays.length === 0 && loadError ? (
                <Screen refreshing={refreshing} onRefresh={onRefresh}>
                    <EmptyState
                        icon="alert-circle"
                        title="Could not load holidays"
                        message={loadError}
                        action="Try again"
                        onAction={() => {
                            setLoading(true);
                            fetchHolidays();
                        }}
                    />
                </Screen>
            ) : (
                <Screen refreshing={refreshing} onRefresh={onRefresh}>
                    <Group title={String(new Date().getFullYear())}>
                        {/* three numbers: a fourth ("Weekly offs") did not fit 320 dp at 1.3x text; its count is on the switch row */}
                        <StatStrip
                            style={styles.flatStrip}
                            items={[
                                { label: 'Holidays', value: stats.regularHolidays },
                                { label: 'Upcoming', value: publicHolidays.filter(h => h.isFuture).length },
                                { label: 'This month', value: publicHolidays.filter(h => h.isThisMonth).length },
                            ]}
                        />
                        <Row
                            title="Show weekly offs"
                            subtitle={stats.weeklyOffs ? `${stats.weeklyOffs} this year` : null}
                            right={(
                                <Switch
                                    value={showWeeklyOffs}
                                    onValueChange={setShowWeeklyOffs}
                                    trackColor={{ true: '#C7D2FE', false: '#EAECF0' }}
                                    thumbColor={showWeeklyOffs ? color.accent : '#FFFFFF'}
                                />
                            )}
                        />
                    </Group>

                    {viewMode === 'calendar' ? renderCalendarView() : renderListView()}
                </Screen>
            )}
        </View>
    );
};

const CELL = 36;

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: color.bg },
    controls: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    flatStrip: { borderWidth: 0, borderRadius: 0 },

    calendar: { paddingHorizontal: space.sm, paddingBottom: space.md },
    monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.xs },
    monthTitle: { ...type.title, fontSize: 16, flexShrink: 1, textAlign: 'center' },
    weekRow: { flexDirection: 'row', marginBottom: space.xs },
    weekday: { ...type.caption, flex: 1, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, height: CELL + 6, alignItems: 'center', justifyContent: 'center' },
    dayCircle: { width: CELL, height: CELL, borderRadius: CELL / 2, alignItems: 'center', justifyContent: 'center' },
    holidayCircle: { backgroundColor: color.accentSoft },
    offCircle: { backgroundColor: color.neutralSoft },
    todayCircle: { borderWidth: 1.5, borderColor: color.accent },
    cellText: { fontSize: 15, color: color.text, fontVariant: ['tabular-nums'] },
    holidayText: { color: color.accent, fontWeight: '600' },
    offText: { color: color.textSecondary },
    todayText: { color: color.accent, fontWeight: '600' },

    none: { ...type.secondary, paddingHorizontal: space.lg, paddingVertical: space.lg },

    day: { minWidth: 36, alignItems: 'center', marginRight: space.md },
    dayNumber: { fontSize: 17, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    dayName: { fontSize: 12, color: color.textTertiary, marginTop: 1 },
    muted: { color: color.textTertiary },
});

export default HolidayListScreen;
