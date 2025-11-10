import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import EmptyState from '../../components/ui/EmptyState';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

const HolidayListScreen = ({ navigation }) => {
    const { custom } = useTheme();
    const { employee } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
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
        regularHolidays: 0
    });

    // Fetch holidays from backend using new comprehensive API
    const fetchHolidays = async () => {
        try {
            if (!employee?.name) {
                console.log('No employee ID available');
                return;
            }

            console.log('Fetching holidays for employee:', employee.name);
            
            // Use new comprehensive API
            const currentYear = new Date().getFullYear().toString();
            const response = await ApiService.getEmployeeHolidays(employee.name, currentYear);
            
            console.log('Holidays API Response:', JSON.stringify(response, null, 2));

            if (response.success && response.data) {
                const apiData = response.data.message || response.data;
                
                if (apiData.status === 'error') {
                    console.error('API Error:', apiData.message);
                    showToast({
                        type: 'error',
                        text1: 'Error',
                        text2: apiData.message || 'Failed to load holidays'
                    });
                    setHolidays([]);
                    return;
                }

                const holidayData = apiData.data;
                const holidaysList = holidayData.holidays || [];
                const statistics = holidayData.statistics || {};

                console.log('Processed holidays list:', holidaysList.length, 'items');
                console.log('API Statistics:', statistics);

                // Process holidays
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const currentMonth = today.getMonth();
                const currentYear = today.getFullYear();

                const processedHolidays = holidaysList.map(holiday => {
                    const holidayDate = new Date(holiday.holiday_date);
                    const isWeeklyOff = holiday.weekly_off === 1 || holiday.weekly_off === true;
                    
                    return {
                        ...holiday,
                        dateObj: holidayDate,
                        isPast: holidayDate < today,
                        isFuture: holidayDate >= today,
                        isThisMonth: holidayDate.getMonth() === currentMonth && 
                                    holidayDate.getFullYear() === currentYear,
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
                setStats({
                    total: statistics.total || processedHolidays.length,
                    upcoming: statistics.upcoming || processedHolidays.filter(h => h.isFuture).length,
                    past: statistics.past || processedHolidays.filter(h => h.isPast).length,
                    thisMonth: statistics.this_month || processedHolidays.filter(h => h.isThisMonth).length,
                    weeklyOffs: statistics.weekly_offs || processedHolidays.filter(h => h.isWeeklyOff).length,
                    regularHolidays: statistics.public_holidays || processedHolidays.filter(h => !h.isWeeklyOff).length
                });

                console.log('Final Stats:', { 
                    total: statistics.total,
                    upcoming: statistics.upcoming,
                    past: statistics.past,
                    thisMonth: statistics.this_month,
                    weeklyOffs: statistics.weekly_offs,
                    regularHolidays: statistics.public_holidays
                });

                // Show success message
                showToast({
                    type: 'success',
                    text1: 'Holidays Loaded',
                    text2: `${statistics.total || processedHolidays.length} holidays for ${currentYear}`
                });
            } else {
                console.error('Invalid holidays response:', response);
                showToast({
                    type: 'error',
                    text1: 'Failed to Load',
                    text2: response.message || 'Failed to load holidays'
                });
                setHolidays([]);
            }
        } catch (error) {
            console.error('Error fetching holidays:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to load holidays data'
            });
            setHolidays([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (employee?.name) {
            fetchHolidays();
        } else {
            setLoading(false);
        }
    }, [employee?.name]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchHolidays();
    }, [employee?.name]);

    // Helper functions for date formatting
    const formatDate = (date) => {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    };

    const getDayName = (date) => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[date.getDay()];
    };

    const getMonthName = (date) => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[date.getMonth()];
    };

    const getDaysUntil = (date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
        
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Tomorrow';
        if (diff < 0) return `${Math.abs(diff)} days ago`;
        if (diff <= 7) return `In ${diff} days`;
        if (diff <= 30) return `In ${Math.ceil(diff / 7)} weeks`;
        return `In ${Math.ceil(diff / 30)} months`;
    };

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

    const renderHolidayCard = ({ item }) => {
        const isUpcoming = item.isFuture;
        const isWeeklyOff = item.isWeeklyOff;
        const cardBgColor = isUpcoming ? '#FFF' : '#F9FAFB';
        
        // Color logic: Weekly offs get a different color scheme
        let accentColor;
        if (isWeeklyOff) {
            accentColor = '#8B5CF6'; // Purple for weekly offs
        } else if (item.isThisMonth) {
            accentColor = custom.palette.success;
        } else if (isUpcoming) {
            accentColor = custom.palette.primary;
        } else {
            accentColor = '#9CA3AF';
        }

        return (
            <TouchableOpacity
                style={[styles.holidayCard, { backgroundColor: cardBgColor }]}
                activeOpacity={0.7}
                disabled={true}
            >
                {/* Date Badge */}
                <View style={[styles.dateBadge, { backgroundColor: `${accentColor}15` }]}>
                    <Text style={[styles.monthText, { color: accentColor }]}>
                        {item.monthName}
                    </Text>
                    <Text style={[styles.dayText, { color: accentColor }]}>
                        {item.dayOfMonth}
                    </Text>
                    <Text style={[styles.yearText, { color: accentColor }]}>
                        {item.dateObj.getFullYear()}
                    </Text>
                </View>

                {/* Holiday Details */}
                <View style={styles.holidayDetails}>
                    <View style={styles.titleRow}>
                        <Text style={[styles.holidayTitle, { color: custom.palette.text }]} numberOfLines={2}>
                            {item.description || 'Holiday'}
                        </Text>
                        {isWeeklyOff && (
                            <View style={[styles.badge, { backgroundColor: '#8B5CF6' }]}>
                                <Text style={styles.badgeText}>Weekly Off</Text>
                            </View>
                        )}
                        {!isWeeklyOff && item.isThisMonth && (
                            <View style={[styles.badge, { backgroundColor: custom.palette.success }]}>
                                <Text style={styles.badgeText}>This Month</Text>
                            </View>
                        )}
                    </View>
                    
                    <View style={styles.metaRow}>
                        <Icon 
                            name={isWeeklyOff ? "calendar" : "calendar-day"} 
                            size={12} 
                            color={custom.palette.textSecondary} 
                        />
                        <Text style={[styles.metaText, { color: custom.palette.textSecondary }]}>
                            {item.dayName}
                        </Text>
                    </View>

                    {isUpcoming && (
                        <View style={styles.countdownRow}>
                            <Icon name="clock" size={12} color={accentColor} />
                            <Text style={[styles.countdownText, { color: accentColor }]}>
                                {getDaysUntil(item.dateObj)}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Status Indicator */}
                <View style={styles.statusIndicator}>
                    {isWeeklyOff ? (
                        <Icon name="redo" size={18} color={accentColor} />
                    ) : isUpcoming ? (
                        <Icon name="calendar-check" size={20} color={accentColor} />
                    ) : (
                        <Icon name="check-circle" size={20} color="#9CA3AF" />
                    )}
                </View>
            </TouchableOpacity>
        );
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
                key: `day-${day}`
            });
        }
        
        return days;
    };

    const changeMonth = (offset) => {
        const newDate = new Date(selectedMonth);
        newDate.setMonth(newDate.getMonth() + offset);
        setSelectedMonth(newDate);
    };

    const renderCalendarView = () => {
        const days = generateCalendarDays();
        const monthName = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        return (
            <View style={styles.calendarContainer}>
                {/* Month Navigator */}
                <View style={styles.monthNavigator}>
                    <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthNavButton}>
                        <Icon name="chevron-left" size={20} color={custom.palette.primary} />
                    </TouchableOpacity>
                    <Text style={[styles.monthTitle, { color: custom.palette.text }]}>
                        {monthName}
                    </Text>
                    <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthNavButton}>
                        <Icon name="chevron-right" size={20} color={custom.palette.primary} />
                    </TouchableOpacity>
                </View>

                {/* Day Headers */}
                <View style={styles.dayHeaderRow}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                        <View key={day} style={styles.dayHeader}>
                            <Text style={[
                                styles.dayHeaderText, 
                                { color: index === 0 ? custom.palette.danger : custom.palette.textSecondary }
                            ]}>
                                {day}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Calendar Grid */}
                <View style={styles.calendarGrid}>
                    {days.map((item) => {
                        if (item.empty) {
                            return <View key={item.key} style={styles.calendarDay} />;
                        }

                        const isToday = item.date.toDateString() === new Date().toDateString();
                        const hasHoliday = !!item.holiday;
                        const isWeeklyOff = item.holiday?.isWeeklyOff;

                        return (
                            <TouchableOpacity
                                key={item.key}
                                style={[
                                    styles.calendarDay,
                                    hasHoliday && !isWeeklyOff && [styles.holidayDay, { backgroundColor: `${custom.palette.success}15` }],
                                    hasHoliday && isWeeklyOff && [styles.weeklyOffDay, { backgroundColor: '#8B5CF615' }],
                                    isToday && styles.todayDay
                                ]}
                                activeOpacity={0.7}
                                disabled={!hasHoliday}
                            >
                                <Text style={[
                                    styles.calendarDayText,
                                    { color: custom.palette.text },
                                    hasHoliday && !isWeeklyOff && { color: custom.palette.success, fontWeight: '800' },
                                    hasHoliday && isWeeklyOff && { color: '#8B5CF6', fontWeight: '800' },
                                    isToday && { color: custom.palette.primary }
                                ]}>
                                    {item.day}
                                </Text>
                                {hasHoliday && (
                                    <View style={[
                                        styles.holidayDot, 
                                        { backgroundColor: isWeeklyOff ? '#8B5CF6' : custom.palette.success }
                                    ]} />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Holidays in Selected Month */}
                <View style={styles.monthHolidaysList}>
                    <View style={styles.monthHolidaysHeader}>
                        <Text style={[styles.monthHolidaysTitle, { color: custom.palette.text }]}>
                            Holidays this month ({getHolidaysForMonth().length})
                        </Text>
                        <TouchableOpacity 
                            style={styles.filterButton}
                            onPress={() => setShowWeeklyOffs(!showWeeklyOffs)}
                        >
                            <Icon 
                                name={showWeeklyOffs ? "eye" : "eye-slash"} 
                                size={12} 
                                color={custom.palette.primary} 
                            />
                            <Text style={[styles.filterButtonText, { color: custom.palette.primary }]}>
                                {showWeeklyOffs ? 'Hide' : 'Show'} Weekly Offs
                            </Text>
                        </TouchableOpacity>
                    </View>
                    {getHolidaysForMonth().map((holiday, index) => {
                        const isWeeklyOff = holiday.isWeeklyOff;
                        const badgeColor = isWeeklyOff ? '#8B5CF6' : custom.palette.success;
                        
                        return (
                            <View key={index} style={styles.miniHolidayCard}>
                                <View style={[styles.miniDateBadge, { backgroundColor: `${badgeColor}15` }]}>
                                    <Text style={[styles.miniDayText, { color: badgeColor }]}>
                                        {holiday.dayOfMonth}
                                    </Text>
                                </View>
                                <View style={styles.miniHolidayDetails}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={[styles.miniHolidayTitle, { color: custom.palette.text }]} numberOfLines={1}>
                                            {holiday.description || 'Holiday'}
                                        </Text>
                                        {isWeeklyOff && (
                                            <View style={[styles.miniBadge, { backgroundColor: '#8B5CF6' }]}>
                                                <Text style={styles.miniBadgeText}>WO</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={[styles.miniHolidayDay, { color: custom.palette.textSecondary }]}>
                                        {holiday.dayName}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                    {getHolidaysForMonth().length === 0 && (
                        <Text style={[styles.noHolidaysText, { color: custom.palette.textSecondary }]}>
                            No holidays this month
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    const renderHeader = () => (
        <View style={styles.headerContent}>
            {/* Stats Cards Row 1 */}
            <View style={styles.statsContainer}>
                <View style={[styles.statCard, { backgroundColor: `${custom.palette.primary}15` }]}>
                    <Icon name="calendar-alt" size={18} color={custom.palette.primary} />
                    <Text style={[styles.statValue, { color: custom.palette.primary }]}>
                        {stats.total}
                    </Text>
                    <Text style={[styles.statLabel, { color: custom.palette.textSecondary }]}>
                        Total Holidays
                    </Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: `${custom.palette.success}15` }]}>
                    <Icon name="gift" size={18} color={custom.palette.success} />
                    <Text style={[styles.statValue, { color: custom.palette.success }]}>
                        {stats.regularHolidays}
                    </Text>
                    <Text style={[styles.statLabel, { color: custom.palette.textSecondary }]}>
                        Public Holidays
                    </Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: '#8B5CF615' }]}>
                    <Icon name="redo" size={18} color="#8B5CF6" />
                    <Text style={[styles.statValue, { color: '#8B5CF6' }]}>
                        {stats.weeklyOffs}
                    </Text>
                    <Text style={[styles.statLabel, { color: custom.palette.textSecondary }]}>
                        Weekly Offs
                    </Text>
                </View>
            </View>

            {/* Stats Cards Row 2 */}
            <View style={styles.statsContainer}>
                <View style={[styles.statCard, { backgroundColor: `${custom.palette.warning}15` }]}>
                    <Icon name="arrow-right" size={18} color={custom.palette.warning} />
                    <Text style={[styles.statValue, { color: custom.palette.warning }]}>
                        {stats.upcoming}
                    </Text>
                    <Text style={[styles.statLabel, { color: custom.palette.textSecondary }]}>
                        Upcoming
                    </Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: `${custom.palette.danger}15` }]}>
                    <Icon name="calendar-day" size={18} color={custom.palette.danger} />
                    <Text style={[styles.statValue, { color: custom.palette.danger }]}>
                        {stats.thisMonth}
                    </Text>
                    <Text style={[styles.statLabel, { color: custom.palette.textSecondary }]}>
                        This Month
                    </Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: '#6B728015' }]}>
                    <Icon name="check-circle" size={18} color="#6B7280" />
                    <Text style={[styles.statValue, { color: '#6B7280' }]}>
                        {stats.past}
                    </Text>
                    <Text style={[styles.statLabel, { color: custom.palette.textSecondary }]}>
                        Completed
                    </Text>
                </View>
            </View>

            {/* View Mode Toggle */}
            <View style={styles.viewModeContainer}>
                <TouchableOpacity
                    style={[
                        styles.viewModeButton,
                        viewMode === 'calendar' && [styles.viewModeButtonActive, { backgroundColor: custom.palette.primary }]
                    ]}
                    onPress={() => setViewMode('calendar')}
                >
                    <Icon 
                        name="calendar" 
                        size={14} 
                        color={viewMode === 'calendar' ? '#FFF' : custom.palette.textSecondary} 
                    />
                    <Text style={[
                        styles.viewModeText,
                        { color: viewMode === 'calendar' ? '#FFF' : custom.palette.textSecondary }
                    ]}>
                        Calendar View
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.viewModeButton,
                        viewMode === 'list' && [styles.viewModeButtonActive, { backgroundColor: custom.palette.primary }]
                    ]}
                    onPress={() => setViewMode('list')}
                >
                    <Icon 
                        name="list" 
                        size={14} 
                        color={viewMode === 'list' ? '#FFF' : custom.palette.textSecondary} 
                    />
                    <Text style={[
                        styles.viewModeText,
                        { color: viewMode === 'list' ? '#FFF' : custom.palette.textSecondary }
                    ]}>
                        List View
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Tab Switcher - Only show in list view */}
            {viewMode === 'list' && (
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[
                            styles.tab,
                            activeTab === 'upcoming' && [styles.activeTab, { backgroundColor: custom.palette.primary }]
                        ]}
                        onPress={() => setActiveTab('upcoming')}
                    >
                        <Icon 
                            name="arrow-right" 
                            size={14} 
                            color={activeTab === 'upcoming' ? '#FFF' : custom.palette.textSecondary} 
                        />
                        <Text style={[
                            styles.tabText,
                            { color: activeTab === 'upcoming' ? '#FFF' : custom.palette.textSecondary }
                        ]}>
                            Upcoming ({stats.upcoming})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.tab,
                            activeTab === 'all' && [styles.activeTab, { backgroundColor: custom.palette.primary }]
                        ]}
                        onPress={() => setActiveTab('all')}
                    >
                        <Icon 
                            name="list" 
                            size={14} 
                            color={activeTab === 'all' ? '#FFF' : custom.palette.textSecondary} 
                        />
                        <Text style={[
                            styles.tabText,
                            { color: activeTab === 'all' ? '#FFF' : custom.palette.textSecondary }
                        ]}>
                            All Holidays ({stats.total})
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={custom.palette.primary} />
                    <Text style={[styles.loadingText, { color: custom.palette.textSecondary }]}>
                        Loading holidays...
                    </Text>
                </View>
            </View>
        );
    }

    const filteredHolidays = getFilteredHolidays();

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>

            {viewMode === 'calendar' ? (
                <ScrollView
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={[custom.palette.primary]}
                        />
                    }
                >
                    {renderHeader()}
                    {renderCalendarView()}
                </ScrollView>
            ) : (
                <FlatList
                    data={filteredHolidays}
                    renderItem={renderHolidayCard}
                    keyExtractor={(item, index) => item.name || `holiday-${index}`}
                    contentContainerStyle={styles.listContent}
                    ListHeaderComponent={renderHeader}
                    ListEmptyComponent={
                        <EmptyState
                            icon="calendar-times"
                            title="No Holidays Found"
                            subtitle={activeTab === 'upcoming' ? 
                                "No upcoming holidays scheduled" : 
                                "No holidays available"
                            }
                        />
                    }
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={[custom.palette.primary]}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
    },
    listContent: {
        padding: 16,
        paddingBottom: 32,
    },
    headerContent: {
        marginBottom: 18,
    },
    statsContainer: {
        flexDirection: 'row',
        marginBottom: 14,
        marginHorizontal: -4,
    },
    statCard: {
        flex: 1,
        marginHorizontal: 4,
        padding: 10,
        borderRadius: 8,
        alignItems: 'center',
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        backgroundColor: '#FFF',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        marginTop: 4,
    },
    statLabel: {
        fontSize: 10,
        marginTop: 2,
        textAlign: 'center',
        fontWeight: '500',
    },
    viewModeContainer: {
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 4,
        marginBottom: 12,
    },
    viewModeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        gap: 6,
    },
    viewModeButtonActive: {
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    viewModeText: {
        fontSize: 13,
        fontWeight: '700',
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 4,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        gap: 6,
    },
    activeTab: {
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    tabText: {
        fontSize: 13,
        fontWeight: '700',
    },
    holidayCard: {
        flexDirection: 'row',
        marginBottom: 12,
        padding: 14,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        alignItems: 'center',
    },
    dateBadge: {
        width: 60,
        height: 70,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    monthText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    dayText: {
        fontSize: 24,
        fontWeight: '800',
        marginVertical: 2,
    },
    yearText: {
        fontSize: 10,
        fontWeight: '600',
    },
    holidayDetails: {
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 6,
    },
    holidayTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        lineHeight: 20,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        marginLeft: 8,
    },
    badgeText: {
        color: '#FFF',
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    metaText: {
        fontSize: 12,
        fontWeight: '600',
    },
    countdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    countdownText: {
        fontSize: 12,
        fontWeight: '700',
    },
    statusIndicator: {
        marginLeft: 8,
    },
    // Calendar View Styles
    calendarContainer: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    monthNavigator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingHorizontal: 8,
    },
    monthNavButton: {
        padding: 8,
    },
    monthTitle: {
        fontSize: 18,
        fontWeight: '800',
    },
    dayHeaderRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    dayHeader: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
    },
    dayHeaderText: {
        fontSize: 12,
        fontWeight: '700',
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    calendarDay: {
        width: '14.28%', // 100% / 7 days
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
        borderRadius: 8,
        position: 'relative',
    },
    holidayDay: {
        borderWidth: 2,
        borderColor: '#10B981',
    },
    weeklyOffDay: {
        borderWidth: 2,
        borderColor: '#8B5CF6',
    },
    todayDay: {
        backgroundColor: '#F3F4F6',
    },
    calendarDayText: {
        fontSize: 14,
        fontWeight: '600',
    },
    holidayDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        position: 'absolute',
        bottom: 4,
    },
    monthHolidaysList: {
        marginTop: 20,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    monthHolidaysHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    monthHolidaysTitle: {
        fontSize: 14,
        fontWeight: '700',
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: '#F3F4F6',
    },
    filterButtonText: {
        fontSize: 11,
        fontWeight: '600',
    },
    miniHolidayCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
        marginBottom: 8,
    },
    miniDateBadge: {
        width: 40,
        height: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    miniDayText: {
        fontSize: 18,
        fontWeight: '800',
    },
    miniHolidayDetails: {
        flex: 1,
    },
    miniHolidayTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    miniHolidayDay: {
        fontSize: 12,
    },
    miniBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    miniBadgeText: {
        color: '#FFF',
        fontSize: 9,
        fontWeight: '700',
    },
    noHolidaysText: {
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 16,
        fontStyle: 'italic',
    },
});

export default HolidayListScreen;
