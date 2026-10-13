import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../state';
import { ago } from '../lib/dates';
import { Avatar, Switch } from '../components/bits';
import { Icon } from '../components/Icon';
import { PlacePicker } from '../components/Weather';

export function AdminPage() {
  const { api, me, users, isAdmin, instagram, team, toast } = useApp();
  const [savingTown, setSavingTown] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  if (!isAdmin || !me) return <Navigate to="/" replace />;
  const list = [...users.values()].sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.name.localeCompare(b.name, 'da'));
  const saveToken = async () => {
    if (!token.trim()) return;
    setBusy(true);
    try { await api.saveInstagramToken(token); setToken(''); toast('Gemt'); }
    catch { toast('Ikke gemt'); }
    setBusy(false);
  };
  return (
    <>
      <section className="intro"><h1 className="h1">Admin</h1></section>
      <section className="card stack-v" style={{ marginTop: 14 }}>
        <h2 className="h3">Vejr</h2>
        <PlacePicker value={team.weather} busy={savingTown} onChange={async (p) => {
          setSavingTown(true);
          try { await api.saveTeamSettings({ weather: p }); toast(p ? p.name : 'Fjernet'); } catch { toast('Ikke gemt'); }
          setSavingTown(false);
        }} />
      </section>
      <section className="card stack-v" style={{ marginTop: 14 }}>
        <h2 className="h3">Instagram</h2>
        {instagram ? (
          <p className="small">
            {instagram.error ? <span className="danger">Fejl: {instagram.error}</span> : <><b>@{instagram.username}</b> · {instagram.posts.length} opslag · {ago(instagram.updatedAt)}</>}
          </p>
        ) : <p className="small muted">Ikke forbundet</p>}
        <div className="field">
          <label htmlFor="ig-token">Instagram-nøgle</label>
          <input id="ig-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
        <button className="btn btn-ink" disabled={busy || !token.trim()} onClick={saveToken}><Icon name="insta" />Gem</button>
      </section>
      <div className="sec-head"><h2 className="h2">Roller</h2></div>
      <ul className="toggle-list">
        {list.map((u) => (
          <li className="toggle-row" key={u.id} style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
            <Avatar uid={u.id} size="sm" />
            <div><b>{u.name}{u.id === me.id ? ' (dig)' : ''}</b><span>{u.role === 'admin' ? 'Admin' : 'Medlem'}</span></div>
            <Switch on={u.role === 'admin'} label={`Admin: ${u.name}`} onChange={async (v) => {
              if (u.id === me.id && !v && list.filter((x) => x.role === 'admin').length < 2) { toast('Der skal være mindst én admin'); return; }
              try { await api.setRole(u.id, v ? 'admin' : 'member'); toast(v ? `${u.name} er admin` : `${u.name} er medlem`); } catch { toast('Ikke ændret'); }
            }} />
          </li>
        ))}
      </ul>
    </>
  );
}
