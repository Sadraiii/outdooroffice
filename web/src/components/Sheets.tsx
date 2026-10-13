import { useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, EventDoc, EventPhoto, Progress, RepLine, Sport } from '../api/types';
import { useApp, useSub } from '../state';
import { DEMO } from '../api';
import { SPORTS, WORKOUT_SPORTS, sportLabel, sportMetric } from '../lib/sports';
import { cleanHandle, initials, newId, parseDuration, parseNumber } from '../lib/format';
import { bySort, cap, dateOf, isPast, relDay, todayStr, whenText } from '../lib/dates';
import { compressImage } from '../lib/image';
import { ACCENTS, DEFAULT_APPEARANCE, MODES, SIZES, loadAppearance, saveAppearance, type Appearance } from '../lib/theme';
import { buzz, canVibrate } from '../lib/platform';
import {
  DEFAULT_LOOK, STICKER_COLORS, STORY_BGS, activityParts, activitySticker, activityStory, badgeParts, badgeSticker, badgeStory, canCopyImage, copyImage,
  eventParts, eventSticker, eventStory, loadPhotos, recapParts, recapSticker, recapStory, shareImage, shareLink, type RecapData, type ShareLook,
} from '../lib/share';
import { badgeById, weeksAway } from '../lib/stats';
import { weatherFor } from '../lib/weather';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { Avatar, Skeleton, Switch, colorFor } from './bits';
import { CalendarSheet } from './CalendarSheet';
import { EventForm } from './EventForm';

export function SheetHost() {
  const { sheet, closeSheet } = useApp();
  if (!sheet) return null;
  switch (sheet.type) {
    case 'create': return <CreateMenu />;
    case 'event': return <EventForm event={sheet.event} key={sheet.event?.id || 'new'} />;
    case 'workout': return <WorkoutForm eventId={sheet.eventId} />;
    case 'profile': return <ProfileForm />;
    case 'appearance': return <AppearanceSheet />;
    case 'calendar': return <CalendarSheet />;
    case 'share-activity': return <ShareActivity a={sheet.activity} />;
    case 'share-event': return <ShareEvent ev={sheet.event} />;
    case 'share-recap': return <ShareRecap ev={sheet.event} />;
    case 'share-badge': return <ShareBadge id={sheet.badge} uid={sheet.uid} />;
    case 'nudge': return <NudgeSheet uid={sheet.uid} />;
    default: closeSheet(); return null;
  }
}

