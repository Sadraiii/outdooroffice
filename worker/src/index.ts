import { Firestore, accessToken, and, sendPush, verifyIdToken, where, type Doc, type ServiceAccount } from './google';
import { excerpt, todayInDenmark, whenText } from '../../functions/src/text';
import { allocateSeats } from '../../functions/src/seats';
import { addDays, feedbackAt, reminderAt, startOf } from '../../functions/src/time';
import { buildCalendar, type CalEvent } from '../../functions/src/ical';
import { forecastAt, isGeo, weatherPhrase } from '../../functions/src/weather';

export interface Env {
  PROJECT_ID: string;
  APP_URL: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  ALLOWED_ORIGINS?: string;
}

interface Ctx { env: Env; fs: Firestore; token: () => Promise<string>; fetcher: typeof fetch; appUrl: string }

const MIN = 60_000;
const NOTICE_PATH = /^users\/[A-Za-z0-9_-]{1,128}\/notifications\/[A-Za-z0-9_-]{1,128}$/;
const MAX_PER_RUN = 8;

export function makeCtx(env: Env, fetcher: typeof fetch = fetch): Ctx {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
  const token = () => accessToken(sa, fetcher);
  return { env, fs: new Firestore(env.PROJECT_ID, token, fetcher), token, fetcher, appUrl: env.APP_URL.trim().replace(/\/$/, '') };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const badge = (ev: Doc) => (ev.official ? 'OFFICIAL EVENT' : 'COMMUNITY MADE EVENT');
const hostsOf = (ev: Doc) => [...new Set([ev.createdBy, ev.coachId, ...strings(ev.cohosts)].filter((u): u is string => typeof u === 'string' && !!u))];

export function seatsOf(ev: Doc): { going: string[]; waitlist: string[] } {
  const s = (ev.signups && typeof ev.signups === 'object' ? ev.signups : {}) as Record<string, unknown>;
  const order = Object.entries(s).map(([uid, t]) => ({ uid, at: typeof t === 'number' ? t : 0 }))
    .sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1)).map((x) => x.uid);
  return allocateSeats(order, [], typeof ev.capacity === 'number' ? ev.capacity : null);
}

export async function pushNotices(c: Ctx, paths: string[], actor?: string): Promise<number> {
  const docs = await c.fs.getAll([...new Set(paths)].filter((p) => NOTICE_PATH.test(p)).slice(0, MAX_PER_RUN));
  const todo = [...docs].filter(([, d]) => d.push === true && (!actor || d.actorId === actor) && Number(d.at) > Date.now() - 2 * 24 * 60 * MIN);
  if (!todo.length) return 0;
  const tokensOf = new Map<string, { path: string; token: string }[]>();
  for (const uid of new Set(todo.map(([p]) => p.split('/')[1]))) {
    const t = await c.fs.query(`users/${uid}`, { from: [{ collectionId: 'tokens' }], limit: 5 });
    tokensOf.set(uid, t.filter((x) => typeof x.data.token === 'string').map((x) => ({ path: x.path, token: x.data.token as string })));
  }
  const gone = new Set<string>();
  let sent = 0;
  for (const [path, d] of todo) {
    for (const t of tokensOf.get(path.split('/')[1]) || []) {
      if (gone.has(t.path)) continue;
      const r = await sendPush(c.env.PROJECT_ID, c.token, {
        to: t.token, title: excerpt(String(d.title || 'Outdoor Office'), 120), body: excerpt(String(d.body || ''), 240),
        link: typeof d.link === 'string' && d.link.startsWith('/') ? d.link : '/', type: String(d.type || ''), appUrl: c.appUrl,
      }, c.fetcher);
      if (r === 'ok') sent++;
      if (r === 'gone') gone.add(t.path);
    }
  }
  await c.fs.commit([...todo.map(([p]) => ({ removeField: p, field: 'push' })), ...[...gone].map((p) => ({ del: p }))]);
  return sent;
}

async function sweep(c: Ctx) {
  const waiting = await c.fs.query('', {
    from: [{ collectionId: 'notifications', allDescendants: true }], where: where('push', 'EQUAL', true), limit: MAX_PER_RUN,
  });
  if (waiting.length) await pushNotices(c, waiting.map((w) => w.path));
}

