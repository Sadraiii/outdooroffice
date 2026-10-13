import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useApp } from '../state';
import { badgeById } from '../lib/stats';
import { buzz, reducedMotion } from '../lib/platform';
import { BadgeArt } from './Attendance';
import { Icon } from './Icon';

const COLORS = ['var(--accent)', 'var(--hot)', 'var(--good)', '#F2C14E', 'var(--accent)', '#E86A92'];

export function CelebrationLayer() {
  const { celebration, endCelebration, openSheet, me } = useApp();
  const ok = useRef<HTMLButtonElement>(null);
  const pieces = useMemo(() => (celebration ? Array.from({ length: 46 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    dur: 2.4 + Math.random() * 1.8,
    spin: Math.round(Math.random() * 360),
    drift: Math.round((Math.random() - 0.5) * 160),
    color: COLORS[i % COLORS.length],
    shape: i % 3,
  })) : []), [celebration]);

  const shownAt = useRef(0);
  const settled = () => performance.now() - shownAt.current > 500;
  useEffect(() => {
    if (!celebration) return;
    shownAt.current = performance.now();
    buzz([18, 70, 30]);
    const t = window.setTimeout(() => ok.current?.focus(), 550);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && settled()) endCelebration(); };
    window.addEventListener('keydown', key);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', key); };
  }, [celebration, endCelebration]);

  if (!celebration) return null;
  const badge = celebration.kind === 'badge' ? badgeById(celebration.badge) : undefined;
  if (celebration.kind === 'badge' && !badge) return null;
  const close = () => { if (settled()) endCelebration(); };
  const share = () => { if (!badge || !me || !settled()) return; endCelebration(); openSheet({ type: 'share-badge', badge: badge.id, uid: me.id }); };

  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-labelledby="cel-title" aria-describedby={badge ? 'cel-sub' : undefined}>
      <div className="scrim" onClick={close} />
      {!reducedMotion() && (
        <div className="confetti" aria-hidden="true">
          {pieces.map((p, i) => (
            <i key={i} className={'cf s' + p.shape}
              style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, ['--spin' as string]: `${p.spin}deg`, ['--drift' as string]: `${p.drift}px` } as CSSProperties} />
          ))}
        </div>
      )}
      <div className="cel-card">
        {badge ? <BadgeArt id={badge.id} size={116} /> : <span className="cel-ic"><Icon name="trophy" /></span>}
        <p className="eyebrow">{badge ? 'Nyt mærke' : 'Program klaret'}</p>
        <h2 className="cel-title" id="cel-title">{badge ? badge.name : celebration.kind === 'program' ? celebration.title : ''}</h2>
        {badge && <p className="cel-sub" id="cel-sub">{badge.desc}</p>}
        <div className="cel-btns">
          {badge && me && <button type="button" className="btn btn-outline" onClick={share}><Icon name="insta" />Del på Instagram</button>}
          <button type="button" ref={ok} className="btn btn-primary" onClick={close}>Fedt!</button>
        </div>
      </div>
    </div>
  );
}
