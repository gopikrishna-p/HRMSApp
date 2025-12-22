import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList } from 'react-native';
import { Text, Card, useTheme, ActivityIndicator, Button, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const AdminDepartmentStandupScreen = ({ navigation }) => {
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState(null);
  const [summary, setSummary] = useState(null);
  const [dateRange, setDateRange] = useState('week');

  const availableDepts = [
    'Software - DS',
    'HR',
    'Finance',
    'Operations',
    'Sales',
    'Marketing',
  ];

  const fetchDepartmentSummary = useCallback(
    async (dept) => {
      if (!dept) return;

      setLoading(true);
      try {
        const today = new Date();
        let fromDate;

        if (dateRange === 'week') {
          fromDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else {
          fromDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const formatDateStr = (date) => date.toISOString().split('T')[0];
        const result = await StandupService.getDepartmentStandupSummary(
          dept,
          formatDateStr(fromDate),
          formatDateStr(today)
        );

        if (result?.data) {
          setSummary(result.data);
        }
      } catch (error) {
        console.error('Error:', error);
        Alert.alert('Error', 'Failed to load department summary');
      } finally {
        setLoading(false);
      }
    },
    [dateRange]
  );

  useEffect(() => {
    if (selectedDept) {
      fetchDepartmentSummary(selectedDept);
    }
  }, [selectedDept, dateRange, fetchDepartmentSummary]);

  const renderEmployeeItem = ({ item }) => (
    <Card style={styles.employeeCard}>
      <Card.Content>
        {/* Employee Info */}
        <View style={styles.employeeHeader}>
          <View>
            <Text style={styles.employeeName}>{item.employee_name}</Text>
            <Text style={styles.designation}>{item.designation}</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Tasks</Text>
            <Text style={styles.statValue}>{item.total_tasks}</Text>
          </View>

          <View style={styles.stat}>
            <Text style={styles.statLabel}>Completed</Text>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{item.completed_tasks}</Text>
          </View>

          <View style={styles.stat}>
            <Text style={styles.statLabel}>Completion Rate</Text>
            <Text style={[styles.statValue, { color: custom.palette.primary }]}>
              {item.completion_rate}%
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${item.completion_rate}%`,
                backgroundColor: item.completion_rate >= 80 ? '#10B981' : custom.palette.primary,
              },
            ]}
          />
        </View>

        {/* Recent Tasks */}
        {item.tasks && item.tasks.length > 0 && (
          <View style={styles.tasksSection}>
            <Text style={styles.tasksSectionTitle}>Recent Tasks</Text>
            {item.tasks.slice(0, 2).map((task, idx) => (
              <View key={idx} style={styles.taskItem}>
                <Text style={styles.taskDate}>{formatDate(task.standup_date)}</Text>
                <Text style={styles.taskTitle} numberOfLines={1}>
                  {task.task_title}
                </Text>
                <Chip
                  size={12}
                  style={{
                    backgroundColor: task.task_status === 'Completed' ? '#D1FAE5' : '#FEF3C7',
                    marginTop: 4,
                  }}
                  textStyle={{
                    color: task.task_status === 'Completed' ? '#065F46' : '#92400E',
                    fontSize: 9,
                  }}
                >
                  {task.task_status}
                </Chip>
              </View>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: custom.palette.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Icon name="sitemap" size={24} color={custom.palette.primary} />
        <Text style={styles.headerTitle}>Department Standups</Text>
      </View>

      {/* Department Selection */}
      <Card style={styles.deptCard}>
        <Card.Content>
          <Text style={styles.label}>Select Department</Text>
          <View style={styles.deptButtonsGrid}>
            {availableDepts.map((dept) => (
              <Button
                key={dept}
                mode={selectedDept === dept ? 'contained' : 'outlined'}
                onPress={() => setSelectedDept(dept)}
                style={styles.deptButton}
                labelStyle={{ fontSize: 11 }}
              >
                {dept}
              </Button>
            ))}
          </View>
        </Card.Content>
      </Card>

      {selectedDept && (
        <>
          {/* Date Range Filter */}
          <View style={styles.dateFilterRow}>
            <Button
              mode={dateRange === 'week' ? 'contained' : 'outlined'}
              onPress={() => setDateRange('week')}
              style={styles.dateButton}
              labelStyle={{ fontSize: 11 }}
            >
              Last 7 Days
            </Button>
            <Button
              mode={dateRange === 'month' ? 'contained' : 'outlined'}
              onPress={() => setDateRange('month')}
              style={styles.dateButton}
              labelStyle={{ fontSize: 11 }}
            >
              Last 30 Days
            </Button>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={custom.palette.primary} />
            </View>
          ) : summary ? (
            <>
              {/* Department Stats */}
              {summary.department_statistics && (
                <View style={styles.statsGrid}>
                  <Card style={styles.statCard}>
                    <Card.Content>
                      <Text style={styles.statNumber}>
                        {summary.department_statistics.total_employees}
                      </Text>
                      <Text style={styles.statName}>Employees</Text>
                    </Card.Content>
                  </Card>

                  <Card style={styles.statCard}>
                    <Card.Content>
                      <Text style={[styles.statNumber, { color: '#10B981' }]}>
                        {summary.department_statistics.completed_tasks}
                      </Text>
                      <Text style={styles.statName}>Completed</Text>
                    </Card.Content>
                  </Card>

                  <Card style={styles.statCard}>
                    <Card.Content>
                      <Text style={[styles.statNumber, { color: custom.palette.primary }]}>
                        {summary.department_statistics.overall_completion_rate}%
                      </Text>
                      <Text style={styles.statName}>Overall</Text>
                    </Card.Content>
                  </Card>
                </View>
              )}

              {/* Employees List */}
              {summary.employee_summary && summary.employee_summary.length > 0 ? (
                <>
                  <Text style={styles.employeesTitle}>
                    Team Members ({summary.employee_summary.length})
                  </Text>
                  <FlatList
                    data={summary.employee_summary}
                    renderItem={renderEmployeeItem}
                    keyExtractor={(item) => item.employee}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                  />
                </>
              ) : (
                <Card style={styles.emptyCard}>
                  <Card.Content>
                    <Text style={styles.emptyText}>No data available for this department</Text>
                  </Card.Content>
                </Card>
              )}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  deptCard: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  deptButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  deptButton: {
    width: '48%',
    marginBottom: 8,
  },
  dateFilterRow: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  dateButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    marginHorizontal: 4,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6366F1',
  },
  statName: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
  },
  employeesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  employeeCard: {
    marginBottom: 8,
  },
  employeeHeader: {
    marginBottom: 12,
  },
  employeeName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  designation: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  progressContainer: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
  },
  tasksSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  tasksSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  taskItem: {
    marginBottom: 8,
  },
  taskDate: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  taskTitle: {
    fontSize: 11,
    color: '#111827',
    marginVertical: 2,
  },
  separator: {
    height: 4,
  },
  emptyCard: {
    marginVertical: 32,
  },
  emptyText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});

export default AdminDepartmentStandupScreen;
