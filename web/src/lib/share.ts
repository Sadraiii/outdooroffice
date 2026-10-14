import type { Activity, EventDoc } from '../api/types';
import sealUrl from '../assets/seal.png';
import glyphUrl from '../assets/glyph.png';
import { activityStats, didPhrase, sportLabel } from './sports';
import { DAYS, MONTHS_S, cap, dateOf, longDate, relDay } from './dates';
import { fmt } from './format';
import { BADGE_ART, BADGE_PATHS } from './badgeArt';
import { badgeById } from './stats';

const W = 1080, H = 1920;
const DISPLAY = '"Big Shoulders Display", "Arial Narrow", sans-serif';
const BODY = '"Schibsted Grotesk", system-ui, sans-serif';

export type StoryBg = 'night' | 'paper' | 'violet' | 'forest' | 'ocean' | 'ember' | 'rose' | 'sand';
interface StoryPalette { bg: string; fg: string; dim: string; acc: string; line: string; mark: string; ring: string }
export const STORY_BGS: { key: StoryBg; label: string; pal: StoryPalette }[] = [
  { key: 'night', label: 'Mørk', pal: { bg: '#0F120F', fg: '#ECEFE8', dim: '#9AA297', acc: '#B9A0E6', line: '#2A302A', mark: 'rgba(236,239,232,0.05)', ring: '' } },
  { key: 'paper', label: 'Lys', pal: { bg: '#ECEFE8', fg: '#151815', dim: '#5F665E', acc: '#5A3E8A', line: '#D2D7CE', mark: 'rgba(21,24,21,0.05)', ring: 'rgba(21,24,21,0.2)' } },
  { key: 'violet', label: 'Lilla', pal: { bg: '#3B2763', fg: '#F5F1FC', dim: '#C3B6DD', acc: '#D8C8FF', line: 'rgba(255,255,255,0.16)', mark: 'rgba(255,255,255,0.06)', ring: '' } },
  { key: 'forest', label: 'Grøn', pal: { bg: '#16302A', fg: '#EEF4EF', dim: '#A6BDB2', acc: '#8FE3B5', line: 'rgba(255,255,255,0.14)', mark: 'rgba(255,255,255,0.06)', ring: '' } },
  { key: 'ocean', label: 'Blå', pal: { bg: '#132A4A', fg: '#EEF3FB', dim: '#A8B9D4', acc: '#8DC2FF', line: 'rgba(255,255,255,0.15)', mark: 'rgba(255,255,255,0.06)', ring: '' } },
  { key: 'ember', label: 'Rød', pal: { bg: '#4A1A12', fg: '#FFF1EA', dim: '#E0B5A6', acc: '#FFAA7A', line: 'rgba(255,255,255,0.15)', mark: 'rgba(255,255,255,0.06)', ring: '' } },
  { key: 'rose', label: 'Pink', pal: { bg: '#561937', fg: '#FFEFF6', dim: '#E2B2C8', acc: '#FF9CCB', line: 'rgba(255,255,255,0.15)', mark: 'rgba(255,255,255,0.06)', ring: '' } },
  { key: 'sand', label: 'Sand', pal: { bg: '#E8DDC6', fg: '#29221A', dim: '#6E6252', acc: '#9A4E12', line: '#D3C6AA', mark: 'rgba(41,34,26,0.06)', ring: 'rgba(41,34,26,0.2)' } },
];

export type StickerColor = 'white' | 'black' | 'violet' | 'green' | 'yellow' | 'orange' | 'pink' | 'blue';
export const STICKER_COLORS: { key: StickerColor; label: string; fg: string; ink: string; glow: 'dark' | 'light' }[] = [
  { key: 'white', label: 'Hvid', fg: '#FFFFFF', ink: '#121512', glow: 'dark' },
  { key: 'black', label: 'Sort', fg: '#121512', ink: '#FFFFFF', glow: 'light' },
  { key: 'violet', label: 'Lilla', fg: '#CDB8FF', ink: '#1B1229', glow: 'dark' },
  { key: 'green', label: 'Grøn', fg: '#8FF0B4', ink: '#0B241A', glow: 'dark' },
  { key: 'yellow', label: 'Gul', fg: '#FFE45C', ink: '#2A2300', glow: 'dark' },
  { key: 'orange', label: 'Orange', fg: '#FFAD66', ink: '#2B1505', glow: 'dark' },
  { key: 'pink', label: 'Pink', fg: '#FF9CCB', ink: '#3A0A22', glow: 'dark' },
  { key: 'blue', label: 'Blå', fg: '#8EC8FF', ink: '#0D1A30', glow: 'dark' },
];

