import { useState, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ThemedBackground, { type ThemeType } from '@/components/ThemedBackground';
import HamburgerMenu from '@/components/HamburgerMenu';
import ReplayCardComponent from '@/components/ReplayCardComponent';
import YouTubePlayer from '@/components/YouTubePlayer';
import { getReplaysByMonth, getSettings } from '@/lib/store';
import { type ReplayRow } from '@/lib/store';

const MONTH_NAMES: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
};

export default function Index() {
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [watchingReplay, setWatchingReplay] = useState<ReplayRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allGrouped, setAllGrouped] = useState<Record<string, ReplayRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeType>('ramadhan');
  const [waNumber, setWaNumber] = useState('');
  const [waLink, setWaLink] = useState('');

  useEffect(() => {
    Promise.all([getReplaysByMonth(), getSettings()]).then(([data, settings]) => {
      setAllGrouped(data);
      setTheme((settings.theme as ThemeType) || 'ramadhan');
      setWaNumber(settings.whatsapp_number || '');
      setWaLink(settings.whatsapp_link || '');
      setLoading(false);
    });
  }, []);

  const grouped = useMemo(() => {
    if (!searchQuery.trim()) return allGrouped;
    const q = searchQuery.toLowerCase();
    const filtered: Record<string, ReplayRow[]> = {};
    for (const [month, replays] of Object.entries(allGrouped)) {
      const matched = replays.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.lineup.some(m => m.toLowerCase().includes(q)) ||
        r.criteria.toLowerCase().includes(q) ||
        (r.show_name && r.show_name.toLowerCase().includes(q)) ||
        (r.featured_member && r.featured_member.toLowerCase().includes(q))
      );
      if (matched.length > 0) filtered[month] = matched;
    }
    return filtered;
  }, [allGrouped, searchQuery]);

  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const handleUnlock = (id: string) => {
    setUnlockedIds(prev => new Set(prev).add(id));
  };

  if (watchingReplay) {
    return <YouTubePlayer replay={watchingReplay} onBack={() => setWatchingReplay(null)} />;
  }

  return (
    <div className="relative min-h-screen">
      <ThemedBackground theme={theme} />
      <HamburgerMenu whatsappNumber={waNumber} whatsappLink={waLink} />

      <div className="relative z-10">
        <header className="text-center py-10 md:py-16 px-4">
          <h1 className="text-4xl md:text-6xl font-bold text-primary drop-shadow-lg">
            ✦ ReplayTime ✦
          </h1>
          <p className="mt-3 text-muted-foreground text-lg md:text-xl">Koleksi Replay Show Terlengkap</p>
          <div className="mt-6 max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari judul atau nama member..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 bg-card/60 backdrop-blur border-border"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 pb-20">
          {loading && (
            <div className="text-center py-20">
              <p className="text-muted-foreground text-lg">Memuat replay...</p>
            </div>
          )}

          {!loading && sortedMonths.length === 0 && (
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
