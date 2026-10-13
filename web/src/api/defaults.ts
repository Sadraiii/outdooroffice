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

export const NOTIFY_LABELS: Record<keyof NotifyPrefs, string> = {
  reminders: 'Påmindelser',
  activity: 'Træninger',
  rsvp: 'Tilmeldinger',
  official: 'OFFICIAL EVENTS',
  community: 'COMMUNITY MADE EVENTS',
  follows: 'Nye følgere',
  social: 'High fives og kommentarer',
};
