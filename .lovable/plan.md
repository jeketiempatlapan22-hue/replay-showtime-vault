# Domain Replay Rahasia + Pengecualian Halaman Reseller

## Yang akan dibuat
1. **Halaman Reseller tetap terbuka** saat Mode Perbaikan aktif (sama seperti Live, TV, admin).
2. **Domain Replay Rahasia** (contoh: `replay-xxx.my.id`):
   - Tampilannya sama persis dengan halaman utama (daftar replay per bulan).
   - **Selalu terbuka** walaupun admin menyalakan Mode Perbaikan.
   - Domain utama `realtimestream.my.id` tetap tertutup saat Mode Perbaikan.
   - Domain rahasia tidak lagi dialihkan otomatis ke domain utama.
3. **Pengaturan di admin (menu User, di bawah Mode Perbaikan):** kolom "Domain Replay Rahasia". Admin bisa mengganti domain kapan saja tanpa ubah kode.
4. **Semua pesan template** (membership, show satuan, bundel, reseller, game, kirim ulang WA/Telegram) memakai domain rahasia itu untuk baris "Link Replay". Kalau kolom kosong, tetap pakai domain utama.

## Yang perlu Anda lakukan
- Beli atau sambungkan domain baru di **Pengaturan Proyek → Domains** (domain tidak bisa saya buatkan otomatis). Lalu kabari nama domainnya, atau isi sendiri di kolom admin.
- Catatan: domain rahasia hanya "rahasia" selama tidak disebar. Siapa pun yang tahu alamatnya bisa membukanya.

## Detail teknis
- `MaintenanceGate.tsx`: tambah `/reseller` ke daftar terbuka; baca `site_settings.replay_origin`; jika `window.location.hostname` sama dengan host itu, lewati blokir mode perbaikan (blokir user per nomor HP tetap berlaku).
- `main.tsx` dan CORS guard di `Live.tsx`: jangan alihkan host replay rahasia ke domain utama (izinkan host dari setting; fallback daftar statis jika setting belum terbaca).
- Admin `UserBlockAdmin.tsx`: input + simpan `replay_origin` ke `site_settings`.
- Edge functions: helper `_shared/replay-origin.ts` → `replay_origin || site_origin`; ganti teks hardcode `realtimestream.my.id` dan `{site}` pada baris Link Replay di check-pakasir-status, poll-pending-orders, send-membership-token-wa, resend-membership-wa, resend-show-wa, purchase-membership-with-coins, reseller-create-token, get-access-info, fonnte-webhook, game-play, lalu deploy ulang. Link Live tetap memakai domain utama.
