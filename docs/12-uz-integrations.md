# 12 — O'zbekiston bozoriga moslashtirish

## 12.1. Lokalizatsiya asoslari

| Element | Qiymat |
|---|---|
| Valyuta | **UZS (so'm)**. DB'da `bigint` tiyin. Ko'rsatish: `2 400 000 so'm` (bo'shliq bilan ajratilgan) |
| Telefon | `+998` + 9 raqam. Operator kodlari: 33, 50, 55, 71, 77, 88, 90, 91, 93, 94, 95, 97, 98, 99 |
| Vaqt zonasi | `Asia/Tashkent` (UTC+5), DB'da UTC saqlanadi |
| Sana formati | `05.09.2026` (kun.oy.yil) |
| Tillar | **O'zbek (lotin)** — default, **Rus**, **Ingliz**. Kirill — V2 |
| Hafta boshi | Dushanba |
| Davlat raqami | `01 A 123 BC` formati, regex bilan tekshiriladi (01–95 hudud kodlari) |
| STIR (INN) | 9 raqam, nazorat raqami bilan tekshiriladi |
| PINFL (JShShIR) | 14 raqam |

### Til bo'yicha amaliy eslatmalar
- Haydovchilarning katta qismi **rus tilida** yozadi va qidiradi → manzil
  qidiruvi ikkala tilda ishlashi shart ("Самарканд" = "Samarqand").
- Interfeys matnlari `.arb` (Flutter) va `i18next` (React) fayllarda,
  bitta manba — `packages/i18n`.
- Raqamlar va sanalar `intl` paketi orqali, qo'lda formatlash yo'q.

## 12.2. Transport turlari (seed ma'lumot)

| Kod | Nomi | Quvvat | Hajm | Odatiy foydalanish |
|---|---|---|---|---|
| `DAMAS` | Damas | 0.5 t | 3 m³ | Shahar ichi, kichik yuk |
| `LABO` | Labo | 1 t | 5 m³ | Shahar ichi, qurilish mollari |
| `GAZEL` | Gazel | 1.5 t | 9 m³ | Ko'chish, do'kon yetkazib berish |
| `ISUZU` | Isuzu / MAN TGL | 3–5 t | 20–30 m³ | Shahar va yaqin viloyat |
| `KAMAZ` | KamAZ | 10–20 t | 40–60 m³ | Qurilish, sochma yuk |
| `MAN` | MAN | 15–20 t | 60–86 m³ | Viloyatlararo |
| `VOLVO` | Volvo | 20–25 t | 86–100 m³ | Uzoq masofa, xalqaro |
| `SCANIA` | Scania | 20–25 t | 86–100 m³ | Uzoq masofa, xalqaro |
| `FURA` | Fura (tirkamali) | 20–25 t | 86–120 m³ | Yirik partiya |
| `TIRKAMA` | Tirkama | +20 t | +80 m³ | Qo'shimcha |
| `REF` | Refrijerator | 3–20 t | — | Muzlatilgan/sovutilgan mahsulot |
| `TENT` | Tentli | 3–25 t | — | Universal (eng ko'p ishlatiladigan) |
| `SAMOSVAL` | Samosval | 10–25 t | — | Qum, shag'al, tuproq |
| `EVAKUATOR` | Evakuator | 2–5 t | — | Avtomobil tashish |
| `KONTEYNEROVOZ` | Konteynervoz | 20–30 t | — | 20/40 futli konteyner |

## 12.3. Hududlar (14 ta)

| Kod | Nomi | Markaz | Izoh |
|---|---|---|---|
| `TAS_C` | Toshkent shahri | Toshkent | Eng katta talab manbai (~40%) |
| `TAS` | Toshkent viloyati | Nurafshon | |
| `AND` | Andijon | Andijon | Vodiy koridori |
| `FAR` | Farg'ona | Farg'ona | Vodiy koridori |
| `NAM` | Namangan | Namangan | Vodiy koridori |
| `SAM` | Samarqand | Samarqand | Asosiy tranzit tugun |
| `BUX` | Buxoro | Buxoro | |
| `NAV` | Navoiy | Navoiy | Sanoat, kon |
| `QAS` | Qashqadaryo | Qarshi | Gaz, sanoat |
| `SUR` | Surxondaryo | Termiz | Afg'oniston tranziti |
| `JIZ` | Jizzax | Jizzax | |
| `SIR` | Sirdaryo | Guliston | |
| `XOR` | Xorazm | Urganch | |
| `QOR` | Qoraqalpog'iston R. | Nukus | Eng uzoq yo'nalish |

**Asosiy yuk koridorlari (MVP fokusi):**
1. Toshkent ↔ Samarqand (308 km) — eng zich
2. Toshkent ↔ Farg'ona vodiysi (Kamchiq dovoni orqali, 300–420 km)
3. Samarqand ↔ Buxoro (280 km)
4. Toshkent ↔ Nukus (1200 km) — uzoq masofa

## 12.4. SMS provayder

| Provayder | Izoh |
|---|---|
| **Eskiz.uz** ⭐ | Eng ko'p ishlatiladigan, REST API, token auth, shablon moderatsiyasi talab qilinadi |
| Play Mobile (playmobile.uz) | Ishonchli, korporativ |
| SMS.uz | Muqobil |

**Amaliy jihatlar:**
- Har bir SMS shabloni operator tomonidan **oldindan tasdiqlanishi** kerak —
  bu 1–3 kun oladi, ishlab chiqish rejasida hisobga olinadi.
- Alphanumeric sender name (`KARVON`) alohida ro'yxatdan o'tkaziladi.
- Ikkita provayder integratsiya qilinadi (`SmsProvider` interfeysi ortida) —
  biri ishlamay qolsa avtomatik ikkinchisiga o'tadi (failover).
- Narx ~50–80 so'm/SMS → OTP flood himoyasi **to'g'ridan-to'g'ri pul tejaydi**.

## 12.5. To'lov integratsiyalari

### Payme (Paycom) — Merchant API
JSON-RPC 2.0, `Authorization: Basic base64(Paycom:KEY)`.
Amalga oshiriladigan metodlar:
`CheckPerformTransaction` · `CreateTransaction` · `PerformTransaction` ·
`CancelTransaction` · `CheckTransaction` · `GetStatement`.

⚠️ Payme **istalgan metodni bir necha marta chaqirishi mumkin** —
har bir handler **idempotent** bo'lishi shart (`payments.idempotency_key`,
`provider_txn_id` bo'yicha unique indeks).

### Click — Merchant API
Ikki bosqichli: `Prepare` → `Complete`, imzo `md5(click_trans_id + service_id +
SECRET_KEY + merchant_trans_id + amount + action + sign_time)`.
Click Pass / Click Up ilovasi orqali ham to'lov mumkin.

### Uzcard / Humo
To'g'ridan-to'g'ri emas — Payme/Click yoki protsessing hamkori
(Atmos, Uzum Bank, ipak yo'li bank) orqali. Karta PAN **hech qachon
saqlanmaydi**, faqat token va mask (`8600 **** **** 1234`).

### Bank o'tkazmasi (korporativ)
Hisob-faktura generatsiyasi (PDF), to'lov topshirig'i raqami bo'yicha
qo'lda yoki bank statement importi orqali tasdiqlash. Keyingi bosqichda —
**didox.uz / faktura.uz** orqali EHF (elektron hisob-faktura) va akt.

### Arxitektura qoidasi
Barcha provayderlar bitta interfeys ortida:
```ts
interface PaymentProvider {
  createPayment(dto): Promise<{ paymentUrl: string; providerTxnId: string }>;
  handleCallback(raw): Promise<PaymentEvent>;
  refund(paymentId, amountTiyin): Promise<void>;
  verifySignature(raw): boolean;
}
```
Yangi provayder qo'shish = yangi adapter, biznes-logika o'zgarmaydi.

## 12.6. Xarita va marshrut

| Ehtiyoj | Yechim | Sabab |
|---|---|---|
| Xarita ko'rinishi (mobil) | **Yandex MapKit** | O'zbekiston ko'chalari va POI bazasi eng to'liq, rus/o'zbek nomlari |
| Geokoding / avtokomplit | Yandex Geocoder | Mahalliy manzillarni yaxshi taniydi ("Chilonzor 19-kvartal") |
| Marshrut va masofa (**server**) | **OSRM yoki Valhalla**, OSM Uzbekistan ekstrakti | Cheksiz bepul chaqiruv; matching kuniga 100k+ hisob qiladi |
| Map matching (GPS→yo'l) | OSRM `/match` | Chiroyli trek va aniq masofa |
| Admin panel xaritasi | MapLibre GL + OSM tiles | Bepul, o'zimizda |
| Zaxira | Google Maps | Yandex ishlamasa yoki xalqaro yo'nalishda |

**Muhim:** xarita **ko'rinishi** (SDK) va **hisoblash** (routing) ajratilgan.
Bu eng katta xarajat optimizatsiyasi: SDK mobilda bepul limitda,
og'ir hisob-kitob esa o'z serverimizda.

OSM ekstrakti oyiga bir marta yangilanadi (Geofabrik → `osrm-extract` →
`osrm-partition` → `osrm-customize`), 4 GB RAM'li konteynerda ishlaydi.

## 12.7. Boshqa mahalliy jihatlar

| Jihat | Yondashuv |
|---|---|
| **Telegram** | O'zbekistonda asosiy muloqot kanali. V2 da bot: yuk e'lonlari, buyurtma statusi, tez ro'yxatdan o'tish |
| **Naqd pul ustunligi** | MVP naqd bilan to'liq ishlaydi — bu majburiyat, "vaqtinchalik yechim" emas |
| **Android ustunligi** | ~90% Android. Past darajali qurilmalar (2 GB RAM) uchun optimizatsiya majburiy. iOS keyinroq, lekin bir vaqtda chiqadi |
| **Internet sifati** | Viloyatlarda 3G/EDGE keng tarqalgan → offline rejim, kichik payload, rasm siqish |
| **Yo'l politsiyasi hujjatlari** | TTN (tovar-transport nakladnoy) elektron shakli — korporativ mijozlar uchun muhim |
| **Mavsumiylik** | Kuz (hosil) — yuk hajmi cho'qqisi; qish (Kamchiq dovoni yopilishi) — vodiy yo'nalishida uzilishlar. Narx modeli buni hisobga olishi kerak |
| **Ishonch madaniyati** | Tanish-bilish orqali ishlash odati kuchli → reyting va "avval ishlaganlar" bo'limi juda muhim |
| **Bayramlar** | Navro'z, Ramazon/Qurbon hayiti — logistika oqimi keskin o'zgaradi, marketing kalendariga kiritiladi |

## 12.8. Raqobat muhiti

Hozirgi holatda yuk topish asosan quyidagilar orqali: Telegram guruhlari,
avtoto'xtash joylaridagi dispetcherlar, tanish-bilish, ayrim e-lon saytlari
va MDH bo'ylab ishlaydigan yuk birjalari (ATI.SU kabi).

**Karvonning farqlanishi:**
1. **Mobil-first** va o'zbek tilida — raqobatchilarning aksariyati veb va rus tilida.
2. **Avtomatik matching** — qidirish o'rniga taklif keladi.
3. **Live tracking** — klient qo'ng'iroq qilmaydi.
4. **Qaytish yuki** — haydovchi daromadini oshiradi (eng kuchli ushlab qolish sababi).
5. **Kafolat va nizo hal qilish** — Telegram guruhida bu yo'q.
