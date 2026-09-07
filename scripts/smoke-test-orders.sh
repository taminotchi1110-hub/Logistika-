#!/usr/bin/env bash
# ============================================================
#  KARVON — 4-bosqich tekshiruvi: taklif → buyurtma → kontakt
#
#  ASOSIY BIZNES QOIDASINI ISBOTLAYDI:
#  telefon raqami FAQAT haydovchi yuk olish nuqtasiga yetib
#  borganda ochiladi; unga qadar muloqot chat orqali.
#
#  Ishlatish (API ishlab turgan bo'lishi kerak):
#    bash scripts/smoke-test-orders.sh
# ============================================================
set -u

API="${API:-http://localhost:3000/v1}"
PSQL="${PSQL:-/c/Program Files/PostgreSQL/16/bin/psql.exe}"
PGURL="${PGURL:-postgresql://karvon:karvon_dev_password@localhost:5432/karvon}"

RND=$((RANDOM % 900000 + 100000))
SHIPPER_PHONE="+99893${RND}1"
DRIVER_PHONE="+99894${RND}2"

pass=0; fail=0

jget() { node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try { const o=JSON.parse(s); const v=process.argv[1].split('.').reduce((a,k)=>a?.[k],o);
        process.stdout.write(v===undefined||v===null?'':String(v)); } catch { process.stdout.write(''); }
});" "$1"; }

