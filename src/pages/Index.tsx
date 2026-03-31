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
  const [displayedReplay, setDisplayedReplay] = useState<ReplayRow | null>(null);
  const [playerVisible, setPlayerVisible] = useState(false);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const root = document.documentElement;
    root.classList.toggle('light', lightMode);
    // Remove old theme-light classes and add current
    root.className = root.className.replace(/\btheme-\S+/g, '');
    if (lightMode) {
      root.classList.add(`theme-${theme}`);
    }
    localStorage.setItem('replaytime-mode', lightMode ? 'light' : 'dark');
  }, [lightMode, theme]);

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

    // Sort within each month (default: newest first by date+time)
    const getDateTime = (r: ReplayRow) => `${r.date}T${(r as any).show_time || '19:00:00'}`;
    if (sortMode === 'oldest') {
      for (const key of Object.keys(result)) {
        result[key] = [...result[key]].sort((a, b) => getDateTime(a).localeCompare(getDateTime(b)));
      }
    } else if (sortMode === 'title') {
      for (const key of Object.keys(result)) {
        result[key] = [...result[key]].sort((a, b) => a.title.localeCompare(b.title));
      }
    } else {
      // newest first
      for (const key of Object.keys(result)) {
        result[key] = [...result[key]].sort((a, b) => getDateTime(b).localeCompare(getDateTime(a)));
      }
    }

    return result;
  }, [allGrouped, searchQuery, criteriaFilter, sortMode, showBookmarksOnly, bookmarks]);

  const sortedMonths = Object.keys(grouped).sort((a, b) =>
    sortMode === 'oldest' ? a.localeCompare(b) : b.localeCompare(a)
  );

  const handleUnlock = useCallback((id: string) => {
    setUnlockedIds(prev => new Set(prev).add(id));
  }, []);

  // Atomic unlock + open player (prevents Chrome race condition)
  const handleUnlockAndWatch = useCallback((replay: ReplayRow) => {
    setUnlockedIds(prev => new Set(prev).add(replay.id));
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    setDisplayedReplay(replay);
    setWatchingReplay(replay);
    requestAnimationFrame(() => setPlayerVisible(true));
  }, []);

  const handleOpenPlayer = useCallback((replay: ReplayRow) => {
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    setDisplayedReplay(replay);
    setWatchingReplay(replay);
    requestAnimationFrame(() => requestAnimationFrame(() => setPlayerVisible(true)));
  }, []);

  const handleClosePlayer = useCallback(() => {
    setPlayerVisible(false);
    setWatchingReplay(null);
    closingTimerRef.current = setTimeout(() => {
      setDisplayedReplay(null);
    }, 350);
  }, []);

  return (
    <div className="relative">
      {/* Player overlay - always stable in DOM, visibility via CSS only */}
      <div
        className={`fixed inset-0 z-[100] bg-background overflow-y-auto transition-all duration-300 ease-out ${
          playerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className={displayedReplay ? 'block' : 'hidden'}>
          {displayedReplay && (
            <YouTubePlayer replay={displayedReplay} onBack={handleClosePlayer} />
          )}
        </div>
      </div>

      {/* Main content - always in DOM */}
      <div className={`relative min-h-screen transition-colors duration-500 ${watchingReplay ? 'invisible' : 'visible'}`}>
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
            <div className="text-center py-20 animate-fade-up opacity-0 flex flex-col items-center gap-4" style={{ animationFillMode: 'forwards' }}>
              <div className="w-24 h-24 rounded-full bg-card/80 border border-border flex items-center justify-center">
                <Film className="w-12 h-12 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-foreground text-xl font-semibold font-sans mb-1">
                  {showBookmarksOnly ? 'Belum Ada Favorit' : searchQuery ? 'Tidak Ditemukan' : 'Belum Ada Replay'}
                </p>
                <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                  {showBookmarksOnly
                    ? 'Tandai replay favoritmu dengan ikon bookmark di setiap kartu.'
                    : searchQuery
                    ? `Tidak ada replay yang cocok dengan "${searchQuery}". Coba kata kunci lain.`
                    : 'Replay belum ditambahkan. Hubungi admin untuk informasi lebih lanjut.'}
                </p>
              </div>
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
                      onWatch={handleOpenPlayer}
                      onUnlockAndWatch={handleUnlockAndWatch}
                      index={i}
                      isBookmarked={bookmarks.has(replay.id)}
                      onToggleBookmark={toggleBookmark}
                      searchQuery={searchQuery}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </main>
      </div>

      {/* Scroll to top */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`fixed bottom-6 right-6 z-50 p-3 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 hover:scale-110 ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      >
        <ArrowUp className="w-5 h-5" />
      </button>
      </div>
    </div>
  );
}
