#!/bin/sh
# Restores a backup made by ops/backup.sh. Replaces the current data.
#
#   MONGODB_URI=… ops/restore.sh /backups/mongo-2026-10-31T0200Z.archive.gz [/backups/uploads-….tar.gz UPLOADS_DIR]
#
# With docker compose (stack stopped except mongo):
#   docker compose run --rm backup ops/restore.sh /backups/mongo-<stamp>.archive.gz
set -eu

: "${MONGODB_URI:?set MONGODB_URI}"
archive="${1:?pass the mongo-*.archive.gz to restore}"
[ -f "$archive" ] || { echo "No such file: $archive" >&2; exit 1; }

echo "[restore] replacing the database from $archive"
mongorestore --uri="$MONGODB_URI" --archive="$archive" --gzip --drop --quiet

if [ "${2:-}" ]; then
  target="${3:-${UPLOADS_DIR:?pass the uploads directory as the third argument}}"
  echo "[restore] replacing uploads in $target from $2"
  find "$target" -mindepth 1 -delete
  tar -xzf "$2" -C "$target"
fi
echo "[restore] done. Restart the web and realtime services so caches start clean."
