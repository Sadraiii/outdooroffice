import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

let env;
const TODAY = new Date().toISOString().slice(0, 10);
const NOTIFY = { activity: true, rsvp: true, follows: true, social: true, official: true, community: true };
const profile = (name, role = 'member') => ({
  name, nameLower: name.toLowerCase(), bio: '', instagram: '', photoURL: null, role, createdAt: 1, followers: 0, following: 0, notify: NOTIFY,
});
const event = (o = {}) => ({
  title: 'Søndagsløb', sport: 'lob', official: false, createdBy: 'sara', coachId: 'sara', date: TODAY, time: '09:00',
  place: 'Skoven', note: '', exercises: [], createdAt: 1, signups: {}, photoCount: 0, cover: null, feedbackCount: 0, feedbackSum: 0, ...o,
});
const workout = (o = {}) => ({ uid: 'sara', kind: 'workout', sport: 'calisthenics', createdAt: Date.now(), kudos: 0, comments: 0, ...o });
const dbs = new Map();
const as = (uid) => { if (!dbs.has(uid)) dbs.set(uid, env.authenticatedContext(uid).firestore()); return dbs.get(uid); };

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-outdoor-office',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin'), profile('Admin', 'admin'));
    await setDoc(doc(db, 'config/admin'), { uid: 'admin', at: 1 });
    await setDoc(doc(db, 'users/sara'), profile('Sara'));
    await setDoc(doc(db, 'users/jonas'), profile('Jonas'));
    await setDoc(doc(db, 'events/e1'), event({ createdBy: 'jonas', coachId: 'jonas' }));
    await setDoc(doc(db, 'activities/a1'), { uid: 'jonas', kind: 'workout', sport: 'lob', distanceKm: 8, createdAt: 1, kudos: 0, comments: 0 });
    await setDoc(doc(db, 'users/sara/notifications/n1'), { type: 'kudos', title: 'Hej', body: '', link: '/', at: 1, read: false });
    await setDoc(doc(db, 'pushlog/f_sara_jonas'), { at: 1 });
    await setDoc(doc(db, 'events/closed'), event({ createdBy: 'jonas', coachId: 'jonas', signupUntil: Date.now() - 3600e3, photoPolicy: 'host' }));
    await setDoc(doc(db, 'events/e1/photos/p1'), { uid: 'sara', url: 'https://example.com/p1.jpg', w: 1200, h: 800, at: 1, host: false });
    const open = { checkinFrom: Date.now() - 3600e3, checkinUntil: Date.now() + 3600e3 };
    await setDoc(doc(db, 'events/live'), event({ createdBy: 'jonas', coachId: 'jonas', ...open }));
    await setDoc(doc(db, 'events/off'), event({ createdBy: 'jonas', coachId: 'jonas', cancelled: true, cancelNote: 'Storm', ...open }));
    await setDoc(doc(db, 'events/co'), event({ createdBy: 'jonas', coachId: 'jonas', cohosts: ['sara'] }));
    await setDoc(doc(db, 'events/co/feedback/admin'), { uid: 'admin', rating: 4, text: 'Fedt', at: 1 });
    await setDoc(doc(db, 'events/co'), event({ createdBy: 'jonas', coachId: 'jonas', cohosts: ['sara'], feedbackCount: 1, feedbackSum: 4 }));
  });
});

test('logged-out visitors cannot read anything', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'events/e1')));
});

test('anyone logged in can create a COMMUNITY MADE EVENT', async () => {
  await assertSucceeds(setDoc(doc(as('sara'), 'events/x'), event()));
});

test('members cannot create an OFFICIAL EVENT, admins can', async () => {
  await assertFails(setDoc(doc(as('sara'), 'events/x'), event({ official: true })));
  await assertSucceeds(setDoc(doc(as('admin'), 'events/y'), event({ official: true, createdBy: 'admin', coachId: 'admin' })));
});

test('members can only name themselves as organiser', async () => {
  await assertFails(setDoc(doc(as('sara'), 'events/x'), event({ coachId: 'admin' })));
  await assertSucceeds(setDoc(doc(as('admin'), 'events/y'), event({ createdBy: 'admin', coachId: 'jonas' })));
  await assertFails(updateDoc(doc(as('jonas'), 'events/e1'), { coachId: 'sara' }));
});

