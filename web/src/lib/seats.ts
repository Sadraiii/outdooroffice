import type { EventDoc } from '../api/types';

export function allocateSeats(order: string[], currentGoing: string[], capacity: number | null): { going: string[]; waitlist: string[] } {
  const signedUp = [...new Set(order)];
  if (!capacity || capacity < 1) return { going: signedUp, waitlist: [] };
  const still = new Set(signedUp);
  const kept = [...new Set(currentGoing)].filter((u) => still.has(u));
  const keptSet = new Set(kept);
  const rest = signedUp.filter((u) => !keptSet.has(u));
  const free = Math.max(0, capacity - kept.length);
  return { going: [...kept, ...rest.slice(0, free)], waitlist: rest.slice(free) };
}

export type Place = { state: 'going' | 'waiting' | 'none'; pos: number; going: string[]; waitlist: string[] };

export function placeOf(ev: EventDoc, myRsvps: Set<string>, uid: string | undefined): Place {
  const going = ev.going.filter((u) => u !== uid);
  const waitlist = (ev.waitlist || []).filter((u) => u !== uid);
  if (!uid || !myRsvps.has(ev.id)) return { state: 'none', pos: 0, going, waitlist };
  if (ev.going.includes(uid)) return { state: 'going', pos: 0, going: ev.going, waitlist };
  const w = (ev.waitlist || []).indexOf(uid);
  if (w >= 0) return { state: 'waiting', pos: w + 1, going, waitlist: ev.waitlist };
  if (ev.capacity && going.length >= ev.capacity) return { state: 'waiting', pos: waitlist.length + 1, going, waitlist: [...waitlist, uid] };
  return { state: 'going', pos: 0, going: [...going, uid], waitlist };
}

export const isFull = (ev: EventDoc) => !!ev.capacity && ev.going.length >= ev.capacity;
export const signupClosed = (ev: EventDoc, now = Date.now()) => !!ev.signupUntil && now > ev.signupUntil;

export function millis(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  return null;
}

export function signupOrder(v: unknown, now = Date.now()): { uid: string; at: number }[] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>).map(([uid, t]) => ({ uid, at: millis(t) ?? now }))
    .sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1));
}

export const seatsFromSignups = (signups: unknown, capacity: number | null) =>
  allocateSeats(signupOrder(signups).map((r) => r.uid), [], capacity);
