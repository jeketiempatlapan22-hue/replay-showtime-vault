create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'poll-pending-orders-every-minute' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'poll-pending-orders-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://zkuxrztgotfenywmopjn.supabase.co/functions/v1/poll-pending-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXhyenRnb3RmZW55d21vcGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjAwMDYsImV4cCI6MjA4OTQ5NjAwNn0.iMpOsIvkAgOePMarh2V2VoNEMcN98uJ7jiIOe2BZMnY'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

insert into public.bot_commands (trigger, description, response_template, enabled, is_dynamic, sort_order)
values (
  '/cek',
  'Cek status pembayaran terakhir Anda',
  '⏳ Sedang mengecek pembayaran Anda...',
  true,
  true,
  100
)
on conflict (trigger) do update
  set description = excluded.description,
      enabled = true,
      is_dynamic = true;