import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EventDoc } from '../api/types';
import { useApp, useTick } from '../state';
import { DAYS, MONTHS_S, cap, dateOf, dayDiff, endTime, isPast, relDay, status } from '../lib/dates';
import { checkinOpen } from '../lib/checkin';
import { isFull, placeOf, signupClosed } from '../lib/seats';
import { sportLabel } from '../lib/sports';
import { CheckinButton, useCheckins } from './Attendance';
import { AvatarStack, Bib, EventBadge } from './bits';
import { Icon } from './Icon';
import { WeatherChip } from './Weather';

export function useRsvp() {
  const { api, me, myRsvps, toast } = useApp();
  return async (ev: EventDoc) => {
    if (!me) return;
    const before = placeOf(ev, myRsvps, me.id).state;
    const on = before === 'none';
    if (on && ev.cancelled) { toast('Eventet er aflyst'); return; }
    if (on && signupClosed(ev)) { toast('Tilmeldingen er lukket'); return; }
    const waiting = on && isFull(ev);
    try {
      await api.setRsvp(ev.id, me.id, on);
      if (on) toast(waiting ? 'Du er på ventelisten' : 'Du er tilmeldt. Vi ses!', { body: waiting ? 'Du får besked, så snart der bliver en plads.' : 'Dem der følger dig får besked.' });
      else toast(before === 'waiting' ? 'Du er taget af ventelisten' : 'Du er afmeldt');
    } catch { toast(signupClosed(ev) ? 'Tilmeldingen er lukket' : 'Tilmeldingen blev ikke gemt. Prøv igen.'); }
  };
}

export function seatsText(ev: EventDoc, going: number, waiting: number): string {
  if (!ev.capacity) return '';
  if (going >= ev.capacity) return `Fuldt · ${ev.capacity} pladser${waiting ? ` · ${waiting} på venteliste` : ''}`;
  return `${going} af ${ev.capacity} pladser · ${ev.capacity - going} ledige`;
}

export function SportChip({ ev }: { ev: EventDoc }) {
  if (ev.title.trim().toLowerCase() === sportLabel(ev.sport).toLowerCase()) return null;
  return <span className="kind">{sportLabel(ev.sport)}</span>;
}

function useConfirm(ms = 3500): [boolean, () => boolean] {
  const [armed, setArmed] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const tap = () => {
    if (armed) { window.clearTimeout(timer.current); setArmed(false); return true; }
    setArmed(true); timer.current = window.setTimeout(() => setArmed(false), ms); return false;
  };
  return [armed, tap];
}

export function SignupButton({ ev }: { ev: EventDoc }) {
  const { myRsvps, me } = useApp();
  const rsvp = useRsvp();
  const [armed, confirm] = useConfirm();
  if (isPast(ev) || ev.cancelled) return null;
  const p = placeOf(ev, myRsvps, me?.id);
  const go = (e: MouseEvent) => { e.stopPropagation(); if (p.state === 'none' || confirm()) rsvp(ev); };
  if (p.state === 'going') {
    return armed
      ? <button className="su su-off" onClick={go} aria-label={`Tryk igen for at afmelde ${ev.title}`}>Afmeld?</button>
      : <button className="su su-on" onClick={go} aria-pressed="true" aria-label={`Du er tilmeldt ${ev.title}. Tryk for at afmelde`}><Icon name="check" />Tilmeldt</button>;
  }
  if (p.state === 'waiting') {
    return armed
      ? <button className="su su-off" onClick={go} aria-label="Tryk igen for at forlade ventelisten">Forlad?</button>
      : <button className="su su-wait" onClick={go} aria-pressed="true" aria-label={`Nummer ${p.pos} på ventelisten til ${ev.title}`}><Icon name="clock" />Nr. {p.pos}</button>;
  }
  if (signupClosed(ev)) return <span className="su su-closed">Lukket</span>;
  if (isFull(ev)) return <button className="su su-line" onClick={go} aria-label={`Skriv dig på ventelisten til ${ev.title}`}><Icon name="clock" />Venteliste</button>;
  return <button className="su" onClick={go} aria-label={`Tilmeld dig ${ev.title}`}><Icon name="plus" />Tilmeld</button>;
}

