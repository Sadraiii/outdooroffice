import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NotifyPrefs } from '../api/types';
import { useApp } from '../state';
import { NOTIFY_LABELS } from '../api/defaults';
import { ago } from '../lib/dates';
import { PushCard } from '../components/PushCard';
import { Avatar, Switch } from '../components/bits';
import { Icon } from '../components/Icon';

export function NotificationsPage() {
  const { api, me, notices, toast } = useApp();
  const [fresh] = useState(() => new Set(notices.filter((n) => !n.read).map((n) => n.id)));
  const [showPrefs, setShowPrefs] = useState(false);
  useEffect(() => {
    const ids = notices.filter((n) => !n.read).map((n) => n.id);
    if (me && ids.length) { const t = setTimeout(() => api.markRead(me.id, ids).catch(() => undefined), 1200); return () => clearTimeout(t); }
  }, [api, me, notices]);
  if (!me) return null;
  const setPref = async (k: keyof NotifyPrefs, v: boolean) => {
    try { await api.updateProfile(me.id, { notify: { ...me.notify, [k]: v } }); } catch { toast('Indstillingen blev ikke gemt.'); }
  };
  return (
    <>
      <div className="intro-row">
        <section className="intro"><p className="eyebrow">Beskeder</p><h1 className="h1">Notifikationer</h1></section>
        <button className="icon-btn" onClick={() => setShowPrefs(!showPrefs)} aria-expanded={showPrefs} aria-label="Indstillinger for beskeder"><Icon name="settings" /></button>
      </div>
      <PushCard />
      {showPrefs && (
        <section className="card" style={{ marginTop: 12 }}>
          <h2 className="h3">Giv mig besked om</h2>
          <ul className="toggle-list">
            {(Object.keys(NOTIFY_LABELS) as (keyof NotifyPrefs)[]).filter((k) => k !== 'reminders' || api.features.reminders).map((k) => (
              <li className="toggle-row" key={k}>
                <div><b>{NOTIFY_LABELS[k].title}</b><span>{NOTIFY_LABELS[k].sub}</span></div>
                <Switch on={me.notify[k]} onChange={(v) => setPref(k, v)} label={NOTIFY_LABELS[k].title} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {!showPrefs && <button className="link" style={{ marginTop: 10 }} onClick={() => setShowPrefs(true)}><Icon name="settings" />Vælg hvad du får besked om</button>}
      <div className="sec-head"><h2 className="h2">Seneste</h2></div>
      {notices.length ? (
        <ul className="inbox">
          {notices.map((n) => (
            <li key={n.id}>
              <Link to={n.link || '/'} className={'notice' + (fresh.has(n.id) ? ' unread' : '')}>
                {n.actorId ? <Avatar uid={n.actorId} /> : <span className="seal" />}
                <div><b>{n.title}</b><span>{n.body}</span></div>
                <time>{ago(n.at)}</time>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="muted">Ingen beskeder endnu. Følg dem du træner med, så dukker de op her.</p>}
    </>
  );
}
