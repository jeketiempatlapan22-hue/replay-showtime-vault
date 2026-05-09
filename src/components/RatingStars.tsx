import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

function getBrowserId(): string {
  let id = localStorage.getItem('replaytime-browser-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('replaytime-browser-id', id);
  }
  return id;
}

interface RatingProps {
  replayId: string;
}

export default function RatingStars({ replayId }: RatingProps) {
  const [userRating, setUserRating] = useState(0);
  const [avgRating, setAvgRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [hovering, setHovering] = useState(0);

  const browserId = getBrowserId();

  useEffect(() => {
    // Fetch average + user's rating
    const fetchRatings = async () => {
      const { data: all } = await supabase
        .from('ratings')
        .select('rating, browser_id')
        .eq('replay_id', replayId);

      if (all && all.length > 0) {
        const sum = all.reduce((a, b) => a + b.rating, 0);
        setAvgRating(sum / all.length);
        setTotalRatings(all.length);
        const mine = all.find(r => r.browser_id === browserId);
        if (mine) setUserRating(mine.rating);
      }
    };
    fetchRatings();
  }, [replayId, browserId]);

  const handleRate = async (rating: number) => {
    setUserRating(rating);
    const { error } = await supabase.rpc('rate_replay', {
      _replay_id: replayId,
      _browser_id: browserId,
      _rating: rating,
    });
    if (!error) {
      // Refresh avg
      const { data: all } = await supabase
        .from('ratings')
        .select('rating')
        .eq('replay_id', replayId);
      if (all && all.length > 0) {
        setAvgRating(all.reduce((a, b) => a + b.rating, 0) / all.length);
        setTotalRatings(all.length);
      }
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHovering(0)}>
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => handleRate(star)}
            onMouseEnter={() => setHovering(star)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={`w-5 h-5 transition-colors ${
                star <= (hovering || userRating)
                  ? 'fill-primary text-primary'
                  : 'text-muted-foreground'
              }`}
            />
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {avgRating > 0 ? `${avgRating.toFixed(1)} (${totalRatings})` : 'Belum ada rating'}
      </span>
    </div>
  );
}
