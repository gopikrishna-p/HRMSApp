// src/screens/auth/SplashScreen.js
//
// Shown while the stored session is checked on launch.
import React from 'react';
import { View, Text, Image, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { color, space, type } from '../../theme/tokens';

const SplashScreen = () => (
    <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={color.surface} />
        <View style={styles.center}>
            <Image
                source={require('../../assets/images/mainLogo.jpg')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="DeepGrid"
            />
            <ActivityIndicator color={color.accent} style={styles.spinner} />
        </View>
        <Text style={styles.footerText}>Powered by DeepGrid Technologies</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: color.surface,
        paddingBottom: space.xxl + space.sm,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 200,
        height: 100,
    },
    spinner: {
        marginTop: space.xl,
    },
    footerText: {
        ...type.caption,
        textAlign: 'center',
    },
});

export default SplashScreen;
