import type { Activity, Sport, Unit } from '../api/types';
import { fmt, formatDuration, formatPace, formatSpeed } from './format';

type Metric = 'distance' | 'reps' | 'duration' | 'none';

export const SPORTS: Record<Sport, { label: string; metric: Metric; tpl: [string, number, Unit][] }> = {
  calisthenics: { label: 'Calisthenics', metric: 'reps', tpl: [['Push-ups', 200, 'reps'], ['Pull-ups', 50, 'reps'], ['Dips', 100, 'reps'], ['Squats', 150, 'reps']] },
  fitness: { label: 'Fitness', metric: 'reps', tpl: [['Burpees', 100, 'reps'], ['Lunges', 100, 'reps'], ['Planke', 180, 'sek']] },
  lob: { label: 'Løb', metric: 'distance', tpl: [['Løb', 5, 'km']] },
  cykling: { label: 'Cykling', metric: 'distance', tpl: [['Cykling', 25, 'km']] },
  gang: { label: 'Gåtur', metric: 'distance', tpl: [['Gåtur', 5, 'km']] },
  yoga: { label: 'Yoga', metric: 'duration', tpl: [] },
  vinterbadning: { label: 'Vinterbadning', metric: 'duration', tpl: [] },
  socialt: { label: 'Socialt', metric: 'none', tpl: [] },
  andet: { label: 'Andet', metric: 'duration', tpl: [] },
};

export const SPORT_ORDER: Sport[] = ['calisthenics', 'fitness', 'lob', 'cykling', 'gang', 'yoga', 'vinterbadning', 'socialt', 'andet'];
export const WORKOUT_SPORTS: Sport[] = SPORT_ORDER.filter((s) => s !== 'socialt');
export const UNITS: Unit[] = ['reps', 'sek', 'min', 'km', 'm'];

export const sportLabel = (s?: string) => (s && s in SPORTS ? SPORTS[s as Sport].label : 'Andet');
export const sportMetric = (s?: string): Metric => (s && s in SPORTS ? SPORTS[s as Sport].metric : 'duration');

export function didPhrase(a: Pick<Activity, 'sport' | 'distanceKm' | 'durationSec' | 'reps' | 'title'>): string {
  const km = a.distanceKm ? `${fmt(a.distanceKm)} km` : '';
  const dur = a.durationSec ? formatDuration(a.durationSec) : '';
  switch (a.sport) {
    case 'lob': return km ? `løb ${km}` : 'var ude at løbe';
    case 'cykling': return km ? `cyklede ${km}` : 'var ude at cykle';
    case 'gang': return km ? `gik ${km}` : 'var på gåtur';
    case 'yoga': return dur ? `lavede yoga i ${dur}` : 'lavede yoga';
    case 'vinterbadning': return 'vinterbadede';
    case 'calisthenics':
    case 'fitness': {
      const total = (a.reps || []).filter((r) => !r.unit || r.unit === 'reps').reduce((s, r) => s + (r.count || 0), 0);
      return total ? `lavede ${fmt(total)} reps ${sportLabel(a.sport).toLowerCase()}` : `trænede ${sportLabel(a.sport).toLowerCase()}`;
    }
    default: return a.title ? `delte en træning` : 'trænede';
  }
}

export function activityStats(a: Activity): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (a.distanceKm) out.push({ label: 'Distance', value: `${fmt(a.distanceKm)} km` });
  if (a.durationSec) out.push({ label: 'Tid', value: formatDuration(a.durationSec) });
  if (a.distanceKm && a.durationSec) {
    if (a.sport === 'cykling') out.push({ label: 'Fart', value: formatSpeed(a.distanceKm, a.durationSec) });
    else out.push({ label: 'Tempo', value: formatPace(a.distanceKm, a.durationSec) });
  }
  if (!a.distanceKm && a.reps && a.reps.length) {
    const reps = a.reps.filter((r) => !r.unit || r.unit === 'reps').reduce((s, r) => s + r.count, 0);
    if (reps) out.unshift({ label: 'Reps i alt', value: fmt(reps) });
    out.push({ label: 'Øvelser', value: String(a.reps.length) });
  }
  return out.slice(0, 3);
}
