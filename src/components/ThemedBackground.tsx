import { useMemo } from 'react';

// Theme backgrounds
function RamadhanLantern({ style, alt }: { style: React.CSSProperties; alt?: boolean }) {
  return (
    <div className={`absolute ${alt ? 'animate-float-lantern-alt' : 'animate-float-lantern'}`} style={style}>
      <div className="mx-auto w-0.5 h-6 bg-primary/40" />
      <div className="relative w-10 h-14 mx-auto">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-b from-primary/80 to-primary/40 border border-primary/30" />
        <div className="absolute -inset-3 rounded-full bg-primary/20 animate-glow-pulse" />
        <div className="absolute inset-2 rounded bg-primary/30" />
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 rounded-t bg-primary/60" />
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1.5 rounded-b bg-primary/50" />
      </div>
    </div>
  );
}

function CrescentMoon() {
  return (
    <div className="absolute top-8 right-8 md:top-12 md:right-16">
      <div className="relative w-20 h-20 md:w-28 md:h-28">
        <div className="absolute inset-0 rounded-full animate-moon-glow" style={{ background: 'radial-gradient(circle, hsla(45,60%,85%,0.4) 0%, transparent 70%)' }} />
        <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(135deg, hsl(45,60%,85%) 0%, hsl(45,50%,75%) 100%)' }} />
        <div className="absolute rounded-full" style={{ width: '70%', height: '70%', top: '10%', left: '25%', background: 'hsl(220,40%,8%)' }} />
      </div>
    </div>
  );
}

function Planet({ color, size, top, left, glowColor }: { color: string; size: number; top: string; left: string; glowColor: string }) {
  return (
    <div className="absolute animate-float-lantern" style={{ top, left }}>
      <div className="relative" style={{ width: size, height: size }}>
        <div className="absolute inset-0 rounded-full animate-moon-glow" style={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)` }} />
        <div className="absolute inset-0 rounded-full" style={{ background: color }} />
        <div className="absolute rounded-full" style={{ width: '30%', height: '30%', top: '20%', left: '60%', background: 'rgba(255,255,255,0.15)', filter: 'blur(4px)' }} />
      </div>
    </div>
  );
}

function Stars({ count = 50 }: { count?: number }) {
  const stars = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 70}%`,
      size: Math.random() * 3 + 1,
      delay: `${Math.random() * 4}s`,
      duration: `${Math.random() * 2 + 1.5}s`,
    })), [count]
  );

  return (
    <>
      {stars.map(s => (
        <div key={s.id} className="absolute rounded-full bg-foreground/80 animate-twinkle"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay, animationDuration: s.duration }} />
      ))}
    </>
  );
}

