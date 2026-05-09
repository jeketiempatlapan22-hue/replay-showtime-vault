## Tujuan

Lima penyesuaian terfokus pada pembelian show aktif, polling status, halaman show, dan pesan bot WhatsApp. Tidak menyentuh sistem lain (replay, live, auth, admin lainnya).

---

## 1. Polling status pembayaran real-time di dialog QRIS

File: `src/components/BuyShowDialog.tsx`

- Saat status `qr` aktif dan `orderId` ada, jalankan polling `supabase.from('orders').select('status, access_token').eq('id', orderId)` setiap **3 detik** (dipersingkat dari 8 dtk) **selain** subscription realtime yang sudah ada — supaya status tetap berubah ke `paid` walau realtime channel terlambat.
- Tambah indikator visual kecil di bawah QR: "Mengecek status pembayaran… (auto-refresh)" + `last checked` waktu, agar user tahu sistem aktif memantau.
- Saat `status === 'paid'`, hentikan polling, tampilkan token dan ringkasan order — sudah ada, tinggal pastikan polling dibersihkan.

## 2. Pisahkan kartu Show Aktif dari kartu Replay

- `src/pages/Index.tsx`: hapus `<ActiveShowsSection />` dari halaman utama (line 444). Halaman utama hanya menampilkan kartu replay.
- `src/App.tsx`: tambah alias route `/show` → komponen `Shows` (selain `/shows` yang sudah ada) supaya URL yang diminta user bekerja.
- `src/pages/Shows.tsx`: tetap apa adanya — sudah render `ActiveShowCard`. Tambahkan judul / SEO ringkas: H1 "Show Aktif", meta description.
- (Opsional) Tambah link menu di `HamburgerMenu.tsx` ke `/show` jika belum ada.

## 3. Harga show ditetapkan admin & terhubung Pakasir

Saat ini admin mengisi 3 angka (`price_show`, `price_replay`, `pakasir_amount`). Sederhanakan agar admin cukup isi **satu angka** dan otomatis dipakai Pakasir.

- `supabase/functions/create-pakasir-order/index.ts`: untuk `kind === 'show'`, prioritas amount = `price_show > 0 ? price_show : pakasir_amount`. Untuk `kind === 'replay'`: `price_replay > 0 ? price_replay : (pakasir_amount || 2000)` (default Rp 2.000 sudah ada). Validasi minimal Rp 100 tetap.
- `src/components/ActiveShowCard.tsx`:
  - `showPriced = (show.price_show || show.pakasir_amount) > 0`
  - `replayPriced = (show.price_replay || show.pakasir_amount) > 0`
  - `amount` yang dikirim ke `BuyShowDialog` = nilai harga sesuai kind (bukan `pakasir_amount` saja). Tambahkan prop `amount` yang dihitung di tombol klik agar selalu match dengan label tombol.
- `src/pages/Admin.tsx`: tambahkan keterangan kecil di field harga: "Nominal ini akan ditagihkan via QRIS Pakasir." `pakasir_amount` tetap ada sebagai fallback opsional. Tidak ada perubahan skema DB.

## 4. Deteksi nomor WA fleksibel (`6288…`, `+62 822-…`, `088…`)

Normalisasi disamakan di tiga tempat dan toleran terhadap spasi, tanda hubung, dan tanda `+`.

Aturan:
1. Strip semua non-digit.
2. Jika diawali `0` → ganti jadi `62`.
3. Jika diawali `8` (tanpa 0/62) → tambah prefix `62`.
4. Jika sudah diawali `62` → biarkan.
5. Validasi akhir regex: `/^62\d{8,13}$/`.

File yang diupdate (logic sama persis):
- `src/components/BuyShowDialog.tsx` (`normalizePhone`) — sudah benar, tinggal pastikan urutan branch.
- `supabase/functions/create-pakasir-order/index.ts` — sudah benar, dipertahankan.
- `supabase/functions/pakasir-webhook/index.ts` — **tambah branch `startsWith('8')` → `'62' + d`** (sekarang belum ada). Ini memastikan `target` Fonnte selalu valid.
- (Cek juga `supabase/functions/fonnte-webhook/index.ts` jika ada `normalizePhone` serupa — samakan.)

## 5. Pesan WhatsApp menyertakan sandi satuan show

File: `supabase/functions/pakasir-webhook/index.ts`

- Setelah `order` ditemukan dan `status` paid, jika `order.show_id` ada **dan** `order.replay_id` null (artinya pembelian show aktif, bukan replay), query: `select live_password, title, live_require_password from active_shows where id = order.show_id`.
- Jika `live_password` non-empty, sisipkan blok di pesan WA:

  ```
  🔐 Sandi tonton LIVE:
  <password>
  Masukkan sandi ini di halaman Live untuk masuk.
  ```

- Untuk pembelian replay (kind replay / replay_only) pesan tidak berubah (tetap kirim link `/akses?token=...`).
- Tambahkan link tonton live: `${origin}/live?show=${order.show_id}&t=${accessToken}` agar user tinggal klik.

---

## Catatan teknis

- Tidak ada migrasi DB — semua kolom yang dipakai (`price_show`, `price_replay`, `pakasir_amount`, `live_password`) sudah ada.
- Edge function `create-pakasir-order` & `pakasir-webhook` akan otomatis ter-deploy setelah perubahan disetujui.
- Tidak menyentuh: HlsPlayer, fallback VOD, sistem auth, admin panel selain teks bantuan harga, replay flow.
