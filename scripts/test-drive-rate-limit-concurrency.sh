#!/usr/bin/env bash
set -euo pipefail

workdir="${1:?Pass the isolated Supabase project directory}"
config="$workdir/supabase/config.toml"
project_id="$(sed -n 's/^project_id = "\([^"]*\)"$/\1/p' "$config")"
case "$project_id" in
  pixzerci|pixzer-drive-local-20261126) ;;
  *)
    echo "Refusing Drive rate-limit fixtures outside an isolated pixzer local database" >&2
    exit 1
    ;;
esac

db_container="supabase_db_${project_id}"
if ! docker inspect "$db_container" >/dev/null 2>&1; then
  echo "Expected isolated local Supabase database container was not found" >&2
  exit 1
fi

user_id="fed00000-0000-4000-8000-000000000001"
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
values ('${user_id}', 'drive-rate-ci@example.invalid', pg_catalog.now(), '{}'::jsonb);
SQL

dir="$(mktemp -d)"
cleanup_files() { rm -rf "$dir"; }
trap 'cleanup; cleanup_files' EXIT INT TERM

run_burst() {
  local output="$1"
  docker exec -i "$db_container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres > "$output" <<SQL
create temporary table rate_results (allowed boolean);
do \$\$
declare i integer; result record;
begin
  for i in 1..8 loop
    select * into result from public.consume_drive_user_rate_limit('${user_id}', 'upload_intent');
    insert into pg_temp.rate_results values (result.allowed);
  end loop;
end;
\$\$;
select count(*) filter (where allowed) || ':' || count(*) filter (where not allowed)
from pg_temp.rate_results;
SQL
}

run_burst "$dir/a" & pid_a=$!
run_burst "$dir/b" & pid_b=$!
wait "$pid_a"
wait "$pid_b"

result_a="$(tr -d '\r\n ' < "$dir/a")"
result_b="$(tr -d '\r\n ' < "$dir/b")"
allowed_a="${result_a%%:*}"
blocked_a="${result_a##*:}"
allowed_b="${result_b%%:*}"
blocked_b="${result_b##*:}"
allowed_total=$((allowed_a + allowed_b))
blocked_total=$((blocked_a + blocked_b))
if [[ "$allowed_total" -ne 12 || "$blocked_total" -ne 4 ]]; then
  echo "Expected exactly 12 admitted and 4 rejected concurrent requests; received ${allowed_total} admitted and ${blocked_total} rejected" >&2
  exit 1
fi

echo "Two independent PostgreSQL sessions sent 16 concurrent requests for one user: exactly 12 were admitted and 4 were rate-limited."
