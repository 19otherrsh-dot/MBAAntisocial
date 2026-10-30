import { describe, expect, it } from 'vitest';
import { backgroundForWhiteText, contrastWithWhite } from '../src/lib/color';

describe('backgroundForWhiteText', () => {
  it('leaves colours that already pass untouched', () => {
    expect(backgroundForWhiteText('#5b4bdb')).toBe('#5b4bdb');
    expect(backgroundForWhiteText('#495057')).toBe('#495057');
  });

  it('darkens failing colours just enough, keeping the hue', () => {
    for (const hex of ['#d9480f', '#0c8599', '#e67700', '#2b8a3e', '#ffffff', '#a9b8b5']) {
      const out = backgroundForWhiteText(hex);
      expect(contrastWithWhite(out)).toBeGreaterThanOrEqual(4.5);
      expect(contrastWithWhite(out)).toBeLessThan(4.9);
    }
  });

  it('passes anything it cannot parse through', () => {
    expect(backgroundForWhiteText('var(--accent)')).toBe('var(--accent)');
    expect(backgroundForWhiteText('')).toBe('');
  });
});
