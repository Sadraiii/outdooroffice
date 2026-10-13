import type {
  AddressHit, Activity, ActivityInput, Api, AuthUser, Checkin, Comment, EventDoc, EventInput, EventPhoto, Feedback, Forecast, GeoPlace, InstagramFeed, Notice, Nudge,
  Progress, PushState, Role, Rsvp, Sport, TeamSettings, UserProfile,
} from './types';
import { DEFAULT_NOTIFY } from './defaults';
import { newId } from '../lib/format';
import { cap, whenText, ymd } from '../lib/dates';
import { allocateSeats } from '../lib/seats';
import { BADGES, computeStats, earnedBadges, type Visit } from '../lib/stats';
import { checkinWindow, danishTime } from '../lib/time';
import { weatherFor } from '../lib/weather';
import { imageSize } from '../lib/image';
import { paintPhoto, type Scene } from '../lib/demoPhotos';

const IG_ACCOUNT = 'mahmudonthegram';

const ME = 'u_me';
const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
const now = Date.now();
const day = (off: number) => ymd(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + off));
const at = (off: number, hh: number, mm = 0) => { const d = new Date(); d.setDate(d.getDate() + off); d.setHours(hh, mm, 0, 0); return d.getTime(); };
const liveTime = (() => { const d = new Date(now - 35 * MIN); const t = d.getHours() * 60 + Math.floor(d.getMinutes() / 5) * 5; return d.getDate() === new Date().getDate() ? `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` : '00:05'; })();

const people: [string, string, string, Role][] = [
  [ME, 'Sara', 'sara.loeber', 'member'],
  ['u_jonas', 'Jonas', 'jonas.bars', 'admin'],
  ['u_amira', 'Amira', 'amira.moves', 'admin'],
  ['u_fred', 'Frederik', 'frederik.runs', 'member'],
  ['u_nanna', 'Nanna', 'nanna.koldtvand', 'member'],
  ['u_ali', 'Ali', '', 'member'],
  ['u_emma', 'Emma', 'emma.ude', 'member'],
  ['u_oliver', 'Oliver', '', 'member'],
  ['u_freja', 'Freja', 'freja.fit', 'member'],
  ['u_yusuf', 'Yusuf', '', 'member'],
  ['u_ida', 'Ida', '', 'member'],
  ['u_mikkel', 'Mikkel', 'mikkel.pedaler', 'member'],
];
const bios: Record<string, string> = {
  [ME]: 'Calisthenics om onsdagen, løb i weekenden.', u_jonas: 'Coach. Stænger, ringe og gode undskyldninger for at være ude.',
  u_amira: 'Morgenfitness hver fredag kl. 06:30.', u_fred: 'Løber langt og langsomt.', u_nanna: 'Koldt vand hele vinteren.',
};

const users = new Map<string, UserProfile>();
people.forEach(([id, name, ig, role], i) => users.set(id, {
  id, name, bio: bios[id] || '', instagram: ig, photoURL: null, role, createdAt: now - (60 - i) * DAY,
  followers: 0, following: 0, notify: { ...DEFAULT_NOTIFY }, stats: null, badges: {},
}));

const follows = new Set<string>();
const followPairs: [string, string[]][] = [
  [ME, ['u_jonas', 'u_fred', 'u_amira', 'u_nanna', 'u_ali']],
  ['u_jonas', [ME, 'u_amira', 'u_fred', 'u_ali', 'u_nanna', 'u_emma']],
  ['u_amira', [ME, 'u_jonas', 'u_freja', 'u_emma']],
  ['u_fred', [ME, 'u_jonas', 'u_oliver', 'u_mikkel']],
  ['u_nanna', [ME, 'u_freja', 'u_ida']],
  ['u_ali', [ME, 'u_jonas']], ['u_emma', [ME, 'u_amira']], ['u_freja', [ME, 'u_nanna']], ['u_oliver', [ME, 'u_fred']],
];
followPairs.forEach(([a, list]) => list.forEach((b) => follows.add(`${a}_${b}`)));
function recount() {
  users.forEach((u) => { u.followers = 0; u.following = 0; });
  follows.forEach((k) => { const [a, b] = k.split('_u_').map((x, i) => (i ? 'u_' + x : x)); const ua = users.get(a), ub = users.get(b); if (ua) ua.following++; if (ub) ub.followers++; });
}