test('a member cannot turn their own event official', async () => {
  await assertFails(updateDoc(doc(as('jonas'), 'events/e1'), { official: true }));
  await assertSucceeds(updateDoc(doc(as('jonas'), 'events/e1'), { title: 'Søndagsløb 10 km' }));
});

test('only the creator or an admin can edit or delete an event', async () => {
  await assertFails(updateDoc(doc(as('sara'), 'events/e1'), { title: 'Hacket' }));
  await assertFails(deleteDoc(doc(as('sara'), 'events/e1')));
  await assertSucceeds(updateDoc(doc(as('admin'), 'events/e1'), { official: true }));
});

test('event programs are checked exercise by exercise', async () => {
  const ok = { id: 'x1', name: 'Push-ups', target: 200, unit: 'reps' };
  await assertSucceeds(setDoc(doc(as('sara'), 'events/p1'), event({ exercises: [ok, { ...ok, id: 'x2', name: 'Planke', unit: 'sek' }] })));
  await assertFails(setDoc(doc(as('sara'), 'events/p2'), event({ exercises: [ok, null] })));
  await assertFails(setDoc(doc(as('sara'), 'events/p3'), event({ exercises: [{ ...ok, name: { x: 1 } }] })));
  await assertFails(setDoc(doc(as('sara'), 'events/p4'), event({ exercises: [{ ...ok, target: 0 }] })));
  await assertFails(setDoc(doc(as('sara'), 'events/p5'), event({ exercises: [{ ...ok, unit: 'kg' }] })));
});

test('event dates must be within a few years', async () => {
  await assertFails(setDoc(doc(as('sara'), 'events/d1'), event({ date: '9999-12-31' })));
  await assertFails(setDoc(doc(as('sara'), 'events/d2'), event({ date: '2001-01-01' })));
});

test('following works only as yourself and with the matching id', async () => {
  await assertSucceeds(setDoc(doc(as('sara'), 'follows/sara_jonas'), { followerId: 'sara', followeeId: 'jonas', createdAt: 1 }));
  await assertFails(setDoc(doc(as('sara'), 'follows/jonas_sara'), { followerId: 'jonas', followeeId: 'sara', createdAt: 1 }));
  await assertFails(setDoc(doc(as('sara'), 'follows/sara_sara'), { followerId: 'sara', followeeId: 'sara', createdAt: 1 }));
});

test('workouts are shared as yourself; there are no free-text posts', async () => {
  await assertSucceeds(setDoc(doc(as('sara'), 'activities/b1'), workout({ sport: 'lob', distanceKm: 5 })));
  await assertFails(setDoc(doc(as('sara'), 'activities/b2'), workout({ uid: 'jonas' })));
  await assertFails(setDoc(doc(as('sara'), 'activities/b3'), { uid: 'sara', kind: 'post', text: 'Hej', official: true, createdAt: Date.now(), kudos: 0, comments: 0 }));
  await assertFails(setDoc(doc(as('admin'), 'activities/b4'), { uid: 'admin', kind: 'post', text: 'Hej', official: true, createdAt: Date.now(), kudos: 0, comments: 0 }));
  await assertFails(setDoc(doc(as('sara'), 'activities/b5'), workout({ kind: 'goal' })));
});

test('rep lines are checked one by one', async () => {
  await assertSucceeds(setDoc(doc(as('sara'), 'activities/r1'), workout({ reps: [{ name: 'Push-ups', count: 200 }, { name: 'Dips', count: 90 }] })));
  await assertFails(setDoc(doc(as('sara'), 'activities/r6'), workout({ reps: [{ name: 'Planke', count: 90, unit: { x: 1 } }] })));
  await assertFails(setDoc(doc(as('sara'), 'activities/r2'), workout({ reps: [null] })));
  await assertFails(setDoc(doc(as('sara'), 'activities/r3'), workout({ reps: [{ name: { a: 1 }, count: 1 }] })));
  await assertFails(setDoc(doc(as('sara'), 'activities/r4'), workout({ reps: [{ name: 'x'.repeat(5000), count: 1 }] })));
  await assertFails(setDoc(doc(as('sara'), 'activities/r5'), workout({ reps: [{ name: 'Dips', count: '9' }] })));
});

