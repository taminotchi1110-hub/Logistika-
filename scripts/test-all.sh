#!/usr/bin/env bash
# KARVON — barcha uchidan-uchiga testlar
#
# API ishlab turgan bo'lishi kerak. Testlar haqiqiy HTTP va WebSocket
# chaqiruvlari qiladi — mock yo'q.
#
#   bash scripts/test-all.sh
set -uo pipefail

cd "$(dirname "$0")/.."

echo "=== OTP limit hisoblagichlarini tozalash (faqat dev) ==="
node scripts/reset-rate-limits.js || exit 1

FAILED=0

# Har bir to'plamning natijasi GitHub ishining SARHISOBIGA ham
# yoziladi (`$GITHUB_STEP_SUMMARY`).
#
# NEGA: Actions loglarini ko'rish uchun GitHub'ga kirish kerak, sarhisob
# esa hammaga ochiq. Qaysi to'plam yiqilganini bilish uchun log ochish
# shart bo'lmaydi — birinchi CI yiqilishida aynan shu muammo bo'ldi.
summary() {
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$1" >> "$GITHUB_STEP_SUMMARY"
  return 0
}

# Yiqilgan to'plam ANNOTATSIYA sifatida ham chiqadi.
#
# Sarhisob (`$GITHUB_STEP_SUMMARY`) tizimga kirmagan odamga
# ko'rinmaydi — buni ikkinchi yiqilishda bilib oldik. Annotatsiya esa
# ish sahifasining tepasida hammaga ochiq turadi.
annotate() {
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::error::$1"
  return 0
}

summary "## Backend uchidan-uchiga"

run() {
  echo ""
  echo "############################################################"
  echo "#  $1"
  echo "############################################################"
  local title="$1"
  shift
  if "$@"; then
    summary "- ✅ $title"
  else
    FAILED=1
    summary "- ❌ **$title**"
    annotate "Toʻplam yiqildi: $title"
  fi
}

run "1. Asosiy oqim (auth, park, hujjatlar, yuklar)" bash scripts/smoke-test.sh
run "2. Takliflar, buyurtma va kontakt ko'rinishi" bash scripts/smoke-test-orders.sh
run "3. WebSocket: chat va bildirishnoma banneri" node scripts/ws-test.js
run "4. Oflayn push navbati" node scripts/push-test.js
run "5. Avtomatik matching (Match Score)" node scripts/matching-test.js
run "6. Jonli GPS kuzatuv" node scripts/tracking-test.js
run "7. Hamyon, ledger va PSP toʻlovlari" node scripts/payments-test.js
run "8. Ikki tomonlama reyting" node scripts/ratings-test.js
run "9. Admin paneli" node scripts/admin-test.js
run "10. Mijozning \"Yuklarim\" roʻyxati" node scripts/my-loads-test.js

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "\033[32mBARCHA TO'PLAMLAR O'TDI\033[0m"
else
  echo -e "\033[31mKAMIDA BITTA TO'PLAM YIQILDI\033[0m"
fi
exit "$FAILED"
