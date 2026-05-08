## Ringkasan
Empat perubahan: (1) hitung viewer benar-benar unik per browser, (2) wajibkan username sebelum live chat, (3) tombol beli replay (default Rp 2.000) dengan token & sandi tersimpan di localStorage, (4) status pembelian show aktif juga persist di localStorage.

---

## 1. Viewer counter unik per browser (`src/pages/Live.tsx`)

Masalah saat ini:
- Presence channel hanya aktif setelah `unlocked` ⇒ user yang belum unlock tidak terhitung.
- Pakai `Object.keys(state).length`; jika ada race / multiple track call dengan key sama, hitungannya bisa bias.

Perubahan:
- Pisahkan channel presence agar aktif setiap kali halaman live dibuka (tidak menunggu `unlocked`), kuncinya tetap `browser_id`.
- Hitung unik dengan cara mengumpulkan `browser_id` dari `presenceState()` ke dalam `Set` lalu ambil `.size` (aman walau ada multi-entry).
- Tambah throttle: hanya track sekali setelah subscribed, jangan re-track tiap render.
- Channel name memakai `live-viewers:${showKey}` (sudah ada).
- Tampilkan badge viewer hanya saat `liveActive`.

## 2. Wajib username untuk live chat (`src/components/LiveChat.tsx`)

- Saat user pertama kali masuk halaman live (atau localStorage `replaytime-name` kosong), tampilkan modal kecil "Masukkan nama untuk berinteraksi" sebelum input chat aktif.
- Validasi: minimal 2 karakter, max 40, trim. Setelah disimpan ke `localStorage` per browser, modal tidak muncul lagi.
- Tombol "Ganti nama" kecil di header chat agar bisa diubah.
- Input pesan disabled selama nama belum diisi (untuk non-admin).
- Admin tetap memakai `admin_username` (skip prompt).

## 3. Pembelian replay langsung dari kartu replay

File: `src/components/ReplayCardComponent.tsx`, `src/pages/Index.tsx` (dan/atau parent yang render kartu), `src/components/BuyShowDialog.tsx` (atau dialog baru `BuyReplayDialog.tsx`), edge function `create-pakasir-order` & `pakasir-webhook`.

Perubahan UI kartu replay:
- Tambah tombol "Beli Replay · Rp {harga}" dengan harga default `2000` jika replay belum punya harga.
- Setelah pembayaran terkonfirmasi (status `paid`), kartu menampilkan:
  - Tombol "Tonton Replay" (membuka player seperti sekarang).
  - Sandi replay (dari kolom `replays.password` atau access_token) yang bisa di-copy.
- State persist di `localStorage`:
  - Key: `replaytime-replay-purchased` (object: `{ [replayId]: { token, password, paidAt } }`).
  - Saat mount, kartu cek key ini; bila ada ⇒ langsung tampilkan tombol Tonton + sandi tanpa perlu beli ulang.

Edge function:
- Perluas `create-pakasir-order` agar menerima `kind: 'replay'` tanpa `show_id` (cukup `replay_id`). Validasi harga: pakai `replays`-level harga; jika kosong, fallback `2000`.
- `pakasir-webhook` saat order paid untuk `kind: 'replay'`: generate token (sudah ada untuk show), set `access_token` di order. Tetap kirim WhatsApp.

Klien polling/realtime (mirip BuyShowDialog) — saat `paid`, simpan `{ token, password }` ke localStorage lalu refresh tampilan kartu.

> Catatan harga: harga replay disimpan di mana? Lihat poin pertanyaan klarifikasi di bawah.

## 4. Persist pembelian show aktif

File: `src/components/ActiveShowCard.tsx`, `BuyShowDialog.tsx`.

- Setelah status `paid` di `BuyShowDialog`, simpan ke localStorage:
  - Key `replaytime-show-purchased` (object: `{ [showId]: { token, paidAt, kind: 'show'|'replay' } }`).
- `ActiveShowCard` cek localStorage saat mount:
  - Bila sudah dibeli show ⇒ tombol "Tonton Live" langsung aktif (auto-isi token saat klik, navigate `/live?show={id}&t={token}`).
  - Bila sudah dibeli replay ⇒ tombol "Tonton Replay" aktif tanpa harus beli ulang.
- Listener `storage` + `focus` (sudah ada untuk sessionStorage) ditambah cek localStorage.

## Pertanyaan klarifikasi (akan ditanyakan terpisah jika perlu)

1. Harga replay default Rp 2.000: berlaku ke semua replay? Atau hanya replay yang belum punya harga sendiri di tabel?
2. Sandi yang ditampilkan setelah beli replay: pakai `replays.password` (sandi master/satuan) atau `access_token` (one-time)?
3. Apakah pembelian replay perlu reset otomatis setelah waktu tertentu (mis. 24 jam) atau permanen di localStorage?

---

## Detail teknis singkat

```ts
// Viewer unique
const ids = new Set<string>();
const state = channel.presenceState() as Record<string, Array<{at:number}>>;
Object.keys(state).forEach(k => ids.add(k)); // key = browser_id
setViewerCount(ids.size);
```

```ts
// Replay purchase storage shape
type ReplayPurchase = { token: string; password?: string; paidAt: number };
const KEY = 'replaytime-replay-purchased';
```

```ts
// Active show purchase storage shape
type ShowPurchase = { token: string; kind: 'show'|'replay'; paidAt: number };
const KEY = 'replaytime-show-purchased';
```

Tidak ada perubahan skema database; hanya perluasan logic edge function `create-pakasir-order` (menerima `kind=replay` tanpa show) dan `pakasir-webhook` (token untuk replay-only).
