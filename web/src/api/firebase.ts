import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getRedirectResult, onAuthStateChanged,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut,
} from 'firebase/auth';
import {
  FieldPath, collection, collectionGroup, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDoc, getDocFromServer, getDocs, increment,
  initializeFirestore, limit, onSnapshot, orderBy, persistentLocalCache, persistentMultipleTabManager, query, runTransaction, serverTimestamp,
  setDoc, updateDoc, where, writeBatch,
  type DocumentData, type DocumentSnapshot,
} from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import type {
  Activity, ActivityKind, Api, AuthUser, Checkin, Comment, EventDoc, EventPhoto, Exercise, Feedback, Forecast, GeoPlace, InstagramFeed, Notice, NotifyPrefs, Nudge,
  Progress, PushState, RepLine, Sport, TeamSettings, Unit, UserProfile, UserStats,
} from './types';
import { IMG, toDataUrl } from '../lib/image';
import { seatsFromSignups, signupOrder } from '../lib/seats';
import { checkinWindow } from '../lib/time';
import { BADGES, computeStats, earnedBadges, type Visit } from '../lib/stats';
import { DAYS, MONTHS_S } from '../lib/dates';
import { didPhrase } from '../lib/sports';
import { forecastUrl, parseForecast, parsePlaces, placesUrl } from '../lib/weather';
import { addressUrl, parseAddresses, type AddressHit } from '../lib/address';
import { DEFAULT_NOTIFY } from './defaults';
import { hasPushApis, isIOS, isStandalone } from '../lib/platform';
import { fmt, pad } from '../lib/format';

const env = import.meta.env;
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
auth.languageCode = 'da';
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
if (env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
const BLAZE = env.VITE_BLAZE === '1';
const WORKER = (env.VITE_WORKER_URL || '').trim().replace(/\/$/, '');
const SERVER = BLAZE || !!WORKER;
getRedirectResult(auth).catch(() => undefined);

const swReg: Promise<ServiceWorkerRegistration | null> =
  'serviceWorker' in navigator
    ? navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => null)
    : Promise.resolve(null);

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const optStr = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string') : []);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const SPORTS: readonly Sport[] = ['calisthenics', 'fitness', 'lob', 'cykling', 'gang', 'yoga', 'vinterbadning', 'socialt', 'andet'];
const UNITS: readonly Unit[] = ['reps', 'sek', 'min', 'km', 'm'];
const KINDS: readonly ActivityKind[] = ['workout', 'post', 'rsvp', 'goal', 'event', 'badge'];

function toGeo(v: unknown): GeoPlace | null {
  if (!isObj(v) || typeof v.lat !== 'number' || typeof v.lon !== 'number' || !Number.isFinite(v.lat) || !Number.isFinite(v.lon)) return null;
  return { name: str(v.name).slice(0, 60) || 'Ukendt sted', lat: v.lat, lon: v.lon };
}
function toStats(v: unknown): UserStats | null {
  if (!isObj(v)) return null;
  return {
    trainings: Math.max(0, num(v.trainings)), streak: Math.max(0, num(v.streak)), bestStreak: Math.max(0, num(v.bestStreak)), lastWeek: num(v.lastWeek, -1),
    mornings: Math.max(0, num(v.mornings)), winter: Math.max(0, num(v.winter)), sports: Math.max(0, num(v.sports)),
    lastDate: str(v.lastDate), weeks: numMap(v.weeks),
    bestWeek: Math.max(0, num(v.bestWeek)), weekends: Math.max(0, num(v.weekends)), evenings: Math.max(0, num(v.evenings)),
    comebacks: Math.max(0, num(v.comebacks)), seasons: Math.max(0, num(v.seasons)), bySport: numMap(v.bySport),
  };
}
const geoOf = (g: GeoPlace | null | undefined) => (g ? { name: g.name.slice(0, 60), lat: g.lat, lon: g.lon } : null);
function numMap(v: unknown): Record<string, number> {
  return isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number' && Number.isFinite(n))) as Record<string, number> : {};
}
const toFeedback = (uid: string, d: DocumentData): Feedback => ({ uid, rating: Math.max(1, Math.min(5, Math.round(num(d.rating, 3)))), text: str(d.text).slice(0, 500), at: num(d.at) });
const toBadges = (v: unknown): Record<string, number> =>
  isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, t]) => typeof t === 'number')) as Record<string, number> : {};

