// src/utils/Toast.js
import Toast from 'react-native-toast-message';

// react-native-toast-message ships with only success / error / info built-in.
// Callers across the app pass 'warning' freely — map it to 'info' here so the
// component doesn't throw "Toast type 'warning' does not exist".
const TYPE_FALLBACK = {
    warning: 'info',
    warn: 'info',
};

export default function showToast({
    type = 'info',
    text1,
    text2,
    time = 4000,
    backgroundColor,
}) {
    Toast.show({
        type: TYPE_FALLBACK[type] || type,
        text1,
        text2,
        visibilityTime: time,
        position: 'top',
        topOffset: 50,
        props: { backgroundColor },
    });
}
