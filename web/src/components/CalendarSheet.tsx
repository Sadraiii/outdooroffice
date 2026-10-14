import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { useApp } from '../state';
import { DEMO } from '../api';
import { Sheet } from './Sheet';
import { Icon } from './Icon';

type Scope = 'mine' | 'all';

export function CalendarSheet() {
  const { api, me, closeSheet, toast } = useApp();
  const [scope, setScope] = useState<Scope>('mine');
  const [links, setLinks] = useState<Partial<Record<Scope, string>>>({});
  const [err, setErr] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const url = links[scope];

  useEffect(() => {
    if (!me || links[scope]) return;
    let alive = true;
    setErr('');
    api.calendarLink(me.id, scope).then((u) => { if (alive) setLinks((l) => ({ ...l, [scope]: u })); })
      .catch(() => { if (alive) setErr('Linket kunne ikke hentes'); });
    return () => { alive = false; };
  }, [api, me, scope, links]);
  useEffect(() => setConfirmReset(false), [scope]);

  const webcal = url ? url.replace(/^https?:/, 'webcal:') : '';
  const demoOnly = (e: MouseEvent) => {
    if (!DEMO) return;
    e.preventDefault();
    toast('Åbner kalenderen');
  };
  const google = url ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` : '';
  const outlook = url ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent('Outdoor Office')}` : '';
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast('Link kopieret'); }
    catch { toast('Kunne ikke kopiere'); }
  };
  const reset = async () => {
    if (!me) return;
    if (!confirmReset) { setConfirmReset(true); return; }
    try {
      const u = await api.calendarLink(me.id, scope, true);
      setLinks((l) => ({ ...l, [scope]: u })); setConfirmReset(false);
      toast('Nyt link');
    } catch { toast('Det lykkedes ikke'); }
  };

  return (
    <Sheet title="Kalender" onClose={closeSheet}>
      <div className="seg" role="radiogroup" aria-label="Hvilke events">
        <button role="radio" aria-checked={scope === 'mine'} onClick={() => setScope('mine')}>Mine</button>
        <button role="radio" aria-checked={scope === 'all'} onClick={() => setScope('all')}>Alle</button>
      </div>
      {err && <p className="form-err">{err}</p>}
      <div className="opt-list" style={{ marginTop: 14 }}>
        <a className="opt-item" href={webcal || undefined} aria-disabled={!url} onClick={demoOnly}>
          <span className="opt-ic"><Icon name="calplus" /></span><span>iPhone og Mac</span><Icon name="chev" className="chev" />
        </a>
        <a className="opt-item" href={google || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url} onClick={demoOnly}>
          <span className="opt-ic"><Icon name="cal" /></span><span>Google Kalender</span><Icon name="chev" className="chev" />
        </a>
        <a className="opt-item" href={outlook || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url} onClick={demoOnly}>
          <span className="opt-ic"><Icon name="cal" /></span><span>Outlook</span><Icon name="chev" className="chev" />
        </a>
        <button type="button" className="opt-item" onClick={copy} disabled={!url}>
          <span className="opt-ic"><Icon name="link" /></span><span>Kopiér link</span><Icon name="copy" className="chev" />
        </button>
      </div>
      {url && <p className="cal-url" aria-label="Dit kalenderlink">{url}</p>}
      <p className="small muted" style={{ marginTop: 10 }}>Personligt link. Del det ikke.</p>
      <button type="button" className={'btn btn-quiet btn-sm' + (confirmReset ? ' danger confirm' : '')} onClick={reset} disabled={!url}>
        <Icon name="refresh" />{confirmReset ? 'Tryk igen' : 'Nyt link'}
      </button>
    </Sheet>
  );
}
