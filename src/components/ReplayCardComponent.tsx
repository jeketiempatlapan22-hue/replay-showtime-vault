import { useState } from 'react';
import { Lock, Unlock, Play, Calendar, Users, Tag } from 'lucide-react';
import { ReplayCard } from '@/lib/types';
import { verifyPassword } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  replay: ReplayCard;
  isUnlocked: boolean;
  onUnlock: (id: string) => void;
  onWatch: (replay: ReplayCard) => void;
}

export default function ReplayCardComponent({ replay, isUnlocked, onUnlock, onWatch }: Props) {
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmitPassword = () => {
    if (verifyPassword(replay.id, password)) {
      onUnlock(replay.id);
      setShowPasswordDialog(false);
      setPassword('');
      setError('');
    } else {
      setError('Sandi salah! Coba lagi.');
    }
  };

  const formattedDate = new Date(replay.date).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <>
      <div className="group relative rounded-xl overflow-hidden border border-border bg-card/80 backdrop-blur-sm hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10">
        {/* Image */}
        <div className="relative aspect-video overflow-hidden">
          {replay.imageUrl ? (
            <img src={replay.imageUrl} alt={replay.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full bg-secondary flex items-center justify-center">
              <Play className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          {!isUnlocked && (
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
              <Lock className="w-10 h-10 text-primary animate-pulse" />
            </div>
          )}
          {isUnlocked && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-green-600/90 text-white border-0">
                <Unlock className="w-3 h-3 mr-1" /> Terbuka
              </Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <h3 className="text-lg font-semibold text-foreground line-clamp-2 font-sans">{replay.title}</h3>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4 text-primary" />
            <span>{formattedDate}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Tag className="w-4 h-4 text-primary" />
            <span>{replay.criteria}</span>
          </div>

          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="flex flex-wrap gap-1">
              {replay.lineup.map((member, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{member}</Badge>
              ))}
            </div>
          </div>

          {/* Action */}
          {isUnlocked ? (
            <Button className="w-full mt-2" onClick={() => onWatch(replay)}>
              <Play className="w-4 h-4 mr-2" /> Tonton Sekarang
            </Button>
          ) : (
            <Button variant="outline" className="w-full mt-2 border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => setShowPasswordDialog(true)}>
              <Lock className="w-4 h-4 mr-2" /> Buka dengan Sandi
            </Button>
          )}
        </div>
      </div>

      {/* Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-sans">Masukkan Sandi</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Masukkan sandi satuan atau sandi master untuk membuka replay ini.</p>
            <Input
              type="password"
              placeholder="Masukkan sandi..."
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmitPassword()}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={handleSubmitPassword}>Buka Replay</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
