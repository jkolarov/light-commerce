#!/usr/bin/env bash
# Deploy the demo from the branch checked out in this clone (see README, "Where the demo runs from").
#   deploy/demo/deploy.sh              # rebuild the images + restart what changed
#   deploy/demo/deploy.sh <branch>     # fetch + reset the checkout to origin/<branch> first
#   deploy/demo/deploy.sh --logs       # follow app logs
set -euo pipefail
cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -p lightcommerce -f deploy/demo/compose.yml)
if [[ "${1:-}" == "--logs" ]]; then exec "${COMPOSE[@]}" logs -f app; fi
if [[ -n "${1:-}" ]]; then
  git fetch -q origin "$1" && git checkout -q "$1" && git reset -q --hard "origin/$1"
fi
echo "deploying $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
# The app, and the image the seed and the nightly reset run in (so cron never runs stale code).
"${COMPOSE[@]}" build --pull app seed reset
# Before the new image applies its migrations: a copy of the database in the data volume
# (backups/, the last 3 kept; see backup-db.sh). A failed copy stops the deploy.
"${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh app -s < deploy/demo/backup-db.sh
# --wait: returns once the app's health check passes. The app applies pending migrations before it
# answers and stops if one fails, so a broken migration fails the deploy here.
if ! "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180; then
  echo "deploy: the stack did not become healthy; last app logs:" >&2
  "${COMPOSE[@]}" logs --tail 40 app >&2 || true
  exit 1
fi
# Every build leaves the previous image behind, untagged: drop this project's untagged images
# (by compose label; tagged ones stay, like the seed/reset image no container is using), then trim
# BuildKit's cache. That cache is host-wide, so it keeps the 20GB most recently used by any
# project. A failed cleanup doesn't fail the deploy. Never a global prune.
{
  docker image prune -f --filter label=com.docker.compose.project=lightcommerce | tail -n1
  docker builder prune -f --max-used-space 20GB | tail -n1
} || echo "warning: image/cache cleanup failed; the deploy itself went through" >&2
"${COMPOSE[@]}" ps
