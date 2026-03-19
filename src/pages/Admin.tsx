import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Edit2, Key, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { addReplay, deleteReplay, updateReplay, getReplays, getAllMasterPasswords, setMasterPassword } from '@/lib/store';
import { ReplayCard, MasterPassword } from '@/lib/types';
import { toast } from '@/hooks/use-toast';

const ADMIN_PASSWORD = 'dhatul01';

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

  const [replays, setReplays] = useState<ReplayCard[]>([]);
  const [masterPasswords, setMasterPasswords] = useState<MasterPassword[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingReplay, setEditingReplay] = useState<ReplayCard | null>(null);

  // Form state
  const [form, setForm] = useState({ title: '', date: '', criteria: '', lineup: '', password: '', youtubeId: '', imageUrl: '' });

  // Master password form
  const [mpYear, setMpYear] = useState(String(new Date().getFullYear()));
  const [mpMonth, setMpMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [mpPassword, setMpPassword] = useState('');

  useEffect(() => {
    if (isLoggedIn) {
      refreshData();
    }
  }, [isLoggedIn]);

  const refreshData = () => {
    setReplays(getReplays());
    setMasterPasswords(getAllMasterPasswords());
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
    setForm({ title: '', date: '', criteria: '', lineup: '', password: '', youtubeId: '', imageUrl: '' });
    setEditingReplay(null);
  };

  const handleSaveReplay = () => {
    if (!form.title || !form.date || !form.youtubeId || !form.password) {
      toast({ title: 'Error', description: 'Judul, tanggal, YouTube ID, dan sandi wajib diisi!', variant: 'destructive' });
      return;
    }

    const lineupArr = form.lineup.split(',').map(s => s.trim()).filter(Boolean);

    if (editingReplay) {
      updateReplay(editingReplay.id, {
        title: form.title, date: form.date, criteria: form.criteria,
        lineup: lineupArr, password: form.password, youtubeId: form.youtubeId, imageUrl: form.imageUrl,
      });
      toast({ title: 'Berhasil', description: 'Replay berhasil diperbarui!' });
    } else {
      addReplay({
        id: crypto.randomUUID(),
        title: form.title, date: form.date, criteria: form.criteria,
        lineup: lineupArr, password: form.password, youtubeId: form.youtubeId, imageUrl: form.imageUrl,
      });
      toast({ title: 'Berhasil', description: 'Replay baru berhasil ditambahkan!' });
    }

    resetForm();
    setShowAddDialog(false);
    refreshData();
  };

  const handleEditReplay = (r: ReplayCard) => {
    setEditingReplay(r);
    setForm({
      title: r.title, date: r.date, criteria: r.criteria,
      lineup: r.lineup.join(', '), password: r.password, youtubeId: r.youtubeId, imageUrl: r.imageUrl,
    });
    setShowAddDialog(true);
  };

  const handleDeleteReplay = (id: string) => {
    deleteReplay(id);
    toast({ title: 'Dihapus', description: 'Replay berhasil dihapus.' });
    refreshData();
  };

  const handleSaveMasterPassword = () => {
    if (!mpPassword) return;
    const key = `${mpYear}-${mpMonth}`;
    setMasterPassword(key, mpPassword);
    toast({ title: 'Berhasil', description: `Sandi master untuk ${mpMonth}/${mpYear} berhasil disimpan!` });
    setMpPassword('');
    refreshData();
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-center font-sans">Admin Panel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Sandi Admin</Label>
              <Input
                type="password" placeholder="Masukkan sandi admin..."
                value={loginPassword} onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold font-sans text-foreground">Admin Panel</h1>
          </div>
          <Button onClick={() => { resetForm(); setShowAddDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Tambah Replay
          </Button>
        </div>

        {/* Master Password Section */}
        <Card>
          <CardHeader>
            <CardTitle className="font-sans flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" /> Sandi Master Bulanan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <Label>Tahun</Label>
                <Input className="w-24" value={mpYear} onChange={e => setMpYear(e.target.value)} />
              </div>
              <div>
                <Label>Bulan</Label>
                <select className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={mpMonth} onChange={e => setMpMonth(e.target.value)}>
                  {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label>Sandi Master</Label>
                <Input type="text" placeholder="Masukkan sandi master..." value={mpPassword} onChange={e => setMpPassword(e.target.value)} />
              </div>
              <Button onClick={handleSaveMasterPassword}><Save className="w-4 h-4 mr-2" /> Simpan</Button>
            </div>

            {masterPasswords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {masterPasswords.map(mp => (
                  <Badge key={mp.month} variant="secondary" className="text-sm py-1 px-3">
                    {mp.month}: {mp.password}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Replay List */}
        <Card>
          <CardHeader>
            <CardTitle className="font-sans">Daftar Replay ({replays.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {replays.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Belum ada replay. Klik "Tambah Replay" untuk memulai.</p>
            ) : (
              <div className="space-y-3">
                {replays.map(r => (
                  <div key={r.id} className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 border border-border">
                    {r.imageUrl && (
                      <img src={r.imageUrl} alt="" className="w-16 h-10 rounded object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{r.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(r.date).toLocaleDateString('id-ID')} · {r.criteria} · YT: {r.youtubeId}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => handleEditReplay(r)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteReplay(r.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={v => { if (!v) resetForm(); setShowAddDialog(v); }}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-sans">{editingReplay ? 'Edit Replay' : 'Tambah Replay Baru'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Judul *</Label><Input placeholder="Judul replay" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Tanggal *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><Label>Kriteria Show</Label><Input placeholder="Contoh: Pajama Drive" value={form.criteria} onChange={e => setForm(f => ({ ...f, criteria: e.target.value }))} /></div>
            <div><Label>Lineup Member (pisahkan dengan koma)</Label><Input placeholder="Member 1, Member 2, ..." value={form.lineup} onChange={e => setForm(f => ({ ...f, lineup: e.target.value }))} /></div>
            <div><Label>YouTube Embed ID *</Label><Input placeholder="Contoh: dQw4w9WgXcQ" value={form.youtubeId} onChange={e => setForm(f => ({ ...f, youtubeId: e.target.value }))} /></div>
            <div><Label>Link Gambar</Label><Input placeholder="https://example.com/image.jpg" value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} /></div>
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
