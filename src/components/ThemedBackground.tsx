import { useMemo } from 'react';

// Shared components
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

// RAMADHAN
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

// SPACE
function SpaceBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(260,30%,4%) 0%, hsl(240,25%,8%) 40%, hsl(220,30%,12%) 100%)' }}>
      <Stars count={80} />
      <div className="absolute animate-float-lantern" style={{ top: '10%', left: '15%' }}>
        <div className="relative" style={{ width: 60, height: 60 }}>
          <div className="absolute inset-0 rounded-full animate-moon-glow" style={{ background: 'radial-gradient(circle, hsla(30,60%,50%,0.3) 0%, transparent 70%)' }} />
          <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(135deg, hsl(30,60%,50%) 0%, hsl(20,70%,35%) 100%)' }} />
        </div>
      </div>
      <div className="absolute animate-float-lantern-alt" style={{ top: '20%', left: '75%' }}>
        <div className="relative" style={{ width: 45, height: 45 }}>
          <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(135deg, hsl(40,80%,70%) 0%, hsl(30,60%,50%) 100%)' }} />
        </div>
      </div>
      <div className="absolute animate-float-lantern" style={{ top: '8%', left: '85%' }}>
        <div className="relative" style={{ width: 80, height: 80 }}>
          <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(135deg, hsl(200,50%,60%) 0%, hsl(210,60%,40%) 100%)' }} />
        </div>
      </div>
      <Particles color="hsl(200,80%,70%)" />
      <div className="absolute top-0 left-0 w-full h-full opacity-20"
        style={{ background: 'radial-gradient(ellipse at 30% 20%, hsla(280,60%,40%,0.3) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, hsla(200,60%,40%,0.2) 0%, transparent 50%)' }} />
    </div>
  );
}

// OCEAN
function OceanBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(200,50%,8%) 0%, hsl(195,60%,15%) 40%, hsl(190,50%,20%) 100%)' }}>
      <Stars count={30} />
      <div className="absolute top-8 right-12 md:top-12 md:right-20">
        <div className="relative w-16 h-16 md:w-24 md:h-24">
          <div className="absolute inset-0 rounded-full animate-moon-glow" style={{ background: 'radial-gradient(circle, hsla(45,40%,90%,0.4) 0%, transparent 70%)' }} />
          <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(135deg, hsl(45,30%,90%) 0%, hsl(45,20%,80%) 100%)' }} />
        </div>
      </div>
      <Particles color="hsl(190,80%,60%)" />
      <svg className="absolute bottom-0 left-0 w-full h-20 md:h-28" viewBox="0 0 1440 100" preserveAspectRatio="none">
        <path d="M0,100 L0,60 Q120,30 240,60 Q360,90 480,60 Q600,30 720,60 Q840,90 960,60 Q1080,30 1200,60 Q1320,90 1440,60 L1440,100 Z"
          fill="hsl(195,60%,12%)" opacity="0.6" />
        <path d="M0,100 L0,70 Q120,50 240,70 Q360,90 480,70 Q600,50 720,70 Q840,90 960,70 Q1080,50 1200,70 Q1320,90 1440,70 L1440,100 Z"
          fill="hsl(195,60%,10%)" opacity="0.8" />
      </svg>
    </div>
  );
}

// SUNSET
function SunsetBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(260,30%,10%) 0%, hsl(280,40%,18%) 25%, hsl(340,50%,25%) 50%, hsl(20,60%,30%) 75%, hsl(30,50%,20%) 100%)' }}>
      <Stars count={25} />
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
        <div className="w-40 h-20 md:w-60 md:h-28 rounded-t-full"
          style={{ background: 'radial-gradient(ellipse at bottom, hsla(30,80%,55%,0.5) 0%, hsla(340,50%,35%,0.2) 50%, transparent 80%)' }} />
      </div>
      <Particles color="hsl(30,80%,55%)" />
    </div>
  );
}