export function SignupPanel({ ev, onPeople }: { ev: EventDoc; onPeople: () => void }) {
  const { myRsvps, me } = useApp();
  const rsvp = useRsvp();
  const [armed, confirm] = useConfirm();
  const big = useRef<HTMLButtonElement>(null);
  const [away, setAway] = useState(false);
  const p = placeOf(ev, myRsvps, me?.id);
  const going = p.going.length;
  const closed = signupClosed(ev);
  const full = isFull(ev);
  const canJoin = p.state === 'none' && !closed && !ev.cancelled;
  useEffect(() => {
    const el = big.current;
    if (!el || !canJoin || typeof IntersectionObserver === 'undefined') { setAway(false); return; }
    const io = new IntersectionObserver(([e]) => setAway(e.intersectionRatio < 0.9), { rootMargin: '-90px 0px -96px 0px', threshold: [0, 0.9, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [canJoin]);
  const left = ev.capacity ? Math.max(0, ev.capacity - going) : 0;
  const join = () => rsvp(ev);
  const leave = () => { if (confirm()) rsvp(ev); };
  const toCalendar = () => document.querySelector('.cal')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const joinLabel = full ? 'Skriv mig på venteliste' : 'Tilmeld mig';
  return (
    <section className={'signup' + (p.state === 'going' ? ' is-going' : '')} aria-label="Tilmelding">
      <div className="su-head">
        <button type="button" className="su-people" onClick={onPeople}>
          <AvatarStack uids={p.going} max={5} size="xs" />
          <span>{going ? <><b>{going}</b>{ev.capacity ? ` af ${ev.capacity}` : ''} kommer</> : 'Ingen tilmeldt endnu'}</span>
        </button>
        {ev.capacity && !ev.cancelled && <span className={'su-left' + (full ? ' full' : left <= 3 ? ' few' : '')}>{full ? `Fuldt${p.waitlist.length ? ` · ${p.waitlist.length} venter` : ''}` : `${left} ${left === 1 ? 'plads' : 'pladser'} tilbage`}</span>}
      </div>
      {ev.capacity && !ev.cancelled && <div className="seat-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (going / ev.capacity) * 100)}%` }} /></div>}
      {ev.cancelled ? (
        <button className="su-big" disabled><Icon name="ban" />Eventet er aflyst</button>
      ) : p.state === 'going' ? (
        <>
          <div className="su-big su-big-on" role="status"><span className="su-tick"><Icon name="check" /></span>Du er tilmeldt</div>
          <div className="su-more">
            <button type="button" className="link" onClick={toCalendar}><Icon name="calplus" />Læg i kalenderen</button>
            <button type="button" className={'link' + (armed ? ' danger' : '')} onClick={leave}>{armed ? 'Tryk igen for at afmelde' : 'Afmeld'}</button>
          </div>
        </>
      ) : p.state === 'waiting' ? (
        <>
          <div className="su-big su-big-wait" role="status"><Icon name="clock" />Du er nr. {p.pos} på ventelisten</div>
          <div className="su-more">
            <span className="muted">Du rykker automatisk ind og får besked, hvis der bliver en plads.</span>
            <button type="button" className={'link' + (armed ? ' danger' : '')} onClick={leave}>{armed ? 'Tryk igen' : 'Forlad ventelisten'}</button>
          </div>
        </>
      ) : closed ? (
        <button className="su-big" disabled>Tilmeldingen er lukket</button>
      ) : (
        <>
          <button ref={big} className={'su-big su-big-go' + (full ? ' su-big-line' : '')} onClick={join}><Icon name={full ? 'clock' : 'plus'} />{joinLabel}</button>
          {full && <p className="su-note">Eventet er fuldt. Melder nogen fra, rykker du ind og får besked.</p>}
        </>
      )}
      {away && canJoin && (
        <div className="su-dock">
          <span><b>{ev.title}</b>{ev.capacity && !full ? `${left} ${left === 1 ? 'plads' : 'pladser'} tilbage` : `${going} kommer`}</span>
          <button className={'su-big su-big-go' + (full ? ' su-big-line' : '')} onClick={join}><Icon name={full ? 'clock' : 'plus'} />{full ? 'Venteliste' : 'Tilmeld mig'}</button>
        </div>
      )}
    </section>
  );
}

export function EventHero({ ev, label = 'Næste event' }: { ev: EventDoc; label?: string }) {
  const { myRsvps, me, shownName } = useApp();
  const nav = useNavigate();
  useTick();
  const st = status(ev);
  const place = placeOf(ev, myRsvps, me?.id);
  const att = place.going;
  const on = checkinOpen(ev);
  const checkins = useCheckins(on ? ev.id : undefined);
  const mine = !!me && !!checkins?.some((c) => c.uid === me.id);
  const here = on && checkins ? checkins.map((c) => c.uid) : [];
  const open = () => nav(`/e/${ev.id}`);
  const seats = ev.capacity ? (att.length >= ev.capacity ? 'Fuldt' : `${ev.capacity - att.length} ledige`) : '';
  return (
    <article className={'hero' + (ev.cover ? ' has-cover' : '')} onClick={open} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open(); }} aria-label={`${ev.title}, ${relDay(ev)}`}>
      {ev.cover && <div className="hero-cover"><img src={ev.cover} alt="" /></div>}
      <div className="hero-top"><span className="eyebrow">{label}</span>{ev.cancelled ? <span className="status cancelled">Aflyst</span> : <span className={'status ' + st.cls}>{st.txt}</span>}</div>
      <div className="hero-main">
        <Bib date={ev.date} size="lg" />
        <div className="hero-text">
          <div className="tags"><EventBadge ev={ev} /><SportChip ev={ev} /></div>
          <h2 className="hero-title">{ev.title}</h2>
          <p className="meta"><Icon name="clock" /><span>{cap(relDay(ev))}{ev.time ? ` kl. ${ev.time}` : ', tid ikke sat'}</span><WeatherChip ev={ev} /></p>
          <p className="meta"><Icon name="pin" /><span>{ev.place || 'Sted ikke sat'}</span></p>
        </div>
      </div>
      <div className="hero-people">
        <AvatarStack uids={here.length ? here : att} max={6} />
        {here.length
          ? <span className="here-now"><i className="here-pulse" aria-hidden="true" /><b>{here.length} her nu</b>{att.length ? ` · ${att.length} tilmeldt` : ''}</span>
          : <span>{att.length ? `${att.length} kommer` : 'Ingen tilmeldt endnu'}{seats ? ` · ${seats}` : ''}</span>}
        {ev.coachId && <span className="coach-mini"><Icon name="watch" />{shownName(ev.coachId)}</span>}
      </div>
      <div className="hero-actions">
        {ev.cancelled ? (
          <button className="btn btn-outline" onClick={(e) => { e.stopPropagation(); open(); }}>Se hvorfor<Icon name="chev" /></button>
        ) : on ? (
          <>
            {mine && ev.exercises.length > 0 && <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); open(); }}>Log dine reps<Icon name="chev" /></button>}
            <CheckinButton ev={ev} mine={mine} />
            {!mine && <button className="btn btn-outline" onClick={(e) => { e.stopPropagation(); open(); }}>{ev.exercises.length ? 'Program' : 'Detaljer'}<Icon name="chev" /></button>}
          </>
        ) : (
          <>
            <SignupButton ev={ev} />
            <button className="btn btn-outline" onClick={(e) => { e.stopPropagation(); open(); }}>{ev.exercises.length ? 'Se program' : 'Detaljer'}<Icon name="chev" /></button>
          </>
        )}
      </div>
    </article>
  );
}

