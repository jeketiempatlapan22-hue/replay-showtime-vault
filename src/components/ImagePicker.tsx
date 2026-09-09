import { useState, useEffect, useRef } from 'react';
import { Upload, Image as ImageIcon, Check, Wand2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { uploadImage, getGalleryItems, renameGalleryImage } from '@/lib/store';
import { toast } from '@/hooks/use-toast';
import { thumbUrl } from '@/lib/imageUrl';
import { matchGalleryImage, slugifyName, type GalleryItem } from '@/lib/showImageMatch';


interface ImagePickerProps {
  value: string;
  onChange: (url: string) => void;
  /** Judul show: dipakai untuk mencocokkan logo/gambar otomatis dari nama gambar. */
  autoMatchTitle?: string;
}

export default function ImagePicker({ value, onChange, autoMatchTitle }: ImagePickerProps) {
  const [showGallery, setShowGallery] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingName, setPendingName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoDoneRef = useRef('');

  const loadGallery = async (): Promise<GalleryItem[]> => {
    setLoadingGallery(true);
    try {
      const images = await getGalleryItems();
      setGallery(images);
      return images;
    } catch {
      toast({ title: 'Error', description: 'Gagal memuat galeri.', variant: 'destructive' });
      return [];
    } finally {
      setLoadingGallery(false);
    }
  };

  // Auto-cocokkan gambar saat judul diisi dan gambar masih kosong.
  useEffect(() => {
    const title = (autoMatchTitle || '').trim();
    if (!title || value || autoDoneRef.current === title) return;
    autoDoneRef.current = title;
    let cancelled = false;
    (async () => {
      const items = gallery.length ? gallery : await getGalleryItems().catch(() => [] as GalleryItem[]);
      if (cancelled || !items.length) return;
      if (!gallery.length) setGallery(items);
      const hit = matchGalleryImage(title, items);
      if (hit) {
        onChange(hit.url);
        toast({ title: 'Logo otomatis', description: `Memakai gambar "${hit.name}".` });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMatchTitle, value]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPendingName(slugifyName((autoMatchTitle || file.name).replace(/\.[^.]+$/, '')).replace(/-/g, ' '));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const url = await uploadImage(pendingFile, pendingName);
      onChange(url);
      setGallery(prev => [{ name: slugifyName(pendingName), file: '', url }, ...prev]);
      toast({ title: 'Berhasil', description: 'Gambar berhasil diupload!' });
      setPendingFile(null);
      setPendingName('');
    } catch {
      toast({ title: 'Error', description: 'Gagal mengupload gambar.', variant: 'destructive' });
    }
    setUploading(false);
  };

  const openGallery = () => {
    setShowGallery(true);
    loadGallery();
  };

  const runAutoMatch = async () => {
    const title = (autoMatchTitle || '').trim();
    if (!title) { toast({ title: 'Isi judul dulu', description: 'Judul show diperlukan untuk mencocokkan gambar.' }); return; }
    const items = await loadGallery();
    const hit = matchGalleryImage(title, items);
    if (!hit) {
      toast({ title: 'Tidak ada gambar cocok', description: 'Silakan pilih atau upload gambar secara manual.', variant: 'destructive' });
      return;
    }
    onChange(hit.url);
    toast({ title: 'Logo otomatis', description: `Memakai gambar "${hit.name}".` });
  };

  return (
    <div className="space-y-2">
      {value && (
        <img src={thumbUrl(value, 480, 60)} alt="Preview" className="w-full h-32 object-cover rounded-lg border border-border" />
      )}

      <div className="flex flex-wrap gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <Button type="button" variant="outline" size="sm" className="flex-1 min-w-[130px]" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="w-4 h-4 mr-2" /> {uploading ? 'Mengupload...' : 'Upload Foto'}
        </Button>
        <Button type="button" variant="outline" size="sm" className="flex-1 min-w-[130px]" onClick={openGallery}>
          <ImageIcon className="w-4 h-4 mr-2" /> Galeri
        </Button>
        {autoMatchTitle !== undefined && (
          <Button type="button" variant="outline" size="sm" className="flex-1 min-w-[130px]" onClick={runAutoMatch}>
            <Wand2 className="w-4 h-4 mr-2" /> Cocokkan Judul
          </Button>
        )}
      </div>

      <Dialog open={!!pendingFile} onOpenChange={o => { if (!o) { setPendingFile(null); setPendingName(''); } }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-sans">Beri Nama Gambar</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Nama dipakai untuk mencocokkan logo otomatis dengan judul show (2 kata pertama judul).
          </p>
          <Input value={pendingName} onChange={e => setPendingName(e.target.value)} placeholder="cara meminum ramune" />
          <Button onClick={confirmUpload} disabled={uploading || !pendingName.trim()}>
            {uploading ? 'Mengupload...' : 'Upload'}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showGallery} onOpenChange={setShowGallery}>
        <DialogContent className="bg-card border-border max-h-[80vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-sans">Pilih dari Galeri</DialogTitle>
          </DialogHeader>
          {loadingGallery ? (
            <p className="text-center text-muted-foreground py-8">Memuat galeri...</p>
          ) : gallery.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Belum ada gambar di galeri.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {gallery.map((item, i) => (
                <button
                  key={i}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all ${value === item.url ? 'border-primary' : 'border-border hover:border-primary/50'}`}
                  onClick={() => { onChange(item.url); setShowGallery(false); }}
                >
                  <div className="aspect-video">
                    <img src={thumbUrl(item.url, 320, 55)} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                  <span className="block px-1 py-0.5 text-[10px] truncate text-muted-foreground">{item.name}</span>
                  {value === item.url && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Check className="w-6 h-6 text-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
