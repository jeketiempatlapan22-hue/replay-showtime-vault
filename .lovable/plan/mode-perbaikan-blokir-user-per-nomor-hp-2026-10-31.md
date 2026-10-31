# Mode Perbaikan & Blokir User per Nomor HP

## 1. Mode Perbaikan (Maintenance)
- Admin dapat tombol **"Mode Perbaikan: ON/OFF"** di panel admin (menu Pengaturan/Keamanan), plus kolom pesan opsional.
- Saat ON: semua halaman (beranda, replay, show, koin, game, profil, dll.) menampilkan layar **"Website sedang dalam perbaikan"**.
- Tetap bisa diakses: halaman **Live** (`/live`, `/kunci`, live gratis, TV) dan panel admin `/adpan`.
- Berubah otomatis tanpa reload (dicek berkala & realtime).

## 2. Cari & Blokir User lewat Nomor HP
- Di menu Manajemen User: kotak cari **nomor HP** (format 08…/62…/+62… disamakan). Hasil: email, username, nomor, tanggal daftar, jumlah membership/pesanan, status blokir.
- Tombol **Blokir / Buka Blokir** + alasan (untuk catatan admin).
- Daftar "User Diblokir" untuk melihat semua yang sedang diblokir.

## 3. Efek Blokir
- User diblokir yang login: seluruh website diganti layar **"Website dalam perbaikan"** (bukan pesan diblokir).
- Akses Live ditolak di server meski punya link token, sandi membership, sandi bundel, atau pembelian show — jawaban: "Website dalam perbaikan".
- Pemeriksaan berdasarkan akun **dan** nomor HP: semua token/membership/pesanan yang terdaftar dengan nomor itu ikut ditolak, jadi membuka link di HP lain tanpa login pun tetap tertolak.
- Replay juga ditolak dengan alasan yang sama.

## Detail Teknis
- Tabel baru `blocked_users` (user_id, phone dinormalisasi, reason, active, created_by) — RLS admin-only, GRANT sesuai aturan.
- `site_settings` key `maintenance_mode` & `maintenance_message` (sudah ada tabelnya, baca publik).
- RPC admin: `admin_search_users_by_phone`, `admin_block_user`, `admin_unblock_user`, `admin_list_blocked_users` (cek `has_role admin`).
- Shared helper edge function `_shared/user-block.ts`: `isBlocked({userId, phone})`; dipanggil di `unlock-live`, `get-replay-source`, `verify-password`, `idn-stream-token`, `tv-pair`/`tv-stream`, membership/bundle token resolvers — mengembalikan error `maintenance`.
- Frontend: `MaintenanceGate` di App.tsx membungkus rute non-live; cek status blokir user login via RPC `am_i_blocked`. Kunci.tsx/Live.tsx menampilkan pesan "Website dalam perbaikan" untuk error `maintenance`.
- UI admin: bagian baru di `UserManagement.tsx` + toggle di pengaturan situs.
- Deploy ulang edge function terkait; tampilan website perlu publish ulang.
