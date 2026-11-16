'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, QuestState } from '@/lib/game/state';
import { ACHIEVEMENTS } from '@/lib/game/achievements';
import { api } from './api';
import { playSound } from './sound';
import { useMe } from './me';

/**
 * The game layer's client.
 *
 * It holds the latest game state and watches for change: after any action
 * anywhere in the app (the API client announces each one), it re-reads
 * progress and turns the difference into feedback — a floating "+12 XP", a
 * quest-complete toast, a full-screen celebration for a daily goal, a level,
 * or an achievement. Pages never have to know the game exists.
 */

export type CelebrationKind = 'goal' | 'level' | 'achievement' | 'streak' | 'chest';

export interface Celebration {
  id: string;
  kind: CelebrationKind;
  title: string;
  body: string;
  stats: Array<{ label: string; value: number; suffix?: string }>;
  /** Recorded as seen on the server when dismissed. */
  ack?: { level?: number; achievements?: Record<string, number> };
}

export interface XpFloat {
  id: number;
  amount: number;
}

export interface QuestToast {
  id: number;
  quest: QuestState;
}

interface GameApi {
  state: GameState | null;
  celebration: Celebration | null;
  dismissCelebration: () => void;
  floats: XpFloat[];
  toasts: QuestToast[];
  dismissToast: (id: number) => void;
  claimQuest: (key: string) => Promise<void>;
  claimChest: () => Promise<void>;
  claimPath: (key: string) => Promise<void>;
  setGoal: (goal: number) => Promise<void>;
  refresh: () => void;
}

const GameContext = createContext<GameApi | null>(null);

export function useGame(): GameApi {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within <GameProvider>');
  return context;
}

/** Same as `useGame`, but null outside the provider (public pages). */
export function useOptionalGame(): GameApi | null {
  return useContext(GameContext);
}

let seq = 0;
const nextId = () => (seq += 1);