check() {
  if [ "$2" = "$3" ]; then printf '  \033[32m[OK]\033[0m   %-50s %s\n' "$1" "$3"; pass=$((pass+1));
  else printf '  \033[31m[XATO]\033[0m %-50s kutilgan=%s olingan=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
checkne() {
  if [ -n "$2" ]; then printf '  \033[32m[OK]\033[0m   %-50s %s\n' "$1" "${2:0:40}"; pass=$((pass+1));
  else printf '  \033[31m[XATO]\033[0m %-50s bosh\n' "$1"; fail=$((fail+1)); fi
}
step() { printf '\n\033[36m>> %s\033[0m\n' "$1"; }
# DIQQAT: ulanish satri `-d` bayrogʻi bilan berilishi shart. Pozitsion
# argument sifatida berilsa psql uni baza nomi deb oladi va soʻrovni tashlab yuboradi.
sql() { "$PSQL" -d "$PGURL" -tAc "$1" 2>&1 | tr -d '\r'; }

login() { # login <telefon> <rol> -> token
  local phone="$1" role="$2" code token
  code=$(curl -s -X POST "$API/auth/otp/request" -H 'Content-Type: application/json' \
         -d "{\"phone\":\"$phone\"}" | jget 'data.devCode')
  token=$(curl -s -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
          -d "{\"phone\":\"$phone\",\"code\":\"$code\"}" | jget 'data.accessToken')
  curl -s -X POST "$API/auth/profile" -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "{\"firstName\":\"Test\",\"lastName\":\"User\",\"role\":\"$role\"}" > /dev/null
  echo "$token"
}

# ------------------------------------------------------------- tayyorgarlik
step "Tayyorgarlik: ikki foydalanuvchi, transport, yuk"
SH_TOKEN=$(login "$SHIPPER_PHONE" SHIPPER)
DR_TOKEN=$(login "$DRIVER_PHONE" DRIVER)
checkne "yuk beruvchi tokeni" "$SH_TOKEN"
checkne "haydovchi tokeni" "$DR_TOKEN"

PLATE="01A$((RANDOM % 900 + 100))BC"
VEH=$(curl -s -X POST "$API/vehicles" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d "{
    \"vehicleTypeId\":4,\"bodyTypeId\":1,\"brand\":\"Isuzu\",\"model\":\"NPR 75\",
    \"plateNumber\":\"$PLATE\",\"capacityKg\":5000,\"volumeM3\":25.5}")
VEH_ID=$(echo "$VEH" | jget 'data.id')
checkne "transport qo'shildi" "$VEH_ID"

curl -s -X POST "$API/me/driver/routes" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{"fromRegionId":1,"toRegionId":3}' > /dev/null

FROM=$(node -e "console.log(new Date(Date.now()+3600e3).toISOString())")
TO=$(node -e "console.log(new Date(Date.now()+6*3600e3).toISOString())")
LOAD=$(curl -s -X POST "$API/loads" -H "Authorization: Bearer $SH_TOKEN" \
  -H 'Content-Type: application/json' -d "{
    \"title\":\"Mebel\",\"categoryId\":3,\"weightKg\":4500,
    \"pickup\":{\"address\":\"Toshkent, Yunusobod 108\",\"lat\":41.3111,\"lng\":69.2797,\"contactName\":\"Anvar aka\",\"contactPhone\":\"$SHIPPER_PHONE\"},
    \"delivery\":{\"address\":\"Samarqand, Registon\",\"lat\":39.6542,\"lng\":66.9597,\"contactPhone\":\"901234567\"},
    \"pickupFrom\":\"$FROM\",\"pickupTo\":\"$TO\",
    \"priceTiyin\":240000000,\"publishNow\":true}")
LOAD_ID=$(echo "$LOAD" | jget 'data.id')
checkne "yuk e'lon qilindi" "$LOAD_ID"

# ------------------------------------------------------- admin verifikatsiya
step "Admin verifikatsiyasi (SQL orqali — admin panel 5-bosqichda)"
DRIVER_UUID=$(sql "SELECT id FROM users WHERE phone='$DRIVER_PHONE'")
sql "UPDATE driver_profiles SET verification_status='VERIFIED' WHERE user_id='$DRIVER_UUID'" > /dev/null
sql "UPDATE vehicles SET verification_status='VERIFIED' WHERE driver_id='$DRIVER_UUID'" > /dev/null
sql "INSERT INTO documents(owner_type,owner_id,type,file_key,verification_status) VALUES ('USER','$DRIVER_UUID','PASSPORT','t/p.jpg','VERIFIED'),('DRIVER','$DRIVER_UUID','DRIVER_LICENSE','t/l.jpg','VERIFIED')" > /dev/null

RD=$(curl -s "$API/me/driver/readiness" -H "Authorization: Bearer $DR_TOKEN")
check "haydovchi endi taklif yubora oladi" "true" "$(echo "$RD" | jget 'data.canSendOffers')"

# ---------------------------------------------------------------- takliflar
step "Taklif yuborish"
OFFER=$(curl -s -X POST "$API/loads/$LOAD_ID/offers" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"vehicleId\":\"$VEH_ID\",\"offeredPriceTiyin\":230000000,\"message\":\"Bugun 15:00 da boraman\"}")
OFFER_ID=$(echo "$OFFER" | jget 'data.id')
checkne "taklif yuborildi" "$OFFER_ID"
check "taklif narxi" "230000000" "$(echo "$OFFER" | jget 'data.offeredPriceTiyin')"

DUP=$(curl -s -X POST "$API/loads/$LOAD_ID/offers" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"vehicleId\":\"$VEH_ID\"}")
check "ikkinchi taklif rad etildi" "VALIDATION_FAILED" "$(echo "$DUP" | jget 'error.code')"

LOWBALL=$(curl -s -X POST "$API/loads/$LOAD_ID/offers" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"vehicleId\":\"$VEH_ID\",\"offeredPriceTiyin\":10000000}")
checkne "chegaradan tashqari narx rad etildi" "$(echo "$LOWBALL" | jget 'error.code')"

OFFERS=$(curl -s "$API/loads/$LOAD_ID/offers" -H "Authorization: Bearer $SH_TOKEN")
check "klient taklifni ko'rdi" "1" "$(echo "$OFFERS" | jget 'data.length')"

# ---------------------------------------------------------------- buyurtma
step "Taklifni qabul qilish -> buyurtma va CHAT"
ORDER=$(curl -s -X POST "$API/offers/$OFFER_ID/accept" -H "Authorization: Bearer $SH_TOKEN")
ORDER_ID=$(echo "$ORDER" | jget 'data.id')
checkne "buyurtma yaratildi" "$ORDER_ID"
check "holat ASSIGNED" "ASSIGNED" "$(echo "$ORDER" | jget 'data.status')"
checkne "CHAT OCHILDI (conversationId)" "$(echo "$ORDER" | jget 'data.conversationId')"
check "chat yozish mumkin" "true" "$(echo "$ORDER" | jget 'data.visibility.chatEnabled')"
checkne "komissiya hisoblandi" "$(echo "$ORDER" | jget 'data.commissionTiyin')"

LOAD_AFTER=$(curl -s "$API/loads/$LOAD_ID" -H "Authorization: Bearer $SH_TOKEN")
check "yuk band bo'ldi" "ASSIGNED" "$(echo "$LOAD_AFTER" | jget 'data.status')"

# ============================================================
#  ASOSIY QOIDA
# ============================================================
step "ASOSIY QOIDA: telefon yetib borgunga qadar YOPIQ"
ORD=$(curl -s "$API/orders/$ORDER_ID" -H "Authorization: Bearer $DR_TOKEN")
check "ASSIGNED — hamkor telefoni yopiq" "false" "$(echo "$ORD" | jget 'data.visibility.counterpartyPhone')"
checkne "ASSIGNED — telefon maskalangan" "$(echo "$ORD" | jget 'data.counterparty.phone')"
check "ASSIGNED — maskada '***' bor" "1" "$(echo "$ORD" | jget 'data.counterparty.phone' | grep -c '\*\*\*')"
check "'Bog'lana olmayapman' tugmasi ko'rinadi" "true" "$(echo "$ORD" | jget 'data.visibility.emergencyRevealAvailable')"

CONF=$(curl -s -X POST "$API/orders/$ORDER_ID/status" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"CONFIRMED"}')
check "haydovchi tasdiqladi" "CONFIRMED" "$(echo "$CONF" | jget 'data.status')"
check "CONFIRMED — telefon HALI YOPIQ" "false" "$(echo "$CONF" | jget 'data.visibility.counterpartyPhone')"

WRONG=$(curl -s -X POST "$API/orders/$ORDER_ID/status" -H "Authorization: Bearer $SH_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"EN_ROUTE_TO_PICKUP"}')
check "klient haydovchi nomidan status qo'ya olmaydi" "VALIDATION_FAILED" "$(echo "$WRONG" | jget 'error.code')"

SKIP=$(curl -s -X POST "$API/orders/$ORDER_ID/status" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"DELIVERED"}')
check "bosqichni o'tkazib yuborib bo'lmaydi" "VALIDATION_FAILED" "$(echo "$SKIP" | jget 'error.code')"

ENROUTE=$(curl -s -X POST "$API/orders/$ORDER_ID/status" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"EN_ROUTE_TO_PICKUP","lat":41.31,"lng":69.27}')
check "yo'lga chiqdi" "EN_ROUTE_TO_PICKUP" "$(echo "$ENROUTE" | jget 'data.status')"
check "EN_ROUTE — telefon HALI YOPIQ" "false" "$(echo "$ENROUTE" | jget 'data.visibility.counterpartyPhone')"

step "YETIB BORDI -> TELEFON OCHILADI"
ARR=$(curl -s -X POST "$API/orders/$ORDER_ID/status" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"ARRIVED_AT_PICKUP","lat":41.3111,"lng":69.2797}')
check "yuk olish nuqtasida" "ARRIVED_AT_PICKUP" "$(echo "$ARR" | jget 'data.status')"
check "* HAMKOR TELEFONI OCHILDI" "true" "$(echo "$ARR" | jget 'data.visibility.counterpartyPhone')"
check "* TO'LIQ RAQAM KO'RINDI" "$SHIPPER_PHONE" "$(echo "$ARR" | jget 'data.counterparty.phone')"
check "* OLISH KONTAKTI OCHILDI" "$SHIPPER_PHONE" "$(echo "$ARR" | jget 'data.load.pickupContactPhone')"
check "yetkazish kontakti HALI yopiq" "false" "$(echo "$ARR" | jget 'data.visibility.deliveryPhone')"
check "favqulodda tugma endi kerak emas" "false" "$(echo "$ARR" | jget 'data.visibility.emergencyRevealAvailable')"

SH_VIEW=$(curl -s "$API/orders/$ORDER_ID" -H "Authorization: Bearer $SH_TOKEN")
check "klient ham haydovchi raqamini ko'rdi" "$DRIVER_PHONE" "$(echo "$SH_VIEW" | jget 'data.counterparty.phone')"

step "Yuk ortildi -> yetkazish kontakti ochiladi"
LOADED=$(curl -s -X POST "$API/orders/$ORDER_ID/status" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"LOADED","note":"5 palet ortildi"}')
check "yuk ortildi" "LOADED" "$(echo "$LOADED" | jget 'data.status')"
check "yetkazish kontakti ochildi" "true" "$(echo "$LOADED" | jget 'data.visibility.deliveryPhone')"
check "yetkazish raqami to'liq" "+998901234567" "$(echo "$LOADED" | jget 'data.load.deliveryContactPhone')"

step "Statuslar tarixi va bildirishnomalar"
HIST=$(sql "SELECT count(*) FROM order_status_history WHERE order_id='$ORDER_ID'")
check "har bir o'tish tarixga yozildi" "5" "$HIST"
GEOM=$(sql "SELECT count(*) FROM order_status_history WHERE order_id='$ORDER_ID' AND geom IS NOT NULL")
check "koordinatalar ham saqlandi" "2" "$GEOM"

NOTIF_N=$(curl -s "$API/notifications" -H "Authorization: Bearer $DR_TOKEN" | jget 'data.length')
check "haydovchida bildirishnoma bor" "ha" "$([ "${NOTIF_N:-0}" -gt 0 ] && echo ha || echo "yo'q ($NOTIF_N)")"

UNREAD_N=$(curl -s "$API/notifications/unread-count" -H "Authorization: Bearer $SH_TOKEN" | jget 'data.count')
check "klientda o'qilmagan bor" "ha" "$([ "${UNREAD_N:-0}" -gt 0 ] && echo ha || echo "yo'q ($UNREAD_N)")"

DBN=$(sql "SELECT count(*) FROM notifications")
check "bazada bildirishnomalar yozildi" "ha" "$([ "${DBN:-0}" -gt 0 ] && echo ha || echo "yo'q ($DBN)")"

printf '\n\033[1m========== 4-BOSQICH NATIJASI ==========\033[0m\n'
printf "  O'tdi: \033[32m%d\033[0m    Yiqildi: \033[31m%d\033[0m\n\n" "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
