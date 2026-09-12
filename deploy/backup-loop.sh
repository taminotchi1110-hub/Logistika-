#!/bin/sh
# Har kuni BACKUP_HOUR_UTC soatida zaxira nusxa oladi.
#
# NEGA CRON EMAS: alohida cron konteyneri, uning vaqt zonasi va loglari —
# qo'shimcha harakatlanuvchi qism. Oddiy sikl yetarli va loglari
# `docker compose logs backup` da ko'rinadi.
#
# 21:00 UTC = 02:00 Toshkent — eng kam yuklama payti.

set -eu

target=${BACKUP_HOUR_UTC:-21}

while true; do
  now=$(date -u +%s)
  # Keyingi `target` soatigacha soniyalar (bugun o'tib ketgan bo'lsa — ertaga)
  wait=$(( ((target * 3600) - (now % 86400) + 86400) % 86400 ))
  [ "$wait" -eq 0 ] && wait=86400

  echo "Keyingi zaxira ${wait} soniyadan keyin"
  sleep "$wait"

  # Yiqilsa ham sikl davom etadi: bir kungi xato keyingi kunlarni to'xtatmasin.
  # Xabar logga ERROR bilan chiqadi — monitoring shuni ushlaydi
  bash /scripts/backup-db.sh || echo "ERROR: zaxira nusxa olinmadi" >&2
done
