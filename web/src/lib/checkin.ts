import type { EventDoc } from '../api/types';
import { checkinWindow, danishTime, hasTime } from './time';

export function windowOf(ev: Pick<EventDoc, 'date' | 'time' | 'checkinFrom' | 'checkinUntil'>): { from: number; until: number } | null {
  if (ev.checkinFrom && ev.checkinUntil) return { from: ev.checkinFrom, until: ev.checkinUntil };
  return checkinWindow(ev.date, ev.time);
}

export const countsAsTraining = (ev: Pick<EventDoc, 'sport'>) => ev.sport !== 'socialt';

export function checkinOpen(ev: EventDoc, now = Date.now()): boolean {
  if (ev.cancelled || !countsAsTraining(ev)) return false;
  const w = windowOf(ev);
  return !!w && now >= w.from && now <= w.until;
}

export function feedbackOpen(ev: Pick<EventDoc, 'date' | 'time' | 'cancelled'>, now = Date.now()): boolean {
  if (ev.cancelled) return false;
  const start = danishTime(ev.date, hasTime(ev.time) ? ev.time : '12:00');
  return start !== null && now >= start + 3600e3 && now <= start + 14 * 864e5;
}
