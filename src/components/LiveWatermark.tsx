import { useEffect, useState } from 'react';

interface Props { code: string }

const POSITIONS = [
  { top: '8%', left: '6%' },
  { top: '8%', right: '6%' },
  { bottom: '14%', left: '6%' },
  { bottom: '14%', right: '6%' },
];

export default function LiveWatermark({ code }: Props) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % POSITIONS.length), 12000);
    return () => clearInterval(t);
  }, []);
  if (!code) return null;
  const pos = POSITIONS[idx];
  return (
    <div
      className="absolute z-[25] pointer-events-none select-none transition-all duration-1000"
      style={{ ...pos }}
    >
      <div
        className="px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-mono font-bold tracking-wider"
        style={{
          color: 'rgba(255,255,255,0.85)',
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        {code}
      </div>
    </div>
  );
}
