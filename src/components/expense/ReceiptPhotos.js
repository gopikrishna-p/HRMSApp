// src/components/expense/ReceiptPhotos.js
//
// Receipt photos for expense claims. Photos are uploaded to the server (stored in Cloudflare R2) as soon as
// they are taken, so submitting the claim only sends their ids (hrms.api.expenses).
//
//   ReceiptPicker  - camera / gallery tiles + thumbnails with upload progress, retry and remove (forms)
//   ReceiptThumbs  - read-only thumbnails that open the full-screen viewer (claim details)
//   ReceiptViewer  - full-screen photo pager
//
// ReceiptPicker is controlled: pass `value` (array) and `onChange` = a React state setter (it is called with
// updater functions while uploads progress). Helpers: receiptIds(), photosUploading(), photosFailed().
import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    Image,
    Pressable,
    Modal,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    Linking,
    PermissionsAndroid,
    Platform,
    useWindowDimensions,
    StatusBar,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import { Icon, color, space, radius, type } from '../ds';

const PICKER_OPTIONS = {
    mediaType: 'photo',
    quality: 0.7, // ~200-500 KB per receipt
    maxWidth: 1800,
    maxHeight: 1800,
    includeBase64: false,
    saveToPhotos: false,
    selectionLimit: 5,
};

let nextKey = 1;

export const receiptIds = (photos = []) => photos.filter((p) => p.status === 'done').map((p) => p.receipt.name);
export const photosUploading = (photos = []) => photos.some((p) => p.status === 'uploading');
export const photosFailed = (photos = []) => photos.some((p) => p.status === 'error');

const askCameraPermission = async () => {
    if (Platform.OS !== 'android') {
        return true;
    }
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Camera',
        message: 'Allow the camera to photograph receipts.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
};

