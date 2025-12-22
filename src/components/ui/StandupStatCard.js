import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

const StandupStatCard = ({ title, value, icon, color, backgroundColor }) => {
  const { custom } = useTheme();

  return (
    <Card style={[styles.card, { backgroundColor: backgroundColor || '#F9FAFB' }]}>
      <Card.Content>
        <View style={styles.iconContainer}>
          <Icon name={icon} size={24} color={color || custom.palette.primary} />
        </View>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.title}>{title}</Text>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 8,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  title: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default StandupStatCard;
