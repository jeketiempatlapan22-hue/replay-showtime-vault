import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, RefreshCw, Search, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type Row = {
  id: string;
  created_at: string;
  reseller_phone: string;
  reseller_label: string;
  kind: 'show' | 'replay' | 'membership';
  target_id: string | null;
  target_title: string;
  token: string;
  expires_at: string | null;
  duration_days: number | null;
};

const kindBadge: Record<string, { label: string; cls: string }> = {
  show: { label: '📺 Show', cls: 'bg-red-500/15 text-red-500 border-red-500/30' },
  replay: { label: '🎬 Replay', cls: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
  membership: { label: '👑 Membership', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
};

export default function ResellerAuditAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'show' | 'replay' | 'membership'>('all');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reseller_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) toast({ title: 'Gagal memuat', description: error.message, variant: 'destructive' });
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (kind !== 'all' && r.kind !== kind) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return r.reseller_phone.toLowerCase().includes(s)
      || r.reseller_label.toLowerCase().includes(s)
      || r.target_title.toLowerCase().includes(s);
  }), [rows, q, kind]);

  const copy = (t: string, label = 'Token') => {
    navigator.clipboard.writeText(t);
    toast({ title: `${label} disalin` });
  };

  const fmtDate = (s: string | null) => s
    ? new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> Audit Reseller ({filtered.length})
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Muat ulang
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cari nomor / label / judul…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {(['all', 'show', 'replay', 'membership'] as const).map((k) => (
              <Button key={k} size="sm" variant={kind === k ? 'default' : 'outline'} onClick={() => setKind(k)}>
                {k === 'all' ? 'Semua' : k === 'show' ? 'Show' : k === 'replay' ? 'Replay' : 'Membership'}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-8 text-sm">Memuat…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">Belum ada aktivitas.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => {
              const kb = kindBadge[r.kind];
              return (
                <div key={r.id} className="border border-border rounded-lg p-3 bg-card/50 space-y-1.5">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <Badge variant="outline" className={`text-[10px] ${kb.cls}`}>{kb.label}</Badge>
                      <span className="font-mono text-sm font-semibold">+{r.reseller_phone}</span>
                      {r.reseller_label && (
                        <span className="text-xs text-muted-foreground">({r.reseller_label})</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(r.created_at)}</span>
                  </div>
                  <p className="text-sm font-medium truncate">{r.target_title || '—'}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {r.duration_days != null && <span>⏱️ {r.duration_days} hari</span>}
                    <span>⏳ Berlaku s/d: {fmtDate(r.expires_at)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <code className="text-[10px] font-mono truncate flex-1 bg-secondary/50 px-2 py-1 rounded">
                      {r.token.slice(0, 6)}…{r.token.slice(-6)}
                    </code>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(r.token)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
