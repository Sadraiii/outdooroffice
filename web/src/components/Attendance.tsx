import { useState, type MouseEvent } from 'react';
import type { Checkin, EventDoc, UserProfile } from '../api/types';
import { useApp, useSub } from '../state';
import { todayStr } from '../lib/dates';
import { fmt } from '../lib/format';
import { buzz } from '../lib/platform';
import { isFull, signupClosed } from '../lib/seats';
import { BADGE_ART } from '../lib/badgeArt';
import { BADGES, currentStreak, weekIndex, type Stats } from '../lib/stats';
import { Icon } from './Icon';

export function useCheckins(eventId: string | undefined): Checkin[] | null {
  const { api } = useApp();
  return useSub<Checkin[] | null>(eventId ? (cb) => api.watchCheckins(eventId, cb) : null, [api, eventId], null);
}

export function CheckinButton({ ev, mine, wide }: { ev: EventDoc; mine: boolean; wide?: boolean }) {
  const { api, me, myRsvps, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const click = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!me || busy) return;
    setBusy(true);
    try {
      await api.setCheckin(ev.id, me.id, me.id, !mine);
      if (!mine) {
        buzz(20);
        if (!myRsvps.has(ev.id) && !isFull(ev) && !signupClosed(ev)) api.setRsvp(ev.id, me.id, true).catch(() => undefined);
        toast('Du er checket ind', { body: 'Træningen tæller med i dine uger i træk.' });
      } else toast('Check-in er fjernet');
    } catch { toast(mine ? 'Det lykkedes ikke. Prøv igen.' : 'Check-in er lukket for dette event.'); }
    setBusy(false);
  };
  const cls = (c: string) => `btn ${c}${wide ? ' btn-wide' : ''}`;
  return mine
    ? <button className={cls('btn-done')} onClick={click} aria-pressed="true" aria-label="Du er checket ind. Tryk for at fortryde"><Icon name="check" />Checket ind</button>
    : <button className={cls('btn-primary')} onClick={click} aria-pressed="false" disabled={busy}><Icon name="checkin" />Check ind</button>;
}

export function BadgeArt({ id, earned = true, size = 56 }: { id: string; earned?: boolean; size?: number }) {
  const a = BADGE_ART[id] || { icon: 'medal' };
  return (
    <span className={'badge-art' + (earned ? '' : ' locked')} style={{ ['--s' as string]: `${size}px` }} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <polygon className="hex" points="32,5 55.4,18.5 55.4,45.5 32,59 8.6,45.5 8.6,18.5" />
        <polygon className="ring" points="32,11 50.2,21.5 50.2,42.5 32,53 13.8,42.5 13.8,21.5" />
      </svg>
      {a.text ? <b className={'badge-num' + (a.text.length > 2 ? ' long' : '')}>{a.text}</b>
        : <span className="badge-ic"><Icon name={a.icon || 'medal'} />{a.sub && <small>{a.sub}</small>}</span>}
    </span>
  );
}

export const streakOf = (u: Pick<UserProfile, 'stats'> | undefined | null) => currentStreak(u?.stats, todayStr());

export function StreakChip({ u, min = 2 }: { u: UserProfile | undefined; min?: number }) {
  const n = streakOf(u);
  if (n < min) return null;
  return <span className="streak" title={`${n} uger i træk`} aria-label={`${n} uger i træk`}><Icon name="flame" />{n}</span>;
}