// FOREST
function ForestBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(150,30%,6%) 0%, hsl(140,35%,10%) 30%, hsl(130,30%,14%) 100%)' }}>
      <Stars count={20} />
      <Particles color="hsl(120,60%,50%)" />
      {/* Fireflies */}
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="absolute rounded-full animate-twinkle"
          style={{
            left: `${10 + Math.random() * 80}%`, top: `${20 + Math.random() * 60}%`,
            width: 4, height: 4, animationDelay: `${Math.random() * 5}s`,
            background: 'radial-gradient(circle, hsl(60,90%,70%) 0%, transparent 70%)',
            boxShadow: '0 0 8px 2px hsla(60,90%,70%,0.5)',
          }} />
      ))}
      {/* Tree silhouettes */}
      <svg className="absolute bottom-0 left-0 w-full h-32 md:h-48" viewBox="0 0 1440 180" preserveAspectRatio="none">
        <path d="M0,180 L0,140 L60,140 L80,60 L100,140 L140,140 L160,80 L180,140 L240,140 L260,50 L280,140 L340,140 L360,70 L380,140 L440,140 L460,40 L480,140 L560,140 L580,65 L600,140 L660,140 L680,55 L700,140 L780,140 L800,45 L820,140 L880,140 L900,75 L920,140 L980,140 L1000,50 L1020,140 L1080,140 L1100,60 L1120,140 L1180,140 L1200,70 L1220,140 L1300,140 L1320,55 L1340,140 L1400,140 L1420,65 L1440,140 L1440,180 Z"
          fill="hsl(140,30%,5%)" opacity="0.9" />
      </svg>
    </div>
  );
}

// SUNRISE
function SunriseBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(220,40%,15%) 0%, hsl(260,30%,20%) 20%, hsl(330,40%,30%) 45%, hsl(20,70%,45%) 70%, hsl(45,80%,55%) 100%)' }}>
      <Stars count={15} />
      {/* Sun rising */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
        <div className="relative w-28 h-28 md:w-40 md:h-40">
          <div className="absolute inset-0 rounded-full animate-moon-glow" style={{ background: 'radial-gradient(circle, hsla(40,90%,60%,0.6) 0%, hsla(30,80%,50%,0.2) 50%, transparent 70%)' }} />
          <div className="absolute inset-4 rounded-full" style={{ background: 'radial-gradient(circle, hsl(45,90%,70%) 0%, hsl(30,80%,55%) 100%)' }} />
        </div>
      </div>
      <Particles color="hsl(40,90%,60%)" />
    </div>
  );
}

// WINTER / SNOW
function WinterBackground() {
  const snowflakes = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 10}s`,
      size: Math.random() * 5 + 2,
      duration: `${Math.random() * 5 + 6}s`,
    })), []
  );
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(210,30%,12%) 0%, hsl(210,25%,20%) 40%, hsl(210,20%,30%) 100%)' }}>
      <Stars count={25} />
      {/* Snowflakes falling */}
      {snowflakes.map(s => (
        <div key={s.id} className="absolute rounded-full animate-snowfall"
          style={{ left: s.left, top: -10, width: s.size, height: s.size, animationDelay: s.delay, animationDuration: s.duration,
            background: 'radial-gradient(circle, hsla(210,30%,95%,0.9) 0%, hsla(210,30%,90%,0.3) 100%)' }} />
      ))}
      {/* Snow ground */}
      <svg className="absolute bottom-0 left-0 w-full h-16 md:h-24" viewBox="0 0 1440 80" preserveAspectRatio="none">
        <path d="M0,80 L0,50 Q100,35 200,50 Q300,60 400,45 Q500,30 600,50 Q700,55 800,40 Q900,30 1000,50 Q1100,55 1200,42 Q1300,30 1440,50 L1440,80 Z"
          fill="hsl(210,20%,85%)" opacity="0.3" />
      </svg>
    </div>
  );
}

// SPRING
function SpringBackground() {
  const petals = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 8}s`,
      size: Math.random() * 8 + 4,
      duration: `${Math.random() * 4 + 6}s`,
    })), []
  );
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(200,40%,12%) 0%, hsl(180,30%,18%) 40%, hsl(140,25%,22%) 100%)' }}>
      <Stars count={15} />
      {/* Cherry blossom petals */}
      {petals.map(p => (
        <div key={p.id} className="absolute rounded-full animate-petal-fall"
          style={{ left: p.left, top: -10, width: p.size, height: p.size * 0.6, animationDelay: p.delay, animationDuration: p.duration,
            background: `hsl(${340 + Math.random() * 20},70%,${75 + Math.random() * 15}%)`, borderRadius: '50% 0 50% 0', opacity: 0.7 }} />
      ))}
      <Particles color="hsl(330,60%,75%)" />
      {/* Grass at bottom */}
      <svg className="absolute bottom-0 left-0 w-full h-16 md:h-20" viewBox="0 0 1440 60" preserveAspectRatio="none">
        <path d="M0,60 L0,40 Q60,30 120,40 Q180,35 240,40 Q360,30 480,40 Q600,35 720,40 Q840,30 960,40 Q1080,35 1200,40 Q1320,30 1440,40 L1440,60 Z"
          fill="hsl(130,35%,15%)" opacity="0.8" />
      </svg>
    </div>
  );
}

