create table if not exists public.wa_send_claims (
  dedup_key text primary key,
  claimed_at timestamptz not null default now(),
  sent boolean not null default false
);

grant all on public.wa_send_claims to service_role;
alter table public.wa_send_claims enable row level security;

create or replace function public.claim_wa_send(_key text, _retry_seconds int default 900)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare ok boolean;
begin
  insert into public.wa_send_claims(dedup_key) values (_key)
  on conflict (dedup_key) do update
    set claimed_at = now()
    where public.wa_send_claims.sent = false
      and public.wa_send_claims.claimed_at < now() - make_interval(secs => _retry_seconds)
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

create or replace function public.mark_wa_sent(_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.wa_send_claims set sent = true where dedup_key = _key;
$$;

revoke all on function public.claim_wa_send(text, int) from public, anon, authenticated;
revoke all on function public.mark_wa_sent(text) from public, anon, authenticated;
grant execute on function public.claim_wa_send(text, int) to service_role;
grant execute on function public.mark_wa_sent(text) to service_role;