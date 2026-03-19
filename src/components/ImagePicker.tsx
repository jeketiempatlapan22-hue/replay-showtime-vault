import { useState, useEffect, useRef } from 'react';
import { Upload, Image as ImageIcon, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { uploadImage, getGalleryImages } from '@/lib/store';
import { toast } from '@/hooks/use-toast';

interface ImagePickerProps {
  value: string;
  onChange: (url: string) => void;
}

export default function ImagePicker({ value, onChange }: ImagePickerProps) {
  const [showGallery, setShowGallery] = useState(false);
  const [gallery, setGallery] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadGallery = async () => {
    setLoadingGallery(true);
    try {
      const images = await getGalleryImages();
      setGallery(images);
    } catch {
      toast({ title: 'Error', description: 'Gagal memuat galeri.', variant: 'destructive' });
    }
    setLoadingGallery(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
      setGallery(prev => [url, ...prev]);
      toast({ title: 'Berhasil', description: 'Gambar berhasil diupload!' });
    } catch {
      toast({ title: 'Error', description: 'Gagal mengupload gambar.', variant: 'destructive' });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openGallery = () => {
    setShowGallery(true);
    loadGallery();
  };

  return (
    <div className="space-y-2">
      {value && (
        <img src={value} alt="Preview" className="w-full h-32 object-cover rounded-lg border border-border" />
      )}

      <div className="flex gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="w-4 h-4 mr-2" /> {uploading ? 'Mengupload...' : 'Upload Foto'}
        </Button>
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={openGallery}>
          <ImageIcon className="w-4 h-4 mr-2" /> Galeri
        </Button>
      </div>

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
              {gallery.map((url, i) => (
                <button
                  key={i}
                  className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${value === url ? 'border-primary' : 'border-border hover:border-primary/50'}`}
                  onClick={() => { onChange(url); setShowGallery(false); }}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {value === url && (
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
