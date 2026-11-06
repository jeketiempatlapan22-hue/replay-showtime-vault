import { Ban, CheckCircle2, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { tokenCreatorLabel, type ChatSender } from '@/lib/liveChatAccess';

const accessLabels: Record<string, string> = { membership: 'Membership', show: 'Show', bundle: 'Bundel', order: 'Pembelian', password: 'Sandi', guest: 'Tamu' };

interface Props {
  open: boolean;
  loading: boolean;
  busy: boolean;
  error: string;
  sender: ChatSender | null;
  isAdmin: boolean;
  onClose: () => void;
  onModerator: () => void;
  onBlock: () => void;
  onDelete: () => void;
}

export default function ChatSenderDialog({ open, loading, busy, error, sender, isAdmin, onClose, onModerator, onBlock, onDelete }: Props) {
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Info Pengirim</DialogTitle><DialogDescription>Identitas dan akses pengirim chat.</DialogDescription></DialogHeader>
      {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Memuat info pengirim" /> : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : sender && <>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Nama</dt><dd className="break-words">{sender.name}</dd>
          <dt className="text-muted-foreground">Peran</dt><dd>{sender.sender_role === 'admin' ? '🛡️ Admin' : sender.sender_role === 'moderator' ? '🔰 Moderator' : 'User'}</dd>
          {isAdmin && <><dt className="text-muted-foreground">Nomor HP</dt><dd className="break-all">{sender.phone || '—'}</dd></>}
          <dt className="text-muted-foreground">Token</dt><dd className="break-words">{sender.token_tail ? `••••${sender.token_tail}` : '—'}<span className="block text-xs text-muted-foreground">{tokenCreatorLabel(sender.created_by)}</span></dd>
          <dt className="text-muted-foreground">Jenis akses</dt><dd>{accessLabels[sender.token_kind || ''] || '—'}</dd>
          <dt className="text-muted-foreground">Status chat</dt><dd>{sender.is_blocked ? 'Diblokir' : 'Aktif'}</dd>
        </dl>
        <div className="flex flex-wrap gap-2 pt-2">
          {isAdmin && sender.user_id && sender.sender_role !== 'admin' && <Button variant="outline" size="sm" disabled={busy} onClick={onModerator}><ShieldCheck className="mr-2 h-4 w-4" />{sender.is_moderator ? 'Cabut Moderator' : 'Jadikan Moderator'}</Button>}
          {sender.browser_id && sender.sender_role !== 'admin' && <Button variant="outline" size="sm" disabled={busy} onClick={onBlock}>{sender.is_blocked ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Ban className="mr-2 h-4 w-4" />}{sender.is_blocked ? 'Buka Blokir' : 'Blokir'}</Button>}
          <Button variant="destructive" size="sm" disabled={busy} onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Hapus Pesan</Button>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}