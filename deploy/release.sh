#!/usr/bin/env bash
set -euo pipefail
cd /root/apps/s3-flash-drive
sha="${1:?commit required}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 2
exec 9>.deploy.lock
flock 9
release="releases/$sha"
test -f "$release/compose.yaml"
test -f .env
previous="$(cat .image 2>/dev/null || true)"
rotated=false
if test -f .env.pending; then
  cp -p .env "$release/env.previous"
  mv .env.pending .env
  chmod 600 .env
  rotated=true
fi
if test -f compose.yaml; then cp compose.yaml compose.previous.yaml; fi
cp "$release/compose.yaml" compose.yaml
export FLASH_IMAGE="s3-flash-drive:$sha"
docker compose -p holder up -d --no-build --wait --wait-timeout 90 flash || {
  if $rotated; then cp -p "$release/env.previous" .env; fi
  if test -n "$previous"; then
    cp compose.previous.yaml compose.yaml
    FLASH_IMAGE="$previous" docker compose -p holder up -d --no-build --wait flash
  fi
  exit 1
}
if $rotated; then
  docker compose -p holder exec -T flash node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync("/app/data/flash.db");db.exec("DELETE FROM sessions");db.close();'
fi
printf '%s\n' "$FLASH_IMAGE" > .image
printf '%s\n' "$sha" > .deployed-sha
