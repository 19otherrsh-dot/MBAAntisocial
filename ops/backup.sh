#!/bin/sh
# Nightly backup: a compressed dump of MongoDB plus a tarball of uploaded files,
# kept for BACKUP_RETENTION_DAYS (14 by default, the window the privacy page promises).
#
#   MONGODB_URI=… BACKUP_DIR=/backups UPLOADS_DIR=/data/uploads ops/backup.sh            # one backup now
#   BACKUP_EVERY_SECONDS=86400 ops/backup.sh                                              # and then every day
#
# The compose stack runs this in the `backup` service. Restore with ops/restore.sh.
set -eu

: "${MONGODB_URI:?set MONGODB_URI}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

backup_once() {
  stamp="$(date -u +%Y-%m-%dT%H%MZ)"
  mkdir -p "$BACKUP_DIR"
  mongodump --uri="$MONGODB_URI" --archive="$BACKUP_DIR/mongo-$stamp.archive.gz" --gzip --quiet
  if [ -n "$UPLOADS_DIR" ] && [ -d "$UPLOADS_DIR" ]; then
    tar -czf "$BACKUP_DIR/uploads-$stamp.tar.gz" -C "$UPLOADS_DIR" .
  fi
  # Retention: anything older than the window goes, so erased accounts leave the backups too.
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'mongo-*.archive.gz' -o -name 'uploads-*.tar.gz' \) -mtime +"$((RETENTION_DAYS - 1))" -delete
  echo "[backup] $stamp done: $(du -sh "$BACKUP_DIR/mongo-$stamp.archive.gz" | cut -f1) database; $(ls "$BACKUP_DIR" | grep -c '^mongo-') backups kept"
}

backup_once
if [ -n "${BACKUP_EVERY_SECONDS:-}" ]; then
  while sleep "$BACKUP_EVERY_SECONDS"; do backup_once || echo "[backup] failed; will retry next cycle" >&2; done
fi
