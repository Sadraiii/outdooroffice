export type Scene = 'beach' | 'bars' | 'track' | 'harbor' | 'lake' | 'trail';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Ctx = CanvasRenderingContext2D;

function ridge(ctx: Ctx, r: () => number, w: number, base: number, amp: number, step: number, bottom: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, bottom); ctx.lineTo(0, base);
  let y = base;
  for (let x = 0; x <= w + step; x += step) { y = base - amp * (0.35 + r() * 0.65); ctx.quadraticCurveTo(x - step / 2, y - amp * 0.25 * r(), x, y); }
  ctx.lineTo(w, bottom); ctx.closePath(); ctx.fill();
}

function rig(ctx: Ctx, x: number, ground: number, s: number, color: string) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'butt'; ctx.lineWidth = 8 * s;
  const posts = [0, 150, 300].map((p) => x + p * s);
  posts.forEach((px, i) => { ctx.beginPath(); ctx.moveTo(px, ground); ctx.lineTo(px, ground - (i === 2 ? 175 : 235) * s); ctx.stroke(); });
  ctx.lineWidth = 6 * s;
  ctx.beginPath(); ctx.moveTo(posts[0] - 10 * s, ground - 228 * s); ctx.lineTo(posts[1] + 10 * s, ground - 228 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(posts[1] - 10 * s, ground - 168 * s); ctx.lineTo(posts[2] + 10 * s, ground - 168 * s); ctx.stroke();
  const px = x + 380 * s;
  [[0, 0], [70, 18]].forEach(([dx, dy]) => {
    ctx.beginPath(); ctx.moveTo(px + dx * s, ground - (90 - dy) * s); ctx.lineTo(px + (dx + 150) * s, ground - (90 - dy) * s); ctx.stroke();
    [0, 150].forEach((q) => { ctx.beginPath(); ctx.moveTo(px + (dx + q) * s, ground - (90 - dy) * s); ctx.lineTo(px + (dx + q) * s, ground + dy * 0.2 * s); ctx.stroke(); });
  });
  ctx.restore();
}

function figure(ctx: Ctx, x: number, y: number, s: number, color: string, pose: 'hang' | 'stand' | 'run') {
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const limb = (pts: number[], wd: number) => { ctx.lineWidth = wd * s; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); };
  const head = (hx: number, hy: number) => { ctx.beginPath(); ctx.arc(hx, hy, 12 * s, 0, Math.PI * 2); ctx.fill(); };
  if (pose === 'hang') {
    const h = y + 36 * s;
    limb([x - 15 * s, y, x - 10 * s, h + 8 * s], 8); limb([x + 15 * s, y, x + 10 * s, h + 8 * s], 8);
    head(x, h);
    limb([x, h + 16 * s, x, h + 66 * s], 24);
    limb([x - 5 * s, h + 70 * s, x - 7 * s, h + 96 * s, x - 2 * s, h + 118 * s], 10); limb([x + 5 * s, h + 70 * s, x + 14 * s, h + 92 * s, x + 20 * s, h + 110 * s], 10);
  } else if (pose === 'stand') {
    const t = y - 176 * s;
    head(x, t + 13 * s);
    limb([x, t + 32 * s, x, t + 88 * s], 26);
    limb([x - 12 * s, t + 38 * s, x - 22 * s, t + 70 * s, x - 18 * s, t + 96 * s], 8); limb([x + 12 * s, t + 38 * s, x + 26 * s, t + 64 * s, x + 30 * s, t + 92 * s], 8);
    limb([x - 6 * s, t + 92 * s, x - 9 * s, y], 10); limb([x + 6 * s, t + 92 * s, x + 11 * s, y], 10);
  } else {
    const t = y - 170 * s;
    head(x + 10 * s, t + 13 * s);
    limb([x + 6 * s, t + 32 * s, x - 2 * s, t + 86 * s], 25);
    limb([x + 2 * s, t + 40 * s, x - 26 * s, t + 58 * s, x - 36 * s, t + 82 * s], 8); limb([x + 8 * s, t + 42 * s, x + 30 * s, t + 64 * s, x + 46 * s, t + 50 * s], 8);
    limb([x - 4 * s, t + 92 * s, x - 34 * s, t + 124 * s, x - 52 * s, y - 14 * s], 10); limb([x, t + 92 * s, x + 22 * s, t + 130 * s, x + 26 * s, y], 10);
  }
  ctx.restore();
}

