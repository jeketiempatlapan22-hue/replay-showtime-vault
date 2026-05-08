import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Save, Trash2, Send, Copy, Check } from 'lucide-react';

type BotCommand = {
  id: string;
  trigger: string;
  description: string;
  response_template: string;
  is_dynamic: boolean;
  enabled: boolean;
  sort_order: number;
};

type BotAdminRow = { id: string; phone: string; label: string; enabled: boolean };

function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  return d;
}

export default function BotAdmin() {
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('Halo dari ReplayTime ✨');
  const [sending, setSending] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [admins, setAdmins] = useState<BotAdminRow[]>([]);
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const fonnteWebhook = `https://${projectId}.supabase.co/functions/v1/fonnte-webhook`;
  const pakasirWebhook = `https://${projectId}.supabase.co/functions/v1/pakasir-webhook`;

  const load = async () => {
    setLoading(true);
    const [{ data: cmds }, { data: ads }] = await Promise.all([
      supabase.from('bot_commands').select('*').order('sort_order'),
      supabase.from('bot_admins').select('*').order('created_at'),
    ]);
    setCommands((cmds ?? []) as BotCommand[]);
    setAdmins((ads ?? []) as BotAdminRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addAdmin = async () => {
    const phone = normalizePhone(newPhone);
    if (!phone) { toast({ title: 'Nomor tidak valid', variant: 'destructive' }); return; }
    const { error } = await supabase.from('bot_admins').insert({ phone, label: newLabel || '' });
    if (error) toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
    else { setNewPhone(''); setNewLabel(''); load(); toast({ title: 'Admin bot ditambahkan' }); }
  };

  const toggleAdmin = async (a: BotAdminRow) => {
    await supabase.from('bot_admins').update({ enabled: !a.enabled }).eq('id', a.id);
    load();
  };

  const removeAdmin = async (id: string) => {
    if (!confirm('Hapus admin bot ini?')) return;
    await supabase.from('bot_admins').delete().eq('id', id);
    load();
  };

  const save = async (c: BotCommand) => {
    const { error } = await supabase.from('bot_commands').update({
      trigger: c.trigger.trim().toLowerCase(),
      description: c.description,
      response_template: c.response_template,
      enabled: c.enabled,
      sort_order: c.sort_order,
    }).eq('id', c.id);
    if (error) toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
    else toast({ title: 'Tersimpan', description: c.trigger });
  };

  const remove = async (id: string) => {
    if (!confirm('Hapus command ini?')) return;
    const { error } = await supabase.from('bot_commands').delete().eq('id', id);
    if (error) toast({ title: 'Gagal hapus', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Dihapus' }); load(); }
  };

  const add = async () => {
    const trigger = prompt('Trigger command (contoh: /promo)')?.trim().toLowerCase();
    if (!trigger) return;
    if (!trigger.startsWith('/')) { toast({ title: 'Harus diawali /', variant: 'destructive' }); return; }
    const { error } = await supabase.from('bot_commands').insert({
      trigger, description: '', response_template: 'Balasan default…',
      sort_order: commands.length + 1,
    });
    if (error) toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
    else load();
  };

  const sendTest = async () => {
    if (!testPhone || !testMsg) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-wa', {
        body: { phone: testPhone, message: testMsg },
      });
      if (error) throw error;
      toast({ title: 'Pesan terkirim', description: JSON.stringify(data).slice(0, 100) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'gagal';
      toast({ title: 'Gagal kirim', description: msg, variant: 'destructive' });
    } finally { setSending(false); }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 1500);
  };

  return (
    <div className="space-y-6">
      {/* Webhook URLs */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">Webhook URL</h3>
        <p className="text-xs text-muted-foreground">
          Pasang URL berikut di dashboard Fonnte (Device → Webhook URL) dan Pakasir (Project → Redirect/Callback URL).
        </p>
        <div className="space-y-2">
          <Label className="text-xs">Fonnte Incoming Webhook</Label>
          <div className="flex gap-2">
            <Input readOnly value={fonnteWebhook} className="font-mono text-xs" />
            <Button size="icon" variant="outline" onClick={() => copy(fonnteWebhook)}>
              {copiedWebhook ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Pakasir Webhook (kirim notif pembayaran)</Label>
          <div className="flex gap-2">
            <Input readOnly value={pakasirWebhook} className="font-mono text-xs" />
            <Button size="icon" variant="outline" onClick={() => copy(pakasirWebhook)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Test send */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">Tes Kirim WhatsApp</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input placeholder="08xxxx" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
          <Input placeholder="Pesan" value={testMsg} onChange={(e) => setTestMsg(e.target.value)} className="sm:col-span-2" />
        </div>
        <Button onClick={sendTest} disabled={sending} className="w-full sm:w-auto">
          <Send className="w-4 h-4 mr-2" />{sending ? 'Mengirim…' : 'Kirim Tes'}
        </Button>
      </div>

      {/* Bot Admins whitelist */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">Admin Bot WhatsApp</h3>
        <p className="text-xs text-muted-foreground">
          Hanya nomor di daftar ini yang dapat menjalankan command admin seperti <code>/buattoken</code>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input placeholder="08xxxx atau 628xxxx" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <Input placeholder="Label (opsional)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <Button onClick={addAdmin}><Plus className="w-4 h-4 mr-1" />Tambah Admin</Button>
        </div>
        <div className="space-y-2">
          {admins.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Belum ada admin bot.</p>
          ) : admins.map((a) => (
            <div key={a.id} className="flex items-center gap-2 border border-border rounded-lg p-2 bg-secondary/30">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm">+{a.phone}</p>
                {a.label && <p className="text-xs text-muted-foreground">{a.label}</p>}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={a.enabled} onCheckedChange={() => toggleAdmin(a)} />
                Aktif
              </label>
              <Button size="icon" variant="outline" onClick={() => removeAdmin(a.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Commands editor */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Bot Commands</h3>
          <Button size="sm" onClick={add}><Plus className="w-4 h-4 mr-1" />Tambah</Button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Memuat…</p> : (
          <div className="space-y-3">
            {commands.map((c, idx) => (
              <div key={c.id} className="border border-border rounded-lg p-3 space-y-2 bg-secondary/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    value={c.trigger}
                    onChange={(e) => {
                      const v = [...commands]; v[idx] = { ...c, trigger: e.target.value }; setCommands(v);
                    }}
                    className="w-32 font-mono text-sm"
                  />
                  <Input
                    placeholder="Deskripsi"
                    value={c.description}
                    onChange={(e) => {
                      const v = [...commands]; v[idx] = { ...c, description: e.target.value }; setCommands(v);
                    }}
                    className="flex-1 min-w-[150px]"
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={c.enabled} onCheckedChange={(en) => {
                      const v = [...commands]; v[idx] = { ...c, enabled: en }; setCommands(v);
                    }} />
                    Aktif
                  </label>
                </div>
                {c.is_dynamic ? (
                  <p className="text-xs text-muted-foreground italic">⚙️ Dinamis (template diisi otomatis oleh sistem)</p>
                ) : (
                  <Textarea
                    rows={4}
                    placeholder="Template balasan. Anda boleh gunakan {{ADMIN_PHONE}}."
                    value={c.response_template}
                    onChange={(e) => {
                      const v = [...commands]; v[idx] = { ...c, response_template: e.target.value }; setCommands(v);
                    }}
                  />
                )}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => remove(c.id)} disabled={c.is_dynamic}>
                    <Trash2 className="w-4 h-4 mr-1" />Hapus
                  </Button>
                  <Button size="sm" onClick={() => save(c)}>
                    <Save className="w-4 h-4 mr-1" />Simpan
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
