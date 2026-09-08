#!/usr/bin/env bash
# ============================================================
#  KARVON — uchdan-uchgacha (end-to-end) tekshiruv
#
#  Haqiqiy HTTP so'rovlar bilan butun zanjirni sinaydi:
#    yuk beruvchi ro'yxatdan o'tadi -> yuk e'lon qiladi
#    haydovchi ro'yxatdan o'tadi   -> transport qo'shadi
#    haydovchi lentada o'sha yukni ko'radi
#
#  Ishlatish (API ishlab turgan bo'lishi kerak):
#    bash scripts/smoke-test.sh
# ============================================================
set -u

API="${API:-http://localhost:3000/v1}"

# Har ishga tushirishda YANGI raqam va davlat raqami: test qayta-qayta
# ishlashi kerak. Qat'iy qiymatlar bilan u faqat bo'sh bazada o'tardi —
# CI'da bunday test foydasiz.
RND=$(( (RANDOM % 900) + 100 ))
RND2=$(( (RANDOM % 900) + 100 ))
# Prefiks ANIQ berilgan (90 va 93 — Beeline va Ucell).
# Ilgari "9${RND}" ishlatilar edi va tasodifan 92/96 chiqib qolardi —
# bular mavjud boʻlmagan operator kodlari va server ularni rad etadi.
SHIPPER_PHONE="${SHIPPER_PHONE:-+99890${RND}${RND2}1}"
DRIVER_PHONE="${DRIVER_PHONE:-+99893${RND}${RND2}2}"
PLATE_A="01 a ${RND} bc"
PLATE_A_NORM="01A${RND}BC"
PLATE_B="01A${RND2}BC"
PLATE_A_FMT="01 A ${RND} BC"

pass=0; fail=0

# JSON'dan qiymat olish (node orqali — jq har doim ham bo'lmaydi)
# Ro'yxatdan ID bo'yicha elementni topib, maydonini chiqaradi.
#
# NEGA KERAK: lenta — global ro'yxat, unda boshqa testlar qoldirgan
# e'lonlar ham bo'ladi. "data.0" ga bog'lanish yoki "uzunlik = 1" deb
# tekshirish shu sababli ishonchsiz. Biz aynan o'z e'lonimizni qidiramiz.
jfind() { node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try {
    const o=JSON.parse(s);
    const item=(o.data||[]).find(x=>x.id===process.argv[1]);
    if(!item){process.stdout.write('TOPILMADI');return;}
    const v=process.argv[2]?process.argv[2].split('.').reduce((a,k)=>a?.[k],item):item.id;
    process.stdout.write(v===undefined||v===null?'':String(v));
  } catch { process.stdout.write(''); }
});" "$1" "${2:-}"; }

jget() { node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try { const o=JSON.parse(s); const v=process.argv[1].split('.').reduce((a,k)=>a?.[k],o);
        process.stdout.write(v===undefined||v===null?'':String(v)); } catch { process.stdout.write(''); }
});" "$1"; }

