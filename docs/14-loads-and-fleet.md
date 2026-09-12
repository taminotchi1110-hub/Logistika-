# 14 — Transport, hujjatlar, geo va yuk e'loni (3-bosqich)

Bu bosqichda **haydovchi ro'yxatdan o'tishidan yuk lentasigacha** bo'lgan
to'liq zanjir kodlandi.

## 14.1. Yangi modullar

| Modul | Vazifasi |
|---|---|
| `infra/storage` | S3 (SeaweedFS yoki bulut) — presigned upload/download, bucket avtomatik yaratish (dev; prodda `deploy.sh`) |
| `modules/media` | Fayl yuklash uchun vaqtinchalik havolalar |
| `modules/documents` | Hujjatlarni qayd etish, egalik tekshiruvi, verifikatsiya tayyorligi |
| `modules/vehicles` | Transport CRUD, spravochnik bilan validatsiya, asosiy transport |
| `modules/drivers` | Bo'sh/band holati, ishlash yo'nalishlari, verifikatsiya qadamlari |
| `modules/geo` | OSRM marshrut, geokoding, viloyat aniqlash (PostGIS) |
| `modules/addresses` | Saqlangan manzillar |
| `modules/loads` | Yuk e'loni, narx tavsiyasi, haydovchi lentasi |

## 14.2. Fayl yuklash oqimi (nega uch qadam)

```
1. POST /media/presign        → { uploadUrl, fileKey }
2. PUT  <uploadUrl>           → fayl TO'G'RIDAN-TO'G'RI S3 ga ketadi
3. POST /documents            → { fileKey, ownerType, ownerId, type }
```

**Nega API server orqali emas?** 20 MB rasm API replikasining xotirasi va
CPU'sini band qiladi; 50 ta parallel yuklash butun serverni sekinlashtiradi.
Presigned URL bilan fayl S3 ga to'g'ridan-to'g'ri boradi, server esa faqat
imzo qo'yadi (millisekundlar).

**Xavfsizlik choralari:**
- `Content-Type` va `Content-Length` **imzoga kiradi** — "1 MB rasm" deb aytib
  500 MB video yuklab bo'lmaydi.
- Fayl nomi foydalanuvchidan olinmaydi — UUID generatsiya qilinadi
  (path traversal butunlay yopiladi).
- Kalit `<purpose>/<userId>/<yil>/<oy>/<uuid>.<ext>` ko'rinishida —
  egalik kalitning o'zidan tekshiriladi.
- 3-qadamda server S3'dan `HEAD` so'raydi: fayl haqiqatan bormi, hajmi qancha.
  Mijozning "yukladim" deganiga ishonilmaydi.
- Bucket **private**, o'qish ham 5 daqiqalik presigned URL orqali.

## 14.3. Transport validatsiyasi

| Qoida | Sabab |
|---|---|
| Davlat raqami normallashtiriladi (`01 a 123 bc` → `01A123BC`) | Bir mashina ikki xil yozuvda ikki marta ro'yxatdan o'tmasin |
| Kirill harflari lotinga o'giriladi | Klaviatura xatosi juda keng tarqalgan |
| Hudud kodi (01–99) ro'yxatga solishtiriladi | Soxta raqamni erta ushlash |
| Quvvat transport turi chegarasiga solishtiriladi (±30%) | "Damas — 20 tonna" matchingni butunlay buzadi |
| Harorat rejimi faqat ref/izoterm kuzovda | Mos bo'lmagan yuk yuborilmasin |
| Bitta akkauntda 20 tagacha transport | Park uchun korporativ tarif kerak |
| **Tasdiqlangan transportning texnik parametrlari qulflanadi** | 5 t deb tasdiqlatib, keyin 20 t qilib qo'yish — firibgarlik yo'li |

Texnik parametr o'zgarsa verifikatsiya avtomatik `NOT_SUBMITTED` ga qaytadi.

## 14.4. Haydovchi verifikatsiyasi — yagona manba

`GET /me/driver/readiness` butun ro'yxatdan o'tish jarayonining **yagona
haqiqat manbai**:

