import { useColorScheme } from '@/hooks/use-color-scheme';

/** The web app's design tokens, so both feel like one product. */
export const palette = {
  light: {
    bg: '#faf9f6',
    sunken: '#f2f0ea',
    surface: '#ffffff',
    surfaceHover: '#f6f4ef',
    text: '#17161c',
    textSecondary: '#5a5866',
    textMuted: '#8b8896',
    line: '#e3e0d7',
    lineStrong: '#cdc9bd',
    accent: '#5b4bff',
    accentSoft: '#ecebff',
    accentText: '#4335d6',
    onAccent: '#ffffff',
    teal: '#00967a',
    tealSoft: '#dcf5ef',
    amber: '#b4700a',
    amberSoft: '#fdf0d8',
    rose: '#d4344b',
    roseSoft: '#fde8ea',
    blue: '#1d6ff2',
  },
  dark: {
    bg: '#100f14',
    sunken: '#0a090d',
    surface: '#1a181f',
    surfaceHover: '#262330',
    text: '#f3f1ee',
    textSecondary: '#a8a4b3',
    textMuted: '#78748a',
    line: '#2c2936',
    lineStrong: '#423d52',
    accent: '#8b7dff',
    accentSoft: '#221e3d',
    accentText: '#b3a9ff',
    onAccent: '#17161c',
    teal: '#2bc9a4',
    tealSoft: '#0e2b26',
    amber: '#e0a340',
    amberSoft: '#33240c',
    rose: '#f2707f',
    roseSoft: '#3a1620',
    blue: '#5c9dff',
  },
} as const;

export type Palette = { [K in keyof typeof palette.light]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, full: 999 } as const;

export function useTheme(): Palette {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