function toProfile(id: string, d: DocumentData): UserProfile {
  const notify = isObj(d.notify) ? Object.fromEntries(Object.entries(d.notify).filter(([, v]) => typeof v === 'boolean')) : {};
  return {
    id, name: str(d.name, 'Ukendt') || 'Ukendt', bio: str(d.bio), instagram: str(d.instagram), photoURL: optStr(d.photoURL) || null,
    role: d.role === 'admin' ? 'admin' : 'member', createdAt: num(d.createdAt), followers: Math.max(0, num(d.followers)), following: Math.max(0, num(d.following)),
    notify: { ...DEFAULT_NOTIFY, ...notify },
    stats: toStats(d.stats), badges: toBadges(d.badges),
  };
}
function toExercises(v: unknown): Exercise[] {
  return (Array.isArray(v) ? v : []).filter(isObj)
    .filter((x) => typeof x.id === 'string' && typeof x.name === 'string' && num(x.target) > 0)
    .map((x) => ({ id: x.id as string, name: (x.name as string).slice(0, 40), target: num(x.target), unit: oneOf(x.unit, UNITS, 'reps') }))
    .slice(0, 20);
}
function toReps(v: unknown): RepLine[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).filter((r) => typeof r.name === 'string')
    .map((r) => ({ name: (r.name as string).slice(0, 40), count: Math.max(0, num(r.count)), ...(typeof r.unit === 'string' ? { unit: oneOf(r.unit, UNITS, 'reps') } : {}) }))
    .slice(0, 20);
}
function toEvent(id: string, data: DocumentData | undefined): EventDoc {
  const d = data || {};
  const capacity = num(d.capacity) >= 1 ? Math.floor(num(d.capacity)) : null;
  const seats = seatsFromSignups(d.signups, capacity);
  return {
    id, title: str(d.title) || 'Event', sport: oneOf(d.sport, SPORTS, 'andet'), official: d.official === true, createdBy: str(d.createdBy),
    coachId: optStr(d.coachId) || null, date: str(d.date), time: str(d.time),
    duration: num(d.duration) >= 10 ? Math.min(720, Math.round(num(d.duration))) : null, place: str(d.place), note: str(d.note),
    exercises: toExercises(d.exercises), createdAt: num(d.createdAt), updatedAt: num(d.updatedAt),
    going: seats.going, goingCount: seats.going.length, capacity,
    signupUntil: num(d.signupUntil) > 0 ? num(d.signupUntil) : null,
    photoPolicy: d.photoPolicy === 'host' ? 'host' : 'all',
    waitlist: seats.waitlist, photoCount: Math.max(0, num(d.photoCount)), cover: optStr(d.cover) || null,
    cancelled: d.cancelled === true, cancelNote: str(d.cancelNote).slice(0, 200), geo: toGeo(d.geo),
    checkinFrom: num(d.checkinFrom) > 0 ? num(d.checkinFrom) : null, checkinUntil: num(d.checkinUntil) > 0 ? num(d.checkinUntil) : null,
    seriesId: optStr(d.seriesId), cohosts: strs(d.cohosts).slice(0, 5), feedbackCount: Math.max(0, num(d.feedbackCount)), feedbackSum: Math.max(0, num(d.feedbackSum)),
  };
}
const evData = (s: DocumentSnapshot) => s.data({ serverTimestamps: 'estimate' });
function toPhoto(id: string, d: DocumentData): EventPhoto | null {
  const url = optStr(d.url);
  if (!url) return null;
  return { id, uid: str(d.uid), url, w: Math.max(1, num(d.w, 4)), h: Math.max(1, num(d.h, 3)), at: num(d.at), host: d.host === true };
}
const toActivity = (id: string, d: DocumentData): Activity => ({
  id, uid: str(d.uid), kind: oneOf(d.kind, KINDS, 'post'),
  sport: SPORTS.includes(d.sport) ? (d.sport as Sport) : undefined,
  title: optStr(d.title), text: optStr(d.text),
  distanceKm: num(d.distanceKm) > 0 ? num(d.distanceKm) : undefined,
  durationSec: num(d.durationSec) > 0 ? num(d.durationSec) : undefined,
  reps: toReps(d.reps), eventId: optStr(d.eventId), photoURL: optStr(d.photoURL), official: d.official === true, badge: optStr(d.badge),
  createdAt: num(d.createdAt), kudos: Math.max(0, num(d.kudos)), comments: Math.max(0, num(d.comments)),
});
const toCounts = (v: unknown): Record<string, number> =>
  isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number' && Number.isFinite(n))) as Record<string, number> : {};
const ymdOffset = (days: number) => { const d = new Date(Date.now() + days * 864e5); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const userCache = new Map<string, UserProfile>();
const meId = () => auth.currentUser?.uid || '';
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const badgeText = (official: boolean) => (official ? 'OFFICIAL EVENT' : 'COMMUNITY MADE EVENT');
function whenOf(ev: Pick<EventDoc, 'date' | 'time'>): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ev.date || '');
  if (!m) return ev.time ? `kl. ${ev.time}` : '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS_S[d.getMonth()]}${ev.time ? ` kl. ${ev.time}` : ''}`;
}
const capFirst = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const hostsOf = (ev: Pick<EventDoc, 'createdBy' | 'coachId' | 'cohosts'>) => [...new Set([ev.createdBy, ev.coachId, ...ev.cohosts].filter((u): u is string => !!u))];
const isPastDate = (date: string) => (date || '') < ymdOffset(0);

function quietly(p: Promise<unknown>) { p.catch((e) => console.warn('Outdoor Office:', (e as Error).message)); }

async function followersOf(uid: string): Promise<string[]> {
  const s = await getDocs(query(collection(db, 'follows'), where('followeeId', '==', uid)));
  return s.docs.map((d) => str(d.data().followerId)).filter(Boolean);
}

async function notify(targets: string[], pref: keyof NotifyPrefs | null, n: { type: string; title: string; body: string; link: string }, key?: string, toSelf = false) {
  const me = meId(); if (!me) return;
  const uids = [...new Set(targets)].filter((u) => u && (toSelf || u !== me))
    .filter((u) => { const p = userCache.get(u); return pref === null || !p || p.notify[pref] !== false; });
  if (!uids.length) return;
  const note = { type: n.type, actorId: me, title: cut(n.title, 140), body: cut(n.body, 260), link: n.link, at: Date.now(), read: false, ...(WORKER ? { push: true } : {}) };
  const written: string[] = [];
  if (key) {
    const r = await Promise.allSettled(uids.map((u) => setDoc(doc(db, 'users', u, 'notifications', key), note).then(() => `users/${u}/notifications/${key}`)));
    r.forEach((x) => { if (x.status === 'fulfilled') written.push(x.value); });
  } else {
    for (let i = 0; i < uids.length; i += 400) {
      const b = writeBatch(db);
      uids.slice(i, i + 400).forEach((u) => { const r = doc(collection(db, 'users', u, 'notifications')); b.set(r, note); written.push(r.path); });
      await b.commit();
    }
  }
  if (WORKER && written.length) quietly(askForPush(written));
}

async function askForPush(paths: string[]) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return;
  for (let i = 0; i < paths.length; i += 8) {
    await fetch(`${WORKER}/push`, {
      method: 'POST', headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ notices: paths.slice(i, i + 8) }),
    }).catch(() => undefined);
  }
}

