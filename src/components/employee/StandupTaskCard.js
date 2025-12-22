import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Chip, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

const StandupTaskCard = ({ task }) => {
  const { custom } = useTheme();

  return (
    <Card style={styles.card}>
      <Card.Content>
        {/* Task Title */}
        <Text style={styles.taskTitle}>{task.task_title}</Text>

        {/* Employee & Department */}
        {task.employee && (
          <View style={styles.employeeRow}>
            <Icon name="user" size={12} color={custom.palette.primary} />
            <Text style={styles.employeeText}>{task.employee}</Text>
            {task.department && (
              <Text style={styles.departmentText}> • {task.department}</Text>
            )}
          </View>
        )}

        {/* Planned Output */}
        {task.planned_output && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>📋 Planned</Text>
            <Text style={styles.sectionText} numberOfLines={2}>
              {task.planned_output}
            </Text>
          </View>
        )}

        {/* Actual Work Done */}
        {task.actual_work_done && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>✅ Actual</Text>
            <Text style={styles.sectionText} numberOfLines={2}>
              {task.actual_work_done}
            </Text>
          </View>
        )}

        {/* Completion & Status */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Completion</Text>
            <View style={styles.progressContainer}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${task.completion_percentage}%`,
                    backgroundColor: custom.palette.primary,
                  },
                ]}
              />
            </View>
            <Text style={styles.statValue}>{task.completion_percentage}%</Text>
          </View>

          <View style={styles.stat}>
            <Text style={styles.statLabel}>Status</Text>
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
        </View>

        {/* Carry Forward */}
        {task.carry_forward === 1 && (
          <View style={styles.carryForwardBox}>
            <Icon name="arrow-right" size={10} color="#F59E0B" />
            <Text style={styles.carryForwardText}>
              Carries to {task.next_working_date}
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  employeeText: {
    fontSize: 11,
    color: '#6B7280',
    marginLeft: 6,
  },
  departmentText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  section: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 2,
  },
  sectionText: {
    fontSize: 11,
    color: '#111827',
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  stat: {
    flex: 1,
    marginRight: 12,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 3,
  },
  progressContainer: {
    height: 3,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 3,
  },
  progressBar: {
    height: '100%',
  },
  statValue: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
  },
  carryForwardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    padding: 6,
    borderRadius: 4,
    marginTop: 8,
    borderLeftColor: '#F59E0B',
    borderLeftWidth: 2,
  },
  carryForwardText: {
    fontSize: 10,
    color: '#92400E',
    marginLeft: 4,
  },
});

export default StandupTaskCard;
