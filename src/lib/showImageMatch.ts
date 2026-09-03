// Pencocokan otomatis gambar/logo kartu show berdasarkan NAMA file gambar.
// Aturan: ambil 2 kata pertama dari judul show, lalu cari gambar di galeri
// yang namanya diawali (atau mengandung) 2 kata tersebut.
// Contoh: "Cara Meminum Ramune - Team Passion" dan "Cara Meminum Ramune"
// sama-sama cocok ke gambar bernama "cara-meminum-ramune".

export interface GalleryItem {
  name: string; // nama file tanpa ekstensi
  file: string; // nama file lengkap di storage
  url: string;
}

/** Normalisasi teks: huruf kecil, tanpa tanda baca, spasi tunggal. */
export function normalizeName(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Slug aman untuk nama file storage. */
export function slugifyName(input: string): string {
  const n = normalizeName(input).replace(/\s+/g, '-');
  return n.slice(0, 60) || `img-${Date.now().toString(36)}`;
}

/** Ambil N kata pertama (default 2) sebagai kunci identifikasi. */
export function titleKey(title: string, words = 2): string {
  const parts = normalizeName(title).split(' ').filter(Boolean);
  return parts.slice(0, words).join(' ');
}

/**
 * Cari gambar galeri yang paling cocok dengan judul show.
 * Mengembalikan null jika tidak ada yang cocok (admin isi manual).
 */
export function matchGalleryImage(title: string, gallery: GalleryItem[]): GalleryItem | null {
  const key = titleKey(title, 2);
  if (!key || key.length < 3 || !gallery.length) return null;

  const scored = gallery
    .map(item => {
      const name = normalizeName(item.name);
      if (!name) return null;
      // Prioritas: nama identik > nama diawali kunci > nama mengandung kunci
      // > judul mengandung nama (nama gambar lebih pendek dari judul).
      if (name === key) return { item, score: 4 };
      if (name.startsWith(key + ' ') || name.startsWith(key)) return { item, score: 3 };
      if (name.includes(key)) return { item, score: 2 };
      const fullKey = normalizeName(title);
      if (name.split(' ').length >= 2 && fullKey.includes(name)) return { item, score: 1 };
      return null;
    })
    .filter(Boolean) as { item: GalleryItem; score: number }[];

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length);
  return scored[0].item;
}
