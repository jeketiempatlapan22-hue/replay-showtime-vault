# Perbaikan Player Replay YouTube

## Tujuan
Membangun ulang kendali embed YouTube menjadi satu jalur yang stabil agar suara tidak menghentikan video, waktu terus berjalan, seek dan percepatan berfungsi, serta kualitas dimulai dari level tertinggi yang tersedia.

## Perubahan
- Hapus jalur kontrol ganda dan watchdog yang saling bertabrakan antara API YouTube, pesan iframe, dan state tampilan.
- Jadikan status asli player YouTube sebagai sumber utama untuk play/pause, mute, volume, waktu, durasi, seek, dan kecepatan.
- Mulai autoplay secara muted sesuai aturan browser, lalu aktifkan suara dan lanjutkan playback melalui satu gesture pengguna tanpa perintah berulang.
- Perbarui waktu lebih sering dan lakukan seek saat slider digeser maupun dilepas, termasuk tombol mundur/maju 10 detik.
- Terapkan kualitas tertinggi yang benar-benar tersedia terlebih dahulu, lalu turunkan satu tingkat hanya setelah buffering berulang.
- Pertahankan fallback embed bawaan YouTube bila API diblokir, tanpa mengubah aturan HLS atau Hanabira.

## Verifikasi
- Periksa tipe aplikasi.
- Uji player di preview: autoplay, aktifkan suara, play/pause, waktu berjalan, slider, ±10 detik, pilihan kecepatan, dan fullscreen.
- Uji tampilan desktop dan mobile.