export type Unsub = () => void;

export type Sport =
  | 'calisthenics' | 'fitness' | 'lob' | 'cykling' | 'gang' | 'yoga' | 'vinterbadning' | 'socialt' | 'andet';
export type Unit = 'reps' | 'sek' | 'min' | 'km' | 'm';
export type Role = 'member' | 'admin';

export interface Exercise { id: string; name: string; target: number; unit: Unit }

export interface NotifyPrefs {
  activity: boolean;
  rsvp: boolean;
  follows: boolean;
  social: boolean;
  official: boolean;
  community: boolean;
  reminders: boolean;
}

import type { AddressHit } from '../lib/address';
export type { AddressHit };

export interface GeoPlace { name: string; lat: number; lon: number; region?: string }

export interface UserStats {
  trainings: number;
  streak: number;
  bestStreak: number;
  lastWeek: number;
  mornings: number;
  winter: number;
  sports: number;
  lastDate: string;
  weeks: Record<string, number>;
  bestWeek: number;
  weekends: number;
  evenings: number;
  comebacks: number;
  seasons: number;
  bySport: Record<string, number>;
}

export interface UserProfile {
  id: string;
  name: string;
  bio: string;
  instagram: string;
  photoURL: string | null;
  role: Role;
  createdAt: number;
  followers: number;
  following: number;
  notify: NotifyPrefs;
  stats: UserStats | null;
  badges: Record<string, number>;
}

export interface AuthUser { uid: string; email: string | null; displayName: string | null; photoURL: string | null }

export interface EventDoc {
  id: string;
  title: string;
  sport: Sport;
  official: boolean;
  createdBy: string;
  coachId: string | null;
  date: string;
  time: string;
  duration: number | null;
  place: string;
  note: string;
  exercises: Exercise[];
  createdAt: number;
  updatedAt?: number;
  going: string[];
  goingCount: number;
  capacity: number | null;
  signupUntil: number | null;
  photoPolicy: PhotoPolicy;
  waitlist: string[];
  photoCount: number;
  cover: string | null;
  cancelled: boolean;
  cancelNote: string;
  geo: GeoPlace | null;
  checkinFrom: number | null;
  checkinUntil: number | null;
  seriesId?: string;
  cohosts: string[];
  feedbackCount: number;
  feedbackSum: number;
}

export type PhotoPolicy = 'all' | 'host';

export interface EventPhoto {
  id: string;
  uid: string;
  url: string;
  w: number;
  h: number;
  at: number;
  host: boolean;
}

export type EventInput = Pick<EventDoc, 'title' | 'sport' | 'official' | 'date' | 'time' | 'duration' | 'place' | 'note' | 'exercises' | 'capacity' | 'signupUntil' | 'photoPolicy' | 'geo' | 'cohosts'> & {
  coachId?: string | null;
  seriesId?: string;
  seriesIndex?: number;
};

export interface Rsvp { uid: string; at: number }

export interface Progress { uid: string; counts: Record<string, number>; updatedAt: number; done: boolean }

export interface Checkin { uid: string; at: number; by: string }

export interface TeamSettings { weather: GeoPlace | null }

export interface Feedback { uid: string; rating: number; text: string; at: number }

export interface Nudge { id: string; from: string; to: string; text: string; eventId?: string; at: number; status?: 'sent' | 'skipped'; sentAt?: number }

export interface Forecast {
  hours: { t: number; temp: number; feels: number; code: number; pop: number; wind: number }[];
  days: { date: string; max: number; min: number; code: number; pop: number; wind: number }[];
  fetchedAt: number;
}

export type ActivityKind = 'workout' | 'post' | 'rsvp' | 'goal' | 'event' | 'badge';

export interface RepLine { name: string; count: number; unit?: Unit }

export interface Activity {
  id: string;
  uid: string;
  kind: ActivityKind;
  sport?: Sport;
  title?: string;
  text?: string;
  distanceKm?: number;
  durationSec?: number;
  reps?: RepLine[];
  eventId?: string;
  photoURL?: string;
  official?: boolean;
  badge?: string;
  createdAt: number;
  kudos: number;
  comments: number;
}

export type ActivityInput = Omit<Activity, 'id' | 'uid' | 'createdAt' | 'kudos' | 'comments' | 'kind'> & { kind: 'workout' };

export interface Comment { id: string; uid: string; text: string; at: number }

export interface Notice {
  id: string;
  type: string;
  actorId?: string;
  title: string;
  body: string;
  link: string;
  at: number;
  read: boolean;
}

export interface InstagramPost { id: string; type: string; image: string; permalink: string; at: string }
export interface InstagramFeed { username: string; posts: InstagramPost[]; updatedAt: number; error?: string }

export type PushState = 'unsupported' | 'needs-install' | 'default' | 'denied' | 'granted';

export interface ProfileInput { name: string; bio?: string; instagram?: string; photoURL?: string | null }

