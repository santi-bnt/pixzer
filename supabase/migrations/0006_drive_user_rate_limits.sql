-- Database-backed fixed-window request limits shared by every serverless
-- instance. One row per invited user and action keeps storage bounded.
create table if not exists public.drive_user_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in (
    'upload_intent',
    'upload_chunk',
    'upload_status',
    'upload_resume',
    'upload_complete',
    'drive_status',
    'drive_download',
    'drive_delete',
    'drive_disconnect',
    'drive_oauth_start',
    'drive_oauth_callback'
  )),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (user_id, action)
);

alter table public.drive_user_rate_limits enable row level security;
revoke all on public.drive_user_rate_limits from public, anon, authenticated;
grant all on public.drive_user_rate_limits to service_role;

create or replace function public.consume_drive_user_rate_limit(
  p_user_id uuid,
  p_action text
)
returns table (allowed boolean, retry_after_seconds integer, remaining_requests integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_window_seconds integer := 3600;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_invited boolean;
  v_window_started_at timestamptz;
  v_request_count integer;
  v_retry_after integer;
begin
  if p_user_id is null then
    raise exception 'Invalid Drive rate-limit user' using errcode = '22023';
  end if;

  select auth_user.invited_at is not null into v_invited
  from auth.users as auth_user
  where auth_user.id = p_user_id;
  if not coalesce(v_invited, false) then
    raise exception 'Drive rate limits require an invited user' using errcode = '42501';
  end if;

  v_limit := case p_action
    when 'upload_intent' then 12
    when 'upload_chunk' then 240
    when 'upload_status' then 180
    when 'upload_resume' then 60
    when 'upload_complete' then 20
    when 'drive_status' then 60
    when 'drive_download' then 30
    when 'drive_delete' then 20
    when 'drive_disconnect' then 6
    when 'drive_oauth_start' then 12
    when 'drive_oauth_callback' then 12
    else null
  end;
  if v_limit is null then
    raise exception 'Invalid Drive rate-limit action' using errcode = '22023';
  end if;

  insert into public.drive_user_rate_limits as current_limit (
    user_id, action, window_started_at, request_count, updated_at
  ) values (
    p_user_id, p_action, v_now, 1, v_now
  )
  on conflict (user_id, action) do update
  set window_started_at = case
        when current_limit.window_started_at + pg_catalog.make_interval(secs => v_window_seconds) <= v_now
          then v_now
        else current_limit.window_started_at
      end,
      request_count = case
        when current_limit.window_started_at + pg_catalog.make_interval(secs => v_window_seconds) <= v_now
          then 1
        else current_limit.request_count + 1
      end,
      updated_at = v_now
  where current_limit.window_started_at + pg_catalog.make_interval(secs => v_window_seconds) <= v_now
     or current_limit.request_count < v_limit
  returning current_limit.window_started_at, current_limit.request_count
       into v_window_started_at, v_request_count;

  if found then
    return query select true, 0, greatest(0, v_limit - v_request_count);
    return;
  end if;

  select current_limit.window_started_at, current_limit.request_count
    into v_window_started_at, v_request_count
  from public.drive_user_rate_limits as current_limit
  where current_limit.user_id = p_user_id
    and current_limit.action = p_action;

  v_retry_after := greatest(1, ceil(extract(epoch from (
    v_window_started_at + pg_catalog.make_interval(secs => v_window_seconds) - v_now
  )))::integer);
  return query select false, v_retry_after, 0;
end;
$$;

alter function public.consume_drive_user_rate_limit(uuid, text) owner to postgres;
revoke all on function public.consume_drive_user_rate_limit(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_drive_user_rate_limit(uuid, text) to service_role;