export interface ShareLook { bg: StoryBg; color: StickerColor; hide: string[] }
export const DEFAULT_LOOK: ShareLook = { bg: 'night', color: 'white', hide: [] };

const storyPal = (bg: StoryBg) => (STORY_BGS.find((b) => b.key === bg) || STORY_BGS[0]).pal;
const stickerCol = (c: StickerColor) => STICKER_COLORS.find((x) => x.key === c) || STICKER_COLORS[0];

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

async function ready() {
  await Promise.all([
    document.fonts.load(`900 120px ${DISPLAY}`), document.fonts.load(`800 120px ${DISPLAY}`),
    document.fonts.load(`600 40px ${BODY}`), document.fonts.load(`400 40px ${BODY}`), document.fonts.load(`700 40px ${BODY}`),
  ]).catch(() => undefined);
  return Promise.all([loadImg(sealUrl), loadImg(glyphUrl)]);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return lines;
}

function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, maxW: number) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 20) { s -= 4; ctx.font = `${weight} ${s}px ${family}`; }
  return s;
}

function tally(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = h * 0.13; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + i * h * 0.24, y); ctx.lineTo(x + i * h * 0.24, y + h); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x - h * 0.12, y + h * 0.78); ctx.lineTo(x + h * 0.86, y + h * 0.22); ctx.stroke(); ctx.restore();
}

function tintGlyph(glyph: HTMLImageElement, size: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const o = c.getContext('2d')!;
  o.drawImage(glyph, 0, 0, size, size);
  o.globalCompositeOperation = 'source-in'; o.fillStyle = color; o.fillRect(0, 0, size, size);
  return c;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas'))), 'image/png'));
}

