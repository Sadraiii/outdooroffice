import type { NotifyPrefs } from './types';

export const DEFAULT_NOTIFY: NotifyPrefs = {
  activity: true,
  rsvp: true,
  follows: true,
  social: true,
  official: true,
  community: true,
  reminders: true,
};

export const NOTIFY_LABELS: Record<keyof NotifyPrefs, { title: string; sub: string }> = {
  reminders: { title: 'Påmindelser', sub: 'Før events du er tilmeldt: 2 timer før, eller aftenen før morgentræning' },
  activity: { title: 'Træninger', sub: 'Når nogen du følger deler en træning eller når et mål' },
  rsvp: { title: 'Tilmeldinger', sub: 'Når nogen du følger tilmelder sig et event' },
  official: { title: 'OFFICIAL EVENTS', sub: 'Nye events fra Outdoor Office' },
  community: { title: 'COMMUNITY MADE EVENTS', sub: 'Når nogen du følger opretter et event' },
  follows: { title: 'Nye følgere', sub: 'Når nogen begynder at følge dig' },
  social: { title: 'High fives og kommentarer', sub: 'På dine træninger og tilmeldinger til dine events' },
};