export const ReceiptPicker = ({ value = [], onChange, employee, disabled }) => {
    const [viewerIndex, setViewerIndex] = useState(null);

    const patch = (key, changes) => onChange((list) => list.map((p) => (p.key === key ? { ...p, ...changes } : p)));

    const upload = async (item) => {
        patch(item.key, { status: 'uploading', progress: 0, error: null });
        try {
            const res = await ApiService.uploadExpenseReceipt(item.asset, {
                employee,
                onProgress: (progress) => patch(item.key, { progress }),
            });
            const data = res?.data?.message;
            if (res?.success && data?.receipt?.name) {
                patch(item.key, { status: 'done', progress: 1, receipt: data.receipt, duplicateClaims: data.duplicate_claims || [] });
                if (data.duplicate_claims?.length) {
                    showToast({
                        type: 'warning',
                        text1: 'This photo is already on a claim',
                        text2: `Used on ${data.duplicate_claims.join(', ')}. HR will see this.`,
                    });
                }
            } else {
                patch(item.key, { status: 'error', error: res?.message || 'Upload failed' });
            }
        } catch (err) {
            patch(item.key, { status: 'error', error: err?.message || 'Upload failed' });
        }
    };

    const addAssets = (assets = []) => {
        const items = assets
            .filter((a) => a?.uri)
            .map((asset) => ({ key: `p${nextKey++}`, uri: asset.uri, asset, status: 'uploading', progress: 0 }));
        if (!items.length) {
            return;
        }
        onChange((list) => [...list, ...items]);
        items.forEach(upload);
    };

    const handleResult = (result) => {
        if (result?.didCancel) {
            return;
        }
        if (result?.errorCode) {
            showToast({
                type: 'error',
                text1: result.errorCode === 'camera_unavailable' ? 'No camera available' : 'Could not open the photo',
                text2: result.errorMessage || undefined,
            });
            return;
        }
        addAssets(result?.assets);
    };

    const takePhoto = async () => {
        if (!(await askCameraPermission())) {
            showToast({ type: 'warning', text1: 'Camera permission needed', text2: 'Allow it in Settings, or choose from the gallery' });
            return;
        }
        handleResult(await launchCamera({ ...PICKER_OPTIONS, cameraType: 'back' }));
    };

    const chooseFromGallery = async () => {
        handleResult(await launchImageLibrary(PICKER_OPTIONS));
    };

    const remove = (item) => {
        onChange((list) => list.filter((p) => p.key !== item.key));
        if (item.status === 'done' && item.receipt?.name) {
            // not on a claim yet, so the server deletes it; anything missed is cleaned up nightly
            ApiService.deleteExpenseReceipt(item.receipt.name).catch(() => {});
        }
    };

    const viewable = value.filter((p) => p.status === 'done').map((p) => ({ url: p.uri }));

    return (
        <View>
            <View style={styles.grid}>
                {value.map((item) => {
                    const doneIndex = value.filter((p) => p.status === 'done').indexOf(item);
                    return (
                        <View key={item.key} style={styles.thumbWrap}>
                            <Pressable
                                onPress={() => (item.status === 'error' ? upload(item) : doneIndex >= 0 && setViewerIndex(doneIndex))}
                                style={styles.thumb}
                                accessibilityLabel={item.status === 'error' ? 'Retry upload' : 'View receipt'}
                            >
                                <Image source={{ uri: item.uri }} style={styles.thumbImage} />
                                {item.status === 'uploading' ? (
                                    <View style={styles.overlay}>
                                        <ActivityIndicator color="#FFFFFF" size="small" />
                                        <Text style={styles.overlayText}>{`${Math.round((item.progress || 0) * 100)}%`}</Text>
                                    </View>
                                ) : null}
                                {item.status === 'error' ? (
                                    <View style={[styles.overlay, styles.overlayError]}>
                                        <Icon name="refresh-cw" size={16} color="#FFFFFF" />
                                        <Text style={styles.overlayText}>Retry</Text>
                                    </View>
                                ) : null}
                                {item.status === 'done' && item.duplicateClaims?.length ? (
                                    <View style={styles.dupBadge}>
                                        <Icon name="alert-triangle" size={11} color="#FFFFFF" />
                                    </View>
                                ) : null}
                            </Pressable>
                            {!disabled ? (
                                <Pressable onPress={() => remove(item)} hitSlop={8} style={styles.removeButton} accessibilityLabel="Remove photo">
                                    <Icon name="x" size={12} color="#FFFFFF" />
                                </Pressable>
                            ) : null}
                        </View>
                    );
                })}
                {!disabled ? (
                    <>
                        <Pressable onPress={takePhoto} style={({ pressed }) => [styles.addTile, pressed && styles.pressed]} accessibilityLabel="Take a photo">
                            <Icon name="camera" size={20} color={color.accent} />
                            <Text style={styles.addText}>Camera</Text>
                        </Pressable>
                        <Pressable onPress={chooseFromGallery} style={({ pressed }) => [styles.addTile, pressed && styles.pressed]} accessibilityLabel="Choose from gallery">
                            <Icon name="image" size={20} color={color.accent} />
                            <Text style={styles.addText}>Gallery</Text>
                        </Pressable>
                    </>
                ) : null}
            </View>
            <ReceiptViewer photos={viewable} index={viewerIndex} onClose={() => setViewerIndex(null)} />
        </View>
    );
};

// Read-only thumbnails. `receipts` = [{ name, url, also_on_claims? }] from get_expense_claim_detail.
export const ReceiptThumbs = ({ receipts = [], showDuplicates = false }) => {
    const [viewerIndex, setViewerIndex] = useState(null);
    if (!receipts.length) {
        return <Text style={styles.none}>No photo</Text>;
    }
    const dupes = showDuplicates
        ? [...new Set(receipts.flatMap((r) => r.also_on_claims || []))]
        : [];
    return (
        <View>
            <View style={styles.grid}>
                {receipts.map((r, i) => (
                    <Pressable key={r.name} onPress={() => setViewerIndex(i)} style={styles.thumb} accessibilityLabel="View receipt">
                        <Image source={{ uri: r.url }} style={styles.thumbImage} />
                        {showDuplicates && r.also_on_claims?.length ? (
                            <View style={styles.dupBadge}>
                                <Icon name="alert-triangle" size={11} color="#FFFFFF" />
                            </View>
                        ) : null}
                    </Pressable>
                ))}
            </View>
            {dupes.length ? (
                <View style={styles.dupNote}>
                    <Icon name="alert-triangle" size={13} color={color.warning} />
                    <Text style={styles.dupText}>{`Same photo also on ${dupes.join(', ')}`}</Text>
                </View>
            ) : null}
            <ReceiptViewer photos={receipts} index={viewerIndex} onClose={() => setViewerIndex(null)} />
        </View>
    );
};

