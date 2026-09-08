import { useCallback, useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() { listeners.forEach((l) => l()); }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
}

export function usePwaInstall() {
  const [canPrompt, setCanPrompt] = useState(!!deferredPrompt);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const update = () => { setCanPrompt(!!deferredPrompt); setInstalled(isStandalone()); };
    listeners.add(update);
    update();
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', update);
    return () => { listeners.delete(update); mq?.removeEventListener?.('change', update); };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') { deferredPrompt = null; notify(); }
      return outcome;
    } catch {
      return 'unavailable';
    }
  }, []);

  return { canPrompt, installed, promptInstall, ios: isIos() };
}
