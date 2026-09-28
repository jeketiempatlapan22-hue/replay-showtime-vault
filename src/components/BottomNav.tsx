import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Clapperboard, Tv, Coins, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export default function BottomNav() {
  const location = useLocation();

  // Hide before mounting auth/balance listeners on immersive routes.
  if (/^\/(adpan|auth|live)/.test(location.pathname)) return null;

  return <BottomNavContent locationPath={location.pathname} />;
}

function BottomNavContent({ locationPath }: { locationPath: string }) {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!user) { setBalance(null); return; }
    let mounted = true;
    const refresh = async () => {
      const { data } = await supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle();
      if (mounted) setBalance(Number(data?.balance ?? 0));
    };
    refresh();
    const ch = supabase
      .channel(`bal-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coin_balances', filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe();
    window.addEventListener('focus', refresh);
    return () => { mounted = false; supabase.removeChannel(ch); window.removeEventListener('focus', refresh); };
  }, [user]);

  const items = [
    { to: '/', label: 'Replay', Icon: Clapperboard, match: (p: string) => p === '/' },
    { to: '/shows', label: 'Shows', Icon: Tv, match: (p: string) => p.startsWith('/shows') || p.startsWith('/show') },
    { to: '/koin', label: 'Koin', Icon: Coins, match: (p: string) => p.startsWith('/koin') },
    { to: user ? '/profil' : '/auth', label: user ? 'Akun' : 'Masuk', Icon: User, match: (p: string) => p.startsWith('/profil') || p.startsWith('/auth') },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-card/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {items.map(({ to, label, Icon, match }) => {
          const active = match(locationPath);
          return (
            <Link
              key={label}
              to={to}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {label === 'Koin' && balance != null && (
                  <span className="absolute -top-1.5 -right-3 min-w-[18px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center leading-none">
                    {balance > 999 ? '999+' : balance}
                  </span>
                )}
              </div>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
