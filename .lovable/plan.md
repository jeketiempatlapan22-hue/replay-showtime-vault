## Tujuan
Beberapa perbaikan UX + fitur baru tanpa menyentuh halaman Live (player, playlist) dan aturan Fonnte:
1. Hilangkan kolom/teks "Sandi" (selain "Sandi Replay") di alur membership.
2. Halaman Membership jadi dashboard premium kalau user sudah punya membership aktif.
3. Tombol "Beli" pada kartu show aktif berubah jadi "Tonton Live" untuk user login yang punya membership aktif.
4. Upload bukti transaksi membership (fallback kalau Pakasir/Fonnte gagal).
5. Admin panel: nomor WA admin yang bisa diubah + galeri bukti transaksi + auto-hapus 7 hari.
6. Pastikan `realtime48stream.my.id` jadi domain utama di semua link (termasuk link replay personal).

---

## 1. Hapus sandi non-replay
Hanya "Sandi Replay" yang boleh muncul. Sandi token membership untuk akses Live ditiadakan dari UI.

- `src/pages/Membership.tsx`: hapus tampilan `successPassword`, tetap simpan kredensial token saja.
- `src/components/admin/MembershipUsersAdmin.tsx`: hapus tombol/baris "Sandi" (kunci 🔒).
- `src/components/admin/MembershipOrdersDialog.tsx`: hapus kolom password jika ada.
- Tetap simpan kolom DB `membership_tokens.password` (jangan diubah skema, dipakai logic lain) — hanya disembunyikan dari UI.
- Khusus "Sandi Replay" (master/replay password) tetap ditampilkan di dashboard membership.

## 2. Dashboard Membership Premium
Di `src/pages/Membership.tsx`: deteksi `get_my_memberships()` → kalau ada baris `status='paid'` & belum expired & belum revoked, render `<MembershipDashboard />` ALIH-ALIH list paket.

Komponen baru `src/components/MembershipDashboard.tsx` menampilkan:
- Nama paket, tanggal mulai, kadaluarsa, sisa hari (progress bar).
- Token membership (mono, tombol Copy & tombol "Reset Perangkat" via `DeviceResetButton` yang sudah ada — kind=membership).
- Sandi Replay (ambil dari `master_passwords` aktif atau `replay_info` paket — gunakan endpoint publik yang sudah ada `master_passwords` policy publik).
- `replay_info` paket sebagai teks panduan.
- Tombol primer **"Tonton Live"** → navigate ke `/live?mtoken=<token>`.
- Tombol sekunder: "Lihat Replay" → `/`.
- Auto-persist: panggil `saveMembershipCredentials(token)` saat dashboard mount supaya akses Live tetap mulus selama durasi.

Tetap tampilkan tombol "Beli paket lain" kecil di bawah dashboard.

## 3. Tombol "Tonton Live" pada Kartu Show Aktif untuk user membership login
`src/components/ActiveShowCard.tsx` sudah punya logic membership token via `readMembershipCredentials()`. Tambah jalur baru:
- Saat user login (`useAuth`) → query sekali `get_my_memberships()` (lewat hook ringan / context baru `useMembership()`); kalau ada membership aktif & token valid → simpan ke session via `saveMembershipCredentials` lalu render tombol merah "Tonton Live (Member)" yang sudah ada.
- Hindari refactor besar — buat hook `src/hooks/useActiveMembership.ts` (cache di module-level + event `MEMBERSHIP_UPDATED_EVENT`).

## 4. Upload Bukti Transaksi (Manual Confirm)
Tambah jalur fallback di `BuyMembershipDialog` / sukses-state `Membership.tsx`:
- Tombol "Pembayaran tidak terkonfirmasi? Kirim bukti manual" → modal:
  - Field: WhatsApp, Email (prefilled).
  - File picker gambar (max 2MB, jpg/png/webp).
  - Upload ke storage bucket baru `membership-proofs` (private).
  - Insert ke tabel baru `public.membership_payment_proofs` (order_id, user_id, email, phone, image_path, created_at, expires_at = now()+7d, handled boolean).
  - Setelah sukses → redirect ke `https://wa.me/<admin_phone>?text=...` dengan ringkasan order.

Pakai `site_settings.key = 'admin_wa_phone'` untuk nomor admin (default empty); admin bisa ubah di panel.