test('comments: write as yourself on trainings that exist, the training owner can remove them', async () => {
  await assertSucceeds(setDoc(doc(as('sara'), 'activities/a1/comments/c1'), { uid: 'sara', text: 'Flot!', at: 1 }));
  await assertFails(setDoc(doc(as('sara'), 'activities/a1/comments/c2'), { uid: 'jonas', text: 'Falsk', at: 1 }));
  await assertFails(setDoc(doc(as('sara'), 'activities/nope/comments/c3'), { uid: 'sara', text: 'Hej', at: 1 }));
  await assertSucceeds(deleteDoc(doc(as('jonas'), 'activities/a1/comments/c1')));
});

test('push tokens are private', async () => {
  await assertSucceeds(setDoc(doc(as('sara'), 'users/sara/tokens/t1'), { token: 'tok', at: Date.now(), ua: 'Safari' }));
  await assertFails(getDoc(doc(as('jonas'), 'users/sara/tokens/t1')));
  await assertFails(setDoc(doc(as('sara'), 'users/sara/tokens/t2'), { token: 'tok', at: Date.now(), ua: 'x'.repeat(5000) }));
});

test('the push log is server-only', async () => {
  await assertFails(getDoc(doc(as('sara'), 'pushlog/f_sara_jonas')));
  await assertFails(setDoc(doc(as('sara'), 'pushlog/f_sara_jonas'), { at: 0 }));
});

const exercises = (n) => Array.from({ length: n }, (_, i) => ({ id: `x${i}`, name: `Øvelse nummer ${i + 1}`, target: 100, unit: 'reps' }));
const reps = (n) => Array.from({ length: n }, (_, i) => ({ name: `Øvelse nummer ${i + 1}`, count: 99 }));

test('an admin can create an official weekly copy with a full 8-exercise program', async () => {
  await assertSucceeds(setDoc(doc(as('admin'), 'events/cap1'), event({
    official: true, createdBy: 'admin', coachId: 'jonas', exercises: exercises(8), seriesId: 's_abc123', seriesIndex: 3, note: 'x'.repeat(500),
  })));
  await assertFails(setDoc(doc(as('admin'), 'events/cap2'), event({ official: true, createdBy: 'admin', coachId: 'admin', exercises: exercises(9) })));
});

test('a workout with 10 rep lines and every optional field fits', async () => {
  await assertSucceeds(setDoc(doc(as('sara'), 'activities/cap3'), workout({
    title: 'Calisthenics i parken', text: 'x'.repeat(1000), photoURL: 'https://firebasestorage.googleapis.com/v0/b/b/o/x.jpg',
    eventId: 'e1', durationSec: 3600, reps: reps(10),
  })));
  await assertFails(setDoc(doc(as('sara'), 'activities/cap4'), workout({ reps: reps(11) })));
});

test('progress for a full program fits, more counters than exercises do not', async () => {
  const counts = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`x${i}`, 120]));
  await assertSucceeds(setDoc(doc(as('sara'), 'events/e1/progress/sara'), { uid: 'sara', counts: counts(8), done: true, updatedAt: 1 }));
  await assertFails(setDoc(doc(as('sara'), 'events/e1/progress/sara'), { uid: 'sara', counts: counts(9), done: true, updatedAt: 1 }));
});

const photo = (o = {}) => ({ uid: 'sara', url: 'data:image/jpeg;base64,' + 'A'.repeat(200000), w: 1200, h: 800, at: Date.now(), host: false, ...o });

