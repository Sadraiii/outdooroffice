export interface AddressHit {
  name: string;
  detail: string;
  town: string;
  lat: number;
  lon: number;
  dk: boolean;
}

export const addressUrl = (q: string, near?: { lat: number; lon: number } | null) =>
  `https://photon.komoot.io/api/?q=${encodeURIComponent(q.trim())}&limit=8`
  + (near ? `&lat=${near.lat.toFixed(2)}&lon=${near.lon.toFixed(2)}` : '');

export function parseAddresses(j: unknown): AddressHit[] {
  const features = ((j as { features?: unknown[] } | null)?.features || []) as { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }[];
  const out: AddressHit[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const p = f.properties || {};
    const c = f.geometry?.coordinates || [];
    if (typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string).trim() : '');
    const street = [s('street'), s('housenumber')].filter(Boolean).join(' ');
    const town = s('city') || s('town') || s('village') || s('county') || s('state');
    const name = s('name') || street;
    if (!name) continue;
    const area = [s('postcode'), town].filter(Boolean).join(' ');
    const dk = s('countrycode').toUpperCase() === 'DK';
    const detail = [
      s('name') && street && street !== name ? street : '',
      s('district') && s('district') !== town && s('district') !== name ? s('district') : '',
      area,
      dk ? '' : s('country'),
    ].filter(Boolean).join(', ');
    const key = `${name}|${detail}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: name.slice(0, 70), detail, town: town.slice(0, 60), lat: c[1] as number, lon: c[0] as number, dk });
  }
  return out.sort((a, b) => Number(b.dk) - Number(a.dk)).slice(0, 6);
}

export function placeText(a: AddressHit): string {
  const t = a.town && !a.name.toLowerCase().includes(a.town.toLowerCase()) ? `${a.name}, ${a.town}` : a.name;
  return t.slice(0, 80);
}

export function mapsUrl(place: string, geo: { name?: string; lat: number; lon: number } | null | undefined, apple: boolean): string {
  const town = geo?.name?.trim();
  const text = town && !place.toLowerCase().includes(town.toLowerCase()) ? `${place}, ${town}` : place;
  const q = encodeURIComponent(text);
  if (apple) return `https://maps.apple.com/?q=${q}${geo ? `&sll=${geo.lat.toFixed(5)},${geo.lon.toFixed(5)}` : ''}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
