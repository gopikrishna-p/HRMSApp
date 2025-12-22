import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  useTheme,
  ActivityIndicator,
  Chip,
  Divider,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import StandupService from '../../services/standup.service';

const AdminDepartmentStandupScreen = ({ navigation }) => {
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [departmentData, setDepartmentData] = useState(null);
  const [selectedDept, setSelectedDept] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [sortBy, setSortBy] = useState('completion');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const fetchDepartmentSummary = useCallback(async () => {
    setLoading(true);
    try {
      const result = await StandupService.getDepartmentStandupSummary(
        dateRange.startDate,
        dateRange.endDate,
        null // Get summary for all departments or current selected
      );

      console.log('📊 Department summary:', result);

      // Handle different response structures from API
      let deptSummary = {};
      
      if (result?.data?.employee_summary) {
        // Single department response structure from API docs
        // Response has: { department, from_date, to_date, employee_summary: [...], department_statistics }
        const deptData = result.data;
        deptSummary[deptData.department] = {
          department: deptData.department,
          employees: (deptData.employee_summary || []).map(emp => ({
            name: emp.employee,
            employee: emp.employee,
            employee_name: emp.employee_name,
            designation: emp.designation,
            total_tasks: emp.total_tasks || 0,
            completed_tasks: emp.completed_tasks || 0,
            completion_rate: emp.completion_rate || 0,
            tasks: emp.tasks || [],
          })),
          totalTasks: deptData.department_statistics?.total_tasks || 0,
          completedTasks: deptData.department_statistics?.completed_tasks || 0,
        };
      } else if (Array.isArray(result?.data)) {
        // Array of employees or departments response
        const dataList = result.data;
        if (dataList.length > 0 && dataList[0].department) {
          // Array of employees grouped by department
          dataList.forEach(item => {
            if (!deptSummary[item.department]) {
              deptSummary[item.department] = {
                department: item.department,
                employees: [],
                totalTasks: 0,
                completedTasks: 0,
              };
            }
            deptSummary[item.department].employees.push(item);
            deptSummary[item.department].totalTasks += item.total_tasks || 0;
            deptSummary[item.department].completedTasks += item.completed_tasks || 0;
          });
        }
      }

      const deptList = Object.values(deptSummary);
      console.log('✅ Processed departments:', deptList);
      
      setDepartments(deptList);
      setDepartmentData(deptList);

      if (deptList.length > 0 && !selectedDept) {
        setSelectedDept(deptList[0]);
      }
    } catch (error) {
      console.error('❌ Error fetching department summary:', error);
      Alert.alert('Error', 'Failed to load department data');
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedDept]);

  useEffect(() => {
    fetchDepartmentSummary();
  }, [fetchDepartmentSummary]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDepartmentSummary();
    setRefreshing(false);
  }, [fetchDepartmentSummary]);

  const getCompletionPercentage = (completed, total) => {
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  const getSortedEmployees = (employees) => {
    const sorted = [...employees];
    if (sortBy === 'completion') {
      return sorted.sort(
        (a, b) =>
          getCompletionPercentage(b.completed_tasks, b.total_tasks) -
          getCompletionPercentage(a.completed_tasks, a.total_tasks)
      );
    } else if (sortBy === 'name') {
      return sorted.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
    }
    return sorted;
  };

  const renderDepartmentTab = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.deptTab,
        selectedDept?.department === item.department && styles.deptTabActive,
        {
          borderBottomColor:
            selectedDept?.department === item.department
              ? custom.palette.primary
              : '#E5E7EB',
        },
      ]}
      onPress={() => setSelectedDept(item)}
    >
      <Text
        style={[
          styles.deptTabText,
          selectedDept?.department === item.department && {
            color: custom.palette.primary,
            fontWeight: '700',
          },
        ]}
      >
        {item.department}
      </Text>
      <Text
        style={[
          styles.deptTabBadge,
          selectedDept?.department === item.department && {
            backgroundColor: custom.palette.primary,
            color: '#FFF',
          },
        ]}
      >
        {item.employees?.length || 0}
      </Text>
    </TouchableOpacity>
  );

  const renderEmployeeItem = ({ item }) => {
    const completion = getCompletionPercentage(item.completed_tasks, item.total_tasks);
    const statusColor =
      completion >= 80 ? '#10B981' : completion >= 50 ? '#F59E0B' : '#EF4444';

    return (
      <ListItem
        title={item.employee_name}
        subtitle={`${item.completed_tasks}/${item.total_tasks} tasks`}
        leftIcon="user"
        tint={custom.palette.primary}
        rightContent={
          <View style={styles.employeeStatus}>
            <View
              style={[
                styles.completionBadge,
                { borderColor: statusColor },
              ]}
            >
              <Text style={[styles.completionText, { color: statusColor }]}>
                {completion}%
              </Text>
            </View>
          </View>
        }
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="inbox" size={48} color="#D1D5DB" />
      <Text style={styles.emptyText}>No department data</Text>
      <Text style={styles.emptySubtext}>Try adjusting the date range</Text>
    </View>
  );

  if (loading && !departmentData) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="Department Summary"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading department data...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <AppHeader
        title="Department Summary"
        canGoBack={true}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[custom.palette.primary]}
          />
        }
      >
        {/* Department Tabs */}
        {departments.length > 0 && (
          <View style={styles.deptTabsContainer}>
            <FlatList
              data={departments}
              renderItem={renderDepartmentTab}
              keyExtractor={item => item.department}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.deptTabsList}
            />
          </View>
        )}

        {/* Overall Statistics */}
        {selectedDept && (
          <Section title="Department Statistics" icon="chart-bar" tint={custom.palette.primary}>
            <View style={styles.statsBox}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Icon name="users" size={18} color={custom.palette.primary} />
                  <Text style={styles.statValue}>{selectedDept.employees?.length || 0}</Text>
                  <Text style={styles.statLabel}>Employees</Text>
                </View>
                <Divider style={{ height: 50, width: 1 }} />
                <View style={styles.statItem}>
                  <Icon name="tasks" size={18} color="#8B5CF6" />
                  <Text style={[styles.statValue, { color: '#8B5CF6' }]}>
                    {selectedDept.totalTasks}
                  </Text>
                  <Text style={styles.statLabel}>Total Tasks</Text>
                </View>
                <Divider style={{ height: 50, width: 1 }} />
                <View style={styles.statItem}>
                  <Icon name="check-circle" size={18} color="#10B981" />
                  <Text style={[styles.statValue, { color: '#10B981' }]}>
                    {selectedDept.completedTasks}
                  </Text>
                  <Text style={styles.statLabel}>Completed</Text>
                </View>
              </View>

              {/* Completion Rate */}
              <View style={styles.completionRateContainer}>
                <View style={styles.rateHeader}>
                  <Text style={styles.rateLabel}>Department Completion Rate</Text>
                  <Chip
                    style={{
                      backgroundColor:
                        getCompletionPercentage(
                          selectedDept.completedTasks,
                          selectedDept.totalTasks
                        ) >= 80
                          ? '#D1FAE5'
                          : '#FEF3C7',
                    }}
                    textStyle={{
                      color:
                        getCompletionPercentage(
                          selectedDept.completedTasks,
                          selectedDept.totalTasks
                        ) >= 80
                          ? '#065F46'
                          : '#92400E',
                      fontWeight: '600',
                    }}
                  >
                    {getCompletionPercentage(
                      selectedDept.completedTasks,
                      selectedDept.totalTasks
                    )}
                    %
                  </Chip>
                </View>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${getCompletionPercentage(
                          selectedDept.completedTasks,
                          selectedDept.totalTasks
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          </Section>
        )}

        {/* Employees List */}
        {selectedDept && selectedDept.employees && selectedDept.employees.length > 0 && (
          <Section title="Employees" icon="user-friends" tint={custom.palette.primary}>
            {/* Sort Options */}
            <View style={styles.sortContainer}>
              <Text style={styles.sortLabel}>Sort by:</Text>
              <View style={styles.sortChips}>
                <Chip
                  selected={sortBy === 'completion'}
                  onPress={() => setSortBy('completion')}
                  style={[
                    styles.sortChip,
                    sortBy === 'completion' && {
                      backgroundColor: custom.palette.primary,
                    },
                  ]}
                  textStyle={sortBy === 'completion' ? { color: '#FFF' } : {}}
                >
                  Completion
                </Chip>
                <Chip
                  selected={sortBy === 'name'}
                  onPress={() => setSortBy('name')}
                  style={[
                    styles.sortChip,
                    sortBy === 'name' && {
                      backgroundColor: custom.palette.primary,
                    },
                  ]}
                  textStyle={sortBy === 'name' ? { color: '#FFF' } : {}}
                >
                  Name
                </Chip>
              </View>
            </View>

            <FlatList
              data={getSortedEmployees(selectedDept.employees)}
              renderItem={renderEmployeeItem}
              keyExtractor={item => item.name}
              scrollEnabled={false}
            />
          </Section>
        )}

        {(!selectedDept || !selectedDept.employees || selectedDept.employees.length === 0) && (
          renderEmptyState()
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
  },
  deptTabsContainer: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  deptTabsList: {
    paddingHorizontal: 16,
  },
  deptTab: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginRight: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deptTabActive: {
    borderBottomColor: '#3B82F6',
  },
  deptTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  deptTabBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statsBox: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  completionRateContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  rateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rateLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  sortContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    marginBottom: 8,
    borderRadius: 8,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  sortChips: {
    flexDirection: 'row',
    gap: 8,
  },
  sortChip: {
    backgroundColor: '#FFF',
    borderColor: '#E5E7EB',
    borderWidth: 1,
  },
  employeeStatus: {
    alignItems: 'flex-end',
  },
  completionBadge: {
    width: 50,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});

export default AdminDepartmentStandupScreen;