function isoWeek(w: number): number {
  const thursday = new Date(w * 7 * 864e5);
  return Math.floor((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 864e5 / 7) + 1;
}

export function WeekStrip({ s }: { s: Stats | null | undefined }) {
  const now = weekIndex(todayStr());
  const weeks = Array.from({ length: 12 }, (_, i) => now - 11 + i);
  const counts = weeks.map((w) => s?.weeks?.[String(w)] || 0);
  const top = Math.max(3, ...counts);
  const active = counts.filter((c) => c > 0).length;
  return (
    <div className="weeks">
      <div className="weeks-head"><b>De seneste 12 uger</b><span>{active ? `Trænet ${active} af 12 uger` : 'Ingen træninger endnu'}</span></div>
      <ol className="wk-bars">
        {weeks.map((w, i) => {
          const n = counts[i];
          return (
            <li key={w} className={(n ? 'on' : '') + (w === now ? ' now' : '')} aria-label={`${w === now ? 'Denne uge' : `Uge ${isoWeek(w)}`}: ${n} ${n === 1 ? 'træning' : 'træninger'}`}>
              <span className="wk-col"><i style={{ height: n ? `${26 + (Math.min(n, top) / top) * 74}%` : undefined }} />{n > 1 && <em>{n}</em>}</span>
              <span className="wk-n" aria-hidden="true">{w === now ? 'nu' : isoWeek(w)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Attendance({ u, isMe }: { u: UserProfile; isMe: boolean }) {
  const { openSheet } = useApp();
  const [all, setAll] = useState(false);
  const s = u.stats;
  const streak = streakOf(u);
  const earned = BADGES.filter((b) => u.badges[b.id]).sort((a, b) => u.badges[b.id] - u.badges[a.id]);
  const progress = (b: (typeof BADGES)[number]) => (s ? Math.min(1, b.value(s) / b.goal) : 0);
  const ahead = BADGES.filter((b) => !u.badges[b.id]).sort((a, b) => progress(b) - progress(a));
  const shown = all ? ahead : ahead.slice(0, 3);
  return (
    <section className="attend">
      <div className="sec-head"><h2 className="h2">Fremmøde</h2></div>
      <div className="tiles" style={{ marginTop: 0 }}>
        <div className="tile"><b>{fmt(s?.trainings || 0)}</b><span>Træninger</span></div>
        <div className={'tile' + (streak >= 2 ? ' hot' : '')}><b>{streak >= 2 && <Icon name="flame" />}{fmt(streak)}</b><span>Uger i træk</span></div>
        <div className="tile"><b>{fmt(s?.bestStreak || 0)}</b><span>Bedste stime</span></div>
      </div>
      {s?.trainings ? <WeekStrip s={s} /> : <p className="small muted" style={{ marginTop: 10 }}>{isMe ? 'Check ind, når du er til træning, så tæller den med her.' : 'Ingen træninger checket ind endnu.'}</p>}
      <div className="sec-head"><h2 className="h2">Mærker</h2><span className="muted small">{earned.length} af {BADGES.length}</span></div>
      {isMe && earned.length > 0 && <p className="small muted badges-hint">Tryk på et mærke for at dele det på Instagram.</p>}
      <ul className="badges">
        {earned.map((b) => (
          <li key={b.id}>
            {isMe
              ? <button type="button" className="badge-btn" onClick={() => openSheet({ type: 'share-badge', badge: b.id, uid: u.id })} aria-label={`Del mærket ${b.name}`}><BadgeArt id={b.id} /></button>
              : <BadgeArt id={b.id} />}
            <b>{b.name}</b><span className="badge-desc">{b.desc}</span>
          </li>
        ))}
        {shown.map((b) => {
          const v = s ? Math.min(b.goal, b.value(s)) : 0;
          return (
            <li key={b.id} className="ahead">
              <BadgeArt id={b.id} earned={false} />
              <b>{b.name}</b>
              <span className="badge-desc">{b.desc}</span>
              <span className="badge-bar" role="img" aria-label={`${v} af ${b.goal}`}><i style={{ width: `${(v / b.goal) * 100}%` }} /></span>
              <span className="badge-left">{v} / {b.goal}</span>
            </li>
          );
        })}
      </ul>
      {ahead.length > shown.length && <button type="button" className="link" style={{ marginTop: 8 }} onClick={() => setAll(true)}><Icon name="chev" />Vis alle {BADGES.length} mærker</button>}
    </section>
  );
}
