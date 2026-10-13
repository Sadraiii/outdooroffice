import { useMemo, useState } from 'react';
import { useApp, useSub } from '../state';
import { Avatar, FollowButton, UserLink } from '../components/bits';
import { StreakChip } from '../components/Attendance';
import { Icon } from '../components/Icon';

type View = 'all' | 'following' | 'followers';

export function PeoplePage() {
  const { api, me, users, following } = useApp();
  const followers = useSub<Set<string>>((cb) => (me ? api.watchFollowers(me.id, cb) : () => undefined), [api, me?.id], new Set());
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('all');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, '');
    return [...users.values()]
      .filter((u) => u.id !== me?.id)
      .filter((u) => view === 'all' || (view === 'following' ? following.has(u.id) : followers.has(u.id)))
      .filter((u) => !needle || u.name.toLowerCase().includes(needle) || u.instagram.toLowerCase().includes(needle))
      .sort((a, b) => Number(following.has(a.id)) - Number(following.has(b.id)) || b.followers - a.followers || a.name.localeCompare(b.name, 'da'));
  }, [users, me, view, following, followers, q]);

  return (
    <>
      <section className="intro"><p className="eyebrow">Hele holdet</p><h1 className="h1">Folk</h1></section>
      <div className="search">
        <Icon name="search" />
        <label className="sr" htmlFor="people-q">Søg efter navn eller Instagram</label>
        <input id="people-q" type="search" value={q} placeholder="Søg efter navn eller @instagram" onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="seg" role="tablist" aria-label="Vis" style={{ marginTop: 12 }}>
        <button role="tab" aria-selected={view === 'all'} onClick={() => setView('all')}>Alle</button>
        <button role="tab" aria-selected={view === 'following'} onClick={() => setView('following')}>Du følger <span className="seg-n">{following.size}</span></button>
        <button role="tab" aria-selected={view === 'followers'} onClick={() => setView('followers')}>Følger dig <span className="seg-n">{followers.size}</span></button>
      </div>
      {list.length ? (
        <ul className="people-list">
          {list.map((u) => (
            <li className="person" key={u.id}>
              <UserLink uid={u.id}><Avatar uid={u.id} /></UserLink>
              <UserLink uid={u.id}>
                <b>{u.name}{u.role === 'admin' && <> <span className="tag soft">Outdoor Office</span></>}<StreakChip u={u} /></b>
                <span>{u.instagram ? `@${u.instagram} · ` : ''}{u.followers} følgere</span>
              </UserLink>
              <FollowButton uid={u.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ marginTop: 16 }}>{q ? 'Ingen matcher søgningen.' : view === 'following' ? 'Du følger ingen endnu.' : view === 'followers' ? 'Ingen følger dig endnu.' : 'Der er ingen andre på holdet endnu.'}</p>
      )}
    </>
  );
}
