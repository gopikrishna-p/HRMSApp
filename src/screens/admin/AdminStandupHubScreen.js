import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  FlatList,
  RefreshControl,
} from 'react-native';
import {
  Text,
  useTheme,
  ActivityIndicator,
  Divider,
  Chip,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import StandupService from '../../services/standup.service';

const AdminStandupHubScreen = ({ navigation }) => {
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayStats, setTodayStats] = useState(null);
  const [quickStats, setQuickStats] = useState(null);

  const fetchTodayStats = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await StandupService.getAllStandups(today, today, null, 100);

      console.log('📊 Today standup stats:', result);

      // Handle nested response structure: { data: { standups: [...], statistics: {...} }, ... }
      const responseData = result.data || result;
      const stats = responseData?.statistics || result?.statistics || {};
      setTodayStats(responseData);

      // Calculate quick stats
      setQuickStats({
        totalStandups: stats.total_standups || 0,
        submittedStandups: stats.submitted_standups || 0,
        draftStandups: stats.draft_standups || 0,
        submissionRate: stats.total_standups > 0 
          ? Math.round((stats.submitted_standups / stats.total_standups) * 100)
          : 0,
        completionRate: stats.total_tasks > 0
          ? Math.round((stats.completed_tasks / stats.total_tasks) * 100)
          : 0,
      });
    } catch (error) {
      console.error('❌ Error fetching today stats:', error);
      Alert.alert('Error', 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayStats();
  }, [fetchTodayStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTodayStats();
    setRefreshing(false);
  }, [fetchTodayStats]);

  // Feature cards data
  const featureCards = [
    {
      id: 'today_standup',
      title: "Today's Standup",
      subtitle: 'View today\'s standup status',
      icon: 'calendar',
      color: '#8B5CF6',
      onPress: () => navigation.navigate('AdminTodayStandup'),
    },
    {
      id: 'all_standups',
      title: 'Standup History',
      subtitle: 'View all standups with filters',
      icon: 'list-alt',
      color: custom.palette.primary,
      onPress: () => navigation.navigate('AdminStandupList'),
    },
    {
      id: 'department_summary',
      title: 'Department Summary',
      subtitle: 'Standup analytics by department',
      icon: 'sitemap',
      color: '#10B981',
      onPress: () => navigation.navigate('AdminDepartmentStandup'),
    },
  ];

  const renderFeatureCard = ({ item }) => (
    <ListItem
      title={item.title}
      subtitle={item.subtitle}
      leftIcon={item.icon}
      tint={item.color}
      badge={item.id === 'all_standups' ? quickStats?.draftStandups : null}
      onPress={item.onPress}
    />
  );

  if (loading && !todayStats) {
    return (
      <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
        <AppHeader
          title="Standup Management"
          canGoBack={true}
          onBack={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={custom.palette.primary} />
          <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading statistics...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <AppHeader
        title="Standup Management"
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
        {/* Statistics Cards */}
        {quickStats && (
          <View style={styles.statsSection}>
            <View style={[styles.statCard, { backgroundColor: '#FFF' }]}>
              <View style={styles.statRow}>
                <View style={styles.statItem}>
                  <Icon name="tasks" size={20} color={custom.palette.primary} />
                  <Text style={styles.statNumber}>{quickStats.totalStandups}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <Divider style={{ height: 50, width: 1 }} />
                <View style={styles.statItem}>
                  <Icon name="check-circle" size={20} color="#10B981" />
                  <Text style={[styles.statNumber, { color: '#10B981' }]}>
                    {quickStats.submittedStandups}
                  </Text>
                  <Text style={styles.statLabel}>Submitted</Text>
                </View>
                <Divider style={{ height: 50, width: 1 }} />
                <View style={styles.statItem}>
                  <Icon name="pencil-alt" size={20} color="#F59E0B" />
                  <Text style={[styles.statNumber, { color: '#F59E0B' }]}>
                    {quickStats.draftStandups}
                  </Text>
                  <Text style={styles.statLabel}>Draft</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Quick Actions Section */}
        <Section title="Quick Actions" icon="flash" tint={custom.palette.primary}>
          <FlatList
            data={featureCards}
            renderItem={renderFeatureCard}
            keyExtractor={item => item.id}
            scrollEnabled={false}
          />
        </Section>

        {/* Tips Section */}
        <Section title="Tips & Help" icon="lightbulb" tint="#F59E0B">
          <View style={[styles.tipCard, { backgroundColor: '#FEF3C7' }]}>
            <Icon name="info-circle" size={16} color="#92400E" style={styles.tipIcon} />
            <Text style={[styles.tipText, { color: '#92400E' }]}>
              View all standups to manage submissions and track completion rates.
            </Text>
          </View>
          <View style={[styles.tipCard, { backgroundColor: '#D1FAE5' }]}>
            <Icon name="chart-line" size={16} color="#065F46" style={styles.tipIcon} />
            <Text style={[styles.tipText, { color: '#065F46' }]}>
              Check department summaries to analyze team performance.
            </Text>
          </View>
        </Section>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
  },
  statsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  statCard: {
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
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
  progressCard: {
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  tipCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  tipIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  tipText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
});

export default AdminStandupHubScreen;
