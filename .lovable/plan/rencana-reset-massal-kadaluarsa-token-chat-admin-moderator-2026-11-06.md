# Rencana: Reset Massal, Kadaluarsa Token, Chat Admin & Moderator

Penting: Website B memakai server Website A. Bagian bertanda **[A]** harus dibuat dari chat Website A (saya siapkan teks perintahnya). Bagian **[B]** saya kerjakan di sini.

## 1. Tombol Master Reset Massal (admin)
- [B] Panel admin → Manajemen User: kartu "Reset Massal Perangkat" dengan pilihan: Semua Membership, Semua Show Live, Semua Replay, Semua Pembelian QRIS, Semua Reseller, atau Semua sekaligus.
- Dialog konfirmasi + jumlah perangkat yang dilepas. Link tetap aktif, langsung bisa dipakai di HP lain.
- [A] Fungsi server `admin_bulk_reset_devices(kategori)` khusus admin, menghapus ikatan perangkat dan mengembalikan jatah reset ke 0.

## 2. Token kadaluarsa langsung dihapus
- [A] Jadwal otomatis (tiap jam): link token membership/show/replay yang tanggal kadaluarsanya lewat langsung dihapus. Tidak ada lagi perpanjangan otomatis durasi.
- [A] Pengecualian: sandi satuan, custom, dan bulanan (master) tetap berlaku 3 bulan sejak dibuat, lalu dihapus.
- [B] Panel admin menampilkan "Kadaluarsa" dan tidak menampilkan token yang sudah lewat.

## 3. Monitor Live Chat admin
- [B] Pesan admin otomatis berbanner "🛡️ Admin" di monitor.
- [B] Klik nama user di chat (hanya admin) → jendela info:
  - User login: email/username + nomor HP pembelian live.
  - User tamu: nomor HP dari pembelian live di HP itu (jika ada), tanda "Tamu".
  - Membership dari token admin/reseller: 6 karakter terakhir token + tanda "Dibuat Admin" / "Dibuat Reseller (nama)".
  - Jika tidak ditemukan: "Tidak diketahui".
- [A] Pesan chat perlu menyimpan siapa pengirimnya (akun / token yang dipakai), dan fungsi `admin_chat_user_info(pesan)` yang hanya bisa dibaca admin. Data ini tidak terlihat oleh user biasa.

## 4. Moderator
- [B] Di jendela info user, admin punya tombol "Jadikan Moderator" / "Cabut Moderator".
- [B] Pesan moderator berbanner "🔰 Moderator"; moderator melihat tombol Hapus, Blokir, Buka Blokir pada pesan di chat live (tanpa melihat nomor/token user).
- [A] Tabel moderator chat (per akun login atau per HP/browser), dan aturan server agar moderator boleh hapus pesan & blokir/buka blokir chat. Peran tetap di tabel terpisah (aman).

## Pertanyaan terbuka
- Moderator hanya untuk user yang login, atau tamu juga boleh? (Rekomendasi: hanya user login, lebih aman.)

## Detail teknis
- B: komponen `BulkDeviceResetAdmin.tsx`, `ChatUserInfoDialog.tsx`; LiveChat.tsx tambah prop `isModerator`, kirim `token_tail`/sumber saat insert lewat fungsi A.
- A: migrasi `live_messages` tambah `user_id uuid`, `access_kind text`, `access_ref text` (nullable); `chat_moderators` + `is_chat_moderator()` security definer; RLS delete live_messages & insert/delete chat_blocks untuk moderator; pg_cron `purge_expired_tokens` menggantikan perpanjangan durasi; fungsi bulk reset dengan `has_role(auth.uid(),'admin')`.
- Urutan: A dulu (server), lalu B (tampilan), lalu publish keduanya.
