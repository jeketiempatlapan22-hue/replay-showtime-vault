import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, PowerOff, Power, VideoOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getReplaysAdmin, type ReplayRow } from '@/lib/store';

type Row = ReplayRow & { is_offline?: boolean; offline_reason?: string; offline_at?: string | null };

export default function ReplayOffAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Record<string, { type: string; value: string }>>({});

  const load = async () => {
    setLoading(true);
    try {
      const list = (await getReplaysAdmin()) as Row[];
      setRows(list);
    } catch (e) {
      toast({ title: 'Gagal memuat', description: String((e as Error).message || e), variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const offRows = useMemo(() => rows.filter((r) => r.is_offline), [rows]);
  const onRows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => !r.is_offline && (!t || `${r.title} ${r.show_name} ${r.date}`.toLowerCase().includes(t)));
  }, [rows, q]);

  const setOffline = async (r: Row, offline: boolean, reason = '') => {
    setBusy((s) => ({ ...s, [r.id]: true }));
    const { error } = await (supabase as any).rpc('admin_set_replay_offline', { _replay_id: r.id, _offline: offline, _reason: reason });
    setBusy((s) => ({ ...s, [r.id]: false }));
    if (error) return toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
    setRows((x) => x.map((y) => (y.id === r.id ? { ...y, is_offline: offline, offline_reason: offline ? reason : '' } : y)));
    toast({ title: offline ? 'Replay dinonaktifkan' : 'Replay diaktifkan kembali' });
  };

  const restore = async (r: Row) => {
    const f = form[r.id] || { type: 'youtube', value: '' };
    const value = f.value.trim();
    if (!value) return toast({ title: 'Isi sumber dulu', description: 'Masukkan ID/URL YouTube atau URL m3u8.', variant: 'destructive' });
    let ytId = '';
    let url = '';
    if (f.type === 'youtube') {
      const m = value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
      ytId = m ? m[1] : value;
    } else {
      url = value;
    }
    setBusy((s) => ({ ...s, [r.id]: true }));
    const { error } = await (supabase as any).rpc('admin_restore_replay_source', {
      _replay_id: r.id, _source_type: f.type, _youtube_id: ytId, _m3u8_url: url,
    });
    setBusy((s) => ({ ...s, [r.id]: false }));
    if (error) return toast({ title: 'Gagal aktifkan', description: error.message, variant: 'destructive' });
    setRows((x) => x.map((y) => (y.id === r.id ? { ...y, is_offline: false, offline_reason: '' } : y)));
    toast({ title: 'Replay aktif kembali', description: 'Sudah muncul lagi di daftar replay.' });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-sans text-base sm:text-lg flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><VideoOff className="w-5 h-5" />Replay Off ({offRows.length})</span>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Muat</Button>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Replay dengan sumber video bermasalah / kena banned tidak tampil di daftar replay user. Isi sumber baru lalu aktifkan kembali.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {offRows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Tidak ada replay yang off.</p>
          ) : offRows.map((r) => {
            const f = form[r.id] || { type: 'youtube', value: '' };
            return (
              <div key={r.id} className="border border-border rounded-lg p-3 space-y-2 bg-card/50">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{r.title}</div>
                    <div className="text-[11px] text-muted-foreground">{r.show_name} • {r.date}</div>
                  </div>
                  <Badge variant="destructive" className="text-[10px]">OFF</Badge>
                </div>
                {r.offline_reason && <div className="text-[11px] text-muted-foreground italic">Alasan: {r.offline_reason}</div>}
                <div className="grid gap-2 sm:grid-cols-[130px_1fr_auto]">
                  <select
                    value={f.type}
                    onChange={(e) => setForm((s) => ({ ...s, [r.id]: { ...f, type: e.target.value } }))}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="youtube">YouTube</option>
                    <option value="m3u8">M3U8</option>
                    <option value="cloudflare">Cloudflare</option>
                  </select>
                  <Input
                    value={f.value}
                    placeholder={f.type === 'youtube' ? 'ID atau link YouTube' : 'https://.../index.m3u8'}
                    onChange={(e) => setForm((s) => ({ ...s, [r.id]: { ...f, value: e.target.value } }))}
                  />
                  <Button onClick={() => restore(r)} disabled={!!busy[r.id]} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {busy[r.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                    <span className="ml-1">Aktifkan</span>
                  </Button>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setOffline(r, false)} disabled={!!busy[r.id]}>
                  Aktifkan tanpa ubah sumber
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-sans text-base sm:text-lg">Tandai Replay Bermasalah</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">Cari replay aktif</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Judul / show / tanggal" />
          <div className="max-h-[420px] overflow-y-auto space-y-2 pt-1">
            {onRows.slice(0, 60).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 border border-border rounded-md px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm truncate">{r.title}</div>
                  <div className="text-[11px] text-muted-foreground">{r.show_name} • {r.date}</div>
                </div>
                <Button
                  size="sm" variant="destructive" className="h-7 text-[11px] shrink-0"
                  disabled={!!busy[r.id]}
                  onClick={() => setOffline(r, true, prompt('Alasan replay off?', 'Sumber video tidak tersedia') || 'Sumber video tidak tersedia')}
                >
                  <PowerOff className="w-3 h-3 mr-1" />Off
                </Button>
              </div>
            ))}
            {onRows.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">Tidak ada hasil.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