const spaced = (s: string) => s.split('').join(String.fromCharCode(8202));
const shortDate = (ts: number) => { const d = new Date(ts); return `${d.getDate()}. ${MONTHS_S[d.getMonth()]}`; };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function frame(ctx: CanvasRenderingContext2D, seal: HTMLImageElement, glyph: HTMLImageElement, p: StoryPalette) {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(tintGlyph(glyph, 1400, p.mark), 260, 620);
  ctx.drawImage(seal, 84, 110, 110, 110);
  if (p.ring) { ctx.save(); ctx.strokeStyle = p.ring; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(139, 165, 54, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  ctx.fillStyle = p.fg; ctx.font = `900 64px ${DISPLAY}`; ctx.textBaseline = 'middle';
  ctx.fillText('OUTDOOR OFFICE', 220, 168);
  ctx.textBaseline = 'alphabetic';
}

function footer(ctx: CanvasRenderingContext2D, name: string, sub: string, p: StoryPalette) {
  ctx.fillStyle = p.line; ctx.fillRect(84, H - 250, W - 168, 3);
  ctx.fillStyle = p.fg; fit(ctx, name, 600, 46, BODY, W - 168); ctx.fillText(name, 84, H - 170);
  ctx.fillStyle = p.dim; fit(ctx, sub, 400, 38, BODY, W - 168); ctx.fillText(sub, 84, H - 112);
}

function eyebrow(ctx: CanvasRenderingContext2D, text: string, y: number, p: StoryPalette) {
  tally(ctx, 96, y - 40, 46, p.acc);
  ctx.fillStyle = p.acc; ctx.font = `600 40px ${BODY}`;
  ctx.fillText(text.toUpperCase().split('').join(String.fromCharCode(8202)), 186, y);
}

export async function activityStory(a: Activity, name: string, bg: StoryBg = 'night'): Promise<Blob> {
  const [seal, glyph] = await ready();
  const p = storyPal(bg);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  frame(ctx, seal, glyph, p);
  eyebrow(ctx, sportLabel(a.sport), 470, p);
  ctx.fillStyle = p.fg; ctx.font = `900 150px ${DISPLAY}`;
  const title = (a.title || cap(didPhrase(a))).toUpperCase();
  const lines = wrap(ctx, title, W - 168, 2);
  lines.forEach((l, i) => ctx.fillText(l, 84, 640 + i * 140));
  let y = 640 + lines.length * 140 + 90;
  if (a.distanceKm) {
    ctx.font = `900 360px ${DISPLAY}`; ctx.fillStyle = p.fg;
    const v = fmt(a.distanceKm); ctx.fillText(v, 76, y + 300);
    const w = ctx.measureText(v).width;
    ctx.font = `800 110px ${DISPLAY}`; ctx.fillStyle = p.acc; ctx.fillText('KM', 76 + w + 24, y + 300);
    y += 450;
    const rest = activityStats(a).filter((s) => s.label !== 'Distance');
    rest.forEach((s, i) => {
      const x = 84 + i * 470;
      ctx.fillStyle = p.dim; ctx.font = `600 34px ${BODY}`; ctx.fillText(s.label.toUpperCase(), x, y);
      ctx.fillStyle = p.fg; ctx.font = `900 110px ${DISPLAY}`; ctx.fillText(s.value, x, y + 110);
    });
  } else if (a.reps && a.reps.length) {
    a.reps.slice(0, 5).forEach((r, i) => {
      const yy = y + i * 170;
      ctx.fillStyle = p.fg; ctx.font = `900 150px ${DISPLAY}`;
      const v = fmt(r.count); ctx.fillText(v, 84, yy + 130);
      const w = ctx.measureText(v).width;
      const txt = `${r.name}${r.unit && r.unit !== 'reps' ? ' · ' + r.unit : ''}`.toUpperCase();
      ctx.fillStyle = p.acc; fit(ctx, txt, 800, 72, DISPLAY, W - 168 - w - 40);
      ctx.fillText(txt, 84 + w + 32, yy + 128);
    });
  } else {
    activityStats(a).forEach((s, i) => {
      const yy = y + i * 200;
      ctx.fillStyle = p.dim; ctx.font = `600 36px ${BODY}`; ctx.fillText(s.label.toUpperCase(), 84, yy + 30);
      ctx.fillStyle = p.fg; ctx.font = `900 150px ${DISPLAY}`; ctx.fillText(s.value, 84, yy + 170);
    });
  }
  const d = new Date(a.createdAt);
  footer(ctx, name, `${d.getDate()}/${d.getMonth() + 1} ${d.getFullYear()} · Outdoor Office`, p);
  return toBlob(cv);
}

export async function eventStory(ev: EventDoc, goingCount: number, bg: StoryBg = 'night'): Promise<Blob> {
  const [seal, glyph] = await ready();
  const p = storyPal(bg);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  frame(ctx, seal, glyph, p);
  eyebrow(ctx, ev.official ? 'Official event' : 'Community made event', 470, p);
  ctx.fillStyle = p.fg; ctx.font = `900 170px ${DISPLAY}`;
  const lines = wrap(ctx, ev.title.toUpperCase(), W - 168, 3);
  lines.forEach((l, i) => ctx.fillText(l, 84, 660 + i * 160));
  let y = 660 + lines.length * 160 + 60;
  ctx.fillStyle = p.acc; ctx.font = `800 96px ${DISPLAY}`; ctx.fillText('JOIN US', 84, y + 40);
  y += 150;
  const rows: [string, string][] = [
    ['Hvornår', `${cap(longDate(ev))}${ev.time ? ' kl. ' + ev.time : ''}`],
    ['Hvor', ev.place || 'Sted følger'],
    ['Tilmeldte', goingCount ? `${goingCount} kommer` : 'Tilmelding åben'],
  ];
  rows.forEach(([k, v], i) => {
    const yy = y + i * 150;
    ctx.fillStyle = p.dim; ctx.font = `600 34px ${BODY}`; ctx.fillText(k.toUpperCase(), 84, yy);
    ctx.fillStyle = p.fg; fit(ctx, v, 600, 60, BODY, W - 168); ctx.fillText(v, 84, yy + 72);
  });
  if (ev.exercises.length) {
    const yy = y + rows.length * 150 + 20;
    ctx.fillStyle = p.dim; ctx.font = `600 34px ${BODY}`; ctx.fillText('PROGRAM', 84, yy);
    ctx.fillStyle = p.fg; ctx.font = `500 46px ${BODY}`;
    const prog = ev.exercises.map((x) => `${fmt(x.target)} ${x.unit === 'reps' ? '' : x.unit + ' '}${x.name.toLowerCase()}`.replace(/\s+/g, ' ')).join(' · ');
    wrap(ctx, prog, W - 168, 2).forEach((l, i) => ctx.fillText(l, 84, yy + 70 + i * 60));
  }
  footer(ctx, 'Tilmeld dig i appen', cap(relDay(ev)) + (ev.time ? ' kl. ' + ev.time : ''), p);
  return toBlob(cv);
}

function withShadows(content: HTMLCanvasElement, glow: 'dark' | 'light'): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = content.width; out.height = content.height;
  const o = out.getContext('2d')!;
  const rgb = glow === 'dark' ? '0, 0, 0' : '255, 255, 255';
  const [soft, tight] = glow === 'dark' ? [0.32, 0.3] : [0.3, 0.22];
  o.shadowColor = `rgba(${rgb}, ${soft})`; o.shadowBlur = 30; o.shadowOffsetY = 4; o.drawImage(content, 0, 0);
  o.shadowColor = `rgba(${rgb}, ${tight})`; o.shadowBlur = 5; o.shadowOffsetY = 1; o.drawImage(content, 0, 0);
  return out;
}

function lockup(ctx: CanvasRenderingContext2D, glyph: HTMLImageElement, cx: number, y: number, color: string) {
  const g = 104, gap = 18;
  ctx.font = `900 58px ${DISPLAY}`;
  const word = 'OUTDOOR OFFICE'; const ww = ctx.measureText(word).width;
  const x0 = cx - (g + gap + ww) / 2;
  ctx.drawImage(tintGlyph(glyph, g, color), x0, y - g * 0.8, g, g);
  ctx.textAlign = 'left'; ctx.fillText(word, x0 + g + gap, y); ctx.textAlign = 'center';
}

function bigValue(ctx: CanvasRenderingContext2D, value: string, cx: number, y: number, size: number) {
  const m = /^([\d.,:]+)\s*(.*)$/.exec(value);
  const num = m ? m[1] : value; const unit = m ? m[2] : '';
  let s = size;
  const measure = () => {
    ctx.font = `900 ${s}px ${DISPLAY}`; const w1 = ctx.measureText(num).width;
    ctx.font = `800 ${Math.round(s * 0.42)}px ${DISPLAY}`; const w2 = unit ? ctx.measureText(unit.toUpperCase()).width + s * 0.12 : 0;
    return [w1, w2];
  };
  let [w1, w2] = measure();
  while (w1 + w2 > 960 && s > 60) { s -= 6; [w1, w2] = measure(); }
  const x0 = cx - (w1 + w2) / 2;
  ctx.textAlign = 'left';
  ctx.font = `900 ${s}px ${DISPLAY}`; ctx.fillText(num, x0, y);
  if (unit) { ctx.font = `800 ${Math.round(s * 0.42)}px ${DISPLAY}`; ctx.fillText(unit.toUpperCase(), x0 + w1 + s * 0.12, y); }
  ctx.textAlign = 'center';
}

function label(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, size = 32) {
  ctx.font = `600 ${size}px ${BODY}`; ctx.fillText(spaced(text.toUpperCase()), cx, y);
}

function cropToContent(cv: HTMLCanvasElement, pad = 24): HTMLCanvasElement {
  const { width, height } = cv;
  const data = cv.getContext('2d')!.getImageData(0, 0, width, height).data;
  let top = -1, bottom = -1, left = width, right = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] > 6) {
        if (top < 0) top = y;
        bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (top < 0) return cv;
  const x = Math.max(0, left - pad), y = Math.max(0, top - pad);
  const w = Math.min(width, right + pad + 1) - x, h = Math.min(height, bottom + pad + 1) - y;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  out.getContext('2d')!.drawImage(cv, x, y, w, h, 0, 0, w, h);
  return out;
}

