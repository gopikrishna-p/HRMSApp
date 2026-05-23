import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

const AttendanceList = ({ 
    attendance, 
    ListHeaderComponent, 
    ListFooterComponent, 
    ListEmptyComponent,
    refreshControl,
    renderMode 
}) => {

    const formatTime = (timeValue) => {
        if (!timeValue) return null;

        try {
            if (typeof timeValue === 'string') {
                if (timeValue.includes('T')) {
                    const timePart = timeValue.split('T')[1];
                    return timePart.split('.')[0].substring(0, 5);
                }
                if (timeValue.match(/^\d{2}:\d{2}:\d{2}$/)) {
                    return timeValue.substring(0, 5);
                }
                if (timeValue.includes(' ')) {
                    const timePart = timeValue.split(' ')[1];
                    return timePart ? timePart.substring(0, 5) : null;
                }
                if (timeValue.match(/^\d{2}:\d{2}$/)) {
                    return timeValue;
                }
            }

            if (timeValue instanceof Date) {
                return timeValue.toTimeString().substring(0, 5);
            }

            return timeValue.toString().substring(0, 5);
        } catch (error) {
            console.error('Error formatting time:', error);
            return null;
        }
    };

    const formatDate = (dateValue) => {
        if (!dateValue) return 'N/A';

        try {
            const date = new Date(dateValue);
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting date:', error);
            return dateValue;
        }
    };

    const formatWorkingHours = (hours) => {
        if (!hours && hours !== 0) return null;

        if (hours < 1) {
            const minutes = Math.round(hours * 60);
            return `${minutes}m`;
        }

        const wholeHours = Math.floor(hours);
        const minutes = Math.round((hours - wholeHours) * 60);

        if (minutes === 0) {
            return `${wholeHours}h`;
        }

        return `${wholeHours}h ${minutes}m`;
    };

    const getWorkingHoursColor = (hours) => {
        if (!hours) return '#9CA3AF';

        if (hours >= 9) return '#10B981'; // Green for 9+ hours
        if (hours >= 6) return '#F59E0B';  // Yellow for 6-8 hours
        if (hours >= 4) return '#EF4444';  // Red for 4-6 hours
        return '#7C3AED'; // Purple for less than 4 hours
    };

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'present':
                return '#10B981';
            case 'work from home':
                return '#F59E0B';
            case 'absent':
                return '#EF4444';
            case 'on leave':
                return '#8B5CF6';
            case 'holiday':
                return '#8B5CF6';
            default:
                return '#6B7280';
        }
    };

    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'present':
                return 'check-circle';
            case 'work from home':
                return 'home';
            case 'absent':
                return 'times-circle';
            case 'on leave':
                return 'calendar-times';
            case 'holiday':
                return 'calendar';
            default:
                return 'question-circle';
        }
    };

    const isToday = (dateString) => {
        const today = new Date();
        const itemDate = new Date(dateString);
        return today.toDateString() === itemDate.toDateString();
    };

    const calculateWorkingHours = (checkIn, checkOut) => {
        if (!checkIn || !checkOut) return null;

        try {
            const inTime = new Date(`1970-01-01T${formatTime(checkIn)}:00`);
            const outTime = new Date(`1970-01-01T${formatTime(checkOut)}:00`);

            if (outTime < inTime) {
                outTime.setDate(outTime.getDate() + 1);
            }

            const diffMs = outTime - inTime;
            const diffHours = diffMs / (1000 * 60 * 60);

            return diffHours > 0 ? diffHours : null;
        } catch (error) {
            return null;
        }
    };

    const renderItem = ({ item }) => {
        const checkOutTime = item.out_time ||
            item.custom_out_time_copy ||
            item.checkout_time ||
            null;

        const formattedCheckIn = formatTime(item.in_time);
        const formattedCheckOut = formatTime(checkOutTime);

        // Use working hours from API if available, otherwise calculate
        let workingHours = item.working_hours;
        if (!workingHours && workingHours !== 0) {
            workingHours = calculateWorkingHours(item.in_time, checkOutTime);
        }

        const isCurrentDay = isToday(item.attendance_date);
        const formattedHours = formatWorkingHours(workingHours);
        const hoursColor = getWorkingHoursColor(workingHours);
        const isSyntheticStatus = ['absent', 'on leave', 'holiday'].includes(item.status?.toLowerCase());

        return (
            <View style={styles.item}>
                <View style={styles.header}>
                    <View style={styles.employeeInfo}>
                        <Text style={styles.employee}>
                            {item.employee_name || item.employee || 'Unknown Employee'}
                        </Text>
                        <Text style={styles.employeeId}>
                            ID: {item.employee || item.name || 'N/A'}
                        </Text>
                    </View>
                    {/* Right column: status badge stacked over working hours so both
                        sit aligned to the right edge. The Working-Hours pill is
                        only rendered when we have a real (non-synthetic) record
                        with hours — synthetic statuses like Absent/Holiday/Leave
                        don't have working hours and the pill would be misleading. */}
                    <View style={styles.headerRight}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                            <Icon
                                name={getStatusIcon(item.status)}
                                size={12}
                                color="white"
                                style={styles.statusIcon}
                            />
                            <Text style={styles.statusText}>{item.status || 'Unknown'}</Text>
                        </View>
                        {!isSyntheticStatus && formattedHours ? (
                            <View style={styles.workingHoursPill}>
                                <Icon name="clock" size={10} color={hoursColor} />
                                <Text style={[styles.workingHoursPillText, { color: hoursColor }]}>
                                    {formattedHours}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                </View>

                <View style={styles.details}>
                    <View style={styles.dateRow}>
                        <Icon name="calendar" size={14} color="#6B7280" />
                        <Text style={styles.date}>
                            {formatDate(item.attendance_date)}
                        </Text>
                        {isCurrentDay && (
                            <View style={styles.todayBadge}>
                                <Text style={styles.todayText}>Today</Text>
                            </View>
                        )}
                    </View>

                    {!isSyntheticStatus && (
                        <>
                            <View style={styles.timeRow}>
                                <View style={styles.timeItem}>
                                    <Icon name="sign-in-alt" size={14} color="#10B981" />
                                    <Text style={styles.timeLabel}>Check In:</Text>
                                    <Text style={[styles.time, { color: formattedCheckIn ? '#10B981' : '#EF4444' }]}>
                                        {formattedCheckIn || 'Not recorded'}
                                    </Text>
                                </View>

                                <View style={styles.timeItem}>
                                    <Icon name="sign-out-alt" size={14} color="#F59E0B" />
                                    <Text style={styles.timeLabel}>Check Out:</Text>
                                    <Text style={[styles.time, { color: formattedCheckOut ? '#F59E0B' : '#EF4444' }]}>
                                        {formattedCheckOut || (isCurrentDay ? 'Pending' : 'Not recorded')}
                                    </Text>
                                </View>
                            </View>

                            {/* Shift timings (kept on its own row since they're independent
                                of working hours; only shown when the backend supplies them). */}
                            {(item.shift_start || item.shift_end) && (
                                <View style={styles.shiftInfo}>
                                    <Icon name="clock" size={10} color="#8B5CF6" />
                                    <Text style={styles.shiftText}>
                                        Shift: {formatTime(item.shift_start) || 'N/A'} - {formatTime(item.shift_end) || 'N/A'}
                                    </Text>
                                </View>
                            )}
                        </>
                    )}

                    {/* Show late arrival indicator if applicable */}
                    {item.late_arrival === 'Yes' && (
                        <View style={styles.lateIndicator}>
                            <Icon name="exclamation-triangle" size={12} color="#F59E0B" />
                            <Text style={styles.lateText}>Late Arrival</Text>
                        </View>
                    )}

                    {/* Note: the redundant bottom "Work From Home" indicator was
                        removed — the top-right status badge already conveys this
                        status, and the duplicate label was the second mention of
                        the same fact on one card. */}

                    {/* Show pending checkout warning for today's records */}
                    {isCurrentDay && formattedCheckIn && !formattedCheckOut && item.status === 'Present' && (
                        <View style={styles.pendingIndicator}>
                            <Icon name="exclamation-circle" size={12} color="#F59E0B" />
                            <Text style={styles.pendingText}>Check-out pending</Text>
                        </View>
                    )}

                    {/* Show productivity indicator based on working hours */}
                    {workingHours > 0 && (
                        <View style={styles.productivityRow}>
                            <View style={[styles.productivityBar, { backgroundColor: '#E5E7EB' }]}>
                                <View
                                    style={[
                                        styles.productivityFill,
                                        {
                                            backgroundColor: hoursColor,
                                            width: `${Math.min((workingHours / 9) * 100, 100)}%`
                                        }
                                    ]}
                                />
                            </View>
                            <Text style={[styles.productivityText, { color: hoursColor }]}>
                                {Math.round((workingHours / 9) * 100)}%
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    if (renderMode === 'plain') {
        return (
            <View>
                {attendance.map((item, index) => (
                    <View key={item.name || item.employee || index.toString()}>
                        {renderItem({ item })}
                    </View>
                ))}
            </View>
        );
    }

    return (
        <FlatList
            data={attendance}
            renderItem={renderItem}
            keyExtractor={(item, index) => item.name || item.employee || index.toString()}
            ListHeaderComponent={ListHeaderComponent}
            ListFooterComponent={ListFooterComponent}
            ListEmptyComponent={
                ListEmptyComponent || (
                    <View style={styles.emptyContainer}>
                        <Icon name="calendar-times" size={48} color="#9CA3AF" />
                        <Text style={styles.emptyText}>No attendance records found</Text>
                        <Text style={styles.emptySubtext}>
                            Try adjusting your search criteria or date range
                        </Text>
                    </View>
                )
            }
            contentContainerStyle={[
                styles.listContainer,
                attendance.length === 0 && styles.emptyListContainer
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
        />
    );
};

const styles = StyleSheet.create({
    item: {
        backgroundColor: 'white',
        borderRadius: 12,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: 16,
        paddingBottom: 12,
    },
    employeeInfo: {
        flex: 1,
    },
    employee: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 4,
    },
    employeeId: {
        fontSize: 12,
        color: '#6B7280',
    },
    headerRight: {
        alignItems: 'flex-end',
        gap: 6,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    workingHoursPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#ECFDF5',
        borderColor: '#D1FAE5',
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    workingHoursPillText: {
        fontSize: 11,
        fontWeight: '600',
    },
    statusIcon: {
        marginRight: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        color: 'white',
    },
    details: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    date: {
        fontSize: 14,
        color: '#374151',
        marginLeft: 8,
        fontWeight: '500',
        flex: 1,
    },
    todayBadge: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    todayText: {
        fontSize: 10,
        color: '#6366F1',
        fontWeight: '600',
    },
    timeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    timeItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
        marginHorizontal: 4,
    },
    timeLabel: {
        fontSize: 12,
        color: '#6B7280',
        marginLeft: 8,
        marginRight: 4,
    },
    time: {
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 'auto',
    },
    // workingHoursRow/Left/Text removed — Working Hours moved into headerRight as
    // a compact pill that sits beneath the status badge.
    shiftInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: '#F3F4F6',
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    shiftText: {
        fontSize: 10,
        color: '#8B5CF6',
        marginLeft: 4,
        fontWeight: '500',
    },
    productivityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    productivityBar: {
        flex: 1,
        height: 6,
        borderRadius: 3,
        marginRight: 8,
        overflow: 'hidden',
    },
    productivityFill: {
        height: '100%',
        borderRadius: 3,
    },
    productivityText: {
        fontSize: 11,
        fontWeight: '600',
        minWidth: 35,
        textAlign: 'right',
    },
    lateIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: '#FEF3C7',
        borderRadius: 6,
        alignSelf: 'flex-start',
        marginRight: 8,
    },
    lateText: {
        fontSize: 11,
        color: '#D97706',
        marginLeft: 4,
        fontWeight: '500',
    },
    // wfhIndicator / wfhText removed — the top-right status badge already shows
    // "Work From Home", so the bottom-left duplicate label was redundant.
    pendingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: '#FEF3C7',
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    pendingText: {
        fontSize: 11,
        color: '#D97706',
        marginLeft: 4,
        fontWeight: '500',
    },
    emptyContainer: {
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 18,
        color: '#374151',
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
    },
    listContainer: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    emptyListContainer: {
        flexGrow: 1,
        justifyContent: 'center',
    },
});

export default AttendanceList;