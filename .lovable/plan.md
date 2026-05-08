# Live Scheduling + Replay Mode dari Admin Panel

## Jawaban singkat
**Bisa, dan aman.** Semua perubahan bersifat *additive* — kita hanya **menambah** kolom & UI baru, tidak mengubah kontrak data tabel `replays`, komponen `ReplayCardComponent`, `EmbedPlayer`, `HlsPlayer`, atau halaman replay yang ada. Halaman/kartu replay lama tetap pakai sumber lama (`replays.*`); fitur baru ini hidup di tabel `active_shows` + halaman `/live`.

## Yang akan dibuat

### 1. Skema database (migration additive ke `active_shows`)
Tambah kolom (semua nullable / default aman):
- `is_live boolean default false` — flag "show ini sedang LIVE sekarang"
- `live_auto_schedule boolean default false` — kalau true, server menganggap LIVE saat now ≥ show_date+show_time
- `live_url text default ''` + `live_type text default 'm3u8'` (`m3u8` | `youtube`)
- `live_sources jsonb default '[]'` — multi-server (label/type/url) seperti referensi
- `live_password text default ''` + `live_require_password boolean default true`
- `replay_mode boolean default false` — saat true, kartu jadi mode replay
- `replay_m3u8_url text default ''`
- `replay_youtube_url text default ''`

Plus RPC `get_active_live()` (SECURITY DEFINER) yang mengembalikan show LIVE aktif (memilih row pertama dengan `is_live=true` ATAU `live_auto_schedule=true AND now() between start..start+8h`) — tanpa membocorkan password/url mentah; URL dikeluarkan hanya lewat edge function `unlock-live` setelah verifikasi password/token (pola yang sudah ada).

Constraint: hanya satu row boleh punya `is_live=true` (partial unique index).

### 2. Edge function `unlock-live` (update)
Saat ini baca dari `live_config_private`. Tambah cabang baru: jika request menyertakan `show_id`, cari row di `active_shows`, cek `is_live` / `live_auto_schedule`, lalu kembalikan `title`, `type`, `url`, `sources`. Cabang lama tetap jalan → backward compatible.

### 3. Admin UI baru: `src/components/admin/ShowLiveControl.tsx`
Dipanggil dari editor show di `Admin.tsx` (di dalam dialog "Edit Show"). Berisi:
- Toggle **"Sedang LIVE"** + toggle **"Live Otomatis sesuai jadwal"** (pakai `show_date` + `show_time` yang sudah ada).
- Field **Live URL** + dropdown tipe (`m3u8` / `youtube`).
- Repeater **Sumber Video** (label, type, url) — meniru screenshot referensi (drag-handle ringan, badge tipe, tombol hapus).
- Field **Sandi Akses LIVE** + toggle "wajib sandi".
- Section **Mode Replay**: toggle `replay_mode`, dua input — `replay_m3u8_url` & `replay_youtube_url`. Saat `replay_mode=true`, tombol "Tonton Replay" di kartu memutar URL ini langsung lewat `HlsPlayer`/`EmbedPlayer` tanpa menyentuh tabel `replays`.

### 4. Halaman `/live` (update kecil)
`src/pages/Live.tsx` saat ini ambil dari `live_config_private`. Tambahkan: pertama coba ambil show LIVE dari `active_shows` via RPC; kalau ada → judul = `active_shows.title`, sumber = `live_sources`. Kalau tidak ada → fallback ke perilaku lama (`live_config_private`). Ini tidak memutus token reseller / akses lama.

### 5. `ActiveShowCard` (update kecil, frontend-only)
- Kalau `replay_mode=true` & ada `replay_m3u8_url`/`replay_youtube_url` → tombol membuka modal player ringan langsung (HlsPlayer untuk m3u8, EmbedPlayer untuk YT). **Tidak** mengubah path lama `replay_id → /replay/:id`.
- Kalau `is_live` (atau `live_auto_schedule` aktif & jadwal jalan) → badge LIVE + tombol "Tonton Live" → navigate ke `/live?show=<id>`.

## Mengapa aman untuk replay yang sudah ada
- Tabel `replays`, halaman `Index.tsx`, `ReplayCardComponent`, player replay, sistem komentar, sistem rating, `/replay/:id` **tidak disentuh**.
- Kolom baru di `active_shows` semuanya punya default → row lama tetap valid.
- `live_config_private` & flow token reseller/password lama tetap jalan sebagai fallback.
- Tidak ada perubahan RLS pada tabel selain menambah policy SELECT untuk kolom baru (sudah `Anyone can view active shows`).

## Detail teknis ringkas
```text
active_shows  ──┬── kartu di /shows & beranda (existing)
                ├── live_* fields  ─► /live (baru, fallback ke live_config_private)
                └── replay_mode + replay_*_url ─► player inline di kartu (baru)

replays (tidak diubah) ─► /replay/:id (existing, tetap jalan)
```

File yang akan ditambah/diubah:
- migration SQL (tambah kolom + RPC + partial unique index)
- `supabase/functions/unlock-live/index.ts` (cabang `show_id`)
- `src/components/admin/ShowLiveControl.tsx` (baru)
- `src/pages/Admin.tsx` (panggil ShowLiveControl di dialog edit show)
- `src/lib/activeShows.ts` (tipe + helper field baru)
- `src/pages/Live.tsx` (prefer active_shows kalau ada)
- `src/components/ActiveShowCard.tsx` (handle replay_mode & is_live)

## Yang TIDAK dilakukan
- Tidak menghapus/mengubah `live_config_private`.
- Tidak mengubah skema/komponen replay lama.
- Tidak mengubah flow QRIS/Pakasir & dialog beli yang sudah ada (tetap kompatibel).
