# Ekspor Data Lengkap di Admin Panel

Menambahkan panel "Ekspor Data" di tab **Setelan** admin, dengan tombol **Scan / Refresh Data** dan tombol **Download Dokumen**. Hasil unduhan berisi seluruh data platform sehingga mudah dipindahkan ke projek Lovable lain. Halaman live tidak disentuh sama sekali.

## Isi dokumen

Satu file ZIP berisi:
- `data.json` — seluruh data mentah (siap diimpor ke projek lain)
- `README.txt` — ringkasan jumlah baris per bagian + tanggal ekspor
- CSV terpisah untuk data yang sering dibaca manual: `users.csv`, `replays.csv`, `shows.csv`, `members.csv`, `tokens.csv`

Data yang disertakan:
- User: email, nomor HP, username, saldo koin, riwayat transaksi koin, tanggal daftar, login terakhir
- Token: token show, token membership, token replay personal, token live, beserta device terikat, masa berlaku, status revoke
- Membership: paket, order, user membership, bukti transaksi
- Replay: id/link YouTube, m3u8, playlist sources, sandi replay, sandi master bulanan, tanggal, line up, gambar banner
- Show aktif: judul, tanggal, line up, harga, banner, konfigurasi live per show (termasuk `idn_show_id` Hanabira/IDN, live_sources, live_password)
- Member: nama + URL foto member
- Pengaturan situs: seluruh `site_settings` (tema, nomor WA, QRIS, dll), konfigurasi Hanabira/IDN
- Bot: perintah bot, admin bot
- Reseller: harga per show, tagihan, audit
- Daftar URL file di storage bucket (foto member, banner show, bukti transaksi)

## Catatan penting soal sandi

- Sandi replay, sandi master bulanan, sandi live, dan PIN admin bot tersimpan sebagai teks dan **akan ikut terekspor**.
- Sandi login akun user **tidak bisa diekspor** — sistem auth hanya menyimpan hash satu arah, bukan teks asli. Yang bisa diekspor adalah email, nomor HP, dan ID user; di projek baru user perlu set ulang sandi. Ini batasan sistem, bukan pilihan implementasi.

## Detail teknis

1. Edge function baru `admin-export-data`:
   - Verifikasi JWT + cek `has_role(uid,'admin')`, tolak non-admin.
   - Pakai service role untuk membaca semua tabel di atas + `auth.admin.listUsers()` + `storage.list()` per bucket.
   - Kembalikan satu objek JSON `{ generated_at, counts, data: {...} }`.
2. Komponen baru `src/components/admin/DataExportAdmin.tsx`:
   - Tombol **Scan / Refresh Data**: panggil edge function, tampilkan ringkasan jumlah baris per tabel dan waktu scan terakhir.
   - Tombol **Download Dokumen (.zip)**: bangun ZIP di browser dari hasil scan terakhir (pakai `jszip`), unduh via blob. Kalau belum pernah scan, tombol memicu scan dulu.
   - Peringatan visual bahwa file berisi data sensitif.
3. Render komponen di dalam `TabsContent value="settings"` pada `src/pages/Admin.tsx` (tidak mengubah bagian setelan lain).
4. Tambah dependensi `jszip`.

Tidak ada perubahan pada halaman live, player, atau aturan playlist.
