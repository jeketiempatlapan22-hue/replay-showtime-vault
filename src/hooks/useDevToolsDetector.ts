import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';

/**
 * DevTools detector — designed to:
 *  - Trigger reliably when DevTools is open (size diff + console getter trick)
 *  - AVOID false positives for normal users (no debugger pause, larger threshold,
 *    requires confirmation across multiple checks)
 *  - Block F12 / Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C key combos
 *  - Disable right-click globally
 *
 * Removed (false-positive risks):
 *  - `debugger` interval (could freeze tabs / be caught by extensions)
 *  - Ctrl+U block (View Source is not DevTools)
 */

const SIZE_THRESHOLD = 250; // px diff between outer/inner — larger = safer
const CONFIRM_COUNT = 2;    // require N consecutive positive checks

let alreadyTriggered = false;

export function useDevToolsDetector(onDetect: () => void) {
  useEffect(() => {
    let intervalId: number | undefined;
    let positiveStreak = 0;

    const trigger = async (reason: string) => {
      if (alreadyTriggered) return;
      alreadyTriggered = true;
      try {
        const browserId = getBrowserId();
        await supabase.from('blocked_browsers').upsert(
          { browser_id: browserId, reason, unblocked: false },
          { onConflict: 'browser_id' }
        );
      } catch {
        // ignore
      }
      onDetect();
    };

    // Strategy 1: window outer/inner size diff
    const sizeOpen = () => {
      if (window.outerWidth === 0 || window.outerHeight === 0) return false;
      // Skip mobile/small viewports — browser chrome overlays distort numbers
      if (window.innerWidth < 700) return false;
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      return widthDiff > SIZE_THRESHOLD || heightDiff > SIZE_THRESHOLD;
    };

    // Strategy 2: console getter trick — fires only when DevTools formats the object
    let consoleTriggered = false;
    const probe: any = {};
    Object.defineProperty(probe, 'id', {
      get() {
        consoleTriggered = true;
        return '';
      },
    });

    const check = () => {
      // Reset and probe
      consoleTriggered = false;
      // eslint-disable-next-line no-console
      console.debug?.(probe);
      // Clear console artefacts (no-op if devtools closed)
      try { (console as any).clear?.(); } catch { /* ignore */ }

      const open = sizeOpen() || consoleTriggered;
      if (open) {
        positiveStreak += 1;
        if (positiveStreak >= CONFIRM_COUNT) {
          trigger(consoleTriggered ? 'devtools_console_probe' : 'devtools_size_detected');
        }
      } else {
        positiveStreak = 0;
      }
    };

    // Key shortcuts that open DevTools directly
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        trigger('devtools_f12');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && /^[ijcIJC]$/.test(e.key)) {
        e.preventDefault();
        trigger('devtools_shortcut');
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    intervalId = window.setInterval(check, 1500);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onDetect]);
}
