# Reset Massal + Info User di Live Chat Admin

## Kenapa belum muncul
Fitur-fitur ini (tombol reset massal, info nomor HP/token saat admin klik nama di chat, banner admin, moderator) butuh fungsi baru di server bersama milik Website A. Fungsi itu belum ada di server, jadi tampilan di Website B belum bisa menampilkan apa pun. Website B tidak boleh mengubah server bersama.

## Langkah
1. **Buat ulang perintah untuk Website A** (file baru, lebih tegas dan lengkap, siap tempel):
   - Tombol Reset Massal: pilih kategori (Membership / Show / Replay / Pembelian QRIS / Reseller / Semua), sekali klik hapus semua ikatan perangkat.
   - Token habis sesuai tanggal: langsung kadaluarsa dan dihapus, tanpa tambah durasi. Sandi satuan, custom, bulanan tetap bertahan 3 bulan.
   - Live chat: setiap pesan menyimpan info pengirim (akun, nomor HP pembelian, atau 6 karakter terakhir token + tanda "Admin"/"Reseller"). Hanya admin yang bisa membacanya.
   - Fungsi admin "lihat info pengirim" dari pesan yang diklik.
   - Peran moderator: admin bisa angkat/cabut; moderator bisa hapus pesan, blokir, buka blokir. Banner "Admin" dan "Moderator" di chat.
   - Daftar nama fungsi yang harus ada, supaya bisa dicek selesai.
2. **Setelah Website A selesai dan dipublish**, di Website B:
   - Tambah kartu "Reset Massal Perangkat" di panel admin.
   - Di Monitor Live: klik nama user → jendela info (nomor HP / 6 karakter token + asal Admin/Reseller, jenis akses), tombol Jadikan Moderator, Blokir, Buka Blokir, Hapus pesan.
   - Banner Admin otomatis untuk pesan admin, banner Moderator untuk moderator.
3. Uji: cek fungsi server sudah ada, lalu coba klik nama di chat.

## Catatan teknis
Pengecekan database saat ini: belum ada fungsi reset massal, moderator, atau info pengirim chat (hanya `admin_bulk_delete_expired_tokens`). Perintah akan memuat nama RPC: `admin_bulk_reset_devices(kind)`, `admin_get_chat_sender(message_id)`, `admin_set_moderator(user_id, on)`, `mod_delete_message`, `mod_block_chat`, `mod_unblock_chat`, kolom `live_messages.sender_meta` (tanpa akses publik) dan `role` di pesan.
