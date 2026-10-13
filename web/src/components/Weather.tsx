import { useEffect, useState } from 'react';
import type { EventDoc, Forecast, GeoPlace } from '../api/types';
import { useApp } from '../state';
import { dayDiff, isPast } from '../lib/dates';
import { shortWeather, weatherDetail, weatherFor, type EventWeather } from '../lib/weather';
import { Icon } from './Icon';

export function useEventWeather(ev: EventDoc | undefined, maxDays = 15): EventWeather | null {
  const { api, team } = useApp();
  const place = ev ? ev.geo || team.weather : null;
  const wanted = !!ev && !!place && !ev.cancelled && !isPast(ev) && dayDiff(ev.date) <= maxDays;
  const key = wanted && place ? `${place.lat.toFixed(2)},${place.lon.toFixed(2)}` : '';
  const [f, setF] = useState<Forecast | null>(null);
  useEffect(() => {
    if (!key || !place) { setF(null); return; }
    let alive = true;
    api.getForecast(place).then((x) => { if (alive) setF(x); }).catch(() => { if (alive) setF(null); });
    return () => { alive = false; };
  }, [api, key]);
  return ev && f ? weatherFor(ev, f) : null;
}

export function WeatherFact({ ev }: { ev: EventDoc }) {
  const { team } = useApp();
  const w = useEventWeather(ev);
  if (!w) return null;
  const place = ev.geo || team.weather;
  return (
    <li className="wx-fact">
      <Icon name={w.icon} />
      <span>
        <b>{shortWeather(w)}</b> {weatherDetail(w)}
        <span className="wx-src"> · {place?.name} · vejr fra <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a></span>
      </span>
    </li>
  );
}

export function WeatherChip({ ev }: { ev: EventDoc }) {
  const w = useEventWeather(ev, 7);
  if (!w) return null;
  return <span className="wx-chip" title={weatherDetail(w)} aria-label={`Vejret: ${shortWeather(w)}, ${weatherDetail(w)}`}><Icon name={w.icon} />{shortWeather(w)}</span>;
}

export function PlacePicker({ value, onChange, fallback, busy }: { value: GeoPlace | null; onChange: (p: GeoPlace | null) => void; fallback?: GeoPlace | null; busy?: boolean }) {
  const { api } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [list, setList] = useState<GeoPlace[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) { setList(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      api.searchPlaces(term).then((r) => { if (alive) { setList(r); setErr(''); } }).catch(() => { if (alive) setErr('Søgningen virker ikke lige nu. Prøv igen om lidt.'); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [api, q, open]);
  const shown = value || fallback || null;
  const pick = (p: GeoPlace | null) => { onChange(p); setOpen(false); setQ(''); setList(null); };
  return (
    <div className="place-pick">
      <div className="place-cur">
        <Icon name="w-partly" />
        <span>{shown ? <>Vejret for <b>{shown.name}</b>{!value && fallback ? ' (holdets by)' : ''}</> : 'Ingen by valgt til vejret'}</span>
        <button type="button" className="link" onClick={() => setOpen(!open)} disabled={busy} aria-expanded={open}>{open ? 'Luk' : shown ? 'Skift' : 'Vælg by'}</button>
      </div>
      {open && (
        <div className="place-search">
          <div className="search">
            <Icon name="search" />
            <label className="sr" htmlFor="place-q">Søg efter by</label>
            <input id="place-q" type="search" value={q} placeholder="Søg efter by, fx Roskilde" autoComplete="off" onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          {err && <p className="form-err">{err}</p>}
          {list && (list.length ? (
            <ul className="place-list">
              {list.map((p) => (
                <li key={`${p.lat},${p.lon}`}><button type="button" onClick={() => pick(p)}><b>{p.name}</b>{p.region && <span>{p.region}</span>}</button></li>
              ))}
            </ul>
          ) : <p className="small muted">Ingen byer matcher.</p>)}
          {value && fallback && <button type="button" className="link" onClick={() => pick(null)}><Icon name="refresh" />Brug holdets by ({fallback.name})</button>}
        </div>
      )}
    </div>
  );
}
