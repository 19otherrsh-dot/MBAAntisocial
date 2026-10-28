import type { ComponentRef, Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, useTheme } from '@/theme';

/** A scrolling page with pull-to-refresh and the app background. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  edges = ['top'],
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const t = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.screen}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={t.accent} /> : undefined}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[styles.title, { color: t.text }, style]}>{children}</Text>;
}

export function Heading({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[styles.heading, { color: t.text }, style]}>{children}</Text>;
}

export function Body({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[styles.body, { color: t.text }, style]}>
      {children}
    </Text>
  );
}

export function Muted({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[styles.muted, { color: t.textMuted }, style]}>
      {children}
    </Text>
  );
}

/** A titled card, the unit every screen is built from. */
export function Card({ title, action, children, style }: { title?: string; action?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }, style]}>
      {(title || action) && (
        <View style={[styles.cardHead, { borderBottomColor: t.line }]}>
          {title ? <Text style={[styles.cardTitle, { color: t.text }]}>{title}</Text> : <View />}
          {action}
        </View>
      )}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

/** A tappable list row inside a card. */
export function Row({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  if (!onPress) return <View style={[styles.row, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surfaceHover }, style]}>
      {children}
    </Pressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  children,
  variant = 'primary',
  loading,
  disabled,
  small,
  style,
  ...rest
}: PressableProps & { children: React.ReactNode; variant?: ButtonVariant; loading?: boolean; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const colors: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: t.accent, fg: t.onAccent, border: t.accent },
    secondary: { bg: t.surface, fg: t.text, border: t.lineStrong },
    ghost: { bg: 'transparent', fg: t.accentText, border: 'transparent' },
    danger: { bg: 'transparent', fg: t.rose, border: t.rose },
  };
  const c = colors[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: c.bg, borderColor: c.border, opacity: inactive ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={c.fg} size="small" /> : <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: c.fg }]}>{children}</Text>}
    </Pressable>
  );
}

export type TextInputRef = ComponentRef<typeof TextInput>;

export function Input({ label, hint, style, ref, ...rest }: TextInputProps & { label?: string; hint?: string; ref?: Ref<TextInputRef> }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={[styles.label, { color: t.text }]}>{label}</Text>}
      <TextInput
        ref={ref}
        placeholderTextColor={t.textMuted}
        style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.lineStrong }, style]}
        {...rest}
      />
      {hint && <Text style={[styles.muted, { color: t.textMuted }]}>{hint}</Text>}
    </View>
  );
}

type Tone = 'accent' | 'teal' | 'amber' | 'rose' | 'muted';

export function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: Tone }) {
  const t = useTheme();
  const tones: Record<Tone, { bg: string; fg: string }> = {
    accent: { bg: t.accentSoft, fg: t.accentText },
    teal: { bg: t.tealSoft, fg: t.teal },
    amber: { bg: t.amberSoft, fg: t.amber },
    rose: { bg: t.roseSoft, fg: t.rose },
    muted: { bg: t.sunken, fg: t.textSecondary },
  };
  return (
    <View style={[styles.chip, { backgroundColor: tones[tone].bg }]}>
      <Text style={[styles.chipText, { color: tones[tone].fg }]}>{children}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: t.sunken, borderColor: t.line }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: t.surface }]}
          >
            <Text style={[styles.segmentText, { color: active ? t.text : t.textSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.heading, { color: t.text, textAlign: 'center' }]}>{title}</Text>
      {body && <Text style={[styles.body, { color: t.textSecondary, textAlign: 'center' }]}>{body}</Text>}
      {action}
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const t = useTheme();
  return (
    <View accessibilityRole="alert" style={[styles.error, { backgroundColor: t.roseSoft, borderColor: t.rose }]}>
      <Text style={{ color: t.rose, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ padding: space.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  muted: { fontSize: 13, lineHeight: 18 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardBody: { paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 48 },
  button: { minHeight: 46, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { minHeight: 34, paddingHorizontal: space.md },
  buttonText: { fontSize: 15, fontWeight: '600' },
  buttonTextSmall: { fontSize: 13 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { minHeight: 46, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, alignSelf: 'flex-start' },
  chipText: { fontSize: 12, fontWeight: '600' },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  segment: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentText: { fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', gap: space.sm, padding: space.xl },
  error: { padding: space.md, borderRadius: radius.md, borderWidth: 1 },
});
