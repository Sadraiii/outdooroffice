import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Activity, Api, AuthUser, EventDoc, InstagramFeed, Notice, TeamSettings, UserProfile } from './api/types';
import { placeOf } from './lib/seats';

export type SheetState =
  | { type: 'create' }
  | { type: 'event'; event?: EventDoc }
  | { type: 'workout'; eventId?: string }
  | { type: 'profile'; first?: boolean }
  | { type: 'appearance' }
  | { type: 'calendar' }
  | { type: 'share-activity'; activity: Activity }
  | { type: 'share-event'; event: EventDoc }
  | { type: 'share-recap'; event: EventDoc }
  | { type: 'share-badge'; badge: string; uid: string }
  | { type: 'nudge'; uid: string };

export type Celebration = { kind: 'badge'; badge: string } | { kind: 'program'; title: string };

export interface Toast { id: number; title: string; body?: string; link?: string }

interface Ctx {
  api: Api;
  user: AuthUser | null;
  authReady: boolean;
  me: UserProfile | null | undefined;
  users: Map<string, UserProfile>;
  following: Set<string>;
  followingReady: boolean;
  myRsvps: Set<string>;
  myKudos: Set<string>;
  events: EventDoc[];
  eventsReady: boolean;
  notices: Notice[];
  unread: number;
  instagram: InstagramFeed | null;
  team: TeamSettings;
  isAdmin: boolean;
  toasts: Toast[];
  toast: (title: string, opts?: { body?: string; link?: string }) => void;
  dismissToast: (id: number) => void;
  sheet: SheetState | null;
  openSheet: (s: SheetState) => void;
  closeSheet: () => void;
  celebration: Celebration | null;
  celebrate: (c: Celebration) => void;
  endCelebration: () => void;
  nameOf: (uid: string | null | undefined) => string;
  shownName: (uid: string | null | undefined) => string;
  eventById: (id: string | undefined) => EventDoc | undefined;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function useSub<T>(fn: ((cb: (v: T) => void) => () => void) | null, deps: unknown[], initial: T): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    if (!fn) { setV(initial); return; }
    return fn(setV);
  }, deps);
  return v;
}

export function AppProvider({ api, children }: { api: Api; children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => api.onAuth((u) => { setUser(u); setAuthReady(true); }), [api]);
  const uid = user?.uid || null;

  const [me, setMe] = useState<UserProfile | null | undefined>(undefined);
  useEffect(() => {
    setMe(undefined);
    if (!uid) return;
    return api.watchProfile(uid, setMe);
  }, [api, uid]);
  const active = !!uid && !!me;

  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [followingReady, setFollowingReady] = useState(false);
  const [myRsvps, setMyRsvps] = useState<Set<string>>(new Set());
  const [myKudos, setMyKudos] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [eventsReady, setEventsReady] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [instagram, setInstagram] = useState<InstagramFeed | null>(null);
  const [team, setTeam] = useState<TeamSettings>({ weather: null });

  useEffect(() => {
    if (!active || !uid) return;
    const offs = [
      api.watchUsers(setUsersList),
      api.watchFollowing(uid, (f) => { setFollowing(f); setFollowingReady(true); }),
      api.watchMyRsvps(uid, setMyRsvps),
      api.watchMyKudos(uid, setMyKudos),
      api.watchEvents((e) => { setEvents(e); setEventsReady(true); }),
      api.watchNotifications(uid, setNotices),
      api.watchInstagram(setInstagram),
      api.watchTeamSettings(setTeam),
    ];
    return () => offs.forEach((f) => f());
  }, [api, active, uid]);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((title: string, opts?: { body?: string; link?: string }) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-1), { id, title, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.body ? 5200 : 3000);
  }, []);

  useEffect(() => {
    if (!active) return;
    return api.onForegroundMessage((n) => { if (!n.link?.startsWith('/a/badge_')) toast(n.title, { body: n.body, link: n.link }); });
  }, [api, active, toast]);

  const role = me?.role;
  useEffect(() => {
    if (!active || !uid) return;
    api.refreshMyStats?.(uid).catch(() => undefined);
  }, [api, active, uid]);
  useEffect(() => {
    if (!active || role !== 'admin') return;
    api.refreshInstagram?.().catch(() => undefined);
  }, [api, active, role]);

  useEffect(() => {
    if (!active || !uid || !api.features.push) return;
    api.pushState().then((s) => { if (s === 'granted') api.enablePush(uid).catch(() => undefined); }).catch(() => undefined);
  }, [api, active, uid]);

  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const seenBadges = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!me) { seenBadges.current = null; return; }
    const ids = Object.keys(me.badges || {});
    if (!seenBadges.current) { seenBadges.current = new Set(ids); return; }
    const fresh = ids.filter((i) => !seenBadges.current!.has(i));
    fresh.forEach((i) => seenBadges.current!.add(i));
    if (fresh.length) setCelebration({ kind: 'badge', badge: fresh.sort((a, b) => me.badges[b] - me.badges[a])[0] });
  }, [me]);
  const celebrate = useCallback((c: Celebration) => setCelebration(c), []);
  const endCelebration = useCallback(() => setCelebration(null), []);

  const [sheet, setSheet] = useState<SheetState | null>(null);
  const openSheet = useCallback((s: SheetState) => setSheet(s), []);
  const closeSheet = useCallback(() => setSheet(null), []);
  useEffect(() => { document.body.classList.toggle('locked', !!sheet); }, [sheet]);

  const value = useMemo<Ctx>(() => {
    const users = new Map(usersList.map((u) => [u.id, u]));
    if (me) users.set(me.id, me);
    const nameOf = (id: string | null | undefined) => (id ? users.get(id)?.name || 'Ukendt' : 'Ukendt');
    const byId = new Map(events.map((e) => [e.id, e]));
    return {
      api, user, authReady, me, users, following, followingReady, myRsvps, myKudos, events, eventsReady, notices,
      unread: notices.filter((n) => !n.read).length, instagram, team, isAdmin: me?.role === 'admin',
      toasts, toast, dismissToast, sheet, openSheet, closeSheet, celebration, celebrate, endCelebration,
      nameOf, shownName: (id) => (id && id === uid ? 'Du' : nameOf(id)), eventById: (id) => (id ? byId.get(id) : undefined),
    };
  }, [api, user, authReady, me, usersList, following, followingReady, myRsvps, myKudos, events, eventsReady, notices, instagram, team, toasts, toast, dismissToast, sheet, openSheet, closeSheet, celebration, celebrate, endCelebration, uid]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useTick(ms = 30000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN((n) => n + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
}

export function goingOf(ev: EventDoc, myRsvps: Set<string>, uid: string | undefined): string[] {
  return placeOf(ev, myRsvps, uid).going;
}
