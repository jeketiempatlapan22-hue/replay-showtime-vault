import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Upload, Trash2, Sparkles } from 'lucide-react';
import { upsertActiveShow } from '@/lib/activeShows';
import { toast } from '@/hooks/use-toast';

interface ParsedShow {
  title: string;
  show_date: string; // YYYY-MM-DD
  show_time: string; // HH:MM:SS
  lineup: string[];
  admin_alias: string;
  live_password: string;
  price_show: number;
  price_replay: number;
  price_show_coins: number;
  price_replay_coins: number;
  category: string;
}

const MONTHS_ID: Record<string, string> = {
  januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
  juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
  jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', agu: '08',
  sep: '09', okt: '10', nov: '11', des: '12',
};

function parseDate(line: string): string {
  // e.g. "Kamis, 14 Mei 2026" or "14 Mei 2026"
  const m = line.match(/(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/);
  if (!m) return '';
  const day = m[1].padStart(2, '0');
  const month = MONTHS_ID[m[2].toLowerCase()];
  const year = m[3];
  if (!month) return '';
  return `${year}-${month}-${day}`;
}

function parseTime(line: string): string {
  const m = line.match(/(\d{1,2})[.:](\d{2})/);
  if (!m) return '19:00:00';
  return `${m[1].padStart(2, '0')}:${m[2]}:00`;
}

function slugAlias(title: string, date: string, time: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 6);
  const d = date.replace(/-/g, '').slice(4); // MMDD
  const t = time.replace(/[:.]/g, '').slice(0, 4); // HHMM
  return `${base}${d}${t}`.slice(0, 20);
}

function parseBulkText(text: string): ParsedShow[] {
  // Split into "blocks" separated by lines containing 🗓️/Date marker.
  // Strategy: walk lines; each show block = title line, then 🗓️ date, then 🕒 time, then 👥 lineup.
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const shows: ParsedShow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) { i++; continue; }
    // Skip lead-in narration
    if (/^berikut|^pertunjukan|^member yang/i.test(line)) { i++; continue; }
    // Look ahead for date marker within next 6 lines
    let dateIdx = -1;
    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
      if (/🗓️|tanggal|^[A-Za-z]+,\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}/i.test(lines[j])) { dateIdx = j; break; }
      if (/🕒|🕗|^\d{1,2}[.:]\d{2}/i.test(lines[j])) break; // bad order
    }
    if (dateIdx === -1) { i++; continue; }
    const title = line.replace(/^[•\-*]\s*/, '').trim();
    const date = parseDate(lines[dateIdx]);
    if (!date) { i++; continue; }
    let time = '19:00:00';
    let lineup: string[] = [];
    let endIdx = dateIdx;
    for (let j = dateIdx + 1; j < Math.min(lines.length, dateIdx + 6); j++) {
      const ln = lines[j];
      if (!ln) continue;
      if (/🕒|🕗|^\d{1,2}[.:]\d{2}/.test(ln)) { time = parseTime(ln); endIdx = j; }
      else if (/👥|^member|^lineup/i.test(ln) || /,/.test(ln)) {
        const cleaned = ln.replace(/^👥\s*/, '').replace(/[.。]$/, '');
        lineup = cleaned.split(/[,،]/).map(s => s.trim()).filter(Boolean);
        endIdx = j;
        break;
      }
    }
    shows.push({
      title, show_date: date, show_time: time, lineup,
      admin_alias: slugAlias(title, date, time),
      live_password: '', price_show: 0, price_replay: 0,
      price_show_coins: 0, price_replay_coins: 0, category: 'reguler',
    });
    i = endIdx + 1;
  }
  return shows;
}

interface Props {
  onImported: () => void;
}

