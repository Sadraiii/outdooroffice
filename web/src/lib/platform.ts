import { appearance } from './theme';

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export const hasPushApis = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function buzz(pattern: number | number[]) {
  if (!appearance().haptics) return;
  try { navigator.vibrate?.(pattern); } catch {  }
}

export const reducedMotion = () => !appearance().motion || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
