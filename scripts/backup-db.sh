#!/usr/bin/env bash
# PostgreSQL zaxira nusxasi.
#
# `pg_dump --format=custom`: siqilgan va `pg_restore` bilan TANLAB tiklash
# mumkin (bitta jadvalni ham). Eskilari BACKUP_KEEP_DAYS kundan keyin
# o'chiriladi.
#
# Ishlatilishi:
#   - avtomatik: `backup` xizmati har kuni (docker-compose.prod.yml)
#   - qo'lda:    docker compose --env-file .env.production \
#                  -f docker-compose.prod.yml exec backup bash /scripts/backup-db.sh
#
# Ulanish PG* muhit o'zgaruvchilaridan (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).

set -euo pipefail

dir=${BACKUP_DIR:-/backups}
keep=${BACKUP_KEEP_DAYS:-14}
mkdir -p "$dir"

stamp=$(date -u +%Y%m%d-%H%M%S)
file="$dir/karvon-$stamp.dump"

# Avval `.partial` ga: yarim yozilgan fayl "tayyor zaxira" deb
# hisoblanmasligi kerak (disk to'lsa yoki jarayon uzilsa)
pg_dump --format=custom --compress=6 --no-owner --file="$file.partial"
mv "$file.partial" "$file"

# Arxiv o'qiladimi — buzilgan zaxira zaxirasizlikdan ham yomon: unga
# ishonib qolinadi. Tiklash kerak bo'lgan kuni emas, HOZIR bilamiz
pg_restore --list "$file" >/dev/null
sha256sum "$file" >"$file.sha256"

find "$dir" -name 'karvon-*.dump*' -mtime +"$keep" -delete

echo "Zaxira tayyor: $file ($(du -h "$file" | cut -f1))"
