'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Users, Clock, Trophy, Search, Swords } from 'lucide-react';
import { GAME_CATEGORIES, GAME_CATEGORY_META, type GameCategory } from '@mba/shared/games';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useApiQuery } from '@/lib/client/hooks';
import GameArt from '@/components/games/GameArt';
import Morph from '@/components/motion/Morph';
import Spotlight from '@/components/motion/Spotlight';
import JoinByCode from '@/components/games/JoinByCode';
import type { GameCardView, RoomView } from '@/components/games/types';
import gs from '@/components/games/games.module.css';
import styles from '../app.module.css';

type Filter = 'all' | GameCategory;

export default function GamesPage() {
  const { data } = useApiQuery<{ games: GameCardView[]; live: RoomView[]; activeTournaments: number }>('/api/games');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const games = useMemo(() => {
    const list = data?.games ?? [];
    return list
      .filter((g) => (filter === 'all' || g.category === filter) && (!q.trim() || g.title.toLowerCase().includes(q.trim().toLowerCase())))
      // Playable first, then the ones people are at right now.
      .sort((a, b) => Number(b.playable) - Number(a.playable) || b.openTables - a.openTables || a.title.localeCompare(b.title));
  }, [data, filter, q]);
  const titleOf = (id: string) => data?.games.find((g) => g.id === id)?.title ?? id;

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Games</h1>
          <p className={styles.pageSubtitle}>Board games, cards, and quick ones between lectures — online with your batch, against a bot, or pass-and-play.</p>
        </div>
        <div className="row gap-2 wrap">
          <JoinByCode />
          <Link href="/tournaments"><Button variant="ghost" icon={<Trophy size={15} />}>Tournaments{data?.activeTournaments ? ` · ${data.activeTournaments}` : ''}</Button></Link>
        </div>
      </div>

      {(data?.live.length ?? 0) > 0 && (
        <section className="stack gap-2">
          <h2 className={styles.sectionHead}>Your tables</h2>
          <div className="row gap-2 wrap">
            {data!.live.map((room) => (
              <Link key={room._id} href={room.status === 'playing' ? `/player/${room.game}?room=${room._id}` : `/games/room/${room._id}`}>
                <Button variant="secondary" icon={<Swords size={15} />}>
                  {titleOf(room.game)} · {room.status === 'playing' ? 'resume' : `lobby ${room.seats.length}/${room.maxPlayers}`}
                </Button>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className={gs.filters}>
        <div style={{ flex: '1 1 200px', maxWidth: 280 }}>
          <Input aria-label="Search games" placeholder="Search games" icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented
          ariaLabel="Category"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All' }, ...GAME_CATEGORIES.map((c) => ({ value: c, label: GAME_CATEGORY_META[c].label }))]}
        />
      </div>

      {!data ? (
        <div className={gs.grid}>{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ height: 250, borderRadius: 20 }} />)}</div>
      ) : games.length === 0 ? (
        <EmptyState title="No games match" body="Try another category or search." />
      ) : (
        <Spotlight>
        <div className={gs.grid} data-reveal="">
          {games.map((g) => (
            <Link key={g.id} href={`/games/${g.id}`} className={gs.card} data-spot="">
              <Morph name={`game-art-${g.id}`}><GameArt id={g.id} thumbnail={g.thumbnail} title={g.title} /></Morph>
              {!g.playable && <span className={gs.soon}><Chip tone="slate">Coming soon</Chip></span>}
              <div className={gs.cardBody}>
                <div className="row gap-2" style={{ justifyContent: 'space-between' }}>
                  <span className={gs.cardTitle}>{g.title}</span>
                  {g.me && g.rated && <Chip tone="violet">{g.me.rating}</Chip>}
                </div>
                <span className={gs.cardTagline}>{g.tagline}</span>
                <div className={gs.cardMeta}>
                  <span className="row gap-1"><Users size={12} /> {g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`}</span>
                  <span className="row gap-1"><Clock size={12} /> ~{g.estimatedMinutes} min</span>
                  {g.openTables > 0 && <span className="row gap-1"><span className={gs.liveDot} /> {g.openTables} open</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
        </Spotlight>
      )}
    </div>
  );
}
