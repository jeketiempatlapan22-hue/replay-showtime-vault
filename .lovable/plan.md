# Plan: Halaman Live, Token Device-Lock, Perbaikan Player

## 1. Halaman Live baru (`/live`)

**Route:** Tambah `/live` di `src/App.tsx`, file baru `src/pages/Live.tsx`.

**Sumber data:** Konfigurasi live disimpan di `site_settings` (key sudah ada) sebagai JSON tunggal `live_config`:
```json
{
  "enabled": true,
  "title": "Live Saat Ini",
  "type": "m3u8" | "youtube" | "cloudflare",
  "url": "...",
  "password": "...",        // opsional, kalau kosong → wajib token
  "require_password": true
}
```
Disimpan via edge function (lihat §3) supaya `password` tak terekspos publik.

**Tampilan:**
- Jika `enabled=false` → halaman menampilkan "Tidak ada live saat ini" + tombol balik.
- Jika `enabled=true` & belum unlock → form sandi **atau** tombol "Punya token? Tempel di URL".
- Setelah unlock → render player sesuai `type`:
  - `m3u8` → `HlsPlayer` yang sudah ada.
  - `youtube` / `cloudflare` → iframe + **overlay anti-klik** (lihat §4).

**Akses via token link:** `/live?t=TOKEN`. Token diverifikasi server-side; jika valid, langsung unlock tanpa sandi.

## 2. Toggle Live & token manager di Admin Panel

Tab baru **"Live"** di `src/pages/Admin.tsx`:
- Switch "Aktifkan Live"
- Pilih tipe (m3u8 / youtube / cloudflare) + input URL/ID
- Input judul + sandi live
- Tombol "Simpan" (memanggil edge function `set-live-config`).
- Sub-section **Token Akses Live**: tabel token dengan kolom Token, Max Device, Device Terdaftar, Aksi (copy link, hapus). Tombol "Buat Token" → input nama + jumlah device (default 1).

## 3. Backend (Lovable Cloud)

**Migrasi DB baru:**
- Tabel `live_tokens`: `id uuid pk`, `token text unique`, `label text`, `max_devices int default 1`, `created_at`, `revoked bool default false`.
- Tabel `live_token_devices`: `id`, `token_id fk → live_tokens`, `browser_id text`, `created_at`, unique(token_id, browser_id).
- RLS: SELECT public hanya untuk count? → lebih aman: **tutup semua akses anon**, semua interaksi via edge function.
- `live_config` disimpan di `site_settings` (key=`live_config`, value=JSON). Karena `site_settings` SELECT publik, **password tidak boleh disimpan plaintext di sana** → simpan password di key terpisah `live_password` yang dibaca hanya server-side oleh edge function (RLS tetap public select → masalah). Solusi: simpan password di kolom `password` tabel baru `live_config_private` (RLS deny anon, hanya service-role yang baca via edge function).

**Edge functions baru (semua `verify_jwt = false`, validasi manual):**
1. `get-live-config`: kembalikan `{enabled, title, type, has_password}` tanpa URL/password.
2. `unlock-live`: input `{password?, token?, browser_id}`. Kalau token: cek valid & belum revoked, kalau `live_token_devices` count < max → tambahkan browser_id; kalau browser_id sudah ada → izinkan. Kalau password: cocokkan dgn `live_config_private.password`. Sukses → kembalikan `{url, type, title, session_token}` (session_token JWT singkat ~6 jam disimpan di sessionStorage).
3. `set-live-config` (admin only, validasi role): set config.
4. `manage-live-tokens` (admin only): create / list / revoke token.

## 4. Overlay Anti-Klik untuk YouTube/Cloudflare

Komponen baru `src/components/EmbedPlayer.tsx`:
- Iframe YouTube pakai `enablejsapi=1` + IFrame Player API supaya kita bisa kontrol `playVideo/pauseVideo/setVolume/mute/unMute` dari luar.
- Overlay `<div>` absolut di atas iframe (`pointer-events: auto`) yang menelan semua klik. Di atas overlay, render kontrol custom: tombol play/pause, slider volume, fullscreen.
- Untuk Cloudflare Stream: pakai Stream Player SDK yang punya API serupa, atau iframe + overlay (Cloudflare punya postMessage API).
- Hasil: user tak bisa klik logo YouTube / "Watch on YouTube", tapi tombol custom kita berfungsi.

Komponen ini dipakai di Halaman Live **dan** di `YouTubePlayer.tsx` agar konsisten.

## 5. Perbaikan Volume Auto-Mute saat masuk replay/live

**Masalah saat ini:** `HlsPlayer` set `video.muted = true` di mount karena syarat autoplay browser.

**Perbaikan:**
- Simpan preferensi volume terakhir user di `localStorage` (`replaytime-volume`, `replaytime-muted`).
- Coba `video.play()` **unmuted** dulu; jika promise reject → fallback `muted=true` lalu play, dan tampilkan tombol "Tap untuk aktifkan suara" yang besar di overlay.
- Untuk EmbedPlayer YouTube: sama; `setVolume(savedVolume); unMute();` setelah `onReady`, fallback mute jika autoplay-with-sound diblokir browser.
- Setiap user ubah volume → simpan ke localStorage; player berikutnya pakai nilai itu.

## 6. Fix Resolusi Sering Berubah Sendiri

**Penyebab:** `capLevelToPlayerSize: true` + ABR aktif → hls.js menurunkan kualitas otomatis walau user pilih manual.

**Perbaikan di `HlsPlayer.tsx`:**
- Saat `selectQuality(idx)` dengan `idx !== -1`: set `hls.currentLevel = idx` **dan** `hls.autoLevelCapping = idx` + simpan pilihan ke `localStorage` (`replaytime-quality-height`).
- Set `capLevelToPlayerSize = false` ketika user memilih manual (re-create instance atau pakai `hls.capLevelToPlayerSize = false`).
- Pada `MANIFEST_PARSED`: jika ada saved quality height, cari level dengan height match dan terapkan otomatis.
- Pada `LEVEL_SWITCHED`: jika user mode manual dan level berbeda dari pilihannya → paksa kembali (`hls.currentLevel = userPick`).

## 7. Tampilan & Navigasi

- Tambah link "Live" di `HamburgerMenu.tsx` dengan badge "● LIVE" merah berdenyut jika `live_config.enabled`.
- Halaman Live mengikuti tema yang sama (`ThemedBackground`).

## File yang Dibuat/Diubah

**Baru:**
- `src/pages/Live.tsx`
- `src/components/EmbedPlayer.tsx`
- `supabase/functions/get-live-config/index.ts`
- `supabase/functions/unlock-live/index.ts`
- `supabase/functions/set-live-config/index.ts`
- `supabase/functions/manage-live-tokens/index.ts`
- Migrasi: tabel `live_tokens`, `live_token_devices`, `live_config_private`.

**Diubah:**
- `src/App.tsx` (route `/live`)
- `src/pages/Admin.tsx` (tab Live + token manager)
- `src/components/HlsPlayer.tsx` (persistent quality + unmute logic)
- `src/components/YouTubePlayer.tsx` (pakai EmbedPlayer untuk YT/CF + unmute)
- `src/components/HamburgerMenu.tsx` (link Live + badge)

Setelah disetujui, saya akan mengimplementasikan semuanya berurutan dan menjalankan migrasi DB + deploy edge functions secara otomatis.