async function createOnce(path: [string, ...string[]], data: DocumentData): Promise<boolean> {
  try { await setDoc(doc(db, ...path), data); return true; } catch { return false; }
}

async function announceSignup(ev: EventDoc, uid: string) {
  if (isPastDate(ev.date)) return;
  const made = await createOnce(['activities', `rsvp_${ev.id}_${uid}`], { uid, kind: 'rsvp', eventId: ev.id, createdAt: Date.now(), kudos: 0, comments: 0 });
  if (!made) return;
  const name = userCache.get(uid)?.name || 'Nogen';
  const followers = await followersOf(uid);
  const link = `/e/${ev.id}`;
  await notify(followers, 'rsvp', { type: 'rsvp', title: `${name} har tilmeldt sig ${ev.title}`, body: `${badgeText(ev.official)} · ${whenOf(ev)}`, link }, `r_${uid}_${ev.id}`);
  const hosts = hostsOf(ev).filter((h) => h !== uid && !followers.includes(h));
  await notify(hosts, 'social', { type: 'rsvp-host', title: `${name} kommer til ${ev.title}`, body: `Dit event ${whenOf(ev)}`, link }, `r_${uid}_${ev.id}`);
}

async function announcePromoted(before: EventDoc, after: EventDoc) {
  const promoted = after.going.filter((u) => before.waitlist.includes(u));
  if (!promoted.length || isPastDate(after.date) || after.cancelled) return;
  await notify(promoted, null, { type: 'seat', title: `Du har fået en plads til ${after.title}`, body: `${badgeText(after.official)} · ${whenOf(after)}`, link: `/e/${after.id}` }, `seat_${after.id}`, true);
}

async function syncStats(uid: string) {
  const snap = await getDocs(query(collectionGroup(db, 'checkins'), where('uid', '==', uid)));
  const visits: Visit[] = snap.docs.map((d) => d.data()).filter((x) => typeof x.date === 'string')
    .map((x) => ({ date: x.date as string, time: str(x.time), sport: str(x.sport, 'andet') }));
  const stats = computeStats(visits);
  const uref = doc(db, 'users', uid);
  const u = await getDocFromServer(uref);
  if (!u.exists()) return;
  const have = toBadges(u.data().badges);
  const fresh = earnedBadges(stats).filter((id) => !have[id]);
  const now = Date.now();
  if (JSON.stringify(u.data().stats || null) !== JSON.stringify(stats) || fresh.length) {
    await updateDoc(uref, { stats, badges: { ...have, ...Object.fromEntries(fresh.map((id) => [id, now])) } });
  }
  if (!fresh.length) return;
  const name = userCache.get(uid)?.name || 'Nogen';
  const followers = await followersOf(uid);
  const many = fresh.length > 2;
  if (many) {
    const names = fresh.map((id) => BADGES.find((b) => b.id === id)?.name).filter((x): x is string => !!x);
    await notify([uid], null, { type: 'badge', title: `${names.length} nye mærker`, body: names.length > 1 ? `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}` : names[0] || '', link: `/u/${uid}` }, undefined, true);
  }
  for (const id of many ? fresh.slice(-1) : fresh) {
    const b = BADGES.find((x) => x.id === id); if (!b) continue;
    const aid = `badge_${uid}_${id}`;
    if (!(await createOnce(['activities', aid], { uid, kind: 'badge', badge: id, createdAt: Date.now(), kudos: 0, comments: 0 }))) continue;
    if (!many) await notify([uid], null, { type: 'badge', title: `Nyt mærke: ${b.name}`, body: b.desc, link: `/a/${aid}` }, `b_${id}`, true);
    await notify(followers, 'activity', { type: 'badge', title: `${name} fik mærket ${b.name}`, body: b.desc, link: `/a/${aid}` }, `b_${uid}_${id}`);
  }
}

async function coverFrom(url: string): Promise<string> {
  return (await toDataUrl(url, IMG.cover.side, IMG.cover.q, IMG.cover.max)).url;
}

