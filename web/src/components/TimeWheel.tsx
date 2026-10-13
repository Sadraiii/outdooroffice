import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { pad } from '../lib/format';
import { reducedMotion } from '../lib/platform';

const ITEM = 44;
const VISIBLE = 5;

function Wheel({ values, index, onChange, label }: { values: number[]; index: number; onChange: (i: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const settle = useRef(0);
  const reported = useRef<number | null>(null);
  const [active, setActive] = useState(index);

  const paint = () => {
    const el = ref.current; if (!el) return;
    const pos = el.scrollTop / ITEM;
    items.current.forEach((it, i) => {
      if (!it) return;
      const d = Math.max(-2.6, Math.min(2.6, i - pos));
      it.style.transform = `rotateX(${-d * 21}deg) scale(${1 - Math.abs(d) * 0.05})`;
      it.style.opacity = String(Math.max(0.2, 1 - Math.abs(d) * 0.3));
    });
  };
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (reported.current !== index && Math.round(el.scrollTop / ITEM) !== index) el.scrollTop = index * ITEM;
    reported.current = null;
    setActive(index); paint();
  }, [index, values.length]);
  useEffect(() => () => window.clearTimeout(settle.current), []);

  const onScroll = () => {
    const el = ref.current; if (!el) return;
    paint();
    const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM)));
    if (i !== active) setActive(i);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => { if (i !== index) { reported.current = i; onChange(i); } }, 140);
  };
  const go = (i: number) => ref.current?.scrollTo({ top: Math.max(0, Math.min(values.length - 1, i)) * ITEM, behavior: reducedMotion() ? 'auto' : 'smooth' });
  const onKey = (e: KeyboardEvent) => {
    const to = { ArrowUp: active + 1, ArrowDown: active - 1, PageUp: active + 3, PageDown: active - 3, Home: 0, End: values.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); go(to);
  };
  return (
    <div className="wheel" ref={ref} onScroll={onScroll} onKeyDown={onKey} tabIndex={0} role="spinbutton" aria-label={label}
      aria-valuenow={values[active]} aria-valuemin={values[0]} aria-valuemax={values[values.length - 1]} aria-valuetext={pad(values[active])}>
      <div className="wheel-pad" aria-hidden="true" />
      {values.map((v, i) => (
        <button type="button" key={v} tabIndex={-1} aria-hidden="true" ref={(b) => { items.current[i] = b; }} className={'wheel-item' + (i === active ? ' on' : '')} onClick={() => go(i)}>{pad(v)}</button>
      ))}
      <div className="wheel-pad" aria-hidden="true" />
    </div>
  );
}

export function TimeWheel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  const hh = m ? Math.min(23, +m[1]) : 17;
  const mm = m ? Math.min(59, +m[2]) : 30;
  const now = useRef({ hh, mm });
  now.current = { hh, mm };
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!minutes.includes(mm)) { minutes.push(mm); minutes.sort((a, b) => a - b); }
  const set = (part: Partial<{ hh: number; mm: number }>) => {
    now.current = { ...now.current, ...part };
    onChange(`${pad(now.current.hh)}:${pad(now.current.mm)}`);
  };
  return (
    <div className="time-wheel" style={{ ['--row' as string]: `${ITEM}px`, ['--rows' as string]: VISIBLE }}>
      <span className="tw-band" aria-hidden="true" />
      <Wheel values={hours} index={hh} label="Time" onChange={(i) => set({ hh: hours[i] })} />
      <span className="tw-colon" aria-hidden="true">:</span>
      <Wheel values={minutes} index={minutes.indexOf(mm)} label="Minutter" onChange={(i) => set({ mm: minutes[i] })} />
    </div>
  );
}
