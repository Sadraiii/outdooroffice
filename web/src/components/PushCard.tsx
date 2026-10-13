import { useEffect, useState, type ReactNode } from 'react';
import type { PushState } from '../api/types';
import { useApp } from '../state';
import { Icon } from './Icon';

const HIDE_KEY = 'oo.pushPromptHidden';
const hidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };

export function usePushState() {
  const { api } = useApp();
  const [st, setSt] = useState<PushState | null>(null);
  useEffect(() => { let on = true; api.pushState().then((s) => on && setSt(s)).catch(() => on && setSt('unsupported')); return () => { on = false; }; }, [api]);
  return [st, setSt] as const;
}

export function PushCard({ compact }: { compact?: boolean }) {
  const { api, me, toast } = useApp();
  const [st, setSt] = usePushState();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(compact ? hidden() : false);
  if (!api.features.push || !st || !me || gone) return null;
  if (compact && !(st === 'default' || st === 'needs-install')) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const r = await api.enablePush(me.id);
      setSt(r);
      if (r === 'granted') toast('Push-beskeder er slået til', { body: 'Du får besked, når dem du følger er i gang.' });
      else if (r === 'denied') toast('Push blev afvist', { body: 'Du kan slå det til i telefonens indstillinger.' });
    } catch { toast('Push kunne ikke slås til. Prøv igen.'); }
    setBusy(false);
  };
  const hide = () => { try { localStorage.setItem(HIDE_KEY, '1'); } catch {  } setGone(true); };

  let title = '', body: ReactNode = null, action: ReactNode = null;
  switch (st) {
    case 'needs-install':
      title = 'Få push-beskeder på iPhone';
      body = (
        <ol className="steps">
          <li>Tryk på <b>Del</b>-knappen nederst i Safari.</li>
          <li>Vælg <b>Føj til hjemmeskærm</b>.</li>
          <li>Åbn Outdoor Office fra hjemmeskærmen og slå push til her.</li>
        </ol>
      );
      break;
    case 'default':
      title = 'Få besked, når dem du følger er i gang';
      body = <p className="muted small">Træninger, tilmeldinger, nye events og high fives. Du vælger selv hvilke.</p>;
      action = <button className="btn btn-primary" disabled={busy} onClick={enable}><Icon name="bell" />Slå push-beskeder til</button>;
      break;
    case 'granted':
      title = 'Push er slået til på denne telefon';
      body = <p className="muted small">Vælg nedenfor, hvad du vil have besked om.</p>;
      break;
    case 'denied':
      title = 'Push er slået fra';
      body = <p className="muted small">Du har afvist beskeder for appen. Slå dem til igen under Notifikationer i telefonens indstillinger for Outdoor Office.</p>;
      break;
    default:
      title = 'Push virker ikke i denne browser';
      body = <p className="muted small">På iPhone skal appen åbnes i Safari og lægges på hjemmeskærmen. På Android virker Chrome.</p>;
  }
  return (
    <section className="card push-card">
      <div className="row">
        <span className="ic-big"><Icon name={st === 'granted' ? 'check' : st === 'needs-install' ? 'phone' : 'bell'} /></span>
        <b style={{ flex: 1 }}>{title}</b>
        {compact && <button className="icon-btn" onClick={hide} aria-label="Skjul"><Icon name="close" /></button>}
      </div>
      {body}
      {action}
    </section>
  );
}
