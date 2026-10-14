import { useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, RepLine, Sport } from '../api/types';
import { useApp } from '../state';
import { SPORTS, WORKOUT_SPORTS, activityStats, sportLabel, sportMetric } from '../lib/sports';
import { fmt, formatPace, formatSpeed, newId, parseNumber } from '../lib/format';
import { dateOf, isPast, relDay, startOf, todayStr } from '../lib/dates';
import { compressImage } from '../lib/image';
import { buzz } from '../lib/platform';
import { Sheet } from './Sheet';
import { Icon, SPORT_ICON } from './Icon';

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

export function WorkoutSheet({ eventId }: { eventId?: string }) {
  const { api, me, events, myRsvps, closeSheet, openSheet, eventById } = useApp();
  const near = useMemo(() => events
    .filter((e) => Math.abs((dateOf(e.date)?.getTime() || 0) - Date.now()) < 10 * 864e5 && (myRsvps.has(e.id) || !isPast(e)))
    .slice(0, 25), [events, myRsvps]);
  const auto = useMemo(() => eventId || events.find((e) => myRsvps.has(e.id) && !e.cancelled && e.date === todayStr() && (startOf(e)?.getTime() ?? Infinity) <= Date.now())?.id || '', []);
  const ev0 = eventById(auto);
  const first: Sport = ev0 && WORKOUT_SPORTS.includes(ev0.sport) ? ev0.sport : 'lob';

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
  const sports = useRef<HTMLDivElement>(null);
  useEffect(() => { sports.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, []);

  const metric = sportMetric(sport);
  const suggested = autoTitle(sport);
  const distance = parseNumber(km);
  const timeSec = clockSeconds(time);
  const total = rows.reduce((s, r) => s + (parseNumber(r.count) || 0), 0);
  const speed = distance && timeSec ? (sport === 'cykling' ? formatSpeed(distance, timeSec) : formatPace(distance, timeSec)) : '';
  const missing = SPORTS[sport].tpl.filter(([n, , u]) => u === 'reps' && !rows.some((r) => r.name.trim().toLowerCase() === n.toLowerCase())).map(([n]) => n);

  const pick = (s: Sport) => {
    setSport(s); setErr('');
    if (!evPicked && auto) setEvId(ev0?.sport === s ? auto : '');
    if (sportMetric(s) === 'reps' && !rows.some((r) => r.name.trim() || r.count)) setRows(rowsFor(s));
  };
  const editRow = (id: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const stepRow = (r: Row, d: number) => { buzz(6); editRow(r.id, { count: String(Math.max(0, (parseNumber(r.count) || 0) + d)) }); };

  const save = async () => {
    if (!me) return;
    let distanceKm: number | undefined, durationSec: number | undefined;
    let lines: RepLine[] = [];
    if (metric === 'distance') {
      if (!distance || distance <= 0) { setErr('Skriv distancen'); return; }
      if (distance > 1000) { setErr('Distancen er for lang'); return; }
      distanceKm = Math.round(distance * 100) / 100;
    }
    if (metric === 'reps') {
      lines = rows.map((r) => ({ name: r.name.trim().slice(0, 40), count: Math.min(99999, Math.round(parseNumber(r.count) || 0)) })).filter((r) => r.name && r.count > 0).slice(0, 10);
    }
    if (metric === 'duration') {
      const m = parseNumber(mins);
      if (!m || m <= 0) { setErr('Skriv hvor længe'); return; }
      durationSec = Math.round(m * 60);
    } else if (time) {
      if (timeSec === null || Number.isNaN(timeSec)) { setErr('Ugyldig tid'); return; }
      durationSec = timeSec;
    }
    if (durationSec && durationSec > 48 * 3600) { setErr('Tiden er for lang'); return; }
    if (metric === 'reps' && !lines.length && !durationSec) { setErr('Tilføj reps'); return; }
    setBusy(true); setErr('');
    try {
      const photoURL = photo ? await api.uploadImage(me.id, 'activity', photo) : undefined;
      const name = (title.trim() || suggested).slice(0, 80);
      const data = { kind: 'workout' as const, sport, title: name, text: text.trim().slice(0, 1000) || undefined, distanceKm, durationSec, reps: lines.length ? lines : undefined, eventId: evId || undefined, photoURL };
      const id = await api.createActivity(me.id, data);
      buzz([20, 40, 20]);
      setDone({ ...data, id, uid: me.id, kind: 'workout', reps: lines, createdAt: Date.now(), kudos: 0, comments: 0 } as Activity);
    } catch { setErr('Ikke delt. Prøv igen.'); }
    setBusy(false);
  };

  if (done) {
    const stats = activityStats(done);
    return (
      <Sheet title="Delt" onClose={closeSheet}
        foot={<><button className="btn btn-outline" onClick={closeSheet}>Færdig</button><button className="btn btn-primary btn-grow" onClick={() => openSheet({ type: 'share-activity', activity: done })}><Icon name="insta" />Del som story</button></>}>
        <div className="wo-done">
          <span className="wo-done-ic"><Icon name="check" /></span>
          <h3 className="wo-done-title">{done.title}</h3>
          <p className="wo-done-sport"><Icon name={SPORT_ICON[done.sport || 'andet']} />{sportLabel(done.sport)}</p>
          {stats.length > 0 && <div className="tiles">{stats.map((s) => <div className="tile" key={s.label}><b>{s.value}</b><span>{s.label}</span></div>)}</div>}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Del træning" onClose={closeSheet}
      foot={<button className="btn btn-primary btn-wide" disabled={busy} onClick={save}>{busy ? 'Deler …' : 'Del'}</button>}>
      <form className="wo" onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); }}>
        <div className="sport-row" ref={sports} role="radiogroup" aria-label="Sport">
          {WORKOUT_SPORTS.map((s) => (
            <button type="button" key={s} role="radio" aria-checked={sport === s} className="sport-tile" onClick={() => pick(s)}>
              <Icon name={SPORT_ICON[s]} /><span>{sportLabel(s)}</span>
            </button>
          ))}
        </div>

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

        <div className="wo-card">
          <input aria-label="Titel" maxLength={80} placeholder={suggested} value={title} onChange={(e) => setTitle(e.target.value)} enterKeyHint="done" />
          <textarea aria-label="Note" rows={2} maxLength={1000} placeholder="Hvordan gik det?" value={text} onChange={(e) => setText(e.target.value)} />
        </div>

        {preview ? (
          <div className="wo-photo has">
            <img src={preview} alt="" />
            <button type="button" className="wo-photo-x" aria-label="Fjern billede" onClick={() => setPhoto(null)}><Icon name="close" /></button>
          </div>
        ) : (
          <label className="wo-photo">
            <Icon name="camera" /><span>Tilføj billede</span>
            <input type="file" accept="image/*" aria-label="Vælg billede" onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
              try { setErr(''); setPhoto(await compressImage(f)); } catch { setErr('Billedet kunne ikke læses'); }
            }} />
          </label>
        )}

        {(near.length > 0 || evId) && (
          <label className="wo-row">
            <Icon name="cal" /><span>Event</span>
            <select value={evId} onChange={(e) => { setEvId(e.target.value); setEvPicked(true); }}>
              <option value="">Intet</option>
              {near.map((e) => <option key={e.id} value={e.id}>{e.title} · {relDay(e)}{e.time ? ' ' + e.time : ''}</option>)}
            </select>
          </label>
        )}
        {err && <p className="form-err" role="alert">{err}</p>}
      </form>
    </Sheet>
  );
}
