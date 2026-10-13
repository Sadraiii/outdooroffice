export type BadgeIcon = 'flame' | 'sunrise' | 'wave' | 'grid4' | 'medal' | 'moon' | 'bolt' | 'weekend' | 'shoe' | 'bar' | 'dumbbell' | 'leaf' | 'undo';

export const BADGE_ART: Record<string, { text?: string; icon?: BadgeIcon; sub?: string }> = {
  first: { text: '1' }, t5: { text: '5' }, t10: { text: '10' }, t25: { text: '25' }, t50: { text: '50' }, t100: { text: '100' }, t200: { text: '200' },
  w4: { icon: 'flame', sub: '4' }, w8: { icon: 'flame', sub: '8' }, w12: { icon: 'flame', sub: '12' }, w26: { icon: 'flame', sub: '26' }, w52: { icon: 'flame', sub: '52' },
  hattrick: { icon: 'bolt', sub: '3' }, early: { icon: 'sunrise' }, evening: { icon: 'moon' }, weekend: { icon: 'weekend' },
  winter: { icon: 'wave' }, runner: { icon: 'shoe' }, bars: { icon: 'bar' }, fitness: { icon: 'dumbbell' },
  allround: { icon: 'grid4' }, seasons: { icon: 'leaf' }, comeback: { icon: 'undo' },
};

const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1-${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1-${r}-${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r}-${r}z`;
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0-${2 * r} 0`;

export const BADGE_PATHS: Record<BadgeIcon, string[]> = {
  flame: ['M12 21c-3.6 0-6-2.4-6-5.6 0-2.6 1.6-4.3 3-5.8.9-1 1.6-2.3 1.4-4.1 2.7 1.3 4.1 3.7 3.9 6.3.9-.4 1.6-1.2 1.9-2.3 1.2 1.3 1.8 3 1.8 4.9C18 18.6 15.6 21 12 21z'],
  sunrise: ['M3 18.5h18M7.5 18.5a4.5 4.5 0 0 1 9 0', 'M12 4v5M9.5 6.5 12 4l2.5 2.5M4.8 12l1.4 1.2M19.2 12l-1.4 1.2'],
  wave: ['M3 10.5c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5M3 15c1.5 0 1.5-1.5 3-1.5S7.5 15 9 15s1.5-1.5 3-1.5S13.5 15 15 15s1.5-1.5 3-1.5S19.5 15 21 15'],
  grid4: [rr(4.5, 4.5, 6, 6, 1.5), rr(13.5, 4.5, 6, 6, 1.5), rr(4.5, 13.5, 6, 6, 1.5), rr(13.5, 13.5, 6, 6, 1.5)],
  medal: ['M12 3l7.5 4.3v8.6L12 20.2 4.5 15.9V7.3z', 'M9 12l2 2 4-4'],
  moon: ['M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z', 'M17 3.8v2.6M15.7 5.1h2.6'],
  bolt: ['M13.2 2.8 5.6 13.2h5.8l-1 8 7.6-10.4h-5.8l1-8z'],
  weekend: [rr(3.5, 5, 17, 15.5, 2.5), 'M3.5 10h17M8 3v4M16 3v4', rr(13, 13, 4.5, 4.5, 1)],
  shoe: ['M2.5 18v-6.5c0-.6.4-1 1-1h2.2c.7 0 1.3-.4 1.6-1l1.5-3 3.6 4.2c.8.9 1.9 1.4 3.1 1.5l3 .3c1.7.2 3 1.6 3 3.3V18z', 'M2.5 15.5h19M10.4 8.6l-1.9 1.7M12.2 10.6l-1.9 1.7'],
  bar: ['M3 4.5h18M5.5 4.5V20M18.5 4.5V20M10 4.5l.9 3.6M14 4.5l-.9 3.6', circle(12, 9.9, 1.7), 'M12 11.6v4.2M12 15.8l-1.5 3.6M12 15.8l1.5 3.6'],
  dumbbell: [rr(5, 7, 3, 10, 1), rr(16, 7, 3, 10, 1), 'M3 10v4M21 10v4M8 12h8'],
  leaf: ['M5 19.5c0-8.4 5.6-13.8 14.5-14.5.2 9-5.4 14.5-14.5 14.5z', 'M5 19.5l7.5-7.5'],
  undo: ['M9 13.5 4.5 9 9 4.5', 'M4.5 9h10a5.5 5.5 0 0 1 0 11H11'],
};
