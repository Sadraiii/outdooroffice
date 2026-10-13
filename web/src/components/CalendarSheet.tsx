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
      .catch(() => { if (alive) setErr('Linket kunne ikke hentes. Tjek forbindelsen og prøv igen.'); });
    return () => { alive = false; };
  }, [api, me, scope, links]);
  useEffect(() => setConfirmReset(false), [scope]);

  const webcal = url ? url.replace(/^https?:/, 'webcal:') : '';
  const demoOnly = (e: MouseEvent) => {
    if (!DEMO) return;
    e.preventDefault();
    toast('På telefonen åbner kalenderen her', { body: 'Den spørger, om du vil abonnere. Derefter kommer dine events selv med.' });
  };
  const google = url ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` : '';
  const outlook = url ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent('Outdoor Office')}` : '';
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast('Linket er kopieret', { body: 'Indsæt det i din kalender under "Tilføj kalender fra URL".' }); }
    catch { toast('Linket kunne ikke kopieres. Markér det og kopiér selv.'); }
  };
  const reset = async () => {
    if (!me) return;
    if (!confirmReset) { setConfirmReset(true); return; }
    try {
      const u = await api.calendarLink(me.id, scope, true);
      setLinks((l) => ({ ...l, [scope]: u })); setConfirmReset(false);
      toast('Nyt link lavet', { body: 'Det gamle virker ikke længere. Abonnér igen med det nye.' });
    } catch { toast('Det lykkedes ikke. Prøv igen.'); }
  };

  return (
    <Sheet title="Kalender" onClose={closeSheet}>
      <p className="lede" style={{ marginTop: 0 }}>Få dine events direkte i telefonens kalender. Nye tilmeldinger, ændringer og aflysninger kommer automatisk med.</p>
      <div className="seg" role="radiogroup" aria-label="Hvilke events" style={{ marginTop: 14 }}>
        <button role="radio" aria-checked={scope === 'mine'} onClick={() => setScope('mine')}>Mine events</button>
        <button role="radio" aria-checked={scope === 'all'} onClick={() => setScope('all')}>Alle events</button>
      </div>
      <p className="small muted" style={{ marginTop: -6 }}>{scope === 'mine' ? 'Dem du er tilmeldt eller står på venteliste til.' : 'Alle holdets events, også dem du ikke er tilmeldt.'}</p>
      {err && <p className="form-err">{err}</p>}
      <div className="actions-grid" style={{ marginTop: 14 }}>
        <a className={'action-tile' + (url ? '' : ' is-busy')} href={webcal || undefined} aria-disabled={!url} onClick={demoOnly}>
          <span className="ic-big"><Icon name="calplus" /></span>
          <span><b>iPhone og Mac</b><span>Åbner Kalender-appen, som spørger, om du vil abonnere</span></span>
        </a>
        <a className={'action-tile' + (url ? '' : ' is-busy')} href={google || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url} onClick={demoOnly}>
          <span className="ic-big"><Icon name="cal" /></span>
          <span><b>Google Kalender</b><span>Virker også på Android. Google opdaterer et par gange i døgnet</span></span>
        </a>
        <a className={'action-tile' + (url ? '' : ' is-busy')} href={outlook || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url} onClick={demoOnly}>
          <span className="ic-big"><Icon name="cal" /></span>
          <span><b>Outlook</b><span>Outlook.com og Outlook-appen</span></span>
        </a>
        <button className="action-tile" onClick={copy} disabled={!url}>
          <span className="ic-big"><Icon name="link" /></span>
          <span><b>Kopiér link</b><span>Til andre kalendere: tilføj kalender fra URL</span></span>
        </button>
      </div>
      {url && <p className="cal-url" aria-label="Dit kalenderlink">{url}</p>}
      <p className="small muted" style={{ marginTop: 10 }}>Linket er personligt, så del det ikke. Har du delt det ved en fejl, så lav et nyt.</p>
      <button type="button" className={'btn btn-quiet btn-sm' + (confirmReset ? ' danger confirm' : '')} onClick={reset} disabled={!url}>
        <Icon name="refresh" />{confirmReset ? 'Tryk igen: det gamle link holder op med at virke' : 'Lav et nyt link'}
      </button>
    </Sheet>
  );
}
