import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromFields, toValue } from '../src/google';
import { handleFetch, handleScheduled, type Env } from '../src/index';

const PROJECT = 'outdoor-office';
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;

type Fields = Record<string, Record<string, unknown>>;
const store = new Map<string, Fields>();
const pushes: { token: string; title: string; link: string }[] = [];

const enc = (o: Record<string, unknown>) => (toValue(o).mapValue as { fields: Fields }).fields;
const put = (path: string, data: Record<string, unknown>) => store.set(path, enc(data));
const data = (path: string) => (store.has(path) ? fromFields(store.get(path) as never) : null);

function matches(doc: Record<string, unknown>, f: any): boolean {
  if (!f) return true;
  if (f.compositeFilter) return f.compositeFilter.filters.every((x: any) => matches(doc, x));
  const { field, op, value } = f.fieldFilter;
  const v = doc[field.fieldPath];
  const want = fromFields({ x: value } as never).x as any;
  if (v === undefined) return false;
  switch (op) {
    case 'EQUAL': return v === want;
    case 'GREATER_THAN_OR_EQUAL': return (v as any) >= want;
    case 'LESS_THAN_OR_EQUAL': return (v as any) <= want;
    case 'LESS_THAN': return (v as any) < want;
  }
  return false;
}

let signKey: CryptoKey;
let publicJwk: JsonWebKey;
async function idToken(uid: string, project = PROJECT) {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b({ alg: 'RS256', kid: 'k1' })}.${b({ aud: project, iss: `https://securetoken.google.com/${project}`, sub: uid, iat: now, exp: now + 3600 })}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signKey, new TextEncoder().encode(body));
  return `${body}.${Buffer.from(sig).toString('base64url')}`;
}

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body).startsWith('{') ? String(init.body) : '{}') : {};
  const ok = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
  if (url === 'https://oauth2.googleapis.com/token') return ok({ access_token: 'at', expires_in: 3600 });
  if (url.includes('securetoken@system')) return ok({ keys: [{ ...publicJwk, kid: 'k1', alg: 'RS256', use: 'sig' }] });
  if (url.includes('open-meteo')) return new Response('down', { status: 503 });
  if (url.startsWith('https://fcm.googleapis.com/')) {
    const m = body.message;
    if (m.token === 'dead') return new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 });
    pushes.push({ token: m.token, title: m.notification.title, link: m.webpush?.fcm_options?.link || '' });
    return ok({ name: 'x' });
  }
  const fs = 'https://firestore.googleapis.com/v1/';
  if (url.startsWith(fs)) {
    const path = decodeURIComponent(url.slice(fs.length));
    if (path.endsWith(':batchGet')) {
      return ok(body.documents.map((name: string) => {
        const p = name.slice(ROOT.length + 1);
        return store.has(p) ? { found: { name, fields: store.get(p) } } : { missing: name };
      }));
    }
    if (path.endsWith(':runQuery')) {
      const parent = path.slice(0, -':runQuery'.length).slice(ROOT.length + 1);
      const q = body.structuredQuery;
      const { collectionId, allDescendants } = q.from[0];
      let rows = [...store.keys()].filter((p) => {
        const parts = p.split('/');
        if (parts[parts.length - 2] !== collectionId) return false;
        if (allDescendants) return true;
        return parts.slice(0, -2).join('/') === parent;
      }).map((p) => ({ p, d: data(p)! })).filter((r) => matches(r.d, q.where));
      if (q.orderBy) rows.sort((a, b) => String(a.d[q.orderBy[0].field.fieldPath]).localeCompare(String(b.d[q.orderBy[0].field.fieldPath])));
      rows = rows.slice(0, q.limit || 1000);
      return ok(rows.length ? rows.map((r) => ({ document: { name: `${ROOT}/${r.p}`, fields: store.get(r.p) } })) : [{ readTime: 'x' }]);
    }
    if (path.endsWith(':commit')) {
      for (const w of body.writes) {
        if (w.delete) { store.delete(w.delete.slice(ROOT.length + 1)); continue; }
        const p = w.update.name.slice(ROOT.length + 1);
        if (w.currentDocument?.exists === false && store.has(p)) return ok({ error: { status: 'ALREADY_EXISTS' } }, 409);
        if (w.currentDocument?.exists === true && !store.has(p)) return ok({ error: { status: 'NOT_FOUND' } }, 404);
        if (w.updateMask) {
          const cur = { ...(store.get(p) || {}) };
          for (const f of w.updateMask.fieldPaths) { if (f in (w.update.fields || {})) cur[f] = w.update.fields[f]; else delete cur[f]; }
          store.set(p, cur);
        } else store.set(p, w.update.fields || {});
      }
      return ok({ commitTime: 'x' });
    }
    const p = path.slice(ROOT.length + 1);
    return store.has(p) ? ok({ name: path, fields: store.get(p) }) : ok({ error: { code: 404 } }, 404);
  }
  if (url.includes('graph.instagram.com/v25.0/me/media')) return ok({ data: [{ id: '1', media_type: 'IMAGE', media_url: 'https://x/1.jpg', permalink: 'https://instagram.com/p/1', timestamp: 't' }] });
  if (url.includes('graph.instagram.com/v25.0/me')) return ok({ username: 'outdooroffice' });
  return new Response('unexpected ' + url, { status: 500 });
}) as typeof fetch;

let env: Env;
const ymdCph = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' }).format(ms);
const hmCph = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);

