import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Activity, Comment } from '../api/types';
import { useApp, useSub } from '../state';
import { ago } from '../lib/dates';
import { ActivityCard } from '../components/ActivityCard';
import { Avatar, AvatarStack, Skeleton, UserLink } from '../components/bits';
import { Icon } from '../components/Icon';

export function ActivityPage() {
  const { id = '' } = useParams();
  const { api, me, isAdmin, shownName, toast } = useApp();
  const nav = useNavigate();
  const a = useSub<Activity | null | undefined>((cb) => api.watchActivity(id, cb), [api, id], undefined);
  const comments = useSub<Comment[]>((cb) => api.watchComments(id, cb), [api, id], []);
  const kudos = useSub<string[]>((cb) => api.watchKudos(id, cb), [api, id], []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const back = <div className="crumb"><button className="back" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))}><Icon name="back" />Tilbage</button>
    {a && me && (a.uid === me.id || isAdmin) && (
      <button className={'btn btn-quiet btn-sm danger' + (confirm === 'act' ? ' confirm' : '')} onClick={async () => {
        if (confirm !== 'act') { setConfirm('act'); return; }
        try { await api.deleteActivity(a.id); toast('Slettet'); nav('/'); } catch { toast('Ikke slettet'); }
      }}><Icon name="trash" />{confirm === 'act' ? 'Slet?' : 'Slet'}</button>
    )}
  </div>;

  if (a === undefined) return <>{back}<Skeleton /></>;
  if (a === null) return <>{back}<section className="empty"><h2 className="h2">Findes ikke</h2></section></>;

  const send = async () => {
    if (!me || !text.trim()) return;
    setBusy(true);
    try { await api.addComment(a.id, me.id, text.trim().slice(0, 500)); setText(''); }
    catch { toast('Ikke sendt'); }
    setBusy(false);
  };

  return (
    <>
      {back}
      <ol className="feed"><ActivityCard a={a} full /></ol>
      {kudos.length > 0 && (
        <p className="kudos-row" style={{ marginTop: 14 }}>
          <AvatarStack uids={kudos} max={8} size="xs" />
          <span>High five fra {kudos.slice(0, 2).map((u) => shownName(u)).join(', ')}{kudos.length > 2 ? ` og ${kudos.length - 2} andre` : ''}</span>
        </p>
      )}
      <div className="sec-head"><h2 className="h2">Kommentarer</h2></div>
      {comments.length ? (
        <ul className="comments">
          {comments.map((c) => (
            <li className="comment" key={c.id}>
              <UserLink uid={c.uid}><Avatar uid={c.uid} size="sm" /></UserLink>
              <div><b>{shownName(c.uid)}</b><time>{ago(c.at)}</time><p>{c.text}</p></div>
              {me && (c.uid === me.id || isAdmin) ? (
                <button className={'icon-btn' + (confirm === c.id ? ' confirm' : '')} aria-label={confirm === c.id ? 'Bekræft sletning' : 'Slet kommentar'}
                  onClick={async () => { if (confirm !== c.id) { setConfirm(c.id); return; } setConfirm(null); await api.deleteComment(a.id, c.id).catch(() => toast('Ikke slettet')); }}>
                  {confirm === c.id ? 'Slet' : <Icon name="trash" />}
                </button>
              ) : <span />}
            </li>
          ))}
        </ul>
      ) : <p className="muted">Ingen kommentarer</p>}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className="sr" htmlFor="c-text">Skriv en kommentar</label>
        <textarea id="c-text" rows={1} maxLength={500} value={text} placeholder="Skriv en kommentar …" onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>Send</button>
      </form>
    </>
  );
}
