# Bundel Show baru bisa dibeli lagi

## Masalah
- Kartu bundel di halaman show menganggap pembeli "sudah punya bundel" hanya karena ada token bundel lama tersimpan di HP, jadi tombol beli tidak muncul lagi walau isi bundel sudah berganti (show baru).
- Saat bayar, sistem mengembalikan token bundel lama milik pembeli yang sama (aturan "1 user 1 token"), sehingga show baru di bundel tidak ikut terbuka.

## Perubahan
1. **Kartu bundel**: status "Bundel aktif" hanya tampil jika token yang tersimpan mencakup semua show di bundel saat ini. Kalau ada show baru yang belum dimiliki, tombol beli QRIS/Koin muncul lagi.
2. **Pembelian**: token lama hanya dipakai ulang kalau isinya sama dengan bundel sekarang. Jika bundel berisi show yang berbeda, dibuat token bundel baru untuk show-show terbaru.
3. **Aturan tetap**: tiap token bundel tetap hanya membuka show sesuai jadwal saat dibeli. Tombol Tonton Live (dan Tonton Replay setelah jadi replay) hanya muncul di show yang termasuk pembelian itu. Pembelian lama tetap berlaku untuk show lamanya.
4. Token bundel di HP disimpan sebagai daftar (bukan satu saja), supaya pembeli beberapa bundel tetap bisa melihat akses masing-masing di profil.

## Detail teknis
- `_shared/bundle.ts` `issueBundleToken`: reuse `existing` hanya jika `existing.show_ids` ⊇ `bundle.show_ids`; selain itu (dan kecuali order_id sama) terbitkan token baru. Deploy fungsi pembayaran yang memakainya (purchase-with-coins, pakasir-webhook, check-pakasir-status, poll-pending-orders, create-pakasir-order bila perlu).
- `src/lib/bundle.ts`: simpan peta token → show_ids di localStorage; `getOwnedBundleFor(showIds)` mengembalikan token hanya bila mencakup bundel saat ini.
- `ShowBundleCard`: pakai `getOwnedBundleFor(bundle.show_ids)`.
- Kartu show per-show tetap memakai sub-token per show (tidak diubah), jadi tombol Tonton hanya di show yang dibeli.
