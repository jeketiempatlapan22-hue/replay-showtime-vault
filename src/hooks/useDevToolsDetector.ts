import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';

/**
 * Detect when DevTools is opened and trigger a block callback.
 * Uses multiple strategies tuned to minimize false positives:
 *  - Window outer/inner size delta (catches docked DevTools)
 *  - debugger-timing trick (catches console-based detection)
 *  - F12 / Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+U key blocking
 *  - Right-click context menu disabled
 */

const THRESHOLD = 200; // px difference to be considered DevTools open
const TIMING_THRESHOLD = 200; // ms — debugger pause indicates DevTools

let alreadyTriggered = false;

export function useDevToolsDetector(onDetect: () => void) {
  useEffect(() => {
    let intervalId: number | undefined;
    let rafId: number | undefined;

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

    // Strategy 1: window size diff
    const checkSize = () => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      // Ignore mobile/responsive (where outer == 0 sometimes)
      if (window.outerWidth === 0 || window.outerHeight === 0) return;
      // Ignore very small viewports (mobile)
      if (window.innerWidth < 600) return;
      if (widthDiff > THRESHOLD || heightDiff > THRESHOLD) {
        trigger('devtools_size_detected');
      }
    };

    // Strategy 2: debugger timing
    const checkTiming = () => {
      const start = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      const elapsed = performance.now() - start;
      if (elapsed > TIMING_THRESHOLD) {
        trigger('devtools_timing_detected');
      }
    };

    // Strategy 3: block keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12') {
        e.preventDefault();
        trigger('devtools_f12');
        return;
      }
      // Ctrl/Cmd + Shift + I (Inspect)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
        trigger('devtools_inspect');
        return;
      }
      // Ctrl/Cmd + Shift + J (Console)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault();
        trigger('devtools_console');
        return;
      }
      // Ctrl/Cmd + Shift + C (Inspect element)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        trigger('devtools_inspect_c');
        return;
      }
      // Ctrl/Cmd + U (View source)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        trigger('view_source');
        return;
      }
    };

    // Strategy 4: block right-click
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Initial check + intervals
    checkSize();
    intervalId = window.setInterval(() => {
      checkSize();
      checkTiming();
    }, 1500);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('resize', checkSize);

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('resize', checkSize);
    };
  }, [onDetect]);
}
