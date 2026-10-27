/** A starter bank of GD topics; matched rooms draw one at random. */
export const GD_TOPICS = [
  'Should India adopt a four-day work week?',
  'Quick commerce: genuine convenience or a cash-burning bubble?',
  'Is the MBA still worth it in the age of AI?',
  'Should UPI transactions carry a small fee to fund the ecosystem?',
  'Gig workers deserve the same protections as full-time employees.',
  'Is “Make in India” working? What would you change?',
  'Should companies be required to disclose the gender pay gap?',
  'Will electric two-wheelers overtake petrol ones in India by 2030?',
  'Work from office vs remote: which is better for early-career growth?',
  'Should social media platforms be held liable for misinformation?',
  'Is the startup valuation correction a healthy reset?',
  'Should India regulate cryptocurrencies or ban them?',
  'Ten-minute delivery: should it be regulated for rider safety?',
  'Is brand loyalty dead among Gen Z consumers?',
  'Should coaching centres be regulated like schools?',
  'Abstract: “Zero”.',
  'Abstract: “The last mile”.',
  'Abstract: “Red is the new green”.',
];

export function randomTopic(): string {
  return GD_TOPICS[Math.floor(Math.random() * GD_TOPICS.length)];
}

export const GD_RUBRIC = [
  { key: 'initiation', label: 'Initiation', help: 'Opened or redirected the discussion usefully.' },
  { key: 'content', label: 'Content', help: 'Facts, examples, and structure — not just opinion.' },
  { key: 'listening', label: 'Listening', help: 'Built on others instead of waiting to speak.' },
  { key: 'influence', label: 'Influence', help: 'Moved the group without steamrolling it.' },
  { key: 'conclusion', label: 'Conclusion', help: 'Helped the group land somewhere.' },
] as const;

export const GD_MIN_PARTICIPANTS = 4;
export const GD_MAX_PARTICIPANTS = 8;
