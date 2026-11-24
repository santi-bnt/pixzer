-- Provision a minimal profile only when Supabase Auth records a trusted invite.
-- Never derive authorization from raw_user_meta_data or client-supplied claims.

create or replace function public.provision_invited_pixzer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invited_at is not null then
    insert into public.profiles (id)
    values (new.id)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.provision_invited_pixzer_profile()
  from public, anon, authenticated;

drop trigger if exists provision_pixzer_profile_after_auth_insert on auth.users;
create trigger provision_pixzer_profile_after_auth_insert
  after insert on auth.users
  for each row
  when (new.invited_at is not null)
  execute function public.provision_invited_pixzer_profile();

drop trigger if exists provision_pixzer_profile_after_invite_update on auth.users;
create trigger provision_pixzer_profile_after_invite_update
  after update of invited_at on auth.users
  for each row
  when (new.invited_at is not null)
  execute function public.provision_invited_pixzer_profile();

-- Backfill only users whose trusted Auth invitation marker is already set.
insert into public.profiles (id)
select invited_user.id
from auth.users as invited_user
where invited_user.invited_at is not null
on conflict (id) do nothing;
