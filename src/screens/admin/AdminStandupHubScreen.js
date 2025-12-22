import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Card,
  ActivityIndicator,
  Divider,
  Chip,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import StandupService from '../../services/standup.service';

const AdminStandupHubScreen = ({ navigation }) => {
  const { custom } = useTheme();

  const [loading, setLoading] = useState(false);
  const [todayStats, setTodayStats] = useState(null);
  const [quickStats, setQuickStats] = useState(null);

  const fetchTodayStats = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await StandupService.getAllStandups(today, today, null, 100);

      console.log('📊 Today standup stats:', result);

      const data = result.data || result;
      setTodayStats(data);

      // Calculate quick stats
      const stats = data?.statistics || {};
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

  // Feature cards data
  const featureCards = [
    {
      id: 'all_standups',
      title: 'All Standups',
      subtitle: 'View all standups with filters',
      icon: 'list',
      color: '#3B82F6',
      onPress: () => navigation.navigate('AdminStandupList'),
    },
    {
      id: 'department_summary',
      title: 'Department Summary',
      subtitle: 'Standup analytics by department',
      icon: 'building',
      color: '#10B981',
      onPress: () => navigation.navigate('AdminDepartmentStandup'),
    },
    {
      id: 'today_standup',
      title: "Today's Standups",
      subtitle: 'Quick view of today submissions',
      icon: 'calendar-day',
      color: '#F59E0B',
      badge: quickStats?.draftStandups || 0,
      onPress: () => navigation.navigate('AdminStandupList'),
    },
    {
      id: 'pending_review',
      title: 'Pending Review',
      subtitle: 'Standups awaiting submission',
      icon: 'hourglass-half',
      color: '#EF4444',
      badge: quickStats?.draftStandups || 0,
      onPress: () => navigation.navigate('AdminStandupList'),
    },
  ];

  const renderFeatureCard = ({ item }) => (
    <TouchableOpacity
      style={[styles.featureCard, { backgroundColor: custom.palette.surface }]}
      onPress={item.onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardIconContainer}>
        <Icon
          name={item.icon}
          size={32}
          color={item.color}
        />
        {item.badge > 0 && (
          <View style={[styles.badge, { backgroundColor: item.color }]}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
      </View>

      <Icon
        name="chevron-right"
        size={20}
        color="#9CA3AF"
      />
    </TouchableOpacity>
  );

  const renderStatBox = (title, value, icon, color, subtext) => (
    <View style={[styles.statBox, { backgroundColor: color + '20' }]}>
      <View style={styles.statBoxContent}>
        <Icon
          name={icon}
          size={24}
          color={color}
          style={{ marginBottom: 8 }}
        />
        <Text style={[styles.statBoxValue, { color }]}>
          {value}
        </Text>
        <Text style={styles.statBoxLabel}>{title}</Text>
        {subtext && (
          <Text style={styles.statBoxSubtext}>{subtext}</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
      <AppHeader
        title="Standup Management"
        canGoBack={true}
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.container}>
        {/* Hero Section */}
        <View style={[styles.heroSection, { backgroundColor: custom.palette.primary }]}>
          <Text style={styles.heroTitle}>👋 Welcome to Standup Hub</Text>
          <Text style={styles.heroSubtitle}>
            Manage and track daily standups across your team
          </Text>
          <Button
            mode="contained"
            buttonColor="#fff"
            textColor={custom.palette.primary}
            onPress={fetchTodayStats}
            loading={loading}
            style={styles.heroButton}
            icon="refresh"
          >
            Refresh Stats
          </Button>
        </View>

        {/* Quick Statistics */}
        {quickStats && (
          <>
            <View style={styles.statsSection}>
              <Text style={styles.sectionTitle}>📊 Today's Statistics</Text>
              <View style={styles.statsGrid}>
                {renderStatBox(
                  'Total Standups',
                  quickStats.totalStandups,
                  'tasks',
                  '#3B82F6',
                  `${quickStats.submissionRate}% submitted`
                )}
                {renderStatBox(
                  'Submitted',
                  quickStats.submittedStandups,
                  'check-circle',
                  '#10B981'
                )}
                {renderStatBox(
                  'Draft',
                  quickStats.draftStandups,
                  'pencil',
                  '#F59E0B'
                )}
                {renderStatBox(
                  'Completion Rate',
                  `${quickStats.completionRate}%`,
                  'percentage',
                  '#8B5CF6'
                )}
              </View>
            </View>

            {/* Submission Progress */}
            {quickStats.totalStandups > 0 && (
              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Submission Progress</Text>
                  <Text style={styles.progressPercentage}>
                    {quickStats.submissionRate}%
                  </Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${quickStats.submissionRate}%`,
                        backgroundColor:
                          quickStats.submissionRate >= 80
                            ? '#10B981'
                            : quickStats.submissionRate >= 50
                            ? '#F59E0B'
                            : '#EF4444',
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressLabels}>
                  <Text style={styles.progressLabel}>
                    {quickStats.submittedStandups} submitted
                  </Text>
                  <Text style={styles.progressLabel}>
                    {quickStats.draftStandups} pending
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* Feature Cards */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>🎯 Quick Actions</Text>
          <FlatList
            data={featureCards}
            renderItem={renderFeatureCard}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.featuresList}
          />
        </View>

        {/* Info Cards */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>ℹ️ Tips</Text>

          <Card style={[styles.infoCard, { backgroundColor: '#EFF6FF' }]}>
            <Card.Content>
              <View style={styles.tipContent}>
                <Icon
                  name="info-circle"
                  size={18}
                  color="#3B82F6"
                  style={styles.tipIcon}
                />
                <View style={styles.tipText}>
                  <Text style={[styles.tipTitle, { color: '#1E40AF' }]}>
                    Review Submissions
                  </Text>
                  <Text style={styles.tipDescription}>
                    Click on any standup to view detailed task information and
                    employee progress.
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          <Card style={[styles.infoCard, { backgroundColor: '#ECFDF5' }]}>
            <Card.Content>
              <View style={styles.tipContent}>
                <Icon
                  name="lightbulb"
                  size={18}
                  color="#10B981"
                  style={styles.tipIcon}
                />
                <View style={styles.tipText}>
                  <Text style={[styles.tipTitle, { color: '#065F46' }]}>
                    Department Analytics
                  </Text>
                  <Text style={styles.tipDescription}>
                    Use Department Summary to track team performance and identify
                    bottlenecks.
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          <Card style={[styles.infoCard, { backgroundColor: '#FEF3C7' }]}>
            <Card.Content>
              <View style={styles.tipContent}>
                <Icon
                  name="check-double"
                  size={18}
                  color="#F59E0B"
                  style={styles.tipIcon}
                />
                <View style={styles.tipText}>
                  <Text style={[styles.tipTitle, { color: '#92400E' }]}>
                    Submit Standups
                  </Text>
                  <Text style={styles.tipDescription}>
                    Review all tasks, add remarks, and submit standups when ready.
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroSection: {
    padding: 20,
    paddingTop: 24,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 16,
    lineHeight: 20,
  },
  heroButton: {
    marginTop: 12,
  },
  statsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  statBox: {
    width: '48%',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBoxContent: {
    alignItems: 'center',
  },
  statBoxValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statBoxLabel: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  statBoxSubtext: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
  },
  progressSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
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
  progressPercentage: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  featuresSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  featuresList: {
    paddingBottom: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    elevation: 2,
  },
  cardIconContainer: {
    position: 'relative',
    marginRight: 14,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
  },
  infoCard: {
    marginBottom: 10,
    borderRadius: 10,
  },
  tipContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tipIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  tipText: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  tipDescription: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },
});

export default AdminStandupHubScreen;
