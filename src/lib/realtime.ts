/**
 * Channel names, shared by the server that publishes and the browser that
 * subscribes so the two cannot drift.
 *
 * Every channel is `private-`. Pusher delivers a public channel to anyone who
 * knows its name, and these names are built from ids that appear all over the
 * API — so the old `user-<id>` channel let any visitor holding the public app
 * key read another person's direct messages as they arrived. A private channel
 * can only be joined with a signature from `/api/pusher/auth`, which checks
 * that the caller is entitled to it.
 */
export const userChannel = (userId: string) => `private-user-${userId}`;
export const roomChannel = (roomId: string) => `private-room-${roomId}`;

export function parseChannel(name: string): { kind: 'user' | 'room'; id: string } | null {
  const match = /^private-(user|room)-([0-9a-f]{24})$/i.exec(name);
  if (!match) return null;
  return { kind: match[1] as 'user' | 'room', id: match[2] };
}
