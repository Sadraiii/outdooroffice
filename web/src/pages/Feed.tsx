import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Activity } from '../api/types';
import { useApp, useSub } from '../state';
import { bySort, isPast, todayStr } from '../lib/dates';
import { countsAsTraining, windowOf } from '../lib/checkin';
import { currentStreak, weekIndex } from '../lib/stats';
import { addDays } from '../lib/time';
import { ActivityCard } from '../components/ActivityCard';
import { Boundary } from '../components/Boundary';
import { EventChip, EventHero } from '../components/EventCards';
import { InstagramStrip } from '../components/InstagramStrip';
import { PushCard } from '../components/PushCard';
import { Avatar, FollowButton, Skeleton, UserLink } from '../components/bits';
import { Icon } from '../components/Icon';

export function FeedPage() {
  const { api, me, following, followingReady, events, myRsvps, users } = useApp();
  const feed = useSub<Activity[] | null>((cb) => api.watchFeed(cb), [api], null);
  const [tab, setTab] = useState<'follow' | 'all' | null>(null);
  useEffect(() => { if (tab === null && feed && followingReady) setTab(following.size ? 'follow' : 'all'); }, [tab, feed, following, followingReady]);

  const upcoming = useMemo(() => events.filter((e) => !isPast(e)).sort(bySort), [events]);
  const mine = upcoming.find((e) => myRsvps.has(e.id));
  const next = mine || upcoming[0];

  const list = (feed || []).filter((a) => (tab === 'all' ? true : following.has(a.uid) || a.uid === me?.id || a.official));
  const suggestions = [...users.values()].filter((u) => u.id !== me?.id && !following.has(u.id)).sort((a, b) => b.followers - a.followers).slice(0, 4);

  return (
    <>
      <section className="intro"><h1 className="h1">Feed</h1></section>
      <StreakRisk heroId={next?.id} />
      <PushCard compact />
      {next && <EventHero ev={next} label={mine ? 'Din næste træning' : 'Næste event'} />}
      <InstagramStrip />
      <div className="sec-head"><h2 className="h2">Aktivitet</h2></div>
      <div className="seg" role="tablist" aria-label="Vis aktivitet fra">
        <button role="tab" aria-selected={tab === 'follow'} onClick={() => setTab('follow')}>Følger</button>
        <button role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>Alle</button>
      </div>
      {!feed ? <Skeleton /> : list.length ? (
        <ol className="feed">{list.map((a) => <Boundary key={a.id}><ActivityCard a={a} /></Boundary>)}</ol>
      ) : tab === 'follow' ? (
        <section className="empty-box">
          <h2 className="h2">Følg nogen</h2>
          {suggestions.length > 0 && (
            <ul className="people-list" style={{ width: '100%', textAlign: 'left' }}>
              {suggestions.map((u) => (
                <li className="person" key={u.id}>
                  <UserLink uid={u.id}><Avatar uid={u.id} /></UserLink>
                  <UserLink uid={u.id}><b>{u.name}</b>{u.instagram && <span>@{u.instagram}</span>}</UserLink>
                  <FollowButton uid={u.id} />
                </li>
              ))}
            </ul>
          )}
          <Link to="/community" className="link"><Icon name="users" />Community</Link>
        </section>
      ) : (
        <section className="empty-box">
          <h2 className="h2">Ingen aktivitet</h2>
        </section>
      )}
    </>
  );
}

function StreakRisk({ heroId }: { heroId?: string }) {
  const { me, events } = useApp();
  const today = todayStr();
  const s = me?.stats;
  const streak = currentStreak(s, today);
  const dow = new Date().getDay();
  if (!s || streak < 2 || weekIndex(today) - s.lastWeek !== 1 || (dow !== 0 && dow < 4)) return null;
  const left = dow === 0 ? 0 : 7 - dow;
  const sunday = addDays(today, left);
  const now = Date.now();
  const next = events
    .filter((e) => !e.cancelled && countsAsTraining(e) && e.date >= today && e.date <= sunday && (windowOf(e)?.until ?? 0) > now)
    .sort(bySort)[0];
  return (
    <section className="risk" aria-label="Din stime">
      <div className="risk-top">
        <span className="risk-ic" aria-hidden="true"><Icon name="flame" /></span>
        <div>
          <b>{streak} uger i træk</b>
          <span>
            {left === 0 ? 'Check ind i dag' : 'Check ind inden søndag'}
          </span>
        </div>
      </div>
      {next && next.id !== heroId && <EventChip ev={next} />}
    </section>
  );
}
