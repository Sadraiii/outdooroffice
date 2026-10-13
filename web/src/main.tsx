import '@fontsource/big-shoulders-display/latin-700';
import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/big-shoulders-display/latin-900';
import '@fontsource/schibsted-grotesk/latin-400';
import '@fontsource/schibsted-grotesk/latin-500';
import '@fontsource/schibsted-grotesk/latin-600';
import '@fontsource/schibsted-grotesk/latin-700';
import './styles.css';
import glyphUrl from './assets/glyph.png';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyAppearance, loadAppearance } from './lib/theme';
import { installKeyboardHelpers } from './lib/keyboard';

document.documentElement.style.setProperty('--glyph', `url("${glyphUrl}")`);
applyAppearance(loadAppearance());
installKeyboardHelpers();
createRoot(document.getElementById('root')!).render(<App />);
