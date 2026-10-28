import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useTheme } from '@/theme';

const TABS = [
  { name: 'index', href: '/', label: 'Today' },
  { name: 'prep', href: '/prep', label: 'Prep' },
  { name: 'tasks', href: '/tasks', label: 'Tasks' },
  { name: 'hub', href: '/hub', label: 'Hub' },
  { name: 'more', href: '/more', label: 'More' },
] as const;

/** A bottom bar for the web preview, where native tabs are unavailable. */
export default function AppTabs() {
  const t = useTheme();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.line }]}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton>{tab.label}</TabButton>
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

// The trigger's ref targets a View; Pressable's differs in type and is not needed here.
function TabButton({ children, isFocused, ref: _ref, ...props }: TabTriggerSlotProps) {
  const t = useTheme();
  return (
    <Pressable {...props} style={styles.button}>
      <View style={[styles.pill, isFocused && { backgroundColor: t.accentSoft }]}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: isFocused ? t.accentText : t.textSecondary }}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  button: { flex: 1, alignItems: 'center' },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
});
