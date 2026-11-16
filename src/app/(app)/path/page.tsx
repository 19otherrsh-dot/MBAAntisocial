'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Flame,
  Gift,
  Heart,
  Library,
  Lock,
  Mic,
  Shield,
  Star,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import Mascot from '@/components/game/Mascot';
import { useGame } from '@/lib/client/game';
import { useCountUp } from '@/lib/client/useCountUp';
import { usePersistentFlag } from '@/lib/client/hooks';
import { SOUND_STORAGE_KEY, playSound } from '@/lib/client/sound';
import { DAILY_GOALS } from '@/lib/game/levels';
import type { AchievementState } from '@/lib/game/achievements';
import type { PathStepState } from '@/lib/game/state';
import { cn, pluralise } from '@/lib/utils';
import g from '@/components/game/game.module.css';
import styles from '../app.module.css';

/** Horizontal offsets that make the path wind, repeating every eight steps. */
const WIND = [0, 44, 66, 44, 0, -44, -66, -44];

const MEDAL_ICON: Record<AchievementState['icon'], typeof Flame> = {
  flame: Flame,
  book: BookOpen,
  mic: Mic,
  target: Target,
  check: CheckCircle2,
  library: Library,
  bot: Bot,
  heart: Heart,
};

const MEDAL_COLOURS = [
  ['#c4b5fd', '#7c3aed'],
  ['#fdba74', '#ea580c'],
  ['#cbd5e1', '#64748b'],
  ['#fde68a', '#d97706'],
  ['#5eead4', '#0d9488'],
  ['#f0abfc', '#c026d3'],
];

