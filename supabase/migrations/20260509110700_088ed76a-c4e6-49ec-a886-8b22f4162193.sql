
insert into public.bot_commands (trigger, description, response_template, enabled, is_dynamic, sort_order)
values (
  '/test',
  'Mode test untuk admin — cek jalur webhook tanpa kirim token/link',
  '🧪 Mode test aktif',
  true,
  true,
  110
)
on conflict (trigger) do update
  set description = excluded.description,
      enabled = true,
      is_dynamic = true;
