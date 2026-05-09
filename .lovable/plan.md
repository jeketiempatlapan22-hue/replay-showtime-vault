## 1. Player Live: countdown saat OFF, embed realtime saat ON

File: `src/pages/Live.tsx` (frontend only, tanpa menyentuh komponen lain).

**Masalah saat ini:**
- Sebelum user unlock (belum input sandi/token), area player menampilkan form sandi — bukan countdown + jadwal seperti yang diminta.
- Saat admin men-toggle `is_live` dari OFF → ON, `fetchStatus` hanya mengisi `unlocked.url` jika `hasNoUrl` true. Akibatnya kalau user ter-unlock saat OFF (URL kosong dari server), kadang URL tetap kosong dan player tidak tampil meski toggle sudah ON.

**Perbaikan:**

a. **Selalu tampilkan countdown saat live OFF** — pindahkan blok `ScheduleCountdown` agar dirender ketika `status?.enabled === false`, terlepas dari `unlocked` state. Form sandi/CTA beli show ditampilkan DI BAWAH countdown (atau tetap di bagian akses) tetapi tidak menggantikan area player. Saat OFF, judul + tanggal + jam tampil persis seperti komponen `ScheduleCountdown` saat ini.

b. **Realtime switch OFF → ON** — pada `fetchStatus`, ubah logika update `unlocked` agar saat toggle baru aktif (`enabled && wasOff`):
   - Jika `unlocked` ada tapi `url`/`sources` kosong, isi dari `data.live_url` + `toPrivateSources(data.live_sources)` (pakai URL publik yang baru di-set admin), supaya player langsung mount tanpa menunggu re-unlock.
   - Tetap pertahankan guard "jangan timpa URL yang sudah aktif" agar stream yang sedang berjalan tidak di-remount.
   - Tambahkan path: jika `unlocked` masih null tapi user punya `t` param, tetap panggil `doUnlock({ token: t }, true)` (sudah ada).

c. **Realtime switch ON → OFF** — saat `enabled` berubah jadi false, biarkan `unlocked` tetap, tapi karena `liveActive` jadi false, kondisi render otomatis switch ke `ScheduleCountdown` (sudah ada di branch `liveActive && activeSource`). Cukup pastikan tidak ada early-return yang menyembunyikannya.

Tidak menyentuh: `HlsPlayer`, `EmbedPlayer`, `LiveChat`, `unlock-live` edge function, RLS, schema.

## 2. Pesan bot WhatsApp: sertakan sandi & domain replaytime.lovable.app

File: `supabase/functions/create-token/index.ts` (edge function bot saja).

**Perbaikan:**

a. **Selalu pakai domain `https://replaytime.lovable.app` sebagai fallback** kalau `site_settings.site_origin` kosong. Variabel `origin` diganti:
   ```ts
   const origin = (settingsMap.get('site_origin') as string) || 'https://replaytime.lovable.app';
   ```
   Sehingga `link` dan `liveUrl` selalu valid.

b. **Sertakan sandi replay & sandi live** di pesan WA. Query `replays` ditambah kolom `password`, dan ambil sandi live aktif dari `active_shows` yang `is_active = true AND replay_id = :replayId` (kolom `live_password`). Jika tidak ditemukan, fallback ambil dari `live_config_private.password`.

c. Update `buildAttractiveMessage`:
   - Tambahkan parameter `replayPassword?: string` dan `livePassword?: string`.
   - Sisipkan blok baru di atas baris bonus live:
     ```
     🔑 Sandi Replay: <replayPassword>
     🔑 Sandi Live: <livePassword>
     ```
   - Tampilkan baris hanya jika nilainya ada (filter falsy).

d. **Tidak mengubah** auth, rate limit, struktur `token_deliveries`, RLS, atau pesan dynamic command lain di `bot_commands`.

## 3. Files yang diubah

1. `src/pages/Live.tsx` — restrukturisasi render branch (countdown selalu tampil saat OFF; auto-fill URL pada OFF→ON).
2. `supabase/functions/create-token/index.ts` — fallback origin, fetch sandi, format pesan.

## 4. Tidak disentuh

- Komponen player (`HlsPlayer`, `EmbedPlayer`, `YouTubePlayer`).
- `LiveChat`, `MemberAvatar`, sistem token/RLS, edge functions lain (`unlock-live`, `manage-live`, `fonnte-webhook`, dll).
- Schema database.
