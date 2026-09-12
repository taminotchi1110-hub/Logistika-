#!/usr/bin/env bash
# Zaxiradan tiklash.
#
#   bash scripts/restore-db.sh backups/karvon-20260912-210000.dump
#
# DIQQAT: joriy baza ma'lumotlari ALMASHTIRILADI. Tiklash davomida API
# to'xtatiladi — aks holda yangi yozuvlar tiklangan ma'lumot bilan
# aralashib ketadi.
#
# Tiklashni OYIGA BIR MARTA sinab ko'ring (alohida serverda yoki
# vaqtinchalik bazada): tekshirilmagan zaxira — umid, reja emas.

set -euo pipefail
cd "$(dirname "$0")/.."

file=${1:?"Ishlatish: bash scripts/restore-db.sh <zaxira.dump>"}
[ -f "$file" ] || { echo "Fayl topilmadi: $file" >&2; exit 1; }

ENV_FILE=.env.production
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE topilmadi" >&2; exit 1; }

compose() { docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"; }

# `.env.production` ni `source` qilmaymiz: unda qo'shtirnoqli va maxsus
# belgili qiymatlar bor. Kerakli ikkitasini aniq o'qiymiz
value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }
db=$(value POSTGRES_DB)
user=$(value POSTGRES_USER)

if [ -f "$file.sha256" ]; then
  (cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256")
else
  echo "Ogohlantirish: nazorat summasi ($file.sha256) yo'q — butunlik tekshirilmadi"
fi

pg_restore_list=$(compose exec -T postgres pg_restore --list <"$file" | grep -c 'TABLE DATA' || true)
echo "Arxivda $pg_restore_list ta jadval ma'lumoti bor."

read -r -p "'$db' bazasi zaxiradagi holatga QAYTARILADI. Davom etasizmi? (ha/yo'q) " answer
[ "$answer" = "ha" ] || { echo "Bekor qilindi."; exit 1; }

echo "API to'xtatilmoqda …"
compose stop api

echo "Tiklanmoqda …"
compose exec -T postgres pg_restore --clean --if-exists --no-owner \
  --exit-on-error -U "$user" -d "$db" <"$file"

echo "API ishga tushirilmoqda …"
compose start api

echo "Tayyor. Tekshiring: curl -s https://\$API_DOMAIN/health/ready"
