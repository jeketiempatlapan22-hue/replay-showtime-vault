import { useEffect, useState } from 'react';

export function useAutoHideOnInteraction(enabled = true, delay = 3000) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const showTemporarily = () => {
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), delay);
    };

    showTemporarily();
    window.addEventListener('pointerdown', showTemporarily, { capture: true, passive: true });
    window.addEventListener('keydown', showTemporarily, { capture: true });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('pointerdown', showTemporarily, { capture: true });
      window.removeEventListener('keydown', showTemporarily, { capture: true });
    };
  }, [delay, enabled]);

  return visible;
}