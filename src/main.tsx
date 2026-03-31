import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Suppress DOM reconciliation errors globally (prevents Chrome blank screen)
window.addEventListener('error', (event) => {
  const msg = event.error?.message || event.message || '';
  if (
    msg.includes('insertBefore') ||
    msg.includes('removeChild') ||
    msg.includes('appendChild') ||
    msg.includes('replaceChild') ||
    msg.includes('NotFoundError')
  ) {
    console.warn('Suppressed DOM error:', msg);
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message || event.reason || '');
  if (
    msg.includes('insertBefore') ||
    msg.includes('removeChild') ||
    msg.includes('NotFoundError')
  ) {
    console.warn('Suppressed DOM rejection:', msg);
    event.preventDefault();
  }
});

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
