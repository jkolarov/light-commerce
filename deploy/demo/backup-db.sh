# A consistent copy of the demo's SQLite database, made inside a container on the data volume
# (deploy.sh pipes this script to `sh -s` in a one-off app container: Node 24's node:sqlite, no
# sqlite3 CLI needed). `VACUUM INTO` reads one snapshot, so it is safe while the app runs and
# includes what is still in the WAL file. Copies go to /app/data/backups/; the last 3 are kept.
# Nothing to do on a new volume.
#
# To restore one: stop the app (`docker compose -p lightcommerce -f deploy/demo/compose.yml stop app`),
# copy the backup over /app/data/light.db and delete light.db-wal and light.db-shm (for example in
# `docker compose ... run --rm --no-deps --entrypoint sh app`), then start the app again. The
# uploads (/app/data/media) are not in the copy: the seed restores the demo's photos.
set -eu
db=/app/data/light.db
dir=/app/data/backups
if [ ! -f "$db" ]; then
  echo "backup: no database yet, nothing to copy"
  exit 0
fi
mkdir -p "$dir"
out="$dir/light-$(date -u +%Y%m%dT%H%M%SZ).db"
node --no-warnings -e '
const { DatabaseSync } = require("node:sqlite")
const db = new DatabaseSync(process.argv[1])
db.exec("PRAGMA busy_timeout = 5000")
db.prepare("VACUUM INTO ?").run(process.argv[2])
db.close()
' "$db" "$out"
echo "backup: $out ($(wc -c < "$out") bytes)"
ls -1t "$dir"/light-*.db | tail -n +4 | while read -r old; do
  rm -f "$old"
  echo "backup: removed $old (keeping the last 3)"
done