async function remind(c: Ctx, uids: string[], n: { type: string; title: string; body: string; link: string }) {
  const people = [...new Set(uids)].filter(Boolean);
  if (!people.length) return;
  const users = await c.fs.getAll(people.map((u) => `users/${u}`));
  const allowed = people.filter((u) => users.has(`users/${u}`) && ((users.get(`users/${u}`)!.notify || {}) as Record<string, unknown>).reminders !== false);
  const at = Date.now();
  await c.fs.commit(allowed.map((u) => ({
    set: `users/${u}/notifications/${n.type}_${n.link.split('/').pop()}`,
    data: { type: n.type, title: excerpt(n.title, 120), body: excerpt(n.body, 240), link: n.link, at, read: false, push: true },
  })));
}

async function reminders(c: Ctx) {
  const now = Date.now();
  const today = todayInDenmark();
  const events = await c.fs.query('', {
    from: [{ collectionId: 'events' }],
    where: and(where('date', 'GREATER_THAN_OR_EQUAL', addDays(today, -1)), where('date', 'LESS_THAN_OR_EQUAL', addDays(today, 1))),
    limit: 100,
  });
  let team: Doc | null | undefined;
  for (const { path, data: ev } of events) {
    if (ev.cancelled) continue;
    const id = path.split('/')[1];
    const date = String(ev.date || ''), time = String(ev.time || '');
    const link = `/e/${id}`;
    const before = reminderAt(date, time);
    if (before && before <= now && now - before < 40 * MIN && await claim(c, `rem_before_${id}`)) {
      if (team === undefined) team = await c.fs.get('settings/team');
      const geo = isGeo(ev.geo) ? ev.geo : isGeo(team?.weather) ? team!.weather : null;
      const start = startOf(date, time);
      const w = geo && start ? await forecastAt(geo, start).catch(() => null) : null;
      await remind(c, seatsOf(ev).going, {
        type: 'reminder', title: `${cap(whenText(date, time, today))}: ${ev.title}`,
        body: [ev.place, w ? weatherPhrase(w) : ''].filter(Boolean).join(' · ') || badge(ev), link,
      });
    }
    const after = feedbackAt(date, time);
    if (after && after <= now && now - after < 40 * MIN && await claim(c, `rem_feedback_${id}`)) {
      const [checked, answered] = await Promise.all([
        c.fs.query(path, { from: [{ collectionId: 'checkins' }], limit: 300 }),
        c.fs.query(path, { from: [{ collectionId: 'feedback' }], limit: 300 }),
      ]);
      const skip = new Set([...hostsOf(ev), ...answered.map((x) => x.path.split('/').pop()!)]);
      const asked = (checked.length ? checked.map((x) => x.path.split('/').pop()!) : seatsOf(ev).going).filter((u) => !skip.has(u));
      await remind(c, asked, { type: 'feedback', title: `Hvordan var ${ev.title}?`, body: 'Giv arrangøren en hurtig vurdering. Det tager fem sekunder.', link });
    }
  }
}

async function claim(c: Ctx, key: string): Promise<boolean> {
  try {
    await c.fs.commitCreate(`pushlog/${key}`, { at: Date.now() });
    return true;
  } catch { return false; }
}

