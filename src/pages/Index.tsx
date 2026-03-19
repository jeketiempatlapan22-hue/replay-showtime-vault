import { useState, useMemo } from 'react';
import { Settings, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import RamadhanBackground from '@/components/RamadhanBackground';
import ReplayCardComponent from '@/components/ReplayCardComponent';
import YouTubePlayer from '@/components/YouTubePlayer';
import { getReplaysByMonth, getMasterPassword, verifyPassword } from '@/lib/store';
import { ReplayCard } from '@/lib/types';
import { Button } from '@/components/ui/button';

const MONTH_NAMES: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
};

export default function Index() {
  const navigate = useNavigate();
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [watchingReplay, setWatchingReplay] = useState<ReplayCard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [, forceUpdate] = useState(0);

  const grouped = useMemo(() => {
    forceUpdate;
    const all = getReplaysByMonth();
    if (!searchQuery.trim()) return all;
    const q = searchQuery.toLowerCase();
    const filtered: Record<string, ReplayCard[]> = {};
    for (const [month, replays] of Object.entries(all)) {
      const matched = replays.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.lineup.some(m => m.toLowerCase().includes(q))
      );
      if (matched.length > 0) filtered[month] = matched;
    }
    return filtered;
  }, [forceUpdate, searchQuery]);

  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const handleUnlock = (id: string) => {
    setUnlockedIds(prev => new Set(prev).add(id));
  };

  if (watchingReplay) {
    return <YouTubePlayer replay={watchingReplay} onBack={() => setWatchingReplay(null)} />;
  }

  return (
    <div className="relative min-h-screen">
      <RamadhanBackground />

      <div className="relative z-10">
        {/* Header */}
        <header className="text-center py-10 md:py-16 px-4">
          <h1 className="text-4xl md:text-6xl font-bold text-primary drop-shadow-lg">
            ✦ ReplayTime ✦
          </h1>
          <p className="mt-3 text-muted-foreground text-lg md:text-xl">Koleksi Replay Show Terlengkap</p>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-muted-foreground hover:text-primary"
            onClick={() => navigate('/admin')}
          >
            <Settings className="w-5 h-5" />
          </Button>
        </header>

        {/* Content */}
        <main className="max-w-7xl mx-auto px-4 pb-20">
          {sortedMonths.length === 0 && (
            <div className="text-center py-20">
              <p className="text-muted-foreground text-lg">Belum ada replay. Tambahkan melalui Admin Panel.</p>
            </div>
          )}

          {sortedMonths.map(monthKey => {
            const [year, month] = monthKey.split('-');
            const monthName = MONTH_NAMES[month] || month;

            return (
              <section key={monthKey} className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                  <h2 className="text-2xl md:text-3xl font-bold text-primary whitespace-nowrap">
                    ☪ {monthName} {year}
                  </h2>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {grouped[monthKey].map(replay => (
                    <ReplayCardComponent
                      key={replay.id}
                      replay={replay}
                      isUnlocked={unlockedIds.has(replay.id)}
                      onUnlock={handleUnlock}
                      onWatch={setWatchingReplay}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </main>
      </div>
    </div>
  );
}
