Rencana perbaikan aman:

1. Set ID Hanabira show hari ini
- Pastikan kolom `idn_show_id` untuk active show `Pertaruhan Cinta` berisi `SHECE9`.
- Tidak mengubah data replay, password, token, harga, lineup, atau konfigurasi lain.

2. Kembalikan perilaku player IDN seperti saat live tampil normal
- Batasi perubahan hanya pada alur IDN/Hanabira di halaman Live dan/atau fungsi token IDN jika diperlukan.
- Pastikan source IDN muncul sebagai player live saat `idn_show_id` tersedia.
- Jika IDN gagal resolve sementara, jangan merusak player utama atau source lain.

3. Verifikasi request token dan playback
- Tes fungsi token `idn-stream-token` dengan `showId: SHECE9`.
- Pastikan respons berisi `playbackUrl`, `xApiToken`, `xSecKey`, `xTokenId`, dan `xShowId: SHECE9`.
- Cek log/error terbaru untuk memastikan tidak ada error CORS/token/player.

4. Validasi akhir
- Pastikan perubahan hanya menyentuh bagian yang diperlukan untuk IDN/Hanabira.
- Pastikan live tetap tampil seperti sebelumnya saat admin mengaktifkan live.

Catatan teknis:
- Tidak akan mengubah UI, tema, YouTube player, chat, token membership, bot WhatsApp, atau fitur lain.
- Jika backend perlu diperbarui, perubahan hanya pada data `idn_show_id` show terkait atau fungsi token IDN yang memang dipakai player Hanabira.