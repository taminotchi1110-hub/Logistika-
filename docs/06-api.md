# 06 — API arxitekturasi

**Baza:** `https://api.karvon.uz/v1` · **Format:** JSON · **Auth:** `Authorization: Bearer <access_token>`
**Hujjat:** OpenAPI 3.1, `/docs` (Swagger UI) — NestJS dekoratorlaridan avtomatik generatsiya.

## 6.1. Umumiy konvensiyalar

### Javob formati
```jsonc
// Muvaffaqiyat
{ "data": { ... }, "meta": { "requestId": "01J8..." } }

// Ro'yxat (cursor pagination)
{ "data": [ ... ], "meta": { "nextCursor": "eyJpZCI6...", "hasMore": true } }

// Xato
{
  "error": {
    "code": "ORDER_INVALID_TRANSITION",
    "message": "Buyurtma holatini LOADED dan CONFIRMED ga o'zgartirib bo'lmaydi",
    "details": { "from": "LOADED", "to": "CONFIRMED" },
    "requestId": "01J8..."
  }
}
```

- **Xato kodlari** `SCREAMING_SNAKE_CASE`, mobil ilova ular bo'yicha lokalizatsiya qiladi
  (server xabari — fallback).
- **Pagination:** har doim **cursor-based** (`?cursor=&limit=20`). `OFFSET` katta
  jadvalda sekin va yangi yozuv qo'shilganda sahifalar siljiydi.
- **Idempotency:** `POST` so'rovlarida `Idempotency-Key` sarlavhasi — to'lov va
  buyurtma yaratishda **majburiy**.
- **Til:** `Accept-Language: uz | ru | en`.
- **Versiya:** URL'da `/v1`. Breaking change → `/v2`, eski versiya 6 oy qo'llab-quvvatlanadi.
- **Rate limit:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` sarlavhalari.
- **Vaqt:** barcha `timestamp` ISO-8601 UTC (`2026-09-05T09:30:00Z`).
- **Pul:** `priceTiyin: 200000000` (integer) + `priceFormatted: "2 000 000 so'm"`.

### HTTP statuslar
`200` OK · `201` Created · `204` No Content · `400` validatsiya ·
`401` token yo'q/eskirgan · `403` huquq yo'q · `404` topilmadi ·
`409` konflikt (status o'tishi, takroriy) · `422` biznes qoidasi ·
`429` limit · `500` server.

---

## 6.2. Auth (`/auth`)

| Metod | Yo'l | Tavsif | Auth |
|---|---|---|---|
| POST | `/auth/otp/request` | SMS kod yuborish `{phone}` | — |
| POST | `/auth/otp/verify` | Kodni tekshirish → tokenlar | — |
| POST | `/auth/refresh` | Refresh token rotation | — |
| POST | `/auth/logout` | Joriy sessiyani yopish | ✅ |
| POST | `/auth/logout-all` | Barcha qurilmalardan chiqish | ✅ |
| GET | `/auth/sessions` | Faol sessiyalar ro'yxati | ✅ |
| DELETE | `/auth/sessions/:id` | Sessiyani bekor qilish | ✅ |

```http
POST /v1/auth/otp/verify
{ "phone": "+998901234567", "code": "482913",
  "device": { "deviceId": "a1b2", "platform": "android", "appVersion": "1.0.0" } }

201 → { "data": {
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "rt_9f3c...",
  "expiresIn": 900,
  "user": { "id": "...", "role": "SHIPPER", "status": "PENDING_PROFILE" },
  "isNewUser": true } }
