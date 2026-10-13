export type ThemeMode = 'system' | 'light' | 'dark' | 'black';
export type Accent = 'violet' | 'blue' | 'teal' | 'green' | 'lime' | 'gold' | 'orange' | 'red' | 'pink' | 'graphite';
export type TextSize = 'normal' | 'large' | 'xlarge';
export interface Appearance {
  mode: ThemeMode;
  accent: Accent;
  size: TextSize;
  contrast: boolean;
  motion: boolean;
  haptics: boolean;
}

export const MODES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Som telefonen' },
  { key: 'light', label: 'Lys' },
  { key: 'dark', label: 'Mørk' },
  { key: 'black', label: 'Sort' },
];

export const ACCENTS: { key: Accent; label: string; swatch: string }[] = [
  { key: 'violet', label: 'Lilla', swatch: '#6B4E9B' },
  { key: 'blue', label: 'Blå', swatch: '#2E62B5' },
  { key: 'teal', label: 'Turkis', swatch: '#0A7F8F' },
  { key: 'green', label: 'Grøn', swatch: '#237563' },
  { key: 'lime', label: 'Lime', swatch: '#5C8A1A' },
  { key: 'gold', label: 'Guld', swatch: '#B98A10' },
  { key: 'orange', label: 'Orange', swatch: '#C0590F' },
  { key: 'red', label: 'Rød', swatch: '#C0322A' },
  { key: 'pink', label: 'Pink', swatch: '#C23C7A' },
  { key: 'graphite', label: 'Grafit', swatch: '#3D444B' },
];

export const SIZES: { key: TextSize; label: string; zoom: number }[] = [
  { key: 'normal', label: 'Normal', zoom: 1 },
  { key: 'large', label: 'Større', zoom: 1.1 },
  { key: 'xlarge', label: 'Størst', zoom: 1.2 },
];

export const DEFAULT_APPEARANCE: Appearance = { mode: 'system', accent: 'violet', size: 'normal', contrast: false, motion: true, haptics: true };

const KEY = 'oo.appearance';
const PAPER: Record<Exclude<ThemeMode, 'system'>, string> = { light: '#EEF0EB', dark: '#0F120F', black: '#000000' };

let current: Appearance = { ...DEFAULT_APPEARANCE };
export const appearance = () => current;

export function loadAppearance(): Appearance {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Appearance>;
    return {
      mode: MODES.some((m) => m.key === v.mode) ? v.mode! : 'system',
      accent: ACCENTS.some((a) => a.key === v.accent) ? v.accent! : 'violet',
      size: SIZES.some((s) => s.key === v.size) ? v.size! : 'normal',
      contrast: v.contrast === true,
      motion: v.motion !== false,
      haptics: v.haptics !== false,
    };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}

const setData = (key: string, value: string | null) => {
  const root = document.documentElement;
  if (value === null) delete root.dataset[key]; else root.dataset[key] = value;
};

export function applyAppearance(a: Appearance) {
  current = a;
  setData('theme', a.mode === 'system' ? null : a.mode);
  setData('accent', a.accent === 'violet' ? null : a.accent);
  setData('size', a.size === 'normal' ? null : a.size);
  setData('contrast', a.contrast ? 'high' : null);
  setData('motion', a.motion ? null : 'off');
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    if (m.dataset.media === undefined) m.dataset.media = m.getAttribute('media') || '';
    const media = m.dataset.media;
    if (a.mode === 'system') {
      if (media) m.setAttribute('media', media); else m.removeAttribute('media');
      m.content = media.includes('dark') ? PAPER.dark : PAPER.light;
    } else {
      m.removeAttribute('media');
      m.content = PAPER[a.mode];
    }
  });
}

export function saveAppearance(a: Appearance) {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {  }
  applyAppearance(a);
}
