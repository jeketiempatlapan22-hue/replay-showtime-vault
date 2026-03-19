import { ArrowLeft, Maximize, Minimize } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ReplayCard } from '@/lib/types';

interface Props {
  replay: ReplayCard;
  onBack: () => void;
}

export default function YouTubePlayer({ replay, onBack }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background relative z-10">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate font-sans">{replay.title}</h1>
          <p className="text-sm text-muted-foreground">{replay.criteria}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </Button>
      </div>

      {/* Player */}
      <div ref={containerRef} className="w-full max-w-5xl mx-auto p-4">
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute inset-0 w-full h-full rounded-xl"
            src={`https://www.youtube.com/embed/${replay.youtubeId}?rel=0&modestbranding=1`}
            title={replay.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
        {/* Info below player */}
        <div className="mt-6 space-y-3">
          <p className="text-muted-foreground text-sm">
            {new Date(replay.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <div className="flex flex-wrap gap-2">
            {replay.lineup.map((m, i) => (
              <span key={i} className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm">{m}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
