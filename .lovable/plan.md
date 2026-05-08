## Tujuan

1. Untuk user yang membuka link dengan token publik atau token multi-device (`max_devices > 1`):
   - Tidak menampilkan tombol "Reset perangkat" di halaman Live.
   - Tidak pernah otomatis logout (kicked) saat polling revalidasi token tiap 60 detik, walau baris device-nya dihapus admin atau saat ada race condition.
2. Live Chat: pesan terbaru selalu terlihat tanpa user perlu scroll. Untuk melihat chat lama, user scroll ke bawah secara manual.

## Perubahan

### A. Edge function — jangan kick token multi-device saat revalidasi senyap

**`supabase/functions/unlock-live/index.ts`**
- Tambahkan parameter opsional `silent: boolean` di body request.
- Pada cabang `active_show_tokens` (≈ baris 83–97) dan `live_tokens` (≈ baris 132–154):
  - Jika `t.max_devices > 1` dan device belum terdaftar:
    - Coba `insert` device baru.
    - Bila kuota penuh DAN `silent === true` → kembalikan `valid: true` dengan flag `soft: true` (tidak meng-kick user yang sudah terhubung).
    - Bila kuota penuh dan bukan silent (akses pertama) → tetap `device_limit` seperti sekarang.
  - Token personal (`max_devices = 1`) tidak berubah.
- Token revoked / blocked tetap menyebabkan logout (security tetap dijaga).

### B. Halaman Live — sembunyikan tombol reset & jangan tampilkan kicked

**`src/pages/Live.tsx`**
- Tambahkan state `tokenInfo` (kind, max_devices) yang diisi dari respons `unlock-live` (nilai baru `kind`, `max_devices` ikut dikirim balik dari edge function — non-sensitif).
- Tombol "Reset perangkat membership saya" (≈ baris 488) dan "Reset perangkat ini" (≈ baris 528):
  - Sembunyikan jika user mengakses lewat `?t=` (token link), bukan membership.
  - Tetap tampil hanya saat `mtoken` membership aktif dan `max_devices = 1`.
- `doUnlock(..., silent=true)` ikut mengirim flag `silent: true` ke edge function.
- Pada hasil silent dengan `valid: false` namun `reason !== 'revoked'` dan `reason !== 'blocked'`: jangan set `kickedMsg`, jangan hapus `unlocked` — user tetap di dalam.

### C. Live Chat — pesan terbaru di atas, scroll bawah untuk history

**`src/components/LiveChat.tsx`**
- Pada `refresh()`: hilangkan `.reverse()` agar `messages` urut dari paling baru ke paling lama.
- Realtime `INSERT`: prepend pesan baru → `[m, ...prev].slice(0, 30)`.
- Pinned banner tetap di paling atas.
- Daftar pesan menggunakan order normal (atas = terbaru). Container tetap scrollable; user scroll ke bawah untuk membaca chat lama.
- Hapus efek auto-scroll ke bawah (tidak diperlukan lagi). Tambah efek ringan: bila scrollTop user ≤ 40px (sedang di atas), pastikan `scrollTop = 0` saat ada pesan baru, sehingga pesan terbaru selalu terlihat tanpa mengganggu user yang sedang membaca history.

## Catatan

- Tidak ada perubahan skema database.
- Field `kind` & `max_devices` token bukan rahasia; aman dikirim balik dari edge function untuk dipakai UI.
- Verifikasi setelah implementasi:
  1. Buka link token publik (`max_devices > 1`) di 2 device → tombol reset tidak muncul, kedua sesi tetap stabil >2 menit.
  2. Admin hapus baris device dari token publik → user tidak terpental.
  3. Live chat: kirim pesan dari device lain → muncul di atas tanpa harus scroll.
  4. Scroll ke bawah di live chat → riwayat lama terlihat, posisi tidak terganggu saat ada pesan baru.
