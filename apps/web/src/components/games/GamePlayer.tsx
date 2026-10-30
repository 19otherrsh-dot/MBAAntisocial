'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Maximize2, Minimize2, Volume2, VolumeX, UserPlus, RotateCcw, Smartphone, Trophy } from 'lucide-react';
import {
  DEFAULT_RATING,
  BRIDGE_NAMESPACE,
  BRIDGE_PROTOCOL_VERSION,
  parseGameMessage,
  type BridgeInit,
  type GameResult,
  type HostToGame,
} from '@mba/shared/games';
import { topics } from '@mba/shared/realtime';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import { useTheme } from '@/lib/client/theme';
import { useTopic, isEvent } from '@/lib/client/realtime';
import { cn } from '@/lib/utils';
import type { GameDetail, RoomView } from './types';
import styles from './games.module.css';

type Phase = 'checking' | 'confirm-data' | 'loading' | 'playing' | 'finished' | 'error';

interface Outcome {
  title: string;
  body: string;
  delta: number | null;
  points: number;
}

const DATA_WARNING_MB = 25;

function isOnMeteredConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData || (connection?.effectiveType && /(^|-)2g|3g/.test(connection.effectiveType)));
}

/**
 * Hosts a game build in an iframe and speaks the bridge protocol with it:
 * hands over identity and network tickets, relays pause/mute/theme, and turns
 * the game's `result` into a rated match (online) or a recorded one (solo).
 */
