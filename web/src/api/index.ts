import type { Api } from './types';

export const DEMO: boolean = __DEMO__;
export const configured = DEMO || !!import.meta.env.VITE_FIREBASE_API_KEY;

let loading: Promise<Api> | null = null;
export function loadApi(): Promise<Api> {
  if (!loading) loading = (__DEMO__ ? import('./demo') : import('./firebase')).then((m) => m.api);
  return loading;
}
