# Perintah Baru untuk Website A + Info User di Live Chat Admin

## Kenapa belum muncul
Tombol reset massal, info pengirim saat admin klik nama di chat, banner admin, dan moderator butuh fungsi baru di server bersama milik Website A. Pengecekan database: fungsi-fungsi itu belum ada. Tanpa itu, Website B tidak punya data untuk ditampilkan.

## Langkah
1. **Tulis ulang perintah untuk Website A** (file baru `Perintah_Website_A_v2.txt`, siap tempel). Aturan link token tidak ditulis lagi karena sudah berjalan. Isi:
   - **Reset Massal Perangkat:** admin pilih kategori (Membership / Show / Replay / Pembelian QRIS / Reseller / Semua), sekali klik hapus semua ikatan perangkat. Ada tombol khusus "Reset Semua Membership".
   - **Info pengirim chat:** setiap pesan live chat menyimpan siapa pengirimnya — akun login, nomor HP yang dipakai saat beli live/membership, atau 6 karakter terakhir token + tanda dibuat oleh "Admin" atau "Reseller (nama)". Data ini hanya bisa dibaca admin.
   - **Banner:** pesan admin otomatis berbanner "Admin"; moderator berbanner "Moderator".
   - **Moderator:** admin bisa mengangkat/mencabut; moderator bisa hapus pesan, blokir, buka blokir user di chat.
   - Daftar nama fungsi yang wajib ada di akhir perintah, supaya bisa dicek sudah selesai.
2. **Setelah Website A selesai dan dipublish**, di Website B:
   - Kartu "Reset Massal Perangkat" di panel admin.
   - Monitor Live: klik nama user → jendela info (nomor HP atau 6 karakter token + asal Admin/Reseller, jenis akses), tombol Jadikan Moderator, Blokir, Buka Blokir, Hapus Pesan.
   - Banner Admin dan Moderator di chat penonton dan admin.
3. **Uji:** cek fungsi server sudah ada, lalu klik nama di chat Monitor Live.

## Catatan teknis
Nama yang dimuat di perintah: `admin_bulk_reset_devices(kind)`, `admin_get_chat_sender(message_id)`, `admin_set_moderator(user_id, on)`, `mod_delete_message`, `mod_block_chat`, `mod_unblock_chat`, kolom `live_messages.sender_meta` (tidak bisa dibaca publik) dan `sender_role`. Kirim pesan chat harus lewat fungsi server yang mengisi `sender_meta` dari token/sandi/akun yang dipakai.
