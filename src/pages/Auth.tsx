import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import logoImg from '@/assets/logo.png';

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('62')) return digits;
  return digits;
}

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [identifier, setIdentifier] = useState(''); // email or phone (login)
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/', { replace: true });
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast({ title: 'Lengkapi data', description: 'Masukkan email/HP dan sandi.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      let loginEmail = identifier.trim();
      // If not an email, treat as phone and look up email
      if (!loginEmail.includes('@')) {
        const phoneNorm = normalizePhone(loginEmail);
        const { data, error } = await supabase.rpc('email_for_phone', { _phone: phoneNorm });
        if (error) throw error;
        if (!data) {
          toast({ title: 'Akun tidak ditemukan', description: 'Nomor HP belum terdaftar.', variant: 'destructive' });
          setBusy(false);
          return;
        }
        loginEmail = data as string;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
      toast({ title: 'Berhasil masuk' });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk';
      toast({ title: 'Gagal masuk', description: msg, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !phone.trim() || !password) {
      toast({ title: 'Lengkapi data', description: 'Email, nomor HP, dan sandi wajib diisi.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const phoneNorm = normalizePhone(phone);
      // Check phone uniqueness
      const { data: exists } = await supabase.rpc('phone_exists', { _phone: phoneNorm });
      if (exists) {
        toast({ title: 'Nomor HP sudah dipakai', variant: 'destructive' });
        setBusy(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { phone: phoneNorm },
        },
      });
      if (error) throw error;
      toast({ title: 'Akun dibuat', description: 'Anda otomatis masuk.' });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mendaftar';
      toast({ title: 'Gagal mendaftar', description: msg, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={logoImg} alt="Logo" className="w-14 h-14 rounded-full ring-2 ring-primary/40" />
          <h1 className="text-2xl font-bold text-foreground">{mode === 'login' ? 'Masuk' : 'Daftar Akun'}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'Gunakan email atau nomor HP Anda.' : 'Buat akun dengan email & nomor HP.'}
          </p>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Email atau Nomor HP</Label>
              <Input
                id="identifier"
                placeholder="contoh: 08123456789 atau email@mail.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Sandi</Label>
              <Input
                id="password"
                type="password"
                placeholder="Sandi apa pun (mis. 123456)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Masuk
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Nomor HP</Label>
              <Input id="phone" inputMode="tel" placeholder="08xxxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password">Sandi</Label>
              <Input
                id="signup-password"
                type="password"
                placeholder="Bebas, mis. 123456"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Daftar
            </Button>
          </form>
        )}

        <div className="text-center text-sm text-muted-foreground">
          {mode === 'login' ? (
            <>
              Belum punya akun?{' '}
              <button type="button" className="text-primary font-medium hover:underline" onClick={() => setMode('signup')}>
                Daftar
              </button>
            </>
          ) : (
            <>
              Sudah punya akun?{' '}
              <button type="button" className="text-primary font-medium hover:underline" onClick={() => setMode('login')}>
                Masuk
              </button>
            </>
          )}
        </div>

        <div className="text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary">← Kembali ke beranda</Link>
        </div>
      </div>
    </div>
  );
}
