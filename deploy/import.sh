#!/bin/bash
# Puts an older installation's data into a centre (tenant) made in the super admin panel:
#   deploy/import.sh <tenant database> <dump.sql.gz>     e.g. deploy/import.sh educenter_t1 /root/migrate/edu189.sql.gz
# The dump holds the old edu_* tables. The tenant's current database is
# saved first to /root/migrate/<db>.before-import.sql.gz, then replaced; the backend restarts and
# on the first request brings the data up to date (users become this centre's).

main() {
  set -euo pipefail
  cd "$(dirname "$0")/.."
  local db=${1:-} dump=${2:-} user
  [[ "$db" =~ ^[a-z0-9_]+_t[0-9]+$ ]] || { echo "İstifadə: deploy/import.sh <tenant bazası, məs. educenter_t1> <dump.sql.gz>"; return 1; }
  [ -s "$dump" ] || { echo "Dump faylı yoxdur: $dump"; return 1; }
  user=$(docker compose exec -T postgres printenv POSTGRES_USER | tr -d '\r')
  docker compose exec -T postgres psql -U "$user" -d "$db" -Atc 'select 1' > /dev/null || { echo "Belə tenant bazası yoxdur: $db (əvvəl super paneldə yaradın)"; return 1; }

  mkdir -p /root/migrate
  docker compose exec -T postgres pg_dump -U "$user" -d "$db" --no-owner --no-privileges | gzip > "/root/migrate/$db.before-import.sql.gz"
  echo "Nüsxə: /root/migrate/$db.before-import.sql.gz"

  docker compose exec -T postgres psql -U "$user" -d "$db" -q -v ON_ERROR_STOP=1 -c 'SET client_min_messages = warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
  gunzip -c "$dump" | docker compose exec -T postgres psql -U "$user" -d "$db" -q -v ON_ERROR_STOP=1 > /dev/null
  docker compose restart backend > /dev/null 2>&1
  echo "Köçürüldü: $db"
  docker compose exec -T postgres psql -U "$user" -d "$db" -Atc "select relname||'='||n_live_tup from pg_stat_user_tables where n_live_tup > 0 order by relname" | tr '\n' ' '
  echo
}

main "$@"
exit $?