```

## 6.3. Profil (`/me`, `/users`)

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/me` | Joriy foydalanuvchi (profil + rol + statistika) |
| PATCH | `/me` | Profilni yangilash |
| POST | `/me/role` | Rolni almashtirish/qo'shish (`SHIPPER`↔`DRIVER`) |
| POST | `/me/avatar` | Avatar (presigned upload'dan keyin key yuboriladi) |
| GET | `/me/stats` | Buyurtmalar, daromad, reyting statistikasi |
| GET | `/me/driver` | Haydovchi profili (verifikatsiya holati bilan) |
| PATCH | `/me/driver` | Haydovchi profilini yangilash |
| PATCH | `/me/driver/availability` | `AVAILABLE` / `BUSY` / `OFFLINE` |
| GET/POST/PATCH/DELETE | `/me/routes` | Ishlash yo'nalishlari |
| GET/POST/PATCH/DELETE | `/me/addresses` | Saqlangan manzillar |
| GET | `/users/:id` | Ommaviy profil (telefon maskalangan) |
| GET | `/users/:id/reviews` | Foydalanuvchi haqidagi baholar |

## 6.4. Transport (`/vehicles`)

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/vehicles` | O'z transportlarim |
| POST | `/vehicles` | Yangi transport qo'shish |
| GET | `/vehicles/:id` | Batafsil |
| PATCH | `/vehicles/:id` | Tahrirlash |
| DELETE | `/vehicles/:id` | O'chirish (soft) |
| POST | `/vehicles/:id/primary` | Asosiy qilib belgilash |

## 6.5. Yuk (`/loads`)

| Metod | Yo'l | Tavsif |
|---|---|---|
| POST | `/loads` | Yuk yaratish (DRAFT yoki darhol PUBLISHED) |
| GET | `/loads` | **Haydovchi lentasi** — filter + sort |
| GET | `/loads/mine` | Klientning o'z yuklari (`?status=active\|draft\|completed\|cancelled`) |
| GET | `/loads/:id` | Batafsil (ko'rishlar soni +1) |
| PATCH | `/loads/:id` | Tahrirlash (faqat `DRAFT`/`PUBLISHED`) |
| POST | `/loads/:id/publish` | E'lon qilish → matching ishga tushadi |
| POST | `/loads/:id/cancel` | Bekor qilish `{reason}` |
| DELETE | `/loads/:id` | Qoralamani o'chirish |
| GET | `/loads/:id/matches` | Tizim topgan haydovchilar (score bilan) |
| GET | `/loads/:id/offers` | Kelgan takliflar |
| POST | `/loads/estimate` | Masofa, vaqt, tavsiya narx (yaratishdan oldin) |
| POST | `/loads/:id/boost` | TOP e'lon qilish (pullik) |

**Lenta filtri:**
```
GET /v1/loads/feed?fromRegionId=1&toRegionId=8&dateFrom=2026-09-06&dateTo=2026-09-08
   &minWeightKg=1000&maxWeightKg=20000&vehicleTypeIds=5,6&bodyTypeIds=1
   &minPriceTiyin=100000000&maxDistanceKm=50&sort=match_score&cursor=&limit=20
```
`sort`: `match_score` (default) · `created_at` · `price_desc` · `price_asc` · `distance_asc` · `pickup_date`

Har bir yuk `matchScore` maydonini qaytaradi — matching shu haydovchi uchun
hisoblagan moslik foizi (`0..100`) yoki `null` (hali hisoblanmagan). Mijoz
`null` bo'lganda foizni ko'rsatmasligi kerak.

`match_score` saralashi faqat lentada ishlaydi. Mijozning o'z yuklari
(`/loads/mine`) uchun moslik tushunchasi yo'q — u yerda `created_at` ga
qaytadi.

**"Yuklarim" bandlari.** `status` aniq holat emas, **guruh** qabul qiladi:

| Band | Nimani o'z ichiga oladi |
|---|---|
| `active` | `PUBLISHED`, `MATCHING`, `OFFERS_RECEIVED`, `ASSIGNED` — buyurtmasi hali yakunlanmagan va bekor qilinmagan |
| `draft` | `DRAFT` |
| `completed` | buyurtmasi `COMPLETED` yoki `CLOSED` |
| `cancelled` | `CANCELLED`, `EXPIRED` yoki buyurtmasi bekor qilingan |

E'lonning o'z holati **`ASSIGNED` da to'xtaydi** — undan keyingi hayotni
buyurtma boshqaradi. Shuning uchun `completed` bandi e'lon statusidan emas,
buyurtma statusidan aniqlanadi: natijani e'longa ham ko'chirib yozish ikkinchi
haqiqat manbaini yaratardi.

**Sahifalash (kursor).** Kursor **noaniq** (base64url) va u qaysi saralash
bilan olingan bo'lsa, o'sha saralash bilan qaytarilishi kerak. Kursor ichida
TOP bayrog'i ham saqlanadi: TOP e'lonlar hamma narsadan yuqorida turgani
uchun, keyset uni hisobga olmasa, eski sanali TOP e'lon 2-sahifada takrorlanadi.

## 6.6. Takliflar (`/offers`)

| Metod | Yo'l | Tavsif |
|---|---|---|
| POST | `/loads/:id/offers` | Haydovchi taklif yuboradi `{vehicleId, offeredPriceTiyin, message}` |
| GET | `/offers/mine` | Haydovchining o'z takliflari |
| POST | `/offers/:id/accept` | Klient qabul qiladi → **buyurtma yaratiladi** |
| POST | `/offers/:id/reject` | Klient rad etadi |
| POST | `/offers/:id/withdraw` | Haydovchi qaytarib oladi |
| POST | `/loads/:id/invite` | Klient haydovchini taklif qiladi `{driverId, priceTiyin}` |

## 6.7. Buyurtmalar (`/orders`)

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/orders` | Ro'yxat (`?active=true` — faol, `?active=false` — tarix) |
| GET | `/orders/:id` | Batafsil (yuk, haydovchi, marshrut, moliya) |
| POST | `/orders/:id/confirm` | Haydovchi yakuniy tasdiqlaydi |
| POST | `/orders/:id/status` | Status o'zgartirish `{status, lat, lng, note}` |
| POST | `/orders/:id/pickup-proof` | POP: `{photoKeys[], note}` |
| POST | `/orders/:id/delivery-proof` | POD: `{photoKeys[], signatureKey, receiverName}` |
| POST | `/orders/:id/complete` | Klient yakunlaydi |
| POST | `/orders/:id/cancel` | Bekor qilish `{reason}` |
| POST | `/orders/:id/dispute` | Nizo ochish `{category, description, attachments}` |
| GET | `/orders/:id/track` | Joriy joylashuv + ETA + qolgan masofa |
| GET | `/orders/:id/route` | To'liq marshrut (polyline) |
| GET | `/orders/:id/history` | Status tarixi |
| GET | `/orders/:id/documents` | Buyurtma hujjatlari |
| GET | `/orders/:id/contract` | Shartnoma PDF (generatsiya) |
| GET | `/track/:token` | **Ochiq tracking** (auth talab qilmaydi) |

```http
POST /v1/orders/{id}/status
{ "status": "LOADED", "lat": 41.3111, "lng": 69.2797,
  "note": "5 palet ortildi", "photoKeys": ["loads/2026/09/a1b2.jpg"] }

200 → { "data": { "status": "LOADED", "nextAllowed": ["IN_TRANSIT"],
                  "etaAt": "2026-09-05T14:20:00Z" } }
409 → { "error": { "code": "ORDER_INVALID_TRANSITION", ... } }
```

**`nextAllowed` — faqat SHU foydalanuvchi bajara oladigan qadamlar.**
Ro'yxat ikki bosqichda filtrlanadi: avval holat bo'yicha (`ALLOWED_TRANSITIONS`),
so'ng rol bo'yicha (`canActorTransition`). Mobil ilova tugmalarni aynan shu
ro'yxatdan chizadi — filtrsiz bo'lsa haydovchiga `COMPLETED` (faqat mijoz)
yoki mijozga `CLOSED` (faqat tizim) tugmasi ko'rinib, bosilganda 409 qaytarardi.

**`?active` bandi.** `true` — hali yakunlanmagan buyurtmalar: `ASSIGNED`,
`CONFIRMED`, `EN_ROUTE_TO_PICKUP`, `ARRIVED_AT_PICKUP`, `LOADED`, `IN_TRANSIT`,
`ARRIVED_AT_DELIVERY`, `DELIVERED`, `DISPUTED`. `false` — qolganlari.

E'tibor talab qiladigan ikki holat — `ASSIGNED` (haydovchi tasdiqlashi kerak)
va `DELIVERED` (mijoz qabul qilishi kerak) — **faol** bandida turadi. Ular
matching ishlatadigan `ACTIVE_STATUSES` ("haydovchi band") to'plamiga
kirmaydi: bu ikki to'plam har xil savolga javob beradi va ularni chalkashtirish
foydalanuvchini o'zidan kutilayotgan ishdan mahrum qiladi.

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/orders/:id/history` | Holatlar tarixi: o'tish, kim, qachon, izoh, koordinata |

```http
GET /v1/orders/{id}/history

200 → { "data": [
  { "fromStatus": null, "status": "ASSIGNED", "statusLabel": "Haydovchi tanlandi",
    "actorRole": "SHIPPER", "actorName": "Anvar Karimov",
    "note": "Taklif qabul qilindi", "lat": null, "lng": null,
    "at": "2026-09-08T10:00:00Z" },
  { "fromStatus": "ASSIGNED", "status": "CONFIRMED", "statusLabel": "Buyurtma tasdiqlandi",
    "actorRole": "DRIVER", "lat": 41.31, "lng": 69.28, "at": "2026-09-08T10:05:00Z" }
] }
```

Koordinata — nizoda asosiy dalil: "statusni qayerda turib bosgan".

## 6.8. Tracking (`/tracking`)

| Metod | Yo'l | Tavsif |
|---|---|---|
| POST | `/tracking/location` | Batch GPS nuqtalar (offline sync uchun) |
| GET | `/tracking/drivers/nearby` | Yaqin haydovchilar (admin/klient xaritasi) |

Asosiy oqim **WebSocket** orqali (quyida), REST faqat fallback va batch sync uchun.

## 6.9. Chat (`/conversations`)

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/conversations` | Suhbatlar ro'yxati (oxirgi xabar bilan) |
| GET | `/conversations/:id/messages` | Xabarlar (cursor) |
| POST | `/conversations/:id/messages` | Xabar yuborish (REST fallback) |
| POST | `/conversations/:id/read` | O'qildi deb belgilash |

## 6.10. Media (`/media`)

| Metod | Yo'l | Tavsif |
|---|---|---|
| POST | `/media/presign` | Yuklash uchun presigned URL `{contentType, size, purpose}` |
| POST | `/media/confirm` | Yuklanganini tasdiqlash → `documentId` |
| GET | `/media/:key/url` | O'qish uchun presigned URL (5 daqiqa) |

**Nega presigned URL?** Fayl API serveri orqali o'tmaydi → server RAM/CPU yuki yo'q,
20 MB rasm yuklash API'ni bloklamaydi, S3 to'g'ridan-to'g'ri qabul qiladi.

## 6.11. To'lov (`/payments`)

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/wallet` | Balans + limit |
| GET | `/wallet/transactions` | Tranzaksiya tarixi (cursor) |
| POST | `/payments/topup` | Hamyonni to'ldirish `{amountTiyin, provider}` → to'lov URL |
| POST | `/payments/order` | Buyurtmani to'lash (escrow, V2) |
| GET | `/payments/:id` | To'lov holati |
| POST | `/payouts` | Pul yechish so'rovi (V2) |
| GET | `/tariffs` | Tarif rejalari |
| POST | `/subscriptions` | Obuna sotib olish |

**Webhooklar (PSP → biz):** `POST /webhooks/payme`, `POST /webhooks/click`
— imzo/`Basic-Auth` tekshiriladi, idempotent, javob JSON-RPC formatida.

## 6.12. Reyting va shikoyat

| Metod | Yo'l | Tavsif |
|---|---|---|
| POST | `/orders/:id/rating` | Baho berish |
| GET | `/ratings/pending` | Baholanmagan buyurtmalar |
| POST | `/complaints` | Shikoyat yuborish |
| GET | `/complaints/mine` | O'z shikoyatlarim |
| GET/POST/DELETE | `/favorites` | Sevimlilar |
| GET/POST/DELETE | `/blacklist` | Qora ro'yxat |

## 6.13. Bildirishnoma va spravochnik

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/notifications` | Ro'yxat (cursor) |
| POST | `/notifications/read-all` | Hammasini o'qilgan qilish |
| PUT | `/me/devices` | FCM token ro'yxatdan o'tkazish |
| GET | `/notifications/settings` / PATCH | Sozlamalar |
| GET | `/reference/regions` | Viloyatlar (+ tumanlar) |
| GET | `/reference/vehicle-types` | Transport turlari |
| GET | `/reference/body-types` | Kuzov turlari |
| GET | `/reference/cargo-categories` | Yuk kategoriyalari |
| GET | `/reference/all?version=` | Hammasi bir so'rovda (ETag bilan cache) |
| GET | `/geo/search?q=` | Manzil qidirish (geocoding proxy) |
| GET | `/geo/reverse?lat=&lng=` | Koordinatadan manzil |
| GET | `/geo/route?from=&to=` | Marshrut + masofa + vaqt (OSRM proxy) |

## 6.14. Admin API (`/admin`)

Alohida prefiks, alohida guard (`AdminJwtGuard` + `PermissionsGuard`),
har bir mutatsiya `audit_logs` ga yoziladi.

| Guruh | Endpointlar |
|---|---|
| Dashboard | `GET /admin/dashboard`, `/admin/analytics/orders`, `/admin/analytics/revenue`, `/admin/analytics/routes` |
| Foydalanuvchi | `GET/PATCH /admin/users`, `POST /admin/users/:id/ban`, `/unban`, `/impersonate` |
| Verifikatsiya | `GET /admin/documents/pending`, `POST /admin/documents/:id/verify`, `/reject` |
| Yuk/Buyurtma | `GET /admin/loads`, `/admin/orders`, `POST /admin/orders/:id/assign`, `/cancel`, `/force-status` |
| Moliya | `GET /admin/payments`, `/admin/ledger`, `POST /admin/payments/:id/refund`, `/admin/wallet/:userId/adjust` |
| Shikoyat | `GET /admin/complaints`, `POST /admin/complaints/:id/resolve` |
| Sozlama | `GET/PUT /admin/settings`, `PUT /admin/settings/matching-weights` |
| Tarif | `GET/POST/PATCH /admin/tariffs` |
| Xodim | `GET/POST/PATCH /admin/staff`, `GET /admin/audit-logs` |
| Kampaniya | `POST /admin/campaigns/push` |

---

## 6.15. WebSocket API

**Ulanish:** `wss://api.karvon.uz/ws?token=<accessToken>` (Socket.IO)

### Namespace'lar
| Namespace | Maqsad |
|---|---|
| `/tracking` | GPS yuborish va olish |
| `/chat` | Xabarlar |
| `/events` | Buyurtma statusi, takliflar, bildirishnomalar |

### Client → Server
| Event | Payload | Kim |
|---|---|---|
| `location:update` | `{lat,lng,speed,heading,accuracy,ts,orderId?}` | Haydovchi |
| `order:subscribe` | `{orderId}` | Ikkalasi |
| `order:unsubscribe` | `{orderId}` | Ikkalasi |
| `chat:join` | `{conversationId}` | Ikkalasi |
| `chat:message` | `{conversationId,type,body?,attachmentKey?,clientMsgId}` | Ikkalasi |
| `chat:typing` | `{conversationId,isTyping}` | Ikkalasi |
| `chat:read` | `{conversationId,lastMessageId}` | Ikkalasi |

### Server → Client
| Event | Payload |
|---|---|
| `driver:location` | `{orderId,lat,lng,heading,speed,etaAt,remainingKm}` |
| `order:status` | `{orderId,status,changedAt,actor}` |
| `offer:new` | `{loadId,offerId,driver:{name,rating},priceTiyin}` |
| `offer:accepted` / `offer:rejected` | `{offerId,orderId?}` |
| `chat:message` | `{id,conversationId,senderId,type,body,createdAt}` |
| `chat:delivered` / `chat:read` | `{conversationId,messageIds[]}` |
| `notification:new` | `{id,title,body,deepLink}` |
| `error` | `{code,message}` |

### WS qoidalari
- **Auth:** `handshake.auth.token` — noto'g'ri bo'lsa ulanish darhol uziladi.
- **Room modeli:** `user:{userId}` (shaxsiy), `order:{orderId}` (buyurtma ishtirokchilari).
  Rooms Redis adapter orqali barcha replikalarda ishlaydi.
- **Throttle:** `location:update` — 1/5 s dan tez bo'lsa tashlab yuboriladi;
  `chat:message` — 10/10 s.
- **Idempotentlik:** `clientMsgId` — tarmoq uzilib qayta yuborilsa dublikat bo'lmaydi.
- **Reconnect:** eksponensial backoff (1s → 30s), qayta ulanganda
  `order:subscribe` avtomatik takrorlanadi, o'tkazib yuborilgan xabarlar
  REST `GET /conversations/:id/messages?after=` bilan tortiladi.
- **Fallback:** WS ishlamasa (korporativ tarmoq) — REST polling 15 s.

## 6.16. Testlash strategiyasi

| Daraja | Vosita | Qamrov maqsadi |
|---|---|---|
| Unit | Jest | Domen logikasi (score, state machine, ledger) — **≥ 85%** |
| Integration | Jest + Testcontainers (PG+Redis) | Repository, tranzaksiyalar |
| E2E (API) | Supertest | Har bir endpoint: 200/400/401/403/409 |
| Contract | Pact / OpenAPI validator | Mobil ↔ backend mosligi |
| Load | k6 | 1000 RPS lenta, 5000 parallel WS |
| Mobil | Flutter `test` + `integration_test` | Kritik oqimlar |

**Majburiy test qilinadigan invariantlar:**
1. Ledger yig'indisi har doim 0.
2. Ruxsat etilmagan status o'tishi 409 qaytaradi.
3. Bitta haydovchida ikkinchi faol buyurtma yaratib bo'lmaydi (parallel so'rovda ham).
4. Offer qabul qilinganda qolganlari `REJECTED` bo'ladi (atomik).
5. Telefon raqami `ARRIVED_AT_PICKUP` gacha API javobida maskalangan.