const IG = 'https://graph.instagram.com/v25.0';
async function igGet<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!r.ok || body.error) throw new Error(body.error?.message || `HTTP ${r.status}`);
  return body as T;
}
async function syncInstagramNow(force = false) {
  const cfgRef = doc(db, 'config', 'instagram');
  const cfg = (await getDoc(cfgRef)).data();
  const token = typeof cfg?.token === 'string' ? cfg.token : '';
  if (!token) return;
  const feedRef = doc(db, 'instagram', 'feed');
  const feed = (await getDoc(feedRef)).data();
  if (!force && feed && Date.now() - num(feed.updatedAt) < 60 * 60e3) return;
  try {
    let t = token;
    if (Date.now() - num(cfg?.refreshedAt, num(cfg?.savedAt)) > 7 * 864e5 && Date.now() - num(cfg?.savedAt) > 864e5) {
      const r = await igGet<{ access_token: string; expires_in: number }>(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
      t = r.access_token;
      await setDoc(cfgRef, { token: t, savedAt: num(cfg?.savedAt, Date.now()), refreshedAt: Date.now(), expiresAt: Date.now() + r.expires_in * 1000 });
    }
    const k = encodeURIComponent(t);
    const me = await igGet<{ username: string }>(`${IG}/me?fields=user_id,username&access_token=${k}`);
    const media = await igGet<{ data: { id: string; media_type: string; media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string }[] }>(
      `${IG}/me/media?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${k}`);
    const posts = (media.data || [])
      .map((m) => ({ id: m.id, type: m.media_type, image: m.media_type === 'VIDEO' ? m.thumbnail_url || '' : m.media_url || '', permalink: m.permalink, at: m.timestamp }))
      .filter((p) => p.image);
    await setDoc(feedRef, { username: me.username, posts, updatedAt: Date.now() });
  } catch (e) {
    await setDoc(feedRef, { username: str(feed?.username), posts: Array.isArray(feed?.posts) ? feed!.posts : [], updatedAt: Date.now(), error: cut((e as Error).message, 200) });
  }
}

const forecasts = new Map<string, { at: number; p: Promise<Forecast> }>();
const addressCache = new Map<string, AddressHit[]>();
function cachedForecast(place: GeoPlace): Promise<Forecast> {
  const key = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  const hit = forecasts.get(key);
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.p;
  const p = fetch(forecastUrl(place)).then((r) => { if (!r.ok) throw new Error(`vejr ${r.status}`); return r.json(); }).then(parseForecast);
  p.catch(() => forecasts.delete(key));
  forecasts.set(key, { at: Date.now(), p });
  return p;
}

function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let pushToken: string | null = null;

async function sha(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

async function pushState(): Promise<PushState> {
  const needsInstall = isIOS() && !isStandalone();
  if (!hasPushApis()) return needsInstall ? 'needs-install' : 'unsupported';
  if (!(await isSupported().catch(() => false))) return needsInstall ? 'needs-install' : 'unsupported';
  if (!env.VITE_FIREBASE_VAPID_KEY) return 'unsupported';
  const p = Notification.permission;
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'default';
}

export const api: Api = {
  mode: 'firebase',
  features: { push: SERVER, calendarFeed: SERVER, reminders: SERVER },

  onAuth(cb) {
    return onAuthStateChanged(auth, (u) => cb(u ? ({ uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL } as AuthUser) : null));
  },
  async signInEmail(email, password) { await signInWithEmailAndPassword(auth, email, password); },
  async signUpEmail(email, password) { await createUserWithEmailAndPassword(auth, email, password); },
  async resetPassword(email) { await sendPasswordResetEmail(auth, email); },
  async signInGoogle() {
    const provider = new GoogleAuthProvider();
    if (isIOS() && isStandalone()) { await signInWithRedirect(auth, provider); return; }
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      const code = (e as { code?: string }).code || '';
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(code)) await signInWithRedirect(auth, provider);
      else throw e;
    }
  },
  async signOut() {
    const uid = auth.currentUser?.uid;
    const token = pushToken;
    pushToken = null;
    if (uid && token) {
      const cleanup = Promise.allSettled([
        sha(token).then((id) => deleteDoc(doc(db, 'users', uid, 'tokens', id))),
        deleteToken(getMessaging(app)),
      ]);
      await Promise.race([cleanup, new Promise((r) => setTimeout(r, 2500))]);
    }
    await signOut(auth);
  },

  watchProfile(uid, cb) {
    return onSnapshot(doc(db, 'users', uid), (s) => cb(s.exists() ? toProfile(s.id, s.data()) : null), () => cb(null));
  },
  async createProfile(uid, data) {
    const first = !(await getDoc(doc(db, 'config', 'admin')).catch(() => null))?.exists();
    const b = writeBatch(db);
    if (first) b.set(doc(db, 'config', 'admin'), { uid, at: Date.now() });
    b.set(doc(db, 'users', uid), {
      name: data.name, nameLower: data.name.toLowerCase(), bio: data.bio || '', instagram: data.instagram || '',
      photoURL: data.photoURL || null, role: first ? 'admin' : 'member', createdAt: Date.now(), followers: 0, following: 0, notify: DEFAULT_NOTIFY,
    });
    await b.commit();
  },
  async updateProfile(uid, patch) {
    await updateDoc(doc(db, 'users', uid), { ...patch, ...(patch.name ? { nameLower: patch.name.toLowerCase() } : {}) });
  },
  watchUsers(cb) {
    return onSnapshot(query(collection(db, 'users'), orderBy('nameLower'), limit(1000)), (s) => {
      const list = s.docs.map((d) => toProfile(d.id, d.data()));
      userCache.clear(); list.forEach((u) => userCache.set(u.id, u));
      cb(list);
    }, () => cb([]));
  },
  async setRole(uid, role) { await updateDoc(doc(db, 'users', uid), { role }); },
  async uploadImage(_uid, kind, blob) {
    const s = kind === 'avatar' ? IMG.avatar : IMG.activity;
    return (await toDataUrl(blob, s.side, s.q, s.max)).url;
  },

  watchFollowing(uid, cb) {
    return onSnapshot(query(collection(db, 'follows'), where('followerId', '==', uid)), (s) => cb(new Set(s.docs.map((d) => str(d.data().followeeId)).filter(Boolean))), () => cb(new Set()));
  },
  watchFollowers(uid, cb) {
    return onSnapshot(query(collection(db, 'follows'), where('followeeId', '==', uid)), (s) => cb(new Set(s.docs.map((d) => str(d.data().followerId)).filter(Boolean))), () => cb(new Set()));
  },
  async follow(me, other) {
    const b = writeBatch(db);
    b.set(doc(db, 'follows', `${me}_${other}`), { followerId: me, followeeId: other, createdAt: Date.now() });
    b.update(doc(db, 'users', other), { followers: increment(1) });
    b.update(doc(db, 'users', me), { following: increment(1) });
    await b.commit();
    const name = userCache.get(me)?.name || 'Nogen';
    quietly(notify([other], 'follows', { type: 'follows', title: `${name} følger dig nu`, body: 'Følg tilbage for at se deres træninger', link: `/u/${me}` }, `f_${me}`));
  },
  async unfollow(me, other) {
    const b = writeBatch(db);
    b.delete(doc(db, 'follows', `${me}_${other}`));
    b.update(doc(db, 'users', other), { followers: increment(-1) });
    b.update(doc(db, 'users', me), { following: increment(-1) });
    await b.commit();
  },

  watchEvents(cb) {
    const today = ymdOffset(0);
    let past: EventDoc[] | null = null;
    let upcoming: EventDoc[] | null = null;
    const emit = () => { if (past && upcoming) cb([...[...past].reverse(), ...upcoming]); };
    const offPast = onSnapshot(
      query(collection(db, 'events'), where('date', '>=', ymdOffset(-120)), where('date', '<', today), orderBy('date', 'desc'), limit(150)),
      (s) => { past = s.docs.map((d) => toEvent(d.id, evData(d))); emit(); }, () => { past = past || []; emit(); });
    const offNext = onSnapshot(
      query(collection(db, 'events'), where('date', '>=', today), orderBy('date'), limit(250)),
      (s) => { upcoming = s.docs.map((d) => toEvent(d.id, evData(d))); emit(); }, () => { upcoming = upcoming || []; emit(); });
    return () => { offPast(); offNext(); };
  },
  watchEvent(id, cb) {
    return onSnapshot(doc(db, 'events', id), (s) => cb(s.exists() ? toEvent(s.id, evData(s)) : null), () => cb(null));
  },
  watchMyRsvps(uid, cb) {
    return onSnapshot(query(collection(db, 'events'), where(new FieldPath('signups', uid), '!=', null)),
      (s) => cb(new Set(s.docs.map((d) => d.id))), () => cb(new Set()));
  },
  async setRsvp(eventId, uid, going) {
    const ref = doc(db, 'events', eventId);
    const before = await getDocFromServer(ref);
    if (!before.exists()) throw new Error('Eventet findes ikke');
    await updateDoc(ref, { [`signups.${uid}`]: going ? serverTimestamp() : deleteField() });
    quietly((async () => {
      const b = toEvent(eventId, evData(before));
      const a = toEvent(eventId, evData(await getDocFromServer(ref)));
      if (going) { if (a.going.includes(uid)) await announceSignup(a, uid); return; }
      await deleteDoc(doc(db, 'activities', `rsvp_${eventId}_${uid}`)).catch(() => undefined);
      await announcePromoted(b, a);
    })());
  },
  watchRsvps(eventId, cb) {
    return onSnapshot(doc(db, 'events', eventId), (s) => cb(signupOrder(s.exists() ? evData(s)?.signups : null)), () => cb([]));
  },
  async createEvent(uid, data) {
    const r = doc(collection(db, 'events'));
    const win = checkinWindow(data.date, data.time);
    const cohosts = (data.cohosts || []).filter((u) => u !== uid).slice(0, 5);
    await setDoc(r, {
      ...data, geo: geoOf(data.geo), cohosts, coachId: data.coachId === undefined ? uid : data.coachId, createdBy: uid, createdAt: Date.now(),
      signups: {}, cancelled: false, cancelNote: '', photoCount: 0, cover: null, feedbackCount: 0, feedbackSum: 0,
      checkinFrom: win ? win.from : null, checkinUntil: win ? win.until : null,
    });
    if (!(typeof data.seriesIndex === 'number' && data.seriesIndex > 0)) quietly((async () => {
      await createOnce(['activities', `event_${r.id}`], { uid, kind: 'event', eventId: r.id, createdAt: Date.now(), kudos: 0, comments: 0 });
      const name = userCache.get(uid)?.name || 'Nogen';
      const link = `/e/${r.id}`;
      if (cohosts.length) await notify(cohosts, null, { type: 'cohost', title: `${name} har gjort dig til medarrangør`, body: `${data.title} · ${whenOf(data)}`, link }, `co_${r.id}`);
      if (data.official) await notify([...userCache.keys()], 'official', { type: 'official', title: `Nyt OFFICIAL EVENT: ${data.title}`, body: [whenOf(data), data.place].filter(Boolean).join(' · '), link });
      else await notify(await followersOf(uid), 'community', { type: 'community', title: `${name} har oprettet et event`, body: `COMMUNITY MADE EVENT · ${data.title} · ${whenOf(data)}`, link });
    })());
    return r.id;
  },
  async updateEvent(id, data, by) {
    const ref = doc(db, 'events', id);
    const snap = await getDocFromServer(ref);
    const win = checkinWindow(data.date, data.time);
    await updateDoc(ref, { ...data, geo: geoOf(data.geo), checkinFrom: win ? win.from : null, checkinUntil: win ? win.until : null, updatedAt: Date.now(), updatedBy: by });
    if (!snap.exists()) return;
    quietly((async () => {
      const b = toEvent(id, evData(snap));
      const a = toEvent(id, { ...evData(snap), ...data });
      const name = userCache.get(by)?.name || 'Nogen';
      const link = `/e/${id}`;
      const added = a.cohosts.filter((u) => !b.cohosts.includes(u) && u !== a.createdBy);
      if (added.length) await notify(added, null, { type: 'cohost', title: `${name} har gjort dig til medarrangør`, body: `${a.title} · ${whenOf(a)}`, link }, `co_${id}`);
      await announcePromoted(b, a);
      const timeChanged = b.date !== a.date || b.time !== a.time;
      const placeChanged = b.place !== a.place;
      if ((!timeChanged && !placeChanged) || a.cancelled || (isPastDate(a.date) && isPastDate(b.date))) return;
      const what = timeChanged && placeChanged ? 'Nyt tidspunkt og sted' : timeChanged ? 'Nyt tidspunkt' : 'Nyt sted';
      await notify([...a.going, ...a.waitlist], null, { type: 'change', title: `${what}: ${a.title}`, body: [capFirst(whenOf(a)), a.place].filter(Boolean).join(' · '), link });
    })());
  },
  async setCancelled(id, by, cancelled, note) {
    const ref = doc(db, 'events', id);
    await updateDoc(ref, { cancelled, cancelNote: cancelled ? note.trim().slice(0, 200) : '', updatedAt: Date.now(), updatedBy: by });
    quietly((async () => {
      const ev = toEvent(id, evData(await getDocFromServer(ref)));
      if (isPastDate(ev.date)) return;
      const people = [...ev.going, ...ev.waitlist];
      if (cancelled) await notify(people, null, { type: 'cancel', title: `Aflyst: ${ev.title}`, body: [capFirst(whenOf(ev)), cut(note.trim(), 160)].filter(Boolean).join(' · '), link: `/e/${id}` });
      else await notify(people, null, { type: 'reopen', title: `Bliver alligevel til noget: ${ev.title}`, body: [capFirst(whenOf(ev)), ev.place].filter(Boolean).join(' · '), link: `/e/${id}` });
    })());
  },
  watchCheckins(eventId, cb) {
    return onSnapshot(collection(db, 'events', eventId, 'checkins'), (s) =>
      cb(s.docs.map((d) => ({ uid: d.id, at: num(d.data().at), by: str(d.data().by) }) as Checkin)), () => cb([]));
  },
  async setCheckin(eventId, uid, by, on) {
    const r = doc(db, 'events', eventId, 'checkins', uid);
    if (on) {
      const ev = (await getDoc(doc(db, 'events', eventId))).data();
      await setDoc(r, { uid, at: Date.now(), by, date: str(ev?.date), time: str(ev?.time), sport: str(ev?.sport, 'andet') });
    } else await deleteDoc(r);
    if (uid === meId()) quietly(syncStats(uid));
  },
  watchMyFeedback(eventId, uid, cb) {
    return onSnapshot(doc(db, 'events', eventId, 'feedback', uid), (s) => cb(s.exists() ? toFeedback(s.id, s.data()) : null), () => cb(null));
  },
  watchFeedback(eventId, cb) {
    return onSnapshot(query(collection(db, 'events', eventId, 'feedback'), orderBy('at', 'desc')), (s) => cb(s.docs.map((d) => toFeedback(d.id, d.data()))), () => cb([]));
  },
  async setFeedback(eventId, uid, rating, text) {
    const r = Math.max(1, Math.min(5, Math.round(rating)));
    const evRef = doc(db, 'events', eventId);
    const fbRef = doc(db, 'events', eventId, 'feedback', uid);
    const isNew = await runTransaction(db, async (t) => {
      const old = await t.get(fbRef);
      const was = old.exists() ? num(old.data().rating) : 0;
      t.set(fbRef, { uid, rating: r, text: text.trim().slice(0, 500), at: Date.now() });
      t.update(evRef, { feedbackCount: increment(old.exists() ? 0 : 1), feedbackSum: increment(r - was) });
      return !old.exists();
    });
    if (isNew) quietly((async () => {
      const ev = toEvent(eventId, evData(await getDoc(evRef)));
      const name = userCache.get(uid)?.name || 'Nogen';
      await notify(hostsOf(ev).filter((h) => h !== uid), 'social', {
        type: 'feedback', title: `${name} gav ${ev.title} ${r}/5`, body: text.trim() ? cut(text.trim(), 200) : '★'.repeat(r) + '☆'.repeat(5 - r), link: `/e/${eventId}`,
      }, `fb_${eventId}_${uid}`);
    })());
  },
  watchNudges(cb) {
    return onSnapshot(query(collection(db, 'nudges'), orderBy('at', 'desc'), limit(300)), (s) => cb(s.docs.map((d) => {
      const x = d.data();
      return { id: d.id, from: str(x.from), to: str(x.to), text: str(x.text), eventId: optStr(x.eventId), at: num(x.at), status: x.status === 'sent' || x.status === 'skipped' ? x.status : undefined, sentAt: num(x.sentAt) || undefined } as Nudge;
    })), () => cb([]));
  },
  async sendNudge(from, to, text, eventId) {
    const earlier = await getDocs(query(collection(db, 'nudges'), where('to', '==', to)));
    const recent = earlier.docs.some((d) => d.data().status === 'sent' && Date.now() - num(d.data().sentAt, num(d.data().at)) < 7 * 864e5);
    const now = Date.now();
    const msg = text.trim().slice(0, 300);
    await setDoc(doc(collection(db, 'nudges')), { from, to, text: msg, ...(eventId ? { eventId } : {}), at: now, status: recent ? 'skipped' : 'sent', ...(recent ? {} : { sentAt: now }) });
    if (recent) return;
    const name = userCache.get(from)?.name || 'Holdet';
    await notify([to], null, { type: 'nudge', title: `${name}: Vi savner dig til træning`, body: msg || 'Kom og vær med igen. Vi glæder os til at se dig.', link: eventId ? `/e/${eventId}` : '/events' });
  },
  async deleteEvent(id) {
    const ref = doc(db, 'events', id);
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return;
    const ev = toEvent(id, evData(snap));
    const acts = await getDocs(query(collection(db, 'activities'), where('eventId', '==', id)));
    await Promise.allSettled(acts.docs.filter((d) => ['rsvp', 'event'].includes(str(d.data().kind))).map((d) => deleteDoc(d.ref)));
    const photos = await getDocs(collection(db, 'events', id, 'photos'));
    await Promise.allSettled(photos.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(ref);
    if (!ev.cancelled && !isPastDate(ev.date)) {
      quietly(notify([...ev.going, ...ev.waitlist].filter((u) => u !== ev.createdBy), null, { type: 'cancel', title: `Aflyst: ${ev.title}`, body: `${capFirst(whenOf(ev))} · Eventet er slettet`, link: '/events' }));
    }
  },
  watchProgress(eventId, cb) {
    return onSnapshot(collection(db, 'events', eventId, 'progress'), (s) =>
      cb(s.docs.map((d) => { const x = d.data(); return { uid: d.id, counts: toCounts(x.counts), updatedAt: num(x.updatedAt), done: x.done === true } as Progress; })));
  },
  watchEventPhotos(eventId, cb) {
    return onSnapshot(query(collection(db, 'events', eventId, 'photos'), orderBy('at', 'desc'), limit(120)),
      (s) => cb(s.docs.map((d) => toPhoto(d.id, d.data())).filter((p): p is EventPhoto => !!p)), () => cb([]));
  },
  async addEventPhoto(eventId, uid, blob, host) {
    const { url, w, h } = await toDataUrl(blob, IMG.photo.side, IMG.photo.q, IMG.photo.max);
    const evRef = doc(db, 'events', eventId);
    const ev = toEvent(eventId, evData(await getDoc(evRef)));
    const b = writeBatch(db);
    b.set(doc(collection(db, 'events', eventId, 'photos')), { uid, url, w, h, at: Date.now(), host });
    b.update(evRef, { photoCount: increment(1), ...(host && !ev.cover ? { cover: await coverFrom(url) } : {}) });
    await b.commit();
    if (!host) {
      const name = userCache.get(uid)?.name || 'Nogen';
      quietly(notify(hostsOf(ev).filter((x) => x !== uid), 'social', { type: 'photos', title: `${name} delte billeder fra ${ev.title}`, body: 'Se dem under Billeder på eventet', link: `/e/${eventId}` },
        `ph_${uid}_${eventId}_${Math.floor(Date.now() / (6 * 36e5))}`));
    }
  },
  async deleteEventPhoto(eventId, photoId) {
    const evRef = doc(db, 'events', eventId);
    const pRef = doc(db, 'events', eventId, 'photos', photoId);
    const p = (await getDoc(pRef)).data();
    const b = writeBatch(db);
    b.delete(pRef);
    b.update(evRef, { photoCount: increment(-1) });
    await b.commit();
    if (p?.host) quietly((async () => {
      const next = (await getDocs(query(collection(db, 'events', eventId, 'photos'), where('host', '==', true)))).docs
        .map((d) => d.data()).sort((a, c) => num(a.at) - num(c.at))[0];
      await updateDoc(evRef, { cover: next && typeof next.url === 'string' ? await coverFrom(next.url) : null });
    })());
  },
  async setProgress(eventId, uid, counts, done) {
    await setDoc(doc(db, 'events', eventId, 'progress', uid), { uid, counts, done, updatedAt: Date.now() });
    if (!done) return;
    quietly((async () => {
      const ev = toEvent(eventId, evData(await getDoc(doc(db, 'events', eventId))));
      if (!ev.exercises.length || !ev.exercises.every((x) => (counts[x.id] || 0) >= x.target)) return;
      const reps = ev.exercises.map((x) => ({ name: x.name, count: counts[x.id] || 0, unit: x.unit }));
      const aid = `goal_${eventId}_${uid}`;
      if (!(await createOnce(['activities', aid], { uid, kind: 'goal', sport: ev.sport, title: ev.title, eventId, reps: reps.map(({ name, count }) => ({ name, count })), createdAt: Date.now(), kudos: 0, comments: 0 }))) return;
      const name = userCache.get(uid)?.name || 'Nogen';
      await notify(await followersOf(uid), 'activity', { type: 'goal', title: `${name} gennemførte ${ev.title}`, body: reps.slice(0, 3).map((r) => `${fmt(r.count)} ${r.name.toLowerCase()}`).join(' · '), link: `/a/${aid}` });
    })());
  },

  watchFeed(cb) {
    return onSnapshot(query(collection(db, 'activities'), orderBy('createdAt', 'desc'), limit(120)), (s) => cb(s.docs.map((d) => toActivity(d.id, d.data()))), () => cb([]));
  },
  watchUserActivities(uid, cb) {
    return onSnapshot(query(collection(db, 'activities'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(60)), (s) => cb(s.docs.map((d) => toActivity(d.id, d.data()))), () => cb([]));
  },
  watchActivity(id, cb) {
    return onSnapshot(doc(db, 'activities', id), (s) => cb(s.exists() ? toActivity(s.id, s.data()) : null), () => cb(null));
  },
  async createActivity(uid, data) {
    const r = doc(collection(db, 'activities'));
    await setDoc(r, { ...data, uid, createdAt: Date.now(), kudos: 0, comments: 0 });
    const name = userCache.get(uid)?.name || 'Nogen';
    const body = [data.title, data.distanceKm ? `${fmt(data.distanceKm)} km` : ''].filter(Boolean).join(' · ') || 'Se træningen';
    quietly((async () => notify(await followersOf(uid), 'activity', { type: 'activity', title: `${name} ${didPhrase(data)}`, body, link: `/a/${r.id}` }))());
    return r.id;
  },
  async deleteActivity(id) { await deleteDoc(doc(db, 'activities', id)); },
  watchMyKudos(uid, cb) {
    return onSnapshot(query(collectionGroup(db, 'kudos'), where('uid', '==', uid)), (s) => cb(new Set(s.docs.map((d) => d.ref.parent.parent!.id))), () => cb(new Set()));
  },
  async setKudos(activityId, uid, on) {
    const aRef = doc(db, 'activities', activityId);
    const b = writeBatch(db);
    if (on) b.set(doc(db, 'activities', activityId, 'kudos', uid), { uid, at: Date.now() }); else b.delete(doc(db, 'activities', activityId, 'kudos', uid));
    b.update(aRef, { kudos: increment(on ? 1 : -1) });
    await b.commit();
    if (!on) return;
    quietly((async () => {
      const a = (await getDoc(aRef)).data();
      if (!a || a.uid === uid) return;
      const name = userCache.get(uid)?.name || 'Nogen';
      const what = a.kind === 'goal' ? `for ${a.title}` : a.kind === 'rsvp' ? 'for din tilmelding' : a.kind === 'event' ? 'for dit event'
        : a.kind === 'badge' ? `for dit mærke ${BADGES.find((x) => x.id === a.badge)?.name || ''}`.trim() : a.title ? `for ${a.title}` : 'for din træning';
      await notify([str(a.uid)], 'social', { type: 'kudos', title: `${name} gav dig high five`, body: capFirst(what), link: `/a/${activityId}` }, `k_${uid}_${activityId}`);
    })());
  },
  watchKudos(activityId, cb) {
    return onSnapshot(collection(db, 'activities', activityId, 'kudos'), (s) =>
      cb(s.docs.map((d) => ({ uid: d.id, at: num(d.data().at) })).sort((a, b) => a.at - b.at).map((x) => x.uid)));
  },
  watchComments(activityId, cb) {
    return onSnapshot(query(collection(db, 'activities', activityId, 'comments'), orderBy('at')), (s) =>
      cb(s.docs.map((d) => ({ id: d.id, uid: str(d.data().uid), text: str(d.data().text), at: num(d.data().at) }) as Comment)));
  },
  async addComment(activityId, uid, text) {
    const aRef = doc(db, 'activities', activityId);
    const b = writeBatch(db);
    b.set(doc(collection(db, 'activities', activityId, 'comments')), { uid, text, at: Date.now() });
    b.update(aRef, { comments: increment(1) });
    await b.commit();
    quietly((async () => {
      const a = (await getDoc(aRef)).data();
      if (!a || a.uid === uid) return;
      const name = userCache.get(uid)?.name || 'Nogen';
      await notify([str(a.uid)], 'social', { type: 'comment', title: `${name} kommenterede`, body: cut(text, 200), link: `/a/${activityId}` });
    })());
  },
  async deleteComment(activityId, commentId) {
    const b = writeBatch(db);
    b.delete(doc(db, 'activities', activityId, 'comments', commentId));
    b.update(doc(db, 'activities', activityId), { comments: increment(-1) });
    await b.commit();
  },

  watchNotifications(uid, cb) {
    return onSnapshot(query(collection(db, 'users', uid, 'notifications'), orderBy('at', 'desc'), limit(80)), (s) =>
      cb(s.docs.map((d) => {
        const x = d.data();
        return { id: d.id, type: str(x.type), actorId: optStr(x.actorId), title: str(x.title), body: str(x.body), link: str(x.link, '/') || '/', at: num(x.at), read: x.read === true } as Notice;
      })));
  },
  async markRead(uid, ids) {
    if (!ids.length) return;
    const b = writeBatch(db);
    ids.slice(0, 450).forEach((id) => b.update(doc(db, 'users', uid, 'notifications', id), { read: true }));
    await b.commit();
  },
  pushState,
  async enablePush(uid) {
    const st = await pushState();
    if (st === 'unsupported' || st === 'needs-install' || st === 'denied') return st;
    if (Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return p === 'denied' ? 'denied' : 'default';
    }
    const reg = await swReg;
    if (!reg) return 'unsupported';
    await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { vapidKey: env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: reg });
    if (token) {
      pushToken = token;
      await setDoc(doc(db, 'users', uid, 'tokens', await sha(token)), { token, at: Date.now(), ua: navigator.userAgent.slice(0, 180) });
    }
    return 'granted';
  },
  onForegroundMessage(cb) {
    if (!SERVER) return () => undefined;
    let unsub: (() => void) | null = null; let dead = false;
    isSupported().then((ok) => {
      if (!ok || dead) return;
      unsub = onMessage(getMessaging(app), (p) => cb({
        title: p.notification?.title || 'Outdoor Office', body: p.notification?.body || '', link: (p.data && p.data.link) || undefined,
      }));
    }).catch(() => undefined);
    return () => { dead = true; if (unsub) unsub(); };
  },

  watchInstagram(cb) {
    return onSnapshot(doc(db, 'instagram', 'feed'), (s) => cb(s.exists() ? (s.data() as InstagramFeed) : null), () => cb(null));
  },
  async saveInstagramToken(token) {
    await setDoc(doc(db, 'config', 'instagram'), { token: token.trim(), savedAt: Date.now() });
    if (!BLAZE) await syncInstagramNow(true);
  },
  async refreshInstagram() { if (!SERVER) await syncInstagramNow(); },
  async refreshMyStats(uid) { await syncStats(uid); },

  watchTeamSettings(cb) {
    return onSnapshot(doc(db, 'settings', 'team'), (s) => cb({ weather: toGeo(s.data()?.weather) } as TeamSettings), () => cb({ weather: null }));
  },
  async saveTeamSettings(t) {
    await setDoc(doc(db, 'settings', 'team'), { weather: t.weather ? { name: t.weather.name, lat: t.weather.lat, lon: t.weather.lon } : null, updatedAt: Date.now() });
  },
  async searchPlaces(q) {
    if (q.trim().length < 2) return [];
    const r = await fetch(placesUrl(q));
    if (!r.ok) throw new Error(`søgning ${r.status}`);
    return parsePlaces(await r.json());
  },
  async searchAddresses(q, near, signal) {
    const key = `${q.trim().toLowerCase()}|${near ? `${near.lat.toFixed(2)},${near.lon.toFixed(2)}` : ''}`;
    const hit = addressCache.get(key);
    if (hit) return hit;
    const r = await fetch(addressUrl(q, near), { signal });
    if (!r.ok) throw new Error(`adresser ${r.status}`);
    const list = parseAddresses(await r.json());
    if (addressCache.size >= 100) addressCache.delete(addressCache.keys().next().value!);
    addressCache.set(key, list);
    return list;
  },
  getForecast: cachedForecast,
  async calendarLink(uid, scope, reset) {
    const priv = doc(db, 'users', uid, 'private', 'calendar');
    const cur = str((await getDoc(priv)).data()?.[scope]);
    let token = cur;
    if (!token || reset) {
      token = newToken();
      const b = writeBatch(db);
      b.set(doc(db, 'calendarTokens', token), { uid, scope, createdAt: Date.now() });
      b.set(priv, { [scope]: token }, { merge: true });
      if (cur) b.delete(doc(db, 'calendarTokens', cur));
      await b.commit();
    }
    return `${WORKER || location.origin}/cal/${token}.ics`;
  },
};
