#!/usr/bin/env bash
# KARVON — ishlab chiqarishga chiqarish (bitta server, Docker Compose).
#
#   bash scripts/deploy.sh
#
# Qadamlar:
#   1. tekshiruv  — .env.production to'ldirilganmi, OSRM ma'lumoti bormi
#   2. build      — tasvirlar git SHA tegi bilan (qaytarish uchun eskisi qoladi)
#   3. zaxira     — MIGRATSIYADAN OLDIN (baza allaqachon ishlayotgan bo'lsa)
#   4. migratsiya — yangi tasvir bilan, BIR MARTA (replikalar poygasisiz)
#   5. ishga tushirish va sog'liq tekshiruvi (`/health/ready`: baza + Redis)
#
# Yiqilsa: bash scripts/rollback.sh — oldingi tasvirlarga qaytaradi.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env.production
compose() { docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"; }
step() { printf '\n==> %s\n' "$1"; }

step "Tekshiruv"
[ -f "$ENV_FILE" ] || {
  echo "$ENV_FILE yo'q. Namunadan: cp .env.production.example $ENV_FILE" >&2
  exit 1
}

# Namunadagi CHANGE_ME qolib ketgan bo'lsa — to'xtaymiz. Qiymatlarning
# o'zi ekranga chiqarilmaydi, faqat kalit nomlari
if grep -q 'CHANGE_ME' "$ENV_FILE"; then
  echo "$ENV_FILE da to'ldirilmagan qiymatlar bor:" >&2
  grep 'CHANGE_ME' "$ENV_FILE" | cut -d= -f1 | sed 's/^/  - /' >&2
  exit 1
fi

if ! ls osrm-data/uzbekistan-latest.osrm.* >/dev/null 2>&1; then
  echo "OSRM ma'lumoti yo'q. Avval: bash scripts/osrm-prepare.sh" >&2
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Ogohlantirish: kuzatilayotgan fayllarda saqlanmagan o'zgarishlar bor — tasvir ular bilan yig'iladi"
fi

tag=$(git rev-parse --short HEAD)
current=$(cat .deploy/current 2>/dev/null || true)
export IMAGE_TAG=$tag

step "Tasvirlar yig'ilmoqda (teg: $tag)"
compose build api admin

step "Infratuzilma"
# `up` bog'liqliklar sog'lom bo'lishini kutadi (depends_on: service_healthy)
compose up -d postgres redis minio osrm backup

step "Zaxira nusxa"
if [ -n "$current" ]; then
  compose exec -T backup bash /scripts/backup-db.sh
else
  echo "Birinchi o'rnatish — zaxira qilinadigan ma'lumot yo'q"
fi

step "Migratsiya va spravochnik"
compose run --rm --no-deps api node dist/infra/database/migrator.js up
# Seed idempotent: faqat spravochnik (viloyat, transport turi, admin rollari)
compose run --rm --no-deps api node dist/infra/database/migrator.js seed

step "Ishga tushirish"
compose up -d --remove-orphans

step "Sog'liq tekshiruvi"
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
  echo "API sog'lom emas. Oxirgi loglar:" >&2
  compose logs --tail=80 api >&2
  echo "" >&2
  echo "Qaytarish: bash scripts/rollback.sh" >&2
  exit 1
fi

mkdir -p .deploy
if [ -n "$current" ] && [ "$current" != "$tag" ]; then echo "$current" >.deploy/previous; fi
echo "$tag" >.deploy/current

echo ""
echo "Tayyor: $tag ishlamoqda."
if [ -z "$current" ]; then
  cat <<'HINT'

Birinchi o'rnatish. Endi birinchi administratorni yarating (parolni
terminal tarixiga tushirmaslik uchun oldiga bo'sh joy qo'ying):

  docker compose --env-file .env.production -f docker-compose.prod.yml \
    run --rm api node dist/scripts/create-admin.js \
    --email=... --password='...' --name='...'
HINT
fi