const stickerStats = (a: Activity) => (a.distanceKm ? activityStats(a) : activityStats(a).filter((s) => s.label !== 'Øvelser'));
const repLines = (a: Activity) => (a.distanceKm ? [] : (a.reps || []).filter((r) => r.count > 0));

export function activityParts(a: Activity): { key: string; label: string }[] {
  return [
    { key: 'meta', label: 'Sport og dato' },
    { key: 'title', label: 'Titel' },
    ...stickerStats(a).map((s) => ({ key: s.label, label: s.label })),
    ...(repLines(a).length ? [{ key: 'lines', label: 'Øvelser' }] : []),
    { key: 'logo', label: 'Logo' },
  ];
}

export function eventParts(ev: EventDoc): { key: string; label: string }[] {
  return [
    { key: 'badge', label: ev.official ? 'Official' : 'Community' },
    { key: 'title', label: 'Titel' },
    { key: 'when', label: 'Dato og tid' },
    ...(ev.place ? [{ key: 'place', label: 'Sted' }] : []),
    { key: 'going', label: 'Tilmeldte' },
    { key: 'logo', label: 'Logo' },
  ];
}

export async function activitySticker(a: Activity, look: ShareLook = DEFAULT_LOOK): Promise<Blob> {
  const [, glyph] = await ready();
  const col = stickerCol(look.color);
  const show = (k: string) => !look.hide.includes(k);
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 2000;
  const ctx = cv.getContext('2d')!;
  ctx.textAlign = 'center'; ctx.fillStyle = col.fg;
  const cx = 540; let y = 40;

  if (show('meta')) {
    y += 50;
    label(ctx, `${a.kind === 'goal' ? 'Program klaret' : sportLabel(a.sport)} · ${shortDate(a.createdAt)}`, cx, y, 32);
    y += 24;
  }
  if (show('title')) {
    ctx.font = `900 96px ${DISPLAY}`;
    wrap(ctx, (a.title || cap(didPhrase(a))).toUpperCase(), 960, 2).forEach((l) => { y += 92; ctx.fillText(l, cx, y); });
  }
  y += 36;
  const stats = stickerStats(a).filter((s) => show(s.label));
  stats.forEach((s, i) => {
    y += i === 0 ? 70 : 64;
    label(ctx, s.label, cx, y, 30);
    const size = i === 0 && stats.length > 1 ? 196 : 150;
    y += Math.round(size * 0.9);
    bigValue(ctx, s.value, cx, y, size);
    y += 6;
  });
  const reps = repLines(a);
  if (reps.length && show('lines')) {
    y += 44;
    reps.slice(0, 4).forEach((r) => {
      y += 78;
      const txt = `${fmt(r.count)}${r.unit && r.unit !== 'reps' ? ` ${r.unit}` : ''} ${r.name}`.toUpperCase();
      fit(ctx, txt, 800, 70, DISPLAY, 960);
      ctx.fillText(txt, cx, y);
    });
    if (reps.length > 4) { y += 56; label(ctx, `+ ${reps.length - 4} øvelser mere`, cx, y, 28); }
  }
  if (show('logo')) { y += 150; lockup(ctx, glyph, cx, y, col.fg); }
  return toBlob(cropToContent(withShadows(cv, col.glow)));
}

