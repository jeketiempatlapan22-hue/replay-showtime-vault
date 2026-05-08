import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Copy, Ban, RotateCcw } from 'lucide-react';

type Token = {
  id: string;
  token: string;
  label: string;
  max_devices: number;
  revoked: boolean;
  created_at: string;
  devices_used: number;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  replayId: string;
  replayTitle: string;
}

export default function ReplayPersonalTokensDialog({ open, onOpenChange, replayId, replayTitle }: Props) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [maxDevices, setMaxDevices] = useState(1);

  const load = async () => {
    setLoading(true);
    const { data: list } = await supabase
      .from('replay_personal_tokens')
      .select('id,token,label,max_devices,revoked,created_at')
      .eq('replay_id', replayId)
      .order('created_at', { ascending: false });
    const ids = (list ?? []).map(t => t.id);
    let counts = new Map<string, number>();
    if (ids.length) {
      const { data: devs } = await supabase
        .from('replay_token_devices')
        .select('token_id')
        .in('token_id', ids);
      (devs ?? []).forEach((d: any) => counts.set(d.token_id, (counts.get(d.token_id) || 0) + 1));
    }
    setTokens((list ?? []).map((t: any) => ({ ...t, devices_used: counts.get(t.id) || 0 })));
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open, replayId]);

  const create = async () => {
    const tokenStr = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 40);
    const { error } = await supabase.from('replay_personal_tokens').insert({
      replay_id: replayId, token: tokenStr, label: label.trim(), max_devices: Math.max(1, maxDevices),
    });
    if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
    setLabel(''); setMaxDevices(1);
    toast({ title: 'Token satuan dibuat' });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Hapus token ini?')) return;
    await supabase.from('replay_personal_tokens').delete().eq('id', id);
    load();
  };

  const toggleRevoke = async (t: Token) => {
    await supabase.from('replay_personal_tokens').update({ revoked: !t.revoked }).eq('id', t.id);
    load();
  };

  const resetDevices = async (id: string) => {
    if (!confirm('Reset daftar perangkat token ini?')) return;
    await supabase.from('replay_token_devices').delete().eq('token_id', id);
    load();
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/akses?token=${token}&replay=${replayId}`;
    try { await navigator.clipboard.writeText(url); toast({ title: 'Link tersalin' }); } catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Token Satuan (1 Device)</DialogTitle>
          <DialogDescription className="truncate">{replayTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border border-border rounded-lg p-3 bg-secondary/30">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Label (opsional)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Mis. nama pembeli" />
            </div>
            <div>
              <Label className="text-xs">Max device</Label>
              <Input type="number" min={1} value={maxDevices} onChange={e => setMaxDevices(parseInt(e.target.value) || 1)} />
            </div>
          </div>
          <Button onClick={create} className="w-full"><Plus className="w-4 h-4 mr-1" />Buat Token Satuan</Button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Memuat…</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Belum ada token satuan.</p>
          ) : tokens.map(t => (
            <div key={t.id} className="border border-border rounded-lg p-2 bg-card space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{t.label || '(tanpa label)'}</p>
                  <code className="text-[10px] text-muted-foreground break-all">{t.token.slice(0, 16)}…</code>
                </div>
                <Badge variant={t.revoked ? 'destructive' : 'secondary'} className="text-[10px]">
                  {t.devices_used}/{t.max_devices} {t.revoked ? '· DICABUT' : ''}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => copyLink(t.token)}>
                  <Copy className="w-3 h-3 mr-1" />Link
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => resetDevices(t.id)}>
                  <RotateCcw className="w-3 h-3 mr-1" />Reset device
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => toggleRevoke(t)}>
                  <Ban className="w-3 h-3 mr-1" />{t.revoked ? 'Aktifkan' : 'Cabut'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px] text-destructive" onClick={() => remove(t.id)}>
                  <Trash2 className="w-3 h-3 mr-1" />Hapus
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