const calProgram = [
  { id: 'x_push', name: 'Push-ups', target: 200, unit: 'reps' as const }, { id: 'x_pull', name: 'Pull-ups', target: 50, unit: 'reps' as const },
  { id: 'x_dips', name: 'Dips', target: 100, unit: 'reps' as const }, { id: 'x_squat', name: 'Squats', target: 150, unit: 'reps' as const },
];
const events = new Map<string, EventDoc>();
const ev = (id: string, e: Partial<EventDoc>) => events.set(id, {
  id, title: 'Event', sport: 'andet', official: false, createdBy: ME, coachId: null, date: day(0), time: '', duration: 60, place: '', note: '',
  exercises: [], createdAt: now - 10 * DAY, going: [], goingCount: 0,
  capacity: null, signupUntil: null, photoPolicy: 'all', waitlist: [], photoCount: 0, cover: null,
  cancelled: false, cancelNote: '', geo: null, checkinFrom: null, checkinUntil: null, cohosts: [], feedbackCount: 0, feedbackSum: 0, ...e,
});
ev('e_cal1', { duration: 90, title: 'Calisthenics', sport: 'calisthenics', official: true, createdBy: 'u_jonas', coachId: 'u_jonas', date: day(0), time: liveTime, place: 'Calisthenics-parken ved havnen', note: 'Vi starter ved stængerne. Tag handsker med til pull-ups.', exercises: calProgram });
ev('e_fit', { duration: 45, title: 'Morgenfitness', sport: 'fitness', official: true, createdBy: 'u_amira', coachId: 'u_amira', date: day(2), time: '06:30', place: 'Græsplænen ved stranden', note: 'Husk refleks. Det er stadig mørkt om morgenen.', exercises: [{ id: 'x_burp', name: 'Burpees', target: 100, unit: 'reps' }, { id: 'x_lunge', name: 'Lunges', target: 100, unit: 'reps' }, { id: 'x_plank', name: 'Planke', target: 180, unit: 'sek' }] });
ev('e_swim', { title: 'Vinterbadning ved molen', sport: 'vinterbadning', official: false, createdBy: 'u_nanna', coachId: 'u_nanna', cohosts: ['u_freja'], date: day(3), time: '07:00', place: 'Molen ved havnen', note: 'Tag håndklæde og varm te med. Der er plads til fire i saunaen bagefter.', capacity: 4 });
ev('e_big', { duration: 180,
  title: 'Outdoor Office Challenge', sport: 'calisthenics', official: true, createdBy: 'u_jonas', coachId: 'u_jonas', cohosts: ['u_amira'], date: day(10), time: '10:00', place: 'Stranden ved isbaren',
  note: 'Årets store udendørs challenge. Hold på fire, poster langs stranden og fælles morgenmad bagefter.', capacity: 40, signupUntil: at(8, 20), photoPolicy: 'host', createdAt: now - 3 * HOUR,
  exercises: [{ id: 'x_b1', name: 'Burpees', target: 100, unit: 'reps' }, { id: 'x_b2', name: 'Pull-ups', target: 50, unit: 'reps' }, { id: 'x_b3', name: 'Squats', target: 150, unit: 'reps' }, { id: 'x_b4', name: 'Løb', target: 5, unit: 'km' }],
});
ev('e_run', { duration: 75, title: 'Søndagsløb 8 km', sport: 'lob', official: false, createdBy: 'u_fred', coachId: 'u_fred', date: day(4), time: '09:00', place: 'P-pladsen ved skoven', note: 'Roligt tempo. Kaffe bagefter.', exercises: [{ id: 'x_run', name: 'Løb', target: 8, unit: 'km' }] });
ev('e_hill', {
  title: 'Bakkeløb', sport: 'lob', official: false, createdBy: 'u_oliver', coachId: 'u_oliver', date: day(5), time: '09:00', place: 'Bakkerne ved skoven',
  note: '6 x bakke op og ned. Alle tempi.', cancelled: true, cancelNote: 'Aflyst pga. storm. Vi tager den næste søndag i stedet.', createdAt: now - 2 * DAY,
});
ev('e_pizza', { duration: 150, title: 'Pizza efter træning', sport: 'socialt', official: false, createdBy: 'u_ali', coachId: 'u_ali', date: day(7), time: '19:30', place: 'Ali har pizzaovnen klar', note: 'Alle er velkomne. Vi deler regningen.' });
ev('e_cal2', { duration: 90, title: 'Calisthenics', sport: 'calisthenics', official: true, createdBy: 'u_jonas', coachId: 'u_jonas', date: day(7), time: '17:30', place: 'Calisthenics-parken ved havnen', exercises: calProgram });
ev('e_cal0', { duration: 90, title: 'Calisthenics', sport: 'calisthenics', official: true, createdBy: 'u_jonas', coachId: 'u_jonas', date: day(-7), time: '17:30', place: 'Calisthenics-parken ved havnen', exercises: calProgram });
ev('e_coffee', { duration: 90,
  title: 'Løb og kaffe', sport: 'lob', official: false, createdBy: ME, coachId: ME, cohosts: ['u_fred'], date: day(-4), time: '09:00', place: 'Søerne, ved Dronning Louises Bro',
  note: 'Roligt tempo, kaffe bagefter.', exercises: [{ id: 'x_cf', name: 'Løb', target: 7, unit: 'km' }], createdAt: now - 9 * DAY,
});

const rsvps = new Map<string, Map<string, number>>();
const going: Record<string, string[]> = {
  e_cal1: [ME, 'u_jonas', 'u_amira', 'u_fred', 'u_nanna', 'u_ali', 'u_emma', 'u_yusuf', 'u_ida'],
  e_fit: [ME, 'u_amira', 'u_nanna', 'u_emma', 'u_freja', 'u_yusuf', 'u_ida'],
  e_swim: ['u_nanna', 'u_freja', 'u_ida', 'u_emma', 'u_oliver'],
  e_big: ['u_jonas', 'u_amira', 'u_fred', 'u_ali', 'u_nanna', 'u_emma', 'u_freja', 'u_oliver', 'u_ida', 'u_yusuf'],
  e_run: ['u_fred', 'u_amira', 'u_ali', 'u_oliver', 'u_yusuf'],
  e_pizza: ['u_ali', 'u_jonas', 'u_nanna', 'u_oliver', 'u_freja', 'u_emma', 'u_mikkel', 'u_yusuf', 'u_ida', 'u_fred', 'u_amira'],
  e_cal2: ['u_jonas', 'u_nanna', 'u_freja', 'u_yusuf'],
  e_cal0: [ME, 'u_jonas', 'u_ali', 'u_fred', 'u_nanna'],
  e_coffee: [ME, 'u_fred', 'u_emma', 'u_oliver', 'u_ida', 'u_amira', 'u_yusuf'],
  e_hill: ['u_oliver', 'u_fred', ME],
};
Object.entries(going).forEach(([eid, list]) => rsvps.set(eid, new Map(list.map((u, i) => [u, now - 4 * DAY + i * HOUR]))));
function syncGoing(eid: string): string[] {
  const e = events.get(eid); if (!e) return [];
  const m = rsvps.get(eid) || new Map();
  const order = [...m.entries()].sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  const before = e.waitlist;
  const next = allocateSeats(order, e.going, e.capacity);
  e.going = next.going; e.goingCount = next.going.length; e.waitlist = next.waitlist;
  return next.going.filter((u) => before.includes(u));
}
function announcePromoted(eid: string, promoted: string[]) {
  const e = events.get(eid); if (!e) return;
  promoted.forEach((u) => {
    act(newId('a'), { uid: u, kind: 'rsvp', eventId: eid, createdAt: Date.now() });
    if (u === ME) notifyMe({ type: 'seat', title: `Du har fået en plads til ${e.title}`, body: `${e.official ? 'OFFICIAL EVENT' : 'COMMUNITY MADE EVENT'} · ${whenText(e)}`, link: `/e/${eid}` });
  });
}
events.forEach((_, id) => syncGoing(id));
function syncWindow(e: EventDoc) { const w = checkinWindow(e.date, e.time); e.checkinFrom = w ? w.from : null; e.checkinUntil = w ? w.until : null; }
events.forEach(syncWindow);

const P = (push: number, pull: number, dips: number, squat: number) => ({ x_push: push, x_pull: pull, x_dips: dips, x_squat: squat });
const progress = new Map<string, Map<string, Progress>>();
const cal1: [string, Record<string, number>][] = [
  [ME, P(120, 30, 60, 150)], ['u_jonas', P(200, 50, 100, 150)], ['u_amira', P(160, 35, 80, 120)], ['u_fred', P(90, 20, 40, 100)],
  ['u_nanna', P(140, 25, 70, 150)], ['u_ali', P(200, 42, 100, 90)], ['u_emma', P(60, 12, 30, 75)], ['u_yusuf', P(110, 28, 50, 60)], ['u_ida', P(30, 8, 20, 50)],
];
progress.set('e_cal1', new Map(cal1.map(([u, c], i) => [u, { uid: u, counts: c, updatedAt: now - i * 3 * MIN, done: u === 'u_jonas' }])));
progress.set('e_cal0', new Map([[ME, { uid: ME, counts: P(200, 50, 100, 150), updatedAt: now - 7 * DAY, done: true }]]));
const coffeeKm: [string, number][] = [[ME, 7], ['u_fred', 7], ['u_emma', 5.5], ['u_ida', 7], ['u_amira', 7], ['u_yusuf', 6]];
progress.set('e_coffee', new Map(coffeeKm.map(([u, km], i) => [u, { uid: u, counts: { x_cf: km }, updatedAt: at(-4, 10, i), done: km >= 7 }])));

