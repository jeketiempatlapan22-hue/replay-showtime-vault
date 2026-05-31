import { useEffect, useState } from 'react';
import { Plus, Trash2, Radio, Film, Save, Loader2, KeyRound, ArrowRightLeft, Send } from 'lucide-react';
import ShowLiveTokensDialog from './ShowLiveTokensDialog';
import ShowOrdersResendDialog from './ShowOrdersResendDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import YouTubeIdInput from '@/components/admin/YouTubeIdInput';
import { parseYouTubeId } from '@/lib/youtube';

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
  const [resendOpen, setResendOpen] = useState(false);

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
  const [idnShowId, setIdnShowId] = useState('');
  const [groupLink, setGroupLink] = useState('');
  const [replayInfo, setReplayInfo] = useState('');

  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<SrcType>('m3u8');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    if (!showId) return;
    setLoading(true);
    (supabase as any).rpc('admin_get_active_show', { _id: showId }).then(({ data }: any) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setIsLive(!!row.is_live);
        setAutoSchedule(!!row.live_auto_schedule);
        setLiveUrl(row.live_url || '');
        setLiveType(((row.live_type as SrcType) || 'm3u8'));
        setLiveSources(Array.isArray(row.live_sources) ? row.live_sources as any : []);
        setLivePassword(row.live_password || '');
        setRequirePw(row.live_require_password !== false);
        setReplayMode(!!row.replay_mode);
        setReplayM3u8(row.replay_m3u8_url || '');
        setReplayYt(row.replay_youtube_url || '');
        setIdnShowId((row as any).idn_show_id || '');
        setGroupLink((row as any).group_link || '');
        setReplayInfo((row as any).replay_info || '');
      }
      setLoading(false);
    });
  }, [showId]);

  const addSource = () => {
    if (!newLabel.trim() || !newUrl.trim()) return;
    if (newType === 'youtube' && !parseYouTubeId(newUrl)) {
      toast({ title: 'YouTube tidak valid', description: 'Format YouTube tidak dikenali. Periksa link/ID.', variant: 'destructive' });
      return;
    }
    const url = newType === 'youtube' ? (parseYouTubeId(newUrl) || '') : newUrl.trim();
    setLiveSources(prev => [...prev, { label: newLabel.trim().slice(0, 80), type: newType, url }]);
    setNewLabel(''); setNewUrl(''); setNewType('m3u8');
  };

  const removeSource = (i: number) => setLiveSources(prev => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    // Normalisasi YouTube ke ID 11 karakter & validasi
    let normalizedLiveUrl = liveUrl.trim();
    if (liveType === 'youtube' && normalizedLiveUrl) {
      const id = parseYouTubeId(normalizedLiveUrl);
      if (!id) {
        toast({ title: 'YouTube tidak valid', description: 'Live URL Utama: format YouTube tidak dikenali.', variant: 'destructive' });
        return;
      }
      normalizedLiveUrl = id;
    }
    let normalizedReplayYt = replayYt.trim();
    if (normalizedReplayYt) {
      const id = parseYouTubeId(normalizedReplayYt);
      if (!id) {
        toast({ title: 'YouTube tidak valid', description: 'Replay YouTube: format tidak dikenali.', variant: 'destructive' });
        return;
      }
      normalizedReplayYt = id;
    }
    const normalizedSources = liveSources.map(s => s.type === 'youtube'
      ? { ...s, url: parseYouTubeId(s.url) || s.url }
      : s);
    const invalidYt = liveSources.find(s => s.type === 'youtube' && s.url && !parseYouTubeId(s.url));
    if (invalidYt) {
      toast({ title: 'YouTube tidak valid', description: `Sumber "${invalidYt.label}" memiliki YouTube tidak dikenali.`, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Pastikan hanya satu show yang is_live = true
      if (isLive) {
        await supabase.from('active_shows').update({ is_live: false }).neq('id', showId).eq('is_live', true);
      }
      const { error } = await supabase.from('active_shows').update({
        is_live: isLive,
        live_auto_schedule: autoSchedule,
        live_url: normalizedLiveUrl,
        live_type: liveType,
        live_sources: normalizedSources,
        live_password: livePassword,
        live_require_password: requirePw,
        replay_mode: replayMode,
        replay_m3u8_url: replayM3u8.trim(),
        replay_youtube_url: normalizedReplayYt,
        idn_show_id: idnShowId.trim(),
        group_link: groupLink.trim(),
        replay_info: replayInfo.trim(),
      } as any).eq('id', showId);
      if (error) throw error;
      setLiveUrl(normalizedLiveUrl);
      setReplayYt(normalizedReplayYt);
      setLiveSources(normalizedSources);
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
          {liveType === 'youtube' ? (
            <YouTubeIdInput value={liveUrl} onChange={setLiveUrl} placeholder="URL YouTube (live/watch/youtu.be) atau ID 11 karakter" />
          ) : (
            <Input value={liveUrl} onChange={e => setLiveUrl(e.target.value)} placeholder={liveType === 'cloudflare' ? 'Cloudflare UID atau URL' : 'https://...m3u8'} />
          )}
        </div>
      </div>

      {/* IDN Show ID */}
      <div>
        <Label className="text-xs flex items-center gap-1">📺 IDN Show ID (untuk Player IDN)</Label>
        <Input
          value={idnShowId}
          onChange={e => setIdnShowId(e.target.value)}
          placeholder="Show ID dari IDN (mis. 1234567). Kosongkan untuk menonaktifkan player IDN."
        />
        <p className="text-[11px] text-muted-foreground mt-1">Saat diisi, sumber "IDN" akan otomatis tampil di playlist player Live. Token stream diambil otomatis dari server.</p>
      </div>

      {/* Show Spesial: link grup & info replay */}
      <div className="p-3 rounded bg-card border border-border space-y-2">
        <Label className="text-xs flex items-center gap-1">👥 Link Grup (Show Spesial)</Label>
        <Input
          value={groupLink}
          onChange={e => setGroupLink(e.target.value)}
          placeholder="https://chat.whatsapp.com/... (opsional). Otomatis dikirim ke WA pembeli show."
        />
        <Label className="text-xs flex items-center gap-1 pt-1">🎞️ Info Replay (Show Spesial)</Label>
        <textarea
          value={replayInfo}
          onChange={e => setReplayInfo(e.target.value)}
          rows={2}
          placeholder="Info replay yang dikirim ke pembeli (mis. 'Replay tersedia 7 hari setelah show')."
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">Dikirim otomatis di pesan WhatsApp saat user membeli show (QRIS / koin).</p>
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
          {newType === 'youtube' ? (
            <YouTubeIdInput value={newUrl} onChange={setNewUrl} placeholder="URL YouTube atau ID 11 karakter" />
          ) : (
            <Input placeholder={newType === 'cloudflare' ? 'Cloudflare UID atau URL' : 'https://...m3u8'} value={newUrl} onChange={e => setNewUrl(e.target.value)} />
          )}
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
          <YouTubeIdInput value={replayYt} onChange={setReplayYt} placeholder="URL YouTube (live/watch/youtu.be) atau ID 11 karakter" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Simpan Pengaturan Live & Replay
        </Button>
        <Button type="button" variant="outline" onClick={() => setTokensOpen(true)} className="w-full sm:w-auto">
          <KeyRound className="w-4 h-4 mr-2" />Token & Riwayat Akses
        </Button>
        <Button type="button" variant="outline" onClick={() => setResendOpen(true)} className="w-full sm:w-auto">
          <Send className="w-4 h-4 mr-2" />Resend WA Pembelian
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={async () => {
            if (!confirm('Konversi show ini menjadi Replay?\n\nKartu akan PINDAH dari menu Streaming Show ke halaman Replay (show aktif akan dinonaktifkan). Pastikan link replay sudah diisi.')) return;
            setSaving(true);
            try {
              const { data, error } = await (supabase as any).rpc('convert_show_to_replay', { _show_id: showId });
              if (error) throw error;
              toast({ title: 'Berhasil dikonversi ke Replay', description: `Replay ID: ${data}` });
              setTimeout(() => window.location.reload(), 800);
            } catch (e: any) {
              toast({ title: 'Gagal konversi', description: e.message, variant: 'destructive' });
            }
            setSaving(false);
          }}
        >
          <ArrowRightLeft className="w-4 h-4 mr-2" />Konversi ke Replay
        </Button>
      </div>
      <ShowLiveTokensDialog open={tokensOpen} onOpenChange={setTokensOpen} showId={showId} showTitle={showTitle} />
    </div>
  );
}
