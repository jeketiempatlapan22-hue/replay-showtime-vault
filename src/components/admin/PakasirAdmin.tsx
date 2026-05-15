import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Copy, CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw, AlertTriangle, Save, RotateCcw } from 'lucide-react';

const DEFAULT_WA_TPL =
  '🎬 *{title}*\n{date_line}\n🔗 Link Akses:\n{link}\n{password_line}{live_link_block}\n— *ReplayTime* 💖';

function renderPreview(tpl: string) {
  const vars = {
    title: 'Show • Sample Konser',
    date: '15 Mei 2026',
    link: 'https://replaytime.lovable.app/akses?token=abc123&replay=xyz',
    live_link: 'https://replaytime.lovable.app/live?show=xyz&t=abc123',
    password: 'KONSER48',
    order_id: 'rt-demo-001',
    site: 'https://replaytime.lovable.app',
  };
  return tpl
    .replace(/\{date_line\}\n?/g, vars.date ? `📅 ${vars.date}\n` : '')
    .replace(/\{password_line\}\n?/g, vars.password ? `🔐 Sandi: *${vars.password}*\n` : '')
    .replace(/\{live_link_block\}\n?/g, vars.live_link ? `\n📺 Link Live:\n${vars.live_link}\n` : '')
    .replace(/\{(\w+)\}/g, (_, k) => (vars as Record<string, string>)[k] ?? '');
}

interface CheckRow { name: string; ok: boolean; detail: string }

export default function PakasirAdmin() {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const webhookUrl = `${supabaseUrl}/functions/v1/pakasir-webhook`;

  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [allOk, setAllOk] = useState<boolean | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string>('');
  const [stats, setStats] = useState({ pending: 0, paid24h: 0, sent24h: 0, lastPaid: '' });
  const [pollRunning, setPollRunning] = useState(false);
  const [tpl, setTpl] = useState<string>(DEFAULT_WA_TPL);
  const [tplLoaded, setTplLoaded] = useState<string>(DEFAULT_WA_TPL);
  const [savingTpl, setSavingTpl] = useState(false);

  const loadStatus = async () => {
    try {
      const { data: s } = await supabase
        .from('site_settings')
        .select('key,value')
        .in('key', ['pakasir_webhook_verified_at', 'wa_message_template']);
      const verified = s?.find(r => r.key === 'pakasir_webhook_verified_at')?.value || '';
      setVerifiedAt(verified);
      const t = s?.find(r => r.key === 'wa_message_template')?.value;
      if (t) { setTpl(t); setTplLoaded(t); }

      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const [pending, paid24h, sent24h, lastPaid] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid').gte('paid_at', since),
        supabase.from('orders').select('id', { count: 'exact', head: true }).not('token_sent_at', 'is', null).gte('token_sent_at', since),
        supabase.from('orders').select('paid_at').eq('status', 'paid').order('paid_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setStats({
        pending: pending.count || 0,
        paid24h: paid24h.count || 0,
        sent24h: sent24h.count || 0,
        lastPaid: (lastPaid.data as any)?.paid_at || '',
      });
    } catch { /* ignore */ }
  };

  useEffect(() => { void loadStatus(); }, []);

  const runSelfTest = async () => {
    setRunning(true);
    setChecks([]);
    setAllOk(null);
    try {
      const { data, error } = await supabase.functions.invoke('pakasir-webhook-selftest', { body: {} });
      if (error) throw error;
      const r = data as { ok: boolean; checks: CheckRow[] };
      setChecks(r.checks || []);
      setAllOk(!!r.ok);
      if (r.ok) toast.success('Webhook lulus self-test');
      else toast.error('Ada cek yang gagal — periksa detail');
      void loadStatus();
    } catch (e: any) {
      toast.error('Self-test gagal: ' + (e?.message || e));
    } finally {
      setRunning(false);
    }
  };

  const runPollNow = async () => {
    setPollRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('poll-pending-orders', { body: {} });
      if (error) throw error;
      const r = data as { scanned: number; results: any[] };
      const paid = (r.results || []).filter(x => x.status === 'paid' || x.sent).length;
      toast.success(`Cron dijalankan: ${r.scanned} order discan, ${paid} ditandai paid`);
      void loadStatus();
    } catch (e: any) {
      toast.error('Cron gagal: ' + (e?.message || e));
    } finally {
      setPollRunning(false);
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Disalin'); } catch { /* ignore */ }
  };

  const saveTpl = async () => {
    setSavingTpl(true);
    try {
      const { data: existing } = await supabase
        .from('site_settings').select('id').eq('key', 'wa_message_template').maybeSingle();
      if (existing?.id) {
        await supabase.from('site_settings').update({ value: tpl }).eq('id', existing.id);
      } else {
        await supabase.from('site_settings').insert({ key: 'wa_message_template', value: tpl });
      }
      setTplLoaded(tpl);
      toast.success('Template tersimpan');
    } catch (e: any) {
      toast.error('Gagal menyimpan: ' + (e?.message || e));
    } finally {
      setSavingTpl(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            Webhook URL Pakasir
            {verifiedAt ? (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> tervalidasi {new Date(verifiedAt).toLocaleString('id-ID')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5" /> belum tervalidasi
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Salin URL ini ke kolom <em>Webhook URL</em> di dashboard Pakasir</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(webhookUrl)} title="Salin">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1 pl-1">
            <li>Buka dashboard Pakasir → menu <b>Project</b> / <b>Webhook</b>.</li>
            <li>Tempel URL di atas pada kolom <b>Webhook URL</b> (HTTP POST, JSON).</li>
            <li>Pastikan <b>Project Slug</b> & <b>API Key</b> di Pakasir sama dengan secrets server.</li>
            <li>Klik <b>Jalankan Self-Test</b> di bawah untuk memastikan webhook sah & aktif.</li>
          </ol>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runSelfTest} disabled={running}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Jalankan Self-Test
            </Button>
            <Button variant="outline" asChild>
              <a href="https://app.pakasir.com" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" /> Buka Dashboard Pakasir
              </a>
            </Button>
          </div>

          {checks.length > 0 && (
            <div className={`rounded-md border p-3 space-y-2 ${allOk ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
              {checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {c.ok
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{c.name}</div>
                    <div className="text-muted-foreground break-all">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Status Pemrosesan Pembayaran</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-md border border-border bg-card p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Pending (semua)</div>
              <div className="text-xl font-bold">{stats.pending}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Paid 24 jam</div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">{stats.paid24h}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Token terkirim 24 jam</div>
              <div className="text-xl font-bold text-primary">{stats.sent24h}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Bayar terakhir</div>
              <div className="text-xs font-mono">{stats.lastPaid ? new Date(stats.lastPaid).toLocaleString('id-ID') : '—'}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runPollNow} disabled={pollRunning}>
              {pollRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Jalankan Cron Poller Sekarang
            </Button>
            <Button variant="ghost" onClick={loadStatus}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Selain webhook, sistem juga punya cron 1 menit (<code>poll-pending-orders</code>) sebagai jaring pengaman.
            Klien juga melakukan polling ke <code>check-pakasir-status</code> selama dialog QR terbuka. Idempotensi
            dijamin: token & link hanya dikirim sekali per order.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