test('setup', async () => {
  const sa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', sa.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  env = { PROJECT_ID: PROJECT, APP_URL: 'https://outdoor-office.web.app', FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: PROJECT, client_email: 'w@x.iam.gserviceaccount.com', private_key: pem }) };
  const id = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  signKey = id.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', id.publicKey);
  put('users/sara', { name: 'Sara', notify: { reminders: true } });
  put('users/jonas', { name: 'Jonas', notify: { reminders: false } });
  put('users/sara/tokens/t1', { token: 'phone-sara', at: 1 });
  put('users/sara/tokens/t2', { token: 'dead', at: 1 });
  put('users/jonas/tokens/t1', { token: 'phone-jonas', at: 1 });
});

const post = async (uid: string | null, notices: string[], origin = 'https://outdoor-office.web.app') =>
  handleFetch(new Request('https://w.example/push', {
    method: 'POST', body: JSON.stringify({ notices }),
    headers: { origin, 'content-type': 'application/json', ...(uid ? { authorization: `Bearer ${await idToken(uid)}` } : {}) },
  }), env, fakeFetch);

test('push: only messages you wrote, once, and dead phones are forgotten', async () => {
  put('users/sara/notifications/k_jonas_a1', { type: 'kudos', actorId: 'jonas', title: 'Jonas gav dig high five', body: 'For din træning', link: '/a/a1', at: Date.now(), read: false, push: true });
  put('users/sara/notifications/x1', { type: 'kudos', actorId: 'jonas', title: 'Falsk', body: '', link: '/', at: Date.now(), read: false, push: true });
  assert.equal((await post(null, ['users/sara/notifications/k_jonas_a1'])).status, 401);
  const r = await post('admin', ['users/sara/notifications/x1']);
  assert.deepEqual(await r.json(), { sent: 0 });
  const r2 = await post('jonas', ['users/sara/notifications/k_jonas_a1']);
  assert.equal(r2.headers.get('access-control-allow-origin'), 'https://outdoor-office.web.app');
  assert.deepEqual(await r2.json(), { sent: 1 });
  assert.deepEqual(pushes.map((p) => [p.token, p.link]), [['phone-sara', 'https://outdoor-office.web.app/a/a1']]);
  assert.equal(data('users/sara/notifications/k_jonas_a1')!.push, undefined, 'no longer waiting');
  assert.equal(store.has('users/sara/tokens/t2'), false, 'dead token removed');
  assert.deepEqual(await (await post('jonas', ['users/sara/notifications/k_jonas_a1'])).json(), { sent: 0 }, 'not twice');
});

test('push: a token for another project is refused, and odd paths are rejected', async () => {
  const bad = await handleFetch(new Request('https://w.example/push', { method: 'POST', body: JSON.stringify({ notices: ['users/sara/notifications/x1'] }), headers: { authorization: `Bearer ${await idToken('jonas', 'other')}` } }), env, fakeFetch);
  assert.equal(bad.status, 401);
  assert.equal((await post('jonas', ['events/e1'])).status, 400);
  assert.equal((await post('jonas', Array.from({ length: 9 }, (_, i) => `users/sara/notifications/n${i}`))).status, 400);
});

test('reminders: once, to those with a seat who want them, then pushed', async () => {
  pushes.length = 0;
  store.delete('users/sara/notifications/x1');
  const start = Date.now() + 2 * 3600e3 - 3 * 60e3;
  put('events/e1', { title: 'Calisthenics', date: ymdCph(start), time: hmCph(start), place: 'Parken', official: true, capacity: 1, signups: { sara: 1, jonas: 2 }, createdBy: 'admin' });
  put('events/e2', { title: 'Aflyst', date: ymdCph(start), time: hmCph(start), place: '', official: false, cancelled: true, signups: { sara: 1 }, createdBy: 'admin' });
  await handleScheduled('*/5 * * * *', env, fakeFetch);
  const n = data('users/sara/notifications/reminder_e1');
  assert.ok(n && String(n.title).includes('Calisthenics'), 'Sara is reminded');
  assert.equal(store.has('users/jonas/notifications/reminder_e1'), false, 'Jonas is on the waitlist');
  assert.equal(store.has('users/sara/notifications/reminder_e2'), false, 'not for cancelled events');
  assert.deepEqual(pushes.map((p) => p.token), ['phone-sara'], 'pushed in the same run');
  await handleScheduled('*/5 * * * *', env, fakeFetch);
  assert.equal(pushes.length, 1, 'only once');
});

test('calendar: my events as iCal', async () => {
  put('calendarTokens/' + 'k'.repeat(43), { uid: 'sara', scope: 'mine', createdAt: 1 });
  const r = await handleFetch(new Request(`https://w.example/cal/${'k'.repeat(43)}.ics`), env, fakeFetch);
  const ics = await r.text();
  assert.equal(r.status, 200);
  assert.match(ics, /SUMMARY:Calisthenics/);
  assert.doesNotMatch(ics, /SUMMARY:Aflyst\r/);
  assert.equal((await handleFetch(new Request(`https://w.example/cal/${'z'.repeat(43)}.ics`), env, fakeFetch)).status, 404);
});

test('instagram: the hourly job saves the posts', async () => {
  put('config/instagram', { token: 'tok', savedAt: Date.now(), refreshedAt: Date.now() });
  await handleScheduled('7 * * * *', env, fakeFetch);
  const feed = data('instagram/feed')!;
  assert.equal(feed.username, 'outdooroffice');
  assert.equal((feed.posts as unknown[]).length, 1);
});