export function dayLabel(date: string): string {
  const d = dateOf(date); if (!d) return date;
  const n = dayDiff(date);
  const base = `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS_S[d.getMonth()]}`;
  return n === 0 ? `I dag · ${base}` : n === 1 ? `I morgen · ${base}` : n === -1 ? `I går · ${base}` : cap(base);
}

export function byDay(list: EventDoc[]): [string, EventDoc[]][] {
  const m = new Map<string, EventDoc[]>();
  for (const e of list) { const g = m.get(e.date); if (g) g.push(e); else m.set(e.date, [e]); }
  return [...m.entries()];
}

export function EventSlot({ ev, preview }: { ev: EventDoc; preview?: boolean }) {
  const { myRsvps, me, shownName } = useApp();
  const nav = useNavigate();
  useTick();
  const place = placeOf(ev, myRsvps, me?.id);
  const att = place.going;
  const past = isPast(ev);
  const full = !!ev.capacity && att.length >= ev.capacity;
  const live = !preview && checkinOpen(ev);
  const checkins = useCheckins(live ? ev.id : undefined);
  const here = live && checkins ? checkins.map((c) => c.uid) : [];
  const mine = !!me && here.includes(me.id);
  const host = ev.coachId || ev.createdBy;
  const end = endTime(ev);
  const open = () => { if (!preview) nav(`/e/${ev.id}`); };
  const cls = 'slot' + (past ? ' is-past' : '') + (ev.cancelled ? ' is-cancelled' : '') + (live ? ' is-live' : '') + (place.state === 'going' ? ' is-mine' : '');
  return (
    <article className={cls} data-sport={ev.sport} onClick={open} role={preview ? undefined : 'link'} tabIndex={preview ? undefined : 0}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }} aria-label={preview ? undefined : `${ev.title}, ${relDay(ev)}${ev.time ? ` kl. ${ev.time}` : ''}`}>
      <div className="slot-tags">
        <span className={'seats' + (full && !past ? ' full' : '')}><Icon name="users" />{att.length}{ev.capacity ? `/${ev.capacity}` : ''}</span>
        {ev.cancelled ? <span className="kind cancelled">Aflyst</span>
          : live ? <span className="status live">I gang nu</span>
          : full && !past ? <span className="kind full">Fuldt</span> : null}
        <EventBadge ev={ev} />
        {!past && !ev.cancelled && !preview && <WeatherChip ev={ev} />}
      </div>
      <div className="slot-main">
        <div className="slot-info">
          {host && <p className="slot-who">{ev.official ? 'Coach' : 'Arrangør'}: {preview ? 'Dig' : shownName(host)}</p>}
          <h3 className="slot-title">{ev.title}</h3>
          <p className="slot-place">{ev.place || (preview ? 'Sted' : 'Sted ikke sat')}{ev.title.trim().toLowerCase() !== sportLabel(ev.sport).toLowerCase() && <span className="slot-sport"> · {sportLabel(ev.sport)}</span>}</p>
        </div>
        <div className="slot-time" aria-hidden="true">{ev.time ? <><b>{ev.time}</b>{end && <span>{end}</span>}</> : <><b className="allday">Hele</b><span>dagen</span></>}</div>
        <i className="slot-bar" aria-hidden="true" />
      </div>
      {!preview && (
        <div className="slot-foot">
          <div className="slot-people">
            {here.length
              ? <><AvatarStack uids={here} max={4} size="xs" /><span className="here-now"><i className="here-pulse" aria-hidden="true" /><b>{here.length} her nu</b></span></>
              : att.length ? <><AvatarStack uids={att} max={4} size="xs" /><span>{att.length} {past ? 'deltog' : 'kommer'}</span></>
              : <span className="muted">{past ? 'Ingen deltog' : 'Vær den første'}</span>}
            {past && ev.photoCount > 0 && <span className="t-photos"><Icon name="camera" />{ev.photoCount}</span>}
          </div>
          {live ? <CheckinButton ev={ev} mine={mine} /> : <SignupButton ev={ev} />}
        </div>
      )}
    </article>
  );
}

export function EventChip({ ev, prefix }: { ev: EventDoc; prefix?: string }) {
  const nav = useNavigate();
  return (
    <button className="ev-chip" onClick={(e) => { e.stopPropagation(); nav(`/e/${ev.id}`); }}>
      <Bib date={ev.date} size="xs" />
      <span>
        <EventBadge ev={ev} />
        <b>{prefix}{ev.title}</b>
        <span>{cap(relDay(ev))}{ev.time ? ` kl. ${ev.time}` : ''}{ev.place ? ` · ${ev.place}` : ''}</span>
      </span>
      <Icon name="chev" />
    </button>
  );
}
