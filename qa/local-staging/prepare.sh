#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../.." && pwd)"
runtime_dir="${1:-}"

if [[ -z "$runtime_dir" ]]; then
  echo "Usage: $0 /private/tmp/badar-crm-local-staging-<run>" >&2
  exit 2
fi

case "$runtime_dir" in
  /private/tmp/badar-crm-local-staging-*) ;;
  *)
    echo "Refusing runtime path outside /private/tmp/badar-crm-local-staging-*" >&2
    exit 2
    ;;
esac

if [[ -e "$runtime_dir" ]]; then
  echo "Refusing to overwrite existing runtime directory: $runtime_dir" >&2
  exit 2
fi

mkdir -p "$runtime_dir/supabase/migrations"
cp "$script_dir/supabase/config.toml" "$runtime_dir/supabase/config.toml"
cp "$repo_root/supabase/schema.sql" \
  "$runtime_dir/supabase/migrations/20260701000000_schema_baseline.sql"

for migration in "$repo_root"/supabase/migrations/*.sql; do
  cp "$migration" "$runtime_dir/supabase/migrations/$(basename -- "$migration")"
done

echo "$runtime_dir"