### Auto-delete 7 hari
- DB function `cron_cleanup_membership_proofs()` (security definer) yang `DELETE` baris expired + drop file dari storage via `storage.delete_object` SQL helper (kita pakai `delete from storage.objects` lalu tabel sendiri).
- Trigger jadwal via cron job (`pg_cron` extension sudah biasa ada) — kalau tidak, sederhana saja: jalankan janitor inline saat admin list proofs (`DELETE WHERE expires_at < now()`).

## 5. Admin Panel — Bukti Transaksi & Nomor Admin
Komponen baru `src/components/admin/MembershipProofsAdmin.tsx`:
- Tabel daftar bukti (gambar preview, email, phone, order, tanggal, sisa hari).
- Tombol "Tandai selesai", "Hapus".
- Auto-cleanup expired saat load (call RPC `admin_cleanup_membership_proofs`).

Field "Nomor WA Admin" di `BotAdmin.tsx` atau `PakasirAdmin.tsx` (settings) — input + simpan ke `site_settings('admin_wa_phone')`. RPC kecil: `admin_set_setting(_key, _value)` (admin-only) atau reuse pola existing.

Tambahkan tab baru di `src/pages/Admin.tsx`: "Bukti Transaksi".

### Migration (SQL)
```sql
-- table
create table public.membership_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.membership_orders(id) on delete set null,
  user_id uuid,
  email text,
  phone text,
  image_path text not null,
  note text default '',
  handled boolean default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
grant select,insert,update,delete on public.membership_payment_proofs to authenticated;
grant all on public.membership_payment_proofs to service_role;
alter table public.membership_payment_proofs enable row level security;
create policy "own insert" on public.membership_payment_proofs
  for insert to authenticated with check (user_id = auth.uid() or user_id is null);
create policy "admin all" on public.membership_payment_proofs
  for all to authenticated using (public.has_role(auth.uid(),'admin'));

-- RPCs
create or replace function public.admin_list_membership_proofs() returns setof public.membership_payment_proofs
  language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  delete from public.membership_payment_proofs where expires_at < now();
  return query select * from public.membership_payment_proofs order by created_at desc;
end $$;
-- + admin_handle_proof / admin_delete_proof / admin_set_setting
```

Storage bucket `membership-proofs` (private) via tool `supabase--storage_create_bucket`. RLS storage.objects: insert oleh authenticated dengan bucket_id check; select/delete admin saja.

## 6. Domain Utama
Verifikasi semua sumber sudah `realtime48stream.my.id`. Tambahan kecil:
- Pastikan `BuyShowDialog` / dialog token success / banner "Salin Link" memakai `site_origin` setting (lewat env atau public select), bukan `window.location.origin`. Buat helper `src/lib/siteOrigin.ts` yang return constant `https://realtime48stream.my.id` (sinkron dengan `main.tsx` PRIMARY_HOST) supaya tetap konsisten saat user buka via subdomain preview.
- Update `MembershipUsersAdmin` & `Membership.tsx` & `ActiveShowCard` & `ReplayCardComponent` agar pakai helper ini saat menyusun link copy (link replay token personal juga).

## File yang akan dibuat/diubah
- BARU: `src/components/MembershipDashboard.tsx`
- BARU: `src/components/admin/MembershipProofsAdmin.tsx`
- BARU: `src/components/MembershipProofUpload.tsx` (modal upload bukti)
- BARU: `src/hooks/useActiveMembership.ts`
- BARU: `src/lib/siteOrigin.ts`
- BARU: migration SQL (tabel + RPC + cleanup)
- BARU: storage bucket `membership-proofs` (via tool)
- UBAH: `src/pages/Membership.tsx` (render dashboard, hapus password UI, integrasi upload)
- UBAH: `src/pages/Admin.tsx` (tab Bukti Transaksi + field Nomor WA Admin)
- UBAH: `src/components/admin/MembershipUsersAdmin.tsx` (hapus sandi)
- UBAH: `src/components/ActiveShowCard.tsx` (tombol live untuk member login)
- UBAH: `src/components/ReplayCardComponent.tsx` & banner copy lain → pakai `siteOrigin()`

## Jaminan area aman
- TIDAK menyentuh: `src/pages/Live.tsx`, `EmbedPlayer`, playlist, dan edge functions Fonnte (`send-wa`, `fonnte-webhook`, `resend-*`, `poll-pending-orders`).
- Tidak mengubah skema `membership_tokens` (kolom password tetap ada — hanya disembunyikan).
- Tidak mengubah aturan reseller atau show token.
