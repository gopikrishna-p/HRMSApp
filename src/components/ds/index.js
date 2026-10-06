// src/components/ds/index.js
//
// Shared building blocks for the admin screens (see src/theme/tokens.js):
// grouped lists with hairline dividers instead of a card per item, quiet stat strips
// instead of coloured tiles, dot + text for status, outline icons, bottom sheets for dialogs.
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Pressable,
    ActivityIndicator,
    TextInput,
    Modal,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../config/toastConfig';
import { color, tones, space, radius, type, statusTone } from '../../theme/tokens';

export { color, tones, space, radius, type, statusTone };

// ------------------------------------------------------------------ icon
export const Icon = ({ name, size = 18, color: c = color.textSecondary, style }) => (
    <Feather name={name} size={size} color={c} style={style} />
);

// ------------------------------------------------------------------ layout
export const Screen = ({ children, scroll = true, refreshing = false, onRefresh, contentStyle, footer, keyboardShouldPersistTaps }) => (
    <View style={s.screen}>
        {scroll ? (
            <ScrollView
                contentContainerStyle={[s.screenContent, contentStyle]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps={keyboardShouldPersistTaps || 'handled'}
                refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[color.accent]} /> : undefined}
            >
                {children}
            </ScrollView>
        ) : (
            children
        )}
        {footer ? <View style={s.footer}>{footer}</View> : null}
    </View>
);

// A titled group of rows in one white container; rows are separated by hairline dividers.
export const Group = ({ title, action, onAction, footer, children, style, flush }) => {
    const items = React.Children.toArray(children).filter(Boolean);
    return (
        <View style={[s.group, style]}>
            {title || action ? (
                <View style={s.groupHeader}>
                    {title ? <Text style={s.groupTitle}>{title}</Text> : <View />}
                    {action ? (
                        <Pressable onPress={onAction} hitSlop={8}>
                            <Text style={s.link}>{action}</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}
            <View style={[s.groupBody, flush && s.groupFlush]}>
                {items.map((child, i) => (
                    <React.Fragment key={child.key ?? i}>
                        {i > 0 ? <View style={s.divider} /> : null}
                        {child}
                    </React.Fragment>
                ))}
            </View>
            {footer ? <Text style={s.groupFooter}>{footer}</Text> : null}
        </View>
    );
};

export const Divider = ({ inset = 0 }) => <View style={[s.divider, { marginLeft: inset }]} />;

// ------------------------------------------------------------------ rows
export const Row = ({
    title,
    subtitle,
    meta,
    value,
    valueTone,
    left,
    icon,
    right,
    chevron,
    onPress,
    onLongPress,
    disabled,
    destructive,
    selected,
    titleLines = 1,
    subtitleLines = 2,
}) => {
    const showChevron = chevron ?? Boolean(onPress);
    const content = (
        <>
            {left || (icon ? <View style={s.rowIcon}><Icon name={icon} size={19} color={destructive ? color.danger : color.textSecondary} /></View> : null)}
            <View style={s.rowBody}>
                <Text style={[s.rowTitle, destructive && { color: color.danger }]} numberOfLines={titleLines}>{title}</Text>
                {subtitle ? <Text style={s.rowSubtitle} numberOfLines={subtitleLines}>{subtitle}</Text> : null}
                {meta ? <View style={s.rowMeta}>{meta}</View> : null}
            </View>
            {value !== undefined && value !== null ? (
                <Text style={[s.rowValue, valueTone && { color: tones[valueTone]?.fg }]} numberOfLines={1}>{value}</Text>
            ) : null}
            {right}
            {showChevron ? <Icon name="chevron-right" size={18} color={color.textTertiary} style={s.chevron} /> : null}
        </>
    );
    if (!onPress && !onLongPress) {
        return <View style={[s.row, selected && s.rowSelected]}>{content}</View>;
    }
    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            disabled={disabled}
            style={({ pressed }) => [s.row, selected && s.rowSelected, pressed && s.rowPressed, disabled && s.disabled]}
        >
            {content}
        </Pressable>
    );
};

const AVATAR_TONES = ['#E0EAFF', '#DCFAE6', '#FEF0C7', '#FCE7F6', '#D1E9FF', '#EBE9FE', '#FEE4E2', '#CCFBEF'];
const AVATAR_TEXT = ['#3538CD', '#067647', '#B54708', '#C11574', '#175CD3', '#5925DC', '#B42318', '#107569'];
export const initialsOf = (name) => {
    const parts = String(name || '?').trim().split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
};
export const Avatar = ({ name, size = 36 }) => {
    const i = String(name || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_TONES.length;
    return (
        <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_TONES[i] }]}>
            <Text style={[s.avatarText, { color: AVATAR_TEXT[i], fontSize: size * 0.38 }]}>{initialsOf(name)}</Text>
        </View>
    );
};

