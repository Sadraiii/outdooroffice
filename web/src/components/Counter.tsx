import { useEffect, useRef, useState } from 'react';
import type { Exercise } from '../api/types';
import { fmt, parseNumber } from '../lib/format';
import { buzz } from '../lib/platform';
import { Icon } from './Icon';

export function Tally({ pct }: { pct: number }) {
  const on = Math.floor(Math.min(1, Math.max(0, pct)) * 20 + 1e-9);
  return (
    <div className="tally" aria-hidden="true">
      {[0, 1, 2, 3].map((g) => (
        <span key={g} className={'tg' + (on >= (g + 1) * 5 ? ' full' : '')}>
          {[0, 1, 2, 3, 4].map((i) => <i key={i} className={g * 5 + i < on ? 'on' : ''} />)}
        </span>
      ))}
    </div>
  );
}

export function steps(x: Exercise): [number, number] {
  const nice = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000];
  const raw = (Number(x.target) || 0) / 20;
  let s = nice.find((n) => n >= raw) || 1000;
  if (x.unit !== 'km' && s < 1) s = 1;
  return [s, s < 1 ? 1 : s * 5];
}

const amountKey = (id: string) => `oo.amount.${id}`;
function savedAmount(id: string) { try { return localStorage.getItem(amountKey(id)) || ''; } catch { return ''; } }

export function Counter({ x, value, onChange, readOnly }: { x: Exercise; value: number; onChange: (v: number) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(() => savedAmount(x.id));
  const amountInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value !== prev.current) { prev.current = value; setBump(true); const t = setTimeout(() => setBump(false), 340); return () => clearTimeout(t); }
  }, [value]);
  useEffect(() => { if (editing) input.current?.select(); }, [editing]);
  const tgt = Number(x.target) || 0;
  const pct = tgt ? Math.min(1, value / tgt) : 0;
  const done = tgt > 0 && value >= tgt;
  const [s, big] = steps(x);
  const set = (v: number) => {
    const next = Math.max(0, Math.min(99999, Math.round(v * 100) / 100));
    buzz(tgt > 0 && value < tgt && next >= tgt ? [24, 50, 24] : 8);
    onChange(next);
  };
  const commit = () => { const v = parseNumber(draft); setEditing(false); if (v !== null) set(v); };
  const n = parseNumber(amount);
  const ok = n !== null && n > 0;
  const addAmount = (sign: 1 | -1) => {
    if (!ok) { amountInput.current?.focus(); return; }
    set(value + sign * n!);
    try { localStorage.setItem(amountKey(x.id), amount.trim()); } catch {  }
    amountInput.current?.blur();
  };
  return (
    <article className={'counter' + (done ? ' done' : '') + (bump ? ' bump' : '')}>
      <header className="c-head">
        <h3 className="c-name">{x.name}</h3>
        {done ? <span className="badge-done"><Icon name="check" />Klaret</span> : <span className="c-pct">{Math.round(pct * 100)} %</span>}
      </header>
      <div className="c-num">
        {editing ? (
          <input ref={input} className="c-input" type="number" inputMode="decimal" min={0} step="any" value={draft} aria-label={`Antal ${x.name}`}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }} autoFocus />
        ) : (
          <button className="c-val" disabled={readOnly} onClick={() => { setDraft(String(value)); setEditing(true); }} aria-label={`${x.name}: ${fmt(value)} af ${fmt(tgt)}${readOnly ? '' : '. Tryk for at skrive et tal'}`}>{fmt(value)}</button>
        )}
        <span className="c-of">/ {fmt(tgt)}</span>
        <span className="c-unit">{x.unit}</span>
      </div>
      <Tally pct={pct} />
      {!readOnly && (
        <div className="c-ctrl">
          <button className="btn btn-outline btn-sq" onClick={() => set(value - s)} aria-label={`Træk ${fmt(s)} fra ${x.name}`}>−{fmt(s)}</button>
          <button className="btn btn-primary" onClick={() => set(value + s)} aria-label={`Læg ${fmt(s)} til ${x.name}`}>+{fmt(s)}</button>
          <button className="btn btn-outline" onClick={() => set(value + big)} aria-label={`Læg ${fmt(big)} til ${x.name}`}>+{fmt(big)}</button>
        </div>
      )}
      {!readOnly && (
        <form className="c-custom" onSubmit={(e) => { e.preventDefault(); addAmount(1); }}>
          <input ref={amountInput} className="c-amount" inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder="Eget antal, fx 8"
            aria-label={`Eget antal ${x.name}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="button" className="btn btn-outline btn-sq" onClick={() => addAmount(-1)} aria-label={ok ? `Træk ${fmt(n!)} fra ${x.name}` : 'Træk fra'}>{ok ? `−${fmt(n!)}` : '−'}</button>
          <button type="submit" className="btn btn-outline c-add" aria-label={ok ? `Læg ${fmt(n!)} til ${x.name}` : 'Læg til'}>{ok ? `+${fmt(n!)}` : 'Læg til'}</button>
        </form>
      )}
    </article>
  );
}