function print(ctx: Ctx, w: number, h: number, r: () => number, ink: () => void) {
  ctx.save(); ctx.globalAlpha = 0.16; ctx.translate(3, 2); ink(); ctx.restore();
  ink();
  const t = document.createElement('canvas'); t.width = 128; t.height = 128;
  const tc = t.getContext('2d')!; const img = tc.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = 150 + r() * 105; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  tc.putImageData(img, 0, 0);
  ctx.save(); ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = ctx.createPattern(t, 'repeat')!; ctx.fillRect(0, 0, w, h); ctx.restore();
}

export function paintPhoto(scene: Scene, w = 1200, h = 800, seed = 1): string {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const r = rng(seed * 9973 + scene.length * 31);
  const S = Math.min(w, h) / 800;
  const fill = (color: string, x: number, y: number, ww: number, hh: number) => { ctx.fillStyle = color; ctx.fillRect(x, y, ww, hh); };

  if (scene === 'beach') {
    const hz = h * 0.56, ground = h * 0.84, INK = '#1F2A33';
    fill('#F2E6D3', 0, 0, w, hz);
    ctx.fillStyle = '#EE9B45'; ctx.beginPath(); ctx.arc(w * 0.68, hz - 10 * S, 92 * S, Math.PI, 0); ctx.fill();
    fill('#2F6382', 0, hz, w, ground - hz);
    ctx.fillStyle = '#F2E6D3';
    for (let i = 0; i < 9; i++) { const y = hz + (14 + i * i * 4.2) * S; const half = (40 + i * 26) * S; ctx.fillRect(w * 0.68 - half * (0.4 + r() * 0.6), y, half, (2.5 + i * 0.5) * S); }
    ctx.fillStyle = '#E3C590'; ctx.beginPath(); ctx.moveTo(0, ground + 8 * S); ctx.quadraticCurveTo(w * 0.5, ground - 22 * S, w, ground + 2 * S); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    print(ctx, w, h, r, () => {
      rig(ctx, w * 0.1, ground + 4 * S, 1.05 * S, INK);
      figure(ctx, w * 0.1 + 75 * 1.05 * S, ground + 4 * S - 228 * 1.05 * S, 1.05 * S, INK, 'hang');
      figure(ctx, w * 0.8, ground + 10 * S, 0.98 * S, INK, 'stand');
      figure(ctx, w * 0.88, ground + 12 * S, 0.9 * S, INK, 'stand');
    });
  } else if (scene === 'bars') {
    const hz = h * 0.66, INK = '#22302A';
    fill('#D7E4EA', 0, 0, w, hz);
    ctx.fillStyle = '#F4F1E6'; ctx.beginPath(); ctx.arc(w * 0.8, h * 0.2, 54 * S, 0, Math.PI * 2); ctx.fill();
    ridge(ctx, r, w, hz - 70 * S, 60 * S, 120 * S, hz + 1, '#A9C3A4');
    ridge(ctx, r, w, hz - 18 * S, 40 * S, 90 * S, hz + 1, '#6F9670');
    fill('#557E4D', 0, hz, w, h - hz);
    fill('#C9B98F', w * 0.08, hz + 48 * S, w * 0.66, 22 * S);
    print(ctx, w, h, r, () => {
      rig(ctx, w * 0.15, hz + 60 * S, 1.15 * S, INK);
      figure(ctx, w * 0.15 + 75 * 1.15 * S, hz + 60 * S - 228 * 1.15 * S, 1.15 * S, INK, 'hang');
      figure(ctx, w * 0.15 + 225 * 1.15 * S, hz + 64 * S, 1.1 * S, INK, 'stand');
    });
  } else if (scene === 'track') {
    const hz = h * 0.5, INK = '#10121B';
    fill('#1E2440', 0, 0, w, h);
    ctx.fillStyle = 'rgba(244,236,214,0.12)';
    [[0.16, 0.12], [0.84, 0.1]].forEach(([fx, fy]) => { ctx.beginPath(); ctx.moveTo(w * fx - 30 * S, h * fy); ctx.lineTo(w * fx + 30 * S, h * fy); ctx.lineTo(w * (fx < 0.5 ? 0.62 : 0.38), h); ctx.lineTo(w * (fx < 0.5 ? 0.12 : 0.88), h); ctx.closePath(); ctx.fill(); });
    [[0.16, 0.12], [0.84, 0.1]].forEach(([fx, fy]) => {
      fill('#141830', w * fx - 4 * S, h * fy, 8 * S, hz - h * fy);
      fill('#F4ECD6', w * fx - 34 * S, h * fy - 14 * S, 68 * S, 18 * S);
    });
    fill('#141830', 0, hz - 26 * S, w, 30 * S);
    ctx.fillStyle = '#C2563B'; ctx.beginPath(); ctx.moveTo(w * 0.42, hz); ctx.lineTo(w * 0.58, hz); ctx.lineTo(w * 1.25, h); ctx.lineTo(-w * 0.25, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#F4ECD6'; ctx.lineWidth = 3 * S;
    for (let i = 0; i <= 6; i++) { const t = i / 6; ctx.beginPath(); ctx.moveTo(w * (0.42 + 0.16 * t), hz); ctx.lineTo(-w * 0.25 + w * 1.5 * t, h); ctx.stroke(); }
    print(ctx, w, h, r, () => {
      figure(ctx, w * 0.46, h * 0.88, 1.1 * S, INK, 'run');
      figure(ctx, w * 0.6, h * 0.8, 0.9 * S, INK, 'run');
    });
  } else if (scene === 'harbor') {
    const hz = h * 0.64, INK = '#181A2A';
    fill('#3A3F6E', 0, 0, w, hz * 0.5);
    fill('#8B6E8E', 0, hz * 0.5, w, hz * 0.25);
    fill('#E9A06D', 0, hz * 0.75, w, hz * 0.25);
    ctx.fillStyle = '#F6D9A8'; ctx.beginPath(); ctx.arc(w * 0.62, hz, 58 * S, Math.PI, 0); ctx.fill();
    fill('#262B48', 0, hz, w, h - hz);
    ctx.fillStyle = '#E9A06D';
    for (let i = 0; i < 7; i++) { const y = hz + (10 + i * i * 5) * S; const half = (26 + i * 14) * S; ctx.fillRect(w * 0.62 - half / 2 + (r() - 0.5) * 30 * S, y, half, 3 * S); }
    let x = 0; ctx.fillStyle = INK;
    while (x < w) { const bw = (24 + r() * 60) * S, bh = (6 + r() * 34) * S; ctx.fillRect(x, hz - bh, bw, bh + 1); x += bw; }
    print(ctx, w, h, r, () => {
      [[0.06, 1.1, 1], [0.86, 0.85, -1]].forEach(([fx, sc, dir]) => {
        const cx = w * fx, k = sc * S; ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineCap = 'butt';
        ctx.lineWidth = 8 * k;
        ctx.beginPath(); ctx.moveTo(cx, hz); ctx.lineTo(cx, hz - 160 * k); ctx.moveTo(cx + 56 * k, hz); ctx.lineTo(cx + 56 * k, hz - 160 * k); ctx.stroke();
        ctx.lineWidth = 4 * k; ctx.beginPath(); ctx.moveTo(cx, hz - 70 * k); ctx.lineTo(cx + 56 * k, hz - 130 * k); ctx.moveTo(cx + 56 * k, hz - 70 * k); ctx.lineTo(cx, hz - 130 * k); ctx.stroke();
        ctx.fillRect(cx - 8 * k, hz - 176 * k, 72 * k, 22 * k);
        const tip = cx + 28 * k + dir * 300 * k, back = cx + 28 * k - dir * 90 * k;
        ctx.lineWidth = 10 * k; ctx.beginPath(); ctx.moveTo(back, hz - 168 * k); ctx.lineTo(tip, hz - 168 * k); ctx.stroke();
        ctx.lineWidth = 7 * k; ctx.beginPath(); ctx.moveTo(cx + 28 * k, hz - 176 * k); ctx.lineTo(cx + 28 * k, hz - 280 * k); ctx.stroke();
        ctx.lineWidth = 2.5 * k; ctx.beginPath(); ctx.moveTo(cx + 28 * k, hz - 280 * k); ctx.lineTo(tip, hz - 172 * k); ctx.moveTo(cx + 28 * k, hz - 280 * k); ctx.lineTo(back, hz - 172 * k); ctx.stroke();
      });
      fill(INK, 0, h * 0.9, w, h * 0.1);
      figure(ctx, w * 0.42, h * 0.905, 0.85 * S, INK, 'run');
    });
  } else if (scene === 'lake') {
    const hz = h * 0.56, INK = '#25303A';
    fill('#EAE4D6', 0, 0, w, hz);
    ctx.fillStyle = '#F2C46A'; ctx.beginPath(); ctx.arc(w * 0.26, hz - 64 * S, 46 * S, 0, Math.PI * 2); ctx.fill();
    ridge(ctx, r, w, hz - 10 * S, 30 * S, 70 * S, hz + 1, '#93A6A6');
    fill('#5E8191', 0, hz, w, h - hz);
    ctx.fillStyle = '#EAE4D6';
    for (let i = 0; i < 10; i++) ctx.fillRect(w * 0.26 - (30 + r() * 80) * S, hz + (12 + i * 16) * S, (40 + r() * 90) * S, 2.5 * S);
    print(ctx, w, h, r, () => {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-10, h); ctx.lineTo(w * 0.36, hz + 40 * S); ctx.lineTo(w * 0.43, hz + 42 * S); ctx.lineTo(w * 0.22, h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 7 * S;
      [0.15, 0.24, 0.32].forEach((t) => { const px = w * t; const py = h - (h - hz - 40 * S) * (t / 0.36); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 70 * S); ctx.stroke(); });
      figure(ctx, w * 0.38, hz + 44 * S, 0.62 * S, INK, 'stand');
      figure(ctx, w * 0.34, hz + 52 * S, 0.66 * S, INK, 'stand');
    });
  } else {
    const INK = '#1C2619';
    fill('#E3E6CC', 0, 0, w, h);
    ['#B7C59B', '#7E9A6A', '#3F5A3B'].forEach((color, layer) => {
      ctx.fillStyle = color;
      for (let i = 0; i < 8; i++) { const tw = (14 + r() * 20 + layer * 16) * S, tx = r() * w; ctx.fillRect(tx, 0, tw, h * (0.7 + layer * 0.1)); }
    });
    fill('#8FA474', 0, h * 0.62, w, h * 0.38);
    ctx.fillStyle = '#C9AE7A'; ctx.beginPath(); ctx.moveTo(w * 0.47, h * 0.62); ctx.lineTo(w * 0.53, h * 0.62); ctx.lineTo(w * 0.86, h); ctx.lineTo(w * 0.14, h); ctx.closePath(); ctx.fill();
    print(ctx, w, h, r, () => figure(ctx, w * 0.5, h * 0.92, 1.0 * S, INK, 'run'));
  }
  return c.toDataURL('image/jpeg', 0.86);
}