function Particles({ color = 'hsl(45,80%,55%)' }: { color?: string }) {
  const particles = useMemo(() =>
    Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 8}s`,
      size: Math.random() * 4 + 2,
    })), []
  );

  return (
    <>
      {particles.map(p => (
        <div key={p.id} className="absolute rounded-full animate-particle-rise"
          style={{ left: p.left, bottom: 0, width: p.size, height: p.size, animationDelay: p.delay, background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }} />
      ))}
    </>
  );
}

// RAMADHAN THEME
function RamadhanBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(225,50%,5%) 0%, hsl(220,40%,8%) 30%, hsl(215,45%,15%) 100%)' }}>
      <CrescentMoon />
      <Stars />
      <RamadhanLantern style={{ left: '5%', top: '8%' }} />
      <RamadhanLantern style={{ left: '25%', top: '3%' }} alt />
      <RamadhanLantern style={{ right: '30%', top: '5%' }} />
      <RamadhanLantern style={{ right: '8%', top: '2%' }} alt />
      <RamadhanLantern style={{ left: '50%', top: '6%' }} />
      <Particles />
      <svg className="absolute bottom-0 left-0 w-full h-24 md:h-32" viewBox="0 0 1440 120" preserveAspectRatio="none">
        <path d="M0,120 L0,80 Q60,60 120,80 L200,80 Q220,30 240,80 L300,80 L300,60 Q320,20 340,60 L340,80 Q360,40 380,80 L500,80 Q520,50 540,80 L700,80 L700,50 Q730,10 760,50 L760,80 Q780,60 800,80 L900,80 Q920,40 940,80 L1100,80 Q1120,55 1140,80 L1200,80 L1200,65 Q1220,25 1240,65 L1240,80 Q1260,50 1280,80 L1440,80 L1440,120 Z"
          fill="hsl(220,40%,6%)" opacity="0.8" />
      </svg>
    </div>
  );
}

// SPACE THEME
function SpaceBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(260,30%,4%) 0%, hsl(240,25%,8%) 40%, hsl(220,30%,12%) 100%)' }}>
      <Stars count={80} />
      <Planet color="linear-gradient(135deg, hsl(30,60%,50%) 0%, hsl(20,70%,35%) 100%)" size={60} top="10%" left="15%" glowColor="hsla(30,60%,50%,0.3)" />
      <Planet color="linear-gradient(135deg, hsl(40,80%,70%) 0%, hsl(30,60%,50%) 100%)" size={45} top="20%" left="75%" glowColor="hsla(40,80%,70%,0.3)" />
      <Planet color="linear-gradient(135deg, hsl(200,50%,60%) 0%, hsl(210,60%,40%) 100%)" size={80} top="8%" left="85%" glowColor="hsla(200,50%,60%,0.25)" />
      <Particles color="hsl(200,80%,70%)" />
      {/* Nebula effect */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20"
        style={{ background: 'radial-gradient(ellipse at 30% 20%, hsla(280,60%,40%,0.3) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, hsla(200,60%,40%,0.2) 0%, transparent 50%)' }} />
    </div>
  );
}

// OCEAN THEME
function OceanBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(200,50%,8%) 0%, hsl(195,60%,15%) 40%, hsl(190,50%,20%) 100%)' }}>
      <Stars count={30} />
      {/* Full moon */}
      <div className="absolute top-8 right-12 md:top-12 md:right-20">
        <div className="relative w-16 h-16 md:w-24 md:h-24">
          <div className="absolute inset-0 rounded-full animate-moon-glow" style={{ background: 'radial-gradient(circle, hsla(45,40%,90%,0.4) 0%, transparent 70%)' }} />
          <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(135deg, hsl(45,30%,90%) 0%, hsl(45,20%,80%) 100%)' }} />
        </div>
      </div>
      <Particles color="hsl(190,80%,60%)" />
      {/* Waves at bottom */}
      <svg className="absolute bottom-0 left-0 w-full h-20 md:h-28" viewBox="0 0 1440 100" preserveAspectRatio="none">
        <path d="M0,100 L0,60 Q120,30 240,60 Q360,90 480,60 Q600,30 720,60 Q840,90 960,60 Q1080,30 1200,60 Q1320,90 1440,60 L1440,100 Z"
          fill="hsl(195,60%,12%)" opacity="0.6" />
        <path d="M0,100 L0,70 Q120,50 240,70 Q360,90 480,70 Q600,50 720,70 Q840,90 960,70 Q1080,50 1200,70 Q1320,90 1440,70 L1440,100 Z"
          fill="hsl(195,60%,10%)" opacity="0.8" />
      </svg>
    </div>
  );
}

// SUNSET THEME
function SunsetBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(260,30%,10%) 0%, hsl(280,40%,18%) 25%, hsl(340,50%,25%) 50%, hsl(20,60%,30%) 75%, hsl(30,50%,20%) 100%)' }}>
      <Stars count={25} />
      {/* Sun glow at horizon */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
        <div className="w-40 h-20 md:w-60 md:h-28 rounded-t-full"
          style={{ background: 'radial-gradient(ellipse at bottom, hsla(30,80%,55%,0.5) 0%, hsla(340,50%,35%,0.2) 50%, transparent 80%)' }} />
      </div>
      <Particles color="hsl(30,80%,55%)" />
    </div>
  );
}

export type ThemeType = 'ramadhan' | 'space' | 'ocean' | 'sunset';

export const THEME_OPTIONS: { value: ThemeType; label: string; emoji: string }[] = [
  { value: 'ramadhan', label: 'Ramadhan', emoji: '🌙' },
  { value: 'space', label: 'Luar Angkasa', emoji: '🚀' },
  { value: 'ocean', label: 'Samudra', emoji: '🌊' },
  { value: 'sunset', label: 'Sunset', emoji: '🌅' },
];

export default function ThemedBackground({ theme = 'ramadhan' }: { theme?: ThemeType }) {
  switch (theme) {
    case 'space': return <SpaceBackground />;
    case 'ocean': return <OceanBackground />;
    case 'sunset': return <SunsetBackground />;
    default: return <RamadhanBackground />;
  }
}