export async function eventSticker(ev: EventDoc, goingCount: number, look: ShareLook = DEFAULT_LOOK): Promise<Blob> {
  const [, glyph] = await ready();
  const col = stickerCol(look.color);
  const show = (k: string) => !look.hide.includes(k);
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 2000;
  const ctx = cv.getContext('2d')!;
  ctx.textAlign = 'center'; ctx.fillStyle = col.fg;
  const cx = 540; let y = 40;

  if (show('badge')) {
    y += 20;
    const badge = spaced(ev.official ? 'OFFICIAL EVENT' : 'COMMUNITY MADE EVENT');
    ctx.font = `700 34px ${BODY}`;
    const bw = ctx.measureText(badge).width + 64, bh = 70;
    roundRect(ctx, cx - bw / 2, y, bw, bh, 14);
    if (ev.official) { ctx.fill(); ctx.fillStyle = col.ink; ctx.fillText(badge, cx, y + 47); ctx.fillStyle = col.fg; }
    else { ctx.save(); ctx.strokeStyle = col.fg; ctx.lineWidth = 4; ctx.setLineDash([14, 10]); ctx.stroke(); ctx.restore(); ctx.fillText(badge, cx, y + 47); }
    y += bh + 30;
  }
  if (show('title')) {
    ctx.font = `900 118px ${DISPLAY}`;
    wrap(ctx, ev.title.toUpperCase(), 960, 3).forEach((l) => { y += 112; ctx.fillText(l, cx, y); });
  }
  if (show('when')) {
    const d = dateOf(ev.date);
    const day = (d ? `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS_S[d.getMonth()]}` : relDay(ev)).toUpperCase();
    y += 120;
    fit(ctx, day, 800, ev.time ? 84 : 110, DISPLAY, 960); ctx.fillText(day, cx, y);
    if (ev.time) { y += 196; bigValue(ctx, ev.time, cx, y, 196); }
  }
  if (ev.place && show('place')) {
    ctx.font = `600 46px ${BODY}`;
    wrap(ctx, ev.place, 940, 2).forEach((l) => { y += 66; ctx.fillText(l, cx, y); });
  }
  if (show('going')) {
    y += 70;
    label(ctx, goingCount ? `${goingCount} kommer` : 'Tilmeld dig i appen', cx, y, 30);
  }
  if (show('logo')) { y += 170; lockup(ctx, glyph, cx, y, col.fg); }
  return toBlob(cropToContent(withShadows(cv, col.glow)));
}

