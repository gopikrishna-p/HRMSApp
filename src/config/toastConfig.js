// Custom Toast configuration.
//
// react-native-toast-message only ships with 'success', 'error' and 'info'
// types out of the box. Several screens call showToast({ type: 'warning' }),
// which throws "Toast type: 'warning' does not exist" at render time. We add a
// 'warning' variant here (and keep the built-ins) so every call site is valid.
import React from 'react';
import { BaseToast, ErrorToast } from 'react-native-toast-message';

const text1Style = { fontSize: 15, fontWeight: '600' };
const text2Style = { fontSize: 13 };

export const toastConfig = {
    success: (props) => (
        <BaseToast
            {...props}
            style={{ borderLeftColor: '#22c55e' }}
            text1Style={text1Style}
            text2Style={text2Style}
        />
    ),
    error: (props) => (
        <ErrorToast
            {...props}
            text1Style={text1Style}
            text2Style={text2Style}
        />
    ),
    info: (props) => (
        <BaseToast
            {...props}
            style={{ borderLeftColor: '#3b82f6' }}
            text1Style={text1Style}
            text2Style={text2Style}
        />
    ),
    warning: (props) => (
        <BaseToast
            {...props}
            style={{ borderLeftColor: '#f59e0b' }}
            text1Style={text1Style}
            text2Style={text2Style}
        />
    ),
};

export default toastConfig;
