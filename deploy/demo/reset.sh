#!/usr/bin/env bash
# The demo's nightly reset (src/seed/reset.ts), in the running stack: settles payments left
# behind, deletes orders, carts and transactions (not a payment in progress), deletes what the
# demo doesn't have, then reloads the demo's text, photos and stock. Never deletes users.
#
#   deploy/demo/reset.sh        by hand, any time; cron runs it every night (see README)
#
# Everything it prints also goes to deploy/demo/logs/reset.log (gitignored). One run at a time.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p deploy/demo/logs
LOG=deploy/demo/logs/reset.log
exec > >(tee -a "$LOG") 2>&1
exec 9>deploy/demo/logs/reset.lock
if ! flock -n 9; then
  echo "$(date -Is) reset: another reset is still running, not starting a second one"
  exit 1
fi
echo "$(date -Is) reset: start ($(git rev-parse --short HEAD))"
status=0
docker compose -p lightcommerce -f deploy/demo/compose.yml run --rm -T reset || status=$?
echo "$(date -Is) reset: $([ "$status" = 0 ] && echo done || echo "FAILED (exit $status)")"
exit "$status"