function CreateMenu() {
  const { closeSheet, openSheet } = useApp();
  const tiles: [string, 'trophy' | 'flag', () => void][] = [
    ['Del træning', 'trophy', () => openSheet({ type: 'workout' })],
    ['Opret event', 'flag', () => openSheet({ type: 'event' })],
  ];
  return (
    <Sheet title="Opret" onClose={closeSheet}>
      <div className="actions-grid">
        {tiles.map(([t, i, fn]) => (
          <button key={t} className="action-tile" onClick={fn}>
            <span className="ic-big"><Icon name={i} /></span>
            <b>{t}</b>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function PhotoPicker({ blob, setBlob }: { blob: Blob | null; setBlob: (b: Blob | null) => void }) {
  const preview = useMemo(() => (blob ? URL.createObjectURL(blob) : ''), [blob]);
  const [err, setErr] = useState('');
  return (
    <div className="photo-pick">
      {preview && <img src={preview} alt="Valgt billede" />}
      <div className="tags">
        <span className="btn btn-outline btn-sm file-btn"><Icon name="camera" />{blob ? 'Skift billede' : 'Tilføj billede'}
          <input type="file" accept="image/*" aria-label="Vælg billede" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { setErr(''); setBlob(await compressImage(f)); } catch { setErr('Billedet kunne ikke læses'); }
          }} />
        </span>
        {blob && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setBlob(null)}>Fjern</button>}
      </div>
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}

function EventSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { events, myRsvps } = useApp();
  const near = events.filter((e) => Math.abs((dateOf(e.date)?.getTime() || 0) - Date.now()) < 10 * 864e5 && (myRsvps.has(e.id) || !isPast(e))).slice(0, 25);
  return (
    <div className="field"><label htmlFor="f-ev">{label}</label>
      <select id="f-ev" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Intet event</option>
        {near.map((e) => <option key={e.id} value={e.id}>{e.title} · {relDay(e)}{e.time ? ' ' + e.time : ''}</option>)}
      </select>
    </div>
  );
}

function WorkoutForm({ eventId }: { eventId?: string }) {
  const { api, me, closeSheet, openSheet, toast, eventById } = useApp();
  const ev0 = eventById(eventId);
  const [sport, setSport] = useState<Sport>(ev0 && ev0.sport !== 'socialt' ? ev0.sport : 'lob');
  const [title, setTitle] = useState('');
  const [km, setKm] = useState('');
  const [dur, setDur] = useState('');
  const [reps, setReps] = useState<{ id: string; name: string; count: string }[]>(() =>
    ev0 && sportMetric(ev0.sport) === 'reps' ? (ev0.exercises.length ? ev0.exercises.map((x) => ({ id: newId('r'), name: x.name, count: '' })) : SPORTS[ev0.sport].tpl.map(([name]) => ({ id: newId('r'), name, count: '' }))) : []);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [evId, setEvId] = useState(eventId || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const metric = sportMetric(sport);
  const pick = (s: Sport) => {
    setSport(s);
    if (sportMetric(s) === 'reps' && !reps.length) setReps(SPORTS[s].tpl.map(([name]) => ({ id: newId('r'), name, count: '' })));
  };
  const placeholder = { lob: 'Aftenløb', cykling: 'Cykeltur', gang: 'Gåtur', calisthenics: 'Calisthenics i parken', fitness: 'Fitness udenfor', yoga: 'Yoga i det fri', vinterbadning: 'Morgendukkert', socialt: 'Hygge', andet: 'Træning' }[sport];

  const save = async () => {
    if (!me) return;
    const distanceKm = metric === 'distance' ? parseNumber(km) : null;
    const durationSec = dur.trim() ? parseDuration(dur) : null;
    if (dur.trim() && durationSec === null) { setErr('Skriv tiden som 42:10'); return; }
    if (metric === 'distance' && (!distanceKm || distanceKm <= 0)) { setErr('Mangler distance'); return; }
    if (distanceKm && distanceKm > 1000) { setErr('Distancen er for lang'); return; }
    if (durationSec && durationSec > 48 * 3600) { setErr('Tiden er for lang'); return; }
    const lines: RepLine[] = metric === 'reps' ? reps.map((r) => ({ name: r.name.trim().slice(0, 40), count: Math.min(99999, parseNumber(r.count) || 0) })).filter((r) => r.name && r.count > 0).slice(0, 10) : [];
    if (metric === 'reps' && !lines.length && !durationSec) { setErr('Tilføj mindst én øvelse'); return; }
    setBusy(true); setErr('');
    try {
      const photoURL = photo ? await api.uploadImage(me.id, 'activity', photo) : undefined;
      const id = await api.createActivity(me.id, {
        kind: 'workout', sport, title: (title.trim() || placeholder).slice(0, 80), text: text.trim().slice(0, 1000) || undefined,
        distanceKm: distanceKm || undefined, durationSec: durationSec || undefined, reps: lines.length ? lines : undefined,
        eventId: evId || undefined, photoURL,
      });
      toast('Delt');
      openSheet({ type: 'share-activity', activity: { id, uid: me.id, kind: 'workout', sport, title: title.trim() || placeholder, distanceKm: distanceKm || undefined, durationSec: durationSec || undefined, reps: lines, createdAt: Date.now(), kudos: 0, comments: 0 } as Activity });
    } catch { setErr('Ikke delt. Prøv igen.'); setBusy(false); }
  };

  return (
    <Sheet title="Del træning" onClose={closeSheet}
      foot={<><button className="btn btn-outline" onClick={closeSheet}>Annullér</button><button className="btn btn-primary btn-grow" disabled={busy} onClick={save}>Del træning</button></>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <fieldset><legend>Sport</legend>
          <div className="choices">{WORKOUT_SPORTS.map((s) => <button type="button" key={s} className="choice" aria-pressed={sport === s} onClick={() => pick(s)}>{sportLabel(s)}</button>)}</div>
        </fieldset>
        <div className="field"><label htmlFor="w-title">Titel</label><input id="w-title" maxLength={80} value={title} placeholder={placeholder} onChange={(e) => setTitle(e.target.value)} /></div>
        {metric === 'distance' && (
          <div className="row2">
            <div className="field"><label htmlFor="w-km">Distance (km)</label><input id="w-km" inputMode="decimal" value={km} placeholder="8,2" onChange={(e) => setKm(e.target.value)} /></div>
            <div className="field"><label htmlFor="w-dur">Tid</label><input id="w-dur" inputMode="numeric" value={dur} placeholder="42:10" onChange={(e) => setDur(e.target.value)} /></div>
          </div>
        )}
        {metric === 'reps' && (
          <fieldset><legend>Øvelser</legend>
            {reps.map((r) => (
              <div className="rep-row" key={r.id}>
                <input id={`rn-${r.id}`} aria-label="Øvelse" placeholder="Øvelse" maxLength={40} value={r.name} onChange={(e) => setReps((x) => x.map((y) => (y.id === r.id ? { ...y, name: e.target.value } : y)))} />
                <input id={`rc-${r.id}`} aria-label="Antal" placeholder="Antal" inputMode="numeric" value={r.count} onChange={(e) => setReps((x) => x.map((y) => (y.id === r.id ? { ...y, count: e.target.value } : y)))} />
                <button type="button" className="icon-btn ex-del" aria-label="Fjern øvelse" onClick={() => setReps((x) => x.filter((y) => y.id !== r.id))}><Icon name="close" /></button>
              </div>
            ))}
            {reps.length < 10 && <button type="button" className="btn btn-outline btn-sm" onClick={() => setReps((x) => [...x, { id: newId('r'), name: '', count: '' }])}><Icon name="plus" />Tilføj øvelse</button>}
          </fieldset>
        )}
        {metric !== 'distance' && (
          <div className="field"><label htmlFor="w-dur2">Varighed</label><input id="w-dur2" inputMode="numeric" value={dur} placeholder="45:00" onChange={(e) => setDur(e.target.value)} /></div>
        )}
        <div className="field"><label htmlFor="w-text">Hvordan gik det?</label><textarea id="w-text" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></div>
        <PhotoPicker blob={photo} setBlob={setPhoto} />
        <EventSelect value={evId} onChange={setEvId} label="Event" />
        <p className="form-err" role="alert">{err}</p>
      </form>
    </Sheet>
  );
}

function ProfileForm() {
  const { api, me, closeSheet, toast } = useApp();
  const [name, setName] = useState(me?.name || '');
  const [bio, setBio] = useState(me?.bio || '');
  const [ig, setIg] = useState(me?.instagram || '');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : ''), [photo]);
  if (!me) return null;
  const save = async () => {
    if (!name.trim()) { setErr('Skriv dit navn'); return; }
    setBusy(true); setErr('');
    try {
      const photoURL = photo ? await api.uploadImage(me.id, 'avatar', photo) : undefined;
      await api.updateProfile(me.id, { name: name.trim().slice(0, 40), bio: bio.trim().slice(0, 200), instagram: cleanHandle(ig), ...(photoURL ? { photoURL } : {}) });
      closeSheet(); toast('Gemt');
    } catch { setErr('Ikke gemt. Prøv igen.'); setBusy(false); }
  };
  return (
    <Sheet title="Rediger profil" onClose={closeSheet}
      foot={<button className="btn btn-primary btn-grow" disabled={busy} onClick={save}>Gem profil</button>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="tags" style={{ gap: 14 }}>
          {preview ? <img className="av av-xl" src={preview} alt="" /> : <Avatar uid={me.id} size="xl" />}
          <span className="btn btn-outline btn-sm file-btn"><Icon name="camera" />Skift billede
            <input type="file" accept="image/*" aria-label="Vælg profilbillede" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compressImage(f, 600)); }} />
          </span>
        </div>
        <div className="field"><label htmlFor="pf-name">Navn</label><input id="pf-name" maxLength={40} value={name} autoComplete="nickname" onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="pf-ig">Instagram</label><input id="pf-ig" maxLength={60} value={ig} placeholder="@brugernavn" autoCapitalize="none" autoCorrect="off" onChange={(e) => setIg(e.target.value)} /></div>
        <div className="field"><label htmlFor="pf-bio">Om dig</label><textarea id="pf-bio" rows={3} maxLength={200} value={bio} onChange={(e) => setBio(e.target.value)} /></div>
        <p className="form-err" role="alert">{err}</p>
      </form>
    </Sheet>
  );
}

