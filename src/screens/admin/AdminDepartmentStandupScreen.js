import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { Text, useTheme, Button, ActivityIndicator, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const AdminDepartmentStandupScreen = ({ navigation }) => {
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [selectedDept, setSelectedDept] = useState(null);
  const [summary, setSummary] = useState(null);
  const [dateRange, setDateRange] = useState('week');
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = useCallback(async () => {
    if (selectedDept) {
      setRefreshing(true);
      await fetchDepartmentSummary(selectedDept);
      setRefreshing(false);
    }
  }, [selectedDept, fetchDepartmentSummary]);

  const renderEmployeeItem = ({ item }) => (
    <View style={styles.employeeCard}>
      <View style={styles.employeeHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.employeeName}>{item.employee_name}</Text>
          <Text style={styles.designation}>{item.designation}</Text>
        </View>
        <Chip
          icon={item.completion_rate >= 50 ? 'check' : 'alert'}
          style={{
            backgroundColor: item.completion_rate >= 50 ? '#D1FAE5' : '#FEF3C7',
          }}
          textStyle={{
            color: item.completion_rate >= 50 ? '#059669' : '#92400E',
            fontWeight: '600',
          }}
          mode="flat"
          size="small"
        >
          {item.completion_rate}%
        </Chip>
      </View>

      <View style={styles.progressBar}>
        <View 
          style={[
            styles.progressFill,
            { 
              width: `${item.completion_rate}%`,
              backgroundColor: item.completion_rate >= 50 ? '#10B981' : '#F59E0B'
            }
          ]}
        />
      </View>

      {item.recent_tasks && item.recent_tasks.length > 0 && (
        <View style={styles.recentTasks}>
          <Text style={styles.recentTasksLabel}>Recent</Text>
          <Text style={styles.recentTasksText} numberOfLines={2}>
            {item.recent_tasks[0]}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <AppHeader 
        title="Department Standups"
        canGoBack={true}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Date Range Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Date Range</Text>
          <View style={styles.filterButtons}>
            <Button
              mode={dateRange === 'week' ? 'contained' : 'outlined'}
              onPress={() => setDateRange('week')}
              style={styles.dateFilterBtn}
              labelStyle={{ fontSize: 12 }}
              compact
            >
              7 Days
            </Button>
            <Button
              mode={dateRange === 'month' ? 'contained' : 'outlined'}
              onPress={() => setDateRange('month')}
              style={styles.dateFilterBtn}
              labelStyle={{ fontSize: 12 }}
              compact
            >
              30 Days
            </Button>
          </View>
        </View>

        {/* Department Selection */}
        <View style={styles.deptSelectionCard}>
          <Text style={styles.deptSelectionLabel}>Select Department</Text>
          <View style={styles.deptButtonsGrid}>
            {availableDepts.map((dept) => (
              <Button
                key={dept}
                mode={selectedDept === dept ? 'contained' : 'outlined'}
                onPress={() => setSelectedDept(dept)}
                style={styles.deptButton}
                labelStyle={{ fontSize: 10 }}
                compact
              >
                {dept}
              </Button>
            ))}
          </View>
        </View>

        {/* Summary Section */}
        {selectedDept && (
          <>
            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={custom.palette.primary} />
                <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading summary...</Text>
              </View>
            ) : summary ? (
              <>
                {/* Statistics Cards */}
                <View style={styles.statsGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>{summary.total_employees}</Text>
                    <Text style={styles.statName}>Employees</Text>
                  </View>

                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>{summary.submitted_count}</Text>
                    <Text style={styles.statName}>Submitted</Text>
                  </View>

                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>{summary.avg_completion}%</Text>
                    <Text style={styles.statName}>Avg Progress</Text>
                  </View>
                </View>

                {/* Employee List */}
                <View style={styles.employeeListSection}>
                  <Text style={styles.listTitle}>Team Performance</Text>
                  <FlatList
                    data={summary.employees || []}
                    renderItem={renderEmployeeItem}
                    keyExtractor={(item) => item.employee_id}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                  />
                </View>
              </>
            ) : (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyMessage}>No data available for this department</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingBottom: 32,
  },
  // Filter Section
  filterSection: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  dateFilterBtn: {
    flex: 1,
    borderRadius: 8,
  },
  // Department Selection
  deptSelectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  deptSelectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  deptButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  deptButton: {
    flex: 1,
    minWidth: 90,
    borderRadius: 8,
  },
  // Statistics Grid
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 20,
    justifyContent: 'space-between',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6366F1',
  },
  statName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'center',
  },
  // Employee List Section
  employeeListSection: {
    marginBottom: 24,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Employee Card
  employeeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  employeeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  designation: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 4,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  recentTasks: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  recentTasksLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  recentTasksText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 14,
  },
  separator: {
    height: 8,
  },
  // Empty State
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});

export default AdminDepartmentStandupScreen;
