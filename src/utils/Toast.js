// src/utils/Toast.js
import Toast from 'react-native-toast-message';

export default function showToast({
    type = 'info',
    text1,
    text2,
    time = 4000,
    backgroundColor,
}) {
    Toast.show({
        type,
        text1,
        text2,
        visibilityTime: time,
        position: 'top',
        topOffset: 50,
        props: { backgroundColor },
    });
}
