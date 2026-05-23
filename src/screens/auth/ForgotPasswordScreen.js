// src/screens/auth/ForgotPasswordScreen.js
// Was empty (0 lines) — replaced with a friendly placeholder + back-to-login
// action (Phase 4 of the parity audit). Self-serve password reset is not yet
// implemented in the mobile app; users are directed to their HR contact.

import React from 'react';
import ComingSoon from '../../components/ui/ComingSoon';
import { colors } from '../../theme/colors';

const ForgotPasswordScreen = ({ navigation }) => {
    return (
        <ComingSoon
            title="Forgot Password"
            description="Self-serve password reset isn't available in the mobile app yet."
            suggestion="Please contact your HR administrator to reset your password. Once reset, return to the login screen and sign in with the new credentials."
            icon="key"
            accent={colors.warning}
            action={{
                label: 'Back to Login',
                onPress: () => navigation.navigate('Login'),
            }}
        />
    );
};

export default ForgotPasswordScreen;
