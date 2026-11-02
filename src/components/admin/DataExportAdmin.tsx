import { useState } from 'react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw, Database, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/backend';
import { toast } from '@/hooks/use-toast';

interface ExportResult {
  generated_at: string;
  counts: Record<string, number>;
  errors: Record<string, string>;
  storage: Record<string, any[]>;
  data: Record<string, any[]>;
  notes: string[];
}

function toCsv(rows: any[]): string {
  if (!rows.length) return '';
  const cols = Array.from(rows.reduce((s: Set<string>, r) => { Object.keys(r || {}).forEach(k => s.add(k)); return s; }, new Set<string>())) as string[];
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r?.[c])).join(','))].join('\n');
}

export default function DataExportAdmin() {
  const [loading, setLoading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  const scan = async (): Promise<ExportResult | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-export-data', { body: {} });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || 'Gagal mengambil data');
      setResult(data as ExportResult);
      toast({ title: 'Scan selesai', description: 'Data terbaru berhasil diambil.' });
      return data as ExportResult;
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    const res = result || (await scan());
    if (!res) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      zip.file('data.json', JSON.stringify(res, null, 2));

      const csvMap: Record<string, any[]> = {
        'users.csv': res.data.auth_users || [],
        'profiles.csv': res.data.profiles || [],
        'coin_balances.csv': res.data.coin_balances || [],
        'replays.csv': res.data.replays || [],
        'shows.csv': res.data.active_shows || [],
        'members.csv': res.data.members || [],
        'membership_tokens.csv': res.data.membership_tokens || [],
        'show_tokens.csv': res.data.active_show_tokens || [],
        'replay_tokens.csv': res.data.replay_personal_tokens || [],
        'master_passwords.csv': res.data.master_passwords || [],
        'site_settings.csv': res.data.site_settings || [],
        'orders.csv': res.data.orders || [],
        'membership_orders.csv': res.data.membership_orders || [],
      };
      const csvFolder = zip.folder('csv')!;
      Object.entries(csvMap).forEach(([name, rows]) => {
        if (rows.length) csvFolder.file(name, toCsv(rows));
      });

      const storageFolder = zip.folder('storage')!;
      Object.entries(res.storage || {}).forEach(([bucket, files]) => {
        storageFolder.file(`${bucket}.csv`, toCsv(files as any[]));
      });

      const lines = [
        'EKSPOR DATA REALTIME48 / REPLAYTIME',
        `Dibuat: ${new Date(res.generated_at).toLocaleString('id-ID')}`,
        '',
        'JUMLAH BARIS:',
        ...Object.entries(res.counts).sort().map(([k, v]) => `- ${k}: ${v}`),
        '',
        'CATATAN:',
        ...(res.notes || []).map(n => `- ${n}`),
      ];
      if (Object.keys(res.errors || {}).length) {
        lines.push('', 'TABEL GAGAL DIBACA:', ...Object.entries(res.errors).map(([k, v]) => `- ${k}: ${v}`));
      }
      zip.file('README.txt', lines.join('\n'));

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-realtime48-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Berhasil', description: 'Dokumen ekspor terunduh.' });
    } catch (e: any) {
      toast({ title: 'Gagal membuat ZIP', description: e.message, variant: 'destructive' });
    } finally {
      setZipping(false);
    }
  };

  const counts = result ? Object.entries(result.counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />Ekspor Data (Backup / Pindah Projek)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs sm:text-sm text-muted-foreground">
          Unduh satu dokumen ZIP berisi seluruh data website: user (email, nomor HP, koin), token show/replay/membership,
          semua data replay (ID/link YouTube, m3u8, playlist, sandi replay & sandi master), show aktif beserta banner dan
          setelan Hanabira/IDN, foto member, paket & order membership, bukti transaksi, setelan situs, bot WA, dan reseller.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={scan} disabled={loading} variant="outline" className="w-full sm:w-auto">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Memindai...' : 'Scan / Refresh Data'}
          </Button>
          <Button onClick={download} disabled={loading || zipping} className="w-full sm:w-auto">
            <Download className="w-4 h-4 mr-2" />
            {zipping ? 'Menyiapkan...' : 'Download Dokumen (.zip)'}
          </Button>
        </div>

        {result && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Scan terakhir: {new Date(result.generated_at).toLocaleString('id-ID')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {counts.map(([k, v]) => (
                <Badge key={k} variant="secondary" className="text-[10px]">{k}: {v}</Badge>
              ))}
            </div>
            {Object.keys(result.errors || {}).length > 0 && (
              <p className="text-xs text-destructive">
                Gagal dibaca: {Object.keys(result.errors).join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 items-start rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-[11px] sm:text-xs text-muted-foreground space-y-1">
            <p className="text-destructive font-semibold">File ini sangat sensitif — jangan dibagikan.</p>
            <p>Data login user ikut terekspor: email, nomor HP, ID user, dan hash sandi (bcrypt) di kolom <code>encrypted_password</code>. Impor kolom itu ke projek baru agar user login dengan sandi yang sama tanpa reset.</p>
            <p>Sandi replay, sandi master bulanan, sandi live, dan PIN bot admin ikut terekspor.</p>

          </div>
        </div>
      </CardContent>
    </Card>
  );
}
