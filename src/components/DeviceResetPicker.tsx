import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DeviceResetButton from '@/components/DeviceResetButton';

export interface ResetTarget {
  id: string;
  label: string;
  kind: 'show' | 'membership';
  token: string;
  password?: string;
}

/**
 * Satu tempat terpusat untuk reset perangkat: user memilih akses mana yang mau
 * dipindah perangkatnya, lalu menekan tombol reset. Menggantikan tombol reset
 * yang sebelumnya muncul di tiap baris riwayat pembelian.
 */
export default function DeviceResetPicker({ targets }: { targets: ResetTarget[] }) {
  const list = useMemo(() => targets.filter((t) => !!t.token), [targets]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    if (!list.length) { setSelected(''); return; }
    if (!list.some((t) => t.id === selected)) setSelected(list[0].id);
  }, [list, selected]);

  const active = list.find((t) => t.id === selected) || null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCcw className="w-4 h-4 text-primary" /> Reset Perangkat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Belum ada akses yang bisa direset. Setelah membeli show, replay, atau membership, tombol reset akan muncul di sini.
          </p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              Pilih akses yang mau dipindahkan ke perangkat ini.
            </p>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Pilih akses" />
              </SelectTrigger>
              <SelectContent>
                {list.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {active && (
              active.kind === 'membership'
                ? <DeviceResetButton key={active.id} kind="membership" token={active.token} password={active.password || ''} />
                : <DeviceResetButton key={active.id} kind="show" token={active.token} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