export default function BulkShowImport({ onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedShow[]>([]);
  const [saving, setSaving] = useState(false);

  // Defaults applied to ALL parsed shows
  const [defPriceShow, setDefPriceShow] = useState<number>(0);
  const [defPriceReplay, setDefPriceReplay] = useState<number>(0);
  const [defCoinsShow, setDefCoinsShow] = useState<number>(0);
  const [defCoinsReplay, setDefCoinsReplay] = useState<number>(0);
  const [defPassword, setDefPassword] = useState<string>('');
  const [aliasPrefix, setAliasPrefix] = useState<string>('');

  const preview = useMemo(() => parsed.map((s, idx) => ({
    ...s,
    admin_alias: aliasPrefix ? `${aliasPrefix}${idx + 1}` : s.admin_alias,
    live_password: s.live_password || defPassword,
    price_show: s.price_show || defPriceShow,
    price_replay: s.price_replay || defPriceReplay,
    price_show_coins: s.price_show_coins || defCoinsShow,
    price_replay_coins: s.price_replay_coins || defCoinsReplay,
  })), [parsed, aliasPrefix, defPassword, defPriceShow, defPriceReplay, defCoinsShow, defCoinsReplay]);

  const handleParse = () => {
    const out = parseBulkText(text);
    if (out.length === 0) {
      toast({ title: 'Tidak ada show terdeteksi', description: 'Periksa format tanggal & jam.', variant: 'destructive' });
      return;
    }
    setParsed(out);
    toast({ title: `${out.length} show terdeteksi` });
  };

  const updateRow = (idx: number, patch: Partial<ParsedShow>) => {
    setParsed(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const removeRow = (idx: number) => setParsed(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setSaving(true);
    let ok = 0, fail = 0;
    for (const s of preview) {
      try {
        await upsertActiveShow({
          title: s.title,
          show_date: s.show_date,
          show_time: s.show_time,
          lineup: s.lineup,
          admin_alias: s.admin_alias || null,
          live_password: s.live_password || '',
          price_show: s.price_show || 0,
          price_replay: s.price_replay || 0,
          price_show_coins: s.price_show_coins || 0,
          price_replay_coins: s.price_replay_coins || 0,
          category: s.category || 'reguler',
          is_active: true,
          sort_order: 0,
          description: '',
          image_url: '',
          pakasir_amount: 0,
          replay_id: null,
          replay_enabled: false,
        } as any);
        ok++;
      } catch {
        fail++;
      }
    }
    setSaving(false);
    toast({ title: `Import selesai`, description: `Berhasil: ${ok}, Gagal: ${fail}` });
    if (ok > 0) {
      onImported();
      setOpen(false);
      setText('');
      setParsed([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <Upload className="w-4 h-4 mr-2" /> Import Bulk Jadwal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Import Bulk Jadwal Show</DialogTitle>
          <DialogDescription>
            Tempel daftar jadwal (format: judul, 🗓️ tanggal, 🕒 jam, 👥 lineup), atur default lalu Preview.
          </DialogDescription>
        </DialogHeader>

        {parsed.length === 0 ? (
          <div className="space-y-3">
            <div>
              <Label>Tempel Jadwal di sini</Label>
              <Textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={14}
                className="font-mono text-xs"
                placeholder={`ITADAKI🩷LOVE\n🗓️ Kamis, 14 Mei 2026\n🕒 19:00 WIB\n👥 Alya, Lia, Lana, ...\n\nPajama Drive\n🗓️ Jumat, 15 Mei 2026\n...`}
              />
            </div>
            <Button onClick={handleParse} disabled={!text.trim()} className="w-full">
              <Sparkles className="w-4 h-4 mr-2" /> Deteksi Jadwal
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Card_Defaults
              defPriceShow={defPriceShow} setDefPriceShow={setDefPriceShow}
              defPriceReplay={defPriceReplay} setDefPriceReplay={setDefPriceReplay}
              defCoinsShow={defCoinsShow} setDefCoinsShow={setDefCoinsShow}
              defCoinsReplay={defCoinsReplay} setDefCoinsReplay={setDefCoinsReplay}
              defPassword={defPassword} setDefPassword={setDefPassword}
              aliasPrefix={aliasPrefix} setAliasPrefix={setAliasPrefix}
            />

            <div className="space-y-3">
              <p className="text-sm font-medium">Preview ({preview.length} show) — bisa diedit per baris:</p>
              {preview.map((s, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        📅 {s.show_date} · 🕒 {s.show_time.slice(0, 5)}
                        {s.lineup.length > 0 && ` · 👥 ${s.lineup.length}`}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeRow(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Alias</Label>
                      <Input className="h-8 text-xs" value={s.admin_alias}
                        onChange={e => updateRow(idx, { admin_alias: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Sandi Replay/Live</Label>
                      <Input className="h-8 text-xs" value={s.live_password}
                        onChange={e => updateRow(idx, { live_password: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Harga Show (Rp)</Label>
                      <Input type="number" min={0} className="h-8 text-xs" value={s.price_show}
                        onChange={e => updateRow(idx, { price_show: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Harga Replay (Rp)</Label>
                      <Input type="number" min={0} className="h-8 text-xs" value={s.price_replay}
                        onChange={e => updateRow(idx, { price_replay: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Koin Show</Label>
                      <Input type="number" min={0} className="h-8 text-xs" value={s.price_show_coins}
                        onChange={e => updateRow(idx, { price_show_coins: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Koin Replay</Label>
                      <Input type="number" min={0} className="h-8 text-xs" value={s.price_replay_coins}
                        onChange={e => updateRow(idx, { price_replay_coins: Number(e.target.value) })} />
                    </div>
                  </div>
                  {s.lineup.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {s.lineup.map((m, k) => <Badge key={k} variant="secondary" className="text-[10px]">{m}</Badge>)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 sticky bottom-0 bg-background pt-3 border-t border-border">
              <Button variant="outline" onClick={() => { setParsed([]); }}>Kembali</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || preview.length === 0}>
                {saving ? 'Menyimpan...' : `Simpan ${preview.length} Show`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Card_Defaults(props: {
  defPriceShow: number; setDefPriceShow: (n: number) => void;
  defPriceReplay: number; setDefPriceReplay: (n: number) => void;
  defCoinsShow: number; setDefCoinsShow: (n: number) => void;
  defCoinsReplay: number; setDefCoinsReplay: (n: number) => void;
  defPassword: string; setDefPassword: (s: string) => void;
  aliasPrefix: string; setAliasPrefix: (s: string) => void;
}) {
  return (
    <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
      <p className="text-xs font-semibold">Default untuk semua show (kosongkan jika ingin per-show)</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px]">Prefix Alias</Label>
          <Input className="h-8 text-xs" placeholder="contoh: mei" value={props.aliasPrefix}
            onChange={e => props.setAliasPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} />
        </div>
        <div>
          <Label className="text-[10px]">Sandi Default</Label>
          <Input className="h-8 text-xs" value={props.defPassword} onChange={e => props.setDefPassword(e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px]">Harga Show (Rp)</Label>
          <Input type="number" min={0} className="h-8 text-xs" value={props.defPriceShow}
            onChange={e => props.setDefPriceShow(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-[10px]">Harga Replay (Rp)</Label>
          <Input type="number" min={0} className="h-8 text-xs" value={props.defPriceReplay}
            onChange={e => props.setDefPriceReplay(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-[10px]">Koin Show</Label>
          <Input type="number" min={0} className="h-8 text-xs" value={props.defCoinsShow}
            onChange={e => props.setDefCoinsShow(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-[10px]">Koin Replay</Label>
          <Input type="number" min={0} className="h-8 text-xs" value={props.defCoinsReplay}
            onChange={e => props.setDefCoinsReplay(Number(e.target.value))} />
        </div>
      </div>
    </div>
  );
}