```jsonc
{
  "profileComplete": true,
  "hasIdentity": true,
  "hasLicense": false,
  "hasVerifiedVehicle": false,
  "hasRoutes": true,
  "verificationStatus": "PENDING",
  "canSendOffers": false,
  "missingSteps": ["DRIVER_LICENSE", "VERIFIED_VEHICLE"]
}
```

Mobil ilova shu javobga qarab qadamlarni ko'rsatadi, `PATCH /me/driver/availability`
ham, keyinchalik taklif yuborish ham aynan shu tekshiruvga tayanadi.

**Nega muhim:** agar bu mantiq uch joyda takrorlansa, ertami-kechmi "ilovada
tugma faol, lekin server rad etadi" holati chiqadi — bu foydalanuvchi uchun
eng asabiylashtiruvchi xato turi.

## 14.5. Geo servis

### Marshrut (`RoutingService`)

```
OSRM bor  → aniq yo'l masofasi + polyline   → source: "osrm"
OSRM yo'q → haversine × yo'l koeffitsienti  → source: "estimate"
```

- **Circuit breaker:** OSRM yiqilsa 30 soniya davomida qayta urinilmaydi —
  aks holda har bir so'rov 8 soniya kutib turardi.
- **Kesh:** natija Redis'da 6 soat, koordinatalar ~100 m aniqlikda yaxlitlanadi.
- **Taxminiy natija keshlanmaydi** — OSRM ko'tarilishi bilan aniq qiymat kelsin.
- `source` javobda qaytadi: hech kim taxminiy raqamni aniq deb o'ylamaydi.

Prodda OSRM **majburiy** (`env.schema.ts` da tekshiriladi) — narx va ETA
masofaga bog'liq, taxmin bilan hisoblab bo'lmaydi.

### OSRM'ni ko'tarish (ixtiyoriy, lokal)

```bash
mkdir -p osrm && cd osrm
curl -O https://download.geofabrik.de/asia/uzbekistan-latest.osm.pbf
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/uzbekistan-latest.osm.pbf
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/uzbekistan-latest.osrm
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/uzbekistan-latest.osrm
docker run -d -p 5000:5000 -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-routed --algorithm mld /data/uzbekistan-latest.osrm
```

Keyin `.env` da: `OSRM_BASE_URL=http://localhost:5000`

### Geokoding

| Provayder | Qachon |
|---|---|
| `nominatim` | Lokal ishlab chiqish — kalit kerak emas |
| `yandex` | Production — O'zbekiston manzillari ("Chilonzor 19-kvartal") ancha to'liq |

Natijalar 24 soat keshlanadi.

### Viloyatni aniqlash

Avval PostGIS polygon bo'yicha (`ST_Covers`), polygon bo'lmasa — eng yaqin
markazga qarab (`<->` operatori, GIST indeks). Viloyat chegaralari
`regions.boundary` ga yuklangach ikkinchi yo'l o'z-o'zidan ishlamay qoladi.

## 14.6. Yuk e'loni

### Yaratish oqimi

```
POST /loads/estimate   → masofa, vaqt, narx tavsiyasi (forma to'ldirilayotganda)
POST /loads            → yuk yaratiladi (DRAFT yoki darhol PUBLISHED)
POST /loads/:id/publish → qoralamani e'lon qilish
```

Yaratishda avtomatik hisoblanadi: **masofa, yo'l vaqti, marshrut chizig'i,
olish va yetkazish viloyatlari, tumanlar, narx tavsiyasi.**

### Narx tavsiyasi

| Manba | Qachon |
|---|---|
| `market` | Shu yo'nalishda **5+ real bitim** bo'lsa — median narx |
| `tariff` | Aks holda — boshlang'ich tarif jadvali (so'm/km, og'irlik bo'yicha) |

> ⚠️ Tarif jadvalidagi raqamlar — **vaqtinchalik**. Ular narxni belgilamaydi,
> faqat tavsiya qiladi. Real bitimlar to'plangach `route_price_stats` medianasi
> ularni almashtiradi.

### Haydovchi lentasi

```
GET /loads/feed?fromRegionId=1&toRegionId=3&minWeightKg=1000&maxWeightKg=20000
  &vehicleTypeIds=4,5&maxDistanceKm=50&lat=41.31&lng=69.28&sort=distance_asc
```