export interface RecapData {
  turnout: number;
  totals: { name: string; value: number; unit: string }[];
  weather: string;
  photos: HTMLImageElement[];
  next: string;
  people: { initials: string; color: string }[];
}

export function recapParts(d: RecapData): { key: string; label: string }[] {
  return [
    { key: 'title', label: 'Titel' },
    { key: 'turnout', label: 'Fremmøde' },
    ...(d.totals.length ? [{ key: 'totals', label: 'Holdets tal' }] : []),
    ...(d.weather ? [{ key: 'weather', label: 'Vejr' }] : []),
    ...(d.next ? [{ key: 'next', label: 'Næste gang' }] : []),
    { key: 'logo', label: 'Logo' },
  ];
}

export async function loadPhotos(urls: string[], max = 3): Promise<HTMLImageElement[]> {
  const out: HTMLImageElement[] = [];
  for (const u of urls.slice(0, 8)) {
    if (out.length >= max) break;
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = u;
      });
      const t = document.createElement('canvas'); t.width = 2; t.height = 2;
      const c = t.getContext('2d')!; c.drawImage(img, 0, 0, 2, 2); c.getImageData(0, 0, 1, 1);
      out.push(img);
    } catch {  }
  }
  return out;
}

function coverImg(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
  const s = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
}

const recapDate = (ev: EventDoc) => { const d = dateOf(ev.date); return d ? `${d.getDate()}. ${MONTHS_S[d.getMonth()]}` : ''; };
const totalText = (t: RecapData['totals'][number]) => `${fmt(t.value)}${t.unit === 'reps' ? '' : ' ' + t.unit} ${t.name}`.toUpperCase();

function peopleRow(ctx: CanvasRenderingContext2D, people: RecapData['people'], total: number, x: number, top: number, size: number, p: StoryPalette) {
  const max = total > 8 ? 7 : 8;
  const shown = people.slice(0, max);
  const step = Math.round(size * 0.76);
  const cy = top + size / 2;
  const circle = (cx: number, fill: string, text: string, ink: string) => {
    ctx.beginPath(); ctx.arc(cx, cy, size / 2 + 7, 0, Math.PI * 2); ctx.fillStyle = p.bg; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    ctx.fillStyle = ink; ctx.font = `700 ${Math.round(size * (text.length > 2 ? 0.3 : 0.36))}px ${BODY}`; ctx.fillText(text, cx, cy + size * 0.02);
  };
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  shown.forEach((u, i) => circle(x + size / 2 + i * step, u.color, u.initials, '#FFFFFF'));
  if (total > shown.length) circle(x + size / 2 + shown.length * step, p.line, `+${total - shown.length}`, p.fg);
  ctx.restore();
}

