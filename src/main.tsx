import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyDisplayMode, inDesktopApp } from './game/displayMode';
import { loadSettings } from './game/settings';
import { preloadStage } from './render/stage/StageView';
import { menuVenue } from './render/venues/catalog';
import { App } from './ui/App';
import { bootDone, bootFonts } from './ui/boot';
import './ui/fonts/archivo/archivo.css';
import './ui/styles.css';

// The desktop window starts hidden; this puts it in the stored display mode and shows it.
void applyDisplayMode(loadSettings().displayMode);

/**
 * On the website, a host that cannot send the isolation headers (GitHub Pages) gets them from a
 * service worker (public/coi-sw.js). It only takes charge of the page after a reload, so the first
 * visit loads once more; a browser where that does not help is not asked again in this tab.
 */
function isolate() {
  if (import.meta.env.DEV || inDesktopApp() || window.crossOriginIsolated || !('serviceWorker' in navigator) || !window.isSecureContext)
    return;
  const tried = 'soundwave.isolation-reload';
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}coi-sw.js`, { scope: import.meta.env.BASE_URL })
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      if (window.crossOriginIsolated || sessionStorage.getItem(tried)) return;
      sessionStorage.setItem(tried, '1');
      location.reload();
    })
    .catch((e) => console.warn('cross-origin isolation is not available', e));
}
isolate();

bootFonts();
const root = document.getElementById('root')!;
if (import.meta.env.DEV && location.hash.startsWith('#stage')) {
  bootDone();
  void import('./debug/StagePreview').then((m) => m.runStagePreview(root));
} else {
  // The stage's worker starts on the venue at once, while the page is still being put together.
  preloadStage(menuVenue(loadSettings().venue));
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
