/**
 * Colour helpers for user- and data-chosen fills that carry white text
 * (server icons, club initials). Stored colours stay as chosen; rendering
 * darkens one only as far as WCAG AA needs.
 */

const AA_NORMAL = 4.5;

function channels(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between a colour and white. */
export function contrastWithWhite(hex: string): number {
  const rgb = channels(hex);
  return rgb ? 1.05 / (luminance(rgb) + 0.05) : 1;
}

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function fromHsl([h, s, l]: [number, number, number]): string {
  const hue = (p: number, q: number, t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rgb = s === 0 ? [l, l, l] : [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  return `#${rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The colour itself when white text on it meets AA, otherwise the same hue
 * darkened just enough. Anything unparseable is returned untouched.
 */
export function backgroundForWhiteText(hex: string): string {
  const rgb = channels(hex);
  if (!rgb || contrastWithWhite(hex) >= AA_NORMAL) return hex;
  const [h, s, l] = toHsl(rgb);
  for (let next = l - 0.01; next > 0; next -= 0.01) {
    const candidate = fromHsl([h, s, next]);
    if (contrastWithWhite(candidate) >= AA_NORMAL) return candidate;
  }
  return '#000000';
}
