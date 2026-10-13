import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../state';
import { Seal } from './bits';
import { Icon, type IconName } from './Icon';

export function Header() {
  const { unread } = useApp();
  return (
    <header className="top">
      <Link to="/" className="brand" aria-label="Outdoor Office, til feed"><Seal /><span className="wm">Outdoor Office</span></Link>
      <div className="top-actions">
        <Link to="/notifikationer" className="bell" aria-label={unread ? `Notifikationer, ${unread} nye` : 'Notifikationer'}>
          <Icon name="bell" />
          {unread > 0 && <span className="dot-count">{unread > 9 ? '9+' : unread}</span>}
        </Link>
      </div>
    </header>
  );
}

export function TabBar() {
  const { me, openSheet } = useApp();
  const loc = useLocation();
  const p = loc.pathname;
  const tabs: { to: string; label: string; icon: IconName; active: boolean }[] = [
    { to: '/', label: 'Feed', icon: 'feed', active: p === '/' || p.startsWith('/a/') },
    { to: '/events', label: 'Events', icon: 'cal', active: p.startsWith('/events') || p.startsWith('/e/') },
    { to: '/community', label: 'Community', icon: 'users', active: p.startsWith('/community') || (p.startsWith('/u/') && p !== `/u/${me?.id}`) },
    { to: `/u/${me?.id}`, label: 'Mig', icon: 'user', active: p === `/u/${me?.id}` || p === '/notifikationer' || p === '/admin' || p === '/savner' },
  ];
  const tab = (t: (typeof tabs)[number]) => (
    <Link key={t.to} to={t.to} className={'tab' + (t.active ? ' active' : '')} aria-current={t.active ? 'page' : undefined}>
      <Icon name={t.icon} /><span>{t.label}</span>
    </Link>
  );
  return (
    <nav className="tabbar" aria-label="Hovedmenu">
      <div className="tabbar-in">
        {tab(tabs[0])}{tab(tabs[1])}
        <button className="tab" onClick={() => openSheet({ type: 'create' })} aria-label="Del træning eller opret event">
          <span className="tab-plus"><Icon name="plus" /></span>
        </button>
        {tab(tabs[2])}{tab(tabs[3])}
      </div>
    </nav>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  const nav = useNavigate();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className="toast" onClick={() => { dismissToast(t.id); if (t.link) nav(t.link); }}>
          <b>{t.title}</b>{t.body && <span>{t.body}</span>}
        </button>
      ))}
    </div>
  );
}
