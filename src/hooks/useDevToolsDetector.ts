import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';

/**
 * DevTools detector — designed to:
 *  - Trigger only on STRONG signals (F12 / shortcut OR significant size diff confirmed
 *    multiple times)
 *  - Skip detection completely on mobile devices, iframes, and zoomed pages where
 *    size diffs are normal
 *  - Block F12 / Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C key combos
 *  - Disable right-click globally
 *
 * Removed (false-positive risks):
 *  - `debugger` interval (could freeze tabs)
 *  - `console.debug + getter` probe (extensions / React DevTools fire this falsely)
 *  - `console.clear()` periodic call (annoying + suspicious)
 */

const SIZE_THRESHOLD = 320; // larger to avoid sidebars / browser chrome
const CONFIRM_COUNT = 4;    // require ~6s of consistent positive checks

let alreadyTriggered = false;

function shouldSkipDetection(): boolean {
  // Skip on mobile / coarse-pointer devices
  if (typeof window === 'undefined') return true;
  if (window.innerWidth < 900) return true;
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
  } catch { /* ignore */ }
  // Skip when running inside an iframe (Lovable preview, embeds)
  try {
    if (window.top !== window.self) return true;
  } catch { return true; }
  // Skip when devicePixelRatio is non-integer (browser zoom UI)
  if (Math.abs(window.devicePixelRatio - Math.round(window.devicePixelRatio)) > 0.1) return true;
  return false;
}

export function useDevToolsDetector(onDetect: () => void) {
  useEffect(() => {
    let intervalId: number | undefined;
    let positiveStreak = 0;

    const trigger = async (reason: string) => {
      if (alreadyTriggered) return;
      alreadyTriggered = true;
      if (intervalId) clearInterval(intervalId);
      try {
        const browserId = getBrowserId();
        await supabase.from('blocked_browsers').upsert(
          { browser_id: browserId, reason, unblocked: false },
          { onConflict: 'browser_id' }
        );
      } catch { /* ignore */ }
      onDetect();
    };

    const sizeOpen = () => {
      if (window.outerWidth === 0 || window.outerHeight === 0) return false;
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      return widthDiff > SIZE_THRESHOLD || heightDiff > SIZE_THRESHOLD;
    };

    const check = () => {
      if (shouldSkipDetection()) { positiveStreak = 0; return; }
      if (sizeOpen()) {
        positiveStreak += 1;
        if (positiveStreak >= CONFIRM_COUNT) trigger('devtools_size_detected');
      } else {
        positiveStreak = 0;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') { e.preventDefault(); trigger('devtools_f12'); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && /^[ijcIJC]$/.test(e.key)) {
        e.preventDefault();
        trigger('devtools_shortcut');
      }
    };

    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); };

    if (!shouldSkipDetection()) {
      intervalId = window.setInterval(check, 1500);
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onDetect]);
}
