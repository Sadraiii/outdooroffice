import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { excerpt, todayInDenmark, whenText } from './text';
import { allocateSeats } from './seats';
import { addDays, feedbackAt, reminderAt, startOf } from './time';
import { buildCalendar, type CalEvent } from './ical';
import { forecastAt, isGeo, weatherPhrase, type GeoPoint } from './weather';

initializeApp();
const db = getFirestore();

const REGION = 'europe-west1';
setGlobalOptions({ region: REGION, maxInstances: 10 });

const APP_URL = defineString('APP_URL', {
  description: 'Appens adresse med https, fx https://outdoor-office.web.app',
  input: { text: { validationRegex: '^https://[^\\s/]+(/.*)?$', validationErrorMessage: 'Skriv hele adressen, der starter med https://' } },
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const badge = (ev: DocumentData) => (ev.official ? 'OFFICIAL EVENT' : 'COMMUNITY MADE EVENT');
const hostsOf = (ev: DocumentData) => [...new Set([ev.createdBy, ev.coachId, ...strings(ev.cohosts)].filter((u): u is string => typeof u === 'string' && !!u))];

function seatsOf(ev: DocumentData): { going: string[]; waitlist: string[] } {
  const s = (ev.signups && typeof ev.signups === 'object' ? ev.signups : {}) as Record<string, { toMillis?: () => number } | number>;
  const order = Object.entries(s)
    .map(([uid, t]) => ({ uid, at: typeof t === 'number' ? t : typeof t?.toMillis === 'function' ? t.toMillis() : 0 }))
    .sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1))
    .map((x) => x.uid);
  return allocateSeats(order, [], typeof ev.capacity === 'number' ? ev.capacity : null);
}

async function claim(key: string, windowMs: number): Promise<boolean> {
  const ref = db.doc(`pushlog/${key}`);
  return db.runTransaction(async (t) => {
    const s = await t.get(ref);
    const now = Date.now();
    const prev = s.exists ? Number(s.get('at')) || 0 : 0;
    if (prev && now - prev < windowMs) return false;
    t.set(ref, { at: now });
    return true;
  });
}

async function inbox(uids: string[], pref: 'reminders', n: { type: string; title: string; body: string; link: string }) {
  const people = [...new Set(uids)].filter(Boolean);
  if (!people.length) return;
  const snaps = await db.getAll(...people.map((u) => db.doc(`users/${u}`)));
  const allowed = snaps.filter((s) => s.exists && (s.get('notify') || {})[pref] !== false).map((s) => s.id);
  const at = Date.now();
  for (let i = 0; i < allowed.length; i += 400) {
    const b = db.batch();
    allowed.slice(i, i + 400).forEach((u) => b.set(db.collection(`users/${u}/notifications`).doc(), { ...n, title: excerpt(n.title, 120), body: excerpt(n.body, 240), at, read: false }));
    await b.commit();
  }
}

export const onNoticeCreated = onDocumentCreated('users/{uid}/notifications/{nid}', async (event) => {
  const n = event.data?.data(); if (!n) return;
  const { uid } = event.params;
  const tokens = (await db.collection(`users/${uid}/tokens`).get()).docs.filter((d) => typeof d.get('token') === 'string');
  if (!tokens.length) return;
  const base = APP_URL.value().trim().replace(/\/$/, '');
  const https = /^https:\/\/\S+$/.test(base);
  const link = typeof n.link === 'string' && n.link.startsWith('/') ? n.link : '/';
  const res = await getMessaging().sendEachForMulticast({
    tokens: tokens.map((d) => d.get('token') as string),
    notification: { title: excerpt(String(n.title || 'Outdoor Office'), 120), body: excerpt(String(n.body || ''), 240) },
    webpush: https ? { notification: { icon: `${base}/icons/icon-192.png`, badge: `${base}/icons/badge-96.png` }, fcmOptions: { link: base + link } } : {},
    data: { link, type: String(n.type || '') },
  });
  const dead = res.responses.map((r, k) => {
    if (r.success) return null;
    const code = r.error?.code || '';
    const gone = /registration-token-not-registered|invalid-registration-token/.test(code)
      || (code.endsWith('invalid-argument') && /registration token/i.test(r.error?.message || ''));
    return gone ? tokens[k].ref : null;
  }).filter((r): r is NonNullable<typeof r> => !!r);
  await Promise.all(dead.map((r) => r.delete()));
});

