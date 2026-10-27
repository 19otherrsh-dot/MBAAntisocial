import { ViewTransition } from 'react';

/**
 * Templates remount on every navigation, so the soft page cut plays on each
 * route change without wrapping every page by hand. The shell (sidebar, top
 * bar) lives in the layout and never moves.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page" exit="page" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
