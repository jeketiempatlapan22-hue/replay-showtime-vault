import { useMemo } from 'react';

function Lantern({ style, alt }: { style: React.CSSProperties; alt?: boolean }) {
  return (
    <div
      className={`absolute ${alt ? 'animate-float-lantern-alt' : 'animate-float-lantern'}`}
      style={style}
    >
      {/* Chain */}
      <div className="mx-auto w-0.5 h-6 bg-primary/40" />
      {/* Lantern body */}
      <div className="relative w-10 h-14 mx-auto">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-b from-primary/80 to-primary/40 border border-primary/30" />
        {/* Glow */}
        <div className="absolute -inset-3 rounded-full bg-primary/20 animate-glow-pulse" />
        {/* Inner light */}
        <div className="absolute inset-2 rounded bg-primary/30" />
        {/* Top cap */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 rounded-t bg-primary/60" />
        {/* Bottom cap */}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1.5 rounded-b bg-primary/50" />
      </div>
    </div>
  );
}

function Moon() {
  return (
    <div className="absolute top-8 right-8 md:top-12 md:right-16">
      <div className="relative w-20 h-20 md:w-28 md:h-28">
        {/* Moon glow */}
        <div className="absolute inset-0 rounded-full animate-moon-glow" 
          style={{ background: 'radial-gradient(circle, hsla(45,60%,85%,0.4) 0%, transparent 70%)' }} />
        {/* Moon crescent */}
        <div className="absolute inset-0 rounded-full" 
          style={{ background: 'linear-gradient(135deg, hsl(45,60%,85%) 0%, hsl(45,50%,75%) 100%)' }} />
        {/* Shadow to create crescent */}
        <div className="absolute rounded-full" 
          style={{ 
            width: '70%', height: '70%', top: '10%', left: '25%',
            background: 'hsl(220,40%,8%)'
          }} />
      </div>
    </div>
  );
}

export default function RamadhanBackground() {
  const stars = useMemo(() => 
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 60}%`,
      size: Math.random() * 3 + 1,
      delay: `${Math.random() * 4}s`,
      duration: `${Math.random() * 2 + 1.5}s`,
    })), []
  );

  const particles = useMemo(() =>
    Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 8}s`,
      size: Math.random() * 4 + 2,
    })), []
  );

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(225,50%,5%) 0%, hsl(220,40%,8%) 30%, hsl(215,45%,15%) 100%)' }}>
      
      <Moon />

      {/* Stars */}
      {stars.map(s => (
        <div key={s.id} className="absolute rounded-full bg-foreground/80 animate-twinkle"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay, animationDuration: s.duration }} />
      ))}

      {/* Lanterns */}
      <Lantern style={{ left: '5%', top: '8%' }} />
      <Lantern style={{ left: '25%', top: '3%' }} alt />
      <Lantern style={{ right: '30%', top: '5%' }} />
      <Lantern style={{ right: '8%', top: '2%' }} alt />
      <Lantern style={{ left: '50%', top: '6%' }} />

      {/* Rising particles */}
      {particles.map(p => (
        <div key={p.id} className="absolute rounded-full animate-particle-rise"
          style={{ 
            left: p.left, bottom: 0, width: p.size, height: p.size, animationDelay: p.delay,
            background: `radial-gradient(circle, hsl(45,80%,55%) 0%, transparent 70%)`
          }} />
      ))}

      {/* Mosque silhouette at bottom */}
      <svg className="absolute bottom-0 left-0 w-full h-24 md:h-32" viewBox="0 0 1440 120" preserveAspectRatio="none">
        <path d="M0,120 L0,80 Q60,60 120,80 L200,80 Q220,30 240,80 L300,80 L300,60 Q320,20 340,60 L340,80 Q360,40 380,80 L500,80 Q520,50 540,80 L700,80 L700,50 Q730,10 760,50 L760,80 Q780,60 800,80 L900,80 Q920,40 940,80 L1100,80 Q1120,55 1140,80 L1200,80 L1200,65 Q1220,25 1240,65 L1240,80 Q1260,50 1280,80 L1440,80 L1440,120 Z"
          fill="hsl(220,40%,6%)" opacity="0.8" />
      </svg>
    </div>
  );
}
