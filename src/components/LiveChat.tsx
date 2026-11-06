import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Pin, PinOff, Trash2, MessageCircle, UserCog, Reply, X, Ban, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/backend';
import { getBrowserId } from '@/lib/browserId';
import { toast } from '@/hooks/use-toast';
import { chatBackend, chatPermissions, currentChatAccess, visibleSender, type ChatSender, type ChatRole } from '@/lib/liveChatAccess';
import ChatSenderDialog from '@/components/ChatSenderDialog';

interface Msg {
  id: string;
  name: string;
  message: string;
  is_admin: boolean;
  sender_role?: ChatRole;
  user_id?: string | null;
  pinned: boolean;
  created_at: string;
  browser_id?: string;
  reply_to_id?: string | null;
  show_id?: string | null;
}

interface LiveChatProps {
  lite?: boolean;
  /** Chat dipisah per show; tanpa id = chat umum (legacy). */
  showId?: string;
}


export default function LiveChat({ lite = false, showId = '' }: LiveChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pinned, setPinned] = useState<Msg[]>([]);
  const [name, setName] = useState(() => localStorage.getItem('replaytime-name') || '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Msg | null>(null);
  const [sender, setSender] = useState<ChatSender | null>(null);
  const [senderLoading, setSenderLoading] = useState(false);
  const [senderError, setSenderError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const senderRequest = useRef(0);
  const permissions = chatPermissions(isAdmin, isModerator);
  const canModerate = permissions.moderate;
  const [adminUsername, setAdminUsername] = useState('Admin');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const sentTimestampsRef = useRef<number[]>([]);

  const myBrowserId = getBrowserId();
  const iAmBlocked = blockedSet.has(myBrowserId) && !isAdmin;
  const messageLimit = lite ? 25 : 50;

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
    let active = true;
    let roleRequest = 0;
    const checkRoles = async (userId?: string) => {
      const request = ++roleRequest;
      setIsAdmin(false); setIsModerator(false);
      if (!userId) return;
      const [admin, moderator] = await Promise.all([
        chatBackend.rpc('has_role', { _user_id: userId, _role: 'admin' }),
        chatBackend.rpc('has_role', { _user_id: userId, _role: 'moderator' }),
      ]);
      if (!active || request !== roleRequest) return;
      setIsAdmin(admin.data === true); setIsModerator(moderator.data === true);
    };
    supabase.auth.getSession().then(({ data }) => checkRoles(data.session?.user.id));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { if (active) checkRoles(session?.user.id); }, 0);
    });
    supabase.from('site_settings').select('value').eq('key', 'admin_username').maybeSingle()
      .then(({ data }) => { if (data?.value) setAdminUsername(data.value); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  // Chat dipisah per show: hanya pesan milik show ini yang tampil.
  const inScope = useCallback((m: Msg) => (showId ? m.show_id === showId : !m.show_id), [showId]);

  const refresh = useCallback(async () => {
    const scoped = (pinnedVal: boolean) => {
      let q = supabase.from('live_messages').select('*').eq('pinned', pinnedVal).order('created_at', { ascending: false });
      q = showId ? q.eq('show_id', showId) : q.is('show_id', null);
      return pinnedVal ? q : q.limit(messageLimit);
    };
    const [{ data: pins }, { data: list }, { data: blocks }] = await Promise.all([
      scoped(true),
      scoped(false),
      // Admin perlu daftar lengkap block untuk badge moderasi; viewer biasa cukup cek dirinya sendiri.
      canModerate
        ? supabase.from('chat_blocks').select('browser_id')
        : supabase.from('chat_blocks').select('browser_id').eq('browser_id', myBrowserId),
    ]);
    setPinned((pins || []) as Msg[]);
    setMessages(((list || []) as Msg[]).slice().reverse());
    setBlockedSet(new Set(((blocks || []) as { browser_id: string }[]).map(b => b.browser_id)));
    stickToBottomRef.current = true;
  }, [canModerate, messageLimit, myBrowserId, showId]);

  useEffect(() => {
    refresh();
    const ch = supabase.channel(`live-chat-${showId || 'umum'}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_messages' }, (payload) => {
        const m = payload.new as Msg;
        if (!inScope(m)) return;
        if (m.pinned) setPinned(prev => [m, ...prev.filter(x => x.id !== m.id)]);
        else setMessages(prev => {
          const next = [...prev.filter(x => x.id !== m.id), m];
          return next.length > messageLimit ? next.slice(next.length - messageLimit) : next;
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_messages' }, (payload) => {
        const m = payload.new as Msg;
        if (!inScope(m)) return;
        setPinned(prev => m.pinned ? [m, ...prev.filter(x => x.id !== m.id)] : prev.filter(x => x.id !== m.id));
        setMessages(prev => {
          if (m.pinned) return prev.filter(x => x.id !== m.id);
          const exists = prev.some(x => x.id === m.id);
          if (exists) return prev.map(x => x.id === m.id ? m : x);
          const next = [...prev, m];
          return next.length > messageLimit ? next.slice(next.length - messageLimit) : next;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_messages' }, (payload) => {
        const id = (payload.old as { id?: string })?.id;
        if (!id) return;
        setMessages(prev => prev.filter(x => x.id !== id));
        setPinned(prev => prev.filter(x => x.id !== id));
      })
      .on(
        'postgres_changes',
        canModerate
          ? { event: '*', schema: 'public', table: 'chat_blocks' }
          : { event: '*', schema: 'public', table: 'chat_blocks', filter: `browser_id=eq.${myBrowserId}` },
        async () => {
          const q = canModerate
            ? supabase.from('chat_blocks').select('browser_id')
            : supabase.from('chat_blocks').select('browser_id').eq('browser_id', myBrowserId);
          const { data } = await q;
          setBlockedSet(new Set(((data || []) as { browser_id: string }[]).map(b => b.browser_id)));
        }
      )
      .subscribe((status) => { if (status === 'SUBSCRIBED') refresh(); });
    // Cadangan bila koneksi realtime terputus: segarkan chat berkala & saat tab aktif lagi.
    const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 15000);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(poll); document.removeEventListener('visibilitychange', onVis); supabase.removeChannel(ch); };
  }, [canModerate, messageLimit, myBrowserId, refresh, showId, inScope]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distFromBottom < 60;
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottomRef.current) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages.length]);

  // Lookup pesan asli untuk reply preview
  const messageMap = useMemo(() => {
    const map = new Map<string, Msg>();
    [...messages, ...pinned].forEach(m => map.set(m.id, m));
    return map;
  }, [messages, pinned]);

  const scrollToMessage = (id: string) => {
    const el = document.getElementById(`chatmsg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 1500);
  };

  // Rate limit
  const RL_MIN_GAP_MS = 2000;
  const RL_WINDOW_MS = 60_000;
  const RL_MAX_IN_WINDOW = 8;
  const RL_KEY = `replaytime-chat-ts-${myBrowserId}`;
  const RL_LAST_MSGS_KEY = `replaytime-chat-last-${myBrowserId}`;

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
    if (iAmBlocked) return;
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
    stickToBottomRef.current = true;
    try {
    const { data, error } = await supabase.functions.invoke('live-chat-send', { body: {
      browser_id: myBrowserId,
      name: isAdmin ? (adminUsername || 'Admin') : display,
      message: msg,
      reply_to_id: replyTo?.id ?? null,
      show_id: showId || null,
      ...currentChatAccess(),
    } });
    if (error || data?.ok !== true || !data?.message?.id) {
      let description = data?.error || 'Periksa koneksi lalu coba lagi.';
      if (error && 'context' in error && error.context instanceof Response) {
        const response = await error.context.clone().json().catch(() => null);
        description = response?.error || description;
      }
      throw new Error(description);
    }
    {
      recordSent(msg);
      setText('');
      setReplyTo(null);
      // Tampilkan langsung walau event realtime terlambat.
      const sent = data.message as Msg;
      setMessages(prev => [...prev.filter(m => m.id !== sent.id), sent].slice(-messageLimit));
    }
    } catch (error) {
      toast({ title: 'Pesan gagal terkirim', description: error instanceof Error ? error.message : 'Periksa koneksi lalu coba lagi.', variant: 'destructive' });
    } finally { setSending(false); }
  };

  const runAction = async (action: () => PromiseLike<{ error: { message: string } | null; data?: unknown }>) => {
    if (!canModerate || actionBusy) return false;
    setActionBusy(true);
    try {
      const { error, data } = await action();
      if (error) throw new Error(error.message);
      if (data && typeof data === 'object' && 'ok' in data && data.ok === false) throw new Error('Aksi ditolak server.');
      await refresh();
      return true;
    } catch (error) {
      toast({ title: 'Aksi gagal', description: error instanceof Error ? error.message : 'Coba lagi.', variant: 'destructive' });
      return false;
    } finally { setActionBusy(false); }
  };
  const togglePin = (m: Msg) => { if (isAdmin) return runAction(() => supabase.from('live_messages').update({ pinned: !m.pinned }).eq('id', m.id)); };
  const remove = async (m: Msg) => {
    const ok = await runAction(() => chatBackend.rpc('mod_delete_message', { _message_id: m.id }));
    if (ok && selectedMessage?.id === m.id) { senderRequest.current++; setSelectedMessage(null); setSender(null); }
  };
  const blockUser = async (m: Msg, unblock = false) => {
    if (!m.browser_id) return;
    const ok = await runAction(() => unblock
      ? chatBackend.rpc('mod_unblock_chat', { _browser_id: m.browser_id || '' })
      : chatBackend.rpc('mod_block_chat', { _browser_id: m.browser_id || '', _name: m.name, _reason: '' }));
    if (ok) setSender(prev => prev && prev.browser_id === m.browser_id ? { ...prev, is_blocked: !unblock } : prev);
  };
  const openSender = async (m: Msg) => {
    if (!permissions.inspect) return;
    const request = ++senderRequest.current;
    setSelectedMessage(m); setSender(null); setSenderError(''); setSenderLoading(true);
    try {
      const { data, error } = await chatBackend.rpc('admin_get_chat_sender', { _message_id: m.id });
      if (error || !data) throw new Error(error?.message || 'Info pengirim belum tersedia untuk pesan ini.');
      if (senderRequest.current === request) setSender(visibleSender(data, isAdmin));
    } catch (error) {
      if (senderRequest.current === request) setSenderError(error instanceof Error ? error.message : 'Info pengirim gagal dimuat.');
    } finally { if (senderRequest.current === request) setSenderLoading(false); }
  };
  const changeModerator = async () => {
    if (!isAdmin || !sender?.user_id || !selectedMessage) return;
    const ok = await runAction(() => chatBackend.rpc('admin_set_moderator', { _user_id: sender.user_id || '', _on: !sender.is_moderator }));
    if (ok) await openSender(selectedMessage);
  };

  const roleBadge = (m: Msg) => (m.sender_role === 'admin' || m.is_admin)
    ? <span className="text-[9px] bg-primary/15 text-primary px-1 py-0.5 rounded">🛡️ Admin</span>
    : m.sender_role === 'moderator' ? <span className="text-[9px] chat-moderator-badge px-1 py-0.5 rounded">🔰 Moderator</span> : null;
  const senderName = (m: Msg) => permissions.inspect
    ? <Button variant="link" className="h-auto p-0 text-sm font-semibold text-primary whitespace-normal text-left break-words max-w-full" onClick={() => openSender(m)}>{m.name}</Button>
    : <span className={`font-semibold break-words ${(m.sender_role === 'admin' || m.is_admin) ? 'text-primary' : 'chat-user-name'}`}>{m.name}</span>;

  const time = (s: string) => {
    const d = new Date(s);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const canChat = (isAdmin || !!name.trim()) && !iAmBlocked;

  return (
    <div className="rounded-2xl bg-card/80 border border-border overflow-hidden flex flex-col h-[70vh] min-h-[460px] max-h-[760px]">
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
        <div className="px-3 py-2.5 bg-primary/15 border-b-2 border-primary/50 space-y-2 max-h-36 overflow-y-auto shadow-sm">
          {pinned.map(m => (
            <div key={m.id} className="flex items-start gap-2 text-sm leading-snug">
              <Pin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {senderName(m)} {roleBadge(m)}
                <span className="ml-1 font-medium text-foreground break-words">{m.message}</span>
              </div>
              {canModerate && (
                <div className="flex gap-1 shrink-0">
                  {isAdmin && <Button variant="ghost" size="icon" title="Lepas pin" aria-label="Lepas pin" disabled={actionBusy} onClick={() => togglePin(m)} className="h-6 w-6"><PinOff className="w-3 h-3" /></Button>}
                  <Button variant="ghost" size="icon" title="Hapus pesan" aria-label="Hapus pesan" disabled={actionBusy} onClick={() => remove(m)} className="h-6 w-6 text-destructive"><Trash2 className="w-3 h-3" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Messages — gaya YouTube/TikTok/IG, tanpa avatar, terbaru di bawah */}
      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Belum ada pesan.</p>}
        {messages.map(m => {
          const isUserBlocked = !!m.browser_id && blockedSet.has(m.browser_id);
          const replied = m.reply_to_id ? messageMap.get(m.reply_to_id) : null;
          return (
            <div
              id={`chatmsg-${m.id}`}
              key={m.id}
              className={`group px-3 py-1 transition-colors ${highlightId === m.id ? 'bg-primary/20' : 'hover:bg-secondary/40'} rounded-md mx-1`}
            >
              {replied && (
                <button
                  onClick={() => scrollToMessage(replied.id)}
                  className="block w-full text-left mb-0.5 pl-2 border-l-2 border-primary/60 text-[10px] text-muted-foreground truncate hover:text-foreground"
                >
                  ↪ <span className="font-medium">@{replied.name}</span>: {replied.message}
                </button>
              )}
              {m.reply_to_id && !replied && (
                <div className="mb-0.5 pl-2 border-l-2 border-muted text-[10px] text-muted-foreground/70 italic">↪ Pesan tidak tersedia</div>
              )}
              <div className="flex items-baseline gap-1.5 flex-wrap text-sm leading-snug">
                {senderName(m)} {roleBadge(m)}
                {isUserBlocked && !m.is_admin && (
                  <span className="text-[9px] uppercase bg-destructive/80 text-destructive-foreground px-1 py-0.5 rounded">Diblokir</span>
                )}
                <span className={m.is_admin ? 'text-foreground/95 break-words' : 'text-muted-foreground break-words'}>{m.message}</span>
                <span className="text-[10px] text-muted-foreground/60 ml-1">{time(m.created_at)}</span>
                <span className="ml-auto md:opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex gap-1.5 items-center">
                  {!m.is_admin && !iAmBlocked && (
                    <button title="Balas" onClick={() => { setReplyTo(m); }} className="text-muted-foreground hover:text-primary">
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canModerate && (
                    <>
                      {isAdmin && <Button variant="ghost" size="icon" title="Pin" aria-label="Pin pesan" disabled={actionBusy} onClick={() => togglePin(m)} className="h-6 w-6"><Pin className="w-3.5 h-3.5" /></Button>}
                      {!m.is_admin && m.sender_role !== 'admin' && m.browser_id && (
                        isUserBlocked ? (
                          <Button variant="ghost" size="icon" title="Buka blokir" aria-label="Buka blokir" disabled={actionBusy} onClick={() => blockUser(m, true)} className="h-6 w-6 text-primary"><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                        ) : (
                          <Button variant="ghost" size="icon" title="Blokir user" aria-label="Blokir user" disabled={actionBusy} onClick={() => blockUser(m)} className="h-6 w-6 text-destructive"><Ban className="w-3.5 h-3.5" /></Button>
                        )
                      )}
                      <Button variant="ghost" size="icon" title="Hapus pesan" aria-label="Hapus pesan" disabled={actionBusy} onClick={() => remove(m)} className="h-6 w-6 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t border-border p-2 space-y-1.5 bg-secondary/30">
        {iAmBlocked && (
          <div className="text-[11px] bg-destructive/15 text-destructive border border-destructive/40 rounded px-2 py-1.5">
            Kamu diblokir oleh admin dari live chat.
          </div>
        )}
        {!iAmBlocked && !canChat && (
          <button
            onClick={openChangeName}
            className="w-full text-[11px] text-primary underline-offset-2 hover:underline text-left"
          >
            Masukkan nama dulu untuk mengirim pesan →
          </button>
        )}
        {replyTo && (
          <div className="flex items-center gap-2 pl-2 pr-1 py-1 bg-primary/10 border-l-2 border-primary rounded text-[11px]">
            <Reply className="w-3 h-3 text-primary shrink-0" />
            <div className="flex-1 min-w-0 truncate">
              Membalas <span className="font-semibold text-primary">@{replyTo.name}</span>: <span className="text-muted-foreground">{replyTo.message.slice(0, 60)}</span>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-3 h-3" /></button>
          </div>
        )}
        <div className="flex gap-1.5">
          <Input
            value={text}
            onChange={e => setText(e.target.value.slice(0, 500))}
            onKeyDown={e => e.key === 'Enter' && canChat && cooldownLeft === 0 && send()}
            onFocus={() => { if (!iAmBlocked && !canChat) openChangeName(); }}
            placeholder={iAmBlocked ? 'Diblokir admin' : (cooldownLeft > 0 ? `Tunggu ${cooldownLeft} detik…` : (canChat ? (replyTo ? `Balas @${replyTo.name}…` : 'Ketik pesan...') : 'Masukkan nama untuk berinteraksi'))}
            className="h-9 text-sm bg-background"
            disabled={!canChat || cooldownLeft > 0}
          />
          <Button size="icon" onClick={send} disabled={sending || !text.trim() || !canChat || cooldownLeft > 0} className="h-9 w-9 shrink-0">
            {cooldownLeft > 0 ? <span className="text-[10px] font-bold">{cooldownLeft}</span> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <ChatSenderDialog open={!!selectedMessage && permissions.inspect} loading={senderLoading} busy={actionBusy} error={senderError} sender={sender ? visibleSender(sender, isAdmin) : null} isAdmin={isAdmin}
        onClose={() => { senderRequest.current++; setSelectedMessage(null); setSender(null); }} onModerator={changeModerator}
        onDelete={() => { if (selectedMessage) remove(selectedMessage); }}
        onBlock={() => { if (selectedMessage && sender?.browser_id) blockUser({ ...selectedMessage, browser_id: sender.browser_id }, sender.is_blocked); }} />

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
