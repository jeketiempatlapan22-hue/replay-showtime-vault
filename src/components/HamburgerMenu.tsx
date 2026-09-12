import { useEffect, useState } from 'react';
import { Menu, X, Home, MessageCircle, Phone, Sun, Moon, Radio, LogIn, LogOut, User as UserIcon, Crown, BookOpen, Clapperboard, Tv } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import logoImg from '@/assets/logo.png';
import InstallAppButton from '@/components/InstallAppButton';

interface HamburgerMenuProps {
  whatsappNumber: string;
  whatsappLink: string;
  lightMode: boolean;
  onToggleMode: () => void;
  visible?: boolean;
}

export default function HamburgerMenu({ whatsappNumber, whatsappLink, lightMode, onToggleMode, visible = true }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false);
  const [liveOn, setLiveOn] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: 'Berhasil keluar' });
    setOpen(false);
  };

  // Kunci scroll body, tutup dengan tombol Esc, dan tombol "kembali" perangkat.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onPop = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.history.pushState({ menu: true }, '');
    window.addEventListener('popstate', onPop);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      if (window.history.state?.menu) window.history.back();
    };
  }, [open]);

  useEffect(() => {
    const fetch = () => supabase.rpc('get_live_status').then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setLiveOn(!!row?.enabled);
    });
    fetch();
    const ch = supabase.channel('hamburger-live-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_config_private' }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <>
      {/* Top bar with hamburger + logo */}
      <div className={`fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 transition-all duration-300 ${visible || open ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground hover:text-primary shrink-0"
          onClick={() => setOpen(true)}
        >
          <Menu className="w-6 h-6" />
        </Button>
        <div className="flex items-center gap-1">
          <InstallAppButton variant="icon" />
          <img src={logoImg} alt="RealTime48" className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/50 shadow-lg shadow-primary/20 hover:ring-primary hover:scale-110 transition-all duration-300" />
        </div>
      </div>

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setOpen(false)}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 h-[100dvh] w-[82vw] max-w-xs z-50 bg-card border-r border-border shadow-2xl flex flex-col transform transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full pointer-events-none'}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="RealTime48" className="w-8 h-8 rounded-full object-cover" />
            <h2 className="text-lg font-bold text-primary font-sans">Menu</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Tutup menu">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2 bg-card">
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <Home className="w-5 h-5 text-primary" />
            <span className="font-medium">Beranda</span>
          </Link>

          <Link
            to="/shows"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <Clapperboard className="w-5 h-5 text-primary" />
            <span className="font-medium">Show</span>
          </Link>


          <Link
            to="/live"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <Radio className={`w-5 h-5 ${liveOn ? 'text-red-500' : 'text-primary'}`} />
            <span className="font-medium flex-1">Live</span>
            {liveOn && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                ON AIR
              </span>
            )}
          </Link>

          <Link
            to="/membership"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <Crown className="w-5 h-5 text-primary" />
            <span className="font-medium">Membership</span>
          </Link>

          <Link
            to="/profil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <UserIcon className="w-5 h-5 text-primary" />
            <span className="font-medium">Profil</span>
          </Link>



          <Link
            to="/panduan"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <BookOpen className="w-5 h-5 text-primary" />
            <span className="font-medium">Panduan</span>
          </Link>


          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
            >
              <Phone className="w-5 h-5 text-primary" />
              <div>
                <span className="font-medium block">Hubungi Admin</span>
                <span className="text-xs text-muted-foreground">{whatsappNumber}</span>
              </div>
            </a>
          )}

          {whatsappLink && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
            >
              <MessageCircle className="w-5 h-5 text-primary" />
              <span className="font-medium">Saluran WhatsApp</span>
            </a>
          )}

          <div className="pt-2 mt-2 border-t border-border">
            <InstallAppButton variant="menu" onDone={() => setOpen(false)} />
          </div>

          <div className="pt-2 mt-2 border-t border-border">
            {user ? (
              <>
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground">
                  <UserIcon className="w-5 h-5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium block truncate">{user.email}</span>
                    <span className="text-xs text-muted-foreground">Sudah masuk</span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
                >
                  <LogOut className="w-5 h-5 text-primary" />
                  <span className="font-medium">Keluar</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => { setOpen(false); navigate('/auth'); }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
              >
                <LogIn className="w-5 h-5 text-primary" />
                <span className="font-medium">Masuk / Daftar</span>
              </button>
            )}
          </div>
        </nav>

        {/* Dark/Light toggle at bottom */}
        <div className="shrink-0 p-4 border-t border-border bg-card pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            onClick={onToggleMode}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            {lightMode ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
            <span className="font-medium">{lightMode ? 'Mode Gelap' : 'Mode Terang'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
