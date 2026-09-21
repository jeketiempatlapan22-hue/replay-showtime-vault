# Replay bebas perangkat, impor bulk lebih lengkap, tema bergerak, dan pencarian replay

## 1. Replay tidak lagi terkunci 1 perangkat

- Semua pengecekan "perangkat" pada jalur replay dilepas: pembelian replay (order), token replay personal, token bundel, dan token show yang sudah jadi replay. Pembeli bisa menonton replay dari HP, PC, maupun iPad dengan akun/link yang sama.
- Pembatasan perangkat tetap berlaku penuh untuk halaman Live (token show aktif dan membership saat menonton live).
- Tombol/menu "Reset Perangkat" dihapus dari profil dan riwayat pembelian untuk item replay; hanya menyisakan reset untuk akses Live/membership.
- Pesan error "perangkat lain sedang menonton" tidak lagi muncul di pemutar replay.

## 2. Impor bulk show: Live Otomatis + Player Utama

Di dialog "Import Bulk Jadwal":
- Sakelar **Live Otomatis Aktif** pada bagian default (berlaku ke semua baris) dan bisa dimatikan per baris.
- Kolom **Player Utama (opsional)** di default dan per baris: tempel URL m3u8 / YouTube / Cloudflare. Jenis sumber dideteksi otomatis dari URL, dan disimpan sebagai sumber utama show.
- Keduanya ikut tersimpan saat "Simpan Show", jadi tidak perlu mengedit satu per satu lagi.

## 3. Tema latar bergerak baru

Menambah pilihan tema pada pemilih tema yang sudah ada, masing-masing dengan animasi:
- **Hujan** — tetesan hujan jatuh + kilat halus sesekali.
- **Pelangi** — pita pelangi melengkung yang bergerak lembut di atas langit cerah.
- **Badai Meteor** — meteor melintas di langit malam.
- **Sakura Malam** — kelopak beterbangan (varian gelap).
- **Awan** — awan bergerak perlahan.

Semua tema memakai warna dari sistem tema (mode terang & gelap ikut menyesuaikan), animasi dimatikan saat pengguna memilih "kurangi gerak" dan diringankan di layar kecil agar tidak berat.

## 4. Pemisahan replay spesial vs reguler + pencarian

- Halaman replay dibagi dua bagian: **Replay Spesial** (paling atas) dan **Replay Reguler**.
- Urutan kategori di bagian spesial: STS → Last Show → Shonichi → Senshuuraku → Anniversary → Spesial.
- Tombol filter diperbarui mengikuti urutan tersebut, ditambah Shonichi dan Senshuuraku.
- **Pencarian kata kunci** diperluas: satu kotak pencarian bisa menggabungkan kategori + nama member, misalnya "sts jessi" akan mencari replay berkategori STS yang lineup/judulnya memuat Jessi. Kata kunci dipecah dan setiap kata harus cocok di salah satu dari judul, kategori, nama show, member unggulan, atau lineup.
- **Pencarian kalender**: tombol kalender untuk memilih satu tanggal atau rentang tanggal; daftar replay langsung disaring ke tanggal tersebut, dengan tombol hapus filter.

## Catatan teknis

- Edge function `get-replay-source`: hapus blok `order_token_devices`, `replay_token_devices`, dan pengecekan perangkat pada token show/bundel di jalur replay; pertahankan validasi kepemilikan (order lunas, token valid, sandi, membership `includes_replays`). Jalur live pada `unlock-live` / `verify-password` tidak disentuh. Tabel perangkat dibiarkan ada (dipakai live), hanya tidak lagi ditulis/dicek untuk replay.
- `DeviceResetPicker` / `DeviceResetButton`: buang target `kind: 'show'` yang berasal dari replay; hanya akses live & membership yang tampil.
- `BulkShowImport.tsx` + `upsertActiveShow`: tambah `live_auto_schedule` dan `live_sources`/`live_url`/`live_type` dari kolom player utama.
- `ThemedBackground.tsx`: tambah komponen tema baru + entri di `ThemeType` dan `THEME_OPTIONS`; tambah keyframes di `index.css` dan varian `.light.theme-*` untuk tiap tema baru.
- `Index.tsx`: kategori spesial dikonstanta, grouping dipecah spesial/reguler, pencarian multi-kata, dan filter tanggal memakai komponen Calendar shadcn (`pointer-events-auto` di popover).