// ------------------------------------------------------------------ status
// "● Present" in the status colour
export const StatusText = ({ label, tone, size = 13 }) => {
    const t = tones[tone || statusTone(label)] || tones.neutral;
    return (
        <View style={s.status}>
            <View style={[s.statusDot, { backgroundColor: t.dot }]} />
            <Text style={[s.statusLabel, { color: t.fg, fontSize: size }]} numberOfLines={1}>{label}</Text>
        </View>
    );
};

// small rounded tag for secondary facts (Late, Draft, Office)
export const Tag = ({ label, tone = 'neutral' }) => {
    const t = tones[tone] || tones.neutral;
    return (
        <View style={[s.tag, { backgroundColor: t.bg }]}>
            <Text style={[s.tagText, { color: t.fg }]} numberOfLines={1}>{label}</Text>
        </View>
    );
};

// count pill for pending items
export const Count = ({ value, tone = 'accent' }) => {
    if (!value) {
        return null;
    }
    const t = tones[tone] || tones.accent;
    return (
        <View style={[s.count, { backgroundColor: t.bg }]}>
            <Text style={[s.countText, { color: t.fg }]}>{value > 99 ? '99+' : value}</Text>
        </View>
    );
};

// ------------------------------------------------------------------ numbers
// One quiet panel of numbers separated by hairlines.
export const StatStrip = ({ items, style, onPress }) => {
    const body = (
        <View style={[s.stats, style]}>
            {items.map((it, i) => (
                <React.Fragment key={it.label}>
                    {i > 0 ? <View style={s.statDivider} /> : null}
                    <View style={s.stat}>
                        <Text style={[s.statValue, it.tone && { color: tones[it.tone]?.fg }]} numberOfLines={1}>{it.value}</Text>
                        <Text style={s.statLabel} numberOfLines={1}>{it.label}</Text>
                    </View>
                </React.Fragment>
            ))}
        </View>
    );
    return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
};

