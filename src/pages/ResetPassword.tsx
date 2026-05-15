import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import logoImg from '@/assets/logo.png';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase auto-handles the recovery hash in URL via detectSessionInUrl
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  const submit = async () => {
    if (pwd.length < 6) { toast({ title: 'Sandi minimal 6 karakter', variant: 'destructive' }); return; }
    if (pwd !== pwd2) { toast({ title: 'Konfirmasi sandi tidak cocok', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      toast({ title: 'Sandi berhasil diganti', description: 'Silakan masuk dengan sandi baru.' });
      await supabase.auth.signOut();
      navigate('/auth', { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal mengganti sandi';
      toast({ title: 'Gagal', description: msg, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={logoImg} alt="Logo" className="w-14 h-14 rounded-full ring-2 ring-primary/40" />
          <h1 className="text-2xl font-bold text-foreground">Reset Sandi</h1>
          <p className="text-sm text-muted-foreground">Buat sandi baru untuk akun Anda.</p>
        </div>

        {!ready ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Memvalidasi tautan reset...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Sandi baru</Label>
              <div className="relative">
                <Input
                  type={show ? 'text' : 'password'}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Tampilkan sandi"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Ulangi sandi baru</Label>
              <Input
                type={show ? 'text' : 'password'}
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                placeholder="Ulangi sandi"
                autoComplete="new-password"
              />
            </div>
            <Button onClick={submit} disabled={busy} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
              Simpan Sandi Baru
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