const photos = new Map<string, EventPhoto[]>();
function syncPhotos(eid: string) {
  const e = events.get(eid); if (!e) return;
  const list = photos.get(eid) || [];
  const host = list.filter((p) => p.host).sort((a, b) => a.at - b.at)[0];
  e.photoCount = list.length; e.cover = host ? host.url : null;
}
let photosMade = false;
function makePhotos() {
  if (photosMade) return; photosMade = true;
  const add = (eid: string, uid: string, scene: Scene, seed: number, host: boolean, t: number, w = 1200, h = 800) => {
    const list = photos.get(eid) || []; photos.set(eid, list);
    list.push({ id: newId('p'), uid, url: paintPhoto(scene, w, h, seed), w, h, at: t, host });
  };
  add('e_big', 'u_jonas', 'beach', 1, true, now - 3 * HOUR);
  add('e_big', 'u_jonas', 'bars', 2, true, now - 3 * HOUR + MIN);
  add('e_big', 'u_jonas', 'track', 3, true, now - 3 * HOUR + 2 * MIN);
  add('e_big', 'u_jonas', 'harbor', 4, true, now - 3 * HOUR + 3 * MIN);
  add('e_swim', 'u_nanna', 'lake', 5, true, now - 4 * DAY);
  add('e_cal0', 'u_jonas', 'bars', 6, true, now - 7 * DAY + HOUR);
  add('e_cal0', ME, 'harbor', 7, false, now - 7 * DAY + 2 * HOUR, 900, 900);
  add('e_cal0', 'u_ali', 'beach', 8, false, now - 7 * DAY + 3 * HOUR, 900, 900);
  add('e_cal0', 'u_fred', 'track', 9, false, now - 7 * DAY + 4 * HOUR, 900, 1100);
  add('e_cal0', 'u_nanna', 'trail', 10, false, now - 7 * DAY + 5 * HOUR, 900, 900);
  add('e_cal0', 'u_ali', 'lake', 12, false, now - 7 * DAY + 6 * HOUR, 900, 900);
  add('e_run', 'u_fred', 'trail', 11, true, now - 30 * HOUR);
  add('e_coffee', ME, 'lake', 13, true, at(-4, 10, 40), 1200, 900);
  add('e_coffee', 'u_fred', 'trail', 14, true, at(-4, 10, 46), 900, 1100);
  add('e_coffee', 'u_emma', 'harbor', 15, false, at(-4, 11, 5), 900, 900);
  add('e_cal1', 'u_jonas', 'bars', 16, true, now - 20 * MIN);
  events.forEach((_, id) => syncPhotos(id));
}
setTimeout(() => { makePhotos(); emit(); }, 30);

const activities = new Map<string, Activity>();
const act = (id: string, a: Partial<Activity>) => activities.set(id, { id, uid: ME, kind: 'workout', createdAt: now, kudos: 0, comments: 0, ...a });
act('a1', { uid: 'u_fred', sport: 'lob', title: 'Morgenløb langs vandet', text: 'Tåge over havnen og helt stille. Bedste start på dagen.', distanceKm: 8.2, durationSec: 42 * 60 + 10, createdAt: now - 40 * MIN, kudos: 7, comments: 2 });
act('a3', { uid: 'u_amira', kind: 'rsvp', eventId: 'e_fit', createdAt: now - 2 * HOUR });
act('a4', { uid: 'u_nanna', kind: 'event', eventId: 'e_swim', createdAt: now - 5 * HOUR, kudos: 3 });
act('a5', { uid: 'u_mikkel', sport: 'cykling', title: 'Rundt om fjorden', distanceKm: 32.4, durationSec: 65 * 60 + 12, createdAt: now - 9 * HOUR, kudos: 5, comments: 0 });
act('a6', { uid: ME, kind: 'goal', sport: 'calisthenics', title: 'Calisthenics', eventId: 'e_cal0', reps: [{ name: 'Push-ups', count: 200 }, { name: 'Pull-ups', count: 50 }, { name: 'Dips', count: 100 }, { name: 'Squats', count: 150 }], createdAt: now - 7 * DAY + 2 * HOUR, kudos: 9, comments: 3 });
act('a7', { uid: 'u_emma', sport: 'gang', title: 'Søndagstur i skoven', distanceKm: 6.1, durationSec: 78 * 60, createdAt: now - 26 * HOUR, kudos: 2 });
act('a8', { uid: 'u_ali', sport: 'calisthenics', title: 'Ekstra pull-up-session', reps: [{ name: 'Pull-ups', count: 60 }, { name: 'Push-ups', count: 150 }], durationSec: 35 * 60, createdAt: now - 30 * HOUR, kudos: 6, comments: 1 });
act('a9', { uid: 'u_fred', kind: 'event', eventId: 'e_run', createdAt: now - 32 * HOUR, kudos: 4 });
act('a10', { uid: 'u_jonas', kind: 'event', eventId: 'e_big', createdAt: now - 3 * HOUR, kudos: 11, comments: 0 });

const checkins = new Map<string, Map<string, Checkin>>();
const checkIn = (eid: string, uid: string, t: number) => { const m = checkins.get(eid) || new Map(); checkins.set(eid, m); m.set(uid, { uid, at: t, by: uid }); };
['u_jonas', 'u_amira', 'u_fred', 'u_nanna', 'u_emma'].forEach((u, i) => checkIn('e_cal1', u, now - (32 - i * 4) * MIN));
[ME, 'u_jonas', 'u_ali', 'u_fred', 'u_nanna'].forEach((u, i) => checkIn('e_cal0', u, at(-7, 17, 25 + i)));
[ME, 'u_fred', 'u_emma', 'u_ida', 'u_amira', 'u_yusuf'].forEach((u, i) => checkIn('e_coffee', u, at(-4, 8, 55 + i)));

