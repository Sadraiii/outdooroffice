import { useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, RepLine, Sport } from '../api/types';
import { useApp } from '../state';
import { SPORTS, WORKOUT_SPORTS, sportLabel, sportMetric } from '../lib/sports';
import { fmt, formatPace, formatSpeed, newId, parseNumber } from '../lib/format';
import { dateOf, isPast, relDay, startOf, todayStr } from '../lib/dates';
import { compressImage } from '../lib/image';
import { buzz } from '../lib/platform';
import { Sheet } from './Sheet';
import { Icon, SPORT_ICON } from './Icon';
import { ActivityCard } from './ActivityCard';

type Row = { id: string; name: string; count: string };

const MINUTES: Partial<Record<Sport, number[]>> = { yoga: [30, 45, 60, 90], vinterbadning: [2, 5, 10, 15], andet: [30, 45, 60, 90] };
const STEP = 5;

function autoTitle(sport: Sport, hour = new Date().getHours()): string {
  const part = hour < 10 ? 'Morgen' : hour < 13 ? 'Frokost' : hour < 18 ? 'Eftermiddags' : 'Aften';
  const noun = { lob: 'løb', cykling: 'cykeltur', gang: 'gåtur', fitness: 'fitness', yoga: 'yoga', vinterbadning: 'dukkert' }[sport as string];
  if (noun) return part + noun;
  return sport === 'andet' ? 'Træning' : sportLabel(sport);
}

const clockText = (digits: string) => {
  if (!digits) return '';
  const p = digits.padStart(3, '0');
  const ss = p.slice(-2), rest = p.slice(0, -2);
  return rest.length <= 2 ? `${Number(rest)}:${ss}` : `${Number(rest.slice(0, -2))}:${rest.slice(-2)}:${ss}`;
};

function clockSeconds(digits: string): number | null {
  if (!digits) return null;
  const p = digits.padStart(6, '0');
  const h = Number(p.slice(0, 2)), m = Number(p.slice(2, 4)), s = Number(p.slice(4));
  if (s > 59 || (h > 0 && m > 59)) return NaN;
  return h * 3600 + m * 60 + s;
}

function ClockInput({ digits, onChange, label }: { digits: string; onChange: (d: string) => void; label: string }) {
  return (
    <input inputMode="numeric" autoComplete="off" enterKeyHint="done" aria-label={label} placeholder="0:00" value={clockText(digits)}
      onChange={(e) => {
        let d = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6);
        if (d === digits && e.target.value.length < clockText(digits).length) d = d.slice(0, -1);
        onChange(d);
      }} />
  );
}

const rowsFor = (sport: Sport, names?: string[]): Row[] =>
  (names?.length ? names : SPORTS[sport].tpl.filter(([, , u]) => u === 'reps').map(([n]) => n)).map((name) => ({ id: newId('r'), name, count: '' }));

export const SHARE_LABEL = 'Del med community';
const STEPS = ['Hvad har du lavet?', 'Dine tal', 'Tjek og del'] as const;
type Step = 0 | 1 | 2;
type Draft = { distanceKm?: number; durationSec?: number; reps: RepLine[] };

