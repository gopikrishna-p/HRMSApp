import React, { useEffect } from 'react';
import { View, StyleSheet, Image, Animated } from 'react-native';
import { Text } from 'react-native-paper';
import { colors } from '../../theme/colors';

const SplashScreen = () => {
    const fadeAnim = new Animated.Value(0);
    const scaleAnim = new Animated.Value(0.3);

    useEffect(() => {
        // Fade in and scale animation
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 10,
                friction: 2,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <View style={styles.container}>
            <Animated.View
                style={[
                    styles.logoContainer,
                    {
                        opacity: fadeAnim,
                        transform: [{ scale: scaleAnim }],
                    },
                ]}
            >
                <Image
                    source={require('../../assets/images/mainLogo.jpg')}
                    style={styles.logo}
                    resizeMode="contain"
                />
                <Text style={styles.title}>HRMS DeepGrid</Text>
                <Text style={styles.subtitle}>Employee Management System</Text>
            </Animated.View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>Powered by DeepGrid Technologies</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoContainer: {
        alignItems: 'center',
    },
    logo: {
        width: 150,
        height: 150,
        marginBottom: 24,
        tintColor: colors.white,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: colors.white,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: colors.white,
        opacity: 0.9,
    },
    footer: {
        position: 'absolute',
        bottom: 40,
    },
    footerText: {
        fontSize: 12,
        color: colors.white,
        opacity: 0.8,
    },
});

export default SplashScreen;