import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Checkin, EventDoc, EventPhoto, Progress } from '../api/types';
import { useApp, useSub, useTick } from '../state';
import { DEMO } from '../api';
import { ago, deadlineText, isPast, longDate, startOf, status, timeSpan } from '../lib/dates';
import { fmt } from '../lib/format';
import { compressImage } from '../lib/image';
import { checkinOpen, countsAsTraining, feedbackOpen, windowOf } from '../lib/checkin';
import { downloadIcs } from '../lib/ical';
import { placeOf, signupClosed } from '../lib/seats';
import { mapsUrl } from '../lib/address';
import { isIOS } from '../lib/platform';
import { CheckinButton, useCheckins } from '../components/Attendance';
import { Counter } from '../components/Counter';
import { FeedbackCard, FeedbackSummary, avgText } from '../components/Feedback';
import { WeatherFact } from '../components/Weather';
import { SignupPanel, SportChip, seatsText } from '../components/EventCards';
import { Avatar, AvatarStack, EventBadge, Skeleton, UserLink } from '../components/bits';
import { Icon } from '../components/Icon';

type Sub = 'program' | 'team' | 'people' | 'photos';

export function EventPage() {
  const { id = '' } = useParams();
  const { api, me, eventById, eventsReady, myRsvps, isAdmin, shownName, openSheet, toast, celebrate } = useApp();
  const nav = useNavigate();
  useTick();
  const listed = eventById(id);
  const fetched = useSub<EventDoc | null | undefined>(listed || !eventsReady ? null : (cb) => api.watchEvent(id, cb), [api, id, !!listed, eventsReady], undefined);
  const ev = listed || fetched || undefined;
  const progress = useSub<Progress[] | null>((cb) => api.watchProgress(id, cb), [api, id], null);
  const photos = useSub<EventPhoto[] | null>((cb) => api.watchEventPhotos(id, cb), [api, id], null);
  const checkins = useCheckins(id);
  const checkedIn = !!me && !!checkins?.some((c) => c.uid === me.id);
  const [sub, setSub] = useState<Sub>('program');
  const [viewer, setViewer] = useState<{ which: 'cover' | 'all'; index: number } | null>(null);

  const [mine, setMine] = useState<Record<string, number> | null>(null);
  const pending = useRef<number | null>(null);
  useEffect(() => {
    if (!progress || !me || pending.current) return;
    setMine(progress.find((p) => p.uid === me.id)?.counts || {});
  }, [progress, me]);
  useEffect(() => () => { if (pending.current) window.clearTimeout(pending.current); }, []);

  const setCount = useCallback((xid: string, v: number) => {
    if (!me || !ev) return;
    const ids = new Set(ev.exercises.map((x) => x.id));
    const next = Object.fromEntries(Object.entries({ ...(mine || {}), [xid]: v }).filter(([k]) => ids.has(k)));
    setMine(next);
    const done = ev.exercises.length > 0 && ev.exercises.every((x) => (next[x.id] || 0) >= x.target);
    const x = ev.exercises.find((y) => y.id === xid);
    if (done && !ev.exercises.every((y) => (mine?.[y.id] || 0) >= y.target)) {
      celebrate({ kind: 'program', title: ev.title });
    } else if (x && (mine?.[xid] || 0) < x.target && v >= x.target) toast(`${x.name}: mål nået`);
    if (pending.current) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      pending.current = null;
      api.setProgress(ev.id, me.id, next, done).catch(() => toast('Reps ikke gemt'));
    }, 600);
    if (v > 0 && !myRsvps.has(ev.id) && !isPast(ev) && !signupClosed(ev) && !ev.cancelled) api.setRsvp(ev.id, me.id, true).catch(() => undefined);
    if (v > 0 && !checkedIn && checkinOpen(ev)) api.setCheckin(ev.id, me.id, me.id, true).catch(() => undefined);
  }, [api, ev, me, mine, myRsvps, toast, celebrate, checkedIn]);

  if (!ev) {
    return (
      <>
        <div className="crumb"><button className="back" onClick={() => nav(-1)}><Icon name="back" />Tilbage</button></div>
        {eventsReady && fetched === null ? <section className="empty"><h2 className="h2">Eventet findes ikke</h2></section> : <Skeleton />}
      </>
    );
  }

  const isHost = !!me && (ev.createdBy === me.id || ev.coachId === me.id || ev.cohosts.includes(me.id));
  const canEdit = isHost || isAdmin;
  const live = checkinOpen(ev);
  const st = status(ev);
  const past = isPast(ev);
  const place = placeOf(ev, myRsvps, me?.id);
  const attendees = place.going;
  const closed = signupClosed(ev);
  const here = checkins ? checkins.map((c) => c.uid) : [];
  const showHere = (live || past) && here.length > 0;
  const started = (startOf(ev)?.getTime() ?? Infinity) <= Date.now();
  const askFeedback = feedbackOpen(ev) && !isHost && (checkedIn || place.state === 'going');
  const showSummary = canEdit && !ev.cancelled && (ev.feedbackCount > 0 || (feedbackOpen(ev) && !live));
  const cover = (photos || []).filter((p) => p.host).sort((a, b) => a.at - b.at);
  const all = photos || [];
  const viewList = viewer ? (viewer.which === 'cover' ? cover : all) : [];
  const hasProgram = ev.exercises.length > 0;
  const tab: Sub = !hasProgram && sub === 'team' ? 'program' : sub;

  return (
    <>
      <div className="crumb">
        <button className="back" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/events'))}><Icon name="back" />Tilbage</button>
        {canEdit && <button className="btn btn-outline btn-sm" onClick={() => openSheet({ type: 'event', event: ev })}><Icon name="edit" />Rediger</button>}
      </div>
      {cover.length > 0 && <CoverGallery photos={cover} onOpen={(i) => setViewer({ which: 'cover', index: i })} />}
      <header className="ev-head">
        <div className="tags"><EventBadge ev={ev} /><SportChip ev={ev} />{ev.cancelled ? <span className="status cancelled"><Icon name="ban" />Aflyst</span> : <span className={'status ' + st.cls}>{st.txt}</span>}</div>
        <h1 className={'h1' + (ev.cancelled ? ' struck' : '')}>{ev.title}</h1>
        {ev.cancelled && <p className="cancel-note"><b>Aflyst.</b>{ev.cancelNote ? ` ${ev.cancelNote}` : ''}</p>}
        <ul className="facts">
          <li><Icon name="cal" /><span>{longDate(ev)}{ev.time ? ` kl. ${timeSpan(ev)}` : ''}</span></li>
          {ev.place && <li><Icon name="pin" /><a className="map-link" href={mapsUrl(ev.place, ev.geo, isIOS())} target="_blank" rel="noopener noreferrer" aria-label={`${ev.place}, vis på kort`}>{ev.place}</a></li>}
          {ev.coachId && <li><Icon name="watch" /><UserLink uid={ev.coachId} className="who"><Avatar uid={ev.coachId} size="xs" />{ev.official ? 'Coach' : 'Arrangør'}: {shownName(ev.coachId)}</UserLink></li>}
          {ev.cohosts.length > 0 && (
            <li className="co-fact"><Icon name="flag" /><span>{ev.cohosts.length > 1 ? 'Medarrangører' : 'Medarrangør'}:</span>
              {ev.cohosts.map((u) => <UserLink key={u} uid={u} className="who"><Avatar uid={u} size="xs" />{shownName(u)}</UserLink>)}
            </li>
          )}
          {past && !ev.cancelled && ev.feedbackCount >= 3 && <li><Icon name="star" /><span><b className="fb-fact">{avgText(ev.feedbackSum, ev.feedbackCount)}</b>/5 · {ev.feedbackCount} svar</span></li>}
          {ev.capacity && !past && !ev.cancelled && <li className={attendees.length >= ev.capacity ? 'warn' : ''}><Icon name="users" /><span>{seatsText(ev, attendees.length, place.waitlist.length)}</span></li>}
          {ev.signupUntil && !past && !ev.cancelled && <li className={closed ? 'warn' : ''}><Icon name="clock" /><span>{closed ? 'Tilmelding lukket' : `Tilmelding senest ${deadlineText(ev.signupUntil)}`}</span></li>}
          <WeatherFact ev={ev} />
        </ul>
        {ev.note && <p className="note">{ev.note}</p>}
      </header>
      {past || live ? (
        <div className={'rsvp-bar' + (past && !checkedIn && place.state !== 'going' ? ' only' : '')}>
          {past ? (checkedIn ? <span className="btn btn-done is-static"><Icon name="check" />Du deltog</span> : place.state === 'going' ? <span className="btn btn-outline is-static">Du var tilmeldt</span> : null)
            : <CheckinButton ev={ev} mine={checkedIn} wide />}
          <button className={'people-btn' + (live && showHere ? ' is-live' : '')} onClick={() => setSub('people')}>
            <AvatarStack uids={showHere ? here : attendees} max={4} />
            {showHere
              ? <span>{live && <i className="here-pulse" aria-hidden="true" />}{here.length} {live ? 'her nu' : 'deltog'}</span>
              : <span>{attendees.length} {past ? 'deltog' : 'kommer'}</span>}
          </button>
        </div>
      ) : <SignupPanel ev={ev} onPeople={() => setSub('people')} />}
      {askFeedback && <FeedbackCard ev={ev} />}
      {showSummary && <FeedbackSummary ev={ev} />}
      <div className="seg sticky" role="tablist" aria-label="Visning">
        <button role="tab" aria-selected={tab === 'program'} onClick={() => setSub('program')}>{hasProgram ? 'Program' : 'Om eventet'}</button>
        {hasProgram && <button role="tab" aria-selected={tab === 'team'} onClick={() => setSub('team')}>Holdet</button>}
        <button role="tab" aria-selected={tab === 'people'} onClick={() => setSub('people')}>Deltagere <span className="seg-n">{attendees.length}</span></button>
        <button role="tab" aria-selected={tab === 'photos'} onClick={() => setSub('photos')}>Billeder <span className="seg-n">{photos ? photos.length : ev.photoCount}</span></button>
      </div>
      <section role="tabpanel">
        {tab === 'program' && <ProgramTab ev={ev} mine={mine} setCount={setCount} canEdit={canEdit} />}
        {tab === 'team' && <TeamTab ev={ev} progress={progress} attendees={attendees} mine={mine} />}
        {tab === 'people' && <PeopleTab ev={ev} attendees={attendees} waitlist={place.waitlist} checkins={checkins} canMark={canEdit && countsAsTraining(ev) && !ev.cancelled && Date.now() >= (windowOf(ev)?.from ?? Infinity)} />}
        {tab === 'photos' && <PhotosTab ev={ev} photos={photos} canAdd={!!me && (ev.photoPolicy === 'all' || canEdit)} asHost={canEdit} onOpen={(i) => setViewer({ which: 'all', index: i })} />}
      </section>
      <div className="share-row">
        {(past || started) && !ev.cancelled && <button className="btn btn-primary btn-sm" onClick={() => openSheet({ type: 'share-recap', event: ev })}><Icon name="story" />Recap</button>}
        <button className="btn btn-outline btn-sm" onClick={() => openSheet({ type: 'share-event', event: ev })}><Icon name="share" />Del</button>
        {!past && !ev.cancelled && <button className="btn btn-outline btn-sm" onClick={() => openSheet({ type: 'workout', eventId: ev.id })}><Icon name="trophy" />Del træning</button>}
      </div>
      {!ev.cancelled && <CalendarLinks ev={ev} />}
      {viewer && viewList.length > 0 && <PhotoViewer ev={ev} list={viewList} start={Math.min(viewer.index, viewList.length - 1)} canModerate={canEdit} onClose={() => setViewer(null)} />}
    </>
  );
}

