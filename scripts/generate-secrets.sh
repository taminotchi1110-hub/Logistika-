#!/usr/bin/env bash
# Ishlab chiqarish uchun maxfiy qiymatlarni yaratadi.
#
#   bash scripts/generate-secrets.sh
#
# Chiqqan qatorlarni .env.production dagi CHANGE_ME lar o'rniga qo'ying.
# Qiymatlar HECH QAYERGA yuborilmaydi — faqat ekranga chiqadi. Ularni
# parol menejerida saqlang:
#   - JWT kalitlari yo'qolsa — hamma foydalanuvchi qaytadan kiradi;
#   - FIELD_ENCRYPTION_KEY yo'qolsa — shifrlangan maydonlar O'QIB BO'LMAS.

set -euo pipefail
command -v openssl >/dev/null || { echo "openssl topilmadi" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$tmp/jwt.key" 2>/dev/null
openssl pkey -in "$tmp/jwt.key" -pubout -out "$tmp/jwt.pub" 2>/dev/null

# Faqat harf va raqam: parol DATABASE_URL va REDIS_URL ichida ham turadi,
# u yerda `/`, `+`, `@` URL'ni buzadi
token() { openssl rand -base64 96 | tr -dc 'A-Za-z0-9' | cut -c1-"$1"; }
# API kalitni base64 ko'rinishida qabul qiladi (config/jwt-keys.ts) —
# .env da ko'p qatorli PEM bilan ovora bo'lmaymiz
b64() { base64 <"$1" | tr -d '\n'; }

pg=$(token 32)
redis=$(token 32)

cat <<EOF
# ---- scripts/generate-secrets.sh · $(date -u +%Y-%m-%d) ----
POSTGRES_PASSWORD=$pg
DATABASE_URL=postgresql://karvon:$pg@postgres:5432/karvon
REDIS_PASSWORD=$redis
REDIS_URL=redis://:$redis@redis:6379
JWT_PRIVATE_KEY=$(b64 "$tmp/jwt.key")
JWT_PUBLIC_KEY=$(b64 "$tmp/jwt.pub")
OTP_PEPPER=$(token 48)
FIELD_ENCRYPTION_KEY=$(openssl rand -base64 32)
S3_SECRET_KEY=$(token 40)
ADMIN_JWT_SECRET=$(token 64)
EOF
