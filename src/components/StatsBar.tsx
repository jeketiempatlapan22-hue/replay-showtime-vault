import { useMemo } from 'react';
import { BarChart3, Tv, Users, Film } from 'lucide-react';
import type { ReplayRow } from '@/lib/store';

interface StatsBarProps {
  replays: ReplayRow[];
}

export default function StatsBar({ replays }: StatsBarProps) {
  const stats = useMemo(() => {
    const total = replays.length;
    if (total === 0) return null;

    // Most popular show
    const showCount: Record<string, number> = {};
    const memberCount: Record<string, number> = {};

    for (const r of replays) {
      if (r.show_name) showCount[r.show_name] = (showCount[r.show_name] || 0) + 1;
      for (const m of r.lineup) {
        memberCount[m] = (memberCount[m] || 0) + 1;
      }
    }

    const topShow = Object.entries(showCount).sort((a, b) => b[1] - a[1])[0];
    const topMember = Object.entries(memberCount).sort((a, b) => b[1] - a[1])[0];

    return { total, topShow, topMember };
  }, [replays]);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 backdrop-blur border border-border">
        <div className="p-2 rounded-lg bg-primary/10">
          <Film className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Replay</p>
          <p className="text-lg font-bold text-foreground">{stats.total}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 backdrop-blur border border-border">
        <div className="p-2 rounded-lg bg-primary/10">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Kriteria</p>
          <p className="text-lg font-bold text-foreground">
            {new Set(replays.map(r => r.criteria)).size}
          </p>
        </div>
      </div>

      {stats.topShow && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 backdrop-blur border border-border">
          <div className="p-2 rounded-lg bg-primary/10">
            <Tv className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Show Terpopuler</p>
            <p className="text-sm font-bold text-foreground truncate">{stats.topShow[0]}</p>
          </div>
        </div>
      )}

      {stats.topMember && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 backdrop-blur border border-border">
          <div className="p-2 rounded-lg bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Member Terbanyak</p>
            <p className="text-sm font-bold text-foreground truncate">{stats.topMember[0]}</p>
          </div>
        </div>
      )}
    </div>
  );
}
