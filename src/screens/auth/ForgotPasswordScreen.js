// src/screens/auth/ForgotPasswordScreen.js
//
// Self-serve password reset is not available in the app; passwords are reset by HR.
import React from 'react';
import { View, Text, Image, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, color, space, type } from '../../components/ds';

const ForgotPasswordScreen = ({ navigation }) => {
    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <StatusBar barStyle="dark-content" backgroundColor={color.surface} />
            <View style={styles.content}>
                <Image
                    source={require('../../assets/images/mainLogo.jpg')}
                    style={styles.logo}
                    resizeMode="contain"
                    accessibilityLabel="DeepGrid"
                />
                <Text style={styles.title}>Reset password</Text>
                <Text style={styles.message}>
                    Passwords are reset by your HR administrator. Once it is reset, sign in with the new password.
                </Text>
                <Button title="Back to sign in" full onPress={() => navigation.navigate('Login')} />
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: color.surface,
    },
    content: {
        flex: 1,
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.xl,
    },
    logo: {
        width: 180,
        height: 90,
        alignSelf: 'center',
        marginBottom: space.xl,
    },
    title: {
        ...type.display,
        textAlign: 'center',
    },
    message: {
        ...type.body,
        color: color.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginTop: space.sm,
        marginBottom: space.xl,
    },
});

export default ForgotPasswordScreen;
