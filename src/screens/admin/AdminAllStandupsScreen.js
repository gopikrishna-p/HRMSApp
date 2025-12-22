import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { Text, useTheme, Chip, Button, Searchbar, ActivityIndicator } from 'react-native-paper';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const AdminAllStandupsScreen = ({ navigation }) => {
  const { custom } = useTheme();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [standups, setStandups] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('week');

  const fetchAllStandups = useCallback(async () => {
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
      const result = await StandupService.getAllStandups(
        formatDateStr(fromDate),
        formatDateStr(today),
        null,
        100
      );

      if (result?.data?.standups) {
        setStandups(result.data.standups);
        setStats(result.data.statistics);
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to load standups');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllStandups();
    setRefreshing(false);
  }, [fetchAllStandups]);

  useEffect(() => {
    fetchAllStandups();
  }, [dateRange, fetchAllStandups]);

  const filteredStandups = standups.filter((s) =>
    searchQuery === '' ||
    formatDate(s.standup_date).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.employee_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderStandupItem = ({ item }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.employeeName}>{item.employee_name}</Text>
          <Text style={styles.itemDate}>{formatDate(item.standup_date)}</Text>
        </View>
        <Chip
          icon={item.is_submitted ? 'check' : 'clock-outline'}
          style={{
            backgroundColor: item.is_submitted ? '#D1FAE5' : '#FEF3C7',
          }}
          textStyle={{ color: item.is_submitted ? '#059669' : '#92400E', fontWeight: '600' }}
          mode="flat"
          size="small"
        >
          {item.is_submitted ? 'Done' : 'Draft'}
        </Chip>
      </View>

      {item.employee_task && (
        <View style={styles.taskPreview}>
          <Text style={styles.taskTitle} numberOfLines={2}>{item.employee_task.task_title}</Text>
          <View style={styles.taskMeta}>
            <Text style={styles.metaItem}>
              Progress: <Text style={styles.metaBold}>{item.employee_task.completion_percentage}%</Text>
            </Text>
            <Text style={styles.metaItem}>
              Tasks: <Text style={styles.metaBold}>{item.total_tasks}</Text>
            </Text>
          </View>
        </View>
      )}

      <Button
        mode="text"
        onPress={() => navigation.navigate('AdminStandupDetail', { standupId: item.standup_id })}
        style={styles.viewBtn}
        labelStyle={{ fontSize: 12, color: custom.palette.primary }}
      >
        View Details →
      </Button>
    </View>
  );

  if (loading && standups.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader 
          title="All Standups"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading standups...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <AppHeader 
        title="All Standups"
        canGoBack={true}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Statistics Grid */}
        {stats && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.total_standups}</Text>
              <Text style={styles.statName}>Total</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.submitted_count}</Text>
              <Text style={styles.statName}>Submitted</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.pending_count}</Text>
              <Text style={styles.statName}>Pending</Text>
            </View>
          </View>
        )}

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

        {/* Search Bar */}
        <Searchbar
          placeholder="Search by date or employee..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
          iconColor={custom.palette.primary}
          placeholderTextColor="#9CA3AF"
        />

        {/* Standups List */}
        {filteredStandups.length > 0 ? (
          <View style={styles.listSection}>
            <FlatList
              data={filteredStandups}
              renderItem={renderStandupItem}
              keyExtractor={(item) => item.standup_id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        ) : (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyMessage}>
              {searchQuery ? 'No results found' : 'No standups'}
            </Text>
          </View>
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
  // Statistics Grid
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 24,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#6366F1',
  },
  statName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 6,
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
  searchbar: {
    marginBottom: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  // List Section
  listSection: {
    marginBottom: 24,
  },
  // Item Card
  itemCard: {
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
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  itemDate: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 4,
  },
  taskPreview: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  taskTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  taskMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaItem: {
    fontSize: 11,
    color: '#6B7280',
  },
  metaBold: {
    fontWeight: '700',
    color: '#111827',
  },
  viewBtn: {
    marginTop: 4,
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

export default AdminAllStandupsScreen;
