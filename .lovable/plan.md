
## Tujuan

Sederhanakan: **satu panel admin per show** untuk semua kontrol Live & Replay. Tambah `admin_alias` agar admin bisa membuat token link Live via bot (`/createlink`, `/createpub`). Pastikan player Live benar-benar menampilkan embed yang dimasukkan, dan tampilkan countdown bila user sudah punya akses tapi LIVE belum diaktifkan admin.

## Perubahan

### 1. Database (migration)
- Tambah kolom `active_shows.admin_alias TEXT UNIQUE` (nullable, lowercase, untuk lookup cepat seperti pada `replays.admin_alias`).
- Tabel baru `active_show_tokens` (untuk token Live per-show):
  - `id, show_id (FK active_shows), token TEXT UNIQUE, label TEXT, kind TEXT ('personal'|'public'), max_devices INT DEFAULT 1, revoked BOOLEAN, created_at`.
  - RLS: hanya admin yang bisa kelola.
- Tabel baru `active_show_token_devices` (`token_id, browser_id`) untuk membatasi 1 device pada `kind='personal'`.
- Hapus section LIVE legacy global di UI admin (tabel `live_config_private` tetap ada untuk kompatibilitas, tapi panel Admin disederhanakan—hanya panel per-show).

### 2. Admin Panel (UI)
- Hapus / sembunyikan section **"Live Global"** lama.
- Pindahkan `ShowLiveControl` ke tampil **inline pada tiap kartu Show Aktif** (bukan hanya di dialog edit), supaya admin tinggal toggle dari list:
  - Toggle besar **"LIVE NOW"** per kartu (mutually exclusive: aktifkan satu otomatis matikan lainnya).
  - Field **Alias** (untuk command bot).
  - Tombol **"Salin /createlink <alias>"** dan **"Salin /createpub <alias>"** sebagai shortcut.
  - Sumber video (label + tipe + URL) tetap, plus sandi & toggle wajib-sandi.
- Replay mode (m3u8 / yt) tetap sebagai sub-section di kartu yang sama.

### 3. Bot Commands (`fonnte-webhook`)
Tambah dua command admin baru:
- `/createlink <alias|id8>` → buat token Live **personal** (1 device) untuk show terkait. Reply berisi link `https://<site>/live?show=<id>&t=<token>`.
- `/createpub <alias|id8>` → buat token Live **publik** (multi-device, default 50). Reply link sama format.
- Tanpa argumen → tampilkan daftar show aktif beserta alias.
- Tambah `/createlink` & `/createpub` ke `ADMIN_ONLY` set.

### 4. Edge Function `unlock-live`
Branch `show_id` ditambah jalur **token**:
- Jika body berisi `token`, lookup di `active_show_tokens` (bukan `live_tokens`).
- Validasi `revoked`, `kind`, dan limit device via `active_show_token_devices` + `browser_id`.
- Bypass password jika token valid.
- Tetap return `enabled` (false jika belum LIVE & belum dalam jendela auto-schedule), `title`, `type`, `url`, `sources`, `show_date`, `show_time`, `watermark`.

### 5. Halaman `/live?show=<id>` (Player)
- Auto-unlock dari `?t=<token>` sudah ada → tetap dipakai untuk token baru.
- **Countdown baru**: bila `unlocked && !liveActive` dan show punya `show_date/show_time`, tampilkan kartu besar berisi:
  - Judul show, tanggal & jam, lineup avatars.
  - Hitung mundur Hari : Jam : Menit : Detik sampai jadwal show.
  - Jika sudah lewat tapi admin belum toggle LIVE: pesan "Menunggu admin memulai siaran…" + countdown jadi 0.
- Ketika `liveActive` → render `HlsPlayer` / `EmbedPlayer` dari `unlocked.url` / `sources` (sudah ada, dipastikan source valid).
- Realtime subscribe ke `active_shows` row spesifik supaya saat admin toggle ON player langsung tampil tanpa reload.

### 6. Memastikan embed benar-benar tampil
- `ShowLiveControl.save` saat ini meng-update kolom dengan benar—konfirmasi `live_url` & `live_sources` tidak terhapus saat toggle.
- Tambah validasi sederhana: jika `is_live=true` tapi `live_url` & `live_sources` kosong → tampilkan warning di admin sebelum save.
- `EmbedPlayer` untuk type `youtube`: pastikan menerima URL penuh atau ID 11-char (sudah ada normalisasi—dipakai apa adanya).

## Aspek Teknis Singkat

```text
active_shows ──┬── admin_alias (baru)
               └── (kolom live_*/replay_* sudah ada)
active_show_tokens ── show_id, token, kind, max_devices, revoked
active_show_token_devices ── token_id, browser_id

Bot:
  /createlink <alias>  →  token personal (1 device)
  /createpub  <alias>  →  token publik (50 device)

Live page flow:
  status load → token auto-unlock → 
    enabled? player(embed) : countdown(jadwal show)
```

## Yang TIDAK Berubah
- Halaman replay & player replay tetap utuh.
- Kartu replay & sumber lama tidak disentuh.
- `live_config_private` tetap ada untuk kompatibilitas tapi disembunyikan dari UI.

Setelah Anda setuju, saya jalankan migration dulu, baru lanjutkan kode.