function AppearanceSheet() {
  const { closeSheet } = useApp();
  const [a, setA] = useState<Appearance>(loadAppearance);
  const set = (patch: Partial<Appearance>) => { const next = { ...a, ...patch }; setA(next); saveAppearance(next); };
  const isDefault = (Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[]).every((k) => a[k] === DEFAULT_APPEARANCE[k]);
  return (
    <Sheet title="Udseende" onClose={closeSheet}
      foot={<button className="btn btn-primary btn-grow" onClick={closeSheet}>Færdig</button>}>
      <div className="form">
        <div className="ap-preview" aria-hidden="true">
          <div className="ap-top"><span className="evb evb-community">Community made event</span><span className="status live">I gang nu</span></div>
          <b className="ap-title">Søndagsløb 8 km</b>
          <span className="ap-meta"><Icon name="clock" />I morgen kl. 09:00 · P-pladsen ved skoven</span>
          <div className="bar"><i style={{ width: '62%' }} /></div>
          <div className="ap-row"><span className="btn btn-primary btn-sm">Tilmeld</span><span className="link">Program</span><span className="streak"><Icon name="flame" />7</span></div>
        </div>
        <fieldset><legend>Tema</legend>
          <div className="seg" role="radiogroup" aria-label="Tema" style={{ marginBottom: 0 }}>
            {MODES.map((m) => <button key={m.key} type="button" role="radio" aria-checked={a.mode === m.key} onClick={() => set({ mode: m.key })}>{m.label}</button>)}
          </div>
        </fieldset>
        <fieldset><legend>Farve</legend>
          <div className="accent-grid" role="radiogroup" aria-label="Farve">
            {ACCENTS.map((c) => (
              <div className="swatch-col" key={c.key}>
                <button type="button" role="radio" aria-checked={a.accent === c.key} aria-label={c.label} className="swatch" style={{ background: c.swatch }} onClick={() => set({ accent: c.key })} />
                <span aria-hidden="true">{c.label}</span>
              </div>
            ))}
          </div>
        </fieldset>
        <fieldset><legend>Tekststørrelse</legend>
          <div className="seg" role="radiogroup" aria-label="Tekststørrelse" style={{ marginBottom: 0 }}>
            {SIZES.map((z) => <button key={z.key} type="button" role="radio" aria-checked={a.size === z.key} onClick={() => set({ size: z.key })}><span className={'aa aa-' + z.key} aria-hidden="true">Aa</span>{z.label}</button>)}
          </div>
        </fieldset>
        <fieldset><legend>Mere</legend>
          <ul className="toggle-list">
            <li className="toggle-row">
              <b>Høj kontrast</b>
              <Switch on={a.contrast} onChange={(v) => set({ contrast: v })} label="Høj kontrast" />
            </li>
            <li className="toggle-row">
              <b>Animationer</b>
              <Switch on={a.motion} onChange={(v) => set({ motion: v })} label="Animationer" />
            </li>
            <li className="toggle-row">
              <div><b>Vibration</b>{!canVibrate() && !DEMO && <span>Ikke understøttet</span>}</div>
              <Switch on={a.haptics} onChange={(v) => { set({ haptics: v }); if (v) buzz(20); }} label="Vibration" />
            </li>
          </ul>
        </fieldset>
        {!isDefault && <button type="button" className="link" onClick={() => set({ ...DEFAULT_APPEARANCE })}><Icon name="refresh" />Nulstil</button>}
      </div>
    </Sheet>
  );
}

