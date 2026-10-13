import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AddressHit, EventDoc, EventInput, Exercise, GeoPlace, PhotoPolicy, Sport, Unit } from '../api/types';
import { useApp } from '../state';
import { SPORTS, SPORT_ORDER, UNITS, sportLabel } from '../lib/sports';
import { newId, pad, parseNumber } from '../lib/format';
import { DAYS, DAYS_S, MONTHS_S, cap, dateOf, endTime, isPast, todayStr, ymd } from '../lib/dates';
import { compressImage } from '../lib/image';
import { placeText } from '../lib/address';
import { reducedMotion } from '../lib/platform';
import { Sheet } from './Sheet';
import { Icon, type IconName } from './Icon';
import { Avatar, Switch } from './bits';
import { EventSlot } from './EventCards';
import { PlacePicker } from './Weather';
import { TimeWheel } from './TimeWheel';

const SPORT_ICON: Record<Sport, IconName> = {
  calisthenics: 'bar', fitness: 'dumbbell', lob: 'shoe', cykling: 'bike', gang: 'walk', yoga: 'lotus', vinterbadning: 'wave', socialt: 'pizza', andet: 'star',
};
const STEPS = ['Hvad og hvornår', 'Sted og program', 'Hvem kan komme'] as const;
type Step = 0 | 1 | 2;
type TimeMode = 'allday' | 'time';
const DURATIONS: [number, string][] = [[30, '30 min'], [45, '45 min'], [60, '1 t'], [90, '1½ t'], [120, '2 t'], [180, '3 t']];
type Deadline = 'none' | 'hour' | 'evening' | 'custom';
type Row = { id: string; name: string; target: string; unit: Unit };

const tplFor = (sport: Sport): Row[] => SPORTS[sport].tpl.map(([name, target, unit]) => ({ id: newId('x'), name, target: String(target), unit }));

export function suggestTitle(sport: Sport, date: string, time: string): string {
  const d = dateOf(date);
  if (sport === 'lob' && d) return `${cap(DAYS[d.getDay()])}sløb`;
  if (sport === 'fitness' && /^0[0-8]:/.test(time)) return 'Morgenfitness';
  return sportLabel(sport);
}

