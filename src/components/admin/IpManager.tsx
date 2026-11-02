import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/backend';
import { RefreshCw, Ban, Unlock, Trash2, Shield } from 'lucide-react';

interface BlockedIp {
  id: string;
  ip: string;
  reason: string;
  auto_blocked: boolean;
  is_active: boolean;
  blocked_at: string;
  unblocked_at: string | null;
}
interface IpVisit {
  id: string;
  ip: string;
  user_agent: string;
  path: string;
  endpoint: string;
  visit_count: number;
  last_seen_at: string;
}
interface Violation {
  id: string;
  ip: string;
  endpoint: string;
  violation_count: number;
  created_at: string;
}

export default function IpManager() {
  const [tab, setTab] = useState('blocked');
  const [blocked, setBlocked] = useState<BlockedIp[]>([]);
  const [visits, setVisits] = useState<IpVisit[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newReason, setNewReason] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const [b, v, r] = await Promise.all([
        supabase.rpc('admin_list_blocked_ips'),
        supabase.rpc('admin_list_ip_visits', { _limit: 300 }),
        supabase.rpc('admin_list_ip_violations', { _limit: 300 }),
      ]);
      if (b.data) setBlocked(b.data as any);
      if (v.data) setVisits(v.data as any);
      if (r.data) setViolations(r.data as any);
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const handleBlock = async (ip: string, reason: string) => {
    if (!ip) return;
    const { error } = await supabase.rpc('admin_block_ip', { _ip: ip, _reason: reason || 'manual' });
    if (error) { toast({ title: 'Gagal blokir', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'IP diblokir', description: ip });
    setNewIp(''); setNewReason(''); reload();
  };

  const handleUnblock = async (id: string) => {
    const { error } = await supabase.rpc('admin_unblock_ip', { _id: id });
    if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'IP dibuka' });
    reload();
  };

  const filteredVisits = visits.filter(v => !search || v.ip.includes(search) || v.endpoint.includes(search));
  const filteredBlocked = blocked.filter(b => !search || b.ip.includes(search));
  const filteredViolations = violations.filter(v => !search || v.ip.includes(search) || v.endpoint.includes(search));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 font-sans text-base sm:text-lg">
          <Shield className="w-4 h-4" /> Manajemen IP & Rate Limit
        </CardTitle>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input placeholder="Cari IP atau endpoint..." value={search} onChange={e => setSearch(e.target.value)} />

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 p-3 bg-secondary/40 rounded-lg">
          <div><Label className="text-xs">IP untuk diblokir</Label><Input placeholder="123.45.67.89" value={newIp} onChange={e => setNewIp(e.target.value)} /></div>
          <div><Label className="text-xs">Alasan</Label><Input placeholder="abuse / spam" value={newReason} onChange={e => setNewReason(e.target.value)} /></div>
          <div className="flex items-end"><Button onClick={() => handleBlock(newIp.trim(), newReason.trim())} disabled={!newIp.trim()} className="w-full sm:w-auto"><Ban className="w-4 h-4 mr-1" />Blokir</Button></div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="blocked">Diblokir ({blocked.filter(b => b.is_active).length})</TabsTrigger>
            <TabsTrigger value="visits">Kunjungan ({visits.length})</TabsTrigger>
            <TabsTrigger value="violations">Pelanggaran ({violations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="blocked" className="space-y-2">
            {filteredBlocked.length === 0 ? <p className="text-muted-foreground text-center py-6 text-sm">Belum ada IP diblokir.</p> : filteredBlocked.map(b => (
              <div key={b.id} className="flex items-center gap-2 p-2 rounded border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono">{b.ip}</code>
                    {b.is_active ? <Badge variant="destructive" className="text-[10px]">aktif</Badge> : <Badge variant="outline" className="text-[10px]">dibuka</Badge>}
                    {b.auto_blocked && <Badge variant="secondary" className="text-[10px]">auto</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{b.reason} · {new Date(b.blocked_at).toLocaleString('id-ID')}</p>
                </div>
                {b.is_active && (
                  <Button size="sm" variant="outline" onClick={() => handleUnblock(b.id)}><Unlock className="w-3.5 h-3.5 mr-1" />Buka</Button>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="visits" className="space-y-1">
            {filteredVisits.length === 0 ? <p className="text-muted-foreground text-center py-6 text-sm">Belum ada data.</p> : filteredVisits.slice(0, 200).map(v => (
              <div key={v.id} className="flex items-center gap-2 p-2 rounded border border-border bg-card text-xs">
                <code className="font-mono shrink-0">{v.ip}</code>
                <span className="text-muted-foreground shrink-0">{v.endpoint}</span>
                <span className="text-muted-foreground shrink-0">×{v.visit_count}</span>
                <span className="text-muted-foreground ml-auto shrink-0">{new Date(v.last_seen_at).toLocaleTimeString('id-ID')}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleBlock(v.ip, `manual from visit log`)}><Ban className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="violations" className="space-y-1">
            {filteredViolations.length === 0 ? <p className="text-muted-foreground text-center py-6 text-sm">Tidak ada pelanggaran.</p> : filteredViolations.slice(0, 200).map(v => (
              <div key={v.id} className="flex items-center gap-2 p-2 rounded border border-border bg-card text-xs">
                <code className="font-mono shrink-0">{v.ip}</code>
                <span className="text-muted-foreground shrink-0">{v.endpoint}</span>
                <Badge variant="destructive" className="text-[10px]">×{v.violation_count}</Badge>
                <span className="text-muted-foreground ml-auto shrink-0">{new Date(v.created_at).toLocaleString('id-ID')}</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
