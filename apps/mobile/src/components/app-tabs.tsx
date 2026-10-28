import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '@/theme';

/** Native tab bar on iOS and Android. The web preview uses app-tabs.web.tsx. */
export default function AppTabs() {
  const t = useTheme();
  return (
    <NativeTabs backgroundColor={t.surface} indicatorColor={t.accentSoft} tintColor={t.accent} labelStyle={{ selected: { color: t.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sun.max" md="wb_sunny" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="prep">
        <NativeTabs.Trigger.Label>Prep</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2" md="groups" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tasks">
        <NativeTabs.Trigger.Label>Tasks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="hub">
        <NativeTabs.Trigger.Label>Hub</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right" md="forum" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" md="apps" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
