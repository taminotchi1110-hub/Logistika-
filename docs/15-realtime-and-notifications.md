# 15. Real vaqt qatlami: chat, bildirishnoma va push

> 4-bosqich. Oldingi bosqichlar bilan bog'liqlik: [14-loads-and-fleet.md](14-loads-and-fleet.md)
> (yuk, taklif, buyurtma) va [04-architecture.md](04-architecture.md) (kontakt ko'rinishi matritsasi).

Bu hujjat uchta mahsulot talabini qanday bajarilganini tushuntiradi:

1. **Buyurtma platformada qabul qilinishi bilan chat ochiladi** — undan oldin
   tomonlar bir-biri bilan bog'lana olmaydi.
2. **Haydovchi yuk beruvchining telefon raqamini faqat olish nuqtasiga
   yetib borganda ko'radi** (`ARRIVED_AT_PICKUP`).
3. **Yuborilgan xabar ikkala tomonga ham ekran yuqorisidan sirg'alib
   chiquvchi bildirishnoma sifatida ko'rinadi.**

---

## 15.1. Umumiy oqim

```
Haydovchi                      Server                      Yuk beruvchi
    │                             │                             │
    │  chat:message (WS)          │                             │
    ├────────────────────────────►│                             │
    │                             │ 1. huquq tekshiruvi         │
    │                             │ 2. messages ga yozish       │
    │                             │ 3. conv:<id> xonasiga       │
    │                             ├────────────────────────────►│  chat:message
    │  ack {ok, clientMsgId}      │                             │  (chat ekrani)
    │◄────────────────────────────┤                             │
    │                             │ 4. notify()                 │
    │                             │    ├─ onlayn? ──────────────►│  notification
    │                             │    │                        │  (banner)
    │                             │    └─ oflayn? ── push:queue │
    │                             │                    │        │
    │                             │              PushService    │
    │                             │                    ├───────►│  FCM heads-up
```

**Nega ikkita alohida hodisa (`chat:message` va `notification`):**
`chat:message` — chat ekranining o'zi uchun (xabarni ro'yxatga qo'shadi).
`notification` — ilovaning istalgan ekranida ko'rinadigan banner. Foydalanuvchi
yuk qidirayotgan bo'lsa ham xabarni ko'rishi kerak. Agar aynan shu suhbat
ekrani ochiq bo'lsa, mijoz bannerni ko'rsatmaydi — aks holda foydalanuvchi
bir xabarni ikki joyda ko'radi.

---

## 15.2. WebSocket gateway

**Manzil:** `ws://host/ws` (Socket.IO). Token `handshake.auth.token` da —
URL query'da EMAS, chunki query proxy va nginx loglariga tushadi.

### Ulanish

```js
const socket = io('https://api.karvon.uz', {
  path: '/ws',
  auth: { token: accessToken },
  transports: ['websocket', 'polling'],  // polling — mobil tarmoq zaxirasi
});
socket.on('connected', ({ userId }) => { /* tayyor */ });
socket.on('error', ({ code }) => { /* AUTH_TOKEN_INVALID → refresh */ });
```

Ulanishda: token tekshiriladi → sessiya faolligi tekshiriladi (chiqib
ketilgan sessiya WS'da ham ishlamaydi) → foydalanuvchi `user:<id>` xonasiga
qo'shiladi → Redis'ga `presence` yoziladi.

### Hodisalar

| Hodisa | Yo'nalish | Vazifa |
|---|---|---|
| `connected` | server → mijoz | ulanish tasdiqlandi |
| `chat:join` | mijoz → server | suhbatga kirish, `{ok, canWrite}` qaytadi |
| `chat:leave` | mijoz → server | suhbatdan chiqish |
| `chat:message` | ikki tomonlama | xabar yuborish va qabul qilish |
| `chat:read` | ikki tomonlama | "o'qildi" belgisi |
| `chat:typing` | ikki tomonlama | "yozmoqda…" (bazaga yozilmaydi) |
| `order:subscribe` | mijoz → server | buyurtma yangilanishlariga obuna |
| `notification` | server → mijoz | **ekran yuqorisidagi banner** |

### Nega Redis adapter

API bir nechta replikada ishlaydi. Yuk beruvchi 1-replikaga, haydovchi
2-replikaga ulangan bo'lishi mumkin. `@socket.io/redis-adapter` xonalarni
replikalar o'rtasida umumlashtiradi — busiz xabar faqat bitta serverdagi
mijozlarga yetardi.

Bildirishnomalar ham shu tamoyilda: `NotificationsService` Redis'ga
`notify:user:<id>` kanaliga chop etadi, gateway `psubscribe('notify:user:*')`
orqali ushlab, tegishli xonaga uzatadi. Shuning uchun bildirishnoma
yaratgan kod WebSocket haqida umuman bilmaydi.

### `isMine` xatosi va undan olingan saboq

Xabar butun xonaga BITTA payload bilan tarqatiladi. Shuning uchun unda
ko'ruvchiga bog'liq maydon bo'lishi mumkin emas. Dastlabki versiyada
yuboruvchi uchun hisoblangan `isMine: true` qabul qiluvchiga ham yetib
borgan va xabar chatning noto'g'ri tomonida chizilgan. Hozir broadcast
`toWireMessage()` orqali `isMine` siz ketadi — mijoz uni `senderId` ni
o'z ID'si bilan solishtirib hisoblaydi. Yuboruvchining `ack` javobida
`isMine` qoladi (optimistik UI uchun).

---

## 15.3. Chat qoidalari

### Qachon ochiladi

Chat `OrdersService.acceptOffer()` ichida, buyurtma yaratilgan bitta
tranzaksiyada ochiladi. Ya'ni chat mavjudligining o'zi "buyurtma tuzilgan"
degani. Taklif bosqichida chat yo'q — bu spamning oldini oladi.

### Qachon yopiladi

`canWrite` buyurtma holatidan kelib chiqadi
(`contactVisibility(status).chatEnabled`):

| Buyurtma holati | Yozish | O'qish |
|---|---|---|
| `ASSIGNED` … `DELIVERED` | ✅ | ✅ |
| `COMPLETED` | ✅ | ✅ |
| `CLOSED` | ❌ | ✅ |
| `CANCELLED_BY_*` | ❌ | ✅ |

Bekor qilingan buyurtmada ham tarix o'qiladi — nizo ko'rilganda dalil
sifatida kerak. Yozishga urinish `CHAT_CLOSED` kodi bilan 409 qaytaradi.

### REST zaxira yo'li

Ba'zi korporativ tarmoqlar va eski Android'lar WebSocket'ni bloklaydi.
Shuning uchun bir xil amallar REST orqali ham bor:

| Endpoint | Vazifa |
|---|---|
| `GET /conversations` | suhbatlar, oxirgi xabar va o'qilmaganlar soni bilan |
| `GET /conversations/:id/messages` | kursorli sahifalash |
| `POST /conversations/:id/messages` | xabar yuborish |
| `POST /conversations/:id/read` | o'qilgan deb belgilash |

Ikkala yo'l ham bir xil `ChatService` ni chaqiradi — bildirishnoma,
huquq tekshiruvi va dedupe bitta joyda.

---

## 15.4. Bildirishnoma: qaysi kanal tanlanadi

```
notify()
  ├─ 1. dedupe (Redis, 10 daqiqa)
  ├─ 2. foydalanuvchi onlaynmi? (Redis presence)
  ├─ 3. notifications jadvaliga yozish
  │       channel = onlayn ? IN_APP : PUSH
  ├─ 4. Redis'ga publish → WebSocket → banner
  └─ 5. oflayn bo'lsa → push:queue → FCM
```

**Ikkalasi ham yuborilmaydi.** Ilova ochiq turgan foydalanuvchi bitta
xabarni ikki marta (banner + tizim bildirishnomasi) ko'rmasligi kerak.

`channel` ustuni haqiqiy yetkazish yo'lini saqlaydi — bu hisobot uchun
kerak: qancha bildirishnoma FCM orqali ketdi (xarajat) va qanchasi ilova
ochiqligida bannerda ko'rindi.

### Nega dedupe Redis'da

`notifications.dedupe_key` indeksi PARTIAL (`WHERE dedupe_key IS NOT NULL`),
shuning uchun `ON CONFLICT (dedupe_key)` ishlamaydi — PostgreSQL indeksni
aniqlash uchun aynan shu predikatni talab qiladi. Redis'da tekshirish
arzonroq (muvaffaqiyatsiz INSERT umuman bo'lmaydi) va aniqroq: takroriy
bildirishnoma push ham yubormaydi.

---

## 15.5. Push: ekran yuqorisidan sirg'alib chiqishi

Bu talabning eng nozik texnik qismi. Server tomonidan yuborilgan
`priority: high` **yolg'iz o'zi yetarli emas**.

### Android

Bildirishnoma "heads-up" bo'lib sirg'alib chiqishi uchun uchta shart:

| Shart | Qayerda | Izoh |
|---|---|---|
| Kanal `IMPORTANCE_HIGH` | **mobil ilovada** | kanal bir marta yaratiladi, keyin O'ZGARTIRIB BO'LMAYDI |
| `channel_id` mos kelishi | serverdan | `karvon_messages` yoki `karvon_orders` |
| `priority: high` | serverdan | uxlash rejimidan uyg'otish uchun |

Ilova birinchi ishga tushganda kanallarni shunday yaratadi:

```kotlin
NotificationChannel("karvon_messages", "Xabarlar", NotificationManager.IMPORTANCE_HIGH)
NotificationChannel("karvon_orders",   "Buyurtmalar", NotificationManager.IMPORTANCE_HIGH)
```

Kanal `IMPORTANCE_DEFAULT` bilan yaratilsa, bildirishnoma jimgina
"pardaga" tushadi va foydalanuvchi uni ko'rmaydi. Bu xatoni keyin
tuzatib bo'lmaydi — faqat ilovani qayta o'rnatish yordam beradi.

### iOS

```json
"apns": {
  "headers": { "apns-priority": "10", "apns-push-type": "alert" },
  "payload": { "aps": { "interruption-level": "time-sensitive" } }
}
```

`time-sensitive` — Focus/"Bezovta qilmang" rejimi yoqilgan bo'lsa ham
buyurtma va chat bildirishnomasi o'tadi. Bu logistikada muhim:
haydovchi yo'lda telefonni jim rejimga qo'yadi.

### Navbat

Push FCM'ga to'g'ridan-to'g'ri emas, Redis navbati orqali yuboriladi:

- FCM chaqiruvi — tashqi HTTP, 200–500 ms. Buyurtma statusini o'zgartirgan
  foydalanuvchi buni kutib turmasligi kerak.
- FCM vaqtincha ishlamasa xabarlar yo'qolmaydi.

`PushService` navbatni bo'sh bo'lguncha ketma-ket o'qiydi, bo'shasa
1 soniyalik taymer bilan qaraydi. Yaroqsiz tokenlar (`token-not-registered`)
avtomatik o'chiriladi — aks holda ular abadiy qolib, har safar xato beradi.

### Dev rejimi

FCM kalitlari bo'lmasa (`FCM_PROJECT_ID` va h.k.) servis ishga tushadi,
lekin push o'rniga logga yozadi. SMS'dagi kabi: lokal ishlash uchun
tashqi xizmat shart emas.

---

## 15.6. Qurilmani ro'yxatdan o'tkazish

```http
PUT /me/devices
{ "fcmToken": "...", "deviceId": "a1b2c3d4", "platform": "android" }
```

Ilova **har ochilganda** chaqiradi — FCM tokeni istalgan vaqtda
o'zgarishi mumkin. `deviceId` bo'yicha yangilanadi, shuning uchun bitta
qurilma bitta yozuv bo'lib qoladi.

---

## 15.7. Xato kodlari

Mobil ilova xabarni aynan **kod** bo'yicha o'z tilida ko'rsatadi,
serverdagi `message` — faqat zaxira. Shuning uchun har bir domen holati
o'z kodiga ega bo'lishi shart: `VALIDATION_FAILED` bilan "yuk band" va
"yuklash vaqti o'tgan" ni ajratib bo'lmaydi.

Bu bosqichda qo'shilgan kodlar:

| Guruh | Kodlar |
|---|---|
| Chat | `CHAT_CLOSED`, `CHAT_MESSAGE_EMPTY`, `CHAT_ATTACHMENT_MISSING` |
| Buyurtma | `ORDER_INVALID_TRANSITION`, `ORDER_ACTOR_NOT_ALLOWED`, `ORDER_CONTACTS_ALREADY_VISIBLE` |
| Taklif | `OFFER_OWN_LOAD`, `OFFER_DUPLICATE`, `OFFER_ALREADY_HANDLED`, `OFFER_EXPIRED`, `OFFER_PRICE_REQUIRED`, `OFFER_PRICE_OUT_OF_RANGE` |
| Yuk | `LOAD_NOT_ACCEPTING_OFFERS`, `LOAD_ALREADY_ASSIGNED`, `LOAD_ALREADY_CLOSED`, `LOAD_HAS_ORDER`, `LOAD_PICKUP_TIME_PASSED`, `LOAD_TIME_WINDOW_INVALID`, `LOAD_PRICE_REQUIRED`, `LOAD_NOT_PUBLISHABLE`, `LOAD_NOT_EDITABLE`, `LOAD_ACTIVE_LIMIT_REACHED` |
| Transport | `VEHICLE_NOT_VERIFIED`, `VEHICLE_CAPACITY_EXCEEDED`, `VEHICLE_PLATE_TAKEN`, `VEHICLE_PLATE_INVALID`, `VEHICLE_LOCKED_AFTER_VERIFY`, `VEHICLE_LIMIT_REACHED` |
| Fayl | `FILE_KEY_NOT_OWNED`, `FILE_NOT_UPLOADED`, `FILE_DELETE_FORBIDDEN` |
| Ma'lumotnoma | `REFERENCE_NOT_FOUND` |

**Kod bir marta belgilanadi va o'zgarmaydi** — mobil ilovaning eski
versiyalari foydalanuvchilarda uzoq vaqt qolib ketadi.

---

## 15.8. Tekshiruv

Barcha testlar haqiqiy HTTP va WebSocket chaqiruvlari qiladi — mock yo'q.

```bash
bash scripts/test-all.sh
```

| To'plam | Nima isbotlaydi |
|---|---|
| `smoke-test.sh` | auth, park, hujjatlar, geo, yuk e'loni, lenta |
| `smoke-test-orders.sh` | taklif → buyurtma → **telefon faqat `ARRIVED_AT_PICKUP` da ochiladi** |
| `ws-test.js` | chat ochilishi, xabarning darhol yetishi, **banner hodisasi**, "o'qildi", "yozmoqda", bekor qilingandan keyin chat yopilishi |
| `push-test.js` | qurilma ro'yxati, **oflayn → PUSH**, **onlayn → IN_APP**, uzilgandan keyin yana PUSH |

Testlar har ishga tushirishda yangi telefon raqami va davlat raqami
ishlatadi — qat'iy qiymatlar bilan ular faqat bo'sh bazada o'tardi.

`scripts/reset-rate-limits.js` OTP hisoblagichlarini tozalaydi (faqat dev):
bitta IP kuniga 50 ta OTP so'rashi mumkin va bu lokal mashinada tez tugaydi.
Limitni o'chirmaymiz — testdan oldin hisoblagichni nolga qaytaramiz.