const SESSIONS: Record<string, [number, string, Sport]> = {
  cal: [2, '17:30', 'calisthenics'], fit: [4, '06:30', 'fitness'], swim: [5, '07:00', 'vinterbadning'], run: [6, '09:00', 'lob'], yoga: [1, '18:00', 'yoga'],
};
const PLANS: Record<string, string> = {
  [ME]: '1:fit 2:cal,fit,swim 3:cal,fit,run 4:cal,swim 5:cal,fit 6:cal,fit,run 8:cal,fit 9:cal 10:cal,fit 12:cal,run 14:cal',
  u_jonas: '2-31:cal 1-31/2:fit 1-10:run', u_amira: '1-12:fit 1-12/2:cal 14-20:fit', u_nanna: '1-9:swim 2-9/2:cal 11-16:swim',
  u_fred: '1-3:run 2-3:cal 5-12:run', u_ali: '3-14:cal 4-14/2:run', u_emma: '1-2:yoga 5-8:yoga', u_oliver: '3-6:run 8:cal',
  u_freja: '4:fit 6:fit', u_yusuf: '1-6:fit 1-6/3:cal', u_ida: '1-5:swim', u_mikkel: '6-8:run',
};
const monday = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
const history = new Map<string, Visit[]>();
Object.entries(PLANS).forEach(([uid, plan]) => {
  const list: Visit[] = [];
  plan.split(' ').forEach((part) => {
    const [range, names] = part.split(':');
    const [span, step = '1'] = range.split('/');
    const [a, b = a] = span.split('-').map(Number);
    for (let w = a; w <= b; w += Number(step)) {
      names.split(',').forEach((n) => {
        const [dow, time, sport] = SESSIONS[n];
        const d = new Date(monday); d.setDate(d.getDate() - 7 * w + dow);
        list.push({ date: ymd(d), time, sport });
      });
    }
  });
  history.set(uid, list);
});
function visitsOf(uid: string): Visit[] {
  const real: Visit[] = [];
  checkins.forEach((m, eid) => { const e = events.get(eid); if (e && m.has(uid)) real.push({ date: e.date, time: e.time, sport: e.sport }); });
  return [...(history.get(uid) || []), ...real].sort((a, b) => (a.date + (a.time || '') < b.date + (b.time || '') ? -1 : 1));
}
const badgeTime = (v: Visit) => danishTime(v.date, v.time || '12:00') ?? now;
function syncStats(uid: string, announce: boolean): string[] {
  const u = users.get(uid); if (!u) return [];
  const visits = visitsOf(uid);
  u.stats = computeStats(visits);
  const fresh = earnedBadges(u.stats).filter((id) => !u.badges[id]);
  fresh.forEach((id) => {
    let when = Date.now();
    if (!announce) { for (let i = 1; i <= visits.length; i++) if (earnedBadges(computeStats(visits.slice(0, i))).includes(id)) { when = badgeTime(visits[i - 1]) + HOUR; break; } }
    u.badges[id] = when;
  });
  const shown = [...fresh].sort((a, b) => u.badges[b] - u.badges[a]).slice(0, announce && fresh.length <= 2 ? fresh.length : 1);
  shown.forEach((id) => {
    const when = u.badges[id];
    if (announce) act(`badge_${uid}_${id}`, { uid, kind: 'badge', badge: id, createdAt: when, kudos: 0, comments: 0 });
    else if (when > now - 6 * DAY) seedCards.push({ uid, id, when });
  });
  return fresh;
}
const seedCards: { uid: string; id: string; when: number }[] = [];
users.forEach((_, uid) => syncStats(uid, false));
seedCards.sort((a, b) => b.when - a.when).slice(0, 2).forEach(({ uid, id, when }) => act(`badge_${uid}_${id}`, { uid, kind: 'badge', badge: id, createdAt: when, kudos: 3 + (when % 5), comments: 0 }));

const feedback = new Map<string, Map<string, Feedback>>();
function syncFeedback(eid: string) {
  const e = events.get(eid); if (!e) return;
  const list = [...(feedback.get(eid) || new Map<string, Feedback>()).values()];
  e.feedbackCount = list.length; e.feedbackSum = list.reduce((a, f) => a + f.rating, 0);
}
const answer = (eid: string, uid: string, rating: number, text: string, t: number) => {
  const m = feedback.get(eid) || new Map<string, Feedback>(); feedback.set(eid, m); m.set(uid, { uid, rating, text, at: t });
};
answer('e_coffee', 'u_emma', 5, 'Perfekt tempo, og kaffen var god!', at(-4, 12, 10));
answer('e_coffee', 'u_ida', 4, 'Hyggeligt. Gerne en lidt længere tur næste gang.', at(-4, 13, 2));
answer('e_coffee', 'u_amira', 5, '', at(-4, 15, 40));
answer('e_coffee', 'u_yusuf', 5, 'Fed tur. Jeg er med igen på lørdag.', at(-3, 9, 15));
answer('e_cal0', 'u_ali', 5, 'Stænger, sol og god stemning.', at(-7, 20, 5));
answer('e_cal0', 'u_fred', 4, '', at(-7, 20, 30));
answer('e_cal0', 'u_nanna', 5, 'Jonas var en super coach i dag.', at(-6, 8, 0));
events.forEach((_, id) => syncFeedback(id));
let nudges: Nudge[] = [
  { id: 'nu1', from: 'u_jonas', to: 'u_mikkel', text: 'Hej Mikkel! Vi savner dig i parken. Kom og vær med onsdag kl. 17:30.', eventId: 'e_cal1', at: now - 10 * DAY, status: 'sent', sentAt: now - 10 * DAY },
];

const kudos = new Map<string, Map<string, number>>();
const kudosBy = (aid: string, list: string[]) => kudos.set(aid, new Map(list.map((u, i) => [u, now - i * MIN])));
kudosBy('a1', [ME, 'u_jonas', 'u_amira', 'u_nanna', 'u_oliver', 'u_mikkel', 'u_ida']);
kudosBy('a4', ['u_freja', 'u_ida', 'u_emma']);
kudosBy('a5', ['u_fred', 'u_oliver', 'u_jonas', 'u_ida', 'u_yusuf']);
kudosBy('a6', ['u_jonas', 'u_amira', 'u_fred', 'u_nanna', 'u_ali', 'u_emma', 'u_oliver', 'u_freja', 'u_mikkel']);
kudosBy('a7', ['u_amira', 'u_freja']);
kudosBy('a8', ['u_jonas', ME, 'u_fred', 'u_oliver', 'u_yusuf', 'u_mikkel']);
kudosBy('a9', ['u_amira', 'u_ali', 'u_oliver', 'u_mikkel']);
kudosBy('a10', ['u_amira', 'u_fred', 'u_ali', 'u_nanna', 'u_emma', 'u_freja', 'u_oliver', 'u_ida', 'u_mikkel', 'u_yusuf', 'u_jonas']);

const comments = new Map<string, Comment[]>();
comments.set('a1', [{ id: 'c1', uid: 'u_jonas', text: 'Flot tempo! Ses onsdag.', at: now - 30 * MIN }, { id: 'c2', uid: 'u_amira', text: 'Den tåge 😍', at: now - 20 * MIN }]);
comments.set('a6', [{ id: 'c4', uid: 'u_jonas', text: 'Alle 600 reps. Stærkt gået!', at: now - 7 * DAY + 3 * HOUR }, { id: 'c5', uid: 'u_ali', text: 'Næste gang tager vi 250 push-ups 💪', at: now - 7 * DAY + 4 * HOUR }, { id: 'c6', uid: ME, text: 'Deal!', at: now - 7 * DAY + 5 * HOUR }]);
comments.set('a8', [{ id: 'c7', uid: 'u_jonas', text: '60 pull-ups er vildt.', at: now - 29 * HOUR }]);

