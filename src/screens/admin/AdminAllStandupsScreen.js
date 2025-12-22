import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { Text, Card, useTheme, ActivityIndicator, Chip, Button, Searchbar, Divider } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import StandupService from '../../services/standup.service';
import { formatDate, formatTime } from '../../utils/helpers';

const AdminAllStandupsScreen = ({ navigation }) => {
  const { custom } = useTheme();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [standups, setStandups] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('week'); // week, month

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
  }, [fetchAllStandups]);

  const filteredStandups = standups.filter((standup) => {
    const query = searchQuery.toLowerCase();
    return (
      formatDate(standup.standup_date).toLowerCase().includes(query) ||
      standup.standup_id.toLowerCase().includes(query)
    );
  });

  const renderStandupItem = ({ item }) => (
    <Card
      style={styles.card}
      onPress={() => navigation.navigate('AdminStandupDetail', { standupId: item.standup_id })}
    >
      <Card.Content>
        <View style={styles.cardHeader}>
          <View style={styles.dateContainer}>
            <Icon name="calendar" size={16} color={custom.palette.primary} />
            <Text style={styles.date}>{formatDate(item.standup_date)}</Text>
          </View>
          <Chip
            size={12}
            icon={item.is_submitted ? 'check' : 'clock-outline'}
            style={{
              backgroundColor: item.is_submitted ? '#D1FAE5' : '#FEF3C7',
            }}
            textStyle={{
              color: item.is_submitted ? '#065F46' : '#92400E',
              fontSize: 10,
            }}
          >
            {item.is_submitted ? 'Submitted' : 'Draft'}
          </Chip>
        </View>

        <Text style={styles.standupId}>{item.standup_id}</Text>

        <View style={styles.taskStats}>
          <View style={styles.stat}>
            <Icon name="tasks" size={12} color={custom.palette.primary} />
            <Text style={styles.statText}>{item.total_tasks} tasks</Text>
          </View>
          {item.tasks.length > 0 && (
            <View style={styles.stat}>
              <Icon name="users" size={12} color={custom.palette.secondary} />
              <Text style={styles.statText}>{item.tasks.length} employees</Text>
            </View>
          )}
        </View>

        {item.remarks && (
          <Text style={styles.remarks} numberOfLines={2}>
            💬 {item.remarks}
          </Text>
        )}

        <Button
          mode="text"
          compact
          onPress={() => navigation.navigate('AdminStandupDetail', { standupId: item.standup_id })}
          labelStyle={{ fontSize: 11 }}
        >
          View Details
        </Button>
      </Card.Content>
    </Card>
  );

  if (loading && standups.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: custom.palette.background }]}>
        <ActivityIndicator size="large" color={custom.palette.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: custom.palette.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Icon name="list" size={24} color={custom.palette.primary} />
        <Text style={styles.headerTitle}>All Standups</Text>
      </View>

      {/* Statistics */}
      {stats && (
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statNumber}>{stats.total_standups}</Text>
              <Text style={styles.statName}>Total</Text>
            </Card.Content>
          </Card>

          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={[styles.statNumber, { color: '#10B981' }]}>{stats.completed_tasks}</Text>
              <Text style={styles.statName}>Completed</Text>
            </Card.Content>
          </Card>

          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={[styles.statNumber, { color: '#F59E0B' }]}>{stats.total_tasks}</Text>
              <Text style={styles.statName}>Tasks</Text>
            </Card.Content>
          </Card>
        </View>
      )}

      {/* Filters */}
      <View style={styles.filterSection}>
        <Searchbar
          placeholder="Search by date or ID"
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
          mode="bar"
        />

        <View style={styles.dateFilterRow}>
          <Button
            mode={dateRange === 'week' ? 'contained' : 'outlined'}
            onPress={() => setDateRange('week')}
            style={styles.dateFilterBtn}
            labelStyle={{ fontSize: 11 }}
          >
            Last 7 Days
          </Button>
          <Button
            mode={dateRange === 'month' ? 'contained' : 'outlined'}
            onPress={() => setDateRange('month')}
            style={styles.dateFilterBtn}
            labelStyle={{ fontSize: 11 }}
          >
            Last 30 Days
          </Button>
        </View>
      </View>

      {/* Standups List */}
      {filteredStandups.length > 0 ? (
        <FlatList
          data={filteredStandups}
          renderItem={renderStandupItem}
          keyExtractor={(item) => item.standup_id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <Card style={styles.emptyCard}>
          <Card.Content>
            <View style={styles.centerContent}>
              <Icon name="inbox" size={48} color={custom.palette.warning} />
              <Text style={[styles.emptyText, { marginTop: 12 }]}>
                {searchQuery ? 'No results found' : 'No standups'}
              </Text>
            </View>
          </Card.Content>
        </Card>
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
  filterSection: {
    marginBottom: 16,
  },
  searchbar: {
    marginBottom: 8,
  },
  dateFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateFilterBtn: {
    flex: 1,
    marginHorizontal: 4,
  },
  card: {
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
    color: '#111827',
  },
  standupId: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 8,
  },
  taskStats: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  statText: {
    fontSize: 11,
    color: '#6B7280',
    marginLeft: 4,
  },
  remarks: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 8,
    lineHeight: 16,
  },
  separator: {
    height: 4,
  },
  emptyCard: {
    marginVertical: 32,
  },
  centerContent: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
});

export default AdminAllStandupsScreen;