check() { # check "nom" "kutilgan" "olingan"
  if [ "$2" = "$3" ]; then printf '  \033[32m[OK]\033[0m   %-48s %s\n' "$1" "$3"; pass=$((pass+1));
  else printf '  \033[31m[XATO]\033[0m %-48s kutilgan=%s olingan=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
checkne() { # bo'sh bo'lmasligi kerak
  if [ -n "$2" ]; then printf '  \033[32m[OK]\033[0m   %-48s %s\n' "$1" "${2:0:40}"; pass=$((pass+1));
  else printf '  \033[31m[XATO]\033[0m %-48s bo'\''sh\n' "$1"; fail=$((fail+1)); fi
}
step() { printf '\n\033[36m>> %s\033[0m\n' "$1"; }

# ------------------------------------------------------------ spravochnik
step "Spravochnik"
REF=$(curl -s "$API/reference/all")
check "viloyatlar soni" "14" "$(echo "$REF" | jget 'data.regions.length')"
check "transport turlari" "13" "$(echo "$REF" | jget 'data.vehicleTypes.length')"
checkne "versiya hash" "$(echo "$REF" | jget 'data.version')"

# ------------------------------------------------------- yuk beruvchi kirish
step "Yuk beruvchi — SMS OTP orqali kirish"
OTP=$(curl -s -X POST "$API/auth/otp/request" -H 'Content-Type: application/json' \
      -d "{\"phone\":\"$SHIPPER_PHONE\"}")
CODE=$(echo "$OTP" | jget 'data.devCode')
checkne "OTP kodi olindi" "$CODE"

# Cooldown ishlayaptimi — darhol ikkinchi so'rov 429 bo'lishi kerak
CD=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/otp/request" \
     -H 'Content-Type: application/json' -d "{\"phone\":\"$SHIPPER_PHONE\"}")
check "cooldown (2-so'rov darhol)" "429" "$CD"

# Noto'g'ri kod
BAD=$(curl -s -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
      -d "{\"phone\":\"$SHIPPER_PHONE\",\"code\":\"000000\"}")
check "noto'g'ri kod rad etildi" "OTP_INCORRECT" "$(echo "$BAD" | jget 'error.code')"

AUTH=$(curl -s -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
       -d "{\"phone\":\"$SHIPPER_PHONE\",\"code\":\"$CODE\",\"device\":{\"platform\":\"android\",\"appVersion\":\"1.0.0\"}}")
SH_TOKEN=$(echo "$AUTH" | jget 'data.accessToken')
checkne "access token" "$SH_TOKEN"
check "yangi foydalanuvchi" "true" "$(echo "$AUTH" | jget 'data.isNewUser')"

# Bir kod ikki marta ishlamasligi kerak
REPLAY=$(curl -s -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
         -d "{\"phone\":\"$SHIPPER_PHONE\",\"code\":\"$CODE\"}")
check "kod qayta ishlatilmadi (replay)" "OTP_NOT_FOUND" "$(echo "$REPLAY" | jget 'error.code')"

step "Yuk beruvchi — profil"
PROF=$(curl -s -X POST "$API/auth/profile" -H "Authorization: Bearer $SH_TOKEN" \
       -H 'Content-Type: application/json' \
       -d '{"firstName":"Bobur","lastName":"Aliyev","role":"SHIPPER"}')
check "profil to'ldirildi" "ACTIVE" "$(echo "$PROF" | jget 'data.status')"

ME=$(curl -s "$API/me" -H "Authorization: Bearer $SH_TOKEN")
check "GET /me ismi" "Bobur" "$(echo "$ME" | jget 'data.firstName')"

# Himoya
NOAUTH=$(curl -s "$API/me")
check "tokensiz 401" "AUTH_UNAUTHORIZED" "$(echo "$NOAUTH" | jget 'error.code')"
BADTOK=$(curl -s "$API/me" -H "Authorization: Bearer aniq.yaroqsiz.token")
check "yaroqsiz token" "AUTH_TOKEN_INVALID" "$(echo "$BADTOK" | jget 'error.code')"

# ------------------------------------------------------------ masofa/narx
step "Masofa va narx tavsiyasi (Toshkent -> Samarqand)"
EST=$(curl -s "$API/loads/estimate?fromLat=41.3111&fromLng=69.2797&toLat=39.6542&toLng=66.9597&weightKg=4500" \
      -H "Authorization: Bearer $SH_TOKEN")
DIST=$(echo "$EST" | jget 'data.distanceKm')
checkne "masofa (km)" "$DIST"
check "manba (OSRM yo'q -> taxmin)" "estimate" "$(echo "$EST" | jget 'data.routeSource')"
check "olish viloyati" "Toshkent shahri" "$(echo "$EST" | jget 'data.pickupRegion.name')"
check "yetkazish viloyati" "Samarqand" "$(echo "$EST" | jget 'data.deliveryRegion.name')"
checkne "tavsiya narx (tiyin)" "$(echo "$EST" | jget 'data.price.suggestedPriceTiyin')"

# ------------------------------------------------------------- yuk e'loni
step "Yuk e'loni"
FROM=$(node -e "console.log(new Date(Date.now()+3600e3).toISOString())")
TO=$(node -e "console.log(new Date(Date.now()+6*3600e3).toISOString())")
LOAD=$(curl -s -X POST "$API/loads" -H "Authorization: Bearer $SH_TOKEN" \
  -H 'Content-Type: application/json' -d "{
    \"title\":\"Mebel — 5 ta shkaf\",
    \"categoryId\":3, \"weightKg\":4500, \"volumeM3\":18.5,
    \"pickup\":{\"address\":\"Toshkent, Yunusobod, Amir Temur 108\",\"lat\":41.3111,\"lng\":69.2797,\"contactName\":\"Anvar aka\",\"contactPhone\":\"901112233\"},
    \"delivery\":{\"address\":\"Samarqand, Registon\",\"lat\":39.6542,\"lng\":66.9597},
    \"pickupFrom\":\"$FROM\", \"pickupTo\":\"$TO\",
    \"requiredVehicleTypeIds\":[4], \"priceTiyin\":240000000,
    \"paymentMethod\":\"CASH\", \"publishNow\":true }")
LOAD_ID=$(echo "$LOAD" | jget 'data.id')
checkne "yuk yaratildi" "$LOAD_ID"
check "holat" "PUBLISHED" "$(echo "$LOAD" | jget 'data.status')"
checkne "masofa hisoblandi" "$(echo "$LOAD" | jget 'data.distanceKm')"
check "olish viloyati aniqlandi" "Toshkent shahri" "$(echo "$LOAD" | jget 'data.pickup.regionName')"
check "egasi telefonni to'liq ko'radi" "+998901112233" "$(echo "$LOAD" | jget 'data.pickup.contactPhone')"

MINE=$(curl -s "$API/loads/mine" -H "Authorization: Bearer $SH_TOKEN")
check "mening yuklarim" "1" "$(echo "$MINE" | jget 'data.length')"

# Noto'g'ri sana rad etilishi kerak
PAST=$(node -e "console.log(new Date(Date.now()-86400e3).toISOString())")
BADDATE=$(curl -s -X POST "$API/loads" -H "Authorization: Bearer $SH_TOKEN" \
  -H 'Content-Type: application/json' -d "{
    \"title\":\"Test\",\"categoryId\":3,\"weightKg\":100,
    \"pickup\":{\"address\":\"Toshkent, Chilonzor\",\"lat\":41.28,\"lng\":69.20},
    \"delivery\":{\"address\":\"Samarqand markaz\",\"lat\":39.65,\"lng\":66.96},
    \"pickupFrom\":\"$PAST\",\"pickupTo\":\"$PAST\",\"priceTiyin\":100000 }")
check "o'tib ketgan sana rad etildi" "LOAD_PICKUP_TIME_PASSED" "$(echo "$BADDATE" | jget 'error.code')"

# Sxemada yo'q maydon
MASS=$(curl -s -X POST "$API/auth/otp/request" -H 'Content-Type: application/json' \
       -d '{"phone":"+998903334455","role":"ADMIN"}')
check "mass-assignment himoyasi" "VALIDATION_FAILED" "$(echo "$MASS" | jget 'error.code')"

# ------------------------------------------------------------ haydovchi
step "Haydovchi — kirish va transport"
DOTP=$(curl -s -X POST "$API/auth/otp/request" -H 'Content-Type: application/json' \
       -d "{\"phone\":\"$DRIVER_PHONE\"}")
DCODE=$(echo "$DOTP" | jget 'data.devCode')
DAUTH=$(curl -s -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
        -d "{\"phone\":\"$DRIVER_PHONE\",\"code\":\"$DCODE\"}")
DR_TOKEN=$(echo "$DAUTH" | jget 'data.accessToken')
checkne "haydovchi token" "$DR_TOKEN"

curl -s -X POST "$API/auth/profile" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Alisher","lastName":"Karimov","role":"DRIVER"}' > /dev/null

VEH=$(curl -s -X POST "$API/vehicles" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{
    "vehicleTypeId":4,"bodyTypeId":1,"brand":"Isuzu","model":"NPR 75",
    "year":2019,"plateNumber":"'"$PLATE_A"'","capacityKg":5000,"volumeM3":25.5 }')
checkne "transport qo'shildi" "$(echo "$VEH" | jget 'data.id')"
check "davlat raqami normallashtirildi" "$PLATE_A_NORM" "$(echo "$VEH" | jget 'data.plateNumber')"
check "ko'rsatish formati" "$PLATE_A_FMT" "$(echo "$VEH" | jget 'data.plateFormatted')"
check "birinchi transport asosiy" "true" "$(echo "$VEH" | jget 'data.isPrimary')"

DUP=$(curl -s -X POST "$API/vehicles" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{
    "vehicleTypeId":4,"bodyTypeId":1,"brand":"Isuzu","model":"NPR",
    "plateNumber":"'"$PLATE_A_NORM"'","capacityKg":5000,"volumeM3":25 }')
check "takroriy davlat raqami rad etildi" "VEHICLE_PLATE_TAKEN" "$(echo "$DUP" | jget 'error.code')"

OVER=$(curl -s -X POST "$API/vehicles" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{
    "vehicleTypeId":1,"bodyTypeId":1,"brand":"Damas","model":"DL",
    "plateNumber":"'"$PLATE_B"'","capacityKg":20000,"volumeM3":3 }')
check "Damas uchun 20t quvvat rad etildi" "VALIDATION_FAILED" "$(echo "$OVER" | jget 'error.code')"

step "Haydovchi — verifikatsiya tayyorligi"
RD=$(curl -s "$API/me/driver/readiness" -H "Authorization: Bearer $DR_TOKEN")
check "profil to'liq" "true" "$(echo "$RD" | jget 'data.profileComplete')"
check "taklif yubora olmaydi (hujjat yo'q)" "false" "$(echo "$RD" | jget 'data.canSendOffers')"
checkne "qolgan qadamlar" "$(echo "$RD" | jget 'data.missingSteps')"

AVAIL=$(curl -s -X PATCH "$API/me/driver/availability" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{"availability":"AVAILABLE"}')
check "tasdiqlanmagan haydovchi bo'sh bo'la olmaydi" "DRIVER_NOT_VERIFIED" "$(echo "$AVAIL" | jget 'error.code')"

ROUTE=$(curl -s -X POST "$API/me/driver/routes" -H "Authorization: Bearer $DR_TOKEN" \
  -H 'Content-Type: application/json' -d '{"fromRegionId":1,"toRegionId":3,"isRegular":true}')
check "yo'nalish qo'shildi" "1" "$(echo "$ROUTE" | jget 'data.length')"

# ------------------------------------------------------------ lenta
step "Haydovchi lentasi"
FEED=$(curl -s "$API/loads/feed?lat=41.3111&lng=69.2797" -H "Authorization: Bearer $DR_TOKEN")
check "lentada aynan bizning yuk ko'rindi" "$LOAD_ID" "$(echo "$FEED" | jfind "$LOAD_ID")"
check "telefon MASKALANGAN" "+998 90 *** ** 33" "$(echo "$FEED" | jfind "$LOAD_ID" 'pickup.contactPhone')"
checkne "olish nuqtasigacha masofa" "$(echo "$FEED" | jfind "$LOAD_ID" 'distanceToPickupKm')"

FILT=$(curl -s "$API/loads/feed?fromRegionId=1&toRegionId=3&minWeightKg=1000&maxWeightKg=20000&vehicleTypeIds=4" \
       -H "Authorization: Bearer $DR_TOKEN")
check "filter bo'yicha topildi" "$LOAD_ID" "$(echo "$FILT" | jfind "$LOAD_ID")"

NOMATCH=$(curl -s "$API/loads/feed?fromRegionId=5&toRegionId=6" -H "Authorization: Bearer $DR_TOKEN")
check "mos kelmaydigan filter bo'sh" "0" "$(echo "$NOMATCH" | jget 'data.length')"

SHIPPER_FEED=$(curl -s "$API/loads/feed" -H "Authorization: Bearer $SH_TOKEN")
check "yuk beruvchi lentaga kira olmaydi" "USER_ROLE_NOT_ALLOWED" "$(echo "$SHIPPER_FEED" | jget 'error.code')"

# ------------------------------------------------------------ xulosa
printf '\n\033[1m================ NATIJA ================\033[0m\n'
printf '  O'\''tdi: \033[32m%d\033[0m    Yiqildi: \033[31m%d\033[0m\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