test('limits on events are checked: participants, deadline, who adds photos', async () => {
  await assertSucceeds(setDoc(doc(as('sara'), 'events/l1'), event({ capacity: 30, signupUntil: Date.now() + 864e5, photoPolicy: 'host' })));
  await assertSucceeds(setDoc(doc(as('sara'), 'events/l2'), event({ capacity: null, signupUntil: null, photoPolicy: 'all' })));
  await assertFails(setDoc(doc(as('sara'), 'events/l3'), event({ capacity: 0 })));
  await assertFails(setDoc(doc(as('sara'), 'events/l4'), event({ capacity: 'mange' })));
  await assertFails(setDoc(doc(as('sara'), 'events/l5'), event({ photoPolicy: 'nogle' })));
});

test('event photos: the uploader, the organiser and admins can remove them', async () => {
  await assertFails(deleteDoc(doc(as('ny'), 'events/e1/photos/p1')));
  await assertSucceeds(deleteDoc(doc(as('jonas'), 'events/e1/photos/p1')));
});

test('a town for the weather is a name and coordinates', async () => {
  await assertSucceeds(setDoc(doc(as('sara'), 'events/g1'), event({ geo: { name: 'Roskilde', lat: 55.64, lon: 12.08 } })));
  await assertFails(setDoc(doc(as('sara'), 'events/g2'), event({ geo: { name: 'Roskilde', lat: '55' } })));
});

test('calendar links: your own, secret and long', async () => {
  const key = 'k'.repeat(43);
  await assertSucceeds(setDoc(doc(as('sara'), `calendarTokens/${key}`), { uid: 'sara', scope: 'mine', createdAt: 1 }));
  await assertFails(getDoc(doc(as('sara'), `calendarTokens/${key}`)));
  await assertFails(setDoc(doc(as('sara'), `calendarTokens/${'j'.repeat(43)}`), { uid: 'jonas', scope: 'mine', createdAt: 1 }));
  await assertFails(setDoc(doc(as('sara'), 'calendarTokens/short'), { uid: 'sara', scope: 'mine', createdAt: 1 }));
  await assertFails(deleteDoc(doc(as('jonas'), `calendarTokens/${key}`)));
  await assertSucceeds(deleteDoc(doc(as('sara'), `calendarTokens/${key}`)));
  await assertSucceeds(setDoc(doc(as('sara'), 'users/sara/private/calendar'), { mine: key }));
  await assertFails(getDoc(doc(as('jonas'), 'users/sara/private/calendar')));
});

test('team settings: everyone reads, admins write', async () => {
  const weather = { name: 'København', lat: 55.68, lon: 12.57 };
  await assertFails(setDoc(doc(as('sara'), 'settings/team'), { weather }));
  await assertSucceeds(setDoc(doc(as('admin'), 'settings/team'), { weather, updatedAt: 1 }));
  await assertSucceeds(getDoc(doc(as('sara'), 'settings/team')));
  await assertFails(setDoc(doc(as('admin'), 'settings/team'), { weather: { name: 'X' } }));
});

test('signing up: only yourself, stamped by the server, while sign-up is open', async () => {
  await assertSucceeds(updateDoc(doc(as('sara'), 'events/e1'), { 'signups.sara': serverTimestamp() }));
  await assertFails(updateDoc(doc(as('sara'), 'events/e1'), { 'signups.jonas': serverTimestamp() }));
  await assertFails(updateDoc(doc(as('jonas'), 'events/e1'), { 'signups.jonas': 1 }));
  await assertFails(updateDoc(doc(as('sara'), 'events/closed'), { 'signups.sara': serverTimestamp() }));
  await assertFails(updateDoc(doc(as('sara'), 'events/off'), { 'signups.sara': serverTimestamp() }));
  await assertFails(updateDoc(doc(as('sara'), 'events/e1'), { 'signups.sara': serverTimestamp(), title: 'Hacket' }));
  await assertSucceeds(updateDoc(doc(as('sara'), 'events/e1'), { 'signups.sara': deleteField() }));
});

test('signing off is always possible, also after the deadline', async () => {
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'events/closed'), { 'signups.sara': new Date() }));
  await assertSucceeds(updateDoc(doc(as('sara'), 'events/closed'), { 'signups.sara': deleteField() }));
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'events/closed'), { 'signups.jonas': new Date() }));
  await assertFails(updateDoc(doc(as('sara'), 'events/closed'), { 'signups.jonas': deleteField() }));
});

