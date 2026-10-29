# Pindah domain: realtime48stream.my.id ke realtimestream.my.id

## Temuan penting
- Token/sandi tersimpan tanpa nama domain, jadi semua token lama tetap berlaku di domain baru. Tidak perlu membuat ulang token: cukup ganti alamat di depannya.
- Domain lama `realtime48stream.my.id` saat ini **tidak punya nameserver** (tidak terdaftar/aktif di DNS) dan tidak lagi terhubung ke project. Artinya link lama tidak bisa dibuka sama sekali, sehingga website tidak bisa mengalihkan pengunjungnya.
- Pengalihan otomatis link lama hanya bisa terjadi kalau domain lama diaktifkan lagi (perpanjang di tempat beli domain), lalu dihubungkan ke project ini. Karena domain utama sudah `realtimestream.my.id`, Lovable otomatis mengalihkan semua kunjungan dari domain lama ke domain baru dengan alamat dan token yang sama (misalnya `/live?show=...&t=...`).

## Yang dikerjakan
1. **Ganti semua alamat lama di website dan sistem** (sekitar 57 tempat): pesan WhatsApp/Telegram pembelian, membership, reseller, buat link admin, link replay, hadiah game, panel Pakasir, dan pengaturan alamat situs di database.
2. **Pengalih di dalam website**: kalau website terbuka lewat domain lama (setelah domain lama aktif lagi), langsung pindah ke domain baru dengan alamat, token, dan sandi tetap utuh, termasuk halaman Live.
3. **Pengaman pemutar Live**: daftar domain yang diizinkan memutar live diubah ke domain baru (domain lama tetap diterima sementara supaya tidak rusak saat transisi).
4. **Link tersimpan di HP pengguna**: link membership/bundel yang tersimpan di perangkat dengan domain lama otomatis ditulis ulang ke domain baru.

## Yang perlu Anda lakukan
- Perpanjang/aktifkan lagi domain `realtime48stream.my.id`, lalu hubungkan ke project ini di Pengaturan Project → Domains (biarkan `realtimestream.my.id` sebagai utama). Tanpa ini, link lama yang sudah dibagikan tidak bisa dibuka.
- Minta pihak Hanabira/IDN menambahkan `https://realtimestream.my.id` ke daftar alamat yang diizinkan. Saat ini mereka hanya mengizinkan domain lama, jadi kalau belum ditambahkan, player IDN di domain baru akan ditolak.

## Detail teknis
- Ganti string di `src/lib/siteOrigin.ts`, `src/main.tsx`, `src/pages/Live.tsx`, komponen admin, dan semua edge function (`_shared/idn-credentials.ts` Origin/Referer, webhook, create-token, dll.), lalu deploy ulang function.
- Migration: update `site_settings` key alamat situs ke `https://realtimestream.my.id`.
- `main.tsx`: jika `location.hostname` mengandung `realtime48stream.my.id`, `location.replace` ke domain baru dengan path+search+hash yang sama.
- Rewrite nilai localStorage yang mengandung domain lama saat app dimuat.
