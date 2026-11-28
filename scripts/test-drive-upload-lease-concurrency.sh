#!/usr/bin/env bash
set -euo pipefail

workdir="${1:?Pass the isolated Supabase project directory}"
config="$workdir/supabase/config.toml"
project_id="$(sed -n 's/^project_id = "\([^"]*\)"$/\1/p' "$config")"
case "$project_id" in
  pixzerci|pixzer-drive-local-20261126) ;;
  *)
    echo "Refusing Drive lease fixtures outside an isolated pixzer local database" >&2
    exit 1
    ;;
esac

db_container="supabase_db_${project_id}"
if ! docker inspect "$db_container" >/dev/null 2>&1; then
  echo "Expected isolated local Supabase database container was not found" >&2
  exit 1
fi

user_id="face0000-0000-4000-8000-000000000001"
upload_a="face0000-0000-4000-8000-000000000011"
upload_b="face0000-0000-4000-8000-000000000012"
game_a="face0000-0000-4000-8000-000000000021"
game_b="face0000-0000-4000-8000-000000000022"
key_a="face0000-0000-4000-8000-000000000031"
key_b="face0000-0000-4000-8000-000000000032"
lease_a="face0000-0000-4000-8000-000000000041"
lease_b="face0000-0000-4000-8000-000000000042"

psql_local() {
  docker exec -i "$db_container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

cleanup() {
  psql_local >/dev/null <<SQL || true
delete from auth.users where id = '${user_id}';
SQL
}
trap cleanup EXIT INT TERM
cleanup

psql_local >/dev/null <<SQL
insert into auth.users (id, email, invited_at, raw_user_meta_data)
values ('${user_id}', 'drive-lease-ci@example.invalid', pg_catalog.now(), '{}'::jsonb);
insert into public.drive_upload_sessions (
  id, user_id, game_id, idempotency_key, file_name, title, console,
  expected_size_bytes, drive_permission_id, status, expires_at
) values
  ('${upload_a}', '${user_id}', '${game_a}', '${key_a}', 'lease-a.gb', 'Lease A', 'gb', 1024, 'ci-owner', 'uploading', pg_catalog.now() + interval '1 hour'),
  ('${upload_b}', '${user_id}', '${game_b}', '${key_b}', 'lease-b.gb', 'Lease B', 'gb', 1024, 'ci-owner', 'uploading', pg_catalog.now() + interval '1 hour');
SQL

run_claim_pair() {
  local label="$1" upload_id="$2" result_a result_b dir
  dir="$(mktemp -d)"
  (
    while [[ ! -e "$dir/go" ]]; do sleep 0.01; done
    docker exec "$db_container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres \
      -c "select acquired from public.acquire_drive_upload_chunk_lease('${user_id}', '${upload_id}', '${lease_a}')" > "$dir/a"
  ) &
  local pid_a=$!
  (
    while [[ ! -e "$dir/go" ]]; do sleep 0.01; done
    docker exec "$db_container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres \
      -c "select acquired from public.acquire_drive_upload_chunk_lease('${user_id}', '${upload_id}', '${lease_b}')" > "$dir/b"
  ) &
  local pid_b=$!
  touch "$dir/go"
  wait "$pid_a"
  wait "$pid_b"
  result_a="$(tr -d '\r\n ' < "$dir/a")"
  result_b="$(tr -d '\r\n ' < "$dir/b")"
  rm -rf "$dir"
  if [[ "${result_a},${result_b}" != "t,f" && "${result_a},${result_b}" != "f,t" ]]; then
    echo "${label}: expected exactly one lease owner, received ${result_a},${result_b}" >&2
    return 1
  fi
  echo "${label}: exactly one of two independent PostgreSQL sessions acquired the lease"
}

run_claim_pair "same resumable upload, competing chunks" "$upload_a"
release_a="$(docker exec "$db_container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "select public.release_drive_upload_chunk_lease('${user_id}', '${upload_a}', '${lease_a}')" | tr -d '\r\n ' )"
release_b="$(docker exec "$db_container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "select public.release_drive_upload_chunk_lease('${user_id}', '${upload_a}', '${lease_b}')" | tr -d '\r\n ' )"
if [[ "${release_a},${release_b}" != "t,f" && "${release_a},${release_b}" != "f,t" ]]; then
  echo "could not safely release exactly the winning synthetic lease" >&2
  exit 1
fi

# The lock is per upload: independent sessions for separate uploads must not
# serialize each other. Each claim uses its own token and row.
first="$(docker exec "$db_container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "select acquired from public.acquire_drive_upload_chunk_lease('${user_id}', '${upload_a}', '${lease_a}')" | tr -d '\r\n ' )"
second="$(docker exec "$db_container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "select acquired from public.acquire_drive_upload_chunk_lease('${user_id}', '${upload_b}', '${lease_b}')" | tr -d '\r\n ' )"
if [[ "$first" != "t" || "$second" != "t" ]]; then
  echo "independent uploads did not receive independent leases" >&2
  exit 1
fi
echo "independent uploads: both sessions acquired separate leases"

echo "Drive upload lease fixtures completed; cleanup removes only the synthetic Auth user and its rows."
