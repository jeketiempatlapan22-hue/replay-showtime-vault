import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Copy, Ban, RotateCcw, Smartphone } from 'lucide-react';

type Token = {
  id: string;
  token: string;
  label: string;
  kind: string;
  max_devices: number;
  revoked: boolean;
  created_at: string;
};
type Device = { id: string; token_id: string; browser_id: string; created_at: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  showId: string;
  showTitle: string;
}

export default function ShowLiveTokensDialog({ open, onOpenChange, showId, showTitle }: Props) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [devices, setDevices] = useState<Record<string, Device[]>>({});
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [maxDevices, setMaxDevices] = useState(1);
  const [kind, setKind] = useState<'personal' | 'public'>('personal');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: list } = await supabase
      .from('active_show_tokens')
      .select('id,token,label,kind,max_devices,revoked,created_at')
      .eq('show_id', showId)
      .order('created_at', { ascending: false });
    const ids = (list ?? []).map((t: any) => t.id);
    const grouped: Record<string, Device[]> = {};
    if (ids.length) {
      const { data: devs } = await supabase
        .from('active_show_token_devices')
        .select('id,token_id,browser_id,created_at')
        .in('token_id', ids)
        .order('created_at', { ascending: false });
      (devs ?? []).forEach((d: any) => {
        (grouped[d.token_id] ||= []).push(d);
      });
    }
    setTokens((list ?? []) as Token[]);
    setDevices(grouped);
    setLoading(false);
  };

  useEffect(() => { if (open && showId) load(); }, [open, showId]);

  const create = async () => {
    const tokenStr = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 40);
    const md = kind === 'public' ? Math.max(1, maxDevices) : 1;
    const { error } = await supabase.from('active_show_tokens').insert({
      show_id: showId, token: tokenStr, label: label.trim(), kind, max_devices: md,
    });
    if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
    setLabel(''); setMaxDevices(kind === 'public' ? 50 : 1);
    toast({ title: 'Token dibuat' });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Hapus token ini? Akses pengguna akan dicabut.')) return;
    await supabase.from('active_show_token_devices').delete().eq('token_id', id);
    await supabase.from('active_show_tokens').delete().eq('id', id);
    load();
  };

  const toggleRevoke = async (t: Token) => {
    await supabase.from('active_show_tokens').update({ revoked: !t.revoked }).eq('id', t.id);
    toast({ title: t.revoked ? 'Token diaktifkan kembali' : 'Token dicabut' });
    load();
  };

  const resetDevices = async (id: string) => {
    if (!confirm('Reset semua perangkat token ini? User harus buka link lagi.')) return;
    await supabase.from('active_show_token_devices').delete().eq('token_id', id);
    toast({ title: 'Perangkat direset' });
    load();
  };

  const removeDevice = async (deviceId: string) => {
    await supabase.from('active_show_token_devices').delete().eq('id', deviceId);
    load();
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/live?show=${showId}&t=${token}`;
    try { await navigator.clipboard.writeText(url); toast({ title: 'Link tersalin' }); } catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Token Akses Live</DialogTitle>
          <DialogDescription className="truncate">{showTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border border-border rounded-lg p-3 bg-secondary/30">
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant={kind === 'personal' ? 'default' : 'outline'} onClick={() => { setKind('personal'); setMaxDevices(1); }}>
              Satuan (1 device)
            </Button>
            <Button size="sm" variant={kind === 'public' ? 'default' : 'outline'} onClick={() => { setKind('public'); setMaxDevices(50); }}>
              Publik (multi)
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Label (opsional)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Mis. nama pembeli / kode promo" />
            </div>
            <div>
              <Label className="text-xs">Max device</Label>
              <Input type="number" min={1} value={maxDevices} disabled={kind === 'personal'}
                onChange={e => setMaxDevices(parseInt(e.target.value) || 1)} />
            </div>
          </div>
          <Button onClick={create} className="w-full"><Plus className="w-4 h-4 mr-1" />Buat Token</Button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Memuat…</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Belum ada token.</p>
          ) : tokens.map(t => {
            const devs = devices[t.id] || [];
            const isOpen = expanded === t.id;
            return (
              <div key={t.id} className="border border-border rounded-lg p-2 bg-card space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {t.label || '(tanpa label)'}
                      <span className="ml-1 text-[10px] text-muted-foreground uppercase">· {t.kind}</span>
                    </p>
                    <code className="text-[10px] text-muted-foreground break-all">{t.token.slice(0, 16)}…</code>
                    <p className="text-[10px] text-muted-foreground">Dibuat: {new Date(t.created_at).toLocaleString('id-ID')}</p>
                  </div>
                  <Badge variant={t.revoked ? 'destructive' : 'secondary'} className="text-[10px]">
                    {devs.length}/{t.max_devices}{t.revoked ? ' · DICABUT' : ''}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => copyLink(t.token)}>
                    <Copy className="w-3 h-3 mr-1" />Link
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setExpanded(isOpen ? null : t.id)}>
                    <Smartphone className="w-3 h-3 mr-1" />{isOpen ? 'Tutup' : `Device (${devs.length})`}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => resetDevices(t.id)}>
                    <RotateCcw className="w-3 h-3 mr-1" />Reset
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => toggleRevoke(t)}>
                    <Ban className="w-3 h-3 mr-1" />{t.revoked ? 'Aktifkan' : 'Cabut'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] text-destructive" onClick={() => remove(t.id)}>
                    <Trash2 className="w-3 h-3 mr-1" />Hapus
                  </Button>
                </div>
                {isOpen && (
                  <div className="border-t border-border pt-2 space-y-1">
                    {devs.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">Belum ada perangkat terhubung.</p>
                    ) : devs.map(d => (
                      <div key={d.id} className="flex items-center gap-2 text-[11px] bg-secondary/30 rounded p-1.5">
                        <Smartphone className="w-3 h-3 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <code className="break-all text-foreground">{d.browser_id.slice(0, 20)}…</code>
                          <p className="text-[10px] text-muted-foreground">{new Date(d.created_at).toLocaleString('id-ID')}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => removeDevice(d.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
