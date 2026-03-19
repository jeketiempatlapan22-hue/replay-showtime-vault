import { useState } from 'react';
import { Menu, X, Home, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HamburgerMenuProps {
  whatsappNumber: string;
  whatsappLink: string;
}

export default function HamburgerMenu({ whatsappNumber, whatsappLink }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 z-30 text-foreground hover:text-primary"
        onClick={() => setOpen(true)}
      >
        <Menu className="w-6 h-6" />
      </Button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      )}

      {/* Drawer */}
      <div className={`fixed top-0 left-0 h-full w-72 z-50 bg-card border-r border-border transform transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-primary font-sans">Menu</h2>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <nav className="p-4 space-y-2">
          <a
            href="https://realstream48.lovable.app"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            <Home className="w-5 h-5 text-primary" />
            <span className="font-medium">Beranda</span>
          </a>

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
        </nav>
      </div>
    </>
  );
}
