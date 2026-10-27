import { describe, expect, it } from 'vitest';
import {
  gameManifestSchema, rateMatch, resolveConsensus, standingsKey, validateStandings,
  seedOrder, singleEliminationFirstRound, roundRobinSchedule, roomCode, ROOM_CODE_PATTERN, parseSignalFrame, parseGameMessage,
} from '../src/games';

describe('manifest', () => {
  it('requires a transport for online games', () => {
    const r = gameManifestSchema.safeParse({ id: 'ludo', title: 'Ludo', category: 'board', minPlayers: 2, maxPlayers: 4, modes: ['online'] });
    expect(r.success).toBe(false);
  });
  it('accepts a coming-soon game without a build', () => {
    const r = gameManifestSchema.safeParse({
      id: 'chess', title: 'Chess', category: 'strategy', minPlayers: 2, maxPlayers: 2,
      modes: ['online', 'bot', 'local'], network: { transport: 'webrtc' },
    });
    expect(r.success).toBe(true);
  });
});

describe('ratings', () => {
  it('is zero-sum-ish for equal players', () => {
    const d = rateMatch([
      { playerId: 'a', rating: 1200, gamesPlayed: 20, placement: 1 },
      { playerId: 'b', rating: 1200, gamesPlayed: 20, placement: 2 },
    ]);
    expect(d.get('a')).toBe(12);
    expect(d.get('b')).toBe(-12);
  });
  it('rewards upsets more', () => {
    const d = rateMatch([
      { playerId: 'a', rating: 1000, gamesPlayed: 20, placement: 1 },
      { playerId: 'b', rating: 1400, gamesPlayed: 20, placement: 2 },
    ]);
    expect(d.get('a')!).toBeGreaterThan(12);
  });
  it('handles four-player placement', () => {
    const d = rateMatch(['a', 'b', 'c', 'd'].map((id, i) => ({ playerId: id, rating: 1200, gamesPlayed: 20, placement: i + 1 })));
    expect(d.get('a')!).toBeGreaterThan(0);
    expect(d.get('d')!).toBeLessThan(0);
  });
});

describe('consensus', () => {
  const r1 = standingsKey({ standings: [{ playerId: 'a', placement: 1 }, { playerId: 'b', placement: 2 }] });
  const r2 = standingsKey({ standings: [{ playerId: 'b', placement: 1 }, { playerId: 'a', placement: 2 }] });
  it('is order-independent', () => {
    expect(standingsKey({ standings: [{ playerId: 'b', placement: 2 }, { playerId: 'a', placement: 1 }] })).toBe(r1);
  });
  it('needs a strict majority', () => {
    expect(resolveConsensus([r1], 2).state).toBe('pending');
    expect(resolveConsensus([r1, r1], 2).state).toBe('accepted');
    expect(resolveConsensus([r1, r2], 2).state).toBe('disputed');
    expect(resolveConsensus([r1, r1, r2], 4).state).toBe('pending');
  });
  it('validates standings against seats', () => {
    expect(validateStandings({ standings: [{ playerId: 'a', placement: 1 }] }, ['a', 'b'])).toMatch(/every seated/);
    expect(validateStandings({ standings: [{ playerId: 'a', placement: 1 }, { playerId: 'b', placement: 2 }] }, ['a', 'b'])).toBeNull();
    expect(validateStandings({ standings: [{ playerId: 'a', placement: 1 }, { playerId: 'x', placement: 2 }] }, ['a', 'b'])).toMatch(/not seated/);
  });
});

describe('brackets', () => {
  it('seeds so 1 and 2 meet last', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
  it('gives byes to top seeds', () => {
    const m = singleEliminationFirstRound(['s1', 's2', 's3', 's4', 's5', 's6']);
    expect(m).toHaveLength(4);
    expect(m[0].byeWinner).toBe('s1');
    expect(m.filter((x) => x.byeWinner).length).toBe(2);
  });
  it('round robin covers every pair once', () => {
    const rounds = roundRobinSchedule(['a', 'b', 'c', 'd', 'e']);
    const pairs = rounds.flat().map(([x, y]) => [x, y].sort().join());
    expect(new Set(pairs).size).toBe(10);
    expect(pairs).toHaveLength(10);
  });
});

describe('codes and frames', () => {
  it('generates valid room codes', () => {
    for (let i = 0; i < 50; i += 1) expect(roomCode()).toMatch(ROOM_CODE_PATTERN);
  });
  it('parses signal frames', () => {
    expect(parseSignalFrame('{"type":4,"id":2,"data":"sdp"}')).toEqual({ type: 4, id: 2, data: 'sdp' });
    expect(parseSignalFrame('{"type":99,"id":2}')).toBeNull();
    expect(parseSignalFrame('nope')).toBeNull();
  });
  it('ignores foreign postMessages', () => {
    expect(parseGameMessage({ type: 'ready' })).toBeNull();
    expect(parseGameMessage({ ns: 'antisocial', type: 'ready', payload: { protocol: 1 } })).not.toBeNull();
  });
});
