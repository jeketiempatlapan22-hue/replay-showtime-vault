import { useState } from 'react';
import { Lock, Unlock, Play, Calendar, Users, Tag, Star, Tv, Bookmark, BookmarkCheck } from 'lucide-react';
import { type ReplayRow, verifyPassword } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const CRITERIA_LABELS: Record<string, string> = {
  reguler: 'Reguler', sts: 'STS', last_show: 'Last Show', aniv: 'Anniversary', special: 'Show Spesial',
};

interface Props {
  replay: ReplayRow;
  isUnlocked: boolean;
  onUnlock: (id: string) => void;
  onWatch: (replay: ReplayRow) => void;
  onUnlockAndWatch?: (replay: ReplayRow) => void;
  index?: number;
  isBookmarked?: boolean;
  onToggleBookmark?: (id: string) => void;
  searchQuery?: string;
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-primary/30 text-foreground rounded px-0.5">{part}</mark> : part
  );
}

export default function ReplayCardComponent({ replay, isUnlocked, onUnlock, onWatch, onUnlockAndWatch, index = 0, isBookmarked, onToggleBookmark, searchQuery = '' }: Props) {
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmitPassword = async () => {
    if (checking) return;

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setError('Sandi wajib diisi.');
      return;
    }

    setChecking(true);
    const valid = await verifyPassword(replay.id, trimmedPassword);
    setChecking(false);
    if (valid) {
      setShowPasswordDialog(false);
      setPassword('');
      setError('');
      // Atomically unlock AND open player to prevent Chrome race condition
      if (onUnlockAndWatch) {
        onUnlockAndWatch(replay);
      } else {
        onUnlock(replay.id);
      }
    } else {
      setError('Sandi salah! Coba lagi.');
    }
  };

  const formattedDate = new Date(replay.date).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const criteriaLabel = CRITERIA_LABELS[replay.criteria] || replay.criteria;
  const thumbnailUrl = `https://img.youtube.com/vi/${replay.youtube_id}/mqdefault.jpg`;

  return (
    <div>
      <div
        className="group relative rounded-xl overflow-hidden border border-border bg-card/80 backdrop-blur-sm hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 animate-fade-up opacity-0"
        style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'forwards' }}
      >
        <div className="relative aspect-video overflow-hidden">
          {replay.image_url ? (
            <>
              <img src={replay.image_url} alt={replay.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <img src={thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </>
          ) : (
            <div className="w-full h-full bg-secondary flex items-center justify-center">
              <img src={thumbnailUrl} alt={replay.title} className="w-full h-full object-cover" />
            </div>
          )}
          {!isUnlocked && (
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
              <Lock className="w-10 h-10 text-primary animate-pulse" />
            </div>
          )}
          {isUnlocked && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-green-600/90 text-foreground border-0">
                <Unlock className="w-3 h-3 mr-1" /> Terbuka
              </Badge>
            </div>
          )}
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="text-xs">{criteriaLabel}</Badge>
          </div>
          {onToggleBookmark && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleBookmark(replay.id); }}
              className={`absolute bottom-2 right-2 p-1.5 rounded-full transition-all duration-200 ${isBookmarked ? 'bg-primary text-primary-foreground' : 'bg-background/60 backdrop-blur text-muted-foreground hover:text-primary'}`}
            >
              {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="p-4 space-y-3">
          <h3 className="text-lg font-semibold text-foreground line-clamp-2 font-sans">{highlightText(replay.title, searchQuery)}</h3>

          {replay.show_name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Tv className="w-4 h-4 text-primary" />
              <span>{highlightText(replay.show_name, searchQuery)}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4 text-primary" />
            <span>{formattedDate}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Tag className="w-4 h-4 text-primary" />
            <span>{criteriaLabel}</span>
          </div>

          {replay.featured_member && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Star className="w-4 h-4 text-primary" />
              <span className="font-medium">{highlightText(replay.featured_member, searchQuery)}</span>
            </div>
          )}

          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="flex flex-wrap gap-1">
              {replay.lineup.map((member, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{highlightText(member, searchQuery)}</Badge>
              ))}
            </div>
          </div>

          {isUnlocked ? (
            <Button type="button" className="w-full mt-2" onClick={() => onWatch(replay)}>
              <Play className="w-4 h-4 mr-2" /> Tonton Sekarang
            </Button>
          ) : (
            <Button type="button" variant="outline" className="w-full mt-2 border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => setShowPasswordDialog(true)}>
              <Lock className="w-4 h-4 mr-2" /> Buka dengan Sandi
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-sans">Masukkan Sandi</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Masukkan sandi satuan atau sandi master untuk membuka replay ini.</p>
            <Input type="password" placeholder="Masukkan sandi..." value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmitPassword()} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="button" className="w-full" onClick={handleSubmitPassword} disabled={checking}>
              {checking ? 'Memeriksa...' : 'Buka Replay'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
