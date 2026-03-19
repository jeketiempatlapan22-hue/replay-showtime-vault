

# ReplayTime - Website Plan

## Overview
Website untuk menampilkan koleksi replay show dengan proteksi sandi, tema Ramadhan, dan embedded YouTube player.

## Halaman Utama
- **Header**: Logo "ReplayTime" dengan desain Ramadhan
- **Background**: Hitam kebiruan dengan animasi lentera bergerak dan bulan sabit
- **Playlist per Bulan**: Kartu replay dikelompokkan per bulan, diurutkan dari terbaru ke terlama
- **Kartu Replay** (terkunci): Menampilkan gambar thumbnail, tanggal, judul, kriteria show, dan lineup member. Tombol "Buka" memunculkan input sandi
- **Sistem Sandi**: 
  - Sandi satuan: membuka 1 kartu spesifik
  - Sandi master bulanan: membuka semua kartu di bulan tersebut
- **Player Page**: Setelah sandi benar, pengguna diarahkan ke halaman player embed YouTube (fullscreen/non-fullscreen) tanpa keluar ke YouTube

## Admin Panel
- Dilindungi sandi **dhatul01**
- **Tambah Kartu Replay**: Form dengan field tanggal, judul, lineup member, kriteria show, sandi satuan, YouTube embed ID, dan link gambar
- **Kelola Sandi Master**: Set sandi master berbeda untuk setiap bulan
- **Kelola Kartu**: Edit dan hapus kartu replay yang sudah ada

## Desain & Animasi
- Background hitam kebiruan gradien
- Animasi lentera Ramadhan mengambang
- Bulan sabit bercahaya di sudut atas
- Bintang-bintang berkedip
- Partikel cahaya bergerak

## Responsif
- Layout grid 3 kolom (desktop), 2 kolom (tablet), 1 kolom (mobile)
- YouTube player responsif dengan aspect ratio 16:9
- Navigasi dan kartu menyesuaikan ukuran layar

## Data Storage
- Semua data disimpan di localStorage (tanpa backend/database)
- Data kartu replay, sandi satuan, dan sandi master per bulan

