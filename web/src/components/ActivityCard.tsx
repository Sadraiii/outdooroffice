import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Activity } from '../api/types';
import { useApp } from '../state';
import { ago } from '../lib/dates';
import { activityStats, didPhrase, sportLabel } from '../lib/sports';
import { fmt } from '../lib/format';
import { buzz } from '../lib/platform';
import { Avatar, UserLink } from './bits';
import { BadgeArt } from './Attendance';
import { badgeById } from '../lib/stats';
import { EventChip } from './EventCards';
import { Icon } from './Icon';

export function KudosButton({ a }: { a: Activity }) {
  const { api, me, myKudos, toast } = useApp();
  const on = myKudos.has(a.id);
  const own = me?.id === a.uid;
  const [pop, setPop] = useState(false);
  useEffect(() => { if (!pop) return; const t = setTimeout(() => setPop(false), 450); return () => clearTimeout(t); }, [pop]);
  const click = async () => {
    if (!me || own) return;
    if (!on) { setPop(true); buzz(12); }
    try { await api.setKudos(a.id, me.id, !on); } catch { toast('Det lykkedes ikke. Prøv igen.'); }
  };
  return (
    <button className={'act-btn' + (on ? ' on' : '') + (pop ? ' pop' : '')} onClick={click} aria-pressed={on} disabled={own} aria-label={own ? `${a.kudos} high fives` : on ? 'Fjern high five' : 'Giv high five'}>
      <Icon name="hand" />{a.kudos > 0 ? fmt(a.kudos) : own ? '0' : 'High five'}
    </button>
  );
}

function useHighFive(a: Activity) {
  const { api, me, myKudos, toast } = useApp();
  const [pop, setPop] = useState(0);
  const last = useRef<{ t: number; x: number; y: number } | null>(null);
  useEffect(() => { if (!pop) return; const t = setTimeout(() => setPop(0), 900); return () => clearTimeout(t); }, [pop]);
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a, button, input, textarea, select, .is-link')) { last.current = null; return; }
    const p = last.current;
    if (!p || e.timeStamp - p.t > 350 || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 32) { last.current = { t: e.timeStamp, x: e.clientX, y: e.clientY }; return; }
    last.current = null;
    if (!me || me.id === a.uid) return;
    window.getSelection()?.removeAllRanges();
    setPop(Date.now());
    buzz(14);
    if (!myKudos.has(a.id)) api.setKudos(a.id, me.id, true).catch(() => toast('Det lykkedes ikke. Prøv igen.'));
  };
  const popEl = pop ? <span className="hf-pop" key={pop} aria-hidden="true"><Icon name="hand" /></span> : null;
  return { onPointerUp, popEl };
}

function Foot({ a }: { a: Activity }) {
  const { openSheet, me } = useApp();
  const share = a.kind === 'badge'
    ? (a.badge && me?.id === a.uid ? () => openSheet({ type: 'share-badge', badge: a.badge!, uid: a.uid }) : null)
    : () => openSheet({ type: 'share-activity', activity: a });
  return (
    <div className="act-foot">
      <KudosButton a={a} />
      <Link className="act-btn" to={`/a/${a.id}`}><Icon name="comment" />{a.comments > 0 ? fmt(a.comments) : 'Kommentér'}</Link>
      {share && <button className="act-btn push" onClick={share} aria-label="Del"><Icon name="share" />Del</button>}
    </div>
  );
}

function Head({ a, sub }: { a: Activity; sub?: string }) {
  const { shownName, users } = useApp();
  const admin = users.get(a.uid)?.role === 'admin';
  return (
    <header className="act-head">
      <UserLink uid={a.uid}><Avatar uid={a.uid} /></UserLink>
      <div className="act-who">
        <UserLink uid={a.uid}><b>{shownName(a.uid)}</b></UserLink>
        <span>{ago(a.createdAt)}{sub ? ` · ${sub}` : ''}</span>
      </div>
      {a.official && admin ? <span className="tag">Outdoor Office</span> : <span />}
    </header>
  );
}

