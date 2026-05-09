## Perubahan pada halaman /live dan komponen LiveChat

Tiga perbaikan terfokus, tanpa menyentuh sistem lain (player, token, edge function inti, sumber video, watermark, viewer counter, membership, dsb).

---

### 1. Verifikasi sandi LIVE di /live diperketat

Pada `src/pages/Live.tsx`:

- Pastikan form sandi tetap menjadi gate utama: selama `unlocked` masih `null`, halaman hanya menampilkan form input sandi — tidak ada akses ke player atau countdown.
- Tambahkan validasi client-side ringan: jika field kosong, langsung tampilkan pesan "Sandi wajib diisi" tanpa memanggil server.
- Jelaskan pesan error pada `pwError` dengan lebih spesifik untuk `bad_password` dan `bad_membership_password` (keduanya sudah ditangani di `unlock-live`, hanya perlu copy yang lebih ramah: "Sandi yang dimasukkan salah. Coba lagi.").
- Setelah verifikasi sukses (`data.valid === true`), navigasikan user ke tampilan player (yang sudah ada di blok `unlocked` saat `liveActive && activeSource`) — tidak ada perubahan rute, hanya transisi state seperti sekarang.
- Tidak ada perubahan pada `supabase/functions/unlock-live/index.ts` (sandi sudah divalidasi server-side di sana).

### 2. Live Chat bergaya YouTube (terbaru di bawah, auto-scroll)

Pada `src/components/LiveChat.tsx`:

- Balik urutan tampilan: query tetap `order('created_at', { ascending: false }).limit(30)` agar tetap mengambil 30 terbaru, lalu render dengan `messages.slice().reverse()` sehingga **pesan terbaru muncul di bawah**.
- Ubah penanganan realtime INSERT/UPDATE agar pesan baru ditambahkan di akhir array (logika append + cap 30, bukan prepend).
- Ubah auto-scroll: deteksi apakah user "near bottom" (mis. `scrollHeight - scrollTop - clientHeight < 60`) sebelum pesan baru masuk; jika ya, setelah update DOM, set `scrollTop = scrollHeight` agar pesan terbaru selalu terlihat tanpa scroll manual. Jika user sengaja scroll ke atas membaca pesan lama, jangan ganggu posisinya.
- Saat komponen mount pertama kali, scroll otomatis ke bawah agar pesan terbaru langsung tampil.
- Tidak mengubah rate-limit, modal nama, pin, hapus, atau styling dasar.

### 3. Status LIVE hanya saat admin mengaktifkan toggle

Pada `src/pages/Live.tsx`:

- `liveActive` saat ini sudah bergantung pada `status?.enabled || unlocked?.enabled`, dan keduanya berasal dari kolom `is_live` (manual). Pastikan tidak ada efek samping `live_auto_schedule` yang membuat status ON AIR aktif otomatis di halaman ini — jika ditemukan, hapus pengaruh `live_auto_schedule` dari penghitungan `liveActive` agar status hanya bergantung pada `is_live`.
- Saat `is_live = false` (admin belum menyalakan), pengguna yang sudah `unlocked` akan tetap melihat komponen `ScheduleCountdown` (sudah ada). Pastikan badge "OFF AIR" tampil dan badge "ON AIR" tidak muncul sama sekali sampai admin mengaktifkan toggle.
- Saat admin menekan toggle live di admin panel, realtime channel `live-cfg:${showId}` (sudah ada) akan memicu `fetchStatus()` sehingga countdown otomatis berganti ke player tanpa reload.
- Tidak ada perubahan pada admin panel atau pada edge function.

---

### Detail teknis

**File yang akan diubah:**

- `src/pages/Live.tsx`
  - Pesan error lebih ramah untuk sandi salah.
  - Validasi client-side ringan untuk field kosong.
  - Pastikan `liveActive` hanya dari `is_live` (cek dan hapus pengaruh `live_auto_schedule` jika ada).
- `src/components/LiveChat.tsx`
  - Render pesan dengan `.slice().reverse()` (terbaru di bawah).
  - Append pesan baru dari realtime ke akhir (bukan prepend).
  - Logika auto-scroll-to-bottom saat user dekat bawah; scroll-to-bottom on mount.

**Tidak diubah:**

- `supabase/functions/unlock-live/index.ts`
- Player (`HlsPlayer`, `EmbedPlayer`), watermark, viewer counter, presence
- Sistem token, membership, master password
- Admin panel, `ShowLiveControl`, struktur DB, RLS
- `BuyShowDialog`, webhook Pakasir/Fonnte, sorting, kartu replay, halaman lain
