#!/usr/bin/env bash
# Fayllarni (hujjat, avatar, POD) zaxiradan omborga qaytaradi.
#
#   bash scripts/restore-files.sh [papka]     # sukut bo'yicha backups/files
#
# QACHON KERAK: ombor diski yo'qolganda yoki bazani eski zaxiradan
# tiklaganda. Baza va fayllar BIRGA tiklanishi kerak — aks holda hujjat
# yozuvi bor, surati yo'q (yoki aksincha) holat qoladi.
#
# Ombordagi mavjud fayllar O'CHIRILMAYDI: bu qo'shimcha nusxa, ko'zgu
# emas. Zaxiradagi nom bilan fayl bo'lsa — ustiga yoziladi.

set -euo pipefail
cd "$(dirname "$0")/.."

dir=${1:-backups/files}
[ -d "$dir" ] || { echo "Papka topilmadi: $dir" >&2; exit 1; }

ENV_FILE=.env.production
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE topilmadi" >&2; exit 1; }

compose() { docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"; }

# Kalitlar ISHLAYOTGAN konteynerdan olinadi — buyruq qatorida ham,
# `.env` ni `source` qilishda ham ko'rinmaydi (`ps` va tarixga tushmaydi)
bucket=$(compose exec -T s3 printenv S3_BUCKET | tr -d '\r')
AWS_ACCESS_KEY_ID=$(compose exec -T s3 printenv S3_ACCESS_KEY | tr -d '\r')
AWS_SECRET_ACCESS_KEY=$(compose exec -T s3 printenv S3_SECRET_KEY | tr -d '\r')
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY

files=$(find "$dir" -type f | wc -l)
size=$(du -sh "$dir" | cut -f1)
echo "Zaxirada $files ta fayl ($size) — '$bucket' omboriga yoziladi."

read -r -p "Davom etasizmi? (ha/yo'q) " answer
[ "$answer" = "ha" ] || { echo "Bekor qilindi."; exit 1; }

docker run --rm --network karvon_default \
  -v "$PWD/$dir:/in:ro" \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION=us-east-1 \
  amazon/aws-cli:2.36.44 \
  --endpoint-url http://s3:8333 s3 sync /in "s3://$bucket" --only-show-errors

echo "Tayyor. Tekshiring: ilovada bitta hujjat suratini oching."
