import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Sheet({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ReactNode; foot?: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  useEffect(() => {
    const vv = window.visualViewport; const el = wrap.current;
    if (!vv || !el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const zoom = parseFloat(getComputedStyle(document.body).zoom || '1') || 1;
        const keyboard = window.innerHeight - vv.height;
        if (keyboard > 80) {
          el.style.top = `${vv.offsetTop / zoom}px`; el.style.height = `${vv.height / zoom}px`; el.style.bottom = 'auto';
          const a = document.activeElement;
          if (a instanceof HTMLElement && el.contains(a)) a.scrollIntoView({ block: 'nearest' });
        } else { el.style.top = ''; el.style.height = ''; el.style.bottom = ''; }
      });
    };
    vv.addEventListener('resize', update); vv.addEventListener('scroll', update);
    return () => { cancelAnimationFrame(frame); vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);
  return (
    <div className="sheet-wrap" ref={wrap}>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
        <div className="sheet-head">
          <h2 className="h2" id="sheetTitle">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Luk"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </div>
  );
}
