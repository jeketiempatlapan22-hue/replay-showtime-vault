# Monitor Live, Buat Link Admin, Membership Reseller Tanpa Paket, Hapus Otomatis Token Kadaluarsa

Halaman Live untuk penonton tidak diubah, dan aturan Hanabira/HLS tetap sama.

## 1. Menu "Monitor Live" di panel admin
- Tab baru di panel admin. Admin memilih show yang sedang aktif atau live.
- Isinya sama dengan yang dilihat penonton:
  - Pemutar live dengan tombol pilihan sumber yang sama (Player IDN, Player Utama, dan sumber lain).
  - Jumlah penonton, dihitung dari saluran yang sama dengan penonton gratis dan berbayar.
  - Live chat show tersebut.
- Admin mengetik di chat sebagai "🛡️ Admin". Admin juga bisa menyematkan dan menghapus pesan langsung dari tab ini.
- Admin mendapat izin nonton lewat jalur khusus admin, yang diperiksa di server. Karena itu admin tidak memakai slot perangkat dan tidak dihitung sebagai penonton ganda.

## 2. Menu "Buat Link" di panel admin
- Tab baru dengan tiga bagian, sama seperti di halaman reseller: **Show**, **Replay**, **Membership (1 bulan / 2 bulan)**.
- Setiap klik selalu membuat link dan token baru yang unik di server, tidak pernah menyalin token lama.
- Ada tombol salin pesan siap kirim (link + sandi). Semua link tercatat di riwayat token dengan sumber "admin".
- Link dari admin tidak masuk tagihan reseller.

## 3. Membership reseller tanpa paket admin
- Reseller selalu melihat dua pilihan tetap: **Membership 1 Bulan (31 hari)** dan **Membership 2 Bulan (62 hari)**, walaupun admin tidak membuat paket.
- Paket buatan admin yang diatur "Tampilkan ke reseller" tetap muncul seperti sekarang.
- Token baru: 12 karakter. Sandi: 6 huruf/angka acak.
- **Sandi berganti tiap 24 jam** untuk token membership baru. Sandi lama tetap bisa dipakai, jadi link yang sudah dibagikan tidak pernah rusak. Sandi yang berlaku sekarang terlihat di dashboard membership user dan di daftar admin.
- Membership lama tidak diubah: token dan sandinya tetap berlaku seperti sekarang.

## 4. Token membership kadaluarsa terhapus otomatis
- Pembersihan otomatis berjalan tiap jam. Token membership yang masa berlakunya sudah habis dihapus dari database beserta daftar perangkatnya, baik buatan admin maupun reseller.
- Riwayat tagihan dan audit reseller tetap disimpan, jadi perhitungan tagihan tidak berubah.

## Detail teknis
- `src/components/admin/LiveMonitorAdmin.tsx`:
  - Memakai ulang `HlsPlayer`/`EmbedPlayer`, logika pilihan sumber dari `Live.tsx`, `useViewerCount(showKey)`, dan `LiveChat` dengan mode admin (`isAdmin`, sematkan/hapus).
  - Izin nonton berasal dari edge function baru `admin-live-grant`. Fungsi ini memeriksa peran admin, lalu mengembalikan sumber dan grant memakai `_shared/stream-grant.ts` dan `idn-credentials`, sama dengan jalur penonton.
  - Pesan admin disisipkan lewat policy admin yang sudah ada di `live_messages`. Kalau policy itu tidak mengizinkan admin menyisipkan pesan, policy khusus admin ditambahkan.
- `src/components/admin/AdminLinkMaker.tsx` memanggil edge function baru `admin-create-link` (khusus admin, dicek lewat JWT + `has_role`):
  - kind `show`: token baru di `active_show_tokens`.
  - kind `replay`: token baru di `replay_personal_tokens`.
  - kind `membership`: 31/62 hari.
  - Semua pembuatan dicatat ke `token_deliveries` dengan source `admin`.
- Migrasi:
  - Tabel `membership_token_passwords (token_id, password, created_at)` dengan GRANT, RLS, dan akses khusus admin/service.
  - Kolom `membership_tokens.password_rotating boolean default false`.
  - Fungsi `purge_expired_membership_tokens()` dan jadwal cron tiap jam.
- `reseller-create-membership`: `package_id` opsional dengan nilai `preset_1m`/`preset_2m` (tanpa paket, `package_id = null`), sandi 6 karakter, `password_rotating = true`, dan simpan sandi pertama.
- `Reseller.tsx`: dua kartu tetap ditambahkan ke daftar paket.
- Rotasi sandi: cron harian membuat sandi baru untuk token yang `password_rotating = true`.
- Semua pemeriksaan sandi membership di `unlock-live`, `verify-password`, dan `get-replay-source` diubah: lolos jika sandi cocok dengan `membership_tokens.password` atau salah satu entri di `membership_token_passwords`.
- `get_my_memberships` dan daftar admin menampilkan sandi terbaru.
- Tab baru didaftarkan di `Admin.tsx`.