test('new events start empty, and the organiser cannot touch the sign-ups', async () => {
  await assertFails(setDoc(doc(as('sara'), 'events/w1'), event({ signups: { jonas: 1 } })));
  await assertFails(setDoc(doc(as('sara'), 'events/w2'), event({ photoCount: 3 })));
  await assertFails(setDoc(doc(as('sara'), 'events/w3'), event({ feedbackCount: 1, feedbackSum: 5 })));
  await assertFails(setDoc(doc(as('sara'), 'events/w4'), event({ going: ['sara'] })));
  await assertFails(updateDoc(doc(as('jonas'), 'events/e1'), { signups: {} , updatedBy: 'jonas' }));
  await assertSucceeds(updateDoc(doc(as('jonas'), 'events/e1'), { capacity: 20, signupUntil: null }));
  await assertSucceeds(updateDoc(doc(as('jonas'), 'events/e1'), { checkinFrom: 1, checkinUntil: 2, updatedBy: 'jonas' }));
  await assertFails(updateDoc(doc(as('sara'), 'events/e1'), { checkinFrom: 0, checkinUntil: 9e12 }));
});

test('a cancelled event takes no sign-ups, and every edit says who made it', async () => {
  await assertSucceeds(updateDoc(doc(as('jonas'), 'events/e1'), { cancelled: true, cancelNote: 'Storm', updatedBy: 'jonas' }));
  await assertFails(updateDoc(doc(as('jonas'), 'events/e1'), { title: 'Ny titel', updatedBy: 'sara' }));
  await assertFails(updateDoc(doc(as('jonas'), 'events/e1'), { cancelNote: 'x'.repeat(201), updatedBy: 'jonas' }));
  await assertFails(setDoc(doc(as('sara'), 'events/c1'), event({ cancelled: true })));
});

test('the first profile becomes admin, everyone after that is a member', async () => {
  await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'config/admin')));
  const first = writeBatch(as('ny'));
  first.set(doc(as('ny'), 'config/admin'), { uid: 'ny', at: 1 });
  first.set(doc(as('ny'), 'users/ny'), profile('Ny', 'admin'));
  await assertSucceeds(first.commit());
  const second = writeBatch(as('to'));
  second.set(doc(as('to'), 'config/admin'), { uid: 'to', at: 1 });
  second.set(doc(as('to'), 'users/to'), profile('To', 'admin'));
  await assertFails(second.commit());
  await assertFails(setDoc(doc(as('to'), 'users/to'), profile('To', 'admin')));
  await assertSucceeds(setDoc(doc(as('to'), 'users/to'), profile('To')));
});

test('profiles: nobody makes themselves admin or changes others', async () => {
  await assertFails(updateDoc(doc(as('sara'), 'users/sara'), { role: 'admin' }));
  await assertFails(updateDoc(doc(as('sara'), 'users/sara'), { followers: 500 }));
  await assertFails(updateDoc(doc(as('sara'), 'users/jonas'), { name: 'Hacket', nameLower: 'hacket' }));
  await assertFails(updateDoc(doc(as('sara'), 'users/sara'), { notify: { ...NOTIFY, activity: 'x'.repeat(5000) } }));
  await assertSucceeds(updateDoc(doc(as('sara'), 'users/sara'), { notify: { ...NOTIFY, activity: false } }));
  await assertSucceeds(updateDoc(doc(as('sara'), 'users/sara'), { photoURL: 'data:image/jpeg;base64,' + 'A'.repeat(50000) }));
  await assertFails(updateDoc(doc(as('sara'), 'users/sara'), { photoURL: 'data:image/jpeg;base64,' + 'A'.repeat(80000) }));
  await assertSucceeds(updateDoc(doc(as('admin'), 'users/sara'), { role: 'admin' }));
});

