import { useEffect, useRef, useState } from 'react';
import { Send, Pin, PinOff, Trash2, MessageCircle, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  const listRef = useRef<HTMLDivElement>(null);

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
    setMessages(((list || []) as Msg[]).reverse());
  };

  useEffect(() => {
    refresh();
    const ch = supabase.channel('live-chat-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_messages' }, () => { refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const msg = text.trim().slice(0, 500);
    if (!msg || sending) return;
    setSending(true);
    const display = (name.trim() || 'Anonim').slice(0, 40);
    localStorage.setItem('replaytime-name', display);
    await supabase.from('live_messages').insert({
      browser_id: getBrowserId(),
      name: isAdmin ? (adminUsername || 'Admin') : display,
      message: msg,
      is_admin: isAdmin,
      pinned: false,
    });
    setText('');
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

  return (
    <div className="rounded-2xl bg-card/80 border border-border overflow-hidden flex flex-col h-[60vh] min-h-[380px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/40">
        <MessageCircle className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Live Chat</span>
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
        {!isAdmin && (
          <Input
            value={name} onChange={e => setName(e.target.value)} placeholder="Nama (opsional)"
            className="h-8 text-xs bg-background"
          />
        )}
        <div className="flex gap-1.5">
          <Input
            value={text} onChange={e => setText(e.target.value.slice(0, 500))}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ketik pesan..." className="h-9 text-sm bg-background"
          />
          <Button size="icon" onClick={send} disabled={sending || !text.trim()} className="h-9 w-9 shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