export async function recapStory(ev: EventDoc, d: RecapData, bg: StoryBg = 'night'): Promise<Blob> {
  const [seal, glyph] = await ready();
  const p = storyPal(bg);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  frame(ctx, seal, glyph, p);
  eyebrow(ctx, `Recap · ${recapDate(ev)}`, 340, p);
  ctx.fillStyle = p.fg; ctx.font = `900 128px ${DISPLAY}`;
  const lines = wrap(ctx, ev.title.toUpperCase(), W - 168, 2);
  lines.forEach((l, i) => ctx.fillText(l, 84, 470 + i * 118));
  let y = 470 + (lines.length - 1) * 118 + 44;
  const end = H - 300;
  const photos = d.photos.length > 0;
  if (photos) {
    const top = y, h = 500, w = W - 168;
    const [a, b, c] = d.photos;
    if (!b) coverImg(ctx, a, 84, top, w, h, 34);
    else if (!c) { const w2 = (w - 18) / 2; coverImg(ctx, a, 84, top, w2, h, 34); coverImg(ctx, b, 84 + w2 + 18, top, w2, h, 34); }
    else { const bw = Math.round((w - 18) * 0.62), sw = w - 18 - bw, sh = (h - 18) / 2; coverImg(ctx, a, 84, top, bw, h, 34); coverImg(ctx, b, 84 + bw + 18, top, sw, sh, 28); coverImg(ctx, c, 84 + bw + 18, top + sh + 18, sw, sh, 28); }
    y = top + h + 96;
  } else y += 96;
  const big = photos ? 150 : 240;
  const col2 = 84 + (W - 168) / 2 + 20;
  ctx.fillStyle = p.dim; ctx.font = `600 34px ${BODY}`; ctx.fillText(spaced('MØDTE OP'), 84, y);
  ctx.fillStyle = p.fg; ctx.font = `900 ${big}px ${DISPLAY}`; ctx.fillText(fmt(d.turnout), 76, y + big * 0.93);
  if (d.weather) {
    ctx.fillStyle = p.dim; ctx.font = `600 34px ${BODY}`; ctx.fillText(spaced('VEJRET'), col2, y);
    const [deg, ...rest] = d.weather.split(' og ');
    ctx.fillStyle = p.fg; ctx.font = `900 ${big}px ${DISPLAY}`; ctx.fillText(deg, col2 - 8, y + big * 0.93);
    const words = rest.join(' og ').toUpperCase();
    ctx.fillStyle = p.acc; fit(ctx, words, 800, 52, DISPLAY, W - col2 - 84); ctx.fillText(words, col2, y + big * 0.93 + 66);
  }
  y += big + 120;
  const avatars = () => {
    const size = photos ? 92 : 124;
    if (!d.people.length || y + size > end) return;
    peopleRow(ctx, d.people, d.turnout, 84, y, size, p);
    y += size + 92;
  };
  const totals = () => {
    const room = Math.floor((end - y - 30) / 104);
    if (!d.totals.length || room < 1) return;
    ctx.fillStyle = p.dim; ctx.font = `600 34px ${BODY}`; ctx.fillText(spaced('HOLDET TOG'), 84, y); y += 30;
    d.totals.slice(0, Math.min(4, room)).forEach((t) => {
      y += 104;
      ctx.fillStyle = p.fg; fit(ctx, totalText(t), 900, 96, DISPLAY, W - 168); ctx.fillText(totalText(t), 84, y);
    });
    y += 90;
  };
  if (photos) { totals(); avatars(); } else { avatars(); totals(); }
  if (y + 130 <= end) { ctx.fillStyle = p.acc; fit(ctx, 'TAK FORDI I KOM!', 900, 136, DISPLAY, W - 168); ctx.fillText('TAK FORDI I KOM!', 84, Math.min(end, y + 120)); }
  footer(ctx, d.next ? `Næste gang: ${d.next}` : 'Outdoor Office', [ev.place, ev.official ? 'OFFICIAL EVENT' : 'COMMUNITY MADE EVENT'].filter(Boolean).join(' · '), p);
  return toBlob(cv);
}

export async function recapSticker(ev: EventDoc, d: RecapData, look: ShareLook = DEFAULT_LOOK): Promise<Blob> {
  const [, glyph] = await ready();
  const col = stickerCol(look.color);
  const show = (k: string) => !look.hide.includes(k);
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 2000;
  const ctx = cv.getContext('2d')!;
  ctx.textAlign = 'center'; ctx.fillStyle = col.fg;
  const cx = 540; let y = 40;
  y += 50; label(ctx, `Recap · ${recapDate(ev)}`, cx, y, 32); y += 20;
  if (show('title')) {
    ctx.font = `900 108px ${DISPLAY}`;
    wrap(ctx, ev.title.toUpperCase(), 960, 2).forEach((l) => { y += 104; ctx.fillText(l, cx, y); });
  }
  if (show('turnout')) {
    y += 90; label(ctx, 'Mødte op', cx, y, 30);
    y += 180; bigValue(ctx, String(d.turnout), cx, y, 200);
  }
  if (d.totals.length && show('totals')) {
    y += 40;
    d.totals.slice(0, 4).forEach((t) => { y += 84; fit(ctx, totalText(t), 800, 74, DISPLAY, 960); ctx.fillText(totalText(t), cx, y); });
  }
  if (d.weather && show('weather')) { y += 76; label(ctx, d.weather, cx, y, 32); }
  if (d.next && show('next')) { y += 64; label(ctx, `Næste gang: ${d.next}`, cx, y, 30); }
  if (show('logo')) { y += 150; lockup(ctx, glyph, cx, y, col.fg); }
  return toBlob(cropToContent(withShadows(cv, col.glow)));
}

