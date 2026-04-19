import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Edit2, Key, Save, Palette, MessageCircle, LogOut, Eye, Send, List, Settings, ShieldCheck, Unlock as UnlockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { addReplay, deleteReplay, updateReplay, getReplays, getAllMasterPasswords, setMasterPassword, getSettings, setSetting, type ReplayRow, type MasterPasswordRow } from '@/lib/store';
import { THEME_OPTIONS, type ThemeType } from '@/components/ThemedBackground';
import ImagePicker from '@/components/ImagePicker';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const CRITERIA_OPTIONS = [
  { value: 'reguler', label: 'Reguler' },
  { value: 'sts', label: 'STS (Seitansai)' },
  { value: 'last_show', label: 'Last Show' },
  { value: 'aniv', label: 'Anniversary' },
  { value: 'special', label: 'Show Spesial' },
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const m = String(i + 1).padStart(2, '0');
  const names = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return { value: m, label: names[i] };
});

interface Comment {
  id: string;
  name: string;
  message: string;
  replay_id: string;
  created_at: string;
}

export default function Admin() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [replays, setReplays] = useState<ReplayRow[]>([]);
  const [masterPasswords, setMasterPasswords] = useState<MasterPasswordRow[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingReplay, setEditingReplay] = useState<ReplayRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReplayRow | null>(null);

  const [form, setForm] = useState({ title: '', showName: '', date: '', showTime: '19:00', criteria: 'reguler', featuredMember: '', lineup: '', password: '', youtubeId: '', imageUrl: '', sourceType: 'youtube', m3u8Url: '' });

  const [mpYear, setMpYear] = useState(String(new Date().getFullYear()));
  const [mpMonth, setMpMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [mpPassword, setMpPassword] = useState('');

  const [currentTheme, setCurrentTheme] = useState<ThemeType>('ramadhan');
  const [waNumber, setWaNumber] = useState('');
  const [waLink, setWaLink] = useState('');

  // Comments state
  const [allComments, setAllComments] = useState<Comment[]>([]);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Preview state
  const [previewReplay, setPreviewReplay] = useState<ReplayRow | null>(null);

  // Blocked browsers
  const [blockedBrowsers, setBlockedBrowsers] = useState<Array<{ id: string; browser_id: string; reason: string; unblocked: boolean; created_at: string }>>([]);

  const showFeaturedMember = form.criteria === 'sts' || form.criteria === 'last_show';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase.from('user_roles').select('role').eq('user_id', session.user.id).eq('role', 'admin').maybeSingle().then(({ data }) => {
          if (data) setIsLoggedIn(true);
        });
      }
    });
  }, []);

  useEffect(() => {
    if (isLoggedIn) refreshData();
  }, [isLoggedIn]);

  const refreshData = async () => {
    try {
      const [r, m, settings] = await Promise.all([getReplays(), getAllMasterPasswords(), getSettings()]);
      setReplays(r);
      setMasterPasswords(m);
      setCurrentTheme((settings.theme as ThemeType) || 'ramadhan');
      setWaNumber(settings.whatsapp_number || '');
      setWaLink(settings.whatsapp_link || '');
      const { data: comments } = await supabase.from('comments').select('*').order('created_at', { ascending: false });
      if (comments) setAllComments(comments);
      const { data: blocks } = await supabase.from('blocked_browsers').select('*').order('created_at', { ascending: false });
      if (blocks) setBlockedBrowsers(blocks as any);
    } catch {
      toast({ title: 'Error', description: 'Gagal memuat data.', variant: 'destructive' });
    }
  };

  const handleUnblockBrowser = async (id: string) => {
    const { error } = await supabase.from('blocked_browsers').update({ unblocked: true }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'Gagal membuka blokir.', variant: 'destructive' });
    } else {
      toast({ title: 'Berhasil', description: 'Akses user dibuka kembali.' });
      await refreshData();
    }
  };

  const handleDeleteBlock = async (id: string) => {
    const { error } = await supabase.from('blocked_browsers').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'Gagal menghapus.', variant: 'destructive' });
    } else {
      await refreshData();
    }
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) { setLoginError('Email atau sandi salah!'); setLoginLoading(false); return; }
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', data.user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) { setLoginError('Akun ini bukan admin.'); await supabase.auth.signOut(); setLoginLoading(false); return; }
    setIsLoggedIn(true);
    setLoginLoading(false);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); setIsLoggedIn(false); };

  const resetForm = () => {
    setForm({ title: '', showName: '', date: '', showTime: '19:00', criteria: 'reguler', featuredMember: '', lineup: '', password: '', youtubeId: '', imageUrl: '', sourceType: 'youtube', m3u8Url: '' });
    setEditingReplay(null);
  };

  const handleSaveReplay = async () => {
    const isYoutube = form.sourceType === 'youtube';
    if (!form.title || !form.date || !form.password || (isYoutube ? !form.youtubeId : !form.m3u8Url)) {
      toast({ title: 'Error', description: `Judul, tanggal, sandi, dan ${isYoutube ? 'YouTube ID' : 'link M3U8'} wajib diisi!`, variant: 'destructive' });
      return;
    }
    const lineupArr = form.lineup.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const payload = {
        title: form.title, show_name: form.showName, date: form.date, show_time: form.showTime + ':00', criteria: form.criteria,
        featured_member: showFeaturedMember ? form.featuredMember : '',
        lineup: lineupArr, password: form.password,
        youtube_id: isYoutube ? form.youtubeId : '',
        image_url: form.imageUrl,
        source_type: form.sourceType,
        m3u8_url: isYoutube ? '' : form.m3u8Url,
      };
      if (editingReplay) {
        await updateReplay(editingReplay.id, payload);
        toast({ title: 'Berhasil', description: 'Replay berhasil diperbarui!' });
      } else {
        await addReplay(payload);
        toast({ title: 'Berhasil', description: 'Replay baru berhasil ditambahkan!' });
      }
      resetForm();
      setShowAddDialog(false);
      await refreshData();
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan replay.', variant: 'destructive' });
    }
  };

  const handleEditReplay = (r: ReplayRow) => {
    setEditingReplay(r);
    setForm({
      title: r.title, showName: r.show_name, date: r.date, showTime: (r.show_time || '19:00:00').slice(0, 5), criteria: r.criteria,
      featuredMember: r.featured_member, lineup: r.lineup.join(', '), password: r.password, youtubeId: r.youtube_id, imageUrl: r.image_url,
      sourceType: (r as any).source_type || 'youtube', m3u8Url: (r as any).m3u8_url || '',
    });
    setShowAddDialog(true);
  };

  const confirmDeleteReplay = async () => {
    if (!deleteTarget) return;
    try {
      await deleteReplay(deleteTarget.id);
      toast({ title: 'Dihapus', description: 'Replay berhasil dihapus.' });
      setDeleteTarget(null);
      await refreshData();
    } catch {
      toast({ title: 'Error', description: 'Gagal menghapus replay.', variant: 'destructive' });
    }
  };

  const handleSaveMasterPassword = async () => {
    if (!mpPassword) return;
    const key = `${mpYear}-${mpMonth}`;
    try {
      await setMasterPassword(key, mpPassword);
      toast({ title: 'Berhasil', description: `Sandi master untuk ${mpMonth}/${mpYear} berhasil disimpan!` });
      setMpPassword('');
      await refreshData();
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan sandi master.', variant: 'destructive' });
    }
  };

  const handleSaveTheme = async (theme: ThemeType) => {
    setCurrentTheme(theme);
    await setSetting('theme', theme);
    toast({ title: 'Berhasil', description: 'Tema berhasil diubah!' });
  };

  const handleSaveWhatsApp = async () => {
    try {
      await Promise.all([setSetting('whatsapp_number', waNumber), setSetting('whatsapp_link', waLink)]);
      toast({ title: 'Berhasil', description: 'Info WhatsApp berhasil disimpan!' });
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan info WhatsApp.', variant: 'destructive' });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) {
      toast({ title: 'Error', description: 'Gagal menghapus komentar.', variant: 'destructive' });
    } else {
      setAllComments(prev => prev.filter(c => c.id !== commentId));
      toast({ title: 'Dihapus', description: 'Komentar berhasil dihapus.' });
    }
  };

  const handleReplyComment = async () => {
    if (!replyingTo || !replyText.trim()) return;
    setSendingReply(true);
    const { error } = await supabase.from('comments').insert({
      replay_id: replyingTo.replay_id,
      name: '🛡️ Admin',
      message: replyText.trim(),
    });
    if (error) {
      toast({ title: 'Error', description: 'Gagal membalas komentar.', variant: 'destructive' });
    } else {
      toast({ title: 'Terkirim', description: 'Balasan berhasil dikirim.' });
      setReplyingTo(null);
      setReplyText('');
      await refreshData();
    }
    setSendingReply(false);
  };

  const getCriteriaLabel = (val: string) => CRITERIA_OPTIONS.find(c => c.value === val)?.label || val;

  const getReplayTitle = (replayId: string) => replays.find(r => r.id === replayId)?.title || 'Replay tidak ditemukan';

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Baru saja';
    if (mins < 60) return `${mins}m lalu`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}j lalu`;
    const days = Math.floor(hours / 24);
    return `${days}h lalu`;
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader><CardTitle className="text-center font-sans">Admin Panel</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Email Admin</Label><Input type="email" placeholder="admin@email.com" value={loginEmail} onChange={e => { setLoginEmail(e.target.value); setLoginError(''); }} /></div>
            <div><Label>Sandi</Label><Input type="password" placeholder="Masukkan sandi..." value={loginPassword} onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }} onKeyDown={e => e.key === 'Enter' && handleLogin()} /></div>
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
            <Button className="w-full" onClick={handleLogin} disabled={loginLoading}>{loginLoading ? 'Memproses...' : 'Masuk'}</Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate('/')}><ArrowLeft className="w-4 h-4 mr-2" /> Kembali</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg sm:text-xl font-bold font-sans text-foreground flex-1 min-w-0 truncate">Admin Panel</h1>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button size="sm" onClick={() => { resetForm(); setShowAddDialog(true); }} className="text-xs sm:text-sm">
            <Plus className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Tambah</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout"><LogOut className="w-5 h-5" /></Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4">
        <Tabs defaultValue="replays" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="replays" className="text-[10px] sm:text-sm gap-1"><List className="w-3.5 h-3.5 hidden sm:block" />Replay</TabsTrigger>
            <TabsTrigger value="preview" className="text-[10px] sm:text-sm gap-1"><Eye className="w-3.5 h-3.5 hidden sm:block" />Preview</TabsTrigger>
            <TabsTrigger value="comments" className="text-[10px] sm:text-sm gap-1"><MessageCircle className="w-3.5 h-3.5 hidden sm:block" />Komentar</TabsTrigger>
            <TabsTrigger value="security" className="text-[10px] sm:text-sm gap-1"><ShieldCheck className="w-3.5 h-3.5 hidden sm:block" />Blokir</TabsTrigger>
            <TabsTrigger value="settings" className="text-[10px] sm:text-sm gap-1"><Settings className="w-3.5 h-3.5 hidden sm:block" />Setelan</TabsTrigger>
          </TabsList>

          {/* ===== REPLAYS TAB ===== */}
          <TabsContent value="replays">
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg">Daftar Replay ({replays.length})</CardTitle></CardHeader>
              <CardContent>
                {replays.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Belum ada replay.</p>
                ) : (
                  <div className="space-y-2">
                    {replays.map(r => (
                      <div key={r.id} className="flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-lg bg-secondary/50 border border-border">
                        {r.image_url && <img src={r.image_url} alt="" className="w-12 h-8 sm:w-16 sm:h-10 rounded object-cover shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm sm:text-base truncate">{r.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {new Date(r.date).toLocaleDateString('id-ID')} · {getCriteriaLabel(r.criteria)}
                            {r.featured_member && ` · ⭐ ${r.featured_member}`}
                            {' · 👁 '}{r.view_count || 0}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewReplay(r)}><Eye className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditReplay(r)}><Edit2 className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== PREVIEW TAB ===== */}
          <TabsContent value="preview">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Pilih replay untuk melihat tampilan kartu:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {replays.map(r => {
                  const thumbnailUrl = `https://img.youtube.com/vi/${r.youtube_id}/mqdefault.jpg`;
                  return (
                    <div key={r.id} className="rounded-xl overflow-hidden border border-border bg-card/80">
                      <div className="relative aspect-video overflow-hidden">
                        {r.image_url ? (
                          <img src={r.image_url} alt={r.title} className="w-full h-full object-cover" />
                        ) : (
                          <img src={thumbnailUrl} alt={r.title} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute top-2 left-2">
                          <Badge variant="secondary" className="text-xs">{getCriteriaLabel(r.criteria)}</Badge>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        <h3 className="font-semibold text-sm truncate">{r.title}</h3>
                        {r.show_name && <p className="text-xs text-muted-foreground">{r.show_name}</p>}
                        <p className="text-xs text-muted-foreground">
                          {new Date(r.date).toLocaleDateString('id-ID', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                        {r.featured_member && <p className="text-xs text-muted-foreground">⭐ {r.featured_member}</p>}
                        <div className="flex flex-wrap gap-1">
                          {(r.lineup || []).slice(0, 6).map((m, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{m}</Badge>
                          ))}
                          {(r.lineup || []).length > 6 && <Badge variant="secondary" className="text-[10px]">+{r.lineup.length - 6}</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                          <Eye className="w-3 h-3" /> {r.view_count || 0} views
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ===== COMMENTS TAB ===== */}
          <TabsContent value="comments">
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><MessageCircle className="w-5 h-5 text-primary" />Semua Komentar ({allComments.length})</CardTitle></CardHeader>
              <CardContent>
                {allComments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Belum ada komentar.</p>
                ) : (
                  <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                    {allComments.map(c => (
                      <div key={c.id} className="p-3 rounded-lg bg-secondary/50 border border-border group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{c.name}</span>
                              <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                            </div>
                            <p className="text-xs text-primary/70 truncate mt-0.5">📺 {getReplayTitle(c.replay_id)}</p>
                            <p className="text-sm text-muted-foreground mt-1">{c.message}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setReplyingTo(c); setReplyText(''); }} title="Balas">
                              <Send className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteComment(c.id)} title="Hapus">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== SECURITY / BLOCKED BROWSERS TAB ===== */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  Browser Diblokir ({blockedBrowsers.filter(b => !b.unblocked).length} aktif / {blockedBrowsers.length} total)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  User yang terdeteksi membuka DevTools/Inspect Element akan masuk ke daftar ini dan kehilangan akses. Klik "Buka Akses" untuk memulihkan, atau "Hapus" untuk menghapus catatan.
                </p>
                {blockedBrowsers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Belum ada browser yang diblokir.</p>
                ) : (
                  <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                    {blockedBrowsers.map(b => (
                      <div key={b.id} className="p-3 rounded-lg bg-secondary/50 border border-border">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={b.unblocked ? 'secondary' : 'destructive'} className="text-[10px]">
                                {b.unblocked ? '✓ Dibuka' : '🚫 Diblokir'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{timeAgo(b.created_at)}</span>
                            </div>
                            <code className="block text-[11px] font-mono text-foreground mt-1 break-all">{b.browser_id}</code>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Alasan: {b.reason}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {!b.unblocked && (
                              <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => handleUnblockBrowser(b.id)}>
                                <UnlockIcon className="w-3 h-3 mr-1" />Buka
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteBlock(b.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            {/* Theme */}
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><Palette className="w-5 h-5 text-primary" />Tema</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {THEME_OPTIONS.map(t => (
                    <button key={t.value}
                      className={`p-3 sm:p-4 rounded-lg border-2 text-center transition-all ${currentTheme === t.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                      onClick={() => handleSaveTheme(t.value)}>
                      <span className="text-xl sm:text-2xl block mb-1">{t.emoji}</span>
                      <span className="text-xs sm:text-sm font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* WhatsApp */}
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><MessageCircle className="w-5 h-5 text-primary" />WhatsApp</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Nomor HP</Label><Input placeholder="628123456789" value={waNumber} onChange={e => setWaNumber(e.target.value)} /></div>
                <div><Label>Link Saluran</Label><Input placeholder="https://whatsapp.com/channel/..." value={waLink} onChange={e => setWaLink(e.target.value)} /></div>
                <Button onClick={handleSaveWhatsApp} size="sm"><Save className="w-4 h-4 mr-2" />Simpan</Button>
              </CardContent>
            </Card>

            {/* Master Passwords */}
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><Key className="w-5 h-5 text-primary" />Sandi Master</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <div><Label>Tahun</Label><Input className="text-sm" value={mpYear} onChange={e => setMpYear(e.target.value)} /></div>
                  <div>
                    <Label>Bulan</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={mpMonth} onChange={e => setMpMonth(e.target.value)}>
                      {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div><Label>Sandi</Label><Input type="text" placeholder="Sandi master..." value={mpPassword} onChange={e => setMpPassword(e.target.value)} /></div>
                  <Button onClick={handleSaveMasterPassword} size="sm" className="h-10"><Save className="w-4 h-4 mr-1" />Simpan</Button>
                </div>
                {masterPasswords.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {masterPasswords.map(mp => (
                      <Badge key={mp.month} variant="secondary" className="text-xs py-1 px-2">{mp.month}: {mp.password}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Reply Dialog */}
      <Dialog open={!!replyingTo} onOpenChange={open => { if (!open) setReplyingTo(null); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-sans">Balas Komentar</DialogTitle>
            <DialogDescription>Balas sebagai Admin</DialogDescription>
          </DialogHeader>
          {replyingTo && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                <p className="text-xs font-medium">{replyingTo.name}</p>
                <p className="text-sm text-muted-foreground mt-1">{replyingTo.message}</p>
              </div>
              <Input placeholder="Tulis balasan..." value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleReplyComment()} />
              <Button className="w-full" onClick={handleReplyComment} disabled={sendingReply || !replyText.trim()}>
                <Send className="w-4 h-4 mr-2" /> {sendingReply ? 'Mengirim...' : 'Kirim Balasan'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewReplay} onOpenChange={open => { if (!open) setPreviewReplay(null); }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-sans">Preview: {previewReplay?.title}</DialogTitle>
          </DialogHeader>
          {previewReplay && (
            <div className="space-y-4">
              <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube.com/embed/${previewReplay.youtube_id}?rel=0`}
                  title={previewReplay.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  style={{ border: 0 }}
                />
              </div>
              <div className="space-y-2 text-sm">
                <p><strong>Tanggal:</strong> {new Date(previewReplay.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p><strong>Kriteria:</strong> {getCriteriaLabel(previewReplay.criteria)}</p>
                {previewReplay.show_name && <p><strong>Show:</strong> {previewReplay.show_name}</p>}
                {previewReplay.featured_member && <p><strong>Member:</strong> ⭐ {previewReplay.featured_member}</p>}
                <p><strong>Views:</strong> {previewReplay.view_count || 0}</p>
                <div className="flex flex-wrap gap-1">
                  {(previewReplay.lineup || []).map((m, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{m}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Replay?</AlertDialogTitle>
            <AlertDialogDescription>Apakah kamu yakin ingin menghapus "<strong>{deleteTarget?.title}</strong>"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteReplay} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={v => { if (!v) resetForm(); setShowAddDialog(v); }}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-sans">{editingReplay ? 'Edit Replay' : 'Tambah Replay Baru'}</DialogTitle>
            <DialogDescription>Isi detail replay di bawah ini.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Judul *</Label><Input placeholder="Judul replay" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Nama Show</Label><Input placeholder="Contoh: Pajama Drive" value={form.showName} onChange={e => setForm(f => ({ ...f, showName: e.target.value }))} /></div>
            <div>
              <Label>Kriteria</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.criteria} onChange={e => setForm(f => ({ ...f, criteria: e.target.value }))}>
                {CRITERIA_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {showFeaturedMember && (
              <div><Label>Member Bersangkutan</Label><Input placeholder="Nama member..." value={form.featuredMember} onChange={e => setForm(f => ({ ...f, featuredMember: e.target.value }))} /></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tanggal *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><Label>Jam Show</Label><Input type="time" value={form.showTime} onChange={e => setForm(f => ({ ...f, showTime: e.target.value }))} /></div>
            </div>
            <div><Label>Lineup (koma)</Label><Input placeholder="Member 1, Member 2, ..." value={form.lineup} onChange={e => setForm(f => ({ ...f, lineup: e.target.value }))} /></div>
            <div><Label>YouTube ID *</Label><Input placeholder="dQw4w9WgXcQ" value={form.youtubeId} onChange={e => setForm(f => ({ ...f, youtubeId: e.target.value }))} /></div>
            <div><Label>Foto Kartu</Label><ImagePicker value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} /></div>
            <div><Label>Sandi *</Label><Input placeholder="Sandi untuk replay ini" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
            <Button className="w-full" onClick={handleSaveReplay}>
              <Save className="w-4 h-4 mr-2" /> {editingReplay ? 'Simpan Perubahan' : 'Tambah Replay'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
