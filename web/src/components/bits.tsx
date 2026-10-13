import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EventDoc } from '../api/types';
import { useApp } from '../state';
import { DAYS_S, MONTHS_S, dateOf } from '../lib/dates';
import { initials } from '../lib/format';
import { Icon } from './Icon';

const AV_COLORS = ['#5A3E8A', '#2E6E62', '#8A4B2E', '#3E5A8A', '#7A3E5E', '#4E6B2E', '#2E4E6E', '#6B5A2E', '#7A5A1E', '#3E3E7A'];
export function colorFor(uid: string) {
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}

type Size = 'xs' | 'sm' | 'md' | 'xl';

export function Avatar({ uid, size = 'md' }: { uid: string; size?: Size }) {
  const { users } = useApp();
  const u = users.get(uid);
  if (u?.photoURL) return <img className={`av av-${size}`} src={u.photoURL} alt="" loading="lazy" />;
  return <span className={`av av-${size} av-i`} style={{ ['--c' as string]: colorFor(uid) }} aria-hidden="true">{u ? initials(u.name) : '?'}</span>;
}

export function AvatarStack({ uids, max = 5, size = 'sm' }: { uids: string[]; max?: number; size?: Size }) {
  if (!uids.length) return null;
  return (
    <span className="stack">
      {uids.slice(0, max).map((u) => <Avatar key={u} uid={u} size={size} />)}
      {uids.length > max && <span className={`av av-${size} av-more`}>+{uids.length - max}</span>}
    </span>
  );
}

export const Seal = ({ size }: { size?: 'sm' | 'lg' | 'xl' }) => <span className={'seal' + (size ? ' seal-' + size : '')} aria-hidden="true" />;

export function Bib({ date, size }: { date: string; size?: 'lg' | 'xs' }) {
  const d = dateOf(date);
  if (!d) return <div className={'bib ' + (size || '')} aria-hidden="true"><span className="bib-n">?</span></div>;
  return (
    <div className={'bib ' + (size || '')} aria-hidden="true">
      <span className="bib-d">{DAYS_S[d.getDay()]}</span><span className="bib-n">{d.getDate()}</span><span className="bib-m">{MONTHS_S[d.getMonth()]}</span>
    </div>
  );
}

export function EventBadge({ ev }: { ev: Pick<EventDoc, 'official'> }) {
  return ev.official
    ? <span className="evb evb-official"><Seal />Official event</span>
    : <span className="evb evb-community">Community made event</span>;
}

export function UserLink({ uid, children, className }: { uid: string; children: ReactNode; className?: string }) {
  return <Link to={`/u/${uid}`} className={'plain ' + (className || '')}>{children}</Link>;
}

export function FollowButton({ uid }: { uid: string }) {
  const { api, me, following, toast, nameOf } = useApp();
  if (!me || uid === me.id) return null;
  const on = following.has(uid);
  const click = async () => {
    try {
      if (on) await api.unfollow(me.id, uid);
      else { await api.follow(me.id, uid); toast(`Du følger ${nameOf(uid)}`); }
    } catch { toast('Det lykkedes ikke. Prøv igen.'); }
  };
  return (
    <button className={'follow-btn' + (on ? ' on' : '')} onClick={click} aria-pressed={on}>
      {on ? <><Icon name="check" />Følger</> : <><Icon name="plus" />Følg</>}
    </button>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export const Skeleton = () => <div className="skel" aria-hidden="true"><div className="sk" /><div className="sk" /><div className="sk" /></div>;