function celebrationsFor(state: GameState): Celebration[] {
  const out: Celebration[] = [];
  if (state.unseen.level) {
    out.push({
      id: `level-${state.unseen.level}`,
      kind: 'level',
      title: `Level ${state.unseen.level}!`,
      body: `You are now a ${state.level.title}. ${state.level.toNext} XP to the next level.`,
      stats: [
        { label: 'Total XP', value: state.xp },
        { label: 'Level', value: state.unseen.level },
      ],
      ack: { level: state.unseen.level },
    });
  }
  for (const unlocked of state.unseen.achievements) {
    const definition = ACHIEVEMENTS.find((entry) => entry.key === unlocked.key);
    const current = state.achievements.find((entry) => entry.key === unlocked.key);
    if (!definition || !current) continue;
    out.push({
      id: `ach-${unlocked.key}-${unlocked.tier}`,
      kind: 'achievement',
      title: `${definition.name} · Tier ${unlocked.tier}`,
      body:
        current.next === null
          ? 'Every tier unlocked. That one is finished.'
          : `Next tier: ${current.description.toLowerCase()}.`,
      stats: [{ label: 'Reached', value: current.value }],
      ack: { achievements: { [unlocked.key]: unlocked.tier } },
    });
  }
  return out;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { checkIn } = useMe();
  const [state, setState] = useState<GameState | null>(null);
  const [queue, setQueue] = useState<Celebration[]>([]);
  const [floats, setFloats] = useState<XpFloat[]>([]);
  const [toasts, setToasts] = useState<QuestToast[]>([]);
  const [streakSeen, setStreakSeen] = useState(false);

  const previous = useRef<GameState | null>(null);
  const queued = useRef(new Set<string>());

  const showFloat = useCallback((amount: number) => {
    const id = nextId();
    setFloats((current) => [...current, { id, amount }]);
    setTimeout(() => setFloats((current) => current.filter((entry) => entry.id !== id)), 1600);
  }, []);

  const enqueue = useCallback((items: Celebration[]) => {
    const fresh = items.filter((item) => !queued.current.has(item.id));
    if (fresh.length === 0) return;
    for (const item of fresh) queued.current.add(item.id);
    setQueue((current) => [...current, ...fresh]);
  }, []);

  /** Applies a new state, turning what changed into feedback. */
  const apply = useCallback(
    (next: GameState, { quiet = false }: { quiet?: boolean } = {}) => {
      const before = previous.current;
      previous.current = next;
      setState(next);

      if (before) {
        // A claim already showed its own "+XP"; everything else still applies.
        const gained = next.xp - before.xp;
        if (gained > 0 && !quiet) {
          showFloat(gained);
          playSound('xp');
        }

        if (!before.today.goalMet && next.today.goalMet) {
          enqueue([
            {
              id: `goal-${next.today.goal}-${new Date().toDateString()}`,
              kind: 'goal',
              title: 'Daily goal reached!',
              body: 'That is today done properly. Anything more is a bonus.',
              stats: [
                { label: 'XP today', value: next.today.xp },
                { label: 'Day streak', value: next.streak.days },
              ],
            },
          ]);
        }

        for (const quest of next.quests) {
          const was = before.quests.find((entry) => entry.key === quest.key);
          if (was && was.progress < was.target && quest.progress >= quest.target && !quest.claimed) {
            const id = nextId();
            setToasts((current) => [...current, { id, quest }]);
            setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== id)), 7000);
          }
        }
      }

      enqueue(celebrationsFor(next));
    },
    [enqueue, showFloat]
  );

  const refresh = useCallback(() => {
    api
      .get<GameState>('/api/game')
      .then((next) => apply(next))
      .catch(() => {
        // The game layer is decoration; a failed read must never break a page.
      });
  }, [apply]);

  // Initial load, then re-read shortly after any change anywhere in the app.
  useEffect(() => {
    refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMutated = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 350);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('api:mutated', onMutated);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('api:mutated', onMutated);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // A streak milestone comes from the morning's check-in, once.
  const milestone = checkIn?.milestone ?? null;
  const streakCelebration = useMemo<Celebration | null>(
    () =>
      milestone && !streakSeen
        ? {
            id: `streak-${milestone}`,
            kind: 'streak',
            title: `${milestone}-day streak!`,
            body: 'You showed up again. That is the whole trick — and it earned you a streak shield.',
            stats: [{ label: 'Days', value: milestone }],
          }
        : null,
    [milestone, streakSeen]
  );

  const celebration = streakCelebration ?? queue[0] ?? null;

  const dismissCelebration = useCallback(() => {
    if (streakCelebration) {
      setStreakSeen(true);
      return;
    }
    const current = queue[0];
    if (!current) return;
    setQueue((items) => items.slice(1));
    if (current.ack) {
      api.post('/api/game', { action: 'ack', ...current.ack }).catch(() => undefined);
    }
  }, [queue, streakCelebration]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const claim = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await api.post<{ awarded: number; state: GameState }>('/api/game', body);
      if (result.awarded > 0) {
        showFloat(result.awarded);
        playSound('claim');
      }
      // Quiet: the claim itself is the feedback; do not double-count the XP.
      apply(result.state, { quiet: true });
      return result;
    },
    [apply, showFloat]
  );

  const claimQuest = useCallback(
    async (key: string) => {
      setToasts((current) => current.filter((entry) => entry.quest.key !== key));
      await claim({ action: 'claim_quest', key });
    },
    [claim]
  );

  const claimChest = useCallback(async () => {
    const result = await claim({ action: 'claim_chest' });
    if (result.awarded > 0) {
      enqueue([
        {
          id: `chest-${new Date().toDateString()}`,
          kind: 'chest',
          title: 'Chest opened!',
          body: 'All three quests done. Same time tomorrow?',
          stats: [{ label: 'Bonus XP', value: result.awarded, suffix: ' XP' }],
        },
      ]);
    }
  }, [claim, enqueue]);

  const claimPath = useCallback(
    async (key: string) => {
      await claim({ action: 'claim_path', key });
    },
    [claim]
  );

  const setGoal = useCallback(
    async (goal: number) => {
      const next = await api.post<GameState>('/api/game', { action: 'set_goal', goal });
      apply(next, { quiet: true });
    },
    [apply]
  );

  const value = useMemo<GameApi>(
    () => ({
      state,
      celebration,
      dismissCelebration,
      floats,
      toasts,
      dismissToast,
      claimQuest,
      claimChest,
      claimPath,
      setGoal,
      refresh,
    }),
    [state, celebration, dismissCelebration, floats, toasts, dismissToast, claimQuest, claimChest, claimPath, setGoal, refresh]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
