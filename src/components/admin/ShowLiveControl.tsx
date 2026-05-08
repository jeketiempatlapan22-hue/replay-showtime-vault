import { useEffect, useState } from 'react';
import { Plus, Trash2, Radio, Film, Save, Loader2, KeyRound } from 'lucide-react';
import ShowLiveTokensDialog from './ShowLiveTokensDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type SrcType = 'm3u8' | 'youtube' | 'cloudflare';
interface LiveSource { label: string; type: SrcType; url: string }

interface Props {
  showId: string;
  showTitle: string;
}

export default function ShowLiveControl({ showId, showTitle }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);

  const [isLive, setIsLive] = useState(false);
  const [autoSchedule, setAutoSchedule] = useState(false);
  const [liveUrl, setLiveUrl] = useState('');
  const [liveType, setLiveType] = useState<SrcType>('m3u8');
  const [liveSources, setLiveSources] = useState<LiveSource[]>([]);
  const [livePassword, setLivePassword] = useState('');
  const [requirePw, setRequirePw] = useState(true);

  const [replayMode, setReplayMode] = useState(false);
  const [replayM3u8, setReplayM3u8] = useState('');
  const [replayYt, setReplayYt] = useState('');

  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<SrcType>('m3u8');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    if (!showId) return;
    setLoading(true);
    supabase.from('active_shows').select(
      'is_live,live_auto_schedule,live_url,live_type,live_sources,live_password,live_require_password,replay_mode,replay_m3u8_url,replay_youtube_url'
    ).eq('id', showId).maybeSingle().then(({ data }) => {
      if (data) {
        setIsLive(!!data.is_live);
        setAutoSchedule(!!data.live_auto_schedule);
        setLiveUrl(data.live_url || '');
        setLiveType(((data.live_type as SrcType) || 'm3u8'));
        setLiveSources(Array.isArray(data.live_sources) ? data.live_sources as any : []);
        setLivePassword(data.live_password || '');
        setRequirePw(data.live_require_password !== false);
        setReplayMode(!!data.replay_mode);
        setReplayM3u8(data.replay_m3u8_url || '');
        setReplayYt(data.replay_youtube_url || '');
      }
      setLoading(false);
    });
  }, [showId]);

  const addSource = () => {
    if (!newLabel.trim() || !newUrl.trim()) return;
    setLiveSources(prev => [...prev, { label: newLabel.trim().slice(0, 80), type: newType, url: newUrl.trim() }]);
    setNewLabel(''); setNewUrl(''); setNewType('m3u8');
  };

  const removeSource = (i: number) => setLiveSources(prev => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      // Pastikan hanya satu show yang is_live = true
      if (isLive) {
        await supabase.from('active_shows').update({ is_live: false }).neq('id', showId).eq('is_live', true);
      }
      const { error } = await supabase.from('active_shows').update({
        is_live: isLive,
        live_auto_schedule: autoSchedule,
        live_url: liveUrl.trim(),
        live_type: liveType,
        live_sources: liveSources,
        live_password: livePassword,
        live_require_password: requirePw,
        replay_mode: replayMode,
        replay_m3u8_url: replayM3u8.trim(),
        replay_youtube_url: replayYt.trim(),
      } as any).eq('id', showId);
      if (error) throw error;
      toast({ title: 'Pengaturan Live & Replay tersimpan' });
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  if (loading) return <div className="py-4 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Memuat…</div>;

  return (
    <div className="space-y-4 p-4 rounded-lg border border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Live & Replay — {showTitle || 'Show'}</h3>
      </div>

      {/* Live toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center justify-between p-3 rounded bg-card border border-border">
          <div>
            <Label className="text-sm">Sedang LIVE sekarang</Label>
            <p className="text-[11px] text-muted-foreground">Hanya satu show dapat aktif sekaligus.</p>
          </div>
          <Switch checked={isLive} onCheckedChange={setIsLive} />
        </div>
        <div className="flex items-center justify-between p-3 rounded bg-card border border-border">
          <div>
            <Label className="text-sm">Live Otomatis Sesuai Jadwal</Label>
            <p className="text-[11px] text-muted-foreground">Aktif otomatis pada jam show selama 8 jam.</p>
          </div>
          <Switch checked={autoSchedule} onCheckedChange={setAutoSchedule} />
        </div>
      </div>

      {/* Live URL */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-1">
          <Label className="text-xs">Tipe Player Utama</Label>
          <select value={liveType} onChange={e => setLiveType(e.target.value as SrcType)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="m3u8">M3U8 / HLS</option>
            <option value="youtube">YouTube</option>
            <option value="cloudflare">Cloudflare</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Live URL Utama</Label>
          <Input value={liveUrl} onChange={e => setLiveUrl(e.target.value)} placeholder="https://...m3u8 atau ID YouTube" />
        </div>
      </div>

      {/* Sumber video */}
      <div className="space-y-2">
        <Label className="text-xs flex items-center gap-1">📋 Sumber Video Tambahan</Label>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_2fr_auto] gap-2">
          <Input placeholder="Label (e.g. Server 1)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          <select value={newType} onChange={e => setNewType(e.target.value as SrcType)}
            className="flex h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="m3u8">M3U8</option>
            <option value="youtube">YouTube</option>
            <option value="cloudflare">Cloudflare</option>
          </select>
          <Input placeholder="URL atau ID video" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
          <Button type="button" onClick={addSource} size="sm"><Plus className="w-4 h-4 mr-1" />Tambah</Button>
        </div>
        {liveSources.length > 0 && (
          <div className="space-y-1.5">
            {liveSources.map((s, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded bg-card border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.label}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px] uppercase">{s.type}</Badge>
                    <span className="truncate">{s.url}</span>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeSource(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sandi */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
        <div className="sm:col-span-2">
          <Label className="text-xs">🔐 Sandi Akses LIVE</Label>
          <Input value={livePassword} onChange={e => setLivePassword(e.target.value)} placeholder="Sandi yang akan dibagi ke pembeli" />
        </div>
        <div className="flex items-center justify-between p-2 rounded bg-card border border-border h-10">
          <Label className="text-xs">Wajib sandi</Label>
          <Switch checked={requirePw} onCheckedChange={setRequirePw} />
        </div>
      </div>

      {/* Replay mode */}
      <div className="pt-3 border-t border-border/40 space-y-3">
        <div className="flex items-center justify-between p-3 rounded bg-card border border-border">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            <div>
              <Label className="text-sm">Mode Replay</Label>
              <p className="text-[11px] text-muted-foreground">Saat ON, kartu memutar replay langsung dari URL di bawah.</p>
            </div>
          </div>
          <Switch checked={replayMode} onCheckedChange={setReplayMode} />
        </div>
        <div>
          <Label className="text-xs">Link M3U8 (HLS)</Label>
          <Input value={replayM3u8} onChange={e => setReplayM3u8(e.target.value)} placeholder="https://...replay.m3u8" />
        </div>
        <div>
          <Label className="text-xs">Link YouTube (URL atau ID)</Label>
          <Input value={replayYt} onChange={e => setReplayYt(e.target.value)} placeholder="https://youtu.be/... atau ID 11 karakter" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Simpan Pengaturan Live & Replay
        </Button>
        <Button type="button" variant="outline" onClick={() => setTokensOpen(true)} className="w-full sm:w-auto">
          <KeyRound className="w-4 h-4 mr-2" />Token & Riwayat Akses
        </Button>
      </div>
      <ShowLiveTokensDialog open={tokensOpen} onOpenChange={setTokensOpen} showId={showId} showTitle={showTitle} />
    </div>
  );
}
