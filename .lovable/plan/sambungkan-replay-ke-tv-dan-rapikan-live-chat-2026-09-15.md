# Sambungkan Replay ke TV dan Rapikan Live Chat

## Hasil yang akan dibuat
- Tambahkan alur TV/proyektor pada replay yang sudah terbuka: kode 6 digit, salin kode, salin alamat TV, dan panduan screen mirroring seperti halaman live.
- Saat kode replay dimasukkan di halaman TV, replay langsung terbuka di TV tanpa memakai slot perangkat tambahan.
- Sumber replay YouTube/Cloudflare/HLS diteruskan melalui sesi pairing sekali pakai; aturan player live, Hanabira, dan HLS live tidak diubah.
- Pertahankan tombol Cast/AirPlay yang tersedia dan tampilkan pilihan TV dari pemutar replay secara konsisten.

## Tampilan live chat
- Nama user biasa tidak lagi berwarna-warni: menjadi putih, bold, dengan garis/bayangan hitam agar terbaca jelas.
- Nama dan badge admin tetap memakai tampilan saat ini tanpa perubahan.
- Isi komentar user dibuat abu-abu gelap/kontras berbeda dari nama.
- Pesan sematan dibuat sedikit lebih besar dan lebih tegas, dengan batas tinggi agar tidak menutup daftar chat.
- Kolom live chat dibuat lebih panjang pada mobile dan desktop.

## Teknis
- Perluas dialog TV agar dapat menerima payload replay yang sudah tervalidasi, tanpa bergantung pada grant live.
- Perluas halaman penerima kode TV untuk memainkan payload replay langsung menggunakan player yang sesuai.
- Simpan payload hanya dalam pairing sementara yang sudah ada; kode tetap sekali pakai dan kedaluwarsa 10 menit.
- Uji alur replay YouTube dan HLS, salin kode/alamat, tampilan chat mobile, serta pemeriksaan tipe dan tes yang relevan.
