import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Activity, Nudge } from '../api/types';
import { DEMO } from '../api';
import { useApp, useSub } from '../state';
import { bySort, isPast } from '../lib/dates';
import { fmt, fmt1 } from '../lib/format';
import { ActivityCard } from '../components/ActivityCard';
import { Boundary } from '../components/Boundary';
import { EventSlot } from '../components/EventCards';
import { Attendance, StreakChip } from '../components/Attendance';
import { Avatar, FollowButton, Skeleton } from '../components/bits';
import { Icon } from '../components/Icon';
import { greetedLately, lastNudge, missedMembers } from './MissYou';

export function ProfilePage() {
  const { id = '' } = useParams();
  const { api, me, users, events, isAdmin, openSheet } = useApp();
  const uid = id === 'me' && me ? me.id : id;
  const u = users.get(uid);
  const acts = useSub<Activity[] | null>((cb) => api.watchUserActivities(uid, cb), [api, uid], null);
  const [tab, setTab] = useState<'act' | 'events'>('act');
  const isMe = me?.id === uid;

  const month = useMemo(() => {
    const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    let km = 0, reps = 0, n = 0;
    (acts || []).filter((a) => a.createdAt >= start && (a.kind === 'workout' || a.kind === 'goal')).forEach((a) => {
      n++; km += a.distanceKm || 0;
      reps += (a.reps || []).filter((r) => !r.unit || r.unit === 'reps').reduce((s, r) => s + r.count, 0);
    });
    return { km, reps, n };
  }, [acts]);
  const signups = useMemo(() => events.filter((e) => e.going.includes(uid) && !isPast(e)).sort(bySort), [events, uid]);
  const monthName = new Date().toLocaleDateString('da-DK', { month: 'long' });

  if (!u) return users.size ? <section className="empty" style={{ marginTop: 20 }}><h2 className="h2">Personen findes ikke</h2></section> : <Skeleton />;

  return (
    <>
      <section className="pf-head">
        <Avatar uid={uid} size="xl" />
        <div>
          <p className="eyebrow">{u.role === 'admin' ? 'Outdoor Office' : 'Medlem'}<StreakChip u={u} /></p>
          <h1 className="h1">{u.name}</h1>
          {u.instagram && (
            <a className="ig-btn" href={`https://www.instagram.com/${u.instagram}/`} target="_blank" rel="noopener noreferrer"><Icon name="insta" />@{u.instagram}</a>
          )}
        </div>
      </section>
      {u.bio && <p className="pf-bio">{u.bio}</p>}
      <div className="counts">
        <div><b>{fmt(u.followers)}</b><span>Følgere</span></div>
        <div><b>{fmt(u.following)}</b><span>Følger</span></div>
        <div><b>{fmt(Object.keys(u.badges || {}).length)}</b><span>Mærker</span></div>
      </div>
      <div className="pf-actions">
        {isMe ? (
          <>
            <button className="btn btn-outline btn-sm" onClick={() => openSheet({ type: 'profile' })}><Icon name="edit" />Rediger profil</button>
            <button className="btn btn-primary btn-sm" onClick={() => openSheet({ type: 'workout' })}><Icon name="plus" />Del med community</button>
          </>
        ) : <FollowButton uid={uid} />}
      </div>
      <div className="sec-head"><h2 className="h2">I {monthName}</h2></div>
      <div className="tiles" style={{ marginTop: 0 }}>
        <div className="tile"><b>{fmt(month.n)}</b><span>Aktiviteter</span></div>
        <div className="tile"><b>{fmt1(month.km)}</b><span>Km</span></div>
        <div className="tile"><b>{fmt(month.reps)}</b><span>Reps</span></div>
      </div>
      <Attendance u={u} isMe={isMe} />
      <div className="seg" role="tablist" style={{ marginTop: 22 }}>
        <button role="tab" aria-selected={tab === 'act'} onClick={() => setTab('act')}>Aktivitet</button>
        <button role="tab" aria-selected={tab === 'events'} onClick={() => setTab('events')}>Tilmeldinger <span className="seg-n">{signups.length}</span></button>
      </div>
      {tab === 'act' ? (
        !acts ? <Skeleton /> : acts.length ? <ol className="feed">{acts.map((a) => <Boundary key={a.id}><ActivityCard a={a} /></Boundary>)}</ol>
          : <p className="muted">Ingen aktivitet</p>
      ) : signups.length ? <ol className="slots">{signups.map((e) => <li key={e.id}><EventSlot ev={e} /></li>)}</ol>
        : <p className="muted">Ingen tilmeldinger</p>}
      {isMe && <MyMenu isAdmin={isAdmin} />}
    </>
  );
}

function MyMenu({ isAdmin }: { isAdmin: boolean }) {
  const { api, me, users, openSheet } = useApp();
  const [confirm, setConfirm] = useState(false);
  const coach = isAdmin || DEMO;
  const nudges = useSub<Nudge[] | null>(coach ? (cb) => api.watchNudges(cb) : null, [api, coach], null);
  const missing = useMemo(() => (coach ? missedMembers(users, me?.id).filter((m) => !greetedLately(lastNudge(nudges, m.u.id))).length : 0), [coach, users, me?.id, nudges]);
  return (
    <ul className="menu">
      {coach && <li><Link to="/savner"><Icon name="heart" />Vi savner dig{missing > 0 && <span className="menu-n" aria-label={`${missing} at hilse på`}>{missing}</span>}<Icon name="chev" className="chev" /></Link></li>}
      <li><Link to="/notifikationer"><Icon name="bell" />Notifikationer<Icon name="chev" className="chev" /></Link></li>
      {api.features.calendarFeed && <li><button onClick={() => openSheet({ type: 'calendar' })}><Icon name="calplus" />Kalender<Icon name="chev" className="chev" /></button></li>}
      <li><button onClick={() => openSheet({ type: 'appearance' })}><Icon name="palette" />Udseende<Icon name="chev" className="chev" /></button></li>
      {isAdmin && <li><Link to="/admin"><Icon name="shield" />Admin<Icon name="chev" className="chev" /></Link></li>}
      <li><button className={confirm ? 'danger' : ''} onClick={() => (confirm ? api.signOut() : setConfirm(true))}><Icon name="logout" />{confirm ? 'Log ud?' : 'Log ud'}</button></li>
    </ul>
  );
}
