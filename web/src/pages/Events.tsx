import { useMemo, useState } from 'react';
import type { EventDoc, Sport } from '../api/types';
import { useApp } from '../state';
import { bySort, isPast } from '../lib/dates';
import { sportLabel } from '../lib/sports';
import { EventSlot, byDay, dayLabel } from '../components/EventCards';
import { Skeleton } from '../components/bits';
import { Icon } from '../components/Icon';

type Kind = 'all' | 'official' | 'community';

export function EventsPage() {
  const { events, eventsReady, openSheet } = useApp();
  const [kind, setKind] = useState<Kind>('all');
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [showPast, setShowPast] = useState(false);

  const byKind = useMemo(() => events.filter((e) => kind === 'all' || (kind === 'official' ? e.official : !e.official)), [events, kind]);
  const upcoming = byKind.filter((e) => !isPast(e)).sort(bySort);
  const past = byKind.filter(isPast).sort(bySort).reverse();
  const sports = [...new Set(upcoming.map((e) => e.sport))];
  const shown = upcoming.filter((e) => sport === 'all' || e.sport === sport);
  const next = shown[0];

  return (
    <>
      <div className="intro-row">
        <section className="intro"><p className="eyebrow">Tilmeld dig</p><h1 className="h1">Events</h1></section>
        <button className="btn btn-outline btn-sm" onClick={() => openSheet({ type: 'event' })}><Icon name="plus" />Opret event</button>
      </div>
      <div className="seg" role="tablist" aria-label="Vis events" style={{ marginTop: 14 }}>
        <button role="tab" aria-selected={kind === 'all'} onClick={() => setKind('all')}>Alle</button>
        <button role="tab" aria-selected={kind === 'official'} onClick={() => setKind('official')}>Official</button>
        <button role="tab" aria-selected={kind === 'community'} onClick={() => setKind('community')}>Community</button>
      </div>
      {sports.length > 1 && (
        <div className="chips" role="group" aria-label="Filtrér efter sport">
          <button className="chip" aria-pressed={sport === 'all'} onClick={() => setSport('all')}>Alle sportsgrene</button>
          {sports.map((s) => <button key={s} className="chip" aria-pressed={sport === s} onClick={() => setSport(s)}>{sportLabel(s)}</button>)}
        </div>
      )}
      {!eventsReady ? <Skeleton /> : !next ? (
        <section className="empty-box">
          <h2 className="h2">{kind === 'community' ? 'Ingen community-events' : 'Ingen kommende events'}</h2>
          <p className="muted">Opret et event, så andre kan tilmelde sig. Dem der følger dig får besked.</p>
          <button className="btn btn-primary" onClick={() => openSheet({ type: 'event' })}><Icon name="plus" />Opret event</button>
        </section>
      ) : (
        <Schedule list={shown} />
      )}
      {past.length > 0 && (
        <>
          <button className="past-toggle" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}><Icon name="chev" />Tidligere ({past.length})</button>
          {showPast && <Schedule list={past.slice(0, 15)} />}
        </>
      )}
    </>
  );
}

function Schedule({ list }: { list: EventDoc[] }) {
  return (
    <div className="schedule">
      {byDay(list).map(([date, evs]) => (
        <section key={date} className="day-group" aria-label={dayLabel(date)}>
          <h2 className="day-band"><span>{dayLabel(date)}</span>{evs.length > 1 && <small>{evs.length} events</small>}</h2>
          <ol className="slots">{evs.map((e) => <li key={e.id}><EventSlot ev={e} /></li>)}</ol>
        </section>
      ))}
    </div>
  );
}
