import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Copy, Radio, Play, Sparkles, Calendar, ShieldCheck, KeyRound, PackagePlus, ArrowRight, Coins, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import DeviceResetButton from '@/components/DeviceResetButton';
import { siteLink } from '@/lib/siteOrigin';
import { supabase } from '@/integrations/supabase/client';
import type { ActiveMembership } from '@/hooks/useActiveMembership';

interface OpenPkg {
  id: string;
  name: string;
  duration_days: number;
  price_idr: number;
  price_coins: number;
  quota_total: number;
  quota_reserved: number;
  status: string;
}

function fmtDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MembershipDashboard({ membership, onShopMore }: { membership: ActiveMembership; onShopMore: () => void }) {
  const navigate = useNavigate();
  const link = siteLink(`/live?mtoken=${encodeURIComponent(membership.token)}`);

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} disalin`); }
    catch { toast.error('Gagal menyalin'); }
  };

  // Progress bar
  let pct = 100;
  if (membership.starts_at && membership.expires_at) {
    const s = new Date(membership.starts_at).getTime();
    const e = new Date(membership.expires_at).getTime();
    const n = Date.now();
    if (e > s) pct = Math.max(0, Math.min(100, Math.round(((e - n) / (e - s)) * 100)));
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="relative overflow-hidden border-2 border-primary/40 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <CardContent className="p-5 space-y-3 relative">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Crown className="w-6 h-6 text-primary" />
              <div>
                <div className="text-xs uppercase tracking-wider text-primary font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Membership Aktif
                </div>
                <div className="text-lg font-bold">{membership.package_name}</div>
              </div>
            </div>
            <Badge className="bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/15">
              {membership.days_remaining != null ? `${membership.days_remaining} hari lagi` : 'Aktif'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-card/70 border border-border p-2">
              <div className="text-muted-foreground text-[10px] uppercase">Mulai</div>
              <div className="font-semibold flex items-center gap-1"><Calendar className="w-3 h-3 text-primary" /> {fmtDate(membership.starts_at)}</div>
            </div>
            <div className="rounded-md bg-card/70 border border-border p-2">
              <div className="text-muted-foreground text-[10px] uppercase">Berakhir</div>
              <div className="font-semibold flex items-center gap-1"><Calendar className="w-3 h-3 text-primary" /> {fmtDate(membership.expires_at)}</div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Durasi tersisa</span>
              <span className="font-mono">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-amber-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <Button className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white h-11" onClick={() => navigate('/live')}>
            <Radio className="w-4 h-4 animate-pulse" /> Tonton Live Sekarang
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={() => navigate('/')}>
            <Play className="w-4 h-4" /> Lihat Daftar Replay
          </Button>
        </CardContent>
      </Card>

      {/* Token */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <KeyRound className="w-3.5 h-3.5" /> Token Membership
          </div>
          <div className="flex gap-1">
            <input
              readOnly value={membership.token}
              className="flex-1 font-mono text-xs px-2 py-2 rounded-md border border-input bg-background"
            />
            <Button size="icon" variant="outline" onClick={() => copy(membership.token, 'Token')}><Copy className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Link Login Membership</div>
            <div className="flex gap-1">
              <input readOnly value={link} className="flex-1 text-xs px-2 py-2 rounded-md border border-input bg-background" />
              <Button size="icon" variant="outline" onClick={() => copy(link, 'Link')}><Copy className="w-4 h-4" /></Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Tempel link ini di browser perangkat lain untuk login otomatis.</p>
          </div>

          <DeviceResetButton kind="membership" token={membership.token} password={membership.password} />
        </CardContent>
      </Card>

      {/* Sandi Replay & Info */}
      {(membership.includes_replays || membership.replay_info) && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Info Replay
            </div>
            {membership.replay_info ? (
              <div className="text-sm whitespace-pre-line text-foreground/90 border-l-2 border-primary/40 pl-3">
                {membership.replay_info}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Anda dapat menonton semua replay selama membership aktif. Gunakan Sandi Replay yang diberikan admin di setiap kartu replay.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="pt-1 text-center">
        <Button variant="ghost" size="sm" onClick={onShopMore} className="text-xs text-muted-foreground">
          Lihat paket membership lain
        </Button>
      </div>
    </div>
  );
}
