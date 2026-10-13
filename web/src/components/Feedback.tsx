import { useEffect, useState } from 'react';
import type { EventDoc, Feedback } from '../api/types';
import { useApp, useSub } from '../state';
import { ago } from '../lib/dates';
import { Avatar } from './bits';
import { Icon } from './Icon';

const WORDS = ['', 'Skuffende', 'Okay', 'God', 'Rigtig god', 'Fantastisk'];
export const avgText = (sum: number, count: number) => (count ? (sum / count).toFixed(1).replace('.', ',') : '–');

export function Stars({ n, small }: { n: number; small?: boolean }) {
  return (
    <span className={'stars' + (small ? ' sm' : '')} aria-label={`${n} af 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name="star" className={i <= n ? 'on' : ''} />)}
    </span>
  );
}

export function FeedbackCard({ ev }: { ev: EventDoc }) {
  const { api, me, toast } = useApp();
  const mine = useSub<Feedback | null | undefined>(me ? (cb) => api.watchMyFeedback(ev.id, me.id, cb) : null, [api, ev.id, me?.id], undefined);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (mine) { setRating(mine.rating); setText(mine.text); } }, [mine]);
  if (mine === undefined || !me) return null;
  if (mine && !editing) {
    return (
      <section className="fb-card done">
        <Stars n={mine.rating} />
        <div><b>Tak for din vurdering</b>{mine.text && <span>"{mine.text}"</span>}</div>
        <button className="link" onClick={() => setEditing(true)}>Ret</button>
      </section>
    );
  }
  const send = async () => {
    if (!rating) return;
    setBusy(true);
    try {
      await api.setFeedback(ev.id, me.id, rating, text);
      setEditing(false);
      toast('Tak for din vurdering');
    } catch { toast('Ikke gemt. Prøv igen.'); }
    setBusy(false);
  };
  return (
    <section className="fb-card">
      <h2 className="h3">Hvordan var det?</h2>
      <div className="fb-stars" role="radiogroup" aria-label="Vurdering fra 1 til 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} af 5: ${WORDS[n]}`} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>
            <Icon name="star" />
          </button>
        ))}
        <span className="fb-word">{rating ? WORDS[rating] : 'Tryk på en stjerne'}</span>
      </div>
      {rating > 0 && (
        <div className="fb-more">
          <label className="sr" htmlFor="fb-text">Kommentar</label>
          <textarea id="fb-text" rows={2} maxLength={500} value={text} placeholder="Kommentar" onChange={(e) => setText(e.target.value)} />
          <div className="row-btns">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={send}>{mine ? 'Gem' : 'Send'}</button>
            {mine && <button className="btn btn-quiet btn-sm" onClick={() => { setEditing(false); setRating(mine.rating); setText(mine.text); }}>Fortryd</button>}
          </div>
        </div>
      )}
    </section>
  );
}

export function FeedbackSummary({ ev }: { ev: EventDoc }) {
  const { api, shownName } = useApp();
  const list = useSub<Feedback[] | null>((cb) => api.watchFeedback(ev.id, cb), [api, ev.id], null);
  if (!list) return null;
  const n = list.length;
  const sum = list.reduce((a, f) => a + f.rating, 0);
  const dist = [5, 4, 3, 2, 1].map((r) => list.filter((f) => f.rating === r).length);
  const comments = list.filter((f) => f.text);
  return (
    <section className="fb-sum card">
      <div className="fb-head"><h2 className="h3">Feedback</h2></div>
      {n ? (
        <>
          <div className="fb-top">
            <div className="fb-avg"><b>{avgText(sum, n)}</b><Stars n={Math.round(sum / n)} /><span>{n} svar</span></div>
            <ul className="fb-dist" aria-label="Fordeling">
              {dist.map((c, i) => <li key={i}><span>{5 - i}</span><i><em style={{ width: `${(c / n) * 100}%` }} /></i><span>{c}</span></li>)}
            </ul>
          </div>
          {comments.length > 0 && (
            <ul className="fb-list">
              {comments.map((f) => (
                <li key={f.uid}>
                  <Avatar uid={f.uid} size="sm" />
                  <div><p className="fb-who"><b>{shownName(f.uid)}</b><Stars n={f.rating} small /><time>{ago(f.at)}</time></p><p>{f.text}</p></div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : <p className="small muted">Ingen svar endnu</p>}
    </section>
  );
}