test('follower counts move only together with the follow itself', async () => {
  const b = writeBatch(as('sara'));
  b.set(doc(as('sara'), 'follows/sara_jonas'), { followerId: 'sara', followeeId: 'jonas', createdAt: 1 });
  b.update(doc(as('sara'), 'users/jonas'), { followers: increment(1) });
  b.update(doc(as('sara'), 'users/sara'), { following: increment(1) });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(as('sara'), 'users/jonas'), { followers: increment(1) }));
  await assertFails(updateDoc(doc(as('sara'), 'users/sara'), { following: increment(5) }));
  const off = writeBatch(as('sara'));
  off.delete(doc(as('sara'), 'follows/sara_jonas'));
  off.update(doc(as('sara'), 'users/jonas'), { followers: increment(-1) });
  off.update(doc(as('sara'), 'users/sara'), { following: increment(-1) });
  await assertSucceeds(off.commit());
});

test('your own trainings and badges: written by you, badges never taken away', async () => {
  await assertSucceeds(updateDoc(doc(as('sara'), 'users/sara'), { stats: { trainings: 10 }, badges: { t10: 1 } }));
  await assertFails(updateDoc(doc(as('sara'), 'users/sara'), { stats: { trainings: 10 }, badges: {} }));
  await assertFails(updateDoc(doc(as('jonas'), 'users/sara'), { stats: { trainings: 999 }, badges: { t10: 1 } }));
  await assertSucceeds(setDoc(doc(as('sara'), 'activities/badge_sara_t10'), { uid: 'sara', kind: 'badge', badge: 't10', createdAt: Date.now(), kudos: 0, comments: 0 }));
  await assertFails(setDoc(doc(as('sara'), 'activities/badge_sara_t100'), { uid: 'sara', kind: 'badge', badge: 't100', createdAt: Date.now(), kudos: 0, comments: 0 }));
});

test('feed entries with fixed ids must be true', async () => {
  const entry = (o) => ({ uid: 'sara', createdAt: Date.now(), kudos: 0, comments: 0, ...o });
  await assertFails(setDoc(doc(as('sara'), 'activities/rsvp_e1_sara'), entry({ kind: 'rsvp', eventId: 'e1' })));
  await updateDoc(doc(as('sara'), 'events/e1'), { 'signups.sara': serverTimestamp() });
  await assertSucceeds(setDoc(doc(as('sara'), 'activities/rsvp_e1_sara'), entry({ kind: 'rsvp', eventId: 'e1' })));
  await assertFails(setDoc(doc(as('sara'), 'activities/rsvp_e1_sara'), entry({ kind: 'rsvp', eventId: 'e1' })));
  await assertFails(setDoc(doc(as('sara'), 'activities/event_e1'), entry({ kind: 'event', eventId: 'e1' })));
  await assertSucceeds(setDoc(doc(as('jonas'), 'activities/event_e1'), entry({ uid: 'jonas', kind: 'event', eventId: 'e1' })));
  await assertSucceeds(setDoc(doc(as('sara'), 'activities/goal_e1_sara'), entry({ kind: 'goal', eventId: 'e1', title: 'Søndagsløb', reps: [{ name: 'Løb', count: 8 }] })));
  await assertFails(setDoc(doc(as('sara'), 'activities/goal_e1_jonas'), entry({ kind: 'goal', eventId: 'e1' })));
  await assertFails(setDoc(doc(as('sara'), 'activities/t1'), workout({ createdAt: Date.now() + 2 * 3600e3 })));
  await assertSucceeds(deleteDoc(doc(as('jonas'), 'activities/rsvp_e1_sara')));
});

test('high fives: not on your own training, and the count follows your own high five', async () => {
  const b = writeBatch(as('sara'));
  b.set(doc(as('sara'), 'activities/a1/kudos/sara'), { uid: 'sara', at: 1 });
  b.update(doc(as('sara'), 'activities/a1'), { kudos: increment(1) });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(as('sara'), 'activities/a1'), { kudos: increment(1) }));
  await assertFails(setDoc(doc(as('jonas'), 'activities/a1/kudos/jonas'), { uid: 'jonas', at: 1 }));
  await assertFails(updateDoc(doc(as('jonas'), 'activities/a1'), { kudos: 99 }));
  const off = writeBatch(as('sara'));
  off.delete(doc(as('sara'), 'activities/a1/kudos/sara'));
  off.update(doc(as('sara'), 'activities/a1'), { kudos: increment(-1) });
  await assertSucceeds(off.commit());
});