export function ActivityCard({ a, full }: { a: Activity; full?: boolean }) {
  const { eventById, shownName } = useApp();
  const nav = useNavigate();
  const ev = eventById(a.eventId);
  const hf = useHighFive(a);

  if (a.kind === 'rsvp') {
    return (
      <li className="act-line">
        <UserLink uid={a.uid}><Avatar uid={a.uid} size="sm" /></UserLink>
        <div className="stack-v" style={{ gap: 8 }}>
          <p><b>{shownName(a.uid)}</b> {a.uid && shownName(a.uid) === 'Du' ? 'tilmeldte dig' : 'tilmeldte sig'} {ev ? '' : 'et event'} <span className="muted">· {ago(a.createdAt)}</span></p>
          {ev && <EventChip ev={ev} />}
        </div>
      </li>
    );
  }

  if (a.kind === 'badge') {
    const b = badgeById(a.badge || '');
    return (
      <li className="act act-badge" onPointerUp={hf.onPointerUp}>
        {hf.popEl}
        <Head a={a} sub="Nyt mærke" />
        <div className={'badge-card' + (full ? '' : ' is-link')} onClick={() => !full && nav(`/a/${a.id}`)}>
          <BadgeArt id={a.badge || ''} size={76} />
          <div><p className="badge-title">{b?.name || 'Nyt mærke'}</p><p className="muted">{b?.desc || ''}</p></div>
        </div>
        <Foot a={a} />
      </li>
    );
  }

  const stats = activityStats(a);
  const titleNode = a.title ? (full ? <h1 className="act-title">{a.title}</h1> : <Link className="act-title" to={`/a/${a.id}`}>{a.title}</Link>) : null;

  if (a.kind === 'event') {
    return (
      <li className="act" onPointerUp={hf.onPointerUp}>
        {hf.popEl}
        <Head a={a} sub={ev ? (ev.official ? 'Nyt OFFICIAL EVENT' : 'Nyt COMMUNITY MADE EVENT') : 'Nyt event'} />
        {ev?.cover && <img className="act-photo is-link" src={ev.cover} alt="" loading="lazy" onClick={() => nav(`/e/${ev.id}`)} />}
        {ev ? <EventChip ev={ev} /> : <p className="muted">Eventet findes ikke</p>}
        <Foot a={a} />
      </li>
    );
  }

  if (a.kind === 'goal') {
    return (
      <li className="act" onPointerUp={hf.onPointerUp}>
        {hf.popEl}
        <Head a={a} sub={sportLabel(a.sport)} />
        <p className={'act-title' + (full ? '' : ' is-link')} onClick={() => !full && nav(`/a/${a.id}`)}>
          <Icon name="trophy" className="b-check" /> Gennemførte {a.title}
        </p>
        {stats.length > 0 && <div className="stats">{stats.map((s) => <div className="stat-b" key={s.label}><span>{s.label}</span><b>{s.value}</b></div>)}</div>}
        {a.reps && <div className="reps">{a.reps.map((r, i) => <span className="rep" key={i}><b>{fmt(r.count)}</b>{r.name}{r.unit && r.unit !== 'reps' ? ` (${r.unit})` : ''}</span>)}</div>}
        {ev && <EventChip ev={ev} />}
        <Foot a={a} />
      </li>
    );
  }

  if (a.kind === 'post') {
    return (
      <li className={'act' + (a.official ? ' official' : '')} onPointerUp={hf.onPointerUp}>
        {hf.popEl}
        <Head a={a} sub={a.official ? 'Officielt opslag' : 'Opslag'} />
        {a.text && <p className="act-text">{a.text}</p>}
        {a.photoURL && <img className="act-photo" src={a.photoURL} alt="" loading="lazy" />}
        {ev && <EventChip ev={ev} />}
        <Foot a={a} />
      </li>
    );
  }

  return (
    <li className="act" onPointerUp={hf.onPointerUp}>
      {hf.popEl}
      <Head a={a} sub={sportLabel(a.sport)} />
      {titleNode || <p className="act-title">{shownName(a.uid)} {didPhrase(a)}</p>}
      {stats.length > 0 && <div className="stats">{stats.map((s) => <div className="stat-b" key={s.label}><span>{s.label}</span><b>{s.value}</b></div>)}</div>}
      {a.reps && a.reps.length > 0 && <div className="reps">{a.reps.map((r, i) => <span className="rep" key={i}><b>{fmt(r.count)}</b>{r.name}{r.unit && r.unit !== 'reps' ? ` (${r.unit})` : ''}</span>)}</div>}
      {a.text && <p className="act-text">{a.text}</p>}
      {a.photoURL && <img className="act-photo" src={a.photoURL} alt="" loading="lazy" />}
      {ev && <EventChip ev={ev} />}
      <Foot a={a} />
    </li>
  );
}
