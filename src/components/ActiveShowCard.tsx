import { useEffect, useState } from 'react';
import { Calendar, Clock, Tag, Users, Radio, ShoppingCart, PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import MemberAvatar from '@/components/MemberAvatar';
import BuyShowDialog from '@/components/BuyShowDialog';
import { type ActiveShow, getShowDateTime } from '@/lib/activeShows';
import { useNavigate } from 'react-router-dom';

const CATEGORY_LABELS: Record<string, string> = {
  reguler: 'Reguler', sts: 'STS', last_show: 'Last Show', aniv: 'Anniversary', special: 'Show Spesial',
};

function pad(n: number) { return String(n).padStart(2, '0'); }

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = target.getTime() - now;
  if (diff <= 0) return { live: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { live: false, days, hours, minutes, seconds };
}

export default function ActiveShowCard({ show, index = 0 }: { show: ActiveShow; index?: number }) {
  const target = getShowDateTime(show);
  const cd = useCountdown(target);
  const formattedDate = target.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formattedTime = `${pad(target.getHours())}:${pad(target.getMinutes())} WIB`;

  return (
    <div
      className="group relative rounded-xl overflow-hidden border border-border bg-card/80 backdrop-blur-sm hover:border-primary/60 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-1 animate-fade-up opacity-0"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'forwards' }}
    >
      {show.image_url && (
        <div className="relative aspect-video overflow-hidden">
          <img src={show.image_url} alt={show.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[show.category] || show.category}</Badge>
          </div>
          {cd.live && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-red-600 text-white border-0 gap-1 animate-pulse">
                <Radio className="w-3 h-3" /> LIVE
              </Badge>
            </div>
          )}
        </div>
      )}

      <div className="p-4 space-y-3">
        <h3 className="text-lg font-semibold text-foreground line-clamp-2 font-sans">{show.title}</h3>

        {show.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{show.description}</p>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4 text-primary" />
          <span>{formattedDate}</span>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4 text-primary" />
          <span>{formattedTime}</span>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tag className="w-4 h-4 text-primary" />
          <span>{CATEGORY_LABELS[show.category] || show.category}</span>
        </div>

        {show.lineup.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="flex flex-wrap gap-2">
              {show.lineup.map((m, i) => <MemberAvatar key={i} name={m} size={40} />)}
            </div>
          </div>
        )}

        {/* Countdown */}
        <div className="pt-3 border-t border-border/50">
          {cd.live ? (
            <div className="text-center py-2">
              <p className="text-xs text-muted-foreground mb-1">Sedang Berlangsung</p>
              <p className="text-lg font-bold text-red-500 animate-pulse">🔴 ON AIR</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground text-center mb-2">Hitung Mundur</p>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  { v: cd.days, l: 'Hari' },
                  { v: cd.hours, l: 'Jam' },
                  { v: cd.minutes, l: 'Menit' },
                  { v: cd.seconds, l: 'Detik' },
                ].map((u, i) => (
                  <div key={i} className="rounded-md bg-primary/10 border border-primary/20 py-1.5">
                    <div className="text-lg sm:text-xl font-bold text-primary tabular-nums">{pad(u.v)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{u.l}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
