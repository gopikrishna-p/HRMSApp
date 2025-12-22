import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  RefreshControl,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  useTheme,
  Chip,
  ActivityIndicator,
  Card,
  SegmentedButtons,
  Menu,
  Divider,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';
import { formatDate } from '../../utils/helpers';

const AdminStandupListScreen = ({ navigation }) => {
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [standups, setStandups] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // all, submitted, draft
  const [dateRange, setDateRange] = useState('7days');
  const [department, setDepartment] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);

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

  // Fetch standups
  const fetchStandups = useCallback(async () => {
    setLoading(true);
    try {
      const dateParams = getDateRange();
      const result = await StandupService.getAllStandups(
        dateParams.from_date,
        dateParams.to_date,
        department || null,
        100
      );

      console.log('📊 Standups fetched:', result);
      setStandups(result.data?.standups || []);
      setStatistics(result.data?.statistics || {});
    } catch (error) {
      console.error('❌ Error fetching standups:', error);
      Alert.alert('Error', 'Failed to load standups: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [getDateRange, department]);

  useEffect(() => {
    fetchStandups();
  }, [fetchStandups]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStandups();
    setRefreshing(false);
  }, [fetchStandups]);

  // Filter standups based on status
  const filteredStandups = useCallback(() => {
    if (filterStatus === 'all') return standups;
    if (filterStatus === 'submitted') return standups.filter(s => s.is_submitted);
    if (filterStatus === 'draft') return standups.filter(s => !s.is_submitted);
    return standups;
  }, [standups, filterStatus])();

  // Render standup card
  const renderStandupCard = ({ item }) => (
    <TouchableOpacity
      onPress={() =>
        navigation.navigate('AdminStandupDetail', {
          standupId: item.standup_id,
        })
      }
    >
      <Card style={[styles.card, { backgroundColor: custom.palette.surface }]}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.dateTimeContainer}>
              <Text style={styles.dateText}>
                📅 {formatDate(item.standup_date)}
              </Text>
              <Text style={styles.timeText}>⏰ {item.standup_time}</Text>
            </View>

            <Chip
              icon={item.is_submitted ? 'check-circle' : 'pencil'}
              style={[
                styles.statusChip,
                {
                  backgroundColor: item.is_submitted
                    ? '#D1FAE5'
                    : '#FEF3C7',
                },
              ]}
              textStyle={{
                color: item.is_submitted ? '#065F46' : '#92400E',
                fontWeight: '600',
              }}
            >
              {item.is_submitted ? 'Submitted' : 'Draft'}
            </Chip>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Icon
                name="tasks"
                size={16}
                color={custom.palette.primary}
                style={styles.statIcon}
              />
              <Text style={styles.statText}>
                {item.total_tasks} Task{item.total_tasks !== 1 ? 's' : ''}
              </Text>
            </View>

            <View style={styles.statItem}>
              <Icon
                name="check"
                size={16}
                color="#10B981"
                style={styles.statIcon}
              />
              <Text style={[styles.statText, { color: '#10B981' }]}>
                {item.tasks?.filter(t => t.task_status === 'Completed').length || 0} Completed
              </Text>
            </View>

            <View style={styles.statItem}>
              <Icon
                name="hourglass-half"
                size={16}
                color="#F59E0B"
                style={styles.statIcon}
              />
              <Text style={[styles.statText, { color: '#F59E0B' }]}>
                {item.tasks?.filter(t => t.task_status === 'Draft').length || 0} Pending
              </Text>
            </View>
          </View>

          {item.tasks && item.tasks.length > 0 && (
            <>
              <Divider style={styles.divider} />
              <View style={styles.tasksPreview}>
                <Text style={styles.tasksLabel}>Tasks Preview:</Text>
                {item.tasks.slice(0, 2).map((task, idx) => (
                  <View key={idx} style={styles.taskPreviewItem}>
                    <Icon
                      name="circle"
                      size={8}
                      color={custom.palette.primary}
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={styles.taskTitle}
                      numberOfLines={1}
                    >
                      {task.task_title}
                    </Text>
                  </View>
                ))}
                {item.tasks.length > 2 && (
                  <Text style={styles.moreText}>
                    +{item.tasks.length - 2} more
                  </Text>
                )}
              </View>
            </>
          )}

          {item.remarks && (
            <>
              <Divider style={styles.divider} />
              <Text style={styles.remarksText}>
                💬 Remarks: {item.remarks}
              </Text>
            </>
          )}
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="inbox" size={48} color="#D1D5DB" />
      <Text style={styles.emptyText}>No standups found</Text>
      <Text style={styles.emptySubtext}>
        Try adjusting your filters or date range
      </Text>
    </View>
  );

  if (loading && !standups.length) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="All Standups"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>
            Loading standups...
          </Text>
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[custom.palette.primary]}
          />
        }
        style={styles.container}
      >
        {/* Statistics */}
        {statistics && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>📊 Statistics</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statsItem}>
                <Text style={styles.statsNumber}>
                  {statistics.total_standups || 0}
                </Text>
                <Text style={styles.statsLabel}>Total</Text>
              </View>
              <View style={styles.statsItem}>
                <Text style={[styles.statsNumber, { color: '#10B981' }]}>
                  {statistics.submitted_standups || 0}
                </Text>
                <Text style={styles.statsLabel}>Submitted</Text>
              </View>
              <View style={styles.statsItem}>
                <Text style={[styles.statsNumber, { color: '#F59E0B' }]}>
                  {statistics.draft_standups || 0}
                </Text>
                <Text style={styles.statsLabel}>Draft</Text>
              </View>
              <View style={styles.statsItem}>
                <Text style={[styles.statsNumber, { color: '#3B82F6' }]}>
                  {statistics.completed_tasks || 0}
                </Text>
                <Text style={styles.statsLabel}>Tasks Done</Text>
              </View>
            </View>
          </View>
        )}

        {/* Filters */}
        <View style={styles.filtersContainer}>
          <Text style={styles.filterLabel}>Status</Text>
          <SegmentedButtons
            value={filterStatus}
            onValueChange={setFilterStatus}
            buttons={[
              { value: 'all', label: 'All' },
              { value: 'submitted', label: 'Submitted' },
              { value: 'draft', label: 'Draft' },
            ]}
            style={styles.segmentedButtons}
          />

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

          <Button
            icon="refresh"
            mode="outlined"
            onPress={fetchStandups}
            loading={loading}
            style={styles.refreshButton}
          >
            Refresh
          </Button>
        </View>

        {/* Standups List */}
        {filteredStandups.length > 0 ? (
          <FlatList
            data={filteredStandups}
            renderItem={renderStandupCard}
            keyExtractor={item => item.standup_id}
            scrollEnabled={false}
            contentContainerStyle={styles.listContainer}
          />
        ) : (
          renderEmpty()
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  statsCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1E40AF',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statsItem: {
    alignItems: 'center',
  },
  statsNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E3A8A',
  },
  statsLabel: {
    fontSize: 12,
    color: '#1E3A8A',
    marginTop: 4,
  },
  filtersContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151',
  },
  segmentedButtons: {
    marginBottom: 12,
  },
  refreshButton: {
    marginTop: 8,
    borderColor: '#3B82F6',
  },
  listContainer: {
    paddingBottom: 20,
  },
  card: {
    marginBottom: 12,
    borderRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  dateTimeContainer: {
    flex: 1,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  timeText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  statusChip: {
    height: 28,
  },
  divider: {
    marginVertical: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statIcon: {
    marginRight: 6,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  tasksPreview: {
    paddingTop: 8,
  },
  tasksLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
  },
  taskPreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskTitle: {
    fontSize: 12,
    color: '#374151',
    flex: 1,
  },
  moreText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 4,
  },
  remarksText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
});

export default AdminStandupListScreen;
