export async function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(blob);
    const size = { w: bmp.width, h: bmp.height };
    bmp.close();
    return size;
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      return { w: img.naturalWidth, h: img.naturalHeight };
    } finally { URL.revokeObjectURL(url); }
  }
}

export async function compressImage(file: File, maxSide = 1600, quality = 0.84): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function toDataUrl(src: Blob | string, maxSide: number, quality: number, maxChars: number): Promise<{ url: string; w: number; h: number }> {
  const objectUrl = typeof src === 'string' ? '' : URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = objectUrl || (src as string); });
    let side = maxSide, q = quality;
    for (let tries = 0; tries < 8; tries++) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= maxChars) return { url, w, h };
      if (q > 0.5) q -= 0.08; else side = Math.round(side * 0.8);
    }
    throw new Error('Billedet er for stort');
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export const IMG = {
  avatar: { side: 256, q: 0.78, max: 40_000 },
  activity: { side: 960, q: 0.7, max: 220_000 },
  photo: { side: 1080, q: 0.7, max: 260_000 },
  cover: { side: 480, q: 0.62, max: 45_000 },
} as const;
