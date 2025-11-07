import React, { useState, useEffect, useCallback } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    ScrollView, 
    RefreshControl, 
    TouchableOpacity, 
    Alert,
    FlatList 
} from 'react-native';
import { Card, useTheme, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../context/AuthContext';
import AttendanceService from '../../services/attendance.service';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';

const AttendanceHistoryScreen = ({ navigation }) => {
    const { employee } = useAuth();
    const { custom } = useTheme();
    
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [attendanceData, setAttendanceData] = useState([]);
    const [summaryStats, setSummaryStats] = useState({});
    const [dateRange, setDateRange] = useState({});
    const [holidays, setHolidays] = useState([]);
    const [leaves, setLeaves] = useState([]);
    
    // Date picker states - Default to 1st of current month to today
    const getFirstDayOfCurrentMonth = () => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    };
    
    const [startDate, setStartDate] = useState(getFirstDayOfCurrentMonth());
    const [endDate, setEndDate] = useState(new Date());
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const employeeId = employee?.name;

    const formatDate = (date) => {
        // Use local timezone to avoid date shift issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const formatTime = (datetime) => {
        if (!datetime) return '--';
        try {
            const date = new Date(datetime);
            return date.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
        } catch {
            return '--';
        }
    };

    const formatDateTime = (datetime) => {
        if (!datetime) return '--';
        try {
            const date = new Date(datetime);
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            });
        } catch {
            return '--';
        }
    };

    const stripHtml = (html) => {
        if (!html) return '';
        // Remove HTML tags and decode HTML entities
        const tmp = html.replace(/<[^>]*>/g, '');
        // Decode common HTML entities
        return tmp
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
    };

    const loadAttendanceHistory = useCallback(async () => {
        if (!employeeId) return;
        
        setLoading(true);
        try {
            const startDateStr = formatDate(startDate);
            const endDateStr = formatDate(endDate);
            
            console.log('Loading attendance history with inclusive date range:', {
                employeeId,
                startDate: startDateStr,
                endDate: endDateStr,
                startDateObj: startDate,
                endDateObj: endDate,
                inclusive: 'Both start and end dates should be included'
            });
            
            const result = await AttendanceService.getEmployeeAttendanceHistory(
                employeeId,
                startDateStr,
                endDateStr
            );
            
            console.log('Attendance history result:', result);
            
            setAttendanceData(result.attendance_records || []);
            setSummaryStats(result.summary_stats || {});
            setDateRange(result.date_range || {});
            setHolidays(result.holidays || []);
            setLeaves(result.leaves || []);
            
        } catch (error) {
            console.error('Error loading attendance history:', error);
            Alert.alert('Error', 'Failed to load attendance history');
        } finally {
            setLoading(false);
        }
    }, [employeeId, startDate, endDate]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadAttendanceHistory();
        setRefreshing(false);
    }, [loadAttendanceHistory]);

    // Load data only on initial mount
    useEffect(() => {
        loadAttendanceHistory();
    }, [employeeId]);

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'present':
                return '#10B981';
            case 'absent':
                return '#EF4444';
            case 'work from home':
            case 'wfh':
                return '#6366F1';
            case 'on leave':
                return '#F59E0B';
            case 'holiday':
                return '#8B5CF6';
            case 'half day':
                return '#EC4899';
            default:
                return '#6B7280';
        }
    };

    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'present':
                return 'check-circle';
            case 'absent':
                return 'times-circle';
            case 'work from home':
            case 'wfh':
                return 'home';
            case 'on leave':
                return 'calendar-times';
            case 'holiday':
                return 'gift';
            case 'half day':
                return 'clock';
            default:
                return 'question-circle';
        }
    };

    const onStartDateChange = (event, selectedDate) => {
        setShowStartPicker(false);
        if (event.type === 'set' && selectedDate) {
            console.log('Start date selected:', formatDate(selectedDate));
            setStartDate(selectedDate);
        }
    };

    const onEndDateChange = (event, selectedDate) => {
        setShowEndPicker(false);
        if (event.type === 'set' && selectedDate) {
            console.log('End date selected:', formatDate(selectedDate));
            setEndDate(selectedDate);
        }
    };

    const renderAttendanceItem = ({ item }) => {
        const statusColor = getStatusColor(item.status);
        const statusIcon = getStatusIcon(item.status);
        
        return (
            <Card style={styles.attendanceCard}>
                <Card.Content>
                    <View style={styles.cardHeader}>
                        <View style={styles.dateSection}>
                            <Text style={styles.dateText}>
                                {formatDateTime(item.attendance_date)}
                            </Text>
                            <View style={styles.statusRow}>
                                <View style={[styles.statusChip, { backgroundColor: statusColor + '15' }]}>
                                    <Icon name={statusIcon} size={12} color={statusColor} />
                                    <Text style={[styles.statusText, { color: statusColor }]}>
                                        {item.status}
                                    </Text>
                                </View>
                                {item.work_mode && item.work_mode !== 'Office' && (
                                    <View style={[styles.workModeChip, { 
                                        backgroundColor: item.work_mode === 'Work From Home' ? '#EEF2FF' : '#F3F4F6' 
                                    }]}>
                                        <Icon 
                                            name={item.work_mode === 'Work From Home' ? 'home' : 'info-circle'} 
                                            size={10} 
                                            color={item.work_mode === 'Work From Home' ? '#4F46E5' : '#6B7280'} 
                                        />
                                        <Text style={[styles.workModeText, { 
                                            color: item.work_mode === 'Work From Home' ? '#4F46E5' : '#6B7280' 
                                        }]}>
                                            {item.work_mode}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                    
                    {/* Show description for holidays and leaves */}
                    {(item.type === 'holiday' || item.type === 'leave') && item.description && (
                        <View style={styles.descriptionSection}>
                            <Text style={styles.descriptionText}>{stripHtml(item.description)}</Text>
                            {item.leave_type && (
                                <Text style={styles.leaveTypeText}>Leave Type: {item.leave_type}</Text>
                            )}
                        </View>
                    )}
                    
                    {/* Show time section only for attendance records */}
                    {item.type === 'attendance' && (
                        <View style={styles.timeSection}>
                            <View style={styles.timeItem}>
                                <Icon name="sign-in-alt" size={14} color="#10B981" />
                                <Text style={styles.timeLabel}>Check In</Text>
                                <Text style={styles.timeValue}>{formatTime(item.check_in)}</Text>
                            </View>
                            
                            <View style={styles.timeItem}>
                                <Icon name="sign-out-alt" size={14} color="#EF4444" />
                                <Text style={styles.timeLabel}>Check Out</Text>
                                <Text style={styles.timeValue}>{formatTime(item.check_out)}</Text>
                            </View>
                        </View>
                    )}
                    
                    {/* Show working hours calculation */}
                    {(item.check_in && item.check_out) && (
                        <View style={styles.workingHoursSection}>
                            <Icon name="clock" size={12} color="#6B7280" />
                            <Text style={styles.workingHoursText}>
                                {(() => {
                                    try {
                                        const checkIn = new Date(item.check_in);
                                        const checkOut = new Date(item.check_out);
                                        const diffMs = checkOut.getTime() - checkIn.getTime();
                                        const hours = Math.floor(diffMs / (1000 * 60 * 60));
                                        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                                        return `Working Hours: ${hours}h ${minutes}m`;
                                    } catch {
                                        return 'Working Hours: --';
                                    }
                                })()}
                            </Text>
                        </View>
                    )}
                </Card.Content>
            </Card>
        );
    };

    const renderSummaryStats = () => (
        <Card style={styles.summaryCard}>
            <Card.Content style={styles.compactContent}>
                <View style={styles.summaryHeader}>
                    <Icon name="chart-bar" size={16} color={custom.palette.primary} />
                    <Text style={styles.summaryTitle}>Attendance Summary</Text>
                    <Text style={styles.summaryDateRange}>
                        {dateRange.start_date || 'N/A'} to {dateRange.end_date || 'N/A'}
                    </Text>
                </View>
                
                <View style={styles.compactStatsGrid}>
                    <View style={styles.compactStatItem}>
                        <Text style={styles.compactStatNumber}>{summaryStats.present_days || 0}</Text>
                        <Text style={styles.compactStatLabel}>Present</Text>
                    </View>
                    <View style={styles.compactStatItem}>
                        <Text style={styles.compactStatNumber}>{summaryStats.wfh_days || 0}</Text>
                        <Text style={styles.compactStatLabel}>WFH</Text>
                    </View>
                    <View style={styles.compactStatItem}>
                        <Text style={styles.compactStatNumber}>{summaryStats.leave_days || 0}</Text>
                        <Text style={styles.compactStatLabel}>Leave</Text>
                    </View>
                    <View style={styles.compactStatItem}>
                        <Text style={styles.compactStatNumber}>{summaryStats.holiday_days || 0}</Text>
                        <Text style={styles.compactStatLabel}>Holiday</Text>
                    </View>
                    <View style={styles.compactStatItem}>
                        <Text style={styles.compactStatNumber}>{summaryStats.absent_days || 0}</Text>
                        <Text style={styles.compactStatLabel}>Absent</Text>
                    </View>
                    <View style={styles.compactStatItem}>
                        <Text style={styles.compactStatNumber}>{summaryStats.attendance_percentage || 0}%</Text>
                        <Text style={styles.compactStatLabel}>Rate</Text>
                    </View>
                </View>
                
                {/* Working Hours Section */}
                {summaryStats.total_working_hours > 0 && (
                    <View style={styles.workingHoursRow}>
                        <View style={styles.hoursItem}>
                            <Text style={styles.hoursValue}>{summaryStats.total_working_hours || 0}h</Text>
                            <Text style={styles.hoursLabel}>Total Hours</Text>
                        </View>
                        <View style={styles.hoursItem}>
                            <Text style={styles.hoursValue}>{summaryStats.avg_working_hours || 0}h</Text>
                            <Text style={styles.hoursLabel}>Avg/Day</Text>
                        </View>
                    </View>
                )}
            </Card.Content>
        </Card>
    );

    if (loading) {
        return <Loading />;
    }

    return (
        <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
            {/* Date Range Selector */}
            <Card style={styles.compactDateCard}>
                <Card.Content style={styles.compactContent}>
                    <View style={styles.dateRow}>
                        <TouchableOpacity 
                            style={styles.compactDateButton}
                            onPress={() => setShowStartPicker(true)}
                        >
                            <Icon name="calendar" size={12} color={custom.palette.primary} />
                            <Text style={styles.compactDateButtonText}>From: {formatDate(startDate)}</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={styles.compactDateButton}
                            onPress={() => setShowEndPicker(true)}
                        >
                            <Icon name="calendar" size={12} color={custom.palette.primary} />
                            <Text style={styles.compactDateButtonText}>To: {formatDate(endDate)}</Text>
                        </TouchableOpacity>
                    </View>
                    
                    <Button 
                        onPress={loadAttendanceHistory}
                        style={styles.compactLoadButton}
                        disabled={loading}
                        icon="sync"
                        mode="contained"
                        compact
                    >
                        Load
                    </Button>
                </Card.Content>
            </Card>

            {/* Summary Stats */}
            {Object.keys(summaryStats).length > 0 && renderSummaryStats()}

            {/* Attendance List */}
            <View style={styles.listContainer}>
                <Text style={styles.listTitle}>
                    Attendance Records ({attendanceData.length})
                </Text>
                
                <FlatList
                    data={attendanceData}
                    renderItem={renderAttendanceItem}
                    keyExtractor={(item, index) => item.name || `${item.attendance_date}_${index}`}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={[custom.palette.primary]}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Icon name="calendar-times" size={48} color="#9CA3AF" />
                            <Text style={styles.emptyTitle}>No Records Found</Text>
                            <Text style={styles.emptySubtitle}>
                                No attendance records found for the selected date range
                            </Text>
                        </View>
                    }
                />
            </View>

            {/* Date Pickers */}
            {showStartPicker && (
                <DateTimePicker
                    value={startDate}
                    mode="date"
                    display="default"
                    onChange={onStartDateChange}
                    maximumDate={endDate}
                />
            )}
            
            {showEndPicker && (
                <DateTimePicker
                    value={endDate}
                    mode="date"
                    display="default"
                    onChange={onEndDateChange}
                    minimumDate={startDate}
                    maximumDate={new Date()}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    dateCard: {
        margin: 16,
        marginBottom: 8,
        backgroundColor: '#FFF',
        borderRadius: 12,
        elevation: 2,
    },
    dateRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        flex: 0.48,
    },
    dateButtonText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#374151',
        fontWeight: '500',
    },
    quickDateRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    quickDateButton: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 6,
        flex: 0.32,
        alignItems: 'center',
    },
    quickDateText: {
        fontSize: 12,
        color: '#4F46E5',
        fontWeight: '600',
    },
    loadButton: {
        marginTop: 8,
    },
    summaryCard: {
        margin: 12,
        marginTop: 6,
        marginBottom: 6,
        backgroundColor: '#FFF',
        borderRadius: 8,
        elevation: 1,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 16,
    },
    statItem: {
        alignItems: 'center',
    },
    statNumber: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1F2937',
    },
    statLabel: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
    hoursSection: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
    },
    hoursText: {
        fontSize: 14,
        color: '#374151',
        fontWeight: '600',
    },
    avgHoursText: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
    listContainer: {
        flex: 1,
        margin: 12,
        marginTop: 6,
    },
    listTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1F2937',
        marginBottom: 8,
    },
    listContent: {
        paddingBottom: 20,
    },
    attendanceCard: {
        marginBottom: 12,
        backgroundColor: '#FFF',
        borderRadius: 12,
        elevation: 1,
    },
    cardHeader: {
        marginBottom: 12,
    },
    dateSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    dateText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        flex: 1,
    },
    statusRow: {
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
    },
    statusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
    workModeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    workModeText: {
        fontSize: 10,
        fontWeight: '500',
        marginLeft: 4,
    },
    descriptionSection: {
        marginBottom: 12,
        padding: 8,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
    },
    descriptionText: {
        fontSize: 13,
        color: '#374151',
        marginBottom: 4,
    },
    leaveTypeText: {
        fontSize: 12,
        color: '#6B7280',
        fontStyle: 'italic',
    },
    timeSection: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 12,
        paddingVertical: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
    },
    timeItem: {
        alignItems: 'center',
        flex: 1,
    },
    timeLabel: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
        marginBottom: 2,
    },
    timeValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1F2937',
    },
    workingHoursSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    workingHoursText: {
        fontSize: 13,
        color: '#374151',
        marginLeft: 8,
        flex: 1,
    },
    lateChip: {
        backgroundColor: '#FEF3C7',
        borderColor: '#F59E0B',
    },
    lateChipText: {
        fontSize: 10,
        color: '#92400E',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#374151',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
    },
    
    // Compact styles for better space utilization
    compactDateCard: {
        margin: 12,
        marginBottom: 6,
        backgroundColor: '#FFF',
        borderRadius: 8,
        elevation: 1,
    },
    compactContent: {
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    compactDateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 6,
        flex: 0.48,
    },
    compactDateButtonText: {
        marginLeft: 6,
        fontSize: 12,
        color: '#374151',
        fontWeight: '500',
    },
    compactLoadButton: {
        marginTop: 6,
        height: 36,
    },
    summaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    summaryTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1F2937',
        marginLeft: 6,
        flex: 1,
    },
    summaryDateRange: {
        fontSize: 10,
        color: '#6B7280',
    },
    compactStatsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    compactStatItem: {
        alignItems: 'center',
        flex: 1,
    },
    compactStatNumber: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1F2937',
    },
    compactStatLabel: {
        fontSize: 10,
        color: '#6B7280',
        marginTop: 2,
    },
    workingHoursRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    hoursItem: {
        alignItems: 'center',
        flex: 1,
    },
    hoursValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#059669',
    },
    hoursLabel: {
        fontSize: 10,
        color: '#6B7280',
        marginTop: 2,
    },
});

export default AttendanceHistoryScreen;