export default function PathPage() {
  const { state, claimQuest, claimChest, claimPath, setGoal } = useGame();
  const [soundOn, setSoundOn] = usePersistentFlag(SOUND_STORAGE_KEY, true);
  const [editingGoal, setEditingGoal] = useState(false);
  const xp = useCountUp(state?.xp ?? 0);

  if (!state) {
    return (
      <div className="stack gap-4">
        <div className="skeleton" style={{ height: 140 }} />
        <div className="skeleton" style={{ height: 220 }} />
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  const goalFraction = Math.min(1, state.today.xp / Math.max(1, state.today.goal));
  const questsDone = state.quests.filter((quest) => quest.progress >= quest.target).length;

  return (
    <>
      <section className={cn(g.levelCard, 'animate-rise')}>
        <div className="row gap-4" style={{ position: 'relative', zIndex: 1 }}>
          <span className={g.mascotHalo}>
            <Mascot mood={state.today.goalMet ? 'cheer' : state.today.xp > 0 ? 'happy' : 'focus'} size={84} />
          </span>
          <div className={g.levelBadge}>
            <span>
              <small>Level</small>
              {state.level.level}
            </span>
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
          <div className={g.levelTitle}>{state.level.title}</div>
          <div className={g.levelMeta}>
            {xp} XP · {state.level.toNext} XP to level {state.level.level + 1}
          </div>
          <div className={g.bar} role="progressbar" aria-label="Level progress" aria-valuenow={Math.round(state.level.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className={g.barFill} style={{ width: `${Math.max(3, state.level.fraction * 100)}%` }} />
          </div>
          <div className="row gap-3 wrap" style={{ marginTop: 'var(--s-3)', fontSize: 'var(--t-sm)', opacity: 0.92 }}>
            <span className="row gap-1">
              <Flame size={15} fill="currentColor" /> {pluralise(state.streak.days, 'day')} streak
            </span>
            <span className="row gap-1" title="Each covers a missed day beyond the grace day">
              <Shield size={15} fill="currentColor" /> {pluralise(state.streak.shields, 'shield')}
            </span>
            <span className="row gap-1">
              <Trophy size={15} /> {state.week.xp} XP this week
            </span>
          </div>
        </div>
      </section>

      <div className={styles.homeColumns}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>
              <Target size={16} style={{ color: 'var(--accent)' }} />
              Your season path
            </h3>
            <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>
              {state.path.filter((step) => step.status === 'done').length}/{state.path.length}
            </span>
          </div>
          <SeasonPath steps={state.path} onClaim={claimPath} />
        </section>
        <div className="stack gap-5">
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.panelTitle}>
                <Zap size={16} style={{ color: 'var(--teal)' }} fill="currentColor" />
                Daily goal
              </h3>
              <button type="button" className={styles.panelLink} onClick={() => setEditingGoal((value) => !value)}>
                {editingGoal ? 'Done' : 'Change'}
              </button>
            </div>
            <div style={{ padding: 'var(--s-4)' }} className="stack gap-3">
              <div className="between">
                <strong>{state.today.goalMet ? 'Goal reached today!' : `${state.today.goal - state.today.xp} XP to go`}</strong>
                <span className="dim tnum">
                  {state.today.xp}/{state.today.goal} XP
                </span>
              </div>
              <div className={g.questBar} style={{ height: 14 }}>
                <div
                  className={g.questBarFill}
                  style={{ width: `${Math.max(3, goalFraction * 100)}%`, background: state.today.goalMet ? 'var(--amber)' : 'var(--teal)' }}
                />
              </div>
              {editingGoal && (
                <div className={cn(g.goalPicker, 'animate-rise')}>
                  {DAILY_GOALS.map((goal) => (
                    <button
                      key={goal.xp}
                      type="button"
                      className={cn(g.goalOption, state.today.goal === goal.xp && g.goalOptionActive)}
                      onClick={() => {
                        playSound('tap');
                        void setGoal(goal.xp);
                      }}
                      aria-pressed={state.today.goal === goal.xp}
                    >
                      <div className={g.goalXp}>{goal.xp} XP</div>
                      <div className={g.goalName}>{goal.label}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.panelTitle}>
                <Star size={16} style={{ color: 'var(--amber)' }} fill="currentColor" />
                Daily quests
              </h3>
              <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>
                {questsDone}/{state.quests.length} · new ones tomorrow
              </span>
            </div>
            <div style={{ padding: 'var(--s-4)' }} className={g.quests}>
              {state.quests.map((quest) => {
                const done = quest.progress >= quest.target;
                return (
                  <div key={quest.key} className={cn(g.quest, done && g.questDone)}>
                    <span className={g.questIcon}>{done ? <Check size={20} strokeWidth={3} /> : <Zap size={18} />}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className={g.questTitle}>{quest.title}</div>
                      <div className={g.questBar}>
                        <div className={g.questBarFill} style={{ width: `${(quest.progress / quest.target) * 100}%` }} />
                      </div>
                      <div className={g.questCount}>
                        {quest.progress}/{quest.target}
                      </div>
                    </div>
                    {done && !quest.claimed ? (
                      <button type="button" className={cn(g.chunky, g.chunkyGold, g.chunkyGlow)} onClick={() => void claimQuest(quest.key)}>
                        +{quest.xp} XP
                      </button>
                    ) : done ? (
                      <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>
                        Claimed
                      </span>
                    ) : (
                      <Link href={quest.href} className={g.chunky}>
                        Go
                      </Link>
                    )}
                  </div>
                );
              })}

              <div className={cn(g.chest, state.chest.ready && !state.chest.claimed && g.chestReady)}>
                <span className={g.chestIcon} aria-hidden>
                  {state.chest.claimed ? '🎉' : '🎁'}
                </span>
                <div className="grow">
                  <strong>{state.chest.claimed ? 'Chest opened' : 'Daily chest'}</strong>
                  <div className="dim" style={{ fontSize: 'var(--t-sm)' }}>
                    {state.chest.claimed
                      ? 'Back tomorrow with three new quests.'
                      : state.chest.ready
                        ? 'All three done. Open it!'
                        : `Finish all three quests for +${state.chest.xp} XP.`}
                  </div>
                </div>
                {state.chest.ready && !state.chest.claimed && (
                  <button type="button" className={cn(g.chunky, g.chunkyGold, g.chunkyGlow)} onClick={() => void claimChest()}>
                    <Gift size={16} /> Open
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.panelTitle}>
                <Trophy size={16} style={{ color: 'var(--violet)' }} />
                Achievements
              </h3>
            </div>
            <div style={{ padding: 'var(--s-4)' }} className={g.achievements}>
              {state.achievements.map((achievement, index) => {
                const Icon = MEDAL_ICON[achievement.icon];
                const [a, b] = MEDAL_COLOURS[index % MEDAL_COLOURS.length];
                const locked = achievement.tier === 0;
                const fraction = achievement.next ? Math.min(1, achievement.value / achievement.next) : 1;
                return (
                  <div key={achievement.key} className={g.achievement}>
                    <span
                      className={cn(g.medal, locked && g.medalLocked)}
                      style={locked ? undefined : ({ '--medal-a': a, '--medal-b': b } as React.CSSProperties)}
                    >
                      <Icon size={24} />
                      <span className={g.medalTier}>{locked ? '–' : achievement.tier}</span>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className={g.achName}>{achievement.name}</div>
                      <div className={g.achDesc}>{achievement.description}</div>
                      <div className={g.questBar} style={{ height: 6 }}>
                        <div className={g.questBarFill} style={{ width: `${fraction * 100}%`, background: locked ? 'var(--line-strong)' : 'var(--violet)' }} />
                      </div>
                      <div className={g.questCount}>
                        {achievement.next === null ? 'Maxed out' : `${achievement.value}/${achievement.next}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="row gap-3 wrap">
            <Link href="/leaderboard?track=week" className={g.chunky}>
              <Trophy size={16} /> Weekly league <ArrowRight size={14} />
            </Link>
            <button
              type="button"
              className={g.chunky}
              style={{ background: 'var(--slate)', boxShadow: '0 4px 0 color-mix(in srgb, var(--slate) 55%, #000)' }}
              onClick={() => {
                setSoundOn(!soundOn);
                if (!soundOn) setTimeout(() => playSound('claim'), 30);
              }}
              aria-pressed={soundOn}
            >
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />} Sound {soundOn ? 'on' : 'off'}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}

function SeasonPath({ steps, onClaim }: { steps: PathStepState[]; onClaim: (key: string) => Promise<void> }) {
  const router = useRouter();

  return (
    <div className={g.path}>
      {steps.map((step, index) => {
        const offset = WIND[index % WIND.length];
        const labelLeft = offset > 0;
        const claimable = step.status === 'done' && !step.claimed;
        const Icon = step.status === 'locked' ? Lock : step.status === 'done' ? Check : step.milestone ? Trophy : Star;

        const activate = () => {
          if (step.status === 'locked') return;
          playSound('tap');
          if (claimable) void onClaim(step.key);
          else router.push(step.href);
        };

        return (
          <div key={step.key} className={g.pathRow} style={{ '--wind': offset } as React.CSSProperties}>
            <div style={{ position: 'relative' }}>
              {step.status === 'current' && <span className={g.startBubble}>Next</span>}
              <button
                type="button"
                className={cn(
                  g.node,
                  step.milestone && g.nodeMilestone,
                  step.status === 'done' && g.nodeDone,
                  step.status === 'locked' && g.nodeLocked,
                  step.status === 'current' && g.nodeCurrent,
                  claimable && g.nodeClaimable
                )}
                onClick={activate}
                aria-disabled={step.status === 'locked'}
                aria-label={`${step.title} — ${step.status === 'locked' ? 'locked' : claimable ? `claim ${step.xp} XP` : step.status}`}
              >
                <Icon size={step.milestone ? 32 : 26} strokeWidth={2.6} />
              </button>
              <div className={cn(g.nodeLabel, labelLeft ? g.nodeLabelLeft : g.nodeLabelRight)}>
                <div className={g.nodeTitle} style={step.status === 'locked' ? { color: 'var(--text-muted)' } : undefined}>
                  {step.title}
                </div>
                {claimable ? (
                  <div className={g.nodeClaim}>Tap to claim +{step.xp} XP</div>
                ) : (
                  step.status !== 'locked' && <div className={g.nodeHint}>{step.hint}</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