test('comment counts move one at a time', async () => {
  await assertSucceeds(updateDoc(doc(as('sara'), 'activities/a1'), { comments: increment(1) }));
  await assertFails(updateDoc(doc(as('sara'), 'activities/a1'), { comments: increment(5) }));
  await assertFails(updateDoc(doc(as('sara'), 'activities/a1'), { comments: increment(1), kudos: increment(1) }));
});

test('inbox: messages always in your own name; only the owner reads them', async () => {
  const note = (o = {}) => ({ type: 'kudos', actorId: 'jonas', title: 'Jonas gav dig high five', body: 'For din træning', link: '/a/a1', at: Date.now(), read: false, ...o });
  await assertSucceeds(setDoc(doc(as('jonas'), 'users/sara/notifications/k_jonas_a1'), note()));
  await assertFails(setDoc(doc(as('jonas'), 'users/sara/notifications/k_jonas_a1'), note()));
  await assertFails(setDoc(doc(as('jonas'), 'users/sara/notifications/x'), note({ actorId: 'admin' })));
  await assertFails(setDoc(doc(as('jonas'), 'users/sara/notifications/y'), note({ link: 'https://evil.example' })));
  await assertFails(setDoc(doc(as('jonas'), 'users/sara/notifications/z'), note({ read: true })));
  await assertSucceeds(setDoc(doc(as('jonas'), 'users/sara/notifications/p1'), note({ push: true })));
  await assertFails(setDoc(doc(as('jonas'), 'users/sara/notifications/p2'), note({ push: 'yes' })));
  await assertFails(getDoc(doc(as('jonas'), 'users/sara/notifications/n1')));
  await assertSucceeds(updateDoc(doc(as('sara'), 'users/sara/notifications/n1'), { read: true }));
});

test('photos: the count follows them; only the organisers set the cover', async () => {
  await assertSucceeds(setDoc(doc(as('sara'), 'events/e1/photos/a'), photo()));
  await assertFails(setDoc(doc(as('sara'), 'events/e1/photos/b'), photo({ host: true })));
  await assertSucceeds(setDoc(doc(as('jonas'), 'events/e1/photos/c'), photo({ uid: 'jonas', host: true })));
  await assertFails(setDoc(doc(as('sara'), 'events/e1/photos/d'), photo({ uid: 'jonas' })));
  await assertFails(setDoc(doc(as('sara'), 'events/closed/photos/e'), photo()));
  await assertFails(setDoc(doc(as('sara'), 'events/e1/photos/h'), photo({ at: Date.now() + 2 * 3600e3 })));
  await assertFails(setDoc(doc(as('sara'), 'events/e1/photos/i'), photo({ url: 'data:' + 'A'.repeat(700000) })));
  await assertSucceeds(updateDoc(doc(as('sara'), 'events/e1'), { photoCount: increment(1) }));
  await assertFails(updateDoc(doc(as('sara'), 'events/e1'), { photoCount: increment(3) }));
  await assertFails(updateDoc(doc(as('sara'), 'events/e1'), { cover: 'data:image/jpeg;base64,AAAA' }));
  await assertSucceeds(updateDoc(doc(as('jonas'), 'events/e1'), { photoCount: increment(1), cover: 'data:image/jpeg;base64,AAAA' }));
});

test('check-in: yourself while the event is on, the organiser any time, with the event date', async () => {
  const me = (uid, by = uid, o = {}) => ({ uid, at: Date.now(), by, date: TODAY, time: '09:00', sport: 'lob', ...o });
  await assertSucceeds(setDoc(doc(as('sara'), 'events/live/checkins/sara'), me('sara')));
  await assertFails(setDoc(doc(as('sara'), 'events/live/checkins/sara'), me('sara', 'sara', { date: '2020-01-01' })));
  await assertFails(setDoc(doc(as('sara'), 'events/e1/checkins/sara'), me('sara')));
  await assertFails(setDoc(doc(as('sara'), 'events/off/checkins/sara'), me('sara')));
  await assertFails(setDoc(doc(as('sara'), 'events/live/checkins/admin'), me('admin', 'sara')));
  await assertSucceeds(setDoc(doc(as('jonas'), 'events/e1/checkins/sara'), me('sara', 'jonas')));
  await assertSucceeds(deleteDoc(doc(as('sara'), 'events/live/checkins/sara')));
});

