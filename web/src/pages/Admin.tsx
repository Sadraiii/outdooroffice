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
    try { await api.saveInstagramToken(token); setToken(''); toast('Adgangsnøglen er gemt', { body: 'Opslagene hentes om et øjeblik.' }); }
    catch { toast('Nøglen blev ikke gemt.'); }
    setBusy(false);
  };
  return (
    <>
      <section className="intro"><p className="eyebrow">Kun for admins</p><h1 className="h1">Admin</h1></section>
      <section className="card stack-v" style={{ marginTop: 14 }}>
        <h2 className="h3">Vejr</h2>
        <p className="small muted">Events viser vejrudsigten for holdets by, og påmindelserne fortæller, hvordan vejret bliver. Arrangøren kan vælge en anden by på det enkelte event.</p>
        <PlacePicker value={team.weather} busy={savingTown} onChange={async (p) => {
          setSavingTown(true);
          try { await api.saveTeamSettings({ weather: p }); toast(p ? `Vejret hentes nu for ${p.name}` : 'Byen er fjernet'); } catch { toast('Byen blev ikke gemt.'); }
          setSavingTown(false);
        }} />
      </section>
      <section className="card stack-v" style={{ marginTop: 14 }}>
        <h2 className="h3">Instagram</h2>
        {instagram ? (
          <p className="small">
            {instagram.error ? <span className="danger">Fejl ved sidste hentning: {instagram.error}</span> : <>Forbundet til <b>@{instagram.username}</b>. {instagram.posts.length} opslag, hentet {ago(instagram.updatedAt)}.</>}
          </p>
        ) : <p className="small muted">Ikke forbundet endnu. Opslagene vises øverst i feedet, når nøglen er gemt.</p>}
        <div className="field">
          <label htmlFor="ig-token">Adgangsnøgle fra Meta (Instagram API)</label>
          <input id="ig-token" type="password" autoComplete="off" value={token} placeholder="Indsæt nøglen her" onChange={(e) => setToken(e.target.value)} />
        </div>
        <button className="btn btn-ink" disabled={busy || !token.trim()} onClick={saveToken}><Icon name="insta" />Gem og hent opslag</button>
        <p className="small muted">Nøglen kan ikke læses i appen igen. Serveren fornyer den automatisk, så den ikke udløber.</p>
      </section>
      <div className="sec-head"><h2 className="h2">Roller</h2></div>
      <p className="small muted" style={{ marginBottom: 6 }}>Admins kan oprette OFFICIAL EVENTS og redigere alle events.</p>
      <ul className="toggle-list">
        {list.map((u) => (
          <li className="toggle-row" key={u.id} style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
            <Avatar uid={u.id} size="sm" />
            <div><b>{u.name}{u.id === me.id ? ' (dig)' : ''}</b><span>{u.role === 'admin' ? 'Admin' : 'Medlem'}</span></div>
            <Switch on={u.role === 'admin'} label={`Admin: ${u.name}`} onChange={async (v) => {
              if (u.id === me.id && !v && list.filter((x) => x.role === 'admin').length < 2) { toast('Der skal være mindst én admin.'); return; }
              try { await api.setRole(u.id, v ? 'admin' : 'member'); toast(v ? `${u.name} er nu admin` : `${u.name} er ikke længere admin`); } catch { toast('Rollen blev ikke ændret.'); }
            }} />
          </li>
        ))}
      </ul>
    </>
  );
}
