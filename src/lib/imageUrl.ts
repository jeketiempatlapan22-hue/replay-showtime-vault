// Helper untuk memakai versi kecil (thumbnail) dari gambar Storage,
// sehingga egress/bandwidth jauh lebih hemat.

const PUBLIC_MARK = '/storage/v1/object/public/';
const RENDER_MARK = '/storage/v1/render/image/public/';

/**
 * Ubah URL publik Storage menjadi URL transform (resize + kompresi).
 * URL non-Storage (eksternal / placeholder) dikembalikan apa adanya.
 */
export function thumbUrl(url?: string | null, width = 640, quality = 60): string {
  if (!url) return '';
  if (url.includes(RENDER_MARK)) return url;
  if (!url.includes(PUBLIC_MARK)) return url;
  const base = url.replace(PUBLIC_MARK, RENDER_MARK);
  const sep = base.includes('?') ? '&' : '?';
  // resize=cover menjaga rasio asli (tidak crop/zoom), hanya dikompres.
  return `${base}${sep}width=${width}&quality=${quality}&resize=cover`;
}

/**
 * Kompres file gambar di browser sebelum diunggah (maks sisi terpanjang & kualitas JPEG).
 * Jika gagal, file asli dikembalikan.
 */
export async function compressImage(file: File, maxSize = 1280, quality = 0.7): Promise<File> {
  try {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
