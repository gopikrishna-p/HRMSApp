import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

export default function AppHeader({
    title,
    canGoBack,
    onBack,
    rightIcon,          // e.g., 'bell'
    onRightPress,       // handler
    badge,              // number (optional)
}) {
    const { custom } = useTheme();

    return (
        <View style={[styles.wrap, { borderBottomColor: custom.palette.border }]}>
            {canGoBack ? (
                <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.8}>
                    <Icon name="arrow-left" size={18} />
                </TouchableOpacity>
            ) : (
                <View style={styles.iconBtn} />
            )}

            {title === 'logo' ? (
                <Image source={require('../../assets/images/mainLogo.jpg')} style={styles.logo} />
            ) : (
                <Text style={styles.title}>{title}</Text>
            )}

            {rightIcon ? (
                <TouchableOpacity style={styles.rightBtn} onPress={onRightPress} activeOpacity={0.8}>
                    <Icon name={rightIcon} size={18} />
                    {typeof badge === 'number' && badge > 0 ? (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                        </View>
                    ) : null}
                </TouchableOpacity>
            ) : (
                <View style={styles.rightBtn} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        height: 68,
        paddingHorizontal: 14,
        backgroundColor: '#FFF',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
    },
    iconBtn: {
        width: 42, height: 42, borderRadius: 21,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F8FAFC',
    },
    rightBtn: {
        width: 42, height: 42, borderRadius: 21,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F8FAFC', position: 'relative',
    },
    logo: { width: 120, height: 38, resizeMode: 'contain' },
    title: { fontSize: 18, fontWeight: '800' },
    badge: {
        position: 'absolute',
        top: 2, right: 2,
        minWidth: 16, height: 16,
        paddingHorizontal: 3,
        borderRadius: 8,
        backgroundColor: '#EF4444',
        alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
});
