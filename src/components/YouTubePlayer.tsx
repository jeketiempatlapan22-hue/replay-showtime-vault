import { ArrowLeft, Maximize, Minimize, Eye } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { type ReplayRow } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import RatingStars from '@/components/RatingStars';
import CommentSection from '@/components/CommentSection';

interface Props {
  replay: ReplayRow;
  onBack: () => void;
}

export default function YouTubePlayer({ replay, onBack }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewCount, setViewCount] = useState(replay.view_count ?? 0);

  // Sync view count when replay changes
  useEffect(() => {
    setViewCount(replay.view_count ?? 0);
  }, [replay.id, replay.view_count]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const incrementView = async () => {
      try {
        const { data } = await supabase.rpc('increment_view_count', {
          _replay_id: replay.id,
        });
        if (typeof data === 'number') setViewCount(data);
      } catch {
        // silently fail
      }
    };
    incrementView();
  }, [replay.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`replay-views-${replay.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'replays',
        filter: `id=eq.${replay.id}`,
      }, (payload) => {
        const newRow = payload.new as { view_count?: number };
        if (typeof newRow.view_count === 'number') {
          setViewCount(newRow.view_count);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [replay.id]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.() ||
        (containerRef.current as any).webkitRequestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.() || (document as any).webkitExitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  const rawId = replay.youtube_id || '';
  const extractedId = (
    rawId.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1]
    || rawId.trim()
  ).slice(0, 11);
  const isValidId = /^[A-Za-z0-9_-]{11}$/.test(extractedId);

  const embedUrl = `https://www.youtube.com/embed/${extractedId}?rel=0&modestbranding=1&playsinline=1&autoplay=0&origin=${encodeURIComponent(window.location.origin)}`;

  const lineup = replay.lineup || [];

  return (
    <div className="min-h-screen bg-background relative z-10">
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold truncate font-sans">{replay.title}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{replay.criteria}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="shrink-0">
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </Button>
      </div>

      <div ref={containerRef} className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-4">
        {!isValidId ? (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-6 text-center">
            <p className="text-destructive font-medium">Video YouTube tidak valid</p>
          </div>
        ) : (
          <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={embedUrl}
              title={replay.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
              style={{ border: 0 }}
            />
          </div>
        )}

        <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Eye className="w-4 h-4" />
              <span>{viewCount} kali ditonton</span>
            </div>
            <RatingStars replayId={replay.id} />
          </div>

          <p className="text-muted-foreground text-sm">
            {new Date(replay.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          {lineup.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {lineup.map((m, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm">{m}</span>
              ))}
            </div>
          )}

          <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-border">
            <CommentSection replayId={replay.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