let notices: Notice[] = [
  { id: 'n00', type: 'reminder', title: `I dag kl. ${liveTime}: Calisthenics`, body: 'Calisthenics-parken ved havnen · 11° og let skyet', link: '/e/e_cal1', at: now - 75 * MIN, read: true },
  { id: 'n0', type: 'official', actorId: 'u_jonas', title: 'Nyt OFFICIAL EVENT: Outdoor Office Challenge', body: `${cap(whenText(events.get('e_big')!))} · Stranden ved isbaren · 40 pladser`, link: '/e/e_big', at: now - 3 * HOUR, read: true },
  { id: 'n1', type: 'activity', actorId: 'u_fred', title: 'Frederik løb 8,2 km', body: 'Morgenløb langs vandet · 42:10', link: '/a/a1', at: now - 40 * MIN, read: false },
  { id: 'n2', type: 'rsvp', actorId: 'u_amira', title: 'Amira har tilmeldt sig Morgenfitness', body: 'OFFICIAL EVENT · fredag kl. 06:30', link: '/e/e_fit', at: now - 2 * HOUR, read: false },
  { id: 'n3', type: 'kudos', actorId: 'u_jonas', title: 'Jonas gav dig high five', body: 'For Calisthenics', link: '/a/a6', at: now - 3 * HOUR, read: false },
  { id: 'n4', type: 'community', actorId: 'u_nanna', title: 'Nanna har oprettet et event', body: 'COMMUNITY MADE EVENT · Vinterbadning ved molen', link: '/e/e_swim', at: now - 5 * HOUR, read: true },
  { id: 'n5', type: 'official', actorId: 'u_jonas', title: 'Nyt OFFICIAL EVENT: Calisthenics', body: `${cap(whenText(events.get('e_cal2')!))} · Calisthenics-parken ved havnen`, link: '/e/e_cal2', at: now - 26 * HOUR, read: true },
  { id: 'n6', type: 'follows', actorId: 'u_ali', title: 'Ali følger dig', body: '', link: '/u/u_ali', at: now - 2 * DAY, read: true },
  { id: 'n7', type: 'cancel', actorId: 'u_oliver', title: 'Aflyst: Bakkeløb', body: `${cap(whenText(events.get('e_hill')!))} · ${events.get('e_hill')!.cancelNote}`, link: '/e/e_hill', at: now - 4 * HOUR, read: false },
  { id: 'n8', type: 'change', actorId: 'u_amira', title: 'Nyt sted: Morgenfitness', body: `${cap(whenText(events.get('e_fit')!))} · Græsplænen ved stranden`, link: '/e/e_fit', at: now - 20 * HOUR, read: true },
];
notices.sort((a, b) => b.at - a.at);

let instagram: InstagramFeed | null = null;
let push: PushState = 'default';
let authed: boolean = true;

const listeners = new Set<() => void>();
let queued = false;
function emit() {
  recount();
  if (queued) return; queued = true;
  setTimeout(() => { queued = false; listeners.forEach((l) => l()); }, 0);
}
function watch<T>(compute: () => T, cb: (v: T) => void) {
  const l = () => cb(compute());
  listeners.add(l); setTimeout(l, 0);
  return () => { listeners.delete(l); };
}
recount();

const fgListeners = new Set<(n: { title: string; body: string; link?: string }) => void>();
function notifyMe(n: Omit<Notice, 'id' | 'at' | 'read'>, toast = true) {
  notices = [{ ...n, id: newId('n'), at: Date.now(), read: false }, ...notices];
  emit();
  if (toast) fgListeners.forEach((f) => f({ title: n.title, body: n.body, link: n.link }));
}
setTimeout(() => {
  const mine = [...activities.values()].filter((a) => a.uid === ME).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (mine && !kudos.get(mine.id)?.has('u_nanna')) {
    const m = kudos.get(mine.id) || new Map(); m.set('u_nanna', Date.now()); kudos.set(mine.id, m); mine.kudos = m.size;
    const what = mine.kind === 'badge' ? `dit mærke ${BADGES.find((b) => b.id === mine.badge)?.name || ''}`.trim() : mine.title || 'din træning';
    notifyMe({ type: 'kudos', actorId: 'u_nanna', title: 'Nanna gav dig high five', body: `For ${what}`, link: `/a/${mine.id}` });
  }
}, 12000);
setTimeout(() => {
  const m = rsvps.get('e_run'); if (m && !m.has('u_jonas')) { m.set('u_jonas', Date.now()); syncGoing('e_run'); }
  act(newId('a'), { uid: 'u_jonas', kind: 'rsvp', eventId: 'e_run', createdAt: Date.now() });
  notifyMe({ type: 'rsvp', actorId: 'u_jonas', title: 'Jonas har tilmeldt sig Søndagsløb 8 km', body: 'COMMUNITY MADE EVENT · søndag kl. 09:00', link: '/e/e_run' });
}, 30000);

async function makeInstagram(): Promise<InstagramFeed> {
  const scenes: [Scene, number][] = [['bars', 21], ['beach', 22], ['lake', 23], ['track', 24], ['trail', 25], ['harbor', 26]];
  const posts = scenes.map(([scene, seed], i) => ({
    id: `ig${i}`, type: 'IMAGE', image: paintPhoto(scene, 480, 480, seed), permalink: `https://www.instagram.com/${IG_ACCOUNT}/`, at: new Date(now - i * DAY).toISOString(),
  }));
  return { username: IG_ACCOUNT, posts, updatedAt: now };
}

