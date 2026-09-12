#!/usr/bin/env bash
# Oldingi versiyaga qaytarish.
#
#   bash scripts/rollback.sh          — oldingi deploy tegiga
#   bash scripts/rollback.sh a1b2c3d  — aniq tegga
#
# MUHIM: faqat TASVIRLAR qaytariladi, baza emas. Migratsiyalar faqat
# oldinga yuradi (SQL-first, "down" yo'q). Shuning uchun migratsiyalar
# ORQAGA MOS yoziladi: yangi ustun avval qo'shiladi, eskisi esa eski kod
# butunlay to'xtagandan keyingi relizda o'chiriladi. Mos bo'lmagan
# migratsiyadan keyin qaytish — zaxiradan tiklash (scripts/restore-db.sh).

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env.production
compose() { docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"; }

target=${1:-$(cat .deploy/previous 2>/dev/null || true)}
[ -n "$target" ] || { echo "Qaytariladigan teg yo'q (.deploy/previous bo'sh)" >&2; exit 1; }

for image in karvon-api karvon-admin; do
  docker image inspect "$image:$target" >/dev/null 2>&1 || {
    echo "$image:$target tasviri serverda yo'q (o'chirilganmi?)" >&2
    exit 1
  }
done

echo "==> $target ga qaytarilmoqda"
export IMAGE_TAG=$target
compose up -d --no-build api admin

healthy=false
for _ in $(seq 1 60); do
  if compose exec -T api node -e \
    "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    2>/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [ "$healthy" != true ]; then
  echo "Qaytarilgan versiya ham sog'lom emas — sabab kodda emas, muhitda bo'lishi mumkin:" >&2
  compose logs --tail=80 api >&2
  exit 1
fi

current=$(cat .deploy/current 2>/dev/null || true)
mkdir -p .deploy
echo "$target" >.deploy/current
# Qaytarishni ham qaytarish mumkin bo'lsin
if [ -n "$current" ]; then echo "$current" >.deploy/previous; fi

echo "Tayyor: $target ishlamoqda."
