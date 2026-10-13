import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { Nudge, UserProfile } from '../api/types';
import { DEMO } from '../api';
import { useApp, useSub } from '../state';
import { MONTHS_S, ago, bySort, dateOf, isPast, todayStr, whenText, ymd } from '../lib/dates';
import { countsAsTraining } from '../lib/checkin';
import { weeksAway } from '../lib/stats';
import { Avatar, Skeleton, UserLink } from '../components/bits';
import { Icon } from '../components/Icon';

const WEEK = 7 * 864e5;

export interface Missed { u: UserProfile; away: number | null }

export function missedMembers(users: Map<string, UserProfile>, meId: string | undefined, today = todayStr()): Missed[] {
  const out: Missed[] = [];
  users.forEach((u) => {
    if (u.id === meId) return;
    const away = weeksAway(u.stats, today);
    if (away === null ? Date.now() - u.createdAt > 14 * 864e5 : away >= 3) out.push({ u, away });
  });
  return out.sort((a, b) => (a.away ?? 999) - (b.away ?? 999) || a.u.name.localeCompare(b.u.name, 'da'));
}

export const lastNudge = (nudges: Nudge[] | null, uid: string) =>
  (nudges || []).filter((n) => n.to === uid && n.status !== 'skipped').sort((a, b) => b.at - a.at)[0];
export const greetedLately = (n: Nudge | undefined) => !!n && Date.now() - (n.sentAt || n.at) < WEEK;

const shortDate = (s: string) => { const d = dateOf(s); return d ? `${d.getDate()}. ${MONTHS_S[d.getMonth()]}` : ''; };

export function MissYouPage() {
  const { api, me, users, events, isAdmin, openSheet, shownName } = useApp();
  const allowed = isAdmin || DEMO;
  const nudges = useSub<Nudge[] | null>(allowed ? (cb) => api.watchNudges(cb) : null, [api, allowed], null);
  const list = useMemo(() => missedMembers(users, me?.id), [users, me?.id]);
  const upcoming = useMemo(() => events.filter((e) => !isPast(e) && !e.cancelled).sort(bySort), [events]);
  if (!allowed) return <Navigate to="/" replace />;
  const today = todayStr();
  const active = [...users.values()].filter((u) => { const w = weeksAway(u.stats, today); return w !== null && w < 3; }).length;
  const greeted = new Set((nudges || []).filter((n) => n.status !== 'skipped' && greetedLately(n)).map((n) => n.to)).size;

  return (
    <>
      <div className="crumb"><Link className="back" to={me ? `/u/${me.id}` : '/'}><Icon name="back" />Mig</Link></div>
      <section className="intro"><h1 className="h1">Vi savner dig</h1></section>
      {DEMO && !isAdmin && <p className="banner">Demo: kun admins ser denne side</p>}
      <div className="tiles">
        <div className="tile"><b>{active}</b><span>Aktive</span></div>
        <div className="tile"><b>{list.length}</b><span>Savnet</span></div>
        <div className="tile"><b>{greeted}</b><span>Hilst på</span></div>
      </div>
      {!nudges ? <Skeleton /> : list.length ? (
        <ul className="miss-list">
          {list.map(({ u, away }) => {
            const last = lastNudge(nudges, u.id);
            const lately = greetedLately(last);
            const signed = upcoming.find((e) => countsAsTraining(e) && (e.going.includes(u.id) || e.waitlist.includes(u.id)));
            return (
              <li key={u.id} className="miss">
                <UserLink uid={u.id}><Avatar uid={u.id} size="md" /></UserLink>
                <div className="miss-main">
                  <UserLink uid={u.id}><b>{u.name}</b></UserLink>
                  <span className="miss-away">
                    {away === null
                      ? `Aldrig checket ind · med siden ${shortDate(ymd(new Date(u.createdAt)))}`
                      : `Sidst ${u.stats?.lastDate ? shortDate(u.stats.lastDate) : ''} · ${away} uger siden`}
                  </span>
                  {signed && <span className="miss-note good"><Icon name="check" />{signed.waitlist.includes(u.id) ? 'På venteliste til' : 'Tilmeldt'} {signed.title} {whenText(signed)}</span>}
                  {last && <span className="miss-note"><Icon name="megaphone" />{shownName(last.from)} · {ago(last.sentAt || last.at)}</span>}
                </div>
                {lately
                  ? <span className="btn btn-sm btn-done is-static"><Icon name="check" />Hilst på</span>
                  : <button type="button" className="btn btn-sm btn-outline" onClick={() => openSheet({ type: 'nudge', uid: u.id })}>Send hilsen</button>}
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="empty-box">
          <h2 className="h2">Ingen savnede</h2>
        </section>
      )}
    </>
  );
}