async function geoFor(ev: DocumentData): Promise<GeoPoint | null> {
  if (isGeo(ev.geo)) return ev.geo;
  const team = (await db.doc('settings/team').get()).data();
  return isGeo(team?.weather) ? team!.weather : null;
}

export const sendReminders = onSchedule({ schedule: 'every 10 minutes', timeZone: 'Europe/Copenhagen' }, async () => {
  const now = Date.now();
  const today = todayInDenmark();
  const snap = await db.collection('events').where('date', '>=', addDays(today, -1)).where('date', '<=', addDays(today, 1)).get();
  for (const d of snap.docs) {
    const ev = d.data();
    if (ev.cancelled) continue;
    const date = String(ev.date || ''), time = String(ev.time || '');
    const link = `/e/${d.id}`;
    const before = reminderAt(date, time);
    if (before && before <= now && now - before < 40 * MIN && (await claim(`rem_before_${d.id}`, 3 * DAY))) {
      const geo = await geoFor(ev).catch(() => null);
      const start = startOf(date, time);
      const weather = geo && start ? await forecastAt(geo, start).catch(() => null) : null;
      await inbox(seatsOf(ev).going, 'reminders', {
        type: 'reminder', title: `${cap(whenText(date, time, today))}: ${ev.title}`,
        body: [ev.place, weather ? weatherPhrase(weather) : ''].filter(Boolean).join(' · ') || badge(ev), link,
      });
    }
    const after = feedbackAt(date, time);
    if (after && after <= now && now - after < 40 * MIN && (await claim(`rem_feedback_${d.id}`, 3 * DAY))) {
      const [checked, answered] = await Promise.all([d.ref.collection('checkins').get(), d.ref.collection('feedback').get()]);
      const skip = new Set([...hostsOf(ev), ...answered.docs.map((x) => x.id)]);
      const asked = (checked.size ? checked.docs.map((x) => x.id) : seatsOf(ev).going).filter((u) => !skip.has(u));
      await inbox(asked, 'reminders', { type: 'feedback', title: `Hvordan var ${ev.title}?`, body: 'Giv en vurdering', link });
    }
  }
});

export const onEventDeleted = onDocumentDeleted('events/{eventId}', async (event) => {
  for (const col of await db.doc(`events/${event.params.eventId}`).listCollections()) await db.recursiveDelete(col);
});

export const onActivityDeleted = onDocumentDeleted('activities/{aid}', async (event) => {
  for (const col of await db.doc(`activities/${event.params.aid}`).listCollections()) await db.recursiveDelete(col);
});

