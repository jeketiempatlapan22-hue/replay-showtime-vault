import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, X, SlidersHorizontal, ArrowUpDown, Bookmark, ArrowUp, Film } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ThemedBackground, { type ThemeType } from '@/components/ThemedBackground';
import HamburgerMenu from '@/components/HamburgerMenu';
import ReplayCardComponent from '@/components/ReplayCardComponent';
import ReplayCardSkeleton from '@/components/ReplayCardSkeleton';
import StatsBar from '@/components/StatsBar';
import YouTubePlayer from '@/components/YouTubePlayer';
import { getReplaysByMonth, getReplays, getSettings } from '@/lib/store';
import { type ReplayRow } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const MONTH_NAMES: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
};

const CRITERIA_FILTERS = [
  { value: '', label: 'Semua' },
  { value: 'reguler', label: 'Reguler' },
  { value: 'sts', label: 'STS' },
  { value: 'last_show', label: 'Last Show' },
  { value: 'aniv', label: 'Anniversary' },
  { value: 'special', label: 'Spesial' },
];

type SortMode = 'newest' | 'oldest' | 'title';

export default function Index() {
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [watchingReplay, setWatchingReplay] = useState<ReplayRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allGrouped, setAllGrouped] = useState<Record<string, ReplayRow[]>>({});
  const [allReplays, setAllReplays] = useState<ReplayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeType>('ramadhan');
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('replaytime-mode') === 'light');
  const [waNumber, setWaNumber] = useState('');
  const [waLink, setWaLink] = useState('');

  // Filters & sorting
  const [criteriaFilter, setCriteriaFilter] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('replaytime-bookmarks');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const prevReplayCountRef = useRef(0);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('replaytime-bookmarks', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const refreshReplays = useCallback(async () => {
    const [grouped, replays] = await Promise.all([getReplaysByMonth(), getReplays()]);
    setAllGrouped(grouped);

    // Realtime notification for new replays
    if (prevReplayCountRef.current > 0 && replays.length > prevReplayCountRef.current) {
      const newCount = replays.length - prevReplayCountRef.current;
      toast({
        title: '🎬 Replay Baru!',
        description: `${newCount} replay baru telah ditambahkan.`,
      });
    }
    prevReplayCountRef.current = replays.length;
    setAllReplays(replays);
  }, []);

  useEffect(() => {
    Promise.all([getReplaysByMonth(), getReplays(), getSettings()]).then(([data, replays, settings]) => {
      setAllGrouped(data);
      setAllReplays(replays);
      prevReplayCountRef.current = replays.length;
      setTheme((settings.theme as ThemeType) || 'ramadhan');
      setWaNumber(settings.whatsapp_number || '');
      setWaLink(settings.whatsapp_link || '');
      setLoading(false);
    });

    const replayChannel = supabase
      .channel('replays-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replays' }, () => {
        refreshReplays();
      })
      .subscribe();

    // Realtime theme sync
    const settingsChannel = supabase
      .channel('settings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, (payload) => {
        const row = payload.new as { key: string; value: string };
        if (row.key === 'theme') setTheme(row.value as ThemeType);
        if (row.key === 'whatsapp_number') setWaNumber(row.value);
        if (row.key === 'whatsapp_link') setWaLink(row.value);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(replayChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [refreshReplays]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', lightMode);
    localStorage.setItem('replaytime-mode', lightMode ? 'light' : 'dark');
  }, [lightMode]);

  // Scroll-to-top visibility
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const grouped = useMemo(() => {
    let result = { ...allGrouped };

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const filtered: Record<string, ReplayRow[]> = {};
      for (const [month, replays] of Object.entries(result)) {
        const matched = replays.filter(r =>
          r.title.toLowerCase().includes(q) ||
          r.lineup.some(m => m.toLowerCase().includes(q)) ||
          r.criteria.toLowerCase().includes(q) ||
          (r.show_name && r.show_name.toLowerCase().includes(q)) ||
          (r.featured_member && r.featured_member.toLowerCase().includes(q))
        );
        if (matched.length > 0) filtered[month] = matched;
      }
      result = filtered;
    }

    // Criteria filter
    if (criteriaFilter) {
      const filtered: Record<string, ReplayRow[]> = {};
      for (const [month, replays] of Object.entries(result)) {
        const matched = replays.filter(r => r.criteria === criteriaFilter);
        if (matched.length > 0) filtered[month] = matched;
      }
      result = filtered;
    }

    // Bookmarks only
    if (showBookmarksOnly) {
      const filtered: Record<string, ReplayRow[]> = {};
      for (const [month, replays] of Object.entries(result)) {
        const matched = replays.filter(r => bookmarks.has(r.id));
        if (matched.length > 0) filtered[month] = matched;
      }
      result = filtered;
    }

    // Sort within each month
    if (sortMode === 'oldest') {
      for (const key of Object.keys(result)) {
        result[key] = [...result[key]].sort((a, b) => a.date.localeCompare(b.date));
      }
    } else if (sortMode === 'title') {
      for (const key of Object.keys(result)) {
        result[key] = [...result[key]].sort((a, b) => a.title.localeCompare(b.title));
      }
    }

    return result;
  }, [allGrouped, searchQuery, criteriaFilter, sortMode, showBookmarksOnly, bookmarks]);

  const sortedMonths = Object.keys(grouped).sort((a, b) =>
    sortMode === 'oldest' ? a.localeCompare(b) : b.localeCompare(a)
  );

  const handleUnlock = (id: string) => {
    setUnlockedIds(prev => new Set(prev).add(id));
  };

  if (watchingReplay) {
    return <YouTubePlayer replay={watchingReplay} onBack={() => setWatchingReplay(null)} />;
  }

  return (
    <div className="relative min-h-screen transition-colors duration-500">
      <div className={`fixed inset-0 z-0 transition-opacity duration-700 ${lightMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <ThemedBackground theme={theme} />
      </div>
      <div className={`fixed inset-0 z-0 bg-background transition-opacity duration-700 ${lightMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
      <HamburgerMenu whatsappNumber={waNumber} whatsappLink={waLink} lightMode={lightMode} onToggleMode={() => setLightMode(v => !v)} />

      <div className="relative z-10">
        <header className="text-center py-10 md:py-16 px-4">
          <h1 className="text-4xl md:text-6xl font-bold text-primary drop-shadow-lg animate-fade-up" style={{ animationFillMode: 'forwards' }}>
            ✦ ReplayTime ✦
          </h1>
          <p className="mt-3 text-muted-foreground text-lg md:text-xl animate-fade-up opacity-0" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
            Koleksi Replay Show Terlengkap
          </p>

          {/* Search */}
          <div className="mt-6 max-w-md mx-auto relative animate-fade-up opacity-0" style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari judul, member, show..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 pr-20 bg-card/60 backdrop-blur border-border"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`p-1 rounded transition-colors ${showFilters ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filters bar */}
          {showFilters && (
            <div className="mt-4 max-w-2xl mx-auto animate-fade-up opacity-0 space-y-3" style={{ animationFillMode: 'forwards' }}>
              {/* Criteria pills */}
              <div className="flex flex-wrap justify-center gap-2">
                {CRITERIA_FILTERS.map(f => (
                  <button key={f.value}
                    onClick={() => setCriteriaFilter(f.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${
                      criteriaFilter === f.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card/60 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort + Bookmark row */}
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline" size="sm"
                  className={`text-xs gap-1.5 ${sortMode !== 'newest' ? 'border-primary text-primary' : ''}`}
                  onClick={() => setSortMode(m => m === 'newest' ? 'oldest' : m === 'oldest' ? 'title' : 'newest')}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {sortMode === 'newest' ? 'Terbaru' : sortMode === 'oldest' ? 'Terlama' : 'A-Z'}
                </Button>
                <Button
                  variant="outline" size="sm"
                  className={`text-xs gap-1.5 ${showBookmarksOnly ? 'border-primary text-primary bg-primary/10' : ''}`}
                  onClick={() => setShowBookmarksOnly(v => !v)}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Favorit {bookmarks.size > 0 && `(${bookmarks.size})`}
                </Button>
              </div>
            </div>
          )}
        </header>

        <main className="max-w-7xl mx-auto px-4 pb-20">
          {/* Stats */}
          {!loading && allReplays.length > 0 && <StatsBar replays={allReplays} />}

          {/* Skeleton loading */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <ReplayCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!loading && sortedMonths.length === 0 && (
            <div className="text-center py-20 animate-fade-up opacity-0" style={{ animationFillMode: 'forwards' }}>
              <p className="text-muted-foreground text-lg">
                {showBookmarksOnly ? 'Belum ada replay yang ditandai favorit.' : 'Belum ada replay yang cocok.'}
              </p>
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
                  {grouped[monthKey].map((replay, i) => (
                    <ReplayCardComponent
                      key={replay.id}
                      replay={replay}
                      isUnlocked={unlockedIds.has(replay.id)}
                      onUnlock={handleUnlock}
                      onWatch={setWatchingReplay}
                      index={i}
                      isBookmarked={bookmarks.has(replay.id)}
                      onToggleBookmark={toggleBookmark}
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
