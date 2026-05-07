## Ringkasan Permintaan

User minta 4 fitur besar:
1. **Multi-source playlist**: admin bisa simpan banyak link (YouTube/M3U8/Cloudflare) per replay, user pilih via tombol playlist di bawah player.
2. **Live chat batas 30 pesan** + toggle aktif/nonaktif global oleh admin.
3. **Auto-play** saat buka kartu & saat ganti playlist (termasuk `.live`).
4. **Token akses replay**: admin generate 1 link unik per kartu yang langsung membuka replay tanpa input sandi.

---

## Rencana Implementasi

### 1. Skema Database (migration baru)

Tambah kolom & tabel:
- `replays.sources` (jsonb, default `'[]'`) — array source playlist:
  ```
  [{ id, label, type: 'youtube'|'m3u8'|'cloudflare', url, is_default }]
  ```
  Kolom lama `youtube_id`, `m3u8_url`, `source_type` tetap (fallback bila `sources` kosong).
- `replays.access_token` (text, unique, nullable) — token akses untuk URL ajaib.
- `site_settings` row baru: `live_chat_enabled` (`'true'`/`'false'`).
- Trigger: setelah INSERT comments, hapus baris `comments` per `replay_id` di luar 30 terakhir (`DELETE … WHERE id NOT IN (SELECT id ORDER BY created_at DESC LIMIT 30)`).

### 2. Edge Functions

**Update `get-replay-source`**:
- Return `sources` array (selain field lama untuk backward compat).
- Tambah mode token: jika body berisi `access_token` (tanpa `password`), validasi `replays.access_token = token` → return source tanpa cek sandi.

### 3. Admin Panel (`src/pages/Admin.tsx`)

**Form Add/Edit Replay**:
- Section "Sumber Playlist" dinamis: tombol "+ Tambah sumber", tiap baris punya: Label (mis. "IDN"), Type (dropdown YouTube/M3U8/Cloudflare), URL, radio "default". Bisa hapus baris.
- Form lama tetap sebagai fallback bila admin tidak isi sources.

**Section "Token Akses"** di tiap card replay (di list):
- Tombol "Generate Token" → call RPC/insert random token (`crypto.randomUUID()`).
- Tampil link copy-able: `https://<domain>/?token=<token>&replay=<id>`.
- Tombol "Hapus Token".

**Tab Pengaturan**:
- Toggle "Live Chat Aktif" → tulis `site_settings.live_chat_enabled`.

### 4. Player Multi-Source (`src/components/YouTubePlayer.tsx`)

- State `activeSourceId`. Default = source dengan `is_default=true` atau index 0; kalau tidak ada `sources`, fallback ke field lama.
- Render player sesuai type aktif:
  - `m3u8` → `HlsPlayer` (autoplay).
  - `youtube` → iframe (tambah `autoplay=1&mute=1` agar policy browser lolos saat user sudah klik kartu).
  - `cloudflare` → iframe Cloudflare Stream (`https://iframe.videodelivery.net/<uid>`).
- **Tombol Playlist di bawah player** (mirip screenshot user): scroll horizontal pill buttons, satu per source, aktif highlight primary.
- **Auto-play saat ganti**: ubah source → unmount-mount HlsPlayer / set iframe src baru; HlsPlayer di-set autoplay (`video.play()` di `MANIFEST_PARSED`). Untuk `.live` (no duration), tetap berjalan karena hls.js menangani live secara native.

### 5. HlsPlayer (`src/components/HlsPlayer.tsx`)

- Tambah prop `autoPlay` (default true).
- Pada `MANIFEST_PARSED` & saat `src` berubah: `video.muted = true` (agar autoplay diizinkan), `video.play()`.
- Pertahankan logika resume position untuk VOD; deteksi `levels[0].details?.live` → jangan paksa resume time, langsung live edge.

### 6. Komentar / Live Chat (`src/components/CommentSection.tsx`)

- Fetch hanya 30 pesan terakhir (`order desc limit 30` lalu reverse).
- Cek `site_settings.live_chat_enabled`:
  - Jika false → tampilkan banner "Live chat dinonaktifkan oleh admin", sembunyikan input.
- Subscribe perubahan settings via realtime (channel `site-settings`) supaya toggle admin langsung berlaku.

### 7. Token Auto-Unlock (`src/pages/Index.tsx`)

- Saat mount, baca `?token=<>&replay=<id>` dari URL.
- Call edge function dengan `access_token` → kalau valid, simpan source ke session, set `unlockedIds`, langsung buka `YouTubePlayer` untuk replay tsb.
- Bersihkan query param setelah dipakai.

### 8. Store helpers (`src/lib/store.ts`)

- Update `getReplaySource(replayId, password?, token?)` agar mendukung dua mode.
- Tambah `setReplayToken(id, token|null)` (admin only via authenticated update).
- Tambah `getLiveChatEnabled()` & `setLiveChatEnabled()`.
- Update `getReplays` SELECT untuk include `sources` & `access_token` (token aman karena tanpa token tidak buka apa-apa, tapi lebih aman: token TIDAK dipublic-select; admin fetch via `getReplaysAdmin`).

---

## Detail Teknis Singkat

- **Backward compat**: jika `sources` kosong, builder klien membentuk satu source dari `youtube_id`/`m3u8_url` lama.
- **Cloudflare**: deteksi UID (32 hex) atau URL penuh; embed via `<iframe src="https://iframe.videodelivery.net/<uid>?autoplay=true&muted=true">`.
- **Trigger pruning komentar**: pakai `AFTER INSERT FOR EACH ROW` SECURITY DEFINER untuk hindari masalah RLS saat delete.
- **Token generation**: client `crypto.randomUUID()` cukup; disimpan di `replays.access_token` dengan unique index.
- **Autoplay policy**: paksa `muted=true` saat pertama play; user bisa unmute manual.

---

## Pertanyaan Kecil (non-blocking; default jika tidak dijawab)

- Token akses bersifat **permanen sampai admin hapus** (default), bukan time-limited.
- Maks **5 source** per replay (default).
- `.live` stream **tidak menyimpan posisi** (default langsung live edge).