const TOWNS: GeoPlace[] = [
  { name: 'København', lat: 55.676, lon: 12.568, region: 'Hovedstaden' }, { name: 'Frederiksberg', lat: 55.679, lon: 12.533, region: 'Hovedstaden' },
  { name: 'Aarhus', lat: 56.157, lon: 10.211, region: 'Midtjylland' }, { name: 'Odense', lat: 55.396, lon: 10.388, region: 'Syddanmark' },
  { name: 'Aalborg', lat: 57.048, lon: 9.919, region: 'Nordjylland' }, { name: 'Esbjerg', lat: 55.476, lon: 8.459, region: 'Syddanmark' },
  { name: 'Roskilde', lat: 55.642, lon: 12.08, region: 'Sjælland' }, { name: 'Hillerød', lat: 55.927, lon: 12.3, region: 'Hovedstaden' },
  { name: 'Helsingør', lat: 56.036, lon: 12.612, region: 'Hovedstaden' }, { name: 'Køge', lat: 55.457, lon: 12.182, region: 'Sjælland' },
  { name: 'Frederikssund', lat: 55.839, lon: 12.069, region: 'Hovedstaden' }, { name: 'Holbæk', lat: 55.717, lon: 11.713, region: 'Sjælland' },
  { name: 'Vejle', lat: 55.709, lon: 9.536, region: 'Syddanmark' }, { name: 'Kolding', lat: 55.49, lon: 9.472, region: 'Syddanmark' },
  { name: 'Horsens', lat: 55.861, lon: 9.85, region: 'Midtjylland' }, { name: 'Randers', lat: 56.461, lon: 10.036, region: 'Midtjylland' },
  { name: 'Silkeborg', lat: 56.17, lon: 9.545, region: 'Midtjylland' }, { name: 'Herning', lat: 56.139, lon: 8.974, region: 'Midtjylland' },
  { name: 'Næstved', lat: 55.23, lon: 11.761, region: 'Sjælland' }, { name: 'Slagelse', lat: 55.402, lon: 11.355, region: 'Sjælland' },
  { name: 'Svendborg', lat: 55.06, lon: 10.607, region: 'Syddanmark' }, { name: 'Kongens Lyngby', lat: 55.77, lon: 12.504, region: 'Hovedstaden' },
  { name: 'Hørsholm', lat: 55.881, lon: 12.501, region: 'Hovedstaden' }, { name: 'Ballerup', lat: 55.731, lon: 12.363, region: 'Hovedstaden' },
];
let team: TeamSettings = { weather: TOWNS[0] };
const DAYS_WX: [number, number, number, number, number][] = [
  [2, 13, 7, 5, 10], [3, 12, 8, 6, 20], [45, 11, 4, 3, 10], [0, 12, 3, 4, 0], [51, 10, 6, 7, 50], [82, 11, 7, 15, 85], [3, 10, 6, 6, 25], [61, 9, 5, 8, 70],
  [2, 10, 4, 5, 10], [1, 11, 5, 4, 5], [1, 12, 6, 4, 5], [3, 10, 6, 6, 20], [63, 9, 6, 9, 80], [2, 9, 3, 4, 10], [0, 8, 2, 3, 0], [3, 9, 4, 5, 15],
];
const PAST_WX: [number, number, number, number, number][] = [
  [3, 12, 7, 6, 20], [61, 11, 7, 8, 70], [2, 13, 6, 4, 10], [1, 12, 5, 3, 5], [3, 12, 7, 5, 20], [80, 11, 7, 9, 60], [2, 12, 6, 5, 10],
];
function demoForecast(place: GeoPlace): Forecast {
  const shift = (place.lat - 55.7) * -1.5;
  const hours: Forecast['hours'] = [], days: Forecast['days'] = [];
  [...PAST_WX, ...DAYS_WX].forEach(([code, max, min, wind, pop], k) => {
    const date = day(k - PAST_WX.length);
    days.push({ date, max: max + shift, min: min + shift, code, pop, wind });
    for (let h = 0; h < 24; h++) {
      const warm = 0.5 - 0.5 * Math.cos((2 * Math.PI * (h - 3)) / 24);
      const temp = min + shift + (max - min) * warm;
      const t = danishTime(date, `${String(h).padStart(2, '0')}:00`);
      if (t !== null) hours.push({ t, temp, feels: temp - wind * 0.5, code: code === 45 && h > 10 ? 3 : code, pop, wind });
    }
  });
  return { hours, days, fetchedAt: Date.now() };
}
const ADDRESSES: AddressHit[] = ([
  ['Fælledparken', 'Østerbro, 2100 København', 'København', 55.7003, 12.5717],
  ['Søerne, Dronning Louises Bro', '2200 København N', 'København', 55.6866, 12.5617],
  ['Amager Strandpark', 'Amager Strandvej, 2300 København S', 'København', 55.6577, 12.6406],
  ['Islands Brygge Havnebad', 'Islands Brygge 14, 2300 København S', 'København', 55.6681, 12.5767],
  ['Kastellet', 'Gl. Hovedvagt 1, 2100 København Ø', 'København', 55.6914, 12.5946],
  ['Kongens Have', 'Øster Voldgade 4A, 1350 København K', 'København', 55.6855, 12.5795],
  ['Valbyparken', 'Hammelstrupvej, 2450 København SV', 'København', 55.6435, 12.5094],
  ['Superkilen', 'Nørrebrogade 210, 2200 København N', 'København', 55.6996, 12.5422],
  ['Enghaveparken', 'Enghavevej, 1674 København V', 'København', 55.6669, 12.5426],
  ['Frederiksberg Have', 'Frederiksberg Runddel 1A, 2000 Frederiksberg', 'Frederiksberg', 55.6738, 12.5277],
  ['Bellevue Strand', 'Strandvejen 340, 2930 Klampenborg', 'Klampenborg', 55.7766, 12.5919],
  ['Dyrehaven, Hjortekær', 'Hjortekærsvej, 2800 Kongens Lyngby', 'Kongens Lyngby', 55.7881, 12.5482],
  ['Svanemøllestranden', 'Strandpromenaden, 2100 København Ø', 'København', 55.7234, 12.5805],
  ['Fælledparken, Pavillonen', 'Gunnar Nu Hansens Plads, 2100 København Ø', 'København', 55.7021, 12.5671],
  ['Nørrebrogade 10', '2200 København N', 'København', 55.6869, 12.5596],
  ['Nørre Allé 51', '2200 København N', 'København', 55.6941, 12.5532],
  ['Vesterbrogade 1', '1620 København V', 'København', 55.6738, 12.5656],
  ['Strandvejen 100', '2900 Hellerup', 'Hellerup', 55.7329, 12.5786],
  ['Amager Strandvej 110', '2300 København S', 'København', 55.6587, 12.6363],
  ['Enghave Brygge, calisthenics-parken', 'Enghave Brygge, 2450 København SV', 'København', 55.6553, 12.5459],
  ['Vikingeskibsmuseet', 'Vindeboder 12, 4000 Roskilde', 'Roskilde', 55.6503, 12.0798],
  ['Ørestad Strand', 'Ørestads Boulevard, 2300 København S', 'København', 55.6297, 12.5762],
] as [string, string, string, number, number][]).map(([name, detail, town, lat, lon]) => ({ name, detail, town, lat, lon, dk: true }));
const fold = (s: string) => s.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const calKeys: Record<string, string> = {};
{
  const w = weatherFor(events.get('e_cal1')!, demoForecast(TOWNS[0]));
  if (w) notices = notices.map((n) => (n.id === 'n00' ? { ...n, body: `Calisthenics-parken ved havnen · ${Math.round(w.temp)}° og ${w.label.toLowerCase()}` } : n));
}