async function calendar(c: Ctx, key: string): Promise<Response> {
  const tok = await c.fs.get(`calendarTokens/${key}`);
  if (!tok || typeof tok.uid !== 'string') return new Response('Kalenderen findes ikke. Hent et nyt link i appen.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const uid = tok.uid;
  const all = tok.scope === 'all';
  const today = todayInDenmark();
  const docs = await c.fs.query('', {
    from: [{ collectionId: 'events' }],
    where: and(where('date', 'GREATER_THAN_OR_EQUAL', addDays(today, -30)), where('date', 'LESS_THAN_OR_EQUAL', addDays(today, 180))),
    orderBy: [{ field: { fieldPath: 'date' } }], limit: 500,
  });
  const events: CalEvent[] = [];
  for (const { path, data: e } of docs) {
    const seats = seatsOf(e);
    const going = seats.going.includes(uid), waiting = seats.waitlist.includes(uid);
    if (!all && !going && !waiting) continue;
    events.push({
      id: path.split('/')[1], title: String(e.title || 'Event'), date: String(e.date || ''), time: String(e.time || ''),
      duration: Number(e.duration) >= 10 ? Number(e.duration) : null, place: String(e.place || ''),
      note: String(e.note || ''), official: e.official === true, cancelled: e.cancelled === true, cancelNote: String(e.cancelNote || ''),
      exercises: (Array.isArray(e.exercises) ? e.exercises : []).filter((x): x is { name: string; target: number; unit: string } => !!x && typeof (x as { name?: unknown }).name === 'string'),
      createdAt: Number(e.createdAt) || undefined, updatedAt: Number(e.updatedAt) || undefined, waiting: !going && waiting,
    });
  }
  return new Response(buildCalendar({ name: all ? 'Outdoor Office' : 'Outdoor Office: mine events', events, appUrl: /^https:\/\//.test(c.appUrl) ? c.appUrl : '', now: Date.now() }), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=900' },
  });
}

const IG = 'https://graph.instagram.com/v25.0';
async function igGet<T>(c: Ctx, url: string): Promise<T> {
  const r = await c.fetcher(url);
  const body = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!r.ok || body.error) throw new Error(body.error?.message || `HTTP ${r.status}`);
  return body as T;
}
async function instagram(c: Ctx) {
  const cfg = await c.fs.get('config/instagram');
  let token = typeof cfg?.token === 'string' ? cfg.token : '';
  if (!token) return;
  try {
    const refreshed = Number(cfg?.refreshedAt || cfg?.savedAt || 0);
    if (Date.now() - refreshed > 7 * 24 * 60 * MIN && Date.now() - Number(cfg?.savedAt || 0) > 24 * 60 * MIN) {
      const r = await igGet<{ access_token: string; expires_in: number }>(c, `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
      token = r.access_token;
      await c.fs.commit([{ merge: 'config/instagram', data: { token, refreshedAt: Date.now(), expiresAt: Date.now() + r.expires_in * 1000 } }]);
    }
    const k = encodeURIComponent(token);
    const me = await igGet<{ username: string }>(c, `${IG}/me?fields=user_id,username&access_token=${k}`);
    const media = await igGet<{ data: { id: string; media_type: string; media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string }[] }>(
      c, `${IG}/me/media?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${k}`);
    const posts = (media.data || [])
      .map((m) => ({ id: m.id, type: m.media_type, image: m.media_type === 'VIDEO' ? m.thumbnail_url || '' : m.media_url || '', permalink: m.permalink, at: m.timestamp }))
      .filter((p) => p.image);
    await c.fs.commit([{ set: 'instagram/feed', data: { username: me.username, posts, updatedAt: Date.now() } }]);
  } catch (e) {
    await c.fs.commit([{ merge: 'instagram/feed', data: { error: (e as Error).message.slice(0, 200), updatedAt: Date.now() } }]);
  }
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowed = [env.APP_URL, `https://${env.PROJECT_ID}.web.app`, `https://${env.PROJECT_ID}.firebaseapp.com`, ...(env.ALLOWED_ORIGINS || '').split(',')]
    .map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return allowed.includes(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '86400', vary: 'origin' }
    : {};
}
const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export async function handleFetch(req: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(req.url);
  const h = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, project: env.PROJECT_ID }, 200, h);
  const cal = /^\/cal\/([A-Za-z0-9_-]{32,64})\.ics$/.exec(url.pathname);
  if (cal && req.method === 'GET') return calendar(makeCtx(env, fetcher), cal[1]);
  if (url.pathname === '/push' && req.method === 'POST') {
    const uid = await verifyIdToken((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), env.PROJECT_ID, fetcher);
    if (!uid) return json({ error: 'login' }, 401, h);
    const body = await req.json().catch(() => null) as { notices?: unknown } | null;
    const paths = strings(body?.notices).filter((p) => NOTICE_PATH.test(p));
    if (!paths.length || paths.length > MAX_PER_RUN) return json({ error: 'notices' }, 400, h);
    const sent = await pushNotices(makeCtx(env, fetcher), paths, uid);
    return json({ sent }, 200, h);
  }
  return json({ error: 'not found' }, 404, h);
}

export async function handleScheduled(cron: string, env: Env, fetcher: typeof fetch = fetch) {
  const c = makeCtx(env, fetcher);
  if (cron === '7 * * * *') { await instagram(c); return; }
  await reminders(c).catch((e) => console.error('reminders', (e as Error).message));
  await sweep(c).catch((e) => console.error('push', (e as Error).message));
}

export default {
  fetch: (req: Request, env: Env) => handleFetch(req, env),
  scheduled: (event: ScheduledController, env: Env, ctx: ExecutionContext) => { ctx.waitUntil(handleScheduled(event.cron, env)); },
} satisfies ExportedHandler<Env>;
