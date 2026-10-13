import { useEffect, useState } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Api } from './api/types';
import { DEMO, configured, loadApi } from './api';
import { AppProvider, useApp } from './state';
import { Header, TabBar, Toasts } from './components/Shell';
import { SheetHost } from './components/Sheets';
import { Boundary } from './components/Boundary';
import { CelebrationLayer } from './components/Celebration';
import { MissYouPage } from './pages/MissYou';
import { FeedPage } from './pages/Feed';
import { EventsPage } from './pages/Events';
import { EventPage } from './pages/Event';
import { ActivityPage } from './pages/Activity';
import { PeoplePage } from './pages/People';
import { ProfilePage } from './pages/Profile';
import { NotificationsPage } from './pages/Notifications';
import { AdminPage } from './pages/Admin';
import { LoginPage, Onboarding, SetupMissing, Splash } from './pages/Auth';

export function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (configured) loadApi().then(setApi).catch(() => setFailed(true)); }, []);
  if (!configured) return <SetupMissing />;
  if (failed) return <Splash text="Appen kunne ikke starte. Tjek forbindelsen og genindlæs siden." />;
  if (!api) return <Splash />;
  const Router = DEMO ? MemoryRouter : BrowserRouter;
  return (
    <AppProvider api={api}>
      <Router><Gate /></Router>
    </AppProvider>
  );
}

function Gate() {
  const { authReady, user, me } = useApp();
  if (!authReady || (user && me === undefined)) return <Splash />;
  if (!user) return <LoginPage />;
  if (me === null) return <Onboarding />;
  return <Shell />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Shell() {
  const { me, sheet, celebration } = useApp();
  const { pathname } = useLocation();
  return (
    <>
      <ScrollToTop />
      <div className="app">
        <Header />
        <Boundary resetKey={pathname} fallback={<PageError />}>
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/e/:id" element={<EventPage />} />
            <Route path="/a/:id" element={<ActivityPage />} />
            <Route path="/folk" element={<PeoplePage />} />
            <Route path="/u/:id" element={<ProfilePage />} />
            <Route path="/mig" element={<Navigate to={`/u/${me!.id}`} replace />} />
            <Route path="/notifikationer" element={<NotificationsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/savner" element={<MissYouPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Boundary>
      </div>
      <TabBar />
      <Toasts />
      <Boundary resetKey={sheet} fallback={<SheetFailed />}><SheetHost /></Boundary>
      <Boundary resetKey={celebration} fallback={null}><CelebrationLayer /></Boundary>
    </>
  );
}

function SheetFailed() {
  const { closeSheet, toast } = useApp();
  useEffect(() => { closeSheet(); toast('Noget gik galt. Prøv igen.'); }, [closeSheet, toast]);
  return null;
}

function PageError() {
  return (
    <section className="empty-box">
      <h2 className="h2">Siden kunne ikke vises</h2>
      <p className="muted">Prøv at gå tilbage eller genindlæse appen.</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>Genindlæs</button>
    </section>
  );
}
