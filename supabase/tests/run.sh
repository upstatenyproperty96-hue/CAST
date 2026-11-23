#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres and runs the security tests.
# Needs PostgreSQL 16 installed. Usage: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
PG=${PG_BIN:-/usr/lib/postgresql/16/bin}
DIR=$(mktemp -d /var/tmp/castdb.XXXX)
PORT=${PG_PORT:-5498}
chmod 777 "$DIR"
RUN() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
RUN "$PG/initdb -D $DIR/data -A trust >/dev/null"
RUN "$PG/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'RUN "$PG/pg_ctl -D $DIR/data -m fast stop >/dev/null"; rm -rf "$DIR"' EXIT
PSQL="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -X"
$PSQL -f tests/supabase_stub.sql
$PSQL -f tests/grants.sql
for f in migrations/*.sql; do $PSQL -f "$f"; done
$PSQL -t -f tests/rls_test.sql 2>&1 | grep -E 'ok -|FAILED|ERROR' | sed 's/^.*NOTICE:  //; s/^psql:[^ ]* //'