export function WorkoutSheet({ eventId }: { eventId?: string }) {
  const { api, me, events, myRsvps, closeSheet, openSheet, eventById } = useApp();
  const near = useMemo(() => events
    .filter((e) => Math.abs((dateOf(e.date)?.getTime() || 0) - Date.now()) < 10 * 864e5 && (myRsvps.has(e.id) || !isPast(e)))
    .slice(0, 25), [events, myRsvps]);
  const auto = useMemo(() => eventId || events.find((e) => myRsvps.has(e.id) && !e.cancelled && e.date === todayStr() && (startOf(e)?.getTime() ?? Infinity) <= Date.now())?.id || '', []);
  const ev0 = eventById(auto);
  const known = !!ev0 && WORKOUT_SPORTS.includes(ev0.sport);
  const first: Sport = known ? ev0!.sport : 'lob';

  const [step, setStep] = useState<Step>(known ? 1 : 0);
  const [sport, setSport] = useState<Sport>(first);
  const [km, setKm] = useState('');
  const [time, setTime] = useState('');
  const [mins, setMins] = useState('');
  const [rows, setRows] = useState<Row[]>(() => (sportMetric(first) === 'reps' ? rowsFor(first, ev0?.exercises.filter((x) => x.unit === 'reps').map((x) => x.name)) : []));
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [evId, setEvId] = useState(auto);
  const [evPicked, setEvPicked] = useState(!!eventId);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Activity | null>(null);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : ''), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.closest('.sheet-body')?.scrollTo(0, 0); setErr(''); }, [step]);
  useEffect(() => setErr(''), [km, time, mins, rows]);

  const metric = sportMetric(sport);
  const suggested = autoTitle(sport);
  const distance = parseNumber(km);
  const timeSec = clockSeconds(time);
  const total = rows.reduce((s, r) => s + (parseNumber(r.count) || 0), 0);
  const speed = distance && timeSec ? (sport === 'cykling' ? formatSpeed(distance, timeSec) : formatPace(distance, timeSec)) : '';
  const missing = SPORTS[sport].tpl.filter(([n, , u]) => u === 'reps' && !rows.some((r) => r.name.trim().toLowerCase() === n.toLowerCase())).map(([n]) => n);

  const pick = (s: Sport) => {
    buzz(6);
    setSport(s);
    if (!evPicked && auto) setEvId(ev0?.sport === s ? auto : '');
    if (sportMetric(s) === 'reps' && !rows.some((r) => r.name.trim() || r.count)) setRows(rowsFor(s));
    setStep(1);
  };
  const editRow = (id: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const stepRow = (r: Row, d: number) => { buzz(6); editRow(r.id, { count: String(Math.max(0, (parseNumber(r.count) || 0) + d)) }); };

  const draft = (): Draft | string => {
    const out: Draft = { reps: [] };
    if (metric === 'distance') {
      if (!distance || distance <= 0) return 'Skriv distancen';
      if (distance > 1000) return 'Distancen er for lang';
      out.distanceKm = Math.round(distance * 100) / 100;
    }
    if (metric === 'reps') {
      out.reps = rows.map((r) => ({ name: r.name.trim().slice(0, 40), count: Math.min(99999, Math.round(parseNumber(r.count) || 0)) })).filter((r) => r.name && r.count > 0).slice(0, 10);
    }
    if (metric === 'duration') {
      const m = parseNumber(mins);
      if (!m || m <= 0) return 'Skriv hvor længe';
      out.durationSec = Math.round(m * 60);
    } else if (time) {
      if (timeSec === null || Number.isNaN(timeSec)) return 'Ugyldig tid';
      out.durationSec = timeSec;
    }
    if (out.durationSec && out.durationSec > 48 * 3600) return 'Tiden er for lang';
    if (metric === 'reps' && !out.reps.length && !out.durationSec) return 'Tilføj reps';
    return out;
  };
  const current = draft();
  const activity = (d: Draft, extra: Partial<Activity> = {}): Activity => ({
    id: 'preview', uid: me?.id || '', kind: 'workout', sport, title: (title.trim() || suggested).slice(0, 80), text: text.trim().slice(0, 1000) || undefined,
    distanceKm: d.distanceKm, durationSec: d.durationSec, reps: d.reps, eventId: evId || undefined, photoURL: preview || undefined,
    createdAt: Date.now(), kudos: 0, comments: 0, ...extra,
  } as Activity);

  const next = () => {
    if (typeof current === 'string') { setErr(current); return; }
    (document.activeElement as HTMLElement | null)?.blur();
    setStep(2);
  };

  const save = async () => {
    if (!me || typeof current === 'string') { if (typeof current === 'string') { setErr(current); setStep(1); } return; }
    setBusy(true); setErr('');
    try {
      const photoURL = photo ? await api.uploadImage(me.id, 'activity', photo) : undefined;
      const a = activity(current, { photoURL });
      const id = await api.createActivity(me.id, {
        kind: 'workout', sport, title: a.title, text: a.text, distanceKm: a.distanceKm, durationSec: a.durationSec,
        reps: current.reps.length ? current.reps : undefined, eventId: a.eventId, photoURL,
      });
      buzz([20, 40, 20]);
      setDone({ ...a, id });
    } catch { setErr('Ikke delt. Prøv igen.'); }
    setBusy(false);
  };

  if (done) {
    return (
      <Sheet title="Delt" onClose={closeSheet}
        foot={<><button className="btn btn-outline" onClick={closeSheet}>Færdig</button><button className="btn btn-primary btn-grow" onClick={() => openSheet({ type: 'share-activity', activity: done })}><Icon name="insta" />Del som story</button></>}>
        <div className="wo-done">
          <span className="wo-done-ic"><Icon name="check" /></span>
          <p className="wo-done-sport">Community kan se den nu</p>
        </div>
        <ol className="feed wo-prev" inert><ActivityCard a={done} /></ol>
      </Sheet>
    );
  }

  const foot = step === 0
    ? <button className="btn btn-outline btn-wide" onClick={closeSheet}>Annullér</button>
    : (
      <>
        <button className="btn btn-outline" onClick={() => setStep((step - 1) as Step)}><Icon name="back" />Tilbage</button>
        {step === 1
          ? <button className="btn btn-primary btn-grow" onClick={next}>Næste<Icon name="chev" /></button>
          : <button className="btn btn-primary btn-grow" disabled={busy} onClick={save}><Icon name="users" />{busy ? 'Deler …' : 'Del'}</button>}
      </>
    );

  return (
    <Sheet title={SHARE_LABEL} onClose={closeSheet} foot={foot}>
      <div ref={body} className="wiz-head" aria-label={`${step + 1}/3: ${STEPS[step]}`}>
        <ol className="wiz-bar" aria-hidden="true">{STEPS.map((s, i) => <li key={s} className={i <= step ? 'on' : ''} />)}</ol>
        <p><b>{STEPS[step]}</b><span>{step + 1}/3</span></p>
      </div>
      <form className="wo" onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); }}>
        {step === 0 && (
          <div className="sport-grid" role="radiogroup" aria-label="Sport">
            {WORKOUT_SPORTS.map((s) => (
              <button type="button" key={s} role="radio" aria-checked={sport === s} className="sport-tile" onClick={() => pick(s)}>
                <Icon name={SPORT_ICON[s]} /><span>{sportLabel(s)}</span>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <>
            <button type="button" className="wo-sport" data-sport={sport} onClick={() => setStep(0)} aria-label={`Sport: ${sportLabel(sport)}. Skift`}>
              <span className="opt-ic"><Icon name={SPORT_ICON[sport]} /></span><b>{sportLabel(sport)}</b><span className="link">Skift</span>
            </button>

            {metric === 'distance' && (
              <div className="wo-hero">
                <label className="wo-big">
                  <input inputMode="decimal" autoComplete="off" enterKeyHint="done" aria-label="Distance i km" placeholder="0" value={km}
                    style={{ width: `${Math.max(1.4, km.length * 0.46 + 0.25)}em` }} onChange={(e) => setKm(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))} />
                  <span>km</span>
                </label>
                <div className="wo-stats">
                  <label className="wo-stat"><span>Tid</span><ClockInput digits={time} onChange={setTime} label="Tid" /></label>
                  <div className="wo-stat"><span>{sport === 'cykling' ? 'Fart' : 'Tempo'}</span><b className={speed ? '' : 'dim'}>{speed ? speed.replace(/ \/km| km\/t/, '') : '–'}</b></div>
                </div>
              </div>
            )}

            {metric === 'duration' && (
              <div className="wo-hero">
                <label className="wo-big">
                  <input inputMode="numeric" autoComplete="off" enterKeyHint="done" aria-label="Minutter" placeholder="0" value={mins}
                    style={{ width: `${Math.max(1.4, mins.length * 0.46 + 0.25)}em` }} onChange={(e) => setMins(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                  <span>min</span>
                </label>
                <div className="wo-quick">
                  {(MINUTES[sport] || []).map((m) => <button type="button" key={m} className="choice" aria-pressed={mins === String(m)} onClick={() => setMins(String(m))}>{m} min</button>)}
                </div>
              </div>
            )}

            {metric === 'reps' && (
              <>
                <div className="wo-hero">
                  <div className="wo-big"><b className={total ? '' : 'dim'}>{fmt(total)}</b><span>reps</span></div>
                </div>
                <div className="wo-ex-list">
                  {rows.map((r) => (
                    <div className="wo-ex" key={r.id}>
                      <input className="wo-ex-name" aria-label="Øvelse" placeholder="Øvelse" maxLength={40} value={r.name} onChange={(e) => editRow(r.id, { name: e.target.value })} />
                      <div className="wo-step">
                        <button type="button" aria-label={`Færre ${r.name}`} onClick={() => stepRow(r, -STEP)}>−</button>
                        <input inputMode="numeric" autoComplete="off" enterKeyHint="done" aria-label={`Antal ${r.name}`} placeholder="0" value={r.count}
                          onChange={(e) => editRow(r.id, { count: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
                        <button type="button" aria-label={`Flere ${r.name}`} onClick={() => stepRow(r, STEP)}>+</button>
                      </div>
                      <button type="button" className="icon-btn wo-ex-del" aria-label={`Fjern ${r.name || 'øvelse'}`} onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))}><Icon name="close" /></button>
                    </div>
                  ))}
                  {rows.length < 10 && (
                    <div className="wo-add">
                      {missing.map((n) => <button type="button" key={n} className="choice" onClick={() => setRows((x) => [...x, { id: newId('r'), name: n, count: '' }])}><Icon name="plus" />{n}</button>)}
                      <button type="button" className="choice" onClick={() => setRows((x) => [...x, { id: newId('r'), name: '', count: '' }])}><Icon name="plus" />Øvelse</button>
                    </div>
                  )}
                </div>
                <div className="wo-stats one">
                  <label className="wo-stat"><span>Tid</span><ClockInput digits={time} onChange={setTime} label="Tid" /></label>
                </div>
              </>
            )}
          </>
        )}

        {step === 2 && typeof current !== 'string' && (
          <>
            <ol className="feed wo-prev" inert><ActivityCard a={activity(current)} /></ol>
            <div className="wo-card">
              <input aria-label="Titel" maxLength={80} placeholder={suggested} value={title} onChange={(e) => setTitle(e.target.value)} enterKeyHint="done" />
              <textarea aria-label="Besked" rows={2} maxLength={1000} placeholder="Skriv til community" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="wo-extras">
              {preview ? (
                <button type="button" className="wo-extra on" onClick={() => setPhoto(null)}><Icon name="close" />Fjern billede</button>
              ) : (
                <label className="wo-extra">
                  <Icon name="camera" />Billede
                  <input type="file" accept="image/*" aria-label="Vælg billede" onChange={async (e) => {
                    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
                    try { setErr(''); setPhoto(await compressImage(f)); } catch { setErr('Billedet kunne ikke læses'); }
                  }} />
                </label>
              )}
              {(near.length > 0 || evId) && (
                <label className={'wo-extra sel' + (evId ? ' on' : '')}>
                  <Icon name="cal" />
                  <select aria-label="Event" value={evId} onChange={(e) => { setEvId(e.target.value); setEvPicked(true); }}>
                    <option value="">Event</option>
                    {near.map((e) => <option key={e.id} value={e.id}>{e.title} · {relDay(e)}{e.time ? ' ' + e.time : ''}</option>)}
                  </select>
                </label>
              )}
            </div>
          </>
        )}
        {err && <p className="form-err" role="alert">{err}</p>}
      </form>
    </Sheet>
  );
}
