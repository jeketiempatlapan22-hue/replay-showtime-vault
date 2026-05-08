import { useEffect, useRef, useState } from 'react';
import { Send, Pin, PinOff, Trash2, MessageCircle, ShieldCheck, UserCog } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';

interface Msg {
  id: string;
  name: string;
  message: string;
  is_admin: boolean;
  pinned: boolean;
  created_at: string;
}

export default function LiveChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pinned, setPinned] = useState<Msg[]>([]);
  const [name, setName] = useState(() => localStorage.getItem('replaytime-name') || '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUsername, setAdminUsername] = useState('Admin');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const sentTimestampsRef = useRef<number[]>([]);

  // Modal opens on demand when user tries to interact without a name.
  // (Username is required per browser before any chat interaction.)

  const saveName = () => {
    const v = nameInput.trim();
    if (v.length < 2) { setNameError('Nama minimal 2 karakter.'); return; }
    if (v.length > 40) { setNameError('Nama maksimal 40 karakter.'); return; }
    setName(v);
    try { localStorage.setItem('replaytime-name', v); } catch { /* ignore */ }
    setNameError('');
    setNameModalOpen(false);
  };
  const openChangeName = () => { setNameInput(name); setNameError(''); setNameModalOpen(true); };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' });
      setIsAdmin(data === true);
    });
    supabase.from('site_settings').select('value').eq('key', 'admin_username').maybeSingle()
      .then(({ data }) => { if (data?.value) setAdminUsername(data.value); });
  }, []);

  const refresh = async () => {
    const [{ data: pins }, { data: list }] = await Promise.all([
      supabase.from('live_messages').select('*').eq('pinned', true).order('created_at', { ascending: false }),
      supabase.from('live_messages').select('*').eq('pinned', false).order('created_at', { ascending: false }).limit(30),
    ]);
    setPinned((pins || []) as Msg[]);
    // Newest first — user sees latest without scrolling; scroll down for older messages.
    setMessages(((list || []) as Msg[]));
  };

  useEffect(() => {
    refresh();
    // Incrementally apply realtime payloads instead of refetching for each event.
    // With many concurrent viewers this reduces DB load by orders of magnitude.
    const ch = supabase.channel('live-chat-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_messages' }, (payload) => {
        const m = payload.new as Msg;
        if (m.pinned) setPinned(prev => [m, ...prev.filter(x => x.id !== m.id)]);
        else setMessages(prev => [m, ...prev.filter(x => x.id !== m.id)].slice(0, 30));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_messages' }, (payload) => {
        const m = payload.new as Msg;
        setPinned(prev => m.pinned ? [m, ...prev.filter(x => x.id !== m.id)] : prev.filter(x => x.id !== m.id));
        setMessages(prev => m.pinned ? prev.filter(x => x.id !== m.id) : prev.map(x => x.id === m.id ? m : x));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_messages' }, (payload) => {
        const id = (payload.old as { id?: string })?.id;
        if (!id) return;
        setMessages(prev => prev.filter(x => x.id !== id));
        setPinned(prev => prev.filter(x => x.id !== id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Newest message is at the top. If user is near top, keep them pinned to top so
    // the latest message is always visible. If they scrolled down to read older
    // messages, don't disturb their position.
    const nearTop = el.scrollTop < 40;
    if (nearTop) el.scrollTop = 0;
  }, [messages.length]);

  // Rate limit per browser (client-side, anti-spam):
  // - Min 2 detik antar pesan
  // - Maks 8 pesan per 60 detik
  // - Maks 3 pesan identik berturut-turut
  // Tidak berlaku untuk admin.
  const RL_MIN_GAP_MS = 2000;
  const RL_WINDOW_MS = 60_000;
  const RL_MAX_IN_WINDOW = 8;
  const RL_KEY = `replaytime-chat-ts-${getBrowserId()}`;
  const RL_LAST_MSGS_KEY = `replaytime-chat-last-${getBrowserId()}`;

  const checkRate = (msg: string): { ok: true } | { ok: false; reason: string; waitSec?: number } => {
    if (isAdmin) return { ok: true };
    let ts: number[] = sentTimestampsRef.current;
    if (ts.length === 0) {
      try { ts = JSON.parse(localStorage.getItem(RL_KEY) || '[]'); } catch { ts = []; }
    }
    const now = Date.now();
    ts = ts.filter(t => now - t < RL_WINDOW_MS);
    if (ts.length > 0 && now - ts[ts.length - 1] < RL_MIN_GAP_MS) {
      return { ok: false, reason: 'Tunggu sebentar sebelum kirim pesan lagi.', waitSec: Math.ceil((RL_MIN_GAP_MS - (now - ts[ts.length - 1])) / 1000) };
    }
    if (ts.length >= RL_MAX_IN_WINDOW) {
      const wait = Math.ceil((RL_WINDOW_MS - (now - ts[0])) / 1000);
      return { ok: false, reason: `Terlalu banyak pesan. Coba lagi dalam ${wait} detik.`, waitSec: wait };
    }
    let lastMsgs: string[] = [];
    try { lastMsgs = JSON.parse(localStorage.getItem(RL_LAST_MSGS_KEY) || '[]'); } catch { lastMsgs = []; }
    if (lastMsgs.length >= 3 && lastMsgs.slice(-3).every(m => m === msg)) {
      return { ok: false, reason: 'Hindari kirim pesan yang sama berulang kali.' };
    }
    return { ok: true };
  };

  const recordSent = (msg: string) => {
    const now = Date.now();
    const ts = [...sentTimestampsRef.current.filter(t => now - t < RL_WINDOW_MS), now];
    sentTimestampsRef.current = ts;
    try { localStorage.setItem(RL_KEY, JSON.stringify(ts)); } catch { /* ignore */ }
    let lastMsgs: string[] = [];
    try { lastMsgs = JSON.parse(localStorage.getItem(RL_LAST_MSGS_KEY) || '[]'); } catch { lastMsgs = []; }
    lastMsgs = [...lastMsgs, msg].slice(-5);
    try { localStorage.setItem(RL_LAST_MSGS_KEY, JSON.stringify(lastMsgs)); } catch { /* ignore */ }
  };

  const startCooldown = (sec: number) => {
    setCooldownLeft(sec);
    const tick = () => setCooldownLeft(prev => {
      if (prev <= 1) return 0;
      setTimeout(tick, 1000);
      return prev - 1;
    });
    if (sec > 0) setTimeout(tick, 1000);
  };

  const send = async () => {
    const msg = text.trim().slice(0, 500);
    if (!msg || sending) return;
    if (!isAdmin && !name.trim()) { openChangeName(); return; }
    const rl = checkRate(msg);
    if (rl.ok === false) {
      const waitSec = rl.waitSec;
      const reason = rl.reason;
      if (waitSec) startCooldown(waitSec);
      try {
        const { toast } = await import('@/hooks/use-toast');
        toast({ title: 'Pesan ditolak', description: reason, variant: 'destructive' });
      } catch { /* ignore */ }
      return;
    }
    setSending(true);
    const display = (name.trim() || 'Anonim').slice(0, 40);
    const { error } = await supabase.from('live_messages').insert({
      browser_id: getBrowserId(),
      name: isAdmin ? (adminUsername || 'Admin') : display,
      message: msg,
      is_admin: isAdmin,
      pinned: false,
    });
    if (!error) {
      recordSent(msg);
      setText('');
    }
    setSending(false);
  };

  const togglePin = async (m: Msg) => {
    if (!isAdmin) return;
    await supabase.from('live_messages').update({ pinned: !m.pinned }).eq('id', m.id);
  };

  const remove = async (m: Msg) => {
    if (!isAdmin) return;
    await supabase.from('live_messages').delete().eq('id', m.id);
  };

  const time = (s: string) => {
    const d = new Date(s);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const canChat = isAdmin || !!name.trim();

  return (
    <div className="rounded-2xl bg-card/80 border border-border overflow-hidden flex flex-col h-[60vh] min-h-[380px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/40">
        <MessageCircle className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Live Chat</span>
        {!isAdmin && name && (
          <button onClick={openChangeName} className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
            <UserCog className="w-3 h-3" /> {name}
          </button>
        )}
      </div>

      {/* Pinned banner */}
      {pinned.length > 0 && (
        <div className="px-3 py-2 bg-primary/10 border-b border-primary/30 space-y-1.5 max-h-32 overflow-y-auto">
          {pinned.map(m => (
            <div key={m.id} className="flex items-start gap-2 text-xs">
              <Pin className="w-3 h-3 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-primary">{m.name}</span>
                {m.is_admin && <span className="ml-1 text-[9px] uppercase bg-primary text-primary-foreground px-1 rounded">Admin</span>}
                <span className="ml-1 text-foreground/90 break-words">{m.message}</span>
              </div>
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => togglePin(m)} className="text-muted-foreground hover:text-foreground"><PinOff className="w-3 h-3" /></button>
                  <button onClick={() => remove(m)} className="text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Belum ada pesan.</p>}
        {messages.map(m => (
          <div key={m.id} className="text-xs group">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className={`font-semibold ${m.is_admin ? 'text-yellow-400' : 'text-foreground'}`}>{m.name}</span>
              {m.is_admin && (
                <span className="inline-flex items-center gap-0.5 text-[8px] uppercase bg-red-500/80 text-white px-1 py-0.5 rounded">
                  <ShieldCheck className="w-2.5 h-2.5" />Admin
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">{time(m.created_at)}</span>
              {isAdmin && (
                <span className="ml-auto opacity-0 group-hover:opacity-100 flex gap-1">
                  <button onClick={() => togglePin(m)} className="text-muted-foreground hover:text-primary"><Pin className="w-3 h-3" /></button>
                  <button onClick={() => remove(m)} className="text-destructive"><Trash2 className="w-3 h-3" /></button>
                </span>
              )}
            </div>
            <p className="text-foreground/90 break-words">{m.message}</p>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-border p-2 space-y-1.5 bg-secondary/30">
        {!canChat && (
          <button
            onClick={openChangeName}
            className="w-full text-[11px] text-primary underline-offset-2 hover:underline text-left"
          >
            Masukkan nama dulu untuk mengirim pesan →
          </button>
        )}
        <div className="flex gap-1.5">
          <Input
            value={text}
            onChange={e => setText(e.target.value.slice(0, 500))}
            onKeyDown={e => e.key === 'Enter' && canChat && cooldownLeft === 0 && send()}
            onFocus={() => { if (!canChat) openChangeName(); }}
            placeholder={cooldownLeft > 0 ? `Tunggu ${cooldownLeft} detik…` : (canChat ? 'Ketik pesan...' : 'Masukkan nama untuk berinteraksi')}
            className="h-9 text-sm bg-background"
            disabled={!canChat || cooldownLeft > 0}
          />
          <Button size="icon" onClick={send} disabled={sending || !text.trim() || !canChat || cooldownLeft > 0} className="h-9 w-9 shrink-0">
            {cooldownLeft > 0 ? <span className="text-[10px] font-bold">{cooldownLeft}</span> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Name modal */}
      <Dialog open={nameModalOpen} onOpenChange={(o) => { if (o || name.trim()) setNameModalOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Masukkan Nama</DialogTitle>
            <DialogDescription>Nama akan ditampilkan saat kamu berinteraksi di live chat. Wajib diisi tiap perangkat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={nameInput}
              onChange={(e) => { setNameInput(e.target.value.slice(0, 40)); setNameError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              placeholder="Nama kamu (2-40 karakter)"
              maxLength={40}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            <Button className="w-full" onClick={saveName} disabled={nameInput.trim().length < 2}>Simpan Nama</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