const demoUser: AuthUser = { uid: ME, email: 'sara@example.com', displayName: 'Sara', photoURL: null };
const authListeners = new Set<(u: AuthUser | null) => void>();
const setAuthed = (v: boolean) => { authed = v; authListeners.forEach((f) => f(v ? demoUser : null)); };
const sorted = <T extends { createdAt: number }>(list: T[]) => list.sort((a, b) => b.createdAt - a.createdAt);
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export const api: Api = {
  mode: 'demo',
  features: { push: true, calendarFeed: true, reminders: true },
  onAuth(cb) { authListeners.add(cb); setTimeout(() => cb(authed ? demoUser : null), 0); return () => { authListeners.delete(cb); }; },
  async signInEmail() { await delay(); setAuthed(true); },
  async signUpEmail() { await delay(); setAuthed(true); },
  async resetPassword() { await delay(); },
  async signInGoogle() { await delay(); setAuthed(true); },
  async signOut() { setAuthed(false); },

  watchProfile(uid, cb) { return watch(() => (users.get(uid) ? { ...users.get(uid)! } : null), cb); },
  async createProfile(uid, d) { users.set(uid, { id: uid, name: d.name, bio: d.bio || '', instagram: d.instagram || '', photoURL: d.photoURL || null, role: 'member', createdAt: Date.now(), followers: 0, following: 0, notify: { ...DEFAULT_NOTIFY }, stats: null, badges: {} }); emit(); },
  async updateProfile(uid, patch) { const u = users.get(uid); if (u) Object.assign(u, patch); emit(); },
  watchUsers(cb) { return watch(() => [...users.values()].map((u) => ({ ...u })).sort((a, b) => a.name.localeCompare(b.name, 'da')), cb); },
  async setRole(uid, role) { const u = users.get(uid); if (u) u.role = role; emit(); },
  async uploadImage(_uid, _kind, blob) {
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
  },

  watchFollowing(uid, cb) { return watch(() => new Set([...follows].filter((k) => k.startsWith(uid + '_')).map((k) => k.slice(uid.length + 1))), cb); },
  watchFollowers(uid, cb) { return watch(() => new Set([...follows].filter((k) => k.endsWith('_' + uid)).map((k) => k.slice(0, k.length - uid.length - 1))), cb); },
  async follow(me, other) { follows.add(`${me}_${other}`); emit(); },
  async unfollow(me, other) { follows.delete(`${me}_${other}`); emit(); },

  watchEvents(cb) { return watch(() => [...events.values()].map((e) => ({ ...e, going: [...e.going], waitlist: [...e.waitlist] })), cb); },
  watchEvent(id, cb) { return watch(() => { const e = events.get(id); return e ? { ...e, going: [...e.going], waitlist: [...e.waitlist] } : null; }, cb); },
  watchMyRsvps(uid, cb) { return watch(() => new Set([...rsvps.entries()].filter(([, m]) => m.has(uid)).map(([eid]) => eid)), cb); },
  async setRsvp(eid, uid, on) {
    const e = events.get(eid);
    if (on && e?.cancelled) throw new Error('Eventet er aflyst');
    if (on && e?.signupUntil && Date.now() > e.signupUntil) throw new Error('Tilmeldingen er lukket');
    const m = rsvps.get(eid) || new Map<string, number>(); rsvps.set(eid, m);
    if (on) m.set(uid, Date.now());
    else { m.delete(uid); [...activities.values()].filter((a) => a.kind === 'rsvp' && a.uid === uid && a.eventId === eid).forEach((a) => activities.delete(a.id)); }
    const promoted = syncGoing(eid);
    if (on && e?.going.includes(uid)) act(newId('a'), { uid, kind: 'rsvp', eventId: eid, createdAt: Date.now() });
    announcePromoted(eid, promoted);
    emit();
    if (on && uid === ME && e && e.waitlist.includes(ME)) {
      const step = () => {
        const ev2 = events.get(eid); const list = rsvps.get(eid);
        if (!ev2 || !list || !ev2.waitlist.includes(ME)) return;
        const leaving = ev2.waitlist[0] !== ME ? ev2.waitlist[0] : ev2.going.find((u) => u !== ev2.createdBy && u !== ev2.coachId && u !== ME);
        if (!leaving) return;
        list.delete(leaving); announcePromoted(eid, syncGoing(eid)); emit();
        if (ev2.waitlist.includes(ME)) setTimeout(step, 5000);
      };
      setTimeout(step, 6000);
    }
  },
  watchRsvps(eid, cb) { return watch(() => [...(rsvps.get(eid) || new Map()).entries()].map(([uid, at]) => ({ uid, at }) as Rsvp).sort((a, b) => a.at - b.at), cb); },
  async createEvent(uid, d: EventInput) {
    const id = newId('e');
    const e: EventDoc = {
      id, ...d, geo: d.geo || null, coachId: d.coachId === undefined ? uid : d.coachId, createdBy: uid, createdAt: Date.now(), going: [], goingCount: 0, waitlist: [],
      photoCount: 0, cover: null, cancelled: false, cancelNote: '', checkinFrom: null, checkinUntil: null, feedbackCount: 0, feedbackSum: 0,
      cohosts: (d.cohosts || []).filter((u) => u !== uid).slice(0, 5),
    };
    syncWindow(e); events.set(id, e);
    if (!d.seriesIndex) act(newId('a'), { uid, kind: 'event', eventId: id, createdAt: Date.now() });
    emit(); return id;
  },
  async updateEvent(id, d) {
    const e = events.get(id); if (!e) return;
    const capChanged = (e.capacity ?? null) !== (d.capacity ?? null);
    Object.assign(e, d, { geo: d.geo || null, cohosts: (d.cohosts || []).filter((u) => u !== e.createdBy).slice(0, 5), updatedAt: Date.now() });
    syncWindow(e);
    if (capChanged) announcePromoted(id, syncGoing(id));
    emit();
  },
  async setCancelled(id, _by, cancelled, note) {
    const e = events.get(id); if (!e) return;
    e.cancelled = cancelled; e.cancelNote = cancelled ? note.trim().slice(0, 200) : ''; e.updatedAt = Date.now();
    emit();
  },
  watchMyFeedback(eid, uid, cb) { return watch(() => { const f = feedback.get(eid)?.get(uid); return f ? { ...f } : null; }, cb); },
  watchFeedback(eid, cb) { return watch(() => [...(feedback.get(eid) || new Map<string, Feedback>()).values()].map((f) => ({ ...f })).sort((a, b) => b.at - a.at), cb); },
  async setFeedback(eid, uid, rating, text) {
    await delay(200);
    answer(eid, uid, Math.max(1, Math.min(5, Math.round(rating))), text.trim().slice(0, 500), Date.now());
    syncFeedback(eid); emit();
  },
  watchNudges(cb) { return watch(() => nudges.map((n) => ({ ...n })), cb); },
  async sendNudge(from, to, text, eventId) {
    await delay(250);
    const recent = nudges.find((n) => n.to === to && n.status === 'sent' && Date.now() - (n.sentAt || n.at) < 7 * DAY);
    nudges = [{ id: newId('nu'), from, to, text: text.trim().slice(0, 300), eventId, at: Date.now(), status: recent ? 'skipped' : 'sent', sentAt: recent ? undefined : Date.now() }, ...nudges];
    emit();
  },
  watchCheckins(eid, cb) { return watch(() => [...(checkins.get(eid) || new Map<string, Checkin>()).values()].map((c) => ({ ...c })), cb); },
  async setCheckin(eid, uid, by, on) {
    const e = events.get(eid); if (!e) throw new Error('Eventet findes ikke');
    const t = Date.now();
    if (on && uid === by && (e.cancelled || !e.checkinFrom || !e.checkinUntil || t < e.checkinFrom || t > e.checkinUntil)) throw new Error('Check-in er lukket');
    const m = checkins.get(eid) || new Map<string, Checkin>(); checkins.set(eid, m);
    if (on) m.set(uid, { uid, at: t, by }); else m.delete(uid);
    await delay(150);
    const fresh = syncStats(uid, true);
    emit();
    if (uid !== ME || !fresh.length) return;
    const names = fresh.map((id) => BADGES.find((x) => x.id === id)?.name || id);
    if (fresh.length > 2) notifyMe({ type: 'badge', title: `${fresh.length} nye mærker`, body: `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}`, link: `/u/${ME}` });
    else fresh.forEach((id) => { const b = BADGES.find((x) => x.id === id); if (b) notifyMe({ type: 'badge', title: `Nyt mærke: ${b.name}`, body: b.desc, link: `/a/badge_${uid}_${id}` }); });
  },
  async deleteEvent(id) { events.delete(id); rsvps.delete(id); progress.delete(id); photos.delete(id); [...activities.values()].filter((a) => a.eventId === id && (a.kind === 'rsvp' || a.kind === 'event')).forEach((a) => activities.delete(a.id)); emit(); },
  watchEventPhotos(eid, cb) { makePhotos(); return watch(() => [...(photos.get(eid) || [])].sort((a, b) => b.at - a.at), cb); },
  async addEventPhoto(eid, uid, blob, host) {
    const { w, h } = await imageSize(blob);
    const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
    const list = photos.get(eid) || []; photos.set(eid, list);
    list.push({ id: newId('p'), uid, url, w, h, at: Date.now(), host });
    syncPhotos(eid); emit();
  },
  async deleteEventPhoto(eid, pid) { photos.set(eid, (photos.get(eid) || []).filter((p) => p.id !== pid)); syncPhotos(eid); emit(); },
  watchProgress(eid, cb) { return watch(() => [...(progress.get(eid) || new Map()).values()].map((p) => ({ ...p, counts: { ...p.counts } })), cb); },
  async setProgress(eid, uid, counts, done) {
    const m = progress.get(eid) || new Map<string, Progress>(); progress.set(eid, m);
    const was = m.get(uid)?.done;
    m.set(uid, { uid, counts: { ...counts }, done, updatedAt: Date.now() });
    const e = events.get(eid);
    if (done && !was && e) act(newId('a'), { uid, kind: 'goal', sport: e.sport, title: e.title, eventId: eid, reps: e.exercises.map((x) => ({ name: x.name, count: counts[x.id] || 0, unit: x.unit })), createdAt: Date.now() });
    emit();
  },

  watchFeed(cb) { return watch(() => sorted([...activities.values()].map((a) => ({ ...a }))), cb); },
  watchUserActivities(uid, cb) { return watch(() => sorted([...activities.values()].filter((a) => a.uid === uid).map((a) => ({ ...a }))), cb); },
  watchActivity(id, cb) { return watch(() => (activities.get(id) ? { ...activities.get(id)! } : null), cb); },
  async createActivity(uid, d: ActivityInput) { const id = newId('a'); act(id, { ...d, uid, createdAt: Date.now(), kudos: 0, comments: 0 }); emit(); return id; },
  async deleteActivity(id) { activities.delete(id); emit(); },
  watchMyKudos(uid, cb) { return watch(() => new Set([...kudos.entries()].filter(([, m]) => m.has(uid)).map(([aid]) => aid)), cb); },
  async setKudos(aid, uid, on) {
    const m = kudos.get(aid) || new Map<string, number>(); kudos.set(aid, m);
    if (on) m.set(uid, Date.now()); else m.delete(uid);
    const a = activities.get(aid); if (a) a.kudos = m.size; emit();
  },
  watchKudos(aid, cb) { return watch(() => [...(kudos.get(aid) || new Map()).entries()].sort((a, b) => a[1] - b[1]).map((x) => x[0]), cb); },
  watchComments(aid, cb) { return watch(() => [...(comments.get(aid) || [])].sort((a, b) => a.at - b.at), cb); },
  async addComment(aid, uid, text) {
    const list = comments.get(aid) || []; list.push({ id: newId('c'), uid, text, at: Date.now() }); comments.set(aid, list);
    const a = activities.get(aid); if (a) a.comments = list.length; emit();
  },
  async deleteComment(aid, cid) {
    const list = (comments.get(aid) || []).filter((c) => c.id !== cid); comments.set(aid, list);
    const a = activities.get(aid); if (a) a.comments = list.length; emit();
  },

  watchNotifications(uid, cb) { return watch(() => (uid === ME ? notices.map((n) => ({ ...n })) : []), cb); },
  async markRead(_uid, ids) { notices = notices.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)); emit(); },
  async pushState() { return push; },
  async enablePush() { await delay(400); push = 'granted'; emit(); return push; },
  onForegroundMessage(cb) { fgListeners.add(cb); return () => { fgListeners.delete(cb); }; },

  watchInstagram(cb) {
    let alive = true;
    const off = watch(() => instagram, (v) => { if (alive) cb(v); });
    if (!instagram) makeInstagram().then((f) => { instagram = f; emit(); });
    return () => { alive = false; off(); };
  },
  async saveInstagramToken() { await delay(); },

  watchTeamSettings(cb) { return watch(() => ({ weather: team.weather ? { ...team.weather } : null }), cb); },
  async saveTeamSettings(t) { await delay(150); team = { weather: t.weather }; emit(); },
  async searchPlaces(q) {
    await delay(120);
    const n = q.trim().toLowerCase();
    return n.length < 2 ? [] : TOWNS.filter((t) => t.name.toLowerCase().startsWith(n)).concat(TOWNS.filter((t) => !t.name.toLowerCase().startsWith(n) && t.name.toLowerCase().includes(n))).slice(0, 8);
  },
  async searchAddresses(q) {
    await delay(140);
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length || q.trim().length < 2) return [];
    return ADDRESSES.filter((a) => words.every((w) => fold(`${a.name} ${a.detail}`).includes(w))).slice(0, 6);
  },
  async getForecast(place) { return demoForecast(place); },
  async calendarLink(_uid, scope, reset) {
    await delay(150);
    if (!calKeys[scope] || reset) calKeys[scope] = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
    return `https://dit-projekt.web.app/cal/${calKeys[scope]}.ics`;
  },
};

