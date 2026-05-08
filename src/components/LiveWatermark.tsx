import { useEffect, useState } from 'react';

interface Props { code: string }

const POSITIONS = [
  { top: '10%', left: '5%' },
  { top: '10%', right: '5%' },
  { bottom: '18%', left: '5%' },
  { bottom: '18%', right: '5%' },
];

export default function LiveWatermark({ code }: Props) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % POSITIONS.length), 15000);
    return () => clearInterval(t);
  }, []);
  if (!code) return null;
  const pos = POSITIONS[idx];
  return (
    <div
      className="absolute z-[25] pointer-events-none select-none transition-all duration-1000"
      style={{ ...pos }}
    >
      <span
        className="text-[10px] sm:text-xs md:text-sm font-mono font-bold tracking-wider whitespace-nowrap"
        style={{
          color: 'rgba(255,255,255,0.55)',
          textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6)',
        }}
      >
        {code}
      </span>
    </div>
  );
}
