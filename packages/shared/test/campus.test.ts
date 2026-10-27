import { describe, expect, it } from 'vitest';
import { domainMatches, emailDomain, featureAvailable, isPersonalEmailDomain, looksAcademic, densityProgress, slugify } from '../src/campus';

describe('campus identity', () => {
  it('extracts and normalises the domain', () => {
    expect(emailDomain('Priya@IIMA.ac.in')).toBe('iima.ac.in');
    expect(emailDomain('no-at-sign')).toBe('');
  });

  it('matches subdomains on a dot boundary only', () => {
    expect(domainMatches('alumni.iima.ac.in', 'iima.ac.in')).toBe(true);
    expect(domainMatches('iima.ac.in', 'iima.ac.in')).toBe(true);
    expect(domainMatches('fakeiima.ac.in', 'iima.ac.in')).toBe(false);
  });

  it('rejects consumer mailboxes, including regional variants', () => {
    expect(isPersonalEmailDomain('gmail.com')).toBe(true);
    expect(isPersonalEmailDomain('yahoo.co.uk')).toBe(true);
    expect(isPersonalEmailDomain('iima.ac.in')).toBe(false);
    expect(looksAcademic('gmail.com')).toBe(false);
  });

  it('recognises academic domains', () => {
    expect(looksAcademic('iimb.ac.in')).toBe(true);
    expect(looksAcademic('spjimr.org')).toBe(true);
    expect(looksAcademic('stanford.edu')).toBe(true);
    expect(looksAcademic('acme.com')).toBe(false);
  });

  it('gates campus features on the campus edition', () => {
    expect(featureAvailable('news', 'open')).toBe(true);
    expect(featureAvailable('sessions', 'open')).toBe(false);
    expect(featureAvailable('sessions', 'campus')).toBe(true);
    expect(featureAvailable('news', 'none')).toBe(false);
  });

  it('measures density by the slower gate', () => {
    const p = densityProgress({ members: 40, mentors: 1 });
    expect(p.ready).toBe(false);
    expect(p.overall).toBeCloseTo(0.2);
  });

  it('slugifies names', () => {
    expect(slugify('IIM Ahmedabad')).toBe('iim-ahmedabad');
    expect(slugify('  SP Jain — Mumbai ')).toBe('sp-jain-mumbai');
  });
});
