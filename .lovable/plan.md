# Menjadikan realtime48stream.my.id sebagai Domain Utama

## Tujuan
- realtime48stream.my.id = domain utama untuk semua halaman & token.
- Link lama seperti `https://replaytime.lovable.app/live?mtoken=...&mp=...` tetap bisa diakses dan otomatis berpindah ke domain utama tanpa kehilangan token/parameter.

## Yang perlu kamu lakukan sendiri (1x, di pengaturan Lovable)
Buka **Project Settings → Domains** lalu di samping `realtime48stream.my.id` klik **Set as primary**. Setelah ini, kalau ada yang menulis langsung `https://realtime48stream.my.id/...` semuanya jalan normal, dan domain Lovable bawaan tetap aktif sebagai cadangan.

## Yang aku kerjakan di kode

Tambahkan redirect ringan sisi klien sehingga setiap kali halaman dimuat dari host non‑utama (mis. `replaytime.lovable.app` atau preview lain), browser otomatis pindah ke `realtime48stream.my.id` sambil **mempertahankan path, query string, dan hash** secara utuh.

### Perubahan file

**`src/main.tsx`** — tambahkan blok redirect sebelum `createRoot(...).render(...)`:

```ts
const PRIMARY_HOST = 'realtime48stream.my.id';
const REDIRECT_HOSTS = new Set([
  'replaytime.lovable.app',
  'www.realtime48stream.my.id',
]);
if (typeof window !== 'undefined' && REDIRECT_HOSTS.has(window.location.hostname)) {
  const { pathname, search, hash } = window.location;
  window.location.replace(`https://${PRIMARY_HOST}${pathname}${search}${hash}`);
}
```

Properti penting:
- Berjalan **sebelum React mount**, jadi pengguna tidak melihat UI sempat tampil di domain lama.
- `pathname + search + hash` dipertahankan, sehingga URL seperti `/live?mtoken=SNUC2ELPN6J3&mp=NDTTKQTG` ter‑forward apa adanya — token, password master, dan parameter lain tetap utuh.
- Host preview Lovable (`id-preview--*.lovable.app`) **tidak** ikut di‑redirect supaya pratinjau editor tetap bisa dipakai.
- `window.location.replace` dipakai (bukan `assign`) supaya tidak menambah entri history yang membingungkan tombol Back.

### Tidak perlu diubah
- Edge functions, RPC, dan logika token tidak melakukan validasi berbasis hostname, jadi semua tetap kompatibel.
- Storage key (`replaytime-*` di localStorage/sessionStorage) bersifat per‑origin; ini disengaja dan tidak diutak‑atik supaya nama key konsisten dengan data lama yang sudah tersimpan di perangkat pengguna.

## Catatan
- Setelah domain utama di‑set di Project Settings dan kode di atas dideploy, semua tautan lama otomatis mendarat di `realtime48stream.my.id` dengan token tetap berfungsi.
- Domain Lovable bawaan tetap aktif sebagai jaring pengaman; ia hanya bertugas mengarahkan ulang.
