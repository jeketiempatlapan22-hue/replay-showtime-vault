# Halaman Reseller

## Tujuan
Halaman `/reseller` agar nomor yang terdaftar di `bot_admins` bisa membuat link token akses (1 device) untuk **show aktif** atau **replay**, lengkap dengan **pesan template WA** siap salin. Setiap aksi "Buat & Salin" selalu menerbitkan token BARU.

## Database (migrasi)
Tambah kolom PIN di `bot_admins`:
- `pin` text default `''` — sandi reseller (di-set admin di panel).
- `last_login_at` timestamptz nullable — opsional, untuk log.

Tambah RPC `SECURITY DEFINER`:
- `reseller_login(_phone text, _pin text)` → return `{ ok, phone, label }`. Cek `enabled=true` & `pin` cocok. Tidak mengembalikan PIN. Rate limit pakai `login_attempts` (re-use fungsi existing).
- `reseller_list_shows()` → return show aktif (id, title, show_date, show_time, image_url, category, is_live).
- `reseller_list_replays(_limit int, _offset int, _q text)` → return list replay (id, title, show_name, date, image_url).

Catatan: RPC dipanggil via anon dari halaman /reseller; karena `SECURITY DEFINER`, tidak butuh RLS tambahan. Sesi reseller disimpan di `sessionStorage` (`reseller_phone`) — tidak persisten.

## Edge Functions

### 1. `reseller-auth` (POST)
- Input: `{ phone, pin }`. Normalisasi nomor (62…).
- Cek rate limit 5x/10min via `check_login_lock` + `record_login_attempt`.
- Verifikasi via `bot_admins` (enabled + pin match, perbandingan konstanta).
- Output: `{ ok:true, phone, label }` (tanpa token JWT — sesi cuma di client).

### 2. `reseller-create-token` (POST)
- Input: `{ phone, pin, kind: 'show'|'replay', target_id }`.
- Re-verifikasi `phone+pin` di setiap request (stateless, anti-spoof).
- Untuk `kind='replay'` → buat row baru di `replay_personal_tokens` (max_devices=1, label=`reseller:<phone>`). Link: `/akses?token=…&replay=<id>`.
- Untuk `kind='show'` → buat row baru di `active_show_tokens` (kind='personal', max_devices=1, label=`reseller:<phone>`). Link: `/live?token=…&show=<id>`.
- **Selalu generate token baru** (40 char, `crypto.randomUUID()` x2). Tidak ada path reuse.
- Render pesan WA pakai template `wa_message_template` dari `site_settings` (sama seperti `create-token`), variabel: title, link, date, password (sandi show / sandi replay), site.
- Catat ke `token_deliveries` (`source='reseller'`, `requested_by=phone`).
- Output: `{ ok, token, link, message, title }`.

## Frontend

### Route baru
- `src/pages/Reseller.tsx` ditambahkan ke `App.tsx` → `/reseller`. ProtectedShell tetap aktif (devtools detector OK).
- Tidak ditampilkan di BottomNav/HamburgerMenu (akses via URL langsung).

### Halaman `Reseller.tsx`
Dua state:
1. **Login**: form Nomor HP + PIN → panggil `reseller-auth`. Simpan `{phone, pin, label}` di `sessionStorage`.
2. **Dashboard reseller**:
   - Header: "Halo, {label}" + tombol Logout.
   - Tabs: **Show Aktif** | **Replay**.
   - Tab Show: grid kartu show (image, title, tanggal/jam, badge LIVE). Tombol "Buat & Salin Link".
   - Tab Replay: search bar + list paginasi (20/halaman) kartu replay (image, title, show_name, tanggal). Tombol "Buat & Salin Link".
   - Klik tombol → panggil `reseller-create-token` → otomatis `navigator.clipboard.writeText(message)` → toast "Link & pesan tersalin (1 device)". Dialog kecil menampilkan link + pesan + tombol salin ulang.
   - Setiap klik selalu hit endpoint → token baru. Tidak ada cache token di UI.

### Admin Panel
- Tambah kolom **PIN** di `src/components/admin/BotAdmin.tsx` (input text + tombol "Simpan PIN"). Tampilkan PIN sebagai password mask + toggle lihat.
- Tampilkan link `/reseller` sebagai info untuk dishare ke reseller.

## UI/Styling
Pakai design tokens existing (Card, Button, Tabs, Input, Badge dari shadcn). Responsif mobile-first (viewport ~484px).

## Detail Teknis
- Normalisasi phone: hilangkan spasi/dash, "0…" → "62…", "+62…" → "62…".
- Verifikasi PIN: bandingkan plaintext (sesuai pola existing `live_config_private.password` / `master_passwords`). Tidak hash — konsisten dengan project.
- CORS: pakai header standar Lovable Cloud (Allow-Origin *).
- `verify_jwt = false` untuk kedua function (default Lovable).
- Tidak menyentuh sistem auth Supabase user; sesi reseller murni di sessionStorage.
- Format pesan WA: re-use renderer template yang sama dengan `create-token` agar identik dengan pesan bot.

## File yang Dibuat/Diubah
- Migration: tambah `bot_admins.pin`, RPC `reseller_login`, `reseller_list_shows`, `reseller_list_replays`.
- `supabase/functions/reseller-auth/index.ts` (baru)
- `supabase/functions/reseller-create-token/index.ts` (baru)
- `src/pages/Reseller.tsx` (baru)
- `src/App.tsx` (tambah route `/reseller`)
- `src/components/admin/BotAdmin.tsx` (tambah field PIN)

## Yang TIDAK diubah
Player (HLS/Embed/YouTube), webhook bot, halaman lain, sistem auth user.