type ShareKind = 'activity' | 'event' | 'recap' | 'badge';
const SHARE_TEXT = 'Outdoor Office';
const appUrl = (path: string) => (DEMO ? 'https://outdoor-office.web.app' : window.location.origin) + path;

type ShareStyle = 'story' | 'clear';
const STYLE_KEY = 'oo.shareStyle';
const LOOK_KEY = 'oo.shareLook';
function savedStyle(): ShareStyle {
  try { return localStorage.getItem(STYLE_KEY) === 'clear' ? 'clear' : 'story'; } catch { return 'story'; }
}
function savedLook(): ShareLook {
  try {
    const v = JSON.parse(localStorage.getItem(LOOK_KEY) || '{}') as Partial<ShareLook>;
    return {
      bg: STORY_BGS.some((b) => b.key === v.bg) ? v.bg! : DEFAULT_LOOK.bg,
      color: STICKER_COLORS.some((c) => c.key === v.color) ? v.color! : DEFAULT_LOOK.color,
      hide: Array.isArray(v.hide) ? v.hide.filter((h): h is string => typeof h === 'string').slice(0, 20) : [],
    };
  } catch { return DEFAULT_LOOK; }
}

interface ShareProps {
  title: string;
  kind: ShareKind;
  make: (style: ShareStyle, look: ShareLook) => Promise<Blob>;
  parts: { key: string; label: string }[];
  link: { url: string; title: string };
}

