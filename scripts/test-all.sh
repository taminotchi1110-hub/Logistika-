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

run() {
  echo ""
  echo "############################################################"
  echo "#  $1"
  echo "############################################################"
  shift
  "$@" || FAILED=1
}

run "1. Asosiy oqim (auth, park, hujjatlar, yuklar)" bash scripts/smoke-test.sh
run "2. Takliflar, buyurtma va kontakt ko'rinishi" bash scripts/smoke-test-orders.sh
run "3. WebSocket: chat va bildirishnoma banneri" node scripts/ws-test.js
run "4. Oflayn push navbati" node scripts/push-test.js
run "5. Avtomatik matching (Match Score)" node scripts/matching-test.js
run "6. Jonli GPS kuzatuv" node scripts/tracking-test.js

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "\033[32mBARCHA TO'PLAMLAR O'TDI\033[0m"
else
  echo -e "\033[31mKAMIDA BITTA TO'PLAM YIQILDI\033[0m"
fi
exit "$FAILED"
