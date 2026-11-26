#!/usr/bin/env bash
set -euo pipefail

workdir="${1:?Pass the isolated Supabase workdir created for CI}"
config="$workdir/supabase/config.toml"
project_id="$(sed -n 's/^project_id = "\([^"]*\)"$/\1/p' "$config")"
if [[ "$project_id" != "pixzerci" ]]; then
  echo "Refusing to run quota fixtures outside the pixzerci local project" >&2
  exit 1
fi

db_container="supabase_db_${project_id}"
if ! docker inspect "$db_container" >/dev/null 2>&1; then
  echo "Expected local Supabase database container was not found" >&2
  exit 1
fi

race_user="dead0000-0000-4000-8000-000000000001"
global_user_a="dead0000-0000-4000-8000-000000000002"
global_user_b="dead0000-0000-4000-8000-000000000003"
fixture_users="'${race_user}', '${global_user_a}', '${global_user_b}'"
for n in $(seq 1 9); do
  fixture_users="$fixture_users, 'dead0000-0000-4000-8000-$(printf '%012d' "$((100 + n))")'"
done

psql_local() {
  docker exec -i "$db_container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

cleanup() {
  psql_local >/dev/null <<SQL || true
drop trigger if exists pixzer_ci_quota_delay_r2 on public.upload_sessions;
drop trigger if exists pixzer_ci_quota_delay_drive on public.drive_upload_sessions;
drop function if exists public.pixzer_ci_quota_delay();
delete from auth.users where id in (${fixture_users});
SQL
}
trap cleanup EXIT INT TERM

# Remove residues from an interrupted retry before creating deterministic fixtures.
cleanup
psql_local >/dev/null <<SQL
insert into auth.users (id, email, invited_at) values
  ('${race_user}', 'ci-quota-race@example.invalid', pg_catalog.now()),
  ('${global_user_a}', 'ci-global-a@example.invalid', pg_catalog.now()),
  ('${global_user_b}', 'ci-global-b@example.invalid', pg_catalog.now());
insert into auth.users (id, email, invited_at)
select ('dead0000-0000-4000-8000-' || pg_catalog.lpad((100 + n)::text, 12, '0'))::uuid,
       'ci-global-seed-' || n::text || '@example.invalid', pg_catalog.now()
from pg_catalog.generate_series(1, 9) as n;

insert into public.drive_connections (
  user_id, drive_permission_id, refresh_token_ciphertext, refresh_token_nonce,
  refresh_token_tag, token_key_version, granted_scope, connected_at
) values (
  '${race_user}', 'ci-drive-owner', 'synthetic-ciphertext', 'synthetic-nonce',
  'synthetic-tag', 1, 'https://www.googleapis.com/auth/drive.file', pg_catalog.now()
);

insert into public.games (
  user_id, title, console, file_name, object_key, size_bytes, sha256
)
select ('dead0000-0000-4000-8000-' || pg_catalog.lpad((100 + n)::text, 12, '0'))::uuid,
       'CI quota seed ' || n::text, 'gb', 'seed.gb', 'ci-quota-seed/' || n::text,
       900000000, pg_catalog.repeat('a', 64)
from pg_catalog.generate_series(1, 9) as n;

create or replace function public.pixzer_ci_quota_delay()
returns trigger
language plpgsql
as \$pixzer\$
begin
  if new.user_id in (${fixture_users}) then
    perform pg_catalog.pg_sleep(3);
  end if;
  return new;
end;
\$pixzer\$;
create trigger pixzer_ci_quota_delay_r2
before insert on public.upload_sessions
for each row execute function public.pixzer_ci_quota_delay();
create trigger pixzer_ci_quota_delay_drive
before insert on public.drive_upload_sessions
for each row execute function public.pixzer_ci_quota_delay();
SQL

run_one() {
  local label="$1" query="$2" result_file="$3" output
  if output="$(docker exec "$db_container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$query" 2>&1)"; then
    printf 'accepted\n' > "$result_file"
  elif [[ "$output" == *"User storage quota exceeded"* || "$output" == *"Shared storage reserve exceeded"* ]]; then
    printf 'quota_rejected\n' > "$result_file"
  else
    printf '%s\n' "$output" >&2
    echo "Unexpected PostgreSQL result for ${label}" >&2
    return 1
  fi
}

run_pair() {
  local name="$1" query_a="$2" query_b="$3" dir pid_a pid_b ready_deadline accepted rejected
  dir="$(mktemp -d)"
  (
    touch "$dir/ready-a"
    while [[ ! -e "$dir/go" ]]; do sleep 0.01; done
    run_one "$name-a" "$query_a" "$dir/a"
  ) &
  pid_a=$!
  (
    touch "$dir/ready-b"
    while [[ ! -e "$dir/go" ]]; do sleep 0.01; done
    run_one "$name-b" "$query_b" "$dir/b"
  ) &
  pid_b=$!

  ready_deadline=$((SECONDS + 15))
  while [[ ! -e "$dir/ready-a" || ! -e "$dir/ready-b" ]]; do
    if (( SECONDS >= ready_deadline )); then
      echo "Timed out synchronizing independent PostgreSQL sessions" >&2
      return 1
    fi
    sleep 0.01
  done
  touch "$dir/go"
  wait "$pid_a"
  wait "$pid_b"

  accepted="$(cat "$dir/a" "$dir/b" | grep -xc 'accepted' || true)"
  rejected="$(cat "$dir/a" "$dir/b" | grep -xc 'quota_rejected' || true)"
  if [[ "$accepted" != 1 || "$rejected" != 1 ]]; then
    cat "$dir/a" "$dir/b" >&2
    rm -rf "$dir"
    echo "${name}: expected one accepted reservation and one quota rejection" >&2
    return 1
  fi
  rm -rf "$dir"
  echo "${name}: one accepted, one quota-rejected (two independent sessions)"
}

run_pair "per-user cross-provider race" \
  "select * from public.reserve_game_upload('${race_user}', 'race-r2.gb', 'Race R2', 'gb', 500000000, 'dead0000-0000-4000-8000-000000000011')" \
  "select * from public.reserve_drive_game_upload('${race_user}', 'dead0000-0000-4000-8000-000000000012', 'race-drive.gb', 'Race Drive', 'gb', 500000000)"

# Reset only this synthetic owner's losing/winning holds before the global race.
psql_local >/dev/null -c "delete from public.upload_sessions where user_id = '${race_user}'; delete from public.drive_upload_sessions where user_id = '${race_user}';"

run_pair "shared global quota race" \
  "select * from public.reserve_game_upload('${global_user_a}', 'global-a.gb', 'Global A', 'gb', 500000000, 'dead0000-0000-4000-8000-000000000021')" \
  "select * from public.reserve_game_upload('${global_user_b}', 'global-b.gb', 'Global B', 'gb', 500000000, 'dead0000-0000-4000-8000-000000000022')"

echo "Quota concurrency fixtures completed; cleanup will remove all synthetic users and objects."
