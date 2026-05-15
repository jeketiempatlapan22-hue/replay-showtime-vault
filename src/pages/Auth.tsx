import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, LogIn, UserPlus, ShieldAlert, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import logoImg from '@/assets/logo.png';

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('62')) return digits;
  return digits;
}

type LockInfo = { locked: boolean; seconds_remaining: number; fail_count: number };

async function checkLock(identifier: string): Promise<LockInfo> {
  // RPC may not be in generated types yet — cast through any.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: LockInfo[] | null; error: unknown }>)(
    'check_login_lock',
    { _identifier: identifier },
  );
  if (error || !data || !data[0]) return { locked: false, seconds_remaining: 0, fail_count: 0 };
  return data[0];
}

async function recordAttempt(identifier: string, success: boolean) {
  await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>)('record_login_attempt', { _identifier: identifier, _success: success });
}

function formatSeconds(s: number) {
  if (s <= 0) return '0 detik';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `${m} menit ${sec} detik`;
  return `${sec} detik`;
}

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lockSeconds, setLockSeconds] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotNewPw2, setForgotNewPw2] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/', { replace: true });
    });
  }, [navigate]);

  // Countdown lockout timer
  useEffect(() => {
    if (lockSeconds <= 0) return;
    const t = setInterval(() => setLockSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockSeconds]);

  const persistRememberFlag = (val: boolean) => {
    try {
      localStorage.setItem('auth_remember', val ? 'true' : 'false');
      sessionStorage.setItem('auth_session_alive', '1');
    } catch { /* ignore */ }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast({ title: 'Lengkapi data', description: 'Masukkan email/HP dan sandi.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const rawId = identifier.trim().toLowerCase();
      const lockKey = rawId.includes('@') ? rawId : normalizePhone(rawId);

      // 1) Check brute-force lock
      const lock = await checkLock(lockKey);
      if (lock.locked) {
        setLockSeconds(lock.seconds_remaining);
        toast({
          title: 'Terlalu banyak percobaan',
          description: `Coba lagi dalam ${formatSeconds(lock.seconds_remaining)}.`,
          variant: 'destructive',
        });
        setBusy(false);
        return;
      }

      // 2) Resolve email if user typed phone or username
      let loginEmail = identifier.trim();
      if (!loginEmail.includes('@')) {
        const looksPhone = /^[0-9+\s\-()]+$/.test(loginEmail);
        const arg = looksPhone ? normalizePhone(loginEmail) : loginEmail;
        const { data, error } = await supabase.rpc('email_for_identifier' as never, { _identifier: arg } as never);
        if (error) throw error;
        if (!data) {
          await recordAttempt(lockKey, false);
          toast({ title: 'Akun tidak ditemukan', description: 'Email, nomor HP, atau username belum terdaftar.', variant: 'destructive' });
          setBusy(false);
          return;
        }
        loginEmail = data as string;
      }

      // 3) Attempt sign-in
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) {
        await recordAttempt(lockKey, false);
        const after = await checkLock(lockKey);
        if (after.locked) {
          setLockSeconds(after.seconds_remaining);
          toast({
            title: 'Akun dikunci sementara',
            description: `Terlalu banyak percobaan gagal. Coba lagi dalam ${formatSeconds(after.seconds_remaining)}.`,
            variant: 'destructive',
          });
        } else {
          const remaining = Math.max(0, 5 - after.fail_count);
          toast({
            title: 'Gagal masuk',
            description: `${error.message}. Sisa percobaan: ${remaining}.`,
            variant: 'destructive',
          });
        }
        setBusy(false);
        return;
      }

      await recordAttempt(lockKey, true);
      persistRememberFlag(remember);
      toast({ title: 'Berhasil masuk', description: remember ? 'Sesi diingat di perangkat ini.' : 'Sesi hanya berlaku selama browser terbuka.' });
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
      persistRememberFlag(remember);
      toast({ title: 'Akun dibuat', description: 'Anda otomatis masuk.' });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mendaftar';
      toast({ title: 'Gagal mendaftar', description: msg, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const isLocked = lockSeconds > 0;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={logoImg} alt="Logo" className="w-14 h-14 rounded-full ring-2 ring-primary/40" />
          <h1 className="text-2xl font-bold text-foreground">{mode === 'login' ? 'Masuk' : 'Daftar Akun'}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'Masuk dengan email, nomor HP, atau username.' : 'Buat akun dengan email & nomor HP.'}
          </p>
        </div>

        {isLocked && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Login dikunci sementara</p>
              <p className="text-xs opacity-90">Coba lagi dalam {formatSeconds(lockSeconds)}.</p>
            </div>
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Email, Nomor HP, atau Username</Label>
              <Input
                id="identifier"
                placeholder="email@mail.com / 08123456789 / username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                disabled={isLocked}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Sandi</Label>
                <button
                  type="button"
                  onClick={() => { setForgotIdentifier(identifier || ''); setForgotNewPw(''); setForgotNewPw2(''); setForgotOpen(true); }}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Lupa sandi?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Sandi apa pun (mis. 123456)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={isLocked}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} disabled={isLocked} />
              <span>Ingat saya di perangkat ini (30 hari)</span>
            </label>
            <Button type="submit" className="w-full" disabled={busy || isLocked}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogIn className="w-4 h-4 mr-2" />}
              {isLocked ? `Tunggu ${formatSeconds(lockSeconds)}` : 'Masuk'}
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
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
              <span>Ingat saya di perangkat ini (30 hari)</span>
            </label>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
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

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Ganti Sandi</DialogTitle>
            <DialogDescription className="text-xs">
              Masukkan email, nomor HP, atau username akun Anda lalu sandi baru. Sandi langsung berubah tanpa OTP/email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="forgot-id" className="text-xs">Email / No HP / Username</Label>
              <Input
                id="forgot-id"
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
                placeholder="email@mail.com / 0812... / username"
                autoComplete="username"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="forgot-pw" className="text-xs">Sandi Baru (min. 6 karakter)</Label>
              <Input
                id="forgot-pw"
                type="password"
                value={forgotNewPw}
                onChange={(e) => setForgotNewPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="forgot-pw2" className="text-xs">Ulangi Sandi Baru</Label>
              <Input
                id="forgot-pw2"
                type="password"
                value={forgotNewPw2}
                onChange={(e) => setForgotNewPw2(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setForgotOpen(false)} disabled={forgotBusy}>Batal</Button>
            <Button
              onClick={async () => {
                const id = forgotIdentifier.trim();
                if (!id) { toast({ title: 'Identitas wajib diisi', variant: 'destructive' }); return; }
                if (forgotNewPw.length < 6) { toast({ title: 'Sandi minimal 6 karakter', variant: 'destructive' }); return; }
                if (forgotNewPw !== forgotNewPw2) { toast({ title: 'Konfirmasi sandi tidak cocok', variant: 'destructive' }); return; }
                setForgotBusy(true);
                try {
                  const { data, error } = await supabase.functions.invoke('self-reset-password', {
                    body: { identifier: id, password: forgotNewPw },
                  });
                  if (error) throw error;
                  if ((data as { error?: string })?.error) throw new Error((data as { message?: string }).message || 'Gagal mengganti sandi');
                  toast({ title: 'Sandi berhasil diganti', description: 'Silakan login dengan sandi baru.' });
                  setForgotOpen(false);
                  setPassword(forgotNewPw);
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : 'Gagal mengganti sandi';
                  toast({ title: 'Gagal', description: msg, variant: 'destructive' });
                } finally {
                  setForgotBusy(false);
                }
              }}
              disabled={forgotBusy}
            >
              {forgotBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
              Ganti Sandi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