// Full-screen pager. `photos` = [{ url }], `index` = photo to open (null = closed).
export const ReceiptViewer = ({ photos = [], index, onClose }) => {
    const { width, height } = useWindowDimensions();
    const [current, setCurrent] = useState(0);
    const listRef = useRef(null);
    const visible = index !== null && index !== undefined && photos.length > 0;

    const onViewable = useRef(({ viewableItems }) => {
        if (viewableItems?.[0]?.index !== undefined && viewableItems[0].index !== null) {
            setCurrent(viewableItems[0].index);
        }
    }).current;

    const photo = photos[current] || photos[0];

    return (
        <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent onShow={() => setCurrent(index || 0)}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />
            <View style={styles.viewer}>
                <FlatList
                    ref={listRef}
                    data={photos}
                    horizontal
                    pagingEnabled
                    initialScrollIndex={visible ? Math.min(index, photos.length - 1) : 0}
                    getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                    keyExtractor={(item, i) => `${item.url}-${i}`}
                    showsHorizontalScrollIndicator={false}
                    onViewableItemsChanged={onViewable}
                    viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
                    renderItem={({ item }) => (
                        <View style={[styles.page, { width, height }]}>
                            <Image source={{ uri: item.url }} style={styles.full} resizeMode="contain" />
                        </View>
                    )}
                />
                <View style={styles.viewerBar}>
                    <Pressable onPress={onClose} hitSlop={12} style={styles.viewerButton} accessibilityLabel="Close">
                        <Icon name="x" size={22} color="#FFFFFF" />
                    </Pressable>
                    <Text style={styles.viewerCount}>{photos.length > 1 ? `${current + 1} of ${photos.length}` : ''}</Text>
                    {photo?.url?.startsWith('http') ? (
                        <Pressable onPress={() => Linking.openURL(photo.url)} hitSlop={12} style={styles.viewerButton} accessibilityLabel="Open in browser to zoom">
                            <Icon name="external-link" size={20} color="#FFFFFF" />
                        </Pressable>
                    ) : <View style={styles.viewerButton} />}
                </View>
            </View>
        </Modal>
    );
};

const TILE = 72;

const styles = StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    thumbWrap: { position: 'relative' },
    thumb: {
        width: TILE,
        height: TILE,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: color.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color.border,
    },
    thumbImage: { width: '100%', height: '100%' },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(16, 24, 40, 0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlayError: { backgroundColor: 'rgba(217, 45, 32, 0.75)' },
    overlayText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF', marginTop: 2 },
    removeButton: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: color.text,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: color.surface,
    },
    dupBadge: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: color.warning,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addTile: {
        width: TILE,
        height: TILE,
        borderRadius: radius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: color.border,
        backgroundColor: color.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pressed: { backgroundColor: color.surfaceMuted },
    addText: { ...type.caption, color: color.accent, fontWeight: '500', marginTop: 4 },
    none: { ...type.secondary, color: color.textTertiary },
    dupNote: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm },
    dupText: { ...type.secondary, color: color.warning, marginLeft: space.xs, flex: 1 },
    viewer: { flex: 1, backgroundColor: '#000000' },
    page: { alignItems: 'center', justifyContent: 'center' },
    full: { width: '100%', height: '100%' },
    viewerBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: (StatusBar.currentHeight || 24) + space.sm,
        paddingHorizontal: space.md,
        paddingBottom: space.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
    },
    viewerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    viewerCount: { fontSize: 15, fontWeight: '500', color: '#FFFFFF' },
});