export default function GamePlayer({ gameId }: { gameId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { me } = useMe();
  const { resolved: theme } = useTheme();

  const roomId = params.get('room');
  const mode = (roomId ? 'online' : params.get('mode') === 'local' ? 'local' : 'bot') as 'online' | 'bot' | 'local';
  const difficulty = (['easy', 'medium', 'hard'].includes(params.get('difficulty') ?? '') ? params.get('difficulty') : 'medium') as 'easy' | 'medium' | 'hard';

  const { data: detail, error: detailError } = useApiQuery<GameDetail>(`/api/games/${gameId}`);
  const [phase, setPhase] = useState<Phase>('checking');
  const [status, setStatus] = useState('');
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // After an online game: where "Play again" leads (a tournament's bracket) and who already asked for a rematch.
  const [after, setAfter] = useState<{ tournament?: string; rematchFrom?: string }>({});
  const [rematching, setRematching] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const ratingBefore = useRef<number | null>(null);
  const reported = useRef(false);
  const seatsRef = useRef<RoomView['seats']>([]);

  const entryUrl = detail?.entryUrl ?? null;
  const frameOrigin = useMemo(() => (entryUrl ? new URL(entryUrl, window.location.href).origin : null), [entryUrl]);
  const frameSrc = useMemo(() => (entryUrl ? `${entryUrl}#host=${encodeURIComponent(window.location.origin)}` : null), [entryUrl]);
  const backHref = roomId ? `/games/room/${roomId}` : `/games/${gameId}`;

  // Preflight: build exists, threads are possible, the download is acceptable.
  const preflight = useMemo<{ phase: Phase; failure?: string }>(() => {
    if (detailError) return { phase: 'error', failure: detailError };
    if (!detail) return { phase: 'checking' };
    if (!detail.playable || !entryUrl) return { phase: 'error', failure: `${detail.game.title} is coming soon.` };
    if (mode !== 'online' && !detail.game.modes.includes(mode)) return { phase: 'error', failure: `${detail.game.title} has no ${mode === 'bot' ? 'vs-bot' : 'pass-and-play'} mode.` };
    if (detail.game.build?.threads && !window.crossOriginIsolated) {
      return { phase: 'error', failure: 'This browser cannot run this game (it needs cross-origin isolation). Try the latest Chrome, Edge, Firefox, or Safari.' };
    }
    if ((detail.game.build?.sizeMb ?? 0) > DATA_WARNING_MB && isOnMeteredConnection()) return { phase: 'confirm-data' };
    return { phase: 'loading' };
  }, [detail, detailError, entryUrl, mode]);

  const effectivePhase: Phase = phase === 'checking' || (phase === 'loading' && preflight.phase !== 'loading') ? preflight.phase : phase;
  const effectiveFailure = failure ?? preflight.failure ?? null;

  const post = useCallback(
    (message: Omit<HostToGame, 'ns'> & { payload?: unknown }) => {
      if (!frameRef.current?.contentWindow || !frameOrigin) return;
      frameRef.current.contentWindow.postMessage({ ns: BRIDGE_NAMESPACE, ...message }, frameOrigin);
    },
    [frameOrigin]
  );

  const environment = useCallback(
    (): BridgeInit['environment'] => ({
      platform: /android/i.test(navigator.userAgent) && 'ReactNativeWebView' in window ? 'android' : /iphone|ipad/i.test(navigator.userAgent) && 'ReactNativeWebView' in window ? 'ios' : 'web',
      locale: navigator.language || 'en-IN',
      theme,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      muted,
    }),
    [theme, muted]
  );

  const sendInit = useCallback(async () => {
    try {
      let init: BridgeInit;
      if (roomId) {
        ({ init } = await api.post<{ init: BridgeInit }>(`/api/games/rooms/${roomId}/session`, { environment: environment() }));
        // A first rated game starts from the default rating.
        ratingBefore.current = init.player.rating ?? DEFAULT_RATING;
      } else {
        init = {
          protocol: BRIDGE_PROTOCOL_VERSION,
          gameId,
          mode,
          player: { id: me?.id ?? 'me', name: me?.name ?? 'You', avatar: '', rating: null, seat: 0 },
          room: null,
          network: { transport: 'none', url: null, ticket: null, iceServers: [], expectedPeerId: null },
          bot: mode === 'bot' ? { difficulty } : null,
          environment: environment(),
        };
      }
      post({ type: 'init', payload: init } as never);
    } catch (caught) {
      setFailure(errorMessage(caught));
      setPhase('error');
    }
  }, [roomId, gameId, mode, me, difficulty, environment, post]);

  const finishOnline = useCallback(async (result: GameResult) => {
    if (!roomId) return;
    try {
      const { state } = await api.post<{ state: string }>(`/api/games/rooms/${roomId}/result`, { result });
      if (state === 'pending') setStatus('Waiting for the other players to confirm the result…');
    } catch (caught) {
      toast.error('Could not record the result', errorMessage(caught));
    }
  }, [roomId, toast]);

  const finishSolo = useCallback(async (result: GameResult) => {
    try {
      const { points } = await api.post<{ points: number }>('/api/games/solo', { gameId, mode, result });
      const mine = result.standings.find((s) => s.playerId === me?.id);
      const won = mode === 'bot' ? mine?.placement === 1 && result.standings.filter((s) => s.placement === 1).length === 1 : null;
      setOutcome({
        title: mode === 'local' ? 'Game over' : won ? 'You won 🎉' : mine?.placement === 1 ? "It's a draw" : 'The bot won this one',
        body: result.summary ?? '',
        delta: null,
        points,
      });
    } catch {
      // Recording is best-effort for solo play; the game itself already ended.
    }
  }, [gameId, mode, me]);

  // Bridge: messages from the game.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== frameOrigin) return;
      const msg = parseGameMessage(event.data);
      if (!msg) return;
      switch (msg.type) {
        case 'ready':
          if (msg.payload.protocol > BRIDGE_PROTOCOL_VERSION) {
            setFailure('This game needs a newer version of the app. Refresh to update.');
            setPhase('error');
            return;
          }
          void sendInit();
          break;
        case 'started':
          setPhase('playing');
          break;
        case 'status':
          setStatus(msg.payload.text);
          break;
        case 'result':
          setPhase('playing');
          if (reported.current && mode === 'online') return;
          reported.current = mode === 'online';
          if (mode === 'online') void finishOnline(msg.payload);
          else void finishSolo(msg.payload);
          break;
        case 'achievement':
          toast.success('Achievement', msg.payload.label);
          break;
        case 'haptic':
          navigator.vibrate?.({ light: 10, medium: 25, heavy: 50 }[msg.payload.style]);
          break;
        case 'invite':
          void navigator.clipboard?.writeText(`${window.location.origin}/games/room/${roomId}`);
          toast.success('Invite link copied');
          break;
        case 'exit':
          router.push(backHref);
          break;
        case 'log':
          (msg.payload.level === 'error' ? console.error : console.info)(`[game:${gameId}]`, msg.payload.message);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameOrigin, sendInit, finishOnline, finishSolo, mode, toast, router, backHref, gameId, roomId]);

  // A started game shows itself even if it never calls `started`.
  useEffect(() => {
    if (effectivePhase !== 'loading') return;
    const timer = setTimeout(() => setPhase((p) => (p === 'loading' || p === 'checking' ? 'playing' : p)), 20_000);
    return () => clearTimeout(timer);
  }, [effectivePhase, attempt]);

  // Online: watch the room for leavers and the final result.
  useTopic(roomId ? topics.gameRoom(roomId) : null, async (envelope) => {
    if (isEvent(envelope, 'game.room.updated')) {
      const room = envelope.data.room as RoomView;
      for (const seat of room.seats) {
        const before = seatsRef.current.find((s) => s.seat === seat.seat);
        if (seat.left && before && !before.left && seat.user) post({ type: 'player_left', payload: { playerId: seat.user._id } } as never);
      }
      seatsRef.current = room.seats;
    } else if (isEvent(envelope, 'game.room.finished')) {
      const fresh = await api.get<GameDetail>(`/api/games/${gameId}`).catch(() => null);
      const { room } = await api.get<{ room: RoomView }>(`/api/games/rooms/${roomId}`);
      const mine = room.result?.standings.find((s) => s.playerId === me?.id);
      const wins = room.result?.standings.filter((s) => s.placement === 1).length ?? 0;
      const after = fresh?.me?.rating ?? null;
      setOutcome({
        title: room.disputed ? 'Result disputed' : mine?.placement === 1 ? (wins > 1 ? "It's a draw" : 'You won 🎉') : 'Good game',
        body: room.disputed ? 'Players reported different results, so ratings did not change.' : room.result?.summary ?? '',
        delta: room.rated && after !== null && ratingBefore.current !== null ? after - ratingBefore.current : null,
        points: 0,
      });
      setAfter((current) => ({ ...current, tournament: room.tournament }));
      setStatus('Game over');
      setPhase('finished');
    } else if (isEvent(envelope, 'game.room.rematch')) {
      setAfter((current) => ({ ...current, rematchFrom: envelope.data.from }));
    }
  });

  /** Opens the rematch lobby, or sits down at the one another player opened. */
  const rematch = async () => {
    setRematching(true);
    try {
      const { room } = await api.post<{ room: RoomView }>(`/api/games/rooms/${roomId}`, { action: 'rematch' });
      router.push(`/games/room/${room._id}`);
    } catch (caught) {
      toast.error('Could not set up the rematch', errorMessage(caught));
      setRematching(false);
    }
  };

  // Pause when hidden; keep the screen awake while playing.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const onVisibility = async () => {
      if (document.hidden) {
        post({ type: 'pause' });
        await lock?.release().catch(() => undefined);
        lock = null;
      } else {
        post({ type: 'resume' });
        if (effectivePhase === 'playing') lock = await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request('screen').catch(() => null) ?? null;
      }
    };
    void onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release().catch(() => undefined);
    };
  }, [post, effectivePhase]);

  useEffect(() => {
    post({ type: 'theme', payload: { theme } } as never);
  }, [theme, post]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleMute = () => {
    setMuted((m) => {
      post({ type: 'mute', payload: { muted: !m } } as never);
      return !m;
    });
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else {
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
      if (detail?.game.orientation === 'landscape' || detail?.game.orientation === 'portrait') {
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.(detail.game.orientation).catch(() => undefined);
      }
    }
  };

  const exit = async () => {
    if (mode === 'online' && effectivePhase === 'playing' && !outcome) {
      const ok = await confirm({
        title: 'Leave the game?',
        body: 'Leaving a game in progress counts as a resignation.',
        confirmLabel: 'Leave',
        destructive: true,
      });
      if (!ok) return;
      await api.post(`/api/games/rooms/${roomId}`, { action: 'leave' }).catch(() => undefined);
    }
    router.push(backHref);
  };

  const replay = () => {
    reported.current = false;
    setOutcome(null);
    setPhase('loading');
    setAttempt((a) => a + 1);
  };

  const showFrame = effectivePhase === 'loading' || effectivePhase === 'playing' || effectivePhase === 'finished';

  return (
    <div className={cn(styles.player, detail?.game.orientation === 'landscape' && styles.landscapeOnly)}>
      <header className={styles.playerBar}>
        <button className={styles.barButton} onClick={exit} aria-label="Leave game"><ArrowLeft size={18} /></button>
        <span className={styles.playerTitle}>{detail?.game.title ?? 'Loading…'}</span>
        <span className={styles.playerStatus} aria-live="polite">{status || (mode === 'bot' ? `vs bot · ${difficulty}` : mode === 'local' ? 'Pass & play' : '')}</span>
        {roomId && (
          <button className={styles.barButton} onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/games/room/${roomId}`); toast.success('Link copied — anyone with it can watch'); }} aria-label="Copy invite link" title="Invite to watch">
            <UserPlus size={17} />
          </button>
        )}
        <button className={styles.barButton} onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
        <button className={styles.barButton} onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
      </header>

      <div className={styles.stage}>
        {showFrame && frameSrc && (
          <iframe
            key={attempt}
            ref={frameRef}
            className={styles.frame}
            src={frameSrc}
            title={detail?.game.title ?? 'Game'}
            allow="autoplay; fullscreen; gamepad; clipboard-write; screen-wake-lock; accelerometer; gyroscope"
            // Same-origin builds need scripts + same-origin for storage and workers.
            sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups"
            onError={() => {
              setFailure('The game failed to load.');
              setPhase('error');
            }}
          />
        )}

        {effectivePhase === 'checking' && (
          <div className={styles.overlay}><div className={styles.spinner} aria-label="Loading" /></div>
        )}

        {effectivePhase === 'loading' && (
          <div className={styles.overlay} style={{ pointerEvents: 'none', background: 'transparent', backdropFilter: 'none' }}>
            <div className={styles.overlayCard} style={{ boxShadow: 'none', background: 'transparent', border: 0 }}>
              <div className={styles.spinner} aria-label="Loading game" />
              <span className="muted">Loading {detail?.game.title}{detail?.game.build?.sizeMb ? ` · ${detail.game.build.sizeMb} MB` : ''}…</span>
            </div>
          </div>
        )}

        {effectivePhase === 'confirm-data' && (
          <div className={styles.overlay}>
            <div className={styles.overlayCard}>
              <Smartphone size={32} />
              <div className={styles.overlayTitle}>This game is {detail?.game.build?.sizeMb} MB</div>
              <p className="muted">You seem to be on mobile data. It is downloaded once and cached after that.</p>
              <div className="row gap-2">
                <Button variant="ghost" onClick={() => router.push(backHref)}>Not now</Button>
                <Button onClick={() => setPhase('loading')}>Download & play</Button>
              </div>
            </div>
          </div>
        )}

        {effectivePhase === 'error' && (
          <div className={styles.overlay}>
            <div className={styles.overlayCard}>
              <div className={styles.overlayTitle}>Can’t start this game</div>
              <p className="muted">{effectiveFailure}</p>
              <Button onClick={() => router.push(backHref)}>Back</Button>
            </div>
          </div>
        )}

        {outcome && (
          <div className={styles.overlay}>
            <div className={styles.overlayCard}>
              <div className={styles.overlayTitle}>{outcome.title}</div>
              {outcome.body && <p className="muted">{outcome.body}</p>}
              {outcome.delta !== null && (
                <div className={cn(styles.delta, outcome.delta >= 0 ? styles.deltaUp : styles.deltaDown)}>
                  {outcome.delta >= 0 ? '+' : ''}{outcome.delta} rating
                </div>
              )}
              {outcome.points > 0 && <span className="muted">+{outcome.points} points</span>}
              {mode === 'online' && after.rematchFrom && !after.tournament && <p className="muted" role="status">{after.rematchFrom} wants a rematch.</p>}
              <div className="row gap-2 wrap" style={{ justifyContent: 'center' }}>
                <Button variant="ghost" onClick={() => router.push(`/games/${gameId}`)}>Done</Button>
                {mode === 'online' && after.tournament ? (
                  <Button icon={<Trophy size={15} />} onClick={() => router.push(`/tournaments/${after.tournament}`)}>Back to the bracket</Button>
                ) : mode === 'online' ? (
                  <Button icon={<RotateCcw size={15} />} loading={rematching} onClick={rematch}>{after.rematchFrom ? 'Join the rematch' : 'Play again'}</Button>
                ) : (
                  <Button variant="secondary" onClick={() => setOutcome(null)}>Keep playing</Button>
                )}
              </div>
              {mode !== 'online' && <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={replay}>Restart</Button>}
            </div>
          </div>
        )}

        <div className={cn(styles.overlay, styles.rotateHint)} style={{ pointerEvents: 'none' }}>
          <div className={styles.overlayCard}>
            <RotateCcw size={28} />
            <div className={styles.overlayTitle}>Turn your phone sideways</div>
          </div>
        </div>
      </div>
      {dialog}
    </div>
  );
}
