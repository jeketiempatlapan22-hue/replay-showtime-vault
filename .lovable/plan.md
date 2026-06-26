## Tujuan
Tambah dua menu baru di Admin Panel tanpa menyentuh halaman Live (player & playlist) atau halaman lain yang sudah jalan:

1. **User Membership** — daftar user yang sudah membeli & terkonfirmasi paket membership.
2. **Token Factory** — pusat manajemen seluruh token (Show & Membership), dipisah aktif/kadaluarsa.

## 1. Menu "User Membership"

Tab baru di `src/pages/Admin.tsx` → komponen baru `src/components/admin/MembershipUsersAdmin.tsx`.

Sumber data: `membership_orders` (status='paid') JOIN `membership_tokens` + `membership_packages`.

Per baris ditampilkan:
- Email, Nomor HP, Nama paket, Tanggal beli (`paid_at`), Durasi, Berakhir (`expires_at`), Status (Aktif / Kadaluarsa / Dicabut), Sisa hari
- Token + Password (tombol Copy untuk masing-masing & "Copy link login")
- Sumber: QRIS / Koin

Aksi per baris:
- **Edit**: ubah email, phone, expires_at, max_devices, includes_replays, revoked (dialog)
- **Copy**: token, password, link login penuh
- **Reset device**: hapus semua entri `membership_token_devices` untuk token tsb (kuota device → 0)
- **Hapus**: hapus order + token terkait (konfirmasi AlertDialog)

Filter/cari: input pencarian (email / phone / token), filter status (Semua / Aktif / Kadaluarsa).

## 2. Menu "Token Factory"

Tab baru → komponen baru `src/components/admin/TokenFactoryAdmin.tsx`.

Dua sub-tab utama (Tabs shadcn): **Token Show** dan **Token Membership**.
Di dalam masing-masing ada sub-tab: **Aktif** dan **Kadaluarsa**.

### Token Show
Sumber: `active_show_tokens` JOIN `active_shows` (judul, tanggal show). 
- Aktif = `revoked=false` AND (`expires_at IS NULL` OR `expires_at > now()`)
- Kadaluarsa = sebaliknya
Kolom: Token, Show, Label, Devices terpakai/max, Dibuat, Kadaluarsa, Status.

### Token Membership
Sumber: `membership_tokens` JOIN `membership_packages` + phone/email dari `membership_orders`.
- Aktif = `revoked=false` AND `expires_at > now()`
- Kadaluarsa = sebaliknya
Kolom: Token, Paket, Phone, Devices terpakai/max, Mulai, Kadaluarsa, Status.

### Aksi per baris (kedua jenis)
- **Cari**: input search (token / label / phone / judul show)
- **Reset device**: hapus row di `active_show_token_devices` / `membership_token_devices` untuk token tsb (kuota balik ke 0, bisa dipakai device lain)
- **Blokir**: set `revoked=true` + insert `browser_id` yang pernah login ke `blocked_browsers`
- **Buka blokir**: set `revoked=false` + hapus `blocked_browsers` terkait
- **Hapus**: hapus row token (cascade ke devices)

### Bulk action (khusus tab Kadaluarsa)
- Checkbox select-all + per row
- Tombol "Hapus terpilih" dan "Hapus semua kadaluarsa" (AlertDialog konfirmasi)

## Backend (RPC migration baru)

Tambah security-definer functions (admin-only via `has_role`) di satu migration. Tidak mengubah tabel/skema yang ada, hanya menambah fungsi:

- `admin_list_membership_users(_q text, _status text)` → join orders+tokens+packages
- `admin_update_membership_user(_order_id, _email, _phone, _expires_at, _max_devices, _includes_replays, _revoked)`
- `admin_delete_membership_user(_order_id)` — hapus order + token + devices
- `admin_list_show_tokens(_q, _status)` 
- `admin_list_membership_tokens(_q, _status)`
- `admin_reset_token_devices(_kind text, _token_id uuid)` — kind: 'show'|'membership'
- `admin_block_token(_kind, _token_id)` — revoke + push browser_ids ke blocked_browsers
- `admin_unblock_token(_kind, _token_id)` — un-revoke + bersihkan blocked_browsers terkait
- `admin_delete_token(_kind, _token_id)`
- `admin_bulk_delete_expired_tokens(_kind, _ids uuid[] DEFAULT NULL)` — jika `_ids` null → hapus seluruh yang expired

Semua dipanggil dari client via `supabase.rpc(...)`. Tidak ada edge function baru yang dibutuhkan.

## Integrasi UI
`src/pages/Admin.tsx`:
- Tambah dua tab key: `mb_users`, `token_factory`
- Tambah entri di sidebar menu + label map (header)
- Tambah `<TabsContent>` masing-masing dengan komponen baru
- TIDAK mengubah konfigurasi/tab lain

## Jaminan keamanan area lain
- Tidak menyentuh: `src/pages/Live.tsx`, `EmbedPlayer`, playlist, edge functions yang berhubungan dengan delivery (fonnte, poll, dsb).
- Migration hanya `CREATE OR REPLACE FUNCTION` — tidak ALTER/DROP tabel atau policy yang ada.
- Tidak mengubah struktur token yang sedang dipakai user — hanya menambah aksi admin.

## File yang akan dibuat/diubah
- BARU: `src/components/admin/MembershipUsersAdmin.tsx`
- BARU: `src/components/admin/TokenFactoryAdmin.tsx`
- BARU: migration SQL berisi RPC admin di atas
- UBAH: `src/pages/Admin.tsx` (hanya menambah tab + import; isi tab lain tidak diubah)