function deadlineOf(kind: Deadline, date: string, time: string, customDate: string, customTime: string): number | null {
  if (kind === 'none') return null;
  if (kind === 'hour') { const d = new Date(`${date}T${time}`); return Number.isNaN(d.getTime()) ? null : d.getTime() - 36e5; }
  if (kind === 'evening') { const d = dateOf(date); if (!d) return null; d.setDate(d.getDate() - 1); d.setHours(20, 0, 0, 0); return d.getTime(); }
  const d = new Date(`${customDate}T${customTime || '23:59'}`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function EventForm({ event }: { event?: EventDoc }) {
  const { api, me, isAdmin, closeSheet, toast, team, events } = useApp();
  const nav = useNavigate();
  const isNew = !event;
  const [step, setStep] = useState<Step>(0);
  const [sport, setSport] = useState<Sport>(event?.sport || 'calisthenics');
  const [title, setTitle] = useState(event?.title || '');
  const [official, setOfficial] = useState(event ? event.official : isAdmin);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return ymd(d); }), []);
  const [date, setDate] = useState(event?.date || '');
  const [dateOther, setDateOther] = useState(!!event && !days.includes(event.date));
  const [timeMode, setTimeMode] = useState<TimeMode>(event && !event.time ? 'allday' : 'time');
  const [time, setTime] = useState(event?.time || '17:30');
  const [duration, setDuration] = useState<number>(event?.duration || 60);
  const [place, setPlace] = useState(event?.place || '');
  const [geo, setGeo] = useState<GeoPlace | null>(event?.geo || null);
  const [note, setNote] = useState(event?.note || '');
  const [rows, setRows] = useState<Row[]>(event ? event.exercises.map((x) => ({ id: x.id, name: x.name, target: String(x.target), unit: x.unit })) : tplFor('calisthenics'));
  const [withProgram, setWithProgram] = useState(event ? event.exercises.length > 0 : true);
  const [touched, setTouched] = useState(!isNew);
  const [newPhotos, setNewPhotos] = useState<Blob[]>([]);
  const [capOn, setCapOn] = useState(!!event?.capacity);
  const [capN, setCapN] = useState(String(event?.capacity || 12));
  const start0 = event ? new Date(`${event.date}T${event.time || '00:00'}`).getTime() : 0;
  const eve0 = event ? deadlineOf('evening', event.date, '', '', '') : null;
  const [deadline, setDeadline] = useState<Deadline>(!event?.signupUntil ? 'none' : event.time && event.signupUntil === start0 - 36e5 ? 'hour' : event.signupUntil === eve0 ? 'evening' : 'custom');
  const until0 = event?.signupUntil ? new Date(event.signupUntil) : null;
  const [untilDate, setUntilDate] = useState(until0 ? ymd(until0) : '');
  const [untilTime, setUntilTime] = useState(until0 ? `${pad(until0.getHours())}:${pad(until0.getMinutes())}` : '');
  const [photoPolicy, setPhotoPolicy] = useState<PhotoPolicy>(event?.photoPolicy || 'all');
  const [cohosts, setCohosts] = useState<string[]>(event?.cohosts || []);
  const owner = event ? event.createdBy : me?.id || '';
  const cohostsLocked = !!event && event.createdBy !== me?.id && !isAdmin;
  const [repeat, setRepeat] = useState(isNew ? 1 : 0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const recentPlaces = useMemo(() => {
    const n = new Map<string, number>();
    events.forEach((e) => { const p = e.place.trim(); if (p) n.set(p, (n.get(p) || 0) + 1); });
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 6);
  }, [events]);

  useEffect(() => { setErr(''); document.querySelector('.sheet-body')?.scrollTo(0, 0); }, [step]);

  const effTime = timeMode === 'time' ? time : '';
  const suggested = suggestTitle(sport, date, effTime);
  const hasProgram = withProgram && sport !== 'socialt';

  const pickSport = (s: Sport) => {
    setSport(s);
    if (!touched) { setRows(tplFor(s)); setWithProgram(SPORTS[s].tpl.length > 0); }
  };
  const editRow = (id: string, patch: Partial<Row>) => { setTouched(true); setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x))); };
  const setAllDay = (on: boolean) => { setTimeMode(on ? 'allday' : 'time'); if (on && deadline === 'hour') setDeadline('evening'); };
  const pickAddress = (a: AddressHit) => { setPlace(placeText(a)); setGeo({ name: (a.town || a.name).slice(0, 60), lat: a.lat, lon: a.lon }); };

  const check = (upTo: Step): { step: Step; msg: string; exercises?: Exercise[]; cap?: number | null; until?: number | null } | null => {
    if (!dateOf(date)) return { step: 0, msg: 'Vælg en dato.' };
    const year = Number(date.slice(0, 4)), thisYear = new Date().getFullYear();
    if (year < thisYear - 1 || year > thisYear + 2) return { step: 0, msg: 'Vælg en dato inden for de næste par år.' };
    if (isNew && date < todayStr()) return { step: 0, msg: 'Datoen er passeret. Vælg i dag eller senere.' };
    if (timeMode === 'time' && !/^\d{1,2}:\d{2}$/.test(time)) return { step: 0, msg: 'Skriv et tidspunkt, fx 17:30.' };
    if (upTo === 0) return null;
    const exercises: Exercise[] = [];
    if (hasProgram) {
      for (const r of rows) {
        const name = r.name.trim(); const raw = parseNumber(r.target);
        if (!name && !r.target.trim()) continue;
        if (!name) return { step: 1, msg: 'Giv hver øvelse et navn.' };
        const target = raw ? Math.round(raw * 100) / 100 : 0;
        if (!target || target <= 0) return { step: 1, msg: `Sæt et mål for ${name}.` };
        if (target > 99999) return { step: 1, msg: `Målet for ${name} er for stort.` };
        exercises.push({ id: r.id, name: name.slice(0, 40), target, unit: r.unit });
      }
      if (exercises.length > 8) return { step: 1, msg: 'Et program kan højst have 8 øvelser.' };
    }
    if (upTo === 1) return null;
    const c = capOn ? Math.round(parseNumber(capN) || 0) : null;
    if (capOn && (!c || c < 1 || c > 5000)) return { step: 2, msg: 'Skriv et antal pladser mellem 1 og 5000.' };
    if (event && c && c < event.going.length && (!event.capacity || c < event.capacity)) return { step: 2, msg: `${event.going.length} er allerede tilmeldt, så der skal være mindst ${event.going.length} pladser.` };
    const until = deadlineOf(deadline, date, effTime, untilDate, untilTime);
    if (deadline !== 'none' && until === null) return { step: 2, msg: 'Vælg en dato for, hvornår tilmeldingen lukker.' };
    if (until !== null) {
      const start = new Date(`${date}T${effTime || '23:59'}`).getTime();
      if (until > start) return { step: 2, msg: 'Tilmeldingen skal lukke, før eventet starter. Vælg et tidligere tidspunkt.' };
      if (isNew && until <= Date.now()) return { step: 2, msg: 'Fristen for tilmelding er allerede passeret. Vælg en senere frist.' };
    }
    return { step: 2, msg: '', exercises, cap: c, until };
  };

  const next = () => {
    const p = check(step);
    if (p && p.msg) { setErr(p.msg); if (p.step !== step) setStep(p.step); return; }
    setStep((step + 1) as Step);
  };

  const save = async () => {
    if (!me) return;
    const p = check(2);
    if (!p || p.msg) { if (p) { setErr(p.msg); if (isNew && p.step !== step) setStep(p.step); } return; }
    const signupUntil = p.until ?? null;
    const data: EventInput = {
      title: (title.trim() || suggested).slice(0, 60), sport, official: isAdmin ? official : (event?.official ?? false),
      date, time: effTime, duration: effTime ? duration : null, place: place.trim().slice(0, 80), note: note.trim().slice(0, 500), exercises: p.exercises || [],
      capacity: p.cap ?? null, signupUntil, photoPolicy, geo, cohosts: cohosts.filter((u) => u !== owner).slice(0, 5),
    };
    const shifted = (i: number) => (signupUntil ? signupUntil + i * 7 * 864e5 : null);
    const upload = async (eventId: string) => {
      let failed = 0;
      for (let i = 0; i < newPhotos.length; i++) {
        setProgress(`Lægger billeder op ${i + 1}/${newPhotos.length} …`);
        try { await api.addEventPhoto(eventId, me.id, newPhotos[i], true); } catch { failed++; }
      }
      setProgress('');
      if (failed) toast(`${failed} billede${failed > 1 ? 'r' : ''} blev ikke lagt op`, { body: 'Prøv igen under Billeder på eventet.' });
    };
    setBusy(true); setErr('');
    try {
      if (event) {
        await api.updateEvent(event.id, data, me.id);
        const seriesId = newId('s');
        for (let i = 1; i <= repeat; i++) { const d = dateOf(date)!; d.setDate(d.getDate() + 7 * i); await api.createEvent(me.id, { ...data, signupUntil: shifted(i), official: isAdmin ? data.official : false, date: ymd(d), coachId: isAdmin ? event.coachId : me.id, seriesId, seriesIndex: i }); }
        await upload(event.id);
        closeSheet(); toast(repeat ? `Gemt og kopieret til ${repeat} uger mere` : 'Ændringerne er gemt');
      } else {
        let first = '';
        const seriesId = repeat > 1 ? newId('s') : undefined;
        for (let i = 0; i < Math.max(1, repeat); i++) { const d = dateOf(date)!; d.setDate(d.getDate() + 7 * i); const id = await api.createEvent(me.id, { ...data, signupUntil: shifted(i), date: ymd(d), ...(seriesId ? { seriesId, seriesIndex: i } : {}) }); if (!first) first = id; }
        await upload(first);
        closeSheet();
        toast(repeat > 1 ? `${repeat} events er oprettet` : 'Eventet er oprettet', { body: data.official ? 'Hele holdet får besked.' : 'Dem der følger dig får besked.' });
        nav(`/e/${first}`);
      }
    } catch { setErr('Eventet blev ikke gemt. Tjek forbindelsen og prøv igen.'); setBusy(false); setProgress(''); }
  };
  const setCancelled = async (on: boolean) => {
    if (!event || !me) return;
    setBusy(true); setErr('');
    try {
      await api.setCancelled(event.id, me.id, on, cancelNote);
      const told = event.going.length + event.waitlist.length > (event.going.includes(me.id) ? 1 : 0);
      closeSheet();
      toast(on ? 'Eventet er aflyst' : 'Eventet er genåbnet', { body: told ? 'Alle tilmeldte har fået besked.' : on ? 'Ingen var tilmeldt endnu.' : 'Folk kan tilmelde sig igen.' });
    } catch { setErr(on ? 'Eventet blev ikke aflyst. Prøv igen.' : 'Eventet blev ikke genåbnet. Prøv igen.'); setBusy(false); }
  };
  const remove = async () => {
    if (!event) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    try { await api.deleteEvent(event.id); closeSheet(); nav('/events'); toast('Eventet er slettet'); } catch { setErr('Eventet blev ikke slettet.'); }
  };

  const show = (s: Step) => !isNew || step === s;
  const capNum = Math.max(1, Math.min(5000, Math.round(parseNumber(capN) || 0)));
  const foot = isNew ? (
    <>
      {step === 0
        ? <button className="btn btn-outline" onClick={closeSheet}>Annullér</button>
        : <button className="btn btn-outline" onClick={() => setStep((step - 1) as Step)}><Icon name="back" />Tilbage</button>}
      {step < 2
        ? <button className="btn btn-primary btn-grow" onClick={next}>Næste<Icon name="chev" /></button>
        : <button className="btn btn-primary btn-grow" disabled={busy} onClick={save}>{progress || (repeat > 1 ? `Opret ${repeat} events` : 'Opret event')}</button>}
    </>
  ) : (
    <><button className="btn btn-outline" onClick={closeSheet}>Annullér</button><button className="btn btn-primary btn-grow" disabled={busy} onClick={save}>{progress || 'Gem ændringer'}</button></>
  );

  return (
    <Sheet title={isNew ? 'Opret event' : 'Rediger event'} onClose={closeSheet} foot={foot}>
      {isNew && (
        <div className="wiz-head" aria-label={`Trin ${step + 1} af 3: ${STEPS[step]}`}>
          <ol className="wiz-bar" aria-hidden="true">{STEPS.map((s, i) => <li key={s} className={i <= step ? 'on' : ''} />)}</ol>
          <p><b>{STEPS[step]}</b><span>Trin {step + 1} af 3</span></p>
        </div>
      )}
      <form className="form ev-form" onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); }}>
        {show(0) && (
          <>
            {!isNew && <h3 className="form-sec">Hvad og hvornår</h3>}
            {isAdmin ? (
              <div className="toggle-line">
                <div><b>{official ? 'OFFICIAL EVENT' : 'COMMUNITY MADE EVENT'}</b><span>{official ? 'Fra Outdoor Office. Hele holdet får besked.' : 'Vises som community-event. Dem der følger dig får besked.'}</span></div>
                <Switch on={official} onChange={setOfficial} label="Officielt event" />
              </div>
            ) : null}
            <fieldset><legend>Hvad skal I lave?</legend>
              <div className="sport-grid">
                {SPORT_ORDER.map((s) => (
                  <button type="button" key={s} className="sport-tile" aria-pressed={sport === s} onClick={() => pickSport(s)}>
                    <Icon name={SPORT_ICON[s]} /><span>{sportLabel(s)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="field"><label htmlFor="f-title">Navn på eventet</label>
              <input id="f-title" maxLength={60} value={title} placeholder={suggested} onChange={(e) => setTitle(e.target.value)} autoComplete="off" enterKeyHint="done" />
            </div>
            <fieldset><legend>Dag</legend>
              <div className="day-strip" role="radiogroup" aria-label="Dag">
                {days.map((d, i) => {
                  const dt = dateOf(d)!;
                  return (
                    <button type="button" key={d} role="radio" aria-checked={!dateOther && date === d} className="day-chip" onClick={() => { setDate(d); setDateOther(false); }}
                      aria-label={i === 0 ? 'I dag' : i === 1 ? 'I morgen' : `${DAYS[dt.getDay()]} ${dt.getDate()}. ${MONTHS_S[dt.getMonth()]}`}>
                      <span>{i === 0 ? 'I dag' : i === 1 ? 'I morgen' : DAYS_S[dt.getDay()]}</span><b>{dt.getDate()}</b><span>{MONTHS_S[dt.getMonth()]}</span>
                    </button>
                  );
                })}
                <button type="button" role="radio" aria-checked={dateOther} className="day-chip other" onClick={() => setDateOther(true)}><Icon name="cal" /><span>Anden dag</span></button>
              </div>
              {dateOther && <div className="field" style={{ marginTop: 10 }}><label className="sr" htmlFor="f-date">Dato</label><input id="f-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
            </fieldset>
            <fieldset><legend>Tidspunkt</legend>
              <div className="seg" role="radiogroup" aria-label="Tidspunkt" style={{ marginBottom: 0 }}>
                <button type="button" role="radio" aria-checked={timeMode === 'time'} onClick={() => setAllDay(false)}>Klokkeslæt</button>
                <button type="button" role="radio" aria-checked={timeMode === 'allday'} onClick={() => setAllDay(true)}>Hele dagen</button>
              </div>
              {timeMode === 'time' && <TimeWheel value={time} onChange={setTime} />}
              {timeMode === 'time' && (
                <div className="dur-row">
                  <span className="flabel">Varighed</span>
                  <div className="time-chips" role="radiogroup" aria-label="Varighed">
                    {DURATIONS.map(([m, t]) => <button type="button" key={m} role="radio" className="choice" aria-checked={duration === m} onClick={() => setDuration(m)}>{t}</button>)}
                  </div>
                  <span className="dur-end">Slutter {endTime({ time, duration })}</span>
                </div>
              )}
            </fieldset>
          </>
        )}

        {show(1) && (
          <>
            {!isNew && <h3 className="form-sec">Sted og program</h3>}
            <AddressField value={place} onChange={setPlace} onPick={pickAddress} recent={recentPlaces} near={geo || team.weather} />
            <PlacePicker value={geo} onChange={setGeo} fallback={team.weather} />
            <div className="field"><label htmlFor="f-note">Besked til deltagerne</label><textarea id="f-note" rows={2} maxLength={500} value={note} placeholder="Fx tag handsker med til pull-ups" onChange={(e) => setNote(e.target.value)} /></div>
            {sport !== 'socialt' && (
              <fieldset>
                <div className="toggle-line plain">
                  <div><b>Program</b><span>{hasProgram ? 'Deltagerne logger deres reps mod målet, og holdet følger med live.' : 'Uden program kan folk stadig tilmelde sig og checke ind.'}</span></div>
                  <Switch on={hasProgram} onChange={(v) => { setWithProgram(v); setTouched(true); if (v && !rows.length) setRows(tplFor(sport).length ? tplFor(sport) : [{ id: newId('x'), name: '', target: '', unit: 'reps' }]); }} label="Program" />
                </div>
                {hasProgram && (
                  <div className="ex-list">
                    {rows.map((r) => (
                      <div className="ex-row" key={r.id}>
                        <input id={`exn-${r.id}`} aria-label="Øvelse" placeholder="Øvelse" maxLength={40} value={r.name} onChange={(e) => editRow(r.id, { name: e.target.value })} />
                        <input id={`ext-${r.id}`} aria-label="Mål" placeholder="Mål" inputMode="decimal" value={r.target} onChange={(e) => editRow(r.id, { target: e.target.value })} />
                        <select id={`exu-${r.id}`} aria-label="Enhed" value={r.unit} onChange={(e) => editRow(r.id, { unit: e.target.value as Unit })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                        <button type="button" className="icon-btn ex-del" aria-label="Fjern øvelse" onClick={() => { setTouched(true); setRows((x) => x.filter((y) => y.id !== r.id)); }}><Icon name="close" /></button>
                      </div>
                    ))}
                    {rows.length < 8 && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setTouched(true); setRows((x) => [...x, { id: newId('x'), name: '', target: '', unit: 'reps' }]); }}><Icon name="plus" />Tilføj øvelse</button>}
                  </div>
                )}
              </fieldset>
            )}
            <fieldset><legend>Billeder (valgfrit)</legend>
              <p className="prog-note">Vises øverst på eventet, så folk kan se, hvad de melder sig til.{event && event.photoCount ? ` Eventet har ${event.photoCount} billede${event.photoCount > 1 ? 'r' : ''}; dem sletter du under Billeder.` : ''}</p>
              <MultiPhotoPicker blobs={newPhotos} setBlobs={setNewPhotos} />
            </fieldset>
          </>
        )}

        {show(2) && (
          <>
            {!isNew && <h3 className="form-sec">Hvem kan komme</h3>}
            <fieldset>
              <div className="toggle-line plain">
                <div><b>Begræns antal pladser</b><span>{capOn ? 'Når eventet er fuldt, kommer nye på venteliste og rykker ind, hvis nogen melder fra.' : 'Alle kan tilmelde sig.'}</span></div>
                <Switch on={capOn} onChange={setCapOn} label="Begræns antal pladser" />
              </div>
              {capOn && (
                <div className="stepper" role="group" aria-label="Antal pladser">
                  <button type="button" className="btn btn-outline btn-sq" aria-label="Færre pladser" onClick={() => setCapN(String(Math.max(1, capNum - 1)))}>−</button>
                  <input id="f-cap" inputMode="numeric" aria-label="Antal pladser" value={capN} onChange={(e) => setCapN(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} />
                  <button type="button" className="btn btn-outline btn-sq" aria-label="Flere pladser" onClick={() => setCapN(String(Math.min(5000, capNum + 1)))}>+</button>
                  <span className="stepper-unit">pladser</span>
                </div>
              )}
            </fieldset>
            <fieldset><legend>Tilmeldingen lukker</legend>
              <div className="time-chips" role="radiogroup" aria-label="Tilmeldingen lukker">
                <button type="button" role="radio" className="choice" aria-checked={deadline === 'none'} onClick={() => setDeadline('none')}>Når det starter</button>
                {timeMode === 'time' && <button type="button" role="radio" className="choice" aria-checked={deadline === 'hour'} onClick={() => setDeadline('hour')}>1 time før</button>}
                <button type="button" role="radio" className="choice" aria-checked={deadline === 'evening'} onClick={() => setDeadline('evening')}>Aftenen før kl. 20</button>
                <button type="button" role="radio" className="choice" aria-checked={deadline === 'custom'} onClick={() => { setDeadline('custom'); if (!untilDate) setUntilDate(date); }}>Vælg</button>
              </div>
              {deadline === 'custom' && (
                <div className="row2" style={{ marginTop: 10 }}>
                  <div className="field"><label htmlFor="f-until">Dato</label><input id="f-until" type="date" value={untilDate} max={date || undefined} onChange={(e) => setUntilDate(e.target.value)} /></div>
                  <div className="field"><label htmlFor="f-until-t">Klokken</label><input id="f-until-t" type="time" value={untilTime} onChange={(e) => setUntilTime(e.target.value)} /></div>
                </div>
              )}
            </fieldset>
            <fieldset><legend>Billeder fra deltagerne</legend>
              <div className="choices sm" role="radiogroup" aria-label="Billeder fra deltagerne">
                <button type="button" className="choice" role="radio" aria-checked={photoPolicy === 'all'} onClick={() => setPhotoPolicy('all')}>Alle kan dele</button>
                <button type="button" className="choice" role="radio" aria-checked={photoPolicy === 'host'} onClick={() => setPhotoPolicy('host')}>Kun arrangørerne</button>
              </div>
            </fieldset>
            <fieldset><legend>Medarrangører (valgfrit)</legend>
              <CohostPicker value={cohosts} onChange={setCohosts} owner={owner} locked={cohostsLocked} />
            </fieldset>
            <fieldset><legend>{isNew ? 'Gentag' : 'Kopiér til de næste uger'}</legend>
              <div className="choices sm" role="radiogroup" aria-label={isNew ? 'Gentag' : 'Kopiér til de næste uger'}>
                {(isNew ? [[1, 'Kun denne gang'], [4, 'Hver uge i 4 uger'], [8, '8 uger'], [12, '12 uger']] as const : [[0, 'Ingen kopier'], [4, '4 uger'], [8, '8 uger'], [12, '12 uger']] as const).map(([v, l]) => (
                  <button type="button" key={v} className="choice" role="radio" aria-checked={repeat === v} onClick={() => setRepeat(v)}>{l}</button>
                ))}
              </div>
            </fieldset>
            {isNew && (
              <div className="preview">
                <p className="flabel">Sådan ser det ud</p>
                {!isAdmin && <p className="prog-note">Dit event bliver vist som COMMUNITY MADE EVENT. Alle kan tilmelde sig, og dem der følger dig får besked.</p>}
                <EventSlot preview ev={{
                  id: 'preview', title: title.trim() || suggested, sport, official: isAdmin ? official : false, createdBy: me?.id || '', coachId: me?.id || null,
                  date, time: effTime, duration: effTime ? duration : null, place: place.trim(), note: '', exercises: [], createdAt: 0, going: [], goingCount: 0,
                  capacity: capOn && capNum > 0 ? capNum : null, signupUntil: null, photoPolicy, waitlist: [], photoCount: 0, cover: null,
                  cancelled: false, cancelNote: '', geo, checkinFrom: null, checkinUntil: null, cohosts: [], feedbackCount: 0, feedbackSum: 0,
                }} />
              </div>
            )}
          </>
        )}

        {event && !isPast(event) && (
          <fieldset className="cancel-box"><legend>Aflys</legend>
            {event.cancelled ? (
              <>
                <p className="prog-note">Eventet er aflyst{event.cancelNote ? `: ${event.cancelNote}` : '.'} Genåbner du det, kan folk tilmelde sig igen, og de tilmeldte får besked.</p>
                <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setCancelled(false)}><Icon name="refresh" />Genåbn eventet</button>
              </>
            ) : cancelOpen ? (
              <>
                <div className="field"><label htmlFor="f-cancel">Besked til deltagerne (valgfrit)</label>
                  <textarea id="f-cancel" rows={2} maxLength={200} value={cancelNote} placeholder="Fx Aflyst pga. storm. Vi tager den næste søndag." onChange={(e) => setCancelNote(e.target.value)} /></div>
                <p className="prog-note">Eventet bliver stående som aflyst, og alle tilmeldte og dem på ventelisten får besked med det samme.</p>
                <div className="row-btns">
                  <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => setCancelled(true)}><Icon name="ban" />Aflys og giv besked</button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setCancelOpen(false)}>Fortryd</button>
                </div>
              </>
            ) : (
              <button type="button" className="btn btn-quiet danger btn-sm" onClick={() => setCancelOpen(true)}><Icon name="ban" />Aflys eventet</button>
            )}
          </fieldset>
        )}
        {!isNew && (isAdmin || event?.createdBy === me?.id) && <div><button type="button" className={'btn btn-quiet danger' + (confirmDel ? ' confirm' : '')} onClick={remove}><Icon name="trash" />{confirmDel ? 'Tryk igen for at slette' : 'Slet event'}</button></div>}
        <p className="form-err" role="alert">{err}</p>
      </form>
    </Sheet>
  );
}