// AURORA
function AuroraBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(230,35%,5%) 0%, hsl(220,30%,10%) 50%, hsl(210,25%,15%) 100%)' }}>
      <Stars count={60} />
      {/* Aurora waves */}
      <div className="absolute top-0 left-0 w-full h-2/3 opacity-30 animate-glow-pulse"
        style={{ background: 'radial-gradient(ellipse at 30% 30%, hsla(160,70%,50%,0.4) 0%, transparent 50%), radial-gradient(ellipse at 60% 20%, hsla(280,60%,50%,0.3) 0%, transparent 50%), radial-gradient(ellipse at 80% 40%, hsla(120,60%,40%,0.3) 0%, transparent 40%)' }} />
      <div className="absolute top-0 left-0 w-full h-1/2 opacity-20 animate-float-lantern"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, hsla(180,70%,45%,0.4) 0%, transparent 60%)' }} />
      <Particles color="hsl(160,70%,50%)" />
    </div>
  );
}

// RAIN — tetesan hujan + kilat halus
function RainBackground() {
  const drops = useMemo(() =>
    Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 2}s`,
      duration: `${Math.random() * 0.6 + 0.7}s`,
      height: Math.random() * 40 + 30,
      opacity: Math.random() * 0.4 + 0.25,
    })), []
  );
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(215,35%,12%) 0%, hsl(212,30%,18%) 60%, hsl(210,25%,24%) 100%)' }}>
      <div className="absolute inset-0 animate-lightning-flash bg-foreground/5" />
      {drops.map(d => (
        <div key={d.id} className="absolute w-px animate-rain-fall"
          style={{
            left: d.left, top: '-10%', height: d.height, opacity: d.opacity,
            background: 'linear-gradient(180deg, transparent, hsl(200,60%,85%))',
            animationDelay: d.delay, animationDuration: d.duration,
          }} />
      ))}
      <div className="absolute bottom-0 left-0 w-full h-1/4 opacity-30"
        style={{ background: 'linear-gradient(0deg, hsla(210,40%,60%,0.35), transparent)' }} />
    </div>
  );
}

// RAINBOW — pita pelangi bergerak
function RainbowBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(200,70%,80%) 0%, hsl(200,60%,90%) 55%, hsl(140,35%,82%) 100%)' }}>
      <div className="absolute -top-1/3 left-1/2 -translate-x-1/2 w-[160vw] h-[160vw] rounded-full opacity-50 animate-rainbow-drift"
        style={{
          background: 'conic-gradient(from 180deg, transparent 0deg, transparent 150deg, hsla(0,80%,60%,0.55) 165deg, hsla(35,90%,60%,0.55) 172deg, hsla(55,90%,60%,0.55) 179deg, hsla(120,60%,50%,0.55) 186deg, hsla(200,80%,55%,0.55) 193deg, hsla(270,60%,60%,0.55) 200deg, transparent 215deg, transparent 360deg)',
          maskImage: 'radial-gradient(circle, transparent 58%, black 60%, black 68%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 58%, black 60%, black 68%, transparent 70%)',
        }} />
      <div className="absolute top-10 left-10 w-40 h-16 rounded-full bg-background/60 blur-xl animate-cloud-drift" />
      <div className="absolute top-32 right-10 w-56 h-20 rounded-full bg-background/50 blur-xl animate-cloud-drift-slow" />
      <Particles color="hsl(55,90%,65%)" />
    </div>
  );
}

// METEOR — hujan meteor di langit malam
function MeteorBackground() {
  const meteors = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 50}%`,
      delay: `${Math.random() * 6}s`,
      duration: `${Math.random() * 1.5 + 1.2}s`,
      width: Math.random() * 90 + 60,
    })), []
  );
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(240,45%,5%) 0%, hsl(235,40%,9%) 60%, hsl(230,35%,14%) 100%)' }}>
      <Stars count={80} />
      {meteors.map(m => (
        <div key={m.id} className="absolute h-px animate-meteor-streak"
          style={{
            left: m.left, top: m.top, width: m.width,
            background: 'linear-gradient(90deg, hsla(45,90%,80%,0.9), transparent)',
            animationDelay: m.delay, animationDuration: m.duration,
          }} />
      ))}
    </div>
  );
}