export const calendar = onRequest({ maxInstances: 5 }, async (req, res) => {
  const m = /\/cal\/([A-Za-z0-9_-]{32,64})\.ics$/.exec(req.path || '');
  const tok = m ? (await db.doc(`calendarTokens/${m[1]}`).get()).data() : undefined;
  if (!tok || typeof tok.uid !== 'string') { res.status(404).type('text/plain').send('Kalenderen findes ikke. Hent et nyt link i appen.'); return; }
  const uid = tok.uid as string;
  const all = tok.scope === 'all';
  const today = todayInDenmark();
  const snap = await db.collection('events').where('date', '>=', addDays(today, -30)).where('date', '<=', addDays(today, 180)).orderBy('date').limit(500).get();
  const events: CalEvent[] = [];
  for (const d of snap.docs) {
    const e = d.data();
    const seats = seatsOf(e);
    const going = seats.going.includes(uid), waiting = seats.waitlist.includes(uid);
    if (!all && !going && !waiting) continue;
    events.push({
      id: d.id, title: String(e.title || 'Event'), date: String(e.date || ''), time: String(e.time || ''),
      duration: Number(e.duration) >= 10 ? Number(e.duration) : null, place: String(e.place || ''),
      note: String(e.note || ''), official: e.official === true, cancelled: e.cancelled === true, cancelNote: String(e.cancelNote || ''),
      exercises: Array.isArray(e.exercises) ? e.exercises.filter((x: unknown) => !!x && typeof (x as { name?: unknown }).name === 'string') : [],
      createdAt: Number(e.createdAt) || undefined, updatedAt: Number(e.updatedAt) || undefined, waiting: !going && waiting,
    });
  }
  const base = APP_URL.value().trim().replace(/\/$/, '');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Cache-Control', 'private, max-age=900');
  res.send(buildCalendar({ name: all ? 'Outdoor Office' : 'Outdoor Office: mine events', events, appUrl: /^https:\/\//.test(base) ? base : '', now: Date.now() }));
});

const IG = 'https://graph.instagram.com/v25.0';

async function igGet<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!r.ok || body.error) throw new Error(body.error?.message || `HTTP ${r.status}`);
  return body as T;
}

async function syncInstagram() {
  const cfg = (await db.doc('config/instagram').get()).data();
  const token = cfg?.token as string | undefined;
  if (!token) return;
  const feedRef = db.doc('instagram/feed');
  try {
    const t = encodeURIComponent(token);
    const me = await igGet<{ username: string }>(`${IG}/me?fields=user_id,username&access_token=${t}`);
    const media = await igGet<{ data: { id: string; media_type: string; media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string }[] }>(
      `${IG}/me/media?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${t}`);
    const posts = (media.data || [])
      .map((m) => ({ id: m.id, type: m.media_type, image: m.media_type === 'VIDEO' ? m.thumbnail_url || '' : m.media_url || '', permalink: m.permalink, at: m.timestamp }))
      .filter((p) => p.image);
    await feedRef.set({ username: me.username, posts, updatedAt: Date.now(), error: FieldValue.delete() }, { merge: true });
  } catch (e) {
    logger.warn('instagram sync failed', { message: (e as Error).message });
    await feedRef.set({ error: (e as Error).message.slice(0, 200), updatedAt: Date.now() }, { merge: true });
  }
}

export const instagramHourly = onSchedule({ schedule: 'every 60 minutes', timeZone: 'Europe/Copenhagen' }, async () => { await syncInstagram(); });

export const instagramTokenSaved = onDocumentWritten('config/instagram', async (event) => {
  const before = event.data?.before.get('token');
  const after = event.data?.after.get('token');
  if (after && after !== before) await syncInstagram();
});

export const instagramTokenRefresh = onSchedule({ schedule: 'every monday 04:00', timeZone: 'Europe/Copenhagen' }, async () => {
  const ref = db.doc('config/instagram');
  const cfg = (await ref.get()).data();
  if (!cfg?.token) return;
  if (cfg.savedAt && Date.now() - cfg.savedAt < DAY) return;
  try {
    const r = await igGet<{ access_token: string; expires_in: number }>(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(cfg.token)}`);
    await ref.set({ token: r.access_token, savedAt: cfg.savedAt || Date.now(), refreshedAt: Date.now(), expiresAt: Date.now() + r.expires_in * 1000 }, { merge: true });
  } catch (e) {
    logger.error('instagram token refresh failed', { message: (e as Error).message });
    await db.doc('instagram/feed').set({ error: `Nøglen kunne ikke fornyes: ${(e as Error).message}`.slice(0, 200), updatedAt: Date.now() }, { merge: true });
  }
});
