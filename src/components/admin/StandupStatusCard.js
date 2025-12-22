import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Chip, useTheme } from 'react-native-paper';
import { formatDate } from '../../utils/helpers';

const StandupStatusCard = ({ standup, onPress }) => {
  const { custom } = useTheme();

  const isSubmitted = standup.is_submitted;
  const taskCount = standup.total_tasks || 0;

  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content>
        <View style={styles.header}>
          <View>
            <Text style={styles.date}>{formatDate(standup.standup_date)}</Text>
            <Text style={styles.id}>{standup.standup_id}</Text>
          </View>
          <Chip
            icon={isSubmitted ? 'check' : 'clock-outline'}
            style={{
              backgroundColor: isSubmitted ? '#D1FAE5' : '#FEF3C7',
            }}
            textStyle={{
              color: isSubmitted ? '#065F46' : '#92400E',
              fontSize: 10,
            }}
          >
            {isSubmitted ? 'Submitted' : 'Draft'}
          </Chip>
        </View>

        {taskCount > 0 && (
          <View style={styles.taskInfo}>
            <Text style={styles.taskLabel}>Tasks: {taskCount}</Text>
          </View>
        )}

        {standup.remarks && (
          <Text style={styles.remarks} numberOfLines={2}>
            {standup.remarks}
          </Text>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  date: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  id: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  taskInfo: {
    marginTop: 8,
  },
  taskLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  remarks: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 16,
  },
});

export default StandupStatusCard;