export const ProgressBar = ({ value = 0, tone = 'accent' }) => (
    <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${Math.max(0, Math.min(value, 100))}%`, backgroundColor: tones[tone]?.dot || color.accent }]} />
    </View>
);

// ------------------------------------------------------------------ controls
export const Segmented = ({ options, value, onChange, style }) => (
    <View style={[s.segmented, style]}>
        {options.map((o) => {
            const key = typeof o === 'string' ? o : o.value;
            const label = typeof o === 'string' ? o : o.label;
            const active = key === value;
            return (
                <Pressable key={key} onPress={() => onChange(key)} style={[s.segment, active && s.segmentActive]}>
                    <Text style={[s.segmentText, active && s.segmentTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {label}
                    </Text>
                    {typeof o === 'object' && o.count !== undefined ? (
                        <Text style={[s.segmentCount, active && s.segmentCountActive]}>{o.count}</Text>
                    ) : null}
                </Pressable>
            );
        })}
    </View>
);

export const Button = ({ title, onPress, variant = 'primary', size = 'md', icon, loading, disabled, style, full }) => {
    const v = {
        primary: { bg: color.accent, fg: color.textInverse, border: color.accent },
        secondary: { bg: color.surface, fg: color.text, border: color.border },
        danger: { bg: color.surface, fg: color.danger, border: '#FDA29B' },
        dangerSolid: { bg: '#D92D20', fg: color.textInverse, border: '#D92D20' },
        success: { bg: '#079455', fg: color.textInverse, border: '#079455' },
        ghost: { bg: 'transparent', fg: color.accent, border: 'transparent' },
    }[variant];
    const off = disabled || loading;
    return (
        <Pressable
            onPress={onPress}
            disabled={off}
            style={({ pressed }) => [
                s.button,
                size === 'sm' && s.buttonSm,
                full && s.buttonFull,
                { backgroundColor: v.bg, borderColor: v.border },
                pressed && !off && { opacity: 0.85 },
                off && s.disabled,
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator size="small" color={v.fg} />
            ) : icon ? (
                <Icon name={icon} size={size === 'sm' ? 14 : 16} color={v.fg} />
            ) : null}
            {title ? <Text style={[s.buttonText, size === 'sm' && s.buttonTextSm, { color: v.fg }]}>{title}</Text> : null}
        </Pressable>
    );
};

export const IconButton = ({ name, onPress, disabled, color: c = color.textSecondary, size = 20, label }) => (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} accessibilityLabel={label}
        style={({ pressed }) => [s.iconButton, pressed && s.rowPressed, disabled && s.disabled]}>
        <Icon name={name} size={size} color={c} />
    </Pressable>
);

export const SearchField = ({ value, onChangeText, placeholder = 'Search', style }) => (
    <View style={[s.search, style]}>
        <Icon name="search" size={16} color={color.textTertiary} />
        <TextInput
            style={s.searchInput}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={color.textTertiary}
            autoCorrect={false}
        />
        {value ? (
            <Pressable onPress={() => onChangeText('')} hitSlop={8}>
                <Icon name="x" size={16} color={color.textTertiary} />
            </Pressable>
        ) : null}
    </View>
);

export const Field = ({ label, hint, children, style }) => (
    <View style={[s.field, style]}>
        {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
        {children}
        {hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
);

export const TextField = ({ label, hint, style, inputStyle, multiline, ...props }) => (
    <Field label={label} hint={hint} style={style}>
        <TextInput
            style={[s.input, multiline && s.inputMultiline, inputStyle]}
            placeholderTextColor={color.textTertiary}
            multiline={multiline}
            textAlignVertical={multiline ? 'top' : 'center'}
            {...props}
        />
    </Field>
);

// tappable field that shows a value and opens a picker
export const SelectField = ({ label, hint, value, placeholder = 'Select', onPress, icon = 'chevron-down', style, disabled }) => (
    <Field label={label} hint={hint} style={style}>
        <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.input, s.select, pressed && s.rowPressed, disabled && s.disabled]}>
            <Text style={[s.selectText, !value && { color: color.textTertiary }]} numberOfLines={1}>{value || placeholder}</Text>
            <Icon name={icon} size={16} color={color.textTertiary} />
        </Pressable>
    </Field>
);

// ------------------------------------------------------------------ feedback
export const EmptyState = ({ icon = 'inbox', title, message, action, onAction }) => (
    <View style={s.empty}>
        <Icon name={icon} size={28} color={color.textTertiary} />
        {title ? <Text style={s.emptyTitle}>{title}</Text> : null}
        {message ? <Text style={s.emptyMessage}>{message}</Text> : null}
        {action ? <Button title={action} variant="secondary" size="sm" onPress={onAction} style={s.emptyAction} /> : null}
    </View>
);

export const Loading = ({ label }) => (
    <View style={s.loading}>
        <ActivityIndicator color={color.accent} />
        {label ? <Text style={s.loadingText}>{label}</Text> : null}
    </View>
);

export const Notice = ({ tone = 'neutral', icon, title, children, style, onPress }) => {
    const t = tones[tone] || tones.neutral;
    const body = (
        <View style={[s.notice, { backgroundColor: t.bg }, style]}>
            {icon ? <Icon name={icon} size={16} color={t.fg} style={s.noticeIcon} /> : null}
            <View style={s.flex}>
                {title ? <Text style={[s.noticeTitle, { color: t.fg }]}>{title}</Text> : null}
                {children ? <Text style={[s.noticeText, { color: tone === 'neutral' ? color.textSecondary : t.fg }]}>{children}</Text> : null}
            </View>
        </View>
    );
    return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
};

// ------------------------------------------------------------------ dialogs
// Bottom sheet: title, optional subtitle, content, and a footer (usually Buttons).
export const Sheet = ({ visible, title, subtitle, onClose, children, footer, dismissable = true }) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => dismissable && onClose?.()} statusBarTranslucent>
        <KeyboardAvoidingView style={s.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={s.sheetBackdrop} onPress={() => dismissable && onClose?.()} />
            <View style={s.sheet}>
                <View style={s.sheetHandle} />
                {title ? <Text style={s.sheetTitle}>{title}</Text> : null}
                {subtitle ? <Text style={s.sheetSubtitle}>{subtitle}</Text> : null}
                <ScrollView style={s.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {children}
                </ScrollView>
                {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
            </View>
        </KeyboardAvoidingView>
        {/* toasts are drawn at the app root, which sits under this Modal; this host shows them above the sheet */}
        <Toast config={toastConfig} />
    </Modal>
);

// ------------------------------------------------------------------ date navigation
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const formatLongDate = (d) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const formatShortDate = (d) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;

export const DateNav = ({ date, onPrev, onNext, onPick, nextDisabled, caption }) => {
    const isToday = date.toDateString() === new Date().toDateString();
    return (
        <View style={s.dateNav}>
            <IconButton name="chevron-left" onPress={onPrev} label="Previous day" />
            <Pressable style={s.dateNavCenter} onPress={onPick} hitSlop={6}>
                <Text style={s.dateNavTitle}>{isToday ? 'Today' : formatLongDate(date)}</Text>
                <Text style={s.dateNavCaption}>{isToday ? formatLongDate(date) : String(date.getFullYear())}{caption ? `  ·  ${caption}` : ''}</Text>
            </Pressable>
            <IconButton name="chevron-right" onPress={onNext} disabled={nextDisabled} label="Next day" />
        </View>
    );
};

const s = StyleSheet.create({
    flex: { flex: 1 },
    disabled: { opacity: 0.45 },
    screen: { flex: 1, backgroundColor: color.bg },
    screenContent: { padding: space.lg, paddingBottom: space.xxl },
    footer: {
        backgroundColor: color.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: color.border,
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        paddingBottom: space.lg,
    },

    group: { marginBottom: space.xl },
    groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: space.sm, paddingHorizontal: space.xs },
    groupTitle: { ...type.label },
    groupBody: {
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color.border,
        overflow: 'hidden',
    },
    groupFlush: { backgroundColor: 'transparent', borderWidth: 0 },
    groupFooter: { ...type.caption, marginTop: space.sm, paddingHorizontal: space.xs, lineHeight: 17 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.divider, marginLeft: space.lg },
    link: { fontSize: 13, fontWeight: '600', color: color.accent },

    row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: color.surface },
    rowPressed: { backgroundColor: '#F2F4F7' },
    rowSelected: { backgroundColor: color.accentSoft },
    rowIcon: { width: 28, marginRight: space.md, alignItems: 'flex-start' },
    rowBody: { flex: 1, paddingRight: space.sm },
    rowTitle: { ...type.bodyStrong },
    rowSubtitle: { ...type.secondary, marginTop: 2, lineHeight: 18 },
    rowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    rowValue: { fontSize: 15, color: color.textSecondary, fontVariant: ['tabular-nums'], marginLeft: space.sm },
    chevron: { marginLeft: space.xs },

    avatar: { alignItems: 'center', justifyContent: 'center', marginRight: space.md },
    avatarText: { fontWeight: '600' },

    status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 7, height: 7, borderRadius: 3.5 },
    statusLabel: { fontWeight: '500' },
    tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm },
    tagText: { fontSize: 12, fontWeight: '500' },
    count: { minWidth: 22, paddingHorizontal: 7, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginLeft: space.sm },
    countText: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },

    stats: {
        flexDirection: 'row',
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color.border,
        paddingVertical: space.md,
    },
    stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
    statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: color.divider, marginVertical: 2 },
    statValue: { ...type.number },
    statLabel: { ...type.caption, color: color.textSecondary, marginTop: 2 },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: color.neutralSoft, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },

    segmented: { flexDirection: 'row', backgroundColor: '#EAECF0', borderRadius: 9, padding: 2 },
    segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 7 },
    segmentActive: {
        backgroundColor: color.surface,
        shadowColor: '#101828',
        shadowOpacity: 0.08,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
    },
    segmentText: { fontSize: 13, fontWeight: '500', color: color.textSecondary },
    segmentTextActive: { color: color.text, fontWeight: '600' },
    segmentCount: { fontSize: 12, color: color.textTertiary, fontVariant: ['tabular-nums'] },
    segmentCountActive: { color: color.textSecondary },

    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 44,
        paddingHorizontal: space.lg,
        borderRadius: radius.md,
        borderWidth: 1,
    },
    buttonSm: { height: 34, paddingHorizontal: space.md, gap: 6, borderRadius: 8 },
    buttonFull: { alignSelf: 'stretch' },
    buttonText: { fontSize: 15, fontWeight: '600' },
    buttonTextSm: { fontSize: 13 },
    iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

    search: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 40,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: '#EAECF0',
    },
    searchInput: { flex: 1, fontSize: 15, color: color.text, paddingVertical: 0 },

    field: { marginBottom: space.lg },
    fieldLabel: { ...type.label, marginBottom: 6 },
    fieldHint: { ...type.caption, marginTop: 6 },
    input: {
        minHeight: 44,
        paddingHorizontal: space.md,
        paddingVertical: 10,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: color.surface,
        fontSize: 15,
        color: color.text,
    },
    inputMultiline: { minHeight: 96 },
    select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectText: { flex: 1, fontSize: 15, color: color.text },

    empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: space.xl },
    emptyTitle: { ...type.bodyStrong, marginTop: space.md, textAlign: 'center' },
    emptyMessage: { ...type.secondary, marginTop: 4, textAlign: 'center', lineHeight: 19 },
    emptyAction: { marginTop: space.lg },
    loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
    loadingText: { ...type.secondary, marginTop: space.md },

    notice: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: radius.md, padding: space.md, marginBottom: space.lg },
    noticeIcon: { marginRight: 10, marginTop: 1 },
    noticeTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
    noticeText: { fontSize: 13, lineHeight: 19 },

    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: color.overlay },
    sheet: {
        backgroundColor: color.surface,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingHorizontal: space.lg,
        paddingBottom: space.lg,
        maxHeight: '88%',
    },
    sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#D0D5DD', marginTop: 8, marginBottom: space.md },
    sheetTitle: { ...type.title },
    sheetSubtitle: { ...type.secondary, marginTop: 2 },
    sheetBody: { marginTop: space.lg },
    sheetFooter: { flexDirection: 'row', gap: space.sm, paddingTop: space.md },

    dateNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: color.surface,
        paddingHorizontal: space.sm,
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    dateNavCenter: { alignItems: 'center', flex: 1 },
    dateNavTitle: { ...type.title, fontSize: 16 },
    dateNavCaption: { ...type.caption, marginTop: 1 },
});