function CohostPicker({ value, onChange, owner, locked }: { value: string[]; onChange: (v: string[]) => void; owner: string; locked: boolean }) {
  const { users, shownName } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const matches = needle ? [...users.values()].filter((u) => u.id !== owner && !value.includes(u.id) && u.name.toLowerCase().includes(needle)).slice(0, 6) : [];
  return (
    <div className="cohosts">
      {value.length > 0 && (
        <ul className="cohost-chips">
          {value.map((u) => (
            <li key={u}><Avatar uid={u} size="xs" /><span>{shownName(u)}</span>
              {!locked && <button type="button" aria-label={`Fjern ${shownName(u)} som medarrangør`} onClick={() => onChange(value.filter((x) => x !== u))}><Icon name="close" /></button>}
            </li>
          ))}
        </ul>
      )}
      {!locked && value.length < 5 && (open ? (
        <div className="place-search">
          <div className="search">
            <Icon name="search" />
            <label className="sr" htmlFor="cohost-q">Søg efter navn</label>
            <input id="cohost-q" type="search" value={q} placeholder="Søg efter navn" autoComplete="off" onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          {needle && (matches.length ? (
            <ul className="place-list">
              {matches.map((u) => (
                <li key={u.id}><button type="button" onClick={() => { onChange([...value, u.id]); setQ(''); setOpen(false); }}><Avatar uid={u.id} size="xs" /><b>{u.name}</b>{u.instagram && <span>@{u.instagram}</span>}</button></li>
              ))}
            </ul>
          ) : <p className="small muted">Ingen på holdet hedder det.</p>)}
        </div>
      ) : <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}><Icon name="users" />Tilføj medarrangør</button>)}
      <p className="prog-note" style={{ marginTop: 8 }}>{locked ? 'Kun arrangøren kan ændre, hvem der er medarrangører.' : 'Medarrangører kan rette eventet, checke folk ind, lægge billeder på og se feedback.'}</p>
    </div>
  );
}

