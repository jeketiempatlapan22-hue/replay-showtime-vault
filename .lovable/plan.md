## 1. Lazy-loading gambar kartu replay + skeleton

**File:** `src/components/ReplayCardComponent.tsx`

- Tambah state lokal `imgLoaded` (boolean). Render skeleton (gradient `bg-secondary` + `animate-pulse`) absolute di atas `aspect-video` selama belum loaded.
- Pada `<img>` kartu utama: tambah `loading="lazy"`, `decoding="async"`, `onLoad={() => setImgLoaded(true)}`, dan transition `opacity-0 → opacity-100`.
- Hapus duplikasi `<img>` overlay yang tidak perlu (saat ini ada 2 img menumpuk dengan src yang sama untuk efek hover) — cukup satu img + `group-hover:scale-105`.
- Skeleton pakai semantic token (`bg-muted`, shimmer dari `animate-pulse`) — tidak menambah berat bundle.

## 2. Hapus seek button di halaman Live, pertahankan volume + seek bar

**File:** `src/components/HlsPlayer.tsx`

- Tambah prop opsional `hideSeekButtons?: boolean` pada `Props`.
- Saat true: jangan render dua tombol `RotateCcw` (-10s) dan `RotateCw` (+10s). Tombol Play/Pause, Volume, Quality, Fullscreen tetap.
- Seek bar + label durasi (`currentTime` / `duration`) tetap dirender seperti sekarang (untuk live stream sudah otomatis menampilkan `LIVE` / `ON AIR`).

**File:** `src/pages/Live.tsx`

- Saat instansiasi `<HlsPlayer ... hideSeekButtons />`, kirim prop tersebut. Halaman replay (`Index.tsx` / `YouTubePlayer` chain) tidak diubah → tombol seek tetap ada di replay.

## 3. Auto-play dengan suara aktif saat user masuk

**File:** `src/components/HlsPlayer.tsx`

- Ubah `initialMuted` default agar selalu `false` saat tidak ada preferensi tersimpan (sekarang sudah false jika `localStorage` kosong, tapi value `'1'` lama dapat membuat selalu mute). Reset key lama `replaytime-muted` jika nilainya `'1'` saat pertama kali player dibuka pada session ini (one-time migration via flag di `sessionStorage`).
- `safePlay()` tetap mencoba unmuted dulu, fallback muted jika browser blokir → tampilkan tombol "Tap untuk aktifkan suara" yang sudah ada.
- Pastikan `video.muted = false` di setup effect kecuali user secara eksplisit menekan tombol mute pada session ini.

**File:** `src/components/EmbedPlayer.tsx` (YouTube/Cloudflare iframe untuk live)

- Pastikan URL YouTube fallback memakai `autoplay=1&mute=0` (jika sebelumnya `mute=1`, ganti). Sediakan tombol unmute kecil bila iframe API gagal start dengan suara.

## 4. Halaman Live = active show yang di-live + sandi master/satuan

**File:** `supabase/functions/unlock-live/index.ts`

Pada Branch A (per-show, `show_id`), bagian `if (show.live_require_password)`:

- Selain mengecek `show.live_password`, juga cek **master password bulanan** berdasarkan `show.show_date`:
  - Hitung `monthKey = YYYY-MM` dari `show.show_date`.
  - Query `master_passwords` where `month = monthKey`.
  - Valid jika `master.paused !== true && master.password === password`.
- Jika salah satu cocok (satuan ATAU master) → return `okPayload`. Jika tidak ada yang cocok → return `bad_password`.
- Tidak mengubah Branch B (legacy `live_config_private`).

**File:** `src/pages/Live.tsx`

- Tidak butuh perubahan logika besar — halaman sudah memuat berdasarkan `?show=<id>` dan menampilkan show aktif. Konfirmasi flow:
  - Tanpa `?show=`, halaman jatuh ke legacy global → tetap dipertahankan untuk backward compat.
  - Pesan input sandi diperbarui: "Masukkan sandi satuan show atau sandi master bulanan".

## 5. Verifikasi

- Build pass.
- Cek Live page (mobile viewport): seek button hilang, volume + seek bar masih muncul, durasi tampil, autoplay langsung bersuara (atau tampil tombol unmute bila browser blok).
- Replay card: skeleton muncul sebentar lalu gambar fade-in; tidak ada layout shift.
- Coba unlock live show dengan sandi master bulan show_date → berhasil.

### Catatan teknis

- Pakai semantic tokens (no warna mentah).
- Tidak menambah dependency baru.
- Tidak mengubah `client.ts` / `types.ts`.
