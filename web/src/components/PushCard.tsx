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
      if (r === 'granted') toast('Push slået til');
      else if (r === 'denied') toast('Push afvist');
    } catch { toast('Push kunne ikke slås til'); }
    setBusy(false);
  };
  const hide = () => { try { localStorage.setItem(HIDE_KEY, '1'); } catch {  } setGone(true); };

  let title = '', body: ReactNode = null, action: ReactNode = null;
  switch (st) {
    case 'needs-install':
      title = 'Push på iPhone';
      body = (
        <ol className="steps">
          <li><b>Del</b> i Safari</li>
          <li><b>Føj til hjemmeskærm</b></li>
          <li>Åbn appen derfra</li>
        </ol>
      );
      break;
    case 'default':
      title = 'Push-beskeder';
      action = <button className="btn btn-primary" disabled={busy} onClick={enable}><Icon name="bell" />Slå til</button>;
      break;
    case 'granted':
      title = 'Push er slået til';
      break;
    case 'denied':
      title = 'Push er slået fra';
      body = <p className="muted small">Slå det til i telefonens indstillinger.</p>;
      break;
    default:
      title = 'Push virker ikke i denne browser';
      body = <p className="muted small">Brug Safari på iPhone eller Chrome på Android.</p>;
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
