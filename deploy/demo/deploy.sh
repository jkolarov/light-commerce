#!/usr/bin/env bash
# Deploy the demo from the branch checked out in this clone.
#   deploy/demo/deploy.sh              # rebuild the image + restart what changed
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
"${COMPOSE[@]}" build --pull app
"${COMPOSE[@]}" up -d --remove-orphans
# Every build leaves the previous image behind, untagged: drop every lightcommerce image no
# container uses (this project only, by compose label), then trim BuildKit's cache. That cache
# is host-wide, so it keeps the 20GB most recently used by any project. A failed cleanup doesn't
# fail the deploy. Never a global prune.
{
  docker image prune -af --filter label=com.docker.compose.project=lightcommerce | tail -n1
  docker builder prune -f --max-used-space 20GB | tail -n1
} || echo "warning: image/cache cleanup failed; the deploy itself went through" >&2
"${COMPOSE[@]}" ps
