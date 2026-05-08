Rencana perbaikan player live:

1. Samakan komposisi player live dengan player replay
- Buat live memakai pola playlist yang sama seperti `YouTubePlayer`: pilih sumber aktif yang stabil, jangan remount player kecuali URL/tipe benar-benar berubah.
- Tampilkan tombol playlist live seperti replay dengan prefetch ringan saat hover/focus agar perpindahan sumber lebih halus.
- Pastikan saat admin mengganti URL/playlist realtime, sumber aktif diperbarui tanpa membuat player loncat-loncat bila sumber yang sedang diputar tidak berubah.

2. Perbaiki YouTube embed yang terjebak “Menghubungkan ke pemutar”
- Ubah lifecycle `EmbedPlayer` agar YouTube IFrame API dan fallback iframe tidak saling menimpa.
- Tambahkan timeout aman: jika API YouTube gagal siap, langsung pakai iframe embed `youtube-nocookie` yang terlihat normal, bukan tetap di overlay loading.
- Validasi ID YouTube sebelum render; jika invalid tampilkan error jelas, bukan spinner tanpa akhir.
- Bersihkan instance player saat ganti sumber agar tidak ada player lama yang masih hidup.

3. Stabilkan M3U8/HLS live agar tidak loncat dan lag
- Tinjau konfigurasi `HlsPlayer` untuk live: kurangi recovery yang bisa memicu reset/seek mendadak, dan bedakan recovery live vs replay/VOD.
- Pertahankan buffer mobile yang ringan, tapi beri cukup buffer agar playback lancar.
- Hindari auto-switch sumber terlalu agresif saat error sementara; hanya pindah sumber saat manifest benar-benar gagal/URL tidak bisa diakses.

4. Pastikan pemilihan resolusi M3U8 muncul dan bekerja di show aktif
- Gunakan kontrol resolusi `HlsPlayer` yang sama untuk live dan replay.
- Perbaiki deteksi level kualitas agar daftar resolusi muncul konsisten dari manifest HLS.
- Simpan pilihan resolusi user seperti replay, dan sediakan mode Auto.

5. Verifikasi
- Uji alur live dengan sumber YouTube dan M3U8 dari URL/ID yang valid.
- Cek bahwa overlay loading hilang saat embed berhasil, playlist bisa pindah sumber, kualitas M3U8 bisa dipilih, dan update admin realtime tidak me-reload player secara tidak perlu.