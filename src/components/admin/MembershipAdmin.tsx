import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Copy, RefreshCw, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MembershipToken {
  id: string;
  token: string;
  password: string;
  label: string;
  phone: string;
  duration_days: number;
  starts_at: string;
  expires_at: string;
  revoked: boolean;
  manual_resets_used: number;
  manual_resets_max: number;
  includes_replays: boolean;
  max_devices: number;
  created_at: string;
}

interface DeviceRow { id: string; token_id: string; browser_id: string; created_at: string; last_seen: string }

const randStr = (n = 10) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

export default function MembershipAdmin() {
  const [rows, setRows] = useState<MembershipToken[]>([]);
  const [devices, setDevices] = useState<Record<string, DeviceRow[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ label: '', phone: '', duration_days: 30, includes_replays: true, max_devices: 1 });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: tokens }, { data: devs }] = await Promise.all([
      supabase.from('membership_tokens').select('*').order('created_at', { ascending: false }),
      supabase.from('membership_token_devices').select('*'),
    ]);
    setRows((tokens as MembershipToken[]) || []);
    const map: Record<string, DeviceRow[]> = {};
    ((devs as DeviceRow[]) || []).forEach(d => {
      (map[d.token_id] ||= []).push(d);
    });
    setDevices(map);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    setCreating(true);
    const token = randStr(12);
    const password = randStr(8);
    const starts_at = new Date().toISOString();
    const expires_at = new Date(Date.now() + form.duration_days * 86400000).toISOString();
    const { error } = await supabase.from('membership_tokens').insert({
      token, password, label: form.label, phone: form.phone,
      duration_days: form.duration_days, starts_at, expires_at,
      includes_replays: form.includes_replays,
      max_devices: Math.max(1, Math.min(10000, Number(form.max_devices) || 1)),
    });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Membership token dibuat');
    setForm({ label: '', phone: '', duration_days: 30, includes_replays: true, max_devices: 1 });
    void load();
  };

  const toggleRevoke = async (r: MembershipToken) => {
    await supabase.from('membership_tokens').update({ revoked: !r.revoked }).eq('id', r.id);
    toast.success(r.revoked ? 'Membership diaktifkan' : 'Membership dicabut');
    void load();
  };
  const remove = async (id: string) => {
    if (!confirm('Hapus membership token ini? Tindakan tidak bisa dibatalkan.')) return;
    await supabase.from('membership_tokens').delete().eq('id', id);
    toast.success('Membership dihapus');
    void load();
  };
  const resetDevices = async (id: string) => {
    await supabase.from('membership_token_devices').delete().eq('token_id', id);
    toast.success('Perangkat tertaut direset');
    void load();
  };
  const revokeOneDevice = async (deviceId: string) => {
    await supabase.from('membership_token_devices').delete().eq('id', deviceId);
    toast.success('Perangkat dicabut');
    void load();
  };
  const resetQuota = async (id: string) => {
    await supabase.from('membership_tokens').update({ manual_resets_used: 0, updated_at: new Date().toISOString() }).eq('id', id);
    toast.success('Kuota reset perangkat dikembalikan ke 0');
    void load();
  };
  const editMaxDevices = async (r: MembershipToken) => {
    const v = prompt('Atur Max Device baru', String(r.max_devices ?? 1));
    if (v == null) return;
    const n = Math.max(1, Math.min(10000, Number(v) || 1));
    await supabase.from('membership_tokens').update({ max_devices: n, updated_at: new Date().toISOString() }).eq('id', r.id);
    toast.success(`Max device diubah ke ${n}`);
    void load();
  };
  const copyLink = (r: MembershipToken) => {
    const link = `${window.location.origin}/live?mtoken=${encodeURIComponent(r.token)}&mp=${encodeURIComponent(r.password)}`;
    navigator.clipboard.writeText(link);
    toast.success('Link disalin');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Buat Membership Token</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">Label</Label><Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="cth: Member Premium A" /></div>
          <div><Label className="text-xs">Nomor WA</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="62xxx" /></div>
          <div><Label className="text-xs">Durasi (hari)</Label><Input type="number" value={form.duration_days} onChange={e => setForm({ ...form, duration_days: Number(e.target.value) || 30 })} /></div>
          <div><Label className="text-xs">Max Device</Label><Input type="number" min={1} value={form.max_devices} onChange={e => setForm({ ...form, max_devices: Number(e.target.value) || 1 })} placeholder="cth: 300" /></div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.includes_replays} onChange={e => setForm({ ...form, includes_replays: e.target.checked })} /> Termasuk replay</label>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={create} disabled={creating} className="w-full sm:w-auto">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Buat Token</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Daftar Membership</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Belum ada membership.</p>
          ) : (
            <div className="space-y-2">
              {rows.map(r => {
                const expired = r.expires_at && new Date(r.expires_at).getTime() < Date.now();
                const tokenDevices = devices[r.id] || [];
                const isOpen = !!expanded[r.id];
                return (
                  <div key={r.id} className="border border-border rounded-lg p-3 text-sm space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-medium">
                        {r.label || '(tanpa label)'} {expired && <span className="text-xs text-destructive">[expired]</span>} {r.revoked && <span className="text-xs text-destructive">[revoked]</span>}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => copyLink(r)} title="Salin link"><Copy className="w-3.5 h-3.5 mr-1" />Link</Button>
                        <Button size="sm" variant="outline" onClick={() => resetDevices(r.id)} title="Cabut semua perangkat tertaut"><RefreshCw className="w-3.5 h-3.5 mr-1" />Reset Device</Button>
                        <Button size="sm" variant="outline" onClick={() => resetQuota(r.id)} title="Reset kuota reset manual ke 0"><RotateCcw className="w-3.5 h-3.5 mr-1" />Reset Kuota</Button>
                        <Button size="sm" variant={r.revoked ? 'default' : 'secondary'} onClick={() => toggleRevoke(r)}>{r.revoked ? 'Aktifkan' : 'Cabut'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(r.id)} title="Hapus"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono break-all">Token: {r.token} · Sandi: {r.password}</div>
                    <div className="text-xs text-muted-foreground">
                      WA: {r.phone || '-'} · Kuota reset: <span className="font-mono">{r.manual_resets_used}/{r.manual_resets_max}</span> · Aktif s/d {new Date(r.expires_at).toLocaleString()}
                      {r.includes_replays ? ' · termasuk replay' : ' · live saja'}
                    </div>
                    <button
                      type="button"
                      className="text-xs text-primary inline-flex items-center gap-1"
                      onClick={() => setExpanded(prev => ({ ...prev, [r.id]: !prev[r.id] }))}
                    >
                      {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      Perangkat tertaut ({tokenDevices.length}/1)
                    </button>
                    {isOpen && (
                      <div className="rounded border border-border bg-muted/30 p-2 space-y-1">
                        {tokenDevices.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">Belum ada perangkat terikat.</p>
                        ) : tokenDevices.map(d => (
                          <div key={d.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="font-mono truncate">
                              {d.browser_id.slice(0, 12)}…{d.browser_id.slice(-4)}
                              <span className="text-muted-foreground ml-2">last seen {new Date(d.last_seen).toLocaleString()}</span>
                            </div>
                            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => revokeOneDevice(d.id)}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
