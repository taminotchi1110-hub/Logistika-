#!/bin/sh
# S3 omboridagi fayllar zaxirasi: hujjat suratlari, avatarlar, yuk
# fotolari va POD (yetkazib berish dalili).
#
# BULAR BAZADA YO'Q. `karvon-*.dump` dan tiklangan platformada har bir
# hujjat yozuvi mavjud, lekin ularning surati yo'q — haydovchilar
# qaytadan yuklashi kerak bo'lardi va verifikatsiya boshidan boshlanardi.
#
# NEGA `aws s3 sync`, PAPKANI NUSXALASH EMAS: SeaweedFS o'z ma'lumot
# papkasiga yozib turadi va uni ishlab turgan holda nusxalash yarim
# yozilgan holatni beradi. `sync` har bir obyektni S3 API orqali o'qiydi —
# nusxada har doim butun fayllar bo'ladi. Ustiga-ustak u faqat
# o'zgarganini ko'chiradi: kunlik nusxa daqiqalar emas, soniyalar oladi.
#
# Ishlatilishi:
#   - avtomatik: `backup-files` xizmati har kuni (docker-compose.prod.yml)
#   - qo'lda:    docker compose --env-file .env.production \
#                  -f docker-compose.prod.yml exec backup-files \
#                  sh /scripts/backup-files.sh

set -eu

dir=${BACKUP_DIR:-/backups/files}
bucket=${S3_BUCKET:?S3_BUCKET kerak}
endpoint=${S3_ENDPOINT:-http://s3:8333}
# Muhrni sinxronlanadigan papkadan TASHQARIDA saqlaymiz: ichkarida bo'lsa
# keyingi `--delete` uni omborda yo'q fayl deb o'chirib yuborardi
stamp=${BACKUP_STAMP_FILE:-/backups/files-last-sync.txt}

mkdir -p "$dir"

# BO'SH RO'YXAT — TO'XTASH SABABI.
#
# `--delete` nusxani omborning ko'zgusiga aylantiradi: hisobi o'chirilgan
# odamning hujjati nusxada ham qolmaydi (maxfiylik siyosati talabi).
# Lekin ombor vaqtincha javob bermay ro'yxat bo'sh kelsa, o'sha ko'zgu
# butun zaxirani o'chirib yuborardi — aynan eng kerak paytda.
objects=$(aws --endpoint-url "$endpoint" s3 ls "s3://$bucket" --recursive | wc -l)
if [ "$objects" -eq 0 ]; then
  echo "ERROR: omborda bitta ham fayl ko'rinmadi — nusxa o'zgartirilmadi" >&2
  exit 1
fi

aws --endpoint-url "$endpoint" s3 sync "s3://$bucket" "$dir" --delete --only-show-errors

# Monitoring shu faylning yoshiga qaraydi (docs/19-deploy.md, 19.8)
date -u +%Y-%m-%dT%H:%M:%SZ >"$stamp"
echo "$objects ta fayl" >>"$stamp"

echo "Fayllar zaxirasi tayyor: $dir ($objects ta fayl, $(du -sh "$dir" | cut -f1))"