function MultiPhotoPicker({ blobs, setBlobs, max = 10 }: { blobs: Blob[]; setBlobs: (b: Blob[]) => void; max?: number }) {
  const urls = useMemo(() => blobs.map((b) => URL.createObjectURL(b)), [blobs]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setErr('');
    const out: Blob[] = [];
    for (const f of [...files].slice(0, Math.max(0, max - blobs.length))) {
      try { out.push(await compressImage(f)); } catch { setErr('Et af billederne kunne ikke læses.'); }
    }
    setBlobs([...blobs, ...out]); setBusy(false);
  };
  return (
    <div className="multi-pick">
      {blobs.length > 0 && (
        <ul className="thumbs">
          {urls.map((u, i) => (
            <li key={u}><img src={u} alt={`Billede ${i + 1}`} />
              <button type="button" className="thumb-x" aria-label={`Fjern billede ${i + 1}`} onClick={() => setBlobs(blobs.filter((_, k) => k !== i))}><Icon name="close" /></button>
            </li>
          ))}
        </ul>
      )}
      {blobs.length < max && (
        <span className="btn btn-outline btn-sm file-btn"><Icon name="camera" />{busy ? 'Gør billeder klar …' : blobs.length ? 'Tilføj flere' : 'Tilføj billeder'}
          <input type="file" accept="image/*" multiple aria-label="Vælg billeder" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
        </span>
      )}
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}

function AddressField({ value, onChange, onPick, recent, near }: { value: string; onChange: (v: string) => void; onPick: (a: AddressHit) => void; recent: string[]; near: GeoPlace | null }) {
  const { api } = useApp();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [hits, setHits] = useState<AddressHit[] | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [cur, setCur] = useState(-1);
  const typed = useRef(false);
  const q = value.trim();
  const open = active && typed.current && q.length >= 3;

  useEffect(() => {
    if (!typed.current || q.length < 3) { setHits(null); setState('idle'); return; }
    const ctrl = new AbortController();
    setState('busy');
    const t = window.setTimeout(() => {
      api.searchAddresses(q, near, ctrl.signal)
        .then((r) => { setHits(r); setCur(-1); setState('idle'); })
        .catch((e: Error) => { if (e.name !== 'AbortError') { setHits(null); setState('error'); } });
    }, 280);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [api, q, near?.lat, near?.lon]);

  useEffect(() => {
    if (!active) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setActive(false); };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('focusin', away);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('focusin', away); };
  }, [active]);

  const shown = open && !!hits?.length;
  useEffect(() => {
    const field = box.current; const body = field?.closest('.sheet-body');
    if (!shown || !field || !(body instanceof HTMLElement)) return;
    const r = body.getBoundingClientRect();
    const k = body.offsetHeight ? r.height / body.offsetHeight : 1;
    const top = body.scrollTop + (field.getBoundingClientRect().top - r.top) / k - 6;
    if (top > body.scrollTop + 4) body.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [shown]);

  const pick = (a: AddressHit) => {
    typed.current = false; setActive(false); setHits(null); onPick(a);
    if (document.activeElement === input.current) input.current?.blur();
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const n = shown ? hits!.length : 0;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); setCur((c) => (c + 1) % n); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setCur((c) => (c <= 0 ? n - 1 : c - 1)); }
    else if (e.key === 'Enter' && n && cur >= 0) { e.preventDefault(); pick(hits![cur]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setActive(false); }
    else if (e.key === 'Enter') setActive(false);
  };
  return (
    <div className="field addr" ref={box}>
      <label htmlFor="f-place">Hvor mødes I?</label>
      <div className="addr-box">
        <Icon name="pin" />
        <input id="f-place" ref={input} maxLength={80} value={value} placeholder="Park, strand eller adresse" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="done"
          role="combobox" aria-expanded={shown} aria-controls="addr-list" aria-autocomplete="list" aria-activedescendant={shown && cur >= 0 ? `addr-opt-${cur}` : undefined}
          onFocus={() => setActive(true)} onKeyDown={onKey}
          onChange={(e) => { typed.current = true; setActive(true); onChange(e.target.value); }} />
        {value && (
          <button type="button" className="addr-clear keep-keyboard" aria-label="Ryd stedet" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { typed.current = false; setHits(null); onChange(''); input.current?.focus(); }}><Icon name="close" /></button>
        )}
      </div>
      {open && (
        <div className="addr-pop keep-keyboard" id="addr-list" role="listbox" aria-label="Forslag">
          {state === 'busy' && !hits && <p className="addr-note">Søger …</p>}
          {hits?.map((a, i) => (
            <button type="button" role="option" id={`addr-opt-${i}`} aria-selected={i === cur} tabIndex={-1} key={`${a.lat},${a.lon},${i}`} className="addr-hit"
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(a)}>
              <Icon name="pin" /><span><b>{a.name}</b>{a.detail && <small>{a.detail}</small>}</span>
            </button>
          ))}
          {hits && !hits.length && <p className="addr-note">Ingen forslag. Skriv bare stedet, fx "Ved stængerne bag skolen".</p>}
          {state === 'error' && <p className="addr-note">Forslagene virker ikke lige nu. Skriv stedet selv.</p>}
          {shown && <p className="addr-src"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>}
        </div>
      )}
      {!open && recent.some((p) => p !== q) && (
        <div className="recent" aria-label="Steder I har brugt før">
          {recent.filter((p) => p !== q).slice(0, 5).map((p) => <button type="button" key={p} className="choice" onClick={() => { typed.current = false; onChange(p); }}><Icon name="pin" />{p}</button>)}
        </div>
      )}
    </div>
  );
}