function ShareSheet({ title, kind, make, parts, link }: ShareProps) {
  const { closeSheet, toast } = useApp();
  const [style, setStyle] = useState<ShareStyle>(savedStyle);
  const [look, setLook] = useState<ShareLook>(savedLook);
  const [img, setImg] = useState<{ key: string; blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const clear = style === 'clear';
  const renderKey = clear ? `clear|${look.color}|${look.hide.join(',')}` : `story|${look.bg}`;
  useEffect(() => {
    let alive = true;
    setFailed(false);
    make(style, look).then((blob) => {
      if (!alive) return;
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setImg({ key: renderKey, blob, url });
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [renderKey]);

  const pick = (s: ShareStyle) => { setStyle(s); try { localStorage.setItem(STYLE_KEY, s); } catch {  } };
  const update = (patch: Partial<ShareLook>) => {
    const next = { ...look, ...patch };
    setLook(next);
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(next)); } catch {  }
  };
  const toggle = (key: string) => {
    const hidden = look.hide.includes(key);
    if (!hidden && parts.every((p) => p.key === key || look.hide.includes(p.key))) { toast('Lad mindst én ting være med'); return; }
    update({ hide: hidden ? look.hide.filter((h) => h !== key) : [...look.hide, key] });
  };
  const ready = img && img.key === renderKey ? img : null;
  const filename = `outdoor-office-${({ activity: 'traening', event: 'event', recap: 'recap', badge: 'maerke' } as const)[kind]}${clear ? '-sticker' : ''}.png`;

  const share = async () => {
    if (!ready) return;
    if (DEMO) {
      toast('Åbner del-menuen');
      return;
    }
    const r = await shareImage(ready.blob, filename, SHARE_TEXT);
    if (r === 'downloaded') toast(clear ? 'Sticker gemt' : 'Billede gemt');
    if (r === 'failed') toast('Kunne ikke dele');
    if (r === 'shared') closeSheet();
  };
  const copy = async () => {
    if (!ready) return;
    if (DEMO || await copyImage(ready.blob)) toast('Sticker kopieret');
    else toast('Kopiering virker ikke her');
  };
  const sendLink = async () => {
    const r = await shareLink(link.url, link.title, SHARE_TEXT);
    if (r === 'copied') toast('Link kopieret');
    if (r === 'shared' || r === 'copied') closeSheet();
  };

  const swatches = clear
    ? STICKER_COLORS.map((c) => ({ key: c.key, label: c.label, css: c.fg, on: look.color === c.key, set: () => update({ color: c.key }) }))
    : STORY_BGS.map((b) => ({ key: b.key, label: b.label, css: b.pal.bg, on: look.bg === b.key, set: () => update({ bg: b.key }) }));

  return (
    <Sheet title={title} onClose={closeSheet}>
      <div className="seg" role="tablist" aria-label="Vælg billede">
        <button role="tab" aria-selected={!clear} onClick={() => pick('story')}>Story</button>
        <button role="tab" aria-selected={clear} onClick={() => pick('clear')}>Gennemsigtig</button>
      </div>
      <figure className="story-preview">
        <div className={'story-frame' + (clear ? ' clear' : '') + (clear && (ready ? ready.key.startsWith('clear|black') : look.color === 'black') ? ' light' : '')}>
          {ready
            ? <img src={ready.url} alt={clear ? 'Gennemsigtig sticker' : 'Story-billede'} />
            : <div className="story-wait">{failed ? 'Billedet kunne ikke laves' : 'Laver billede …'}</div>}
        </div>
      </figure>
      <div className="share-opts">
        <div className="opt-row">
          <span className="opt-label" id="opt-color">{clear ? 'Farve' : 'Baggrund'}</span>
          <div className="swatches" role="radiogroup" aria-labelledby="opt-color">
            {swatches.map((w) => (
              <button key={w.key} type="button" role="radio" aria-checked={w.on} aria-label={w.label} title={w.label}
                className="swatch" style={{ background: w.css }} onClick={w.set} />
            ))}
          </div>
        </div>
        {clear && (
          <div className="opt-row top">
            <span className="opt-label">Vis</span>
            <div className="choices sm">
              {parts.map((p) => (
                <button key={p.key} type="button" className="choice" aria-pressed={!look.hide.includes(p.key)} onClick={() => toggle(p.key)}>{p.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="actions-grid">
        <button className="action-tile" onClick={share} disabled={!ready}>
          <span className="ic-big"><Icon name={clear ? 'sticker' : 'insta'} /></span>
          <b>{clear ? 'Del sticker' : 'Del story'}</b>
        </button>
        {clear && (DEMO || canCopyImage()) && (
          <button className="action-tile" onClick={copy} disabled={!ready}>
            <span className="ic-big"><Icon name="copy" /></span>
            <b>Kopiér sticker</b>
          </button>
        )}
        <button className="action-tile" onClick={sendLink}>
          <span className="ic-big"><Icon name="link" /></span>
          <b>Send link</b>
        </button>
      </div>
    </Sheet>
  );
}

function ShareActivity({ a }: { a: Activity }) {
  const { nameOf } = useApp();
  return (
    <ShareSheet title="Del træning" kind="activity" parts={activityParts(a)}
      make={(s, look) => (s === 'clear' ? activitySticker(a, look) : activityStory(a, nameOf(a.uid), look.bg))}
      link={{ url: appUrl(`/a/${a.id}`), title: a.title || 'Træning' }} />
  );
}

function ShareEvent({ ev }: { ev: EventDoc }) {
  return (
    <ShareSheet title="Del event" kind="event" parts={eventParts(ev)}
      make={(s, look) => (s === 'clear' ? eventSticker(ev, ev.goingCount, look) : eventStory(ev, ev.goingCount, look.bg))}
      link={{ url: appUrl(`/e/${ev.id}`), title: ev.title }} />
  );
}

function ShareRecap({ ev }: { ev: EventDoc }) {
  const { api, events, team, nameOf } = useApp();
  const checkins = useSub<{ uid: string }[] | null>((cb) => api.watchCheckins(ev.id, cb), [api, ev.id], null);
  const progress = useSub<Progress[] | null>((cb) => api.watchProgress(ev.id, cb), [api, ev.id], null);
  const photos = useSub<EventPhoto[] | null>((cb) => api.watchEventPhotos(ev.id, cb), [api, ev.id], null);
  const [data, setData] = useState<RecapData | null>(null);
  const ready = !!checkins && !!progress && !!photos;
  useEffect(() => {
    if (!ready || data) return;
    let alive = true;
    (async () => {
      const came = checkins!.length ? checkins!.map((c) => c.uid) : ev.going;
      const turnout = came.length;
      const people = came.map((u) => ({ initials: initials(nameOf(u)), color: colorFor(u) }));
      const totals = ev.exercises.map((x) => ({ name: x.name, unit: x.unit, value: progress!.reduce((s2, p2) => s2 + (p2.counts[x.id] || 0), 0) })).filter((t) => t.value > 0);
      const ordered = [...photos!].sort((a, b) => Number(b.host) - Number(a.host) || b.at - a.at).map((p2) => p2.url);
      const imgs = await loadPhotos(ordered, 3);
      const place = ev.geo || team.weather;
      const w = place ? weatherFor(ev, await api.getForecast(place).catch(() => null)) : null;
      const next = events.filter((e) => e.id !== ev.id && !isPast(e) && !e.cancelled && ((ev.seriesId && e.seriesId === ev.seriesId) || e.title === ev.title)).sort(bySort)[0];
      if (alive) setData({ turnout, totals, people, photos: imgs, weather: w ? `${Math.round(w.temp)}° og ${w.label.toLowerCase()}` : '', next: next ? cap(whenText(next)) : '' });
    })();
    return () => { alive = false; };
  }, [ready]);
  if (!data) return <LoadingShare title="Recap" />;
  return (
    <ShareSheet title="Recap" kind="recap" parts={recapParts(data)}
      make={(s2, look) => (s2 === 'clear' ? recapSticker(ev, data, look) : recapStory(ev, data, look.bg))}
      link={{ url: appUrl(`/e/${ev.id}`), title: ev.title }} />
  );
}

function LoadingShare({ title }: { title: string }) {
  const { closeSheet } = useApp();
  return <Sheet title={title} onClose={closeSheet}><Skeleton /></Sheet>;
}

function ShareBadge({ id, uid }: { id: string; uid: string }) {
  const { users, nameOf } = useApp();
  const at = users.get(uid)?.badges?.[id] || Date.now();
  return (
    <ShareSheet title="Del mærke" kind="badge" parts={badgeParts}
      make={(s2, look) => (s2 === 'clear' ? badgeSticker(id, look) : badgeStory(id, nameOf(uid), at, look.bg))}
      link={{ url: appUrl(`/u/${uid}`), title: badgeById(id)?.name || 'Mærke' }} />
  );
}

function NudgeSheet({ uid }: { uid: string }) {
  const { api, me, users, events, closeSheet, toast, shownName } = useApp();
  const u = users.get(uid);
  const upcoming = useMemo(() => events.filter((e) => !isPast(e) && !e.cancelled).sort(bySort).slice(0, 8), [events]);
  const [eventId, setEventId] = useState(() => (upcoming.find((e) => e.official) || upcoming[0])?.id || '');
  const first = (n: string | undefined) => (n || '').split(' ')[0];
  const draft = (eid: string) => {
    const e = upcoming.find((x) => x.id === eid);
    return `Hej ${first(u?.name)}, vi savner dig til træning.${e ? ` Kom med ${whenText(e)}: ${e.title}.` : ''} ${first(me?.name)}`;
  };
  const [text, setText] = useState(() => draft(eventId));
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!u || !me) return null;
  const away = weeksAway(u.stats, todayStr());
  const pickEvent = (eid: string) => { setEventId(eid); if (!edited) setText(draft(eid)); };
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.sendNudge(me.id, uid, text, eventId || undefined);
      closeSheet();
      toast('Sendt');
    } catch { toast('Ikke sendt. Prøv igen.'); setBusy(false); }
  };
  return (
    <Sheet title="Send en hilsen" onClose={closeSheet}
      foot={<><button className="btn btn-outline" onClick={closeSheet}>Annullér</button><button className="btn btn-primary btn-grow" disabled={busy || !text.trim()} onClick={send}><Icon name="megaphone" />Send hilsen</button></>}>
      <div className="nudge-to">
        <Avatar uid={uid} size="md" />
        <div><b>{u.name}</b><span>{away === null ? 'Aldrig checket ind' : `Sidst ${u.stats?.lastDate ? fmtDay(u.stats.lastDate) : ''} · ${away} uger siden`}</span></div>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="n-event">Inviter til</label>
        <select id="n-event" value={eventId} onChange={(e) => pickEvent(e.target.value)}>
          <option value="">Intet bestemt event</option>
          {upcoming.map((e) => <option key={e.id} value={e.id}>{e.title} · {whenText(e)}</option>)}
        </select>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="n-text">Besked</label>
        <textarea id="n-text" rows={4} maxLength={300} value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} />
      </div>
      <p className="flabel" style={{ marginTop: 16 }}>Forhåndsvisning</p>
      <div className="push-preview">
        <span className="seal" aria-hidden="true" />
        <div><b>{shownName(me.id) === 'Du' ? me.name : shownName(me.id)}: Vi savner dig til træning</b><p>{text || ' '}</p></div>
        <time>nu</time>
      </div>
    </Sheet>
  );
}

const fmtDay = (ymdStr: string) => { const d = dateOf(ymdStr); return d ? `${d.getDate()}/${d.getMonth() + 1}` : ''; };
