import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Copy, Radio } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/backend';
import { toast } from 'sonner';

type Win = { id: string; round_title: string; kind: string; prize: any; created_at: string };

// Riwayat hadiah show/bundel dari game. Tetap tersimpan walau soal/game dihapus admin.
export default function GameWinsHistory({ userId }: { userId: string }) {
  const [wins, setWins] = useState<Win[]>([]);
  useEffect(() => {
    (supabase as any).from('game_wins').select('id,round_title,kind,prize,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50)
      .then(({ data }: any) => setWins(data || []));
  }, [userId]);
  if (!wins.length) return null;
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success('Disalin'); } catch { /* ignore */ } };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Trophy className="w-4 h-4 text-primary" /> Hadiah Game Saya</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {wins.map((w) => {
          const p = w.prize || {};
          const to = w.kind === 'show' ? `/live?show=${p.show_id}&t=${p.token}` : `/shows?bt=${p.token}`;
          const info = [`🎁 ${w.kind === 'show' ? 'Show' : 'Bundel'}: ${p.title}`, `🔗 Link: ${p.link}`, p.password ? `🗝️ Sandi: ${p.password}` : ''].filter(Boolean).join('\n');
          return (
            <div key={w.id} className="rounded-lg border border-border p-3 space-y-1">
              <p className="font-medium text-sm">{w.kind === 'show' ? 'Show Gratis' : 'Bundel Show'}: {p.title}</p>
              <p className="text-xs text-muted-foreground">Dari game "{w.round_title}" • {new Date(w.created_at).toLocaleDateString('id-ID')}</p>
              {p.password && <p className="text-sm">Sandi: <b>{p.password}</b></p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild size="sm"><Link to={to}><Radio className="w-4 h-4 mr-1" />Tonton</Link></Button>
                <Button size="sm" variant="outline" onClick={() => copy(info)}><Copy className="w-4 h-4 mr-1" />Salin</Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
