export interface ServiceAccount { project_id: string; client_email: string; private_key: string }

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

let cached: { token: string; until: number; email: string } | null = null;

export async function accessToken(sa: ServiceAccount, fetcher: typeof fetch = fetch): Promise<string> {
  if (cached && cached.email === sa.client_email && Date.now() < cached.until) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
  }));
  const pem = sa.private_key.replace(/\\n/g, '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', fromB64url(pem.replace(/\+/g, '-').replace(/\//g, '_')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`));
  const r = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claims}.${b64url(sig)}`,
  });
  const body = await r.json() as { access_token?: string; error_description?: string };
  if (!r.ok || !body.access_token) throw new Error(`Google login failed: ${body.error_description || r.status}`);
  cached = { token: body.access_token, until: Date.now() + 50 * 60_000, email: sa.client_email };
  return body.access_token;
}

type Value = Record<string, unknown>;
export type Doc = Record<string, unknown>;

export function toValue(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, toValue(x)])) } };
}

export function fromValue(v: Value): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Date.parse(String(v.timestampValue));
  if ('arrayValue' in v) return (((v.arrayValue as { values?: Value[] }).values) || []).map(fromValue);
  if ('mapValue' in v) return fromFields((v.mapValue as { fields?: Record<string, Value> }).fields);
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  return null;
}
export const fromFields = (f: Record<string, Value> | undefined): Doc => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromValue(v)]));

export class Firestore {
  readonly root: string;
  constructor(readonly project: string, private token: () => Promise<string>, private fetcher: typeof fetch = fetch) {
    this.root = `projects/${project}/databases/(default)/documents`;
  }
  private async call(path: string, body?: unknown, method = body ? 'POST' : 'GET') {
    const r = await this.fetcher(`https://firestore.googleapis.com/v1/${path}`, {
      method, headers: { authorization: `Bearer ${await this.token()}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 404 && method === 'GET') return null;
    const j = await r.json() as unknown;
    if (!r.ok) throw new Error(`Firestore ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  }
  async get(path: string): Promise<Doc | null> {
    const j = await this.call(`${this.root}/${path}`) as { fields?: Record<string, Value> } | null;
    return j ? fromFields(j.fields) : null;
  }
  async getAll(paths: string[]): Promise<Map<string, Doc>> {
    const out = new Map<string, Doc>();
    if (!paths.length) return out;
    const j = await this.call(`${this.root}:batchGet`, { documents: paths.map((p) => `${this.root}/${p}`) }) as { found?: { name: string; fields?: Record<string, Value> } }[];
    for (const x of j) if (x.found) out.set(x.found.name.slice(this.root.length + 1), fromFields(x.found.fields));
    return out;
  }
  async query(parent: string, q: Record<string, unknown>): Promise<{ path: string; data: Doc }[]> {
    const j = await this.call(`${this.root}${parent ? `/${parent}` : ''}:runQuery`, { structuredQuery: q }) as { document?: { name: string; fields?: Record<string, Value> } }[];
    return j.filter((x) => x.document).map((x) => ({ path: x.document!.name.slice(this.root.length + 1), data: fromFields(x.document!.fields) }));
  }
  async commitCreate(path: string, data: Doc) {
    await this.call(`${this.root}:commit`, {
      writes: [{ update: { name: `${this.root}/${path}`, fields: (toValue(data).mapValue as { fields: unknown }).fields }, currentDocument: { exists: false } }],
    });
  }
  async commit(writes: ({ set: string; data: Doc } | { merge: string; data: Doc } | { removeField: string; field: string } | { del: string })[]) {
    if (!writes.length) return;
    await this.call(`${this.root}:commit`, {
      writes: writes.map((w) => {
        if ('set' in w) return { update: { name: `${this.root}/${w.set}`, fields: (toValue(w.data).mapValue as { fields: unknown }).fields } };
        if ('merge' in w) return { update: { name: `${this.root}/${w.merge}`, fields: (toValue(w.data).mapValue as { fields: unknown }).fields }, updateMask: { fieldPaths: Object.keys(w.data).map(quoteField) } };
        if ('removeField' in w) return { update: { name: `${this.root}/${w.removeField}`, fields: {} }, updateMask: { fieldPaths: [quoteField(w.field)] }, currentDocument: { exists: true } };
        return { delete: `${this.root}/${w.del}` };
      }),
    });
  }
}
const quoteField = (f: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(f) ? f : `\`${f.replace(/`/g, '\\`')}\``);

export const where = (field: string, op: 'EQUAL' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN_OR_EQUAL' | 'LESS_THAN', value: unknown) =>
  ({ fieldFilter: { field: { fieldPath: field }, op, value: toValue(value) } });
export const and = (...filters: Record<string, unknown>[]) => (filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } });

export async function sendPush(project: string, token: () => Promise<string>, msg: { to: string; title: string; body: string; link: string; type: string; appUrl: string }, fetcher: typeof fetch = fetch): Promise<'ok' | 'gone' | 'error'> {
  const https = /^https:\/\/\S+$/.test(msg.appUrl);
  const r = await fetcher(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: 'POST', headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: msg.to,
        notification: { title: msg.title, body: msg.body },
        data: { link: msg.link, type: msg.type },
        webpush: https ? { notification: { icon: `${msg.appUrl}/icons/icon-192.png`, badge: `${msg.appUrl}/icons/badge-96.png` }, fcm_options: { link: msg.appUrl + msg.link } } : undefined,
      },
    }),
  });
  if (r.ok) return 'ok';
  const text = await r.text();
  return r.status === 404 || /UNREGISTERED|registration token is not a valid/i.test(text) ? 'gone' : 'error';
}

let jwks: { keys: Map<string, CryptoKey>; until: number } | null = null;

export async function verifyIdToken(idToken: string, project: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let head: { kid?: string; alg?: string }, claims: { aud?: string; iss?: string; exp?: number; iat?: number; sub?: string };
  try {
    head = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch { return null; }
  if (head.alg !== 'RS256' || !head.kid) return null;
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}` || !claims.sub
    || !claims.exp || claims.exp < now - 60 || (claims.iat || 0) > now + 300) return null;
  if (!jwks || Date.now() > jwks.until || !jwks.keys.has(head.kid)) {
    const r = await fetcher('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    const j = await r.json() as { keys: (JsonWebKey & { kid: string })[] };
    const keys = new Map<string, CryptoKey>();
    for (const k of j.keys || []) keys.set(k.kid, await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
    jwks = { keys, until: Date.now() + 3600_000 };
  }
  const key = jwks.keys.get(head.kid);
  if (!key) return null;
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  return ok ? claims.sub : null;
}
