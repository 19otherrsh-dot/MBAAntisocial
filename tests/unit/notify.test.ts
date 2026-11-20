import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateIcs } from '@/lib/calendar';
import { EmailChannel, type Delivery } from '@/lib/notify/channels';

test('calendar invites escape text, fold long lines, and keep a stable uid', () => {
  const ics = generateIcs({
    uid: 'slot-abc@mbaantisocial',
    title: 'Mock Interview with Priya, IIM; Ahmedabad',
    description: 'Line one\nLine two — '.repeat(10),
    startTime: new Date('2026-03-10T13:30:00Z'),
    endTime: new Date('2026-03-10T14:15:00Z'),
    sequence: 2,
  });
  assert.match(ics, /UID:slot-abc@mbaantisocial/);
  assert.match(ics, /SEQUENCE:2/);
  assert.match(ics, /SUMMARY:Mock Interview with Priya\\, IIM\; Ahmedabad/);
  assert.match(ics, /DTSTART:20260310T133000Z/);
  // Every physical line fits in 75 octets.
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.match(generateIcs({ uid: 'x', title: 't', description: '', startTime: new Date(), endTime: new Date(), cancelled: true }), /METHOD:CANCEL[\s\S]*STATUS:CANCELLED/);
});

const delivery = (kind: Delivery['notification']['kind'], email = true): Delivery => ({
  notification: { _id: 'n1', kind, title: 't', body: '', href: '/home' },
  recipient: { id: 'u1', name: 'A', email: 'a@iima.ac.in', prefs: { email } },
});

test('email carries time-bound notifications only, and respects the preference', () => {
  const channel = new EmailChannel();
  assert.equal(channel.accepts(delivery('session_reminder')), true);
  assert.equal(channel.accepts(delivery('slot_booked')), true);
  assert.equal(channel.accepts(delivery('post_reply')), false);
  assert.equal(channel.accepts(delivery('badge_earned')), false);
  assert.equal(channel.accepts(delivery('session_reminder', false)), false);
});
