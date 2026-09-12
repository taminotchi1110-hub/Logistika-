#!/usr/bin/env bash
# Mobil ilovani do'kon uchun yig'adi.
#
#   API_BASE_URL=https://api.karvon.uz/v1 WS_URL=https://api.karvon.uz \
#   SUPPORT_PHONE=+998XXXXXXXXX bash scripts/build-mobile-release.sh android
#
#   ... bash scripts/build-mobile-release.sh ios      # faqat macOS (Xcode)
#
# Biror narsa yetishmasa YIG'ILMAYDI:
#   - manzillar https: reliz ilova oddiy http ga ulanmaydi (Android
#     cleartext va iOS ATS taqiqlaydi) — xato faqat telefonda ko'rinardi
#   - SUPPORT_PHONE: bloklangan foydalanuvchining yagona aloqa yo'li
#   - Android imzo kaliti: debug imzoli paketni Play Console rad etadi
#   - Firebase fayli: pushsiz reliz faqat ONGLI qaror bilan (ALLOW_NO_PUSH=1)
#
# Kod obfuskatsiya qilinadi. Xato izlarini ochish uchun belgilar
# build/symbols/ ga yoziladi — ularni har reliz bilan birga ARXIVLANG,
# aks holda do'kondan kelgan xato izi o'qib bo'lmas holda qoladi.
#
# Batafsil: docs/20-mobile-release.md

set -euo pipefail
cd "$(dirname "$0")/../apps/mobile"

target=${1:-android}
fail() { echo "XATO: $*" >&2; exit 1; }

[[ "${API_BASE_URL:-}" == https://* ]] || fail "API_BASE_URL https:// bilan boshlanishi kerak (hozir: '${API_BASE_URL:-}')"
[[ "${WS_URL:-}" == https://* ]] || fail "WS_URL https:// bilan boshlanishi kerak (hozir: '${WS_URL:-}')"
[[ "${SUPPORT_PHONE:-}" =~ ^\+998[0-9]{9}$ ]] || fail "SUPPORT_PHONE +998XXXXXXXXX ko'rinishida bo'lishi kerak"

defines=(
  "--dart-define=API_BASE_URL=$API_BASE_URL"
  "--dart-define=WS_URL=$WS_URL"
  "--dart-define=SUPPORT_PHONE=$SUPPORT_PHONE"
  "--dart-define=ENVIRONMENT=production"
)
# OSM ning ochiq plitka serveri tijorat yuklamasiga ruxsat bermaydi —
# prodda o'z yoki shartnomali plitka manzili beriladi
if [ -n "${MAP_TILE_URL:-}" ]; then
  defines+=("--dart-define=MAP_TILE_URL=$MAP_TILE_URL")
else
  echo "Ogohlantirish: MAP_TILE_URL berilmagan — OSM ochiq serveri ishlatiladi (tijorat uchun mos emas)"
fi

common=(--release --obfuscate --split-debug-info=build/symbols "${defines[@]}")

need_push_config() {
  [ -f "$1" ] && return 0
  [ "${ALLOW_NO_PUSH:-}" = "1" ] && { echo "Ogohlantirish: $1 yo'q — reliz PUSHSIZ"; return 0; }
  fail "$1 yo'q — push ishlamaydi. Ataylab pushsiz bo'lsa: ALLOW_NO_PUSH=1"
}

flutter pub get
flutter analyze
flutter test

case "$target" in
  android)
    [ -f android/key.properties ] || fail "android/key.properties yo'q — docs/20-mobile-release.md, \"Imzo kaliti\""
    need_push_config android/app/google-services.json
    flutter build appbundle "${common[@]}"
    echo "Tayyor: apps/mobile/build/app/outputs/bundle/release/app-release.aab"
    ;;
  ios)
    [ "$(uname)" = "Darwin" ] || fail "iOS faqat macOS da (Xcode bilan) yig'iladi"
    need_push_config ios/Runner/GoogleService-Info.plist
    flutter build ipa "${common[@]}"
    echo "Tayyor: apps/mobile/build/ios/ipa/ — Transporter yoki Xcode orqali App Store Connect'ga"
    ;;
  *)
    fail "Noma'lum platforma: $target (android | ios)"
    ;;
esac

echo "Xato izlari uchun belgilar: apps/mobile/build/symbols/ — reliz versiyasi bilan birga arxivlang"
