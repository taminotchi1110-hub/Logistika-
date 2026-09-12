#!/usr/bin/env bash
# OSRM marshrut ma'lumotlarini tayyorlaydi — O'zbekiston, avtomobil profili.
#
#   bash scripts/osrm-prepare.sh
#
# Bir marta va xarita yangilanganda (oyiga bir marta yetarli) SERVERDA
# ishga tushiriladi. Talab: Docker, ~4 GB RAM, ~3 GB disk, 10–30 daqiqa.
# Natija: osrm-data/uzbekistan-latest.osrm.*
#
# NEGA O'Z OSRM SERVERIMIZ: masofa va vaqt narx va ETA ning asosi.
# Tijorat API'lari har so'rov uchun pul oladi va limitli; OSM asosidagi
# OSRM bepul va cheksiz. Productionda OSRM'siz API ishga tushmaydi
# (env.schema.ts) — taxminiy masofa noto'g'ri narx beradi.

set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE=${OSRM_IMAGE:-ghcr.io/project-osrm/osrm-backend:v5.27.1}
DATA=osrm-data
NAME=uzbekistan-latest
PBF_URL=${OSRM_PBF_URL:-https://download.geofabrik.de/asia/${NAME}.osm.pbf}

mkdir -p "$DATA"

echo "1/4 Xarita yuklanmoqda: $PBF_URL"
curl -fL --retry 3 -o "$DATA/$NAME.osm.pbf.partial" "$PBF_URL"
mv "$DATA/$NAME.osm.pbf.partial" "$DATA/$NAME.osm.pbf"

# Geofabrik MD5 ham beradi: buzilgan yuklama bilan yarim soat ishlov
# berib, keyin tushunarsiz xato olmaylik
if curl -fsSL "$PBF_URL.md5" -o "$DATA/$NAME.osm.pbf.md5"; then
  (cd "$DATA" && md5sum -c "$NAME.osm.pbf.md5")
fi

run() { docker run --rm -v "$PWD/$DATA:/data" "$IMAGE" "$@"; }

echo "2/4 Ajratib olish (osrm-extract)"
run osrm-extract -p /opt/car.lua "/data/$NAME.osm.pbf"

echo "3/4 Bo'lish (osrm-partition)"
run osrm-partition "/data/$NAME.osrm"

echo "4/4 Sozlash (osrm-customize)"
run osrm-customize "/data/$NAME.osrm"

rm -f "$DATA/$NAME.osm.pbf" "$DATA/$NAME.osm.pbf.md5"

echo "Tayyor. Yangi ma'lumotni yuklash uchun:"
echo "  docker compose --env-file .env.production -f docker-compose.prod.yml restart osrm"
