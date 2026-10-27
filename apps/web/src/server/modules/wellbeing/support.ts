/**
 * National helplines (India). Free, confidential, and staffed by trained
 * counsellors. Kept in one place so the web and native apps show the same list.
 */
export const HELPLINES = [
  { name: 'Tele-MANAS', detail: 'Government of India mental-health helpline, 24×7, many languages', phone: '14416', alt: '1-800-891-4416' },
  { name: 'KIRAN', detail: 'Ministry of Social Justice helpline, 24×7', phone: '1800-599-0019' },
  { name: 'iCall (TISS)', detail: 'Psychosocial helpline by trained counsellors, Mon–Sat 10am–8pm', phone: '9152987821' },
  { name: 'Vandrevala Foundation', detail: '24×7 calls and WhatsApp', phone: '+91 9999 666 555' },
] as const;

export const EMERGENCY = { name: 'Emergency services', phone: '112' };

/**
 * A gentle nudge when the last week looks heavy — never a diagnosis, never a
 * streak guilt-trip, and never shared with anyone.
 */
export function supportSuggestion(recentMoods: number[]): 'reach_out' | null {
  const lastFive = recentMoods.slice(0, 5);
  if (lastFive.filter((m) => m <= 2).length >= 3) return 'reach_out';
  return null;
}