function hexBadge(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, size: number, fill: string, ink: string) {
  const hex = (r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (-90 + i * 60) * Math.PI / 180; const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineWidth = size * 0.09;
  hex(size * 0.42); ctx.fill(); ctx.stroke();
  ctx.globalAlpha = 0.3; ctx.strokeStyle = ink; ctx.lineWidth = size * 0.022; hex(size * 0.34); ctx.stroke(); ctx.globalAlpha = 1;
  const art = BADGE_ART[id] || { icon: 'medal' as const };
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (art.text) {
    ctx.font = `900 ${Math.round(size * (art.text.length > 2 ? 0.3 : 0.38))}px ${DISPLAY}`;
    ctx.fillText(art.text, cx, cy + size * 0.02);
  } else {
    const s = size * 0.4, top = cy - s / 2 - (art.sub ? size * 0.06 : 0);
    ctx.save(); ctx.translate(cx - s / 2, top); ctx.scale(s / 24, s / 24);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const d of BADGE_PATHS[art.icon || 'medal']) ctx.stroke(new Path2D(d));
    ctx.restore();
    if (art.sub) { ctx.font = `900 ${Math.round(size * 0.17)}px ${DISPLAY}`; ctx.fillText(art.sub, cx, top + s + size * 0.09); }
  }
  ctx.restore();
}

export async function badgeStory(id: string, name: string, earnedAt: number, bg: StoryBg = 'night'): Promise<Blob> {
  const [seal, glyph] = await ready();
  const p = storyPal(bg);
  const b = badgeById(id);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  frame(ctx, seal, glyph, p);
  eyebrow(ctx, 'Nyt mærke', 470, p);
  hexBadge(ctx, id, W / 2, 900, 620, p.acc, p.bg);
  ctx.textAlign = 'center'; ctx.fillStyle = p.fg; ctx.font = `900 150px ${DISPLAY}`;
  const lines = wrap(ctx, (b?.name || 'Nyt mærke').toUpperCase(), W - 168, 2);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 1360 + i * 140));
  ctx.fillStyle = p.dim; ctx.font = `500 46px ${BODY}`;
  wrap(ctx, b?.desc || '', W - 220, 2).forEach((l, i) => ctx.fillText(l, W / 2, 1360 + (lines.length - 1) * 140 + 100 + i * 60));
  ctx.textAlign = 'left';
  const d = new Date(earnedAt);
  footer(ctx, name, `${d.getDate()}/${d.getMonth() + 1} ${d.getFullYear()} · Outdoor Office`, p);
  return toBlob(cv);
}

export async function badgeSticker(id: string, look: ShareLook = DEFAULT_LOOK): Promise<Blob> {
  const [, glyph] = await ready();
  const col = stickerCol(look.color);
  const show = (k: string) => !look.hide.includes(k);
  const b = badgeById(id);
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 2000;
  const ctx = cv.getContext('2d')!;
  ctx.textAlign = 'center'; ctx.fillStyle = col.fg;
  const cx = 540; let y = 60;
  if (show('label')) { y += 40; label(ctx, 'Nyt mærke', cx, y, 32); }
  hexBadge(ctx, id, cx, y + 300, 520, col.fg, col.ink);
  y += 600;
  ctx.textAlign = 'center'; ctx.fillStyle = col.fg;
  if (show('title')) { ctx.font = `900 120px ${DISPLAY}`; wrap(ctx, (b?.name || '').toUpperCase(), 960, 2).forEach((l) => { y += 116; ctx.fillText(l, cx, y); }); }
  if (show('desc') && b) { ctx.font = `600 44px ${BODY}`; wrap(ctx, b.desc, 920, 2).forEach((l) => { y += 62; ctx.fillText(l, cx, y); }); }
  if (show('logo')) { y += 150; lockup(ctx, glyph, cx, y, col.fg); }
  return toBlob(cropToContent(withShadows(cv, col.glow)));
}

export const badgeParts = [
  { key: 'label', label: 'Nyt mærke' }, { key: 'title', label: 'Navn' }, { key: 'desc', label: 'Beskrivelse' }, { key: 'logo', label: 'Logo' },
];

export const canCopyImage = () =>
  typeof window !== 'undefined' && 'ClipboardItem' in window && !!navigator.clipboard && typeof navigator.clipboard.write === 'function';

export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch { return false; }
}

export type ShareResult = 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed';

export function saveImage(blob: Blob, filename: string): ShareResult {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return 'downloaded';
  } catch { return 'failed'; }
}

export async function shareImage(blob: Blob, filename: string, text: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text }); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  return saveImage(blob, filename);
}

export async function shareLink(url: string, title: string, text: string): Promise<ShareResult> {
  if (navigator.share) {
    try { await navigator.share({ url, title, text }); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
}
