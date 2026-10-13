import { useState } from 'react';
import { useApp } from '../state';
import { cleanHandle } from '../lib/format';
import { Seal } from '../components/bits';
import { Icon } from '../components/Icon';

export function Splash({ text }: { text?: string }) {
  return <div className="app bare"><section className="splash"><Seal size="xl" /><p className="muted">{text || 'Henter …'}</p></section></div>;
}

export function SetupMissing() {
  return (
    <div className="app bare">
      <section className="splash" style={{ textAlign: 'left', justifyItems: 'start' }}>
        <Seal size="lg" />
        <h1 className="h1">Firebase mangler</h1>
        <p className="lede">Kopiér <code>web/.env.example</code> til <code>web/.env.local</code> og udfyld den.</p>
        <p className="muted small">Demo: <code>npm run demo</code></p>
      </section>
    </div>
  );
}

const authError = (e: unknown) => {
  const code = (e as { code?: string })?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Forkert e-mail eller adgangskode';
  if (code.includes('email-already-in-use')) return 'E-mailen er allerede i brug';
  if (code.includes('weak-password')) return 'Mindst 6 tegn';
  if (code.includes('invalid-email')) return 'Ugyldig e-mail';
  if (code.includes('popup-closed')) return '';
  if (code.includes('network')) return 'Ingen forbindelse';
  if (code.includes('operation-not-allowed')) return 'Login-metoden er ikke slået til i Firebase';
  if (code.includes('configuration-not-found')) return 'Firebase Authentication er ikke sat op';
  if (code.includes('unauthorized-domain')) return 'Domænet er ikke godkendt i Firebase';
  if (code.includes('api-key') || code.includes('app-not-authorized')) return 'Forkert Firebase-nøgle';
  if (code.includes('too-many-requests')) return 'For mange forsøg. Prøv igen senere.';
  return `Det lykkedes ikke${code ? ` (${code})` : ''}`;
};

export function LoginPage() {
  const { api } = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); setInfo(''); try { await fn(); } catch (e) { setErr(authError(e)); } setBusy(false); };
  return (
    <div className="app bare">
      <section className="auth">
        <div className="auth-head">
          <Seal size="xl" />
          <h1 className="h1">Outdoor<br />Office</h1>
        </div>
        <form className="form" onSubmit={(e) => { e.preventDefault(); run(() => (mode === 'in' ? api.signInEmail(email.trim(), pw) : api.signUpEmail(email.trim(), pw))); }}>
          <div className="field"><label htmlFor="l-email">E-mail</label><input id="l-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label htmlFor="l-pw">Adgangskode</label><input id="l-pw" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
          <button className="btn btn-primary btn-wide" type="submit" disabled={busy}>{mode === 'in' ? 'Log ind' : 'Opret konto'}</button>
          <div className="tags" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); }}>{mode === 'in' ? 'Opret konto' : 'Log ind'}</button>
            {mode === 'in' && <button type="button" className="link" onClick={() => (email.trim() ? run(async () => { await api.resetPassword(email.trim()); setInfo('Tjek din e-mail'); }) : setErr('Skriv din e-mail'))}>Glemt adgangskode?</button>}
          </div>
          {err && <p className="form-err" role="alert">{err}</p>}
          {info && <p className="banner">{info}</p>}
        </form>
        <p className="or">eller</p>
        <button className="btn btn-outline btn-wide" disabled={busy} onClick={() => run(() => api.signInGoogle())}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
          Fortsæt med Google
        </button>
      </section>
    </div>
  );
}

export function Onboarding() {
  const { api, user } = useApp();
  const [name, setName] = useState(user?.displayName || '');
  const [ig, setIg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!user) return;
    if (!name.trim()) { setErr('Skriv dit navn'); return; }
    setBusy(true); setErr('');
    try { await api.createProfile(user.uid, { name: name.trim().slice(0, 40), instagram: cleanHandle(ig), photoURL: user.photoURL }); }
    catch { setErr('Det lykkedes ikke. Prøv igen.'); setBusy(false); }
  };
  return (
    <div className="app bare">
      <section className="auth">
        <div className="welcome" style={{ justifyItems: 'start', textAlign: 'left' }}>
          <Seal size="xl" />
          <h1 className="h1">Velkommen</h1>
        </div>
        <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="field"><label htmlFor="o-name">Navn</label><input id="o-name" maxLength={40} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="o-ig">Instagram</label><input id="o-ig" maxLength={60} autoCapitalize="none" autoCorrect="off" placeholder="@brugernavn" value={ig} onChange={(e) => setIg(e.target.value)} /></div>
          <button className="btn btn-primary btn-wide" type="submit" disabled={busy}>Kom i gang<Icon name="chev" /></button>
          {err && <p className="form-err" role="alert">{err}</p>}
        </form>
        <button className="link" onClick={() => api.signOut()}>Log ud</button>
      </section>
    </div>
  );
}
