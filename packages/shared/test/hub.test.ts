import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, DEFAULT_EVERYONE_PERMISSIONS, PERMISSIONS, computePermissions, hasPermission, parseMentions, canManageRole } from '../src/hub';

const everyone = { id: 'everyone', permissions: DEFAULT_EVERYONE_PERMISSIONS, position: 0 };
const mod = { id: 'mod', permissions: PERMISSIONS.MANAGE_MESSAGES, position: 5 };

describe('hub permissions', () => {
  it('gives the owner everything', () => {
    expect(computePermissions({ userId: 'a', ownerId: 'a', everyone, memberRoles: [] })).toBe(ALL_PERMISSIONS);
  });

  it('unions roles', () => {
    const p = computePermissions({ userId: 'u', ownerId: 'o', everyone, memberRoles: [mod] });
    expect(hasPermission(p, 'MANAGE_MESSAGES')).toBe(true);
    expect(hasPermission(p, 'SEND_MESSAGES')).toBe(true);
  });

  it('applies channel overwrites in order: everyone, roles, member', () => {
    const overwrites = [
      { target: 'everyone', kind: 'role' as const, allow: 0, deny: PERMISSIONS.SEND_MESSAGES },
      { target: 'mod', kind: 'role' as const, allow: PERMISSIONS.SEND_MESSAGES, deny: 0 },
    ];
    const plain = computePermissions({ userId: 'u', ownerId: 'o', everyone, memberRoles: [], overwrites });
    expect(hasPermission(plain, 'SEND_MESSAGES')).toBe(false);
    expect(hasPermission(plain, 'VIEW_CHANNEL')).toBe(true);

    const withRole = computePermissions({ userId: 'u', ownerId: 'o', everyone, memberRoles: [mod], overwrites });
    expect(hasPermission(withRole, 'SEND_MESSAGES')).toBe(true);

    const memberDenied = computePermissions({
      userId: 'u', ownerId: 'o', everyone, memberRoles: [mod],
      overwrites: [...overwrites, { target: 'u', kind: 'member', allow: 0, deny: PERMISSIONS.SEND_MESSAGES }],
    });
    expect(hasPermission(memberDenied, 'SEND_MESSAGES')).toBe(false);
  });

  it('returns nothing without VIEW_CHANNEL', () => {
    const p = computePermissions({
      userId: 'u', ownerId: 'o', everyone, memberRoles: [],
      overwrites: [{ target: 'everyone', kind: 'role', allow: 0, deny: PERMISSIONS.VIEW_CHANNEL }],
    });
    expect(p).toBe(0);
  });

  it('silences a timed-out member but lets them read', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const p = computePermissions({
      userId: 'u', ownerId: 'o', everyone, memberRoles: [], timedOutUntil: new Date('2026-01-01T01:00:00Z'), now,
    });
    expect(hasPermission(p, 'VIEW_CHANNEL')).toBe(true);
    expect(hasPermission(p, 'SEND_MESSAGES')).toBe(false);
  });

  it('administrator short-circuits overwrites', () => {
    const admin = { id: 'admin', permissions: PERMISSIONS.ADMINISTRATOR, position: 9 };
    const p = computePermissions({
      userId: 'u', ownerId: 'o', everyone, memberRoles: [admin],
      overwrites: [{ target: 'everyone', kind: 'role', allow: 0, deny: PERMISSIONS.VIEW_CHANNEL }],
    });
    expect(p).toBe(ALL_PERMISSIONS);
  });

  it('only manages roles strictly below', () => {
    expect(canManageRole(5, 5, false)).toBe(false);
    expect(canManageRole(5, 4, false)).toBe(true);
    expect(canManageRole(0, 9, true)).toBe(true);
  });

  it('parses mention tokens', () => {
    const id = 'a'.repeat(24);
    const m = parseMentions(`hey <@${id}> and <@${id}> @everyone <#${'b'.repeat(24)}>`);
    expect(m.users).toEqual([id]);
    expect(m.everyone).toBe(true);
    expect(m.channels).toHaveLength(1);
  });
});