test('co-organisers edit and check people in; only the organiser picks them', async () => {
  await assertSucceeds(updateDoc(doc(as('sara'), 'events/co'), { place: 'Stranden', updatedBy: 'sara' }));
  await assertFails(updateDoc(doc(as('sara'), 'events/co'), { cohosts: ['sara', 'admin'], updatedBy: 'sara' }));
  await assertSucceeds(updateDoc(doc(as('jonas'), 'events/co'), { cohosts: ['sara', 'admin'], updatedBy: 'jonas' }));
  await assertSucceeds(setDoc(doc(as('sara'), 'events/co/checkins/admin'), { uid: 'admin', at: Date.now(), by: 'sara', date: TODAY, time: '09:00', sport: 'lob' }));
  await assertFails(deleteDoc(doc(as('sara'), 'events/co')));
});

test('feedback: your own rating, saved together with an average that adds up', async () => {
  const fb = (o = {}) => ({ uid: 'sara', rating: 5, text: 'Super', at: Date.now(), ...o });
  const answer = (rating, count, sum) => {
    const b = writeBatch(as('sara'));
    b.set(doc(as('sara'), 'events/co/feedback/sara'), fb({ rating }));
    b.update(doc(as('sara'), 'events/co'), { feedbackCount: increment(count), feedbackSum: increment(sum) });
    return b.commit();
  };
  await assertFails(setDoc(doc(as('sara'), 'events/co/feedback/sara'), fb()));
  await assertFails(answer(5, 1, 50));
  await assertSucceeds(answer(5, 1, 5));
  await assertSucceeds(answer(3, 0, -2));
  await assertFails(answer(4, 1, 1));
  await assertFails(setDoc(doc(as('sara'), 'events/co/feedback/jonas'), fb({ uid: 'jonas' })));
  await assertSucceeds(getDoc(doc(as('jonas'), 'events/co/feedback/admin')));
  await assertFails(getDoc(doc(as('ny'), 'events/co/feedback/admin')));
  await assertFails(updateDoc(doc(as('jonas'), 'events/co'), { feedbackCount: 99, feedbackSum: 495 }));
});

test('"Vi savner dig" comes from coaches only', async () => {
  const n = (o = {}) => ({ from: 'admin', to: 'sara', text: 'Vi savner dig!', at: Date.now(), status: 'sent', sentAt: Date.now(), ...o });
  await assertSucceeds(setDoc(doc(as('admin'), 'nudges/n1'), n({ eventId: 'e1' })));
  const { sentAt, ...skipped } = n({ status: 'skipped' });
  await assertSucceeds(setDoc(doc(as('admin'), 'nudges/n5'), skipped));
  await assertFails(setDoc(doc(as('sara'), 'nudges/n2'), n({ from: 'sara', to: 'jonas' })));
  await assertFails(setDoc(doc(as('admin'), 'nudges/n3'), n({ from: 'jonas' })));
  await assertFails(setDoc(doc(as('admin'), 'nudges/n4'), n({ text: 'x'.repeat(301) })));
  await assertFails(getDoc(doc(as('sara'), 'nudges/n1')));
});

test('Instagram: the key and the posts are for admins to write', async () => {
  await assertFails(setDoc(doc(as('sara'), 'config/instagram'), { token: 'abc', savedAt: 1 }));
  await assertSucceeds(setDoc(doc(as('admin'), 'config/instagram'), { token: 'abc', savedAt: 1 }));
  await assertFails(getDoc(doc(as('sara'), 'config/instagram')));
  await assertSucceeds(setDoc(doc(as('admin'), 'instagram/feed'), { username: 'holdet', posts: [], updatedAt: 1 }));
  await assertFails(setDoc(doc(as('sara'), 'instagram/feed'), { username: 'holdet', posts: [], updatedAt: 1 }));
});