export interface Api {
  mode: 'firebase' | 'demo';
  features: { push: boolean; calendarFeed: boolean; reminders: boolean };
  refreshMyStats?(uid: string): Promise<void>;
  refreshInstagram?(): Promise<void>;

  onAuth(cb: (u: AuthUser | null) => void): Unsub;
  signInEmail(email: string, password: string): Promise<void>;
  signUpEmail(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signInGoogle(): Promise<void>;
  signOut(): Promise<void>;

  watchProfile(uid: string, cb: (p: UserProfile | null) => void): Unsub;
  createProfile(uid: string, data: ProfileInput): Promise<void>;
  updateProfile(uid: string, patch: Partial<Pick<UserProfile, 'name' | 'bio' | 'instagram' | 'photoURL' | 'notify'>>): Promise<void>;
  watchUsers(cb: (users: UserProfile[]) => void): Unsub;
  setRole(uid: string, role: Role): Promise<void>;
  uploadImage(uid: string, kind: 'avatar' | 'activity', blob: Blob): Promise<string>;

  watchFollowing(uid: string, cb: (ids: Set<string>) => void): Unsub;
  watchFollowers(uid: string, cb: (ids: Set<string>) => void): Unsub;
  follow(me: string, other: string): Promise<void>;
  unfollow(me: string, other: string): Promise<void>;

  watchEvents(cb: (events: EventDoc[]) => void): Unsub;
  watchEvent(id: string, cb: (event: EventDoc | null) => void): Unsub;
  watchMyRsvps(uid: string, cb: (eventIds: Set<string>) => void): Unsub;
  setRsvp(eventId: string, uid: string, going: boolean): Promise<void>;
  watchRsvps(eventId: string, cb: (list: Rsvp[]) => void): Unsub;
  createEvent(uid: string, data: EventInput): Promise<string>;
  updateEvent(id: string, data: EventInput, by: string): Promise<void>;
  setCancelled(id: string, by: string, cancelled: boolean, note: string): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  watchCheckins(eventId: string, cb: (list: Checkin[]) => void): Unsub;
  setCheckin(eventId: string, uid: string, by: string, on: boolean): Promise<void>;
  watchMyFeedback(eventId: string, uid: string, cb: (f: Feedback | null) => void): Unsub;
  watchFeedback(eventId: string, cb: (list: Feedback[]) => void): Unsub;
  setFeedback(eventId: string, uid: string, rating: number, text: string): Promise<void>;
  watchNudges(cb: (list: Nudge[]) => void): Unsub;
  sendNudge(from: string, to: string, text: string, eventId?: string): Promise<void>;
  watchProgress(eventId: string, cb: (list: Progress[]) => void): Unsub;
  watchEventPhotos(eventId: string, cb: (list: EventPhoto[]) => void): Unsub;
  addEventPhoto(eventId: string, uid: string, blob: Blob, host: boolean): Promise<void>;
  deleteEventPhoto(eventId: string, photoId: string): Promise<void>;
  setProgress(eventId: string, uid: string, counts: Record<string, number>, done: boolean): Promise<void>;

  watchFeed(cb: (list: Activity[]) => void): Unsub;
  watchUserActivities(uid: string, cb: (list: Activity[]) => void): Unsub;
  watchActivity(id: string, cb: (a: Activity | null) => void): Unsub;
  createActivity(uid: string, data: ActivityInput): Promise<string>;
  deleteActivity(id: string): Promise<void>;
  watchMyKudos(uid: string, cb: (activityIds: Set<string>) => void): Unsub;
  setKudos(activityId: string, uid: string, on: boolean): Promise<void>;
  watchKudos(activityId: string, cb: (uids: string[]) => void): Unsub;
  watchComments(activityId: string, cb: (list: Comment[]) => void): Unsub;
  addComment(activityId: string, uid: string, text: string): Promise<void>;
  deleteComment(activityId: string, commentId: string): Promise<void>;

  watchNotifications(uid: string, cb: (list: Notice[]) => void): Unsub;
  markRead(uid: string, ids: string[]): Promise<void>;
  pushState(): Promise<PushState>;
  enablePush(uid: string): Promise<PushState>;
  onForegroundMessage(cb: (n: { title: string; body: string; link?: string }) => void): Unsub;

  watchInstagram(cb: (feed: InstagramFeed | null) => void): Unsub;
  saveInstagramToken(token: string): Promise<void>;

  watchTeamSettings(cb: (s: TeamSettings) => void): Unsub;
  saveTeamSettings(s: TeamSettings): Promise<void>;
  searchPlaces(q: string): Promise<GeoPlace[]>;
  searchAddresses(q: string, near?: GeoPlace | null, signal?: AbortSignal): Promise<AddressHit[]>;
  getForecast(place: GeoPlace): Promise<Forecast>;
  calendarLink(uid: string, scope: 'mine' | 'all', reset?: boolean): Promise<string>;
}
