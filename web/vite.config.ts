import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

function swConfig(): Plugin {
  let body = '';
  return {
    name: 'outdoor-office-sw-config',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, 'VITE_');
      const cfg = {
        apiKey: env.VITE_FIREBASE_API_KEY || '',
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
        projectId: env.VITE_FIREBASE_PROJECT_ID || '',
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: env.VITE_FIREBASE_APP_ID || '',
      };
      body = `self.FIREBASE_CONFIG = ${JSON.stringify(cfg)};\n`;
    },
    configureServer(server) {
      server.middlewares.use('/sw-config.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sw-config.js', source: body });
    },
  };
}

function demoHead(): Plugin {
  const png = (f: string) => `data:image/png;base64,${readFileSync(new URL(`./public/icons/${f}`, import.meta.url)).toString('base64')}`;
  return {
    name: 'outdoor-office-demo-head',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace('href="/icons/favicon.png"', `href="${png('favicon.png')}"`)
        .replace('href="/icons/apple-touch-icon.png"', `href="${png('apple-touch-icon.png')}"`),
    },
  };
}

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [react(), ...(demo ? [demoHead(), viteSingleFile()] : [swConfig()])],
    define: { __DEMO__: JSON.stringify(demo) },
    build: demo
      ? { outDir: 'dist-demo', assetsInlineLimit: 100_000_000, copyPublicDir: false }
      : { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 800 },
  };
});