function CoverGallery({ photos, onOpen }: { photos: EventPhoto[]; onOpen: (i: number) => void }) {
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const onScroll = () => { const el = track.current; if (el && el.clientWidth) setI(Math.round(el.scrollLeft / el.clientWidth)); };
  return (
    <div className="cover">
      <div className="cover-track" ref={track} onScroll={onScroll}>
        {photos.map((p, k) => (
          <button key={p.id} type="button" className="cover-slide" onClick={() => onOpen(k)} aria-label={`Se billede ${k + 1} af ${photos.length}`}>
            <img src={p.url} alt="" loading={k ? 'lazy' : 'eager'} />
          </button>
        ))}
      </div>
      {photos.length > 1 && <span className="cover-count" aria-hidden="true">{i + 1}/{photos.length}</span>}
      {photos.length > 1 && <div className="cover-dots" aria-hidden="true">{photos.map((p, k) => <i key={p.id} className={k === i ? 'on' : ''} />)}</div>}
    </div>
  );
}

function PhotosTab({ ev, photos, canAdd, asHost, onOpen }: { ev: EventDoc; photos: EventPhoto[] | null; canAdd: boolean; asHost: boolean; onOpen: (i: number) => void }) {
  const { api, me, shownName, toast } = useApp();
  const [busy, setBusy] = useState('');
  const add = async (files: FileList | null) => {
    if (!me || !files?.length) return;
    const list = [...files].slice(0, 10);
    let done = 0;
    for (const f of list) {
      setBusy(`Lægger op ${done + 1}/${list.length} …`);
      try { await api.addEventPhoto(ev.id, me.id, await compressImage(f), asHost); done++; } catch {  }
    }
    setBusy('');
    if (done < list.length) toast(`${list.length - done} ikke lagt op`);
    else toast(done > 1 ? `${done} billeder delt` : 'Billede delt');
  };
  if (!photos) return <Skeleton />;
  const mixed = photos.some((p) => p.host) && photos.some((p) => !p.host);
  return (
    <>
      {canAdd && (
        <div className="ph-head">
          <span className={'btn btn-primary btn-sm file-btn' + (busy ? ' is-busy' : '')}><Icon name="camera" />{busy || 'Tilføj billeder'}
            <input type="file" accept="image/*" multiple aria-label="Vælg billeder" disabled={!!busy} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          </span>
        </div>
      )}
      {photos.length ? (
        <ul className="ph-grid">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button type="button" onClick={() => onOpen(i)} aria-label={`Billede fra ${shownName(p.uid)}`}>
                <img src={p.url} alt="" loading="lazy" />
                {p.host && mixed && <span className="ph-tag">Arrangør</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty"><p>Ingen billeder</p></div>
      )}
    </>
  );
}

function PhotoViewer({ ev, list, start, canModerate, onClose }: { ev: EventDoc; list: EventPhoto[]; start: number; canModerate: boolean; onClose: () => void }) {
  const { api, me, shownName, toast } = useApp();
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(start);
  const [confirm, setConfirm] = useState(false);
  const idx = Math.min(i, list.length - 1);
  const p = list[idx];
  const go = useCallback((d: number) => {
    const el = track.current; if (!el) return;
    el.scrollTo({ left: Math.max(0, Math.min(list.length - 1, idx + d)) * el.clientWidth, behavior: 'smooth' });
  }, [idx, list.length]);
  useEffect(() => { const el = track.current; if (el) el.scrollLeft = start * el.clientWidth; }, [start]);
  useEffect(() => {
    document.body.classList.add('locked');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('locked'); window.removeEventListener('keydown', onKey); };
  }, [go, onClose]);
  useEffect(() => setConfirm(false), [idx]);
  const onScroll = () => { const el = track.current; if (el && el.clientWidth) setI(Math.round(el.scrollLeft / el.clientWidth)); };
  const canDelete = !!p && !!me && (p.uid === me.id || canModerate);
  const del = async () => {
    if (!p) return;
    if (!confirm) { setConfirm(true); return; }
    try { await api.deleteEventPhoto(ev.id, p.id); toast('Billedet er slettet'); if (list.length <= 1) onClose(); } catch { toast('Ikke slettet'); }
  };
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Billeder fra ${ev.title}`}>
      <div className="viewer-top">
        <span className="viewer-count">{idx + 1} / {list.length}</span>
        <button type="button" className="viewer-x" onClick={onClose} aria-label="Luk"><Icon name="close" /></button>
      </div>
      <div className="viewer-track" ref={track} onScroll={onScroll}>
        {list.map((x) => <figure key={x.id}><img src={x.url} alt="" /></figure>)}
      </div>
      {list.length > 1 && <button type="button" className="viewer-nav prev" onClick={() => go(-1)} disabled={idx === 0} aria-label="Forrige billede"><Icon name="back" /></button>}
      {list.length > 1 && <button type="button" className="viewer-nav next" onClick={() => go(1)} disabled={idx === list.length - 1} aria-label="Næste billede"><Icon name="chev" /></button>}
      {p && (
        <div className="viewer-foot">
          <span className="viewer-who"><Avatar uid={p.uid} size="xs" /><b>{shownName(p.uid)}</b><span>{ago(p.at)}{p.host ? ' · Arrangør' : ''}</span></span>
          {canDelete && <button type="button" className={'viewer-del' + (confirm ? ' confirm' : '')} onClick={del}><Icon name="trash" />{confirm ? 'Tryk igen' : 'Slet'}</button>}
        </div>
      )}
    </div>
  );
}

function ProgramTab({ ev, mine, setCount, canEdit }: { ev: EventDoc; mine: Record<string, number> | null; setCount: (x: string, v: number) => void; canEdit: boolean }) {
  const { openSheet } = useApp();
  if (!ev.exercises.length) {
    return (
      <div className="empty">
        <p>Intet program</p>
        {canEdit && ev.sport !== 'socialt' && <button className="btn btn-primary" onClick={() => openSheet({ type: 'event', event: ev })}><Icon name="plus" />Læg program ind</button>}
      </div>
    );
  }
  if (!mine) return <Skeleton />;
  return (
    <>
      <div className="counters">{ev.exercises.map((x) => <Counter key={x.id} x={x} value={mine[x.id] || 0} onChange={(v) => setCount(x.id, v)} />)}</div>
      {canEdit && <p style={{ marginTop: 12 }}><button className="btn btn-quiet btn-wide" onClick={() => openSheet({ type: 'event', event: ev })}><Icon name="edit" />Rediger program</button></p>}
    </>
  );
}

function TeamTab({ ev, progress, attendees, mine }: { ev: EventDoc; progress: Progress[] | null; attendees: string[]; mine: Record<string, number> | null }) {
  const { me, shownName, nameOf } = useApp();
  const [sel, setSel] = useState<string>('all');
  const counts = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    (progress || []).forEach((p) => m.set(p.uid, p.counts));
    if (me && mine) m.set(me.id, mine);
    return m;
  }, [progress, me, mine]);
  const xs = ev.exercises;
  const people = [...new Set([...attendees, ...[...counts.entries()].filter(([, c]) => Object.values(c).some((v) => v > 0)).map(([u]) => u)])];
  if (!progress) return <Skeleton />;
  if (!people.length) return <div className="empty"><p>Ingen endnu</p></div>;
  if (!xs.length) return <div className="empty"><p>Intet program</p></div>;
  const c = (u: string, x: string) => counts.get(u)?.[x] || 0;
  const pct = (u: string) => xs.reduce((s, x) => s + Math.min(1, c(u, x.id) / (x.target || 1)), 0) / xs.length;
  const x1 = sel === 'all' ? null : xs.find((x) => x.id === sel) || null;
  const rows = people.map((u) => ({ u, v: x1 ? c(u, x1.id) / (x1.target || 1) : pct(u), n: x1 ? c(u, x1.id) : 0 }))
    .sort((a, b) => b.v - a.v || nameOf(a.u).localeCompare(nameOf(b.u), 'da'));
  return (
    <>
      <section className="card team-sum">
        <div className="sum-head"><h3 className="h3">Samlet</h3><span className="live">Live</span></div>
        {xs.map((x) => {
          const tot = people.reduce((s, u) => s + c(u, x.id), 0); const goal = x.target * people.length; const p = goal ? Math.min(1, tot / goal) : 0;
          return (
            <div className="sum-row" key={x.id}>
              <div className="sum-line"><span className="sum-name">{x.name}</span><span className="sum-val"><b>{fmt(tot)}</b> / {fmt(goal)} {x.unit}</span></div>
              <div className={'bar' + (p >= 1 ? ' full' : '')}><i style={{ width: `${(p * 100).toFixed(1)}%` }} /></div>
            </div>
          );
        })}
        <p className="sum-foot">{people.length} deltagere</p>
      </section>
      {xs.length > 1 && (
        <div className="chips" role="group" aria-label="Vis tavlen for">
          <button className="chip" aria-pressed={sel === 'all'} onClick={() => setSel('all')}>Samlet</button>
          {xs.map((x) => <button key={x.id} className="chip" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>{x.name}</button>)}
        </div>
      )}
      <ol className="board">
        {rows.map((r, i) => {
          const done = r.v >= 1;
          return (
            <li key={r.u} className={'b-row' + (r.u === me?.id ? ' me' : '') + (done ? ' done' : '')}>
              <span className="b-rank">{i + 1}</span>
              <UserLink uid={r.u}><Avatar uid={r.u} /></UserLink>
              <div className="b-main">
                <UserLink uid={r.u} className="b-name"><span>{shownName(r.u)}</span><RoleTag ev={ev} uid={r.u} />{done && <Icon name="check" className="b-check" />}</UserLink>
                <div className={'bar' + (done ? ' full' : '')}><i style={{ width: `${(Math.min(1, r.v) * 100).toFixed(1)}%` }} /></div>
                {!x1 && <div className="b-sub">{xs.map((x) => `${x.name} ${fmt(c(r.u, x.id))}`).join(' · ')}</div>}
              </div>
              <span className="b-val">{x1 ? <>{fmt(r.n)}<small>/{fmt(x1.target)}</small></> : `${Math.round(Math.min(1, r.v) * 100)}%`}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function RoleTag({ ev, uid }: { ev: EventDoc; uid: string }) {
  if (ev.coachId === uid) return <span className="tag">{ev.official ? 'Coach' : 'Arrangør'}</span>;
  if (ev.cohosts.includes(uid)) return <span className="tag soft">Medarrangør</span>;
  return null;
}

function PeopleTab({ ev, attendees, waitlist, checkins, canMark }: { ev: EventDoc; attendees: string[]; waitlist: string[]; checkins: Checkin[] | null; canMark: boolean }) {
  const { api, me, shownName, toast } = useApp();
  const here = new Set((checkins || []).map((c) => c.uid));
  const list = [...attendees, ...[...here].filter((u) => !attendees.includes(u))];
  const mark = async (uid: string) => {
    if (!me) return;
    try { await api.setCheckin(ev.id, uid, me.id, !here.has(uid)); } catch { toast('Det lykkedes ikke. Prøv igen.'); }
  };
  return (
    <>
      {here.size > 0 && <p className="hint"><Icon name="checkin" /> {here.size} af {list.length} checket ind</p>}
      {list.length ? (
        <ul className="people-grid">
          {list.map((u) => (
            <li key={u} className={here.has(u) ? 'here' : ''}>
              <Link to={`/u/${u}`}>
                <span className="av-wrap"><Avatar uid={u} />{here.has(u) && <span className="here-dot" aria-label="Checket ind"><Icon name="check" /></span>}</span>
                <span className="p-col"><span className="p-name">{shownName(u)}</span><RoleTag ev={ev} uid={u} /></span>
              </Link>
              {canMark && <button type="button" className={'mark-btn' + (here.has(u) ? ' on' : '')} onClick={() => mark(u)} aria-pressed={here.has(u)} aria-label={`${shownName(u)} ${here.has(u) ? 'var der. Tryk for at fjerne' : 'var der ikke. Tryk for at checke ind'}`}>{here.has(u) ? 'Mødt' : 'Ikke mødt'}</button>}
            </li>
          ))}
        </ul>
      ) : <div className="empty"><p>{isPast(ev) ? 'Ingen deltog' : 'Ingen tilmeldt'}</p></div>}
      {waitlist.length > 0 && !isPast(ev) && (
        <section className="waitlist">
          <h3 className="h3">Venteliste <span className="seg-n">{waitlist.length}</span></h3>
          <ol>
            {waitlist.map((u, i) => <li key={u}><span className="wl-n">{i + 1}</span><Link to={`/u/${u}`}><Avatar uid={u} size="sm" /><span>{shownName(u)}</span></Link></li>)}
          </ol>
        </section>
      )}
    </>
  );
}

function CalendarLinks({ ev }: { ev: EventDoc }) {
  const { api, openSheet, toast } = useApp();
  const ics = () => (DEMO ? toast('Åbner kalenderen') : downloadIcs(ev));
  const st = startOf(ev);
  if (!st || isPast(ev)) return null;
  const title = 'Outdoor Office: ' + ev.title;
  const details = [ev.exercises.map((x) => `${x.name} ${fmt(x.target)} ${x.unit}`).join(', '), ev.note].filter(Boolean).join('\n\n');
  const E = encodeURIComponent;
  let g: string, o: string;
  if (ev.time) {
    const end = new Date(st.getTime() + (ev.duration || 60) * 6e4);
    const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${E(title)}&dates=${z(st)}/${z(end)}&details=${E(details)}&location=${E(ev.place)}`;
    o = `https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=${E(title)}&startdt=${E(st.toISOString())}&enddt=${E(end.toISOString())}&location=${E(ev.place)}&body=${E(details)}`;
  } else {
    const nd = new Date(st.getTime() + 864e5);
    const d2 = `${nd.getFullYear()}${String(nd.getMonth() + 1).padStart(2, '0')}${String(nd.getDate()).padStart(2, '0')}`;
    g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${E(title)}&dates=${ev.date.replace(/-/g, '')}/${d2}&details=${E(details)}&location=${E(ev.place)}`;
    o = `https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=${E(title)}&startdt=${ev.date}&enddt=${ev.date}&allday=true&location=${E(ev.place)}&body=${E(details)}`;
  }
  return (
    <section className="cal">
      <b>Læg i kalenderen</b>
      <div className="cal-btns">
        <button type="button" className="btn btn-outline btn-sm" onClick={ics}><Icon name="download" />iPhone og Mac</button>
        <a className="btn btn-outline btn-sm" href={g} target="_blank" rel="noopener noreferrer"><Icon name="cal" />Google Kalender</a>
        <a className="btn btn-outline btn-sm" href={o} target="_blank" rel="noopener noreferrer"><Icon name="cal" />Outlook</a>
      </div>
      {api.features.calendarFeed && <button type="button" className="link" onClick={() => openSheet({ type: 'calendar' })}><Icon name="calplus" />Abonnér på alle dine events</button>}
    </section>
  );
}
