import { describe, expect, it } from 'vitest';
import { bulletHints, emptyResume, resumeDataSchema, resumeToText } from '../src/resume';

describe('bulletHints', () => {
  it('passes a strong, quantified bullet', () => {
    expect(bulletHints('Cut onboarding time 32% by redesigning the KYC flow across 4 branches')).toEqual([]);
  });
  it('flags duty-style openers and missing numbers', () => {
    expect(bulletHints('Responsible for managing client relationships')).toEqual(['weak_opener', 'no_number']);
  });
  it('treats a [X%] placeholder as a number to fill in later', () => {
    expect(bulletHints('Grew weekly active users by [X%] through referral nudges')).not.toContain('no_number');
  });
  it('flags filler, first person, and length', () => {
    const long = `Led ${'a very long series of initiatives '.repeat(6)}for 3 teams`;
    expect(bulletHints(long)).toContain('too_long');
    expect(bulletHints('Leveraged various tools to ship 2 dashboards')).toContain('filler');
    expect(bulletHints('I built 3 pricing models for my team')).toContain('first_person');
    expect(bulletHints('Ranked in the top 5% of the batch in Term I')).toEqual([]);
  });
  it('ignores bullets still being typed', () => {
    expect(bulletHints('Led')).toEqual([]);
  });
});

describe('resume data', () => {
  it('round-trips an empty resume through the schema', () => {
    expect(resumeDataSchema.parse(emptyResume())).toEqual(emptyResume());
  });
  it('rejects more bullets than fit a page', () => {
    const data = emptyResume();
    data.projects.push({ name: 'X', context: '', bullets: Array.from({ length: 9 }, () => 'b') });
    expect(resumeDataSchema.safeParse(data).success).toBe(false);
  });
  it('renders plain text in reading order and skips empty bullets', () => {
    const data = emptyResume();
    data.header.name = 'Sneha Rao';
    data.header.email = 'sneha@iima.ac.in';
    data.education.push({ school: 'IIM Ahmedabad', degree: 'PGP', start: '2025', end: '2027', detail: '' });
    data.experience.push({ org: 'Acme', role: 'Analyst', location: '', start: '2022', end: '', bullets: ['Built 3 models', ' '] });
    const text = resumeToText(data);
    expect(text.split('\n').slice(0, 2)).toEqual(['Sneha Rao', 'sneha@iima.ac.in']);
    expect(text).toContain('PGP, IIM Ahmedabad (2025–2027)');
    expect(text).toContain('Analyst, Acme (2022)');
    expect(text.indexOf('EDUCATION')).toBeLessThan(text.indexOf('EXPERIENCE'));
    expect(text.match(/•/g)).toHaveLength(1);
  });
});