- **Faqat faol e'lonlar**, muddati o'tmaganlari, o'z yuklaridan tashqari.
- `lat`/`lng` berilsa har bir yukda `distanceToPickupKm` qaytadi.
- **Bo'sh massiv = "har qanday transport bo'ladi"** — bunday e'lon barcha
  filtrlardan o'tadi (`cardinality(...) = 0 OR ... && ...`).
- TOP e'lonlar tepada, lekin faqat `top_until` muddati ichida.
- Sahifalash — **keyset kursor**, `OFFSET` emas.

### Nega keyset pagination

1. `OFFSET 10000` bazani 10 000 qatorni o'qib tashlashga majbur qiladi.
2. Lenta doim yangilanadi: 2-sahifaga o'tguningizcha yangi yuk qo'shilsa,
   bir e'lonni ikki marta ko'rasiz yoki bittasini umuman ko'rmaysiz.

Kursor `(tartib_qiymati, id)` juftligini kodlaydi va base64url'ga o'raladi —
mijoz uchun noaniq (opaque), shuning uchun ichki tuzilishni keyin
o'zgartirsak mijoz buzilmaydi.

### Kontakt maskalash

Yuk tafsilotlarida telefon raqamlari **maskalangan** qaytadi
(`+998 90 *** ** 67`). To'liq raqam faqat buyurtma tasdiqlangandan keyin
ochiladi — bu platformani chetlab o'tishning oldini oladigan asosiy chora.

E'lon egasi o'z yukini to'liq ko'radi.

## 14.7. Yangi endpointlar

| Metod | Yo'l | Rol |
|---|---|---|
| POST | `/media/presign` | har kim |
| POST | `/media/download-url` | har kim (faqat o'z fayli) |
| POST/GET/DELETE | `/documents`, `/documents/:id` | har kim |
| GET | `/documents/readiness` | haydovchi |
| POST/GET/PATCH/DELETE | `/vehicles`, `/vehicles/:id` | haydovchi |
| POST | `/vehicles/:id/primary` | haydovchi |
| GET | `/me/driver/readiness` | haydovchi |
| POST | `/me/driver/submit-verification` | haydovchi |
| PATCH | `/me/driver/availability` | haydovchi |
| POST | `/me/driver/location` | haydovchi |
| GET/POST/DELETE | `/me/driver/routes` | haydovchi |
| GET/POST/DELETE | `/me/addresses` | har kim |
| GET | `/geo/search`, `/geo/reverse`, `/geo/route` | har kim |
| GET | `/loads/estimate` | har kim |
| POST | `/loads` | yuk beruvchi |
| GET | `/loads/mine` | yuk beruvchi |
| GET | `/loads/feed` | haydovchi |
| GET/PATCH | `/loads/:id` | har kim / egasi |
| POST | `/loads/:id/publish`, `/cancel` | yuk beruvchi |

## 14.8. Testlar

Yangi unit testlar (infratuzilma talab qilmaydi):

| Fayl | Nimani tekshiradi |
|---|---|
| `geo.util.spec.ts` | Haversine (Toshkent–Samarqand ~266 km, Toshkent–Nukus ~807 km), yo'l koeffitsienti, ETA, chegara tekshiruvi |
| `plate.util.spec.ts` | Davlat raqami normallashtirish, kirill→lotin, noto'g'ri formatlar |
| `cursor.util.spec.ts` | Kursor kodlash, `hasMore` mantiq, buzilgan kursor |
| `pricing.service.spec.ts` | Tarif tanlash, minimal narx, yaxlitlash, bozor medianasi ustunligi, 5 tadan kam bitimda tarifga qaytish |

```bash
npm test
```

## 14.9. Keyingi bosqich (4-bosqich)

1. **Matching worker** — hard filter + Match Score, Redis GEO, top-20 ga push.
2. **Takliflar (offers)** — yuborish, qabul qilish, TTL, counter-offer.
3. **Buyurtma** — 13 bosqichli state machine, `order_status_history`.
4. **WebSocket** — live tracking, chat, real-time status.
5. **Push (FCM)** — bildirishnomalar.
