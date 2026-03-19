import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Edit2, Key, Save, Palette, MessageCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

export default function Admin() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [replays, setReplays] = useState<ReplayRow[]>([]);
  const [masterPasswords, setMasterPasswords] = useState<MasterPasswordRow[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingReplay, setEditingReplay] = useState<ReplayRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReplayRow | null>(null);

  const [form, setForm] = useState({ title: '', showName: '', date: '', criteria: 'reguler', featuredMember: '', lineup: '', password: '', youtubeId: '', imageUrl: '' });

  const [mpYear, setMpYear] = useState(String(new Date().getFullYear()));
  const [mpMonth, setMpMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [mpPassword, setMpPassword] = useState('');

  const [currentTheme, setCurrentTheme] = useState<ThemeType>('ramadhan');
  const [waNumber, setWaNumber] = useState('');
  const [waLink, setWaLink] = useState('');

  const showFeaturedMember = form.criteria === 'sts' || form.criteria === 'last_show';

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
    } catch {
      toast({ title: 'Error', description: 'Gagal memuat data.', variant: 'destructive' });
    }
  };

  const handleLogin = () => {
    if (loginPassword === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setLoginError('');
    } else {
      setLoginError('Sandi admin salah!');
    }
  };

  const resetForm = () => {
    setForm({ title: '', showName: '', date: '', criteria: 'reguler', featuredMember: '', lineup: '', password: '', youtubeId: '', imageUrl: '' });
    setEditingReplay(null);
  };

  const handleSaveReplay = async () => {
    if (!form.title || !form.date || !form.youtubeId || !form.password) {
      toast({ title: 'Error', description: 'Judul, tanggal, YouTube ID, dan sandi wajib diisi!', variant: 'destructive' });
      return;
    }
    const lineupArr = form.lineup.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const payload = {
        title: form.title, show_name: form.showName, date: form.date, criteria: form.criteria,
        featured_member: showFeaturedMember ? form.featuredMember : '',
        lineup: lineupArr, password: form.password, youtube_id: form.youtubeId, image_url: form.imageUrl,
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
      title: r.title, showName: r.show_name, date: r.date, criteria: r.criteria,
      featuredMember: r.featured_member,
      lineup: r.lineup.join(', '), password: r.password, youtubeId: r.youtube_id, imageUrl: r.image_url,
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

  const getCriteriaLabel = (val: string) => CRITERIA_OPTIONS.find(c => c.value === val)?.label || val;

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader><CardTitle className="text-center font-sans">Admin Panel</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Sandi Admin</Label>
              <Input type="password" placeholder="Masukkan sandi admin..." value={loginPassword}
                onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
            <Button className="w-full" onClick={handleLogin}>Masuk</Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="w-5 h-5" /></Button>
            <h1 className="text-2xl font-bold font-sans text-foreground">Admin Panel</h1>
          </div>
          <Button onClick={() => { resetForm(); setShowAddDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Tambah Replay
          </Button>
        </div>

        {/* Theme */}
        <Card>
          <CardHeader><CardTitle className="font-sans flex items-center gap-2"><Palette className="w-5 h-5 text-primary" /> Tema & Background</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {THEME_OPTIONS.map(t => (
                <button key={t.value}
                  className={`p-4 rounded-lg border-2 text-center transition-all ${currentTheme === t.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                  onClick={() => handleSaveTheme(t.value)}>
                  <span className="text-2xl block mb-1">{t.emoji}</span>
                  <span className="text-sm font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp */}
        <Card>
          <CardHeader><CardTitle className="font-sans flex items-center gap-2"><MessageCircle className="w-5 h-5 text-primary" /> Info WhatsApp</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Nomor HP WhatsApp Admin</Label><Input placeholder="Contoh: 628123456789" value={waNumber} onChange={e => setWaNumber(e.target.value)} /></div>
            <div><Label>Link Saluran WhatsApp</Label><Input placeholder="https://whatsapp.com/channel/..." value={waLink} onChange={e => setWaLink(e.target.value)} /></div>
            <Button onClick={handleSaveWhatsApp}><Save className="w-4 h-4 mr-2" /> Simpan WhatsApp</Button>
          </CardContent>
        </Card>

        {/* Master Passwords */}
        <Card>
          <CardHeader><CardTitle className="font-sans flex items-center gap-2"><Key className="w-5 h-5 text-primary" /> Sandi Master Bulanan</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div><Label>Tahun</Label><Input className="w-24" value={mpYear} onChange={e => setMpYear(e.target.value)} /></div>
              <div>
                <Label>Bulan</Label>
                <select className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={mpMonth} onChange={e => setMpMonth(e.target.value)}>
                  {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[150px]"><Label>Sandi Master</Label><Input type="text" placeholder="Masukkan sandi master..." value={mpPassword} onChange={e => setMpPassword(e.target.value)} /></div>
              <Button onClick={handleSaveMasterPassword}><Save className="w-4 h-4 mr-2" /> Simpan</Button>
            </div>
            {masterPasswords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {masterPasswords.map(mp => (
                  <Badge key={mp.month} variant="secondary" className="text-sm py-1 px-3">{mp.month}: {mp.password}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Replay List */}
        <Card>
          <CardHeader><CardTitle className="font-sans">Daftar Replay ({replays.length})</CardTitle></CardHeader>
          <CardContent>
            {replays.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Belum ada replay. Klik "Tambah Replay" untuk memulai.</p>
            ) : (
              <div className="space-y-3">
                {replays.map(r => (
                  <div key={r.id} className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 border border-border">
                    {r.image_url && <img src={r.image_url} alt="" className="w-16 h-10 rounded object-cover shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{r.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(r.date).toLocaleDateString('id-ID')} · {r.show_name || '-'} · {getCriteriaLabel(r.criteria)}
                        {r.featured_member && ` · ⭐ ${r.featured_member}`}
                        {' · '} 👁 {r.view_count || 0} views
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => handleEditReplay(r)}><Edit2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Replay?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah kamu yakin ingin menghapus replay "<strong>{deleteTarget?.title}</strong>"? Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
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
            <div><Label>Judul Replay *</Label><Input placeholder="Judul replay" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Nama Show</Label><Input placeholder="Contoh: Pajama Drive, Aitakatta" value={form.showName} onChange={e => setForm(f => ({ ...f, showName: e.target.value }))} /></div>
            <div>
              <Label>Kriteria Show</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.criteria} onChange={e => setForm(f => ({ ...f, criteria: e.target.value }))}>
                {CRITERIA_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {showFeaturedMember && (
              <div><Label>Member yang Bersangkutan (STS/Last Show)</Label><Input placeholder="Nama member..." value={form.featuredMember} onChange={e => setForm(f => ({ ...f, featuredMember: e.target.value }))} /></div>
            )}
            <div><Label>Tanggal *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><Label>Lineup Member (pisahkan dengan koma)</Label><Input placeholder="Member 1, Member 2, ..." value={form.lineup} onChange={e => setForm(f => ({ ...f, lineup: e.target.value }))} /></div>
            <div><Label>YouTube Embed ID *</Label><Input placeholder="Contoh: dQw4w9WgXcQ" value={form.youtubeId} onChange={e => setForm(f => ({ ...f, youtubeId: e.target.value }))} /></div>
            <div><Label>Foto Kartu</Label><ImagePicker value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} /></div>
            <div><Label>Sandi Satuan *</Label><Input placeholder="Sandi untuk membuka replay ini" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
            <Button className="w-full" onClick={handleSaveReplay}>
              <Save className="w-4 h-4 mr-2" /> {editingReplay ? 'Simpan Perubahan' : 'Tambah Replay'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
