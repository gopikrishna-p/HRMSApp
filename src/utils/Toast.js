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
    // Shown a moment later so it lands on whichever toast host is on top by then: the one inside
    // an open bottom sheet (ds Sheet), or the app root once a sheet that triggered it has closed.
    setTimeout(() => {
        Toast.show({
            type: TYPE_FALLBACK[type] || type,
            text1,
            text2,
            visibilityTime: time,
            position: 'top',
            topOffset: 50,
            props: { backgroundColor },
        });
    }, 200);
}
