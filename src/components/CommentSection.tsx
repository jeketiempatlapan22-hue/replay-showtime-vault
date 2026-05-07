import { useState, useEffect } from 'react';
import { Send, MessageCircle, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface Comment {
  id: string;
  name: string;
  message: string;
  created_at: string;
}

interface CommentSectionProps {
  replayId: string;
}

export default function CommentSection({ replayId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [name, setName] = useState(() => localStorage.getItem('replaytime-name') || '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' });
      setIsAdmin(data === true);
    };
    checkAdmin();
  }, []);

  // Live chat enabled flag (global setting)
  useEffect(() => {
    const fetchFlag = async () => {
      const { data } = await supabase.from('site_settings').select('value').eq('key', 'live_chat_enabled').maybeSingle();
      setChatEnabled(data?.value !== 'false');
    };
    fetchFlag();
    const ch = supabase
      .channel('site-settings-livechat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings', filter: 'key=eq.live_chat_enabled' }, (payload) => {
        const row = (payload.new || payload.old) as { value?: string };
        setChatEnabled(row?.value !== 'false');
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('replay_id', replayId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setComments([...data].reverse());
  };

  useEffect(() => {
    fetchComments();

    const channel = supabase
      .channel(`comments-${replayId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `replay_id=eq.${replayId}` }, (payload) => {
        setComments(prev => {
          const next = [...prev, payload.new as Comment];
          return next.length > 30 ? next.slice(next.length - 30) : next;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments', filter: `replay_id=eq.${replayId}` }, (payload) => {
        const deletedId = (payload.old as { id?: string }).id;
        if (deletedId) setComments(prev => prev.filter(c => c.id !== deletedId));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [replayId]);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    const displayName = name.trim() || 'Anonim';
    localStorage.setItem('replaytime-name', displayName);

    await supabase.from('comments').insert({
      replay_id: replayId,
      name: displayName,
      message: message.trim(),
    });

    setMessage('');
    setSending(false);
  };

  const handleDelete = async (commentId: string) => {
    await supabase.from('comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Baru saja';
    if (mins < 60) return `${mins} menit lalu`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} jam lalu`;
    const days = Math.floor(hours / 24);
    return `${days} hari lalu`;
  };

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-lg font-semibold font-sans text-foreground">
        <MessageCircle className="w-5 h-5 text-primary" />
        Komentar ({comments.length})
      </h3>

      {/* Comment list */}
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Belum ada komentar. Jadilah yang pertama!</p>
        )}
        {comments.map(c => (
          <div key={c.id} className="p-3 rounded-lg bg-secondary/50 border border-border animate-fade-up group" style={{ animationFillMode: 'forwards' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">{c.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/20 text-destructive"
                    title="Hapus komentar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{c.message}</p>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="space-y-2">
        <Input
          placeholder="Nama kamu (opsional)"
          value={name}
          onChange={e => setName(e.target.value)}
          className="bg-card/60 border-border text-sm"
        />
        <div className="flex gap-2">
          <Input
            placeholder="Tulis komentar..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            className="bg-card/60 border-border"
          />
          <Button size="icon" onClick={handleSend} disabled={sending || !message.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
