import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Phone, Save, LogOut, Coins, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function Profil() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/auth?redirect=/profil', { replace: true }); return; }
    (async () => {
      const [{ data: prof }, { data: bal }] = await Promise.all([
        supabase.from('profiles').select('username,phone').eq('user_id', user.id).maybeSingle(),
        supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle(),
      ]);
      const u = (prof as any)?.username || '';
      setUsername(u);
      setOriginalUsername(u);
      setPhone((prof as any)?.phone || '');
      setBalance(Number((bal as any)?.balance || 0));
      setLoaded(true);
    })();
  }, [user, loading, navigate]);

  const validUsername = (v: string) => /^[a-zA-Z0-9_.]{3,20}$/.test(v);

  const handleSave = async () => {
    if (!user) return;
    const trimmed = username.trim();
    if (trimmed && !validUsername(trimmed)) {
      toast.error('Username 3-20 karakter, hanya huruf, angka, titik, atau garis bawah.');
      return;
    }
    setBusy(true);
    try {
      // Check uniqueness if changed
      if (trimmed && trimmed.toLowerCase() !== originalUsername.toLowerCase()) {
        const { data: exists } = await supabase
          .from('profiles')
          .select('user_id')
          .ilike('username', trimmed)
          .neq('user_id', user.id)
          .maybeSingle();
        if (exists) {
          toast.error('Username sudah dipakai. Pilih yang lain.');
          setBusy(false);
          return;
        }
      }
      const { error } = await supabase.from('profiles').update({ username: trimmed || null }).eq('user_id', user.id);
      if (error) throw error;
      setOriginalUsername(trimmed);
      toast.success('Profil tersimpan');
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  if (!loaded) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-base sm:text-lg font-bold text-primary">Profil Saya</h1>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 max-w-lg space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><User className="w-4 h-4" /> Identitas Akun</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs"><AtSign className="w-3.5 h-3.5" /> Username</Label>
              <Input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username_saya"
                maxLength={20}
              />
              <p className="text-[11px] text-muted-foreground">3-20 karakter. Huruf, angka, titik, atau garis bawah.</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs"><Mail className="w-3.5 h-3.5" /> Email</Label>
              <Input value={user?.email || ''} disabled />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs"><Phone className="w-3.5 h-3.5" /> Nomor HP</Label>
              <Input value={phone || '—'} disabled />
              <p className="text-[11px] text-muted-foreground">Untuk mengubah nomor HP, hubungi admin.</p>
            </div>

            <Button onClick={handleSave} disabled={busy} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {busy ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Coins className="w-4 h-4 text-primary" /> Saldo Koin</CardTitle>
            <Badge variant="secondary" className="font-mono">{balance} koin</Badge>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/koin')}>Kelola Koin</Button>
          </CardContent>
        </Card>

        <Button variant="destructive" className="w-full" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" /> Keluar
        </Button>
      </main>
    </div>
  );
}
