export interface Visit { date: string; time?: string; sport?: string }

export interface Stats {
  trainings: number;
  streak: number;
  bestStreak: number;
  lastWeek: number;
  mornings: number;
  winter: number;
  sports: number;
  lastDate: string;
  weeks: Record<string, number>;
  bestWeek: number;
  weekends: number;
  evenings: number;
  comebacks: number;
  seasons: number;
  bySport: Record<string, number>;
}

export const EMPTY_STATS: Stats = {
  trainings: 0, streak: 0, bestStreak: 0, lastWeek: -1, mornings: 0, winter: 0, sports: 0, lastDate: '', weeks: {},
  bestWeek: 0, weekends: 0, evenings: 0, comebacks: 0, seasons: 0, bySport: {},
};

const parts = (date: string) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');

export function weekIndex(date: string): number {
  const d = parts(date);
  if (!d) return NaN;
  return Math.floor((Date.UTC(+d[1], +d[2] - 1, +d[3]) / 864e5 + 3) / 7);
}

const hourOf = (time: string | undefined) => (/^\d{1,2}:\d{2}$/.test(time || '') ? Number((time || '').split(':')[0]) : null);

export function computeStats(visits: Visit[]): Stats {
  const list = visits.filter((v) => v && Number.isFinite(weekIndex(v.date)));
  if (!list.length) return { ...EMPTY_STATS, weeks: {}, bySport: {} };
  const weeks = [...new Set(list.map((v) => weekIndex(v.date)))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = Number.NaN, comebacks = 0;
  for (const w of weeks) {
    run = w === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    if (w - prev >= 5) comebacks++;
    prev = w;
  }
  const last = weeks[weeks.length - 1];
  const perWeek: Record<string, number> = {}, allWeeks = new Map<number, number>(), bySport: Record<string, number> = {};
  const seasons = new Set<number>();
  let weekends = 0;
  for (const v of list) {
    const w = weekIndex(v.date);
    allWeeks.set(w, (allWeeks.get(w) || 0) + 1);
    if (w > last - 26) perWeek[String(w)] = (perWeek[String(w)] || 0) + 1;
    const sport = v.sport || 'andet';
    bySport[sport] = (bySport[sport] || 0) + 1;
    const d = parts(v.date)!;
    const day = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])).getUTCDay();
    if (day === 0 || day === 6) weekends++;
    seasons.add(Math.floor((+d[2] % 12) / 3));
  }
  return {
    trainings: list.length,
    streak: run,
    bestStreak: best,
    lastWeek: last,
    mornings: list.filter((v) => { const h = hourOf(v.time); return h !== null && h < 8; }).length,
    winter: list.filter((v) => v.sport === 'vinterbadning').length,
    sports: new Set(list.map((v) => v.sport || 'andet').filter((s) => s !== 'socialt')).size,
    lastDate: list.reduce((m, v) => (v.date > m ? v.date : m), ''),
    weeks: perWeek,
    bestWeek: Math.max(...allWeeks.values()),
    weekends,
    evenings: list.filter((v) => { const h = hourOf(v.time); return h !== null && h >= 19; }).length,
    comebacks,
    seasons: seasons.size,
    bySport,
  };
}

export function weeksAway(s: Pick<Stats, 'lastWeek'> | null | undefined, today: string): number | null {
  if (!s || s.lastWeek < 0) return null;
  return Math.max(0, weekIndex(today) - s.lastWeek);
}

export function currentStreak(s: Pick<Stats, 'streak' | 'lastWeek'> | null | undefined, today: string): number {
  if (!s || s.lastWeek < 0) return 0;
  return weekIndex(today) - s.lastWeek <= 1 ? s.streak : 0;
}

export interface BadgeDef { id: string; name: string; desc: string; goal: number; value: (s: Stats) => number }

const n = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const sport = (s: Stats, k: string) => n(s.bySport?.[k]);

export const BADGES: BadgeDef[] = [
  { id: 'first', name: 'Første træning', desc: 'Checket ind til din første træning', goal: 1, value: (s) => n(s.trainings) },
  { id: 't5', name: '5 træninger', desc: 'Checket ind til 5 træninger', goal: 5, value: (s) => n(s.trainings) },
  { id: 't10', name: '10 træninger', desc: 'Checket ind til 10 træninger', goal: 10, value: (s) => n(s.trainings) },
  { id: 't25', name: '25 træninger', desc: 'Checket ind til 25 træninger', goal: 25, value: (s) => n(s.trainings) },
  { id: 't50', name: '50 træninger', desc: 'Checket ind til 50 træninger', goal: 50, value: (s) => n(s.trainings) },
  { id: 't100', name: '100 træninger', desc: 'Checket ind til 100 træninger', goal: 100, value: (s) => n(s.trainings) },
  { id: 't200', name: '200 træninger', desc: 'Checket ind til 200 træninger', goal: 200, value: (s) => n(s.trainings) },
  { id: 'w4', name: '4 uger i træk', desc: 'Trænet mindst én gang om ugen i 4 uger', goal: 4, value: (s) => n(s.bestStreak) },
  { id: 'w8', name: '8 uger i træk', desc: 'Trænet mindst én gang om ugen i 8 uger', goal: 8, value: (s) => n(s.bestStreak) },
  { id: 'w12', name: '12 uger i træk', desc: 'Trænet mindst én gang om ugen i 12 uger', goal: 12, value: (s) => n(s.bestStreak) },
  { id: 'w26', name: 'Et halvt år', desc: 'Trænet mindst én gang om ugen i 26 uger', goal: 26, value: (s) => n(s.bestStreak) },
  { id: 'w52', name: 'Et helt år', desc: 'Trænet mindst én gang om ugen i 52 uger', goal: 52, value: (s) => n(s.bestStreak) },
  { id: 'hattrick', name: 'Hattrick', desc: '3 træninger på én uge', goal: 3, value: (s) => n(s.bestWeek) },
  { id: 'early', name: 'Morgenfugl', desc: '10 træninger, der startede før kl. 8', goal: 10, value: (s) => n(s.mornings) },
  { id: 'evening', name: 'Natteravn', desc: '10 træninger, der startede kl. 19 eller senere', goal: 10, value: (s) => n(s.evenings) },
  { id: 'weekend', name: 'Weekendkriger', desc: '10 træninger i weekenden', goal: 10, value: (s) => n(s.weekends) },
  { id: 'winter', name: 'Isbader', desc: 'Vinterbadet med holdet 10 gange', goal: 10, value: (s) => n(s.winter) },
  { id: 'runner', name: 'Løbeben', desc: '10 løbeture med holdet', goal: 10, value: (s) => sport(s, 'lob') },
  { id: 'bars', name: 'Stangmester', desc: '10 gange calisthenics med holdet', goal: 10, value: (s) => sport(s, 'calisthenics') },
  { id: 'fitness', name: 'Fitnessfreak', desc: '10 gange fitness med holdet', goal: 10, value: (s) => sport(s, 'fitness') },
  { id: 'allround', name: 'Alsidig', desc: 'Trænet 4 forskellige slags træning', goal: 4, value: (s) => n(s.sports) },
  { id: 'seasons', name: 'Året rundt', desc: 'Trænet i alle fire årstider', goal: 4, value: (s) => n(s.seasons) },
  { id: 'comeback', name: 'Comeback', desc: 'Tilbage til træning efter mindst 4 uger væk', goal: 1, value: (s) => n(s.comebacks) },
];

export const badgeById = (id: string) => BADGES.find((b) => b.id === id);

export const earnedBadges = (s: Stats) => BADGES.filter((b) => b.value(s) >= b.goal).map((b) => b.id);
