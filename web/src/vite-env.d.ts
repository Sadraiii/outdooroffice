/// <reference types="vite/client" />

declare const __DEMO__: boolean;

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  readonly VITE_USE_EMULATORS?: string;
  readonly VITE_BLAZE?: string;
  readonly VITE_WORKER_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
