## Tujuan
Sederhanakan admin: gabungkan tab **Live** dan **Show Aktif** menjadi satu tab **"Streaming Show"**. Toggle LIVE ada di setiap kartu show, dapat diaktifkan kapan saja (bebas jadwal). Player Live realtime memperbarui embed + playlist saat toggle ON. Background countdown memakai gambar kartu show (transparan). Tambah opsi blokir per `browser_id` agar perangkat tidak bisa akses lagi tanpa direset admin.

## Perubahan

### 1. Admin Panel (`src/pages/Admin.tsx`)
- Hapus tab **"Live"** (legacy `live_config_private`) — termasuk `liveCfg`, `liveTokens`, `handleSaveLive`, `handleCreateLiveToken`, dst. (kode masih ada di backend untuk kompatibilitas, tapi tidak diakses dari UI lagi.)
- Rename tab `shows` menjadi **"Streaming Show"** (label & ikon `Radio`).
- Pada list kartu show:
  - Tambah **toggle "LIVE NOW"** langsung di header tiap kartu (tanpa harus buka dialog edit). Klik = update `is_live` instan + auto-mematikan show lain yang sedang live.
  - Tampilkan badge merah berdenyut saat aktif.
  - Tombol cepat: **"Buka Player"**, **"Token & Riwayat"**, **"Edit Detail"**.
- Dialog edit show tetap memuat `ShowLiveControl` lengkap (URL, sumber, sandi, replay).
- Hilangkan validasi "harus pada jam jadwal" — toggle bisa ON kapan pun.

### 2. `ShowLiveControl.tsx`
- Hapus toggle **"Live Otomatis Sesuai Jadwal"** (atau biarkan tersembunyi & default false) karena sekarang murni manual via toggle admin.
- Saat menyimpan, broadcast langsung ke realtime (sudah otomatis lewat update row).

### 3. Player `src/pages/Live.tsx`
- Sudah subscribe `active_shows` row spesifik. Tambahkan: ketika `is_live` berubah `false → true`, **panggil ulang `doUnlock`** (silent) bila user sudah punya token/sandi tersimpan, agar `unlocked.url` & `sources` selalu terupdate dengan embed terbaru.
- Hapus dependency `live_auto_schedule` di logic enable — `enabled = !!data.is_live` saja.
- **`ScheduleCountdown` baru**:
  - Background = `image_url` show (object-cover, opacity ~30% + overlay gelap), agar judul/jadwal/countdown tetap terbaca.
  - Tambah prop `imageUrl`, ambil dari query `active_shows`.
- Player playlist tab (sumber tambahan) sudah otomatis re-render karena `unlocked.sources` di-refresh dari realtime row.

### 4. Blokir per `browser_id`
- Migration: gunakan tabel `blocked_browsers` yang sudah ada (`browser_id`, `unblocked`, `reason`).
- Edge function `unlock-live`: sebelum cek token/password, query `blocked_browsers` untuk `browser_id` user. Jika ada baris dengan `unblocked=false` → return `{ valid: false, reason: 'blocked' }`.
- `Live.tsx`: tampilkan pesan "Perangkat ini diblokir oleh admin" bila reason `blocked`.
- Pada `ShowLiveTokensDialog.tsx` (panel device per token): tambah tombol **"Blokir Perangkat"** di tiap row device → insert ke `blocked_browsers` (`browser_id`, `reason='admin_block'`, `unblocked=false`). Tombol **"Buka Blokir"** bila sudah diblokir → `update unblocked=true`.
- Reset device (hapus dari `active_show_token_devices`) tetap terpisah dari blokir.

### 5. Migration
Tidak ada perubahan skema (`blocked_browsers` sudah ada). Hanya update edge function & UI.

## Aspek Teknis Singkat

```text
Admin tab "Streaming Show"
 └── Card (per show)
      ├── Toggle LIVE (instant update is_live, exclusive)
      ├── Badge ON AIR
      └── Edit Detail → ShowLiveControl (URL/sumber/sandi/replay/token)

Live page
 ├── subscribe active_shows row → re-fetch + silent re-unlock
 ├── ScheduleCountdown (bg = show.image_url + overlay)
 └── Player + playlist refresh dari unlocked.sources realtime

unlock-live edge fn
 ├── 1. cek blocked_browsers(browser_id) → reason='blocked'
 ├── 2. lanjut token / password seperti biasa
```

## Yang TIDAK Berubah
- Replay & semua halaman publik lain.
- Tabel `live_config_private`, `live_tokens` (legacy, disembunyikan saja).
- Schema database (tidak ada migration baru).
