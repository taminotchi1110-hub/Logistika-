#!/bin/sh
# KARVON — S3 mos fayl omborini (SeaweedFS) kirish kalitlari bilan ishga tushirish.
#
# Prod (docker-compose.prod.yml), dev (docker-compose.yml) va CI AYNAN SHU
# skriptni ishlatadi: CI prod'dagi ishga tushishni o'zi tekshiradi.
#
# Kalitlar muhitdan olinadi (S3_ACCESS_KEY, S3_SECRET_KEY) va konteyner
# ichidagi faylga yoziladi — ular tasvirga ham, repozitoriyga ham tushmaydi.
# So'ng tasvirning o'z entrypoint'i chaqiriladi: u /data egasini to'g'rilaydi
# va jarayonni root emas, `seaweed` foydalanuvchisi nomidan ishga tushiradi.
#
# Kalitsiz so'rov rad etiladi (403): bucket ommaviy emas, fayllar faqat API
# bergan qisqa muddatli imzolangan havola bilan o'qiladi va yoziladi.

set -eu

: "${S3_ACCESS_KEY:?S3_ACCESS_KEY kerak}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY kerak}"

# Kalitlar JSON ichiga qo'yiladi: qo'shtirnoq yoki teskari chiziq faylni
# buzardi. generate-secrets.sh faqat harf va raqam yaratadi
case "$S3_ACCESS_KEY$S3_SECRET_KEY" in
  *[!A-Za-z0-9_-]*)
    echo "S3_ACCESS_KEY va S3_SECRET_KEY da faqat harf, raqam, _ va - bo'lishi mumkin" >&2
    exit 1
    ;;
esac

config=/etc/seaweedfs/s3.json
# Faqat egasi o'qiydi. Qavs ichida — umask ombor yaratadigan fayllarga o'tmasin
(
  umask 077
  printf '{"identities":[{"name":"karvon","credentials":[{"accessKey":"%s","secretKey":"%s"}],"actions":["Admin","Read","List","Tagging","Write"]}]}\n' \
    "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >"$config"
)
# Ombor `seaweed` nomidan ishlaydi — fayl unga o'qiladigan bo'lsin
if [ "$(id -u)" = 0 ]; then
  chown seaweed:seaweed "$config"
fi

exec /entrypoint.sh server -s3 -s3.port=8333 -s3.config="$config" "$@"
