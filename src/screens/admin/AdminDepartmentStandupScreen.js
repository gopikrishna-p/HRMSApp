import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  RefreshControl,
  FlatList,
  TouchableOpacity,
  SectionList,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  useTheme,
  ActivityIndicator,
  Card,
  Chip,
  Divider,
  SegmentedButtons,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const AdminDepartmentStandupScreen = ({ navigation, route }) => {
  const { custom } = useTheme();
  const { department } = route.params || {};

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [selectedDepartment, setSelectedDepartment] = useState(department || '');
  const [dateRange, setDateRange] = useState('7days');
  const [departments, setDepartments] = useState([]);
  const [sortBy, setSortBy] = useState('completion'); // completion, name

  // Calculate date range
  const getDateRange = useCallback(() => {
    const today = new Date();
    let fromDate = new Date();

    switch (dateRange) {
      case '7days':
        fromDate.setDate(today.getDate() - 7);
        break;
      case '30days':
        fromDate.setDate(today.getDate() - 30);
        break;
      case 'today':
        fromDate = new Date(today);
        break;
      default:
        fromDate.setDate(today.getDate() - 7);
    }

    return {
      from_date: fromDate.toISOString().split('T')[0],
      to_date: today.toISOString().split('T')[0],
    };
  }, [dateRange]);

  // Fetch department summary
  const fetchDepartmentSummary = useCallback(async () => {
    if (!selectedDepartment) {
      Alert.alert('Error', 'Please select a department');
      return;
    }

    setLoading(true);
    try {
      const dateParams = getDateRange();
      const result = await StandupService.getDepartmentStandupSummary(
        selectedDepartment,
        dateParams.from_date,
        dateParams.to_date
      );

      console.log('📊 Department summary fetched:', result);
      setSummary(result.data || result);
    } catch (error) {
      console.error('❌ Error fetching summary:', error);
      Alert.alert('Error', 'Failed to load summary: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [selectedDepartment, getDateRange]);

  // Fetch available departments
  const fetchDepartments = useCallback(async () => {
    try {
      // This would normally come from an API or storage
      // For now, we'll use common department names
      const commonDepts = ['Software - DS', 'HR', 'Finance', 'Operations', 'Sales'];
      setDepartments(commonDepts);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
    if (selectedDepartment) {
      fetchDepartmentSummary();
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDepartmentSummary();
    setRefreshing(false);
  }, [fetchDepartmentSummary]);

  // Sort employee summary
  const getSortedEmployees = useCallback(() => {
    if (!summary?.employee_summary) return [];

    const employees = [...summary.employee_summary];
    if (sortBy === 'completion') {
      return employees.sort((a, b) => b.completion_rate - a.completion_rate);
    } else {
      return employees.sort((a, b) =>
        a.employee.localeCompare(b.employee)
      );
    }
  }, [summary, sortBy])();

  // Render employee card
  const renderEmployeeCard = ({ item: employee }) => (
    <Card
      style={[
        styles.employeeCard,
        { backgroundColor: custom.palette.surface },
      ]}
    >
      <Card.Content>
        {/* Employee Header */}
        <View style={styles.employeeHeader}>
          <View style={styles.employeeInfo}>
            <Text style={styles.employeeName}>{employee.employee}</Text>
            <Text style={styles.employeeDesignation}>
              {employee.designation}
            </Text>
          </View>
          <View style={styles.completionBadge}>
            <Text style={styles.completionValue}>
              {employee.completion_rate}%
            </Text>
            <View
              style={[
                styles.completionIndicator,
                {
                  backgroundColor:
                    employee.completion_rate >= 80
                      ? '#10B981'
                      : employee.completion_rate >= 50
                      ? '#F59E0B'
                      : '#EF4444',
                },
              ]}
            />
          </View>
        </View>

        <Divider style={styles.divider} />

        {/* Task Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Icon
              name="tasks"
              size={14}
              color={custom.palette.primary}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.statText}>
              {employee.total_tasks} Total
            </Text>
          </View>

          <View style={styles.stat}>
            <Icon
              name="check-circle"
              size={14}
              color="#10B981"
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.statText, { color: '#10B981' }]}>
              {employee.completed_tasks} Done
            </Text>
          </View>

          <View style={styles.stat}>
            <Icon
              name="hourglass-half"
              size={14}
              color="#F59E0B"
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.statText, { color: '#F59E0B' }]}>
              {employee.total_tasks - employee.completed_tasks} Pending
            </Text>
          </View>
        </View>

        {/* Tasks Preview */}
        {employee.tasks && employee.tasks.length > 0 && (
          <>
            <Divider style={[styles.divider, { marginVertical: 8 }]} />
            <View style={styles.tasksPreview}>
              <Text style={styles.tasksLabel}>Recent Tasks:</Text>
              {employee.tasks.slice(0, 3).map((task, idx) => (
                <View key={idx} style={styles.taskItem}>
                  <View style={styles.taskIndicator}>
                    <Icon
                      name={
                        task.task_status === 'Completed'
                          ? 'check'
                          : 'circle'
                      }
                      size={10}
                      color={
                        task.task_status === 'Completed'
                          ? '#10B981'
                          : custom.palette.primary
                      }
                    />
                  </View>
                  <View style={styles.taskInfo}>
                    <Text
                      style={styles.taskTitle}
                      numberOfLines={1}
                    >
                      {task.task_title}
                    </Text>
                    <Text style={styles.taskDate}>
                      {formatDate(task.standup_date)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.progressBadge,
                      {
                        backgroundColor:
                          task.completion_percentage >= 80
                            ? '#D1FAE5'
                            : task.completion_percentage >= 50
                            ? '#FEF3C7'
                            : '#FEE2E2',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.progressText,
                        {
                          color:
                            task.completion_percentage >= 80
                              ? '#065F46'
                              : task.completion_percentage >= 50
                              ? '#92400E'
                              : '#7F1D1D',
                        },
                      ]}
                    >
                      {task.completion_percentage}%
                    </Text>
                  </View>
                </View>
              ))}
              {employee.tasks.length > 3 && (
                <Text style={styles.moreText}>
                  +{employee.tasks.length - 3} more tasks
                </Text>
              )}
            </View>
          </>
        )}
      </Card.Content>
    </Card>
  );

  if (!selectedDepartment) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="Department Standup Summary"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />

        <ScrollView style={styles.container}>
          <View style={styles.selectContainer}>
            <Text style={styles.selectLabel}>Select Department:</Text>
            <View style={styles.departmentGrid}>
              {departments.map(dept => (
                <TouchableOpacity
                  key={dept}
                  style={[
                    styles.deptButton,
                    selectedDepartment === dept &&
                    styles.deptButtonActive,
                  ]}
                  onPress={() => {
                    setSelectedDepartment(dept);
                  }}
                >
                  <Text
                    style={[
                      styles.deptButtonText,
                      selectedDepartment === dept &&
                      styles.deptButtonTextActive,
                    ]}
                  >
                    {dept}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              mode="contained"
              onPress={fetchDepartmentSummary}
              disabled={!selectedDepartment}
              loading={loading}
              style={styles.loadButton}
              buttonColor={custom.palette.primary}
            >
              Load Summary
            </Button>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (loading && !summary) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="Department Standup Summary"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>
            Loading summary...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <AppHeader
        title={`${selectedDepartment} - Standup Summary`}
        canGoBack={true}
        onBack={() => {
          setSelectedDepartment('');
          setSummary(null);
          navigation.goBack();
        }}
      />

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[custom.palette.primary]}
          />
        }
        style={styles.container}
      >
        {/* Date Range & Filters */}
        <View style={styles.filtersContainer}>
          <Text style={styles.filterLabel}>Date Range</Text>
          <SegmentedButtons
            value={dateRange}
            onValueChange={setDateRange}
            buttons={[
              { value: 'today', label: 'Today' },
              { value: '7days', label: '7 Days' },
              { value: '30days', label: '30 Days' },
            ]}
            style={styles.segmentedButtons}
          />

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Sort By</Text>
            <SegmentedButtons
              value={sortBy}
              onValueChange={setSortBy}
              buttons={[
                { value: 'completion', label: 'Completion' },
                { value: 'name', label: 'Name' },
              ]}
              style={styles.sortButtons}
            />
          </View>
        </View>

        {/* Department Statistics */}
        {summary?.department_statistics && (
          <View style={[styles.statsCard, { backgroundColor: '#ECFDF5' }]}>
            <Text style={[styles.statsTitle, { color: '#065F46' }]}>
              📊 Department Statistics
            </Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>
                  {summary.department_statistics.total_employees}
                </Text>
                <Text style={styles.statLabel}>Employees</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>
                  {summary.department_statistics.total_tasks}
                </Text>
                <Text style={styles.statLabel}>Total Tasks</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statNumber, { color: '#10B981' }]}>
                  {summary.department_statistics.completed_tasks}
                </Text>
                <Text style={styles.statLabel}>Completed</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statNumber, { color: '#3B82F6' }]}>
                  {summary.department_statistics.overall_completion_rate}%
                </Text>
                <Text style={styles.statLabel}>Overall Comp.</Text>
              </View>
            </View>
          </View>
        )}

        {/* Date Range Info */}
        <View style={styles.dateInfoContainer}>
          <Icon
            name="calendar-alt"
            size={14}
            color="#6B7280"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.dateInfoText}>
            {summary?.from_date} to {summary?.to_date}
          </Text>
        </View>

        {/* Employees List */}
        <View style={styles.employeesSection}>
          <Text style={styles.sectionTitle}>
            👥 Employees ({getSortedEmployees.length})
          </Text>

          {getSortedEmployees.length > 0 ? (
            <FlatList
              data={getSortedEmployees}
              renderItem={renderEmployeeCard}
              keyExtractor={item => item.employee}
              scrollEnabled={false}
              contentContainerStyle={styles.listContainer}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Icon
                name="inbox"
                size={48}
                color="#D1D5DB"
              />
              <Text style={styles.emptyText}>No employee data found</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  selectContainer: {
    paddingVertical: 32,
  },
  selectLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  departmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  deptButton: {
    flex: 1,
    minWidth: '48%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
  },
  deptButtonActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#3B82F6',
  },
  deptButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  deptButtonTextActive: {
    color: '#1E40AF',
  },
  loadButton: {
    marginTop: 16,
  },
  filtersContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  segmentedButtons: {
    marginBottom: 12,
  },
  filterRow: {
    marginTop: 12,
  },
  sortButtons: {
    marginTop: 8,
  },
  statsCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  statsTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#065F46',
  },
  statLabel: {
    fontSize: 11,
    color: '#059669',
    marginTop: 4,
  },
  dateInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 16,
  },
  dateInfoText: {
    fontSize: 12,
    color: '#6B7280',
  },
  employeesSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  listContainer: {
    paddingBottom: 20,
  },
  employeeCard: {
    marginBottom: 12,
    borderRadius: 8,
    elevation: 2,
  },
  employeeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  employeeDesignation: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  completionBadge: {
    alignItems: 'center',
  },
  completionValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  completionIndicator: {
    width: 24,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
  },
  divider: {
    marginVertical: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  tasksPreview: {
    paddingVertical: 8,
  },
  tasksLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskIndicator: {
    marginRight: 8,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  taskDate: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  progressBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  moreText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
  },
});

export default AdminDepartmentStandupScreen;