// SAKURA MALAM — kelopak beterbangan di langit gelap
function SakuraNightBackground() {
  const petals = useMemo(() =>
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 8}s`,
      duration: `${Math.random() * 5 + 7}s`,
      size: Math.random() * 8 + 6,
    })), []
  );
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(300,30%,8%) 0%, hsl(330,28%,13%) 55%, hsl(340,25%,18%) 100%)' }}>
      <Stars count={40} />
      <CrescentMoon />
      {petals.map(p => (
        <div key={p.id} className="absolute animate-petal-fall"
          style={{
            left: p.left, top: '-5%', width: p.size, height: p.size * 0.8,
            borderRadius: '50% 0 50% 50%',
            background: 'radial-gradient(circle at 30% 30%, hsla(340,80%,80%,0.95), hsla(330,70%,60%,0.6))',
            animationDelay: p.delay, animationDuration: p.duration,
          }} />
      ))}
    </div>
  );
}

// AWAN — awan bergerak perlahan
function CloudsBackground() {
  const clouds = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      top: `${Math.random() * 70}%`,
      delay: `${Math.random() * 30}s`,
      duration: `${Math.random() * 40 + 50}s`,
      width: Math.random() * 180 + 120,
      opacity: Math.random() * 0.35 + 0.25,
    })), []
  );
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: 'linear-gradient(180deg, hsl(205,65%,70%) 0%, hsl(200,55%,82%) 60%, hsl(195,45%,90%) 100%)' }}>
      {clouds.map(c => (
        <div key={c.id} className="absolute rounded-full blur-2xl animate-cloud-cross"
          style={{
            top: c.top, left: '-30%', width: c.width, height: c.width * 0.35,
            background: 'hsla(0,0%,100%,0.9)', opacity: c.opacity,
            animationDelay: c.delay, animationDuration: c.duration,
          }} />
      ))}
    </div>
  );
}

export type ThemeType =
  | 'ramadhan' | 'space' | 'ocean' | 'sunset' | 'forest' | 'sunrise' | 'winter' | 'spring' | 'aurora'
  | 'rain' | 'rainbow' | 'meteor' | 'sakura' | 'clouds';

export const THEME_OPTIONS: { value: ThemeType; label: string; emoji: string }[] = [
  { value: 'ramadhan', label: 'Ramadhan', emoji: '🌙' },
  { value: 'space', label: 'Luar Angkasa', emoji: '🚀' },
  { value: 'ocean', label: 'Samudra', emoji: '🌊' },
  { value: 'sunset', label: 'Sunset', emoji: '🌅' },
  { value: 'forest', label: 'Hutan', emoji: '🌲' },
  { value: 'sunrise', label: 'Sunrise', emoji: '🌄' },
  { value: 'winter', label: 'Musim Salju', emoji: '❄️' },
  { value: 'spring', label: 'Musim Semi', emoji: '🌸' },
  { value: 'aurora', label: 'Aurora', emoji: '🌌' },
  { value: 'rain', label: 'Hujan', emoji: '🌧️' },
  { value: 'rainbow', label: 'Pelangi', emoji: '🌈' },
  { value: 'meteor', label: 'Badai Meteor', emoji: '☄️' },
  { value: 'sakura', label: 'Sakura Malam', emoji: '🌸' },
  { value: 'clouds', label: 'Awan', emoji: '☁️' },
];

export default function ThemedBackground({ theme = 'ramadhan' }: { theme?: ThemeType }) {
  switch (theme) {
    case 'space': return <SpaceBackground />;
    case 'ocean': return <OceanBackground />;
    case 'sunset': return <SunsetBackground />;
    case 'forest': return <ForestBackground />;
    case 'sunrise': return <SunriseBackground />;
    case 'winter': return <WinterBackground />;
    case 'spring': return <SpringBackground />;
    case 'aurora': return <AuroraBackground />;
    case 'rain': return <RainBackground />;
    case 'rainbow': return <RainbowBackground />;
    case 'meteor': return <MeteorBackground />;
    case 'sakura': return <SakuraNightBackground />;
    case 'clouds': return <CloudsBackground />;
    default: return <RamadhanBackground />;
  }
}
