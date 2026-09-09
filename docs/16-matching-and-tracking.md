# 16. Avtomatik matching va jonli GPS kuzatuv

> 4-bosqichning ikkinchi yarmi. Oldingi hujjatlar:
> [14-loads-and-fleet.md](14-loads-and-fleet.md) (yuk, transport),
> [15-realtime-and-notifications.md](15-realtime-and-notifications.md) (WebSocket, push).

---

## 16.1. Matching: D-01, D-02, D-03

### Ikki bosqichli qidiruv

```
Yuk e'lon qilindi
      │
      ▼
┌─────────────────────────────────────────────┐
│ 1. HARD FILTER (SQL)                        │
│    tasdiqlangan · bo'sh · sig'adi · turi mos│
│    radius: 30 → 80 → 200 km                 │
└─────────────────────────────────────────────┘
      │  ≤ 300 nomzod
      ▼
┌─────────────────────────────────────────────┐
│ 2. SOFT SCORING (match-score.ts)            │
│    7 komponent → 0..100 ball                │
└─────────────────────────────────────────────┘
      │
      ├─→ load_matches (barcha nomzodlar, rank bilan)
      └─→ top-20 ga push (ball ≥ min_score_for_push)
```

**Nega ikki bosqich:** hard filter bazada bajariladi — minglab
haydovchini Node'ga tortib olish ma'nosiz. Ballash esa TypeScript'da,
sof funksiyada: u to'liq unit-test qilinadi (40 ta test) va kelajakda
ML modelga almashtirilganda interfeys o'zgarmaydi.

**Nega radius bosqichma-bosqich:** avval 30 km ichida qidiriladi.
Yetarli nomzod topilmasa 80, keyin 200 km. Toshkent ichidagi yukka
Xorazmdagi haydovchini taklif qilish — foydasiz push va yo'qotilgan
ishonch.

### Match Score komponentlari

| Komponent | Og'irlik | Nima o'lchaydi |
|---|---|---|
| `proximity` | 0.28 | Olish nuqtasigacha masofa (10 km gacha to'liq ball) |
| `routeFit` | 0.20 | Yuk haydovchining doimiy yo'nalishiga tushadimi |
| `capacityFit` | 0.14 | Transport yukka mos kelishi |
| `rating` | 0.14 | Reyting (Bayes tekislash bilan) |
| `priceFit` | 0.10 | Narx haydovchi uchun jozibalimi |
| `reliability` | 0.08 | Vaqtida yetkazish, javob berish, bekor qilmaslik |
| `history` | 0.06 | Yakunlangan buyurtmalar (logarifmik) |

Og'irliklar `platform_settings.matching.weights` da — admin panelidan
o'zgartiriladi, kodni qayta yig'ish shart emas. Har bir natijada
`weights_version` saqlanadi: eski ballar qaysi og'irliklar bilan
hisoblanganini keyin ham bilib olamiz (ML uchun muhim).

### Uchta nozik qaror

**1. Reyting Bayes tekislash bilan.**
Bitta 5★ olgan yangi haydovchi 200 ta buyurtmada 4.8 to'plagan
haydovchidan yuqori turmasligi kerak:

```
smoothed = (avg × count + 4.3 × 5) / (count + 5)
```

Reytingsiz haydovchi 4.3 ga teng neytral qiymat oladi — u jazolanmaydi,
lekin isbotlanmagan yuqori bahoga ham ega bo'lmaydi.

**2. Katta transport — yomon moslik.**
500 kg yukni 20 tonnalik furada tashish ikkala tomon uchun ham zarar:
haydovchi yoqilg'iga ko'p sarflaydi, mijoz kichik mashina narxidan
qimmatga tushadi. Shuning uchun quvvatdan foydalanish ulushi 60% dan
past bo'lsa ball pasayadi. SQL ham shunga mos: `DISTINCT ON` bilan har
bir haydovchidan yukka **yetarli, lekin eng kichik** transport tanlanadi.

**3. Sabablar ko'rsatiladi.**
"93%" raqamining o'zi ishonch uyg'otmaydi. Haydovchi
"Sizga 12 km · Doimiy yo'nalishingiz · Transportingizga to'liq mos"
deb ko'rsa, tavsiyaga ishonadi.

### Bog'lanish — hodisa orqali

```
LoadsService.publish()  ──emit──►  load.published
                                        │
                                        ▼
                              MatchingListener  ──►  MatchingService
```

`LoadsService` matching haqida bilmaydi, matching esa `PricingService` ni
`LoadsModule` dan oladi — to'g'ridan-to'g'ri chaqiruvda ikki modul
tsiklik bog'lanardi. Bundan tashqari matching sekin (SQL + hisob +
push), e'lon qilish javobi uni kutib turmasligi kerak.

**Matching xatosi e'lon qilishni buzmaydi.** U yiqilsa ham yuk lentada
ko'rinadi va haydovchi uni o'zi topadi. Matching — qulaylik, majburiy
bosqich emas.

### ML uchun tayyorgarlik

`load_matches` da uchta vaqt belgisi saqlanadi:

| Ustun | Nimani bildiradi |
|---|---|
| `notified_at` | Push yuborildi |
| `viewed_at` | Haydovchi yuk kartasini ochdi |
| `offered_at` | Haydovchi taklif yubordi |

"Ko'rdi, lekin taklif yubormadi" — ball juda yuqori berilganini
bildiradi. "Ko'rdi va taklif yubordi" — ball to'g'ri edi. Bu ikki belgi
kelajakdagi modelning asosiy o'quv materiali (D-09).

### Endpointlar

| Metod | Yo'l | Kim |
|---|---|---|
| `GET` | `/loads/:id/matches` | Yuk beruvchi — kim topildi |
| `POST` | `/loads/:id/rematch` | Narx o'zgartirilgandan keyin qayta ishga tushirish |

Qayta ishga tushirilganda avval xabar berilgan haydovchilarga **takroriy
push ketmaydi** (`notified_at` saqlanadi).

---

## 16.2. Jonli GPS kuzatuv

### Maxfiylik qoidasi — asosiy dizayn

Haydovchining **marshrut tarixi** faqat faol reys davomida yoziladi:

| Buyurtma holati | Marshrut tarixi | Matching keshi |
|---|---|---|
| Buyurtma yo'q | ❌ | ✅ |
| `ASSIGNED`, `CONFIRMED` | ❌ | ✅ |
| `EN_ROUTE_TO_PICKUP` … `ARRIVED_AT_DELIVERY` | ✅ | ✅ |
| `DELIVERED` va undan keyin | ❌ | ✅ |

Ikki xil ma'lumot borligiga e'tibor bering:

- **Matching keshi** (`driver_profiles.current_geom`) — bitta joriy
  nuqta. U matching uchun kerak: haydovchi qayerdaligini bilmasak,
  yaqinlik bo'yicha ball bera olmaymiz. Tarix emas.
- **Marshrut tarixi** (`driver_locations`) — har 10 soniyada bir nuqta,
  butun yo'l. Bu faqat reys davomida yoziladi.

Ya'ni haydovchi ishlamayotgan paytda uning **yurgan yo'li saqlanmaydi**.

Ilova bitta endpointga yozadi, qoidani server qo'llaydi va javobda
aytadi:

```json
{ "tracking": true,  "live": { "target": "PICKUP", "etaMinutes": 22, ... } }
{ "tracking": false, "live": null }
```

Mijozda "hozir yozsam bo'ladimi?" degan mantiq bo'lishi shart emas —
u `tracking: false` ni ko'rib GPS chastotasini pasaytiradi va batareyani
tejaydi.

> **Eslatma:** 3-bosqichda `POST /me/driver/location` `DriversController`
> da edi va faqat keshni yangilardi. 4-bosqichda ikkita endpoint bir
> marshrutga da'vo qilib qoldi (NestJS birinchisini tanlaydi va
> ikkinchisi jimgina ishlamaydi). Ular birlashtirildi — mantiq bitta
> joyda.

### Oqim

```
Haydovchi ilovasi                Server                    Mijoz
      │                             │                        │
      │ location:update (WS, 10 s)  │                        │
      ├────────────────────────────►│                        │
      │                             │ driver_locations        │
      │                             │ current_geom (kesh)     │
      │                             │                        │
      │                             │ Redis: track:order:*   │
      │                             ├───────────────────────►│ order:location
      │  ack {tracking, etaMinutes} │                        │ (xaritadagi marker)
      │◄────────────────────────────┤                        │
```

`TrackingService` WebSocket haqida bilmaydi — u Redis'ga chop etadi,
gateway obuna bo'lib uzatadi. Shu sababli kuzatuvni keyinchalik alohida
servisga ko'chirish oson: u eng ko'p yozuv qiladigan qism (har 10
soniyada har bir faol haydovchidan nuqta).

### Ishonchlilik: oflayn bufer

Tunnel yoki tog' yo'lida aloqa uziladi. Ilova nuqtalarni buferlaydi va
aloqa tiklanganda **to'plam** bilan yuboradi (`POST /me/driver/location`,
bir so'rovda 200 tagacha nuqta, har birida o'z `recordedAt` i).
Marshrutda teshik qolmaydi.

Rad etiladigan nuqtalar: koordinatasi noto'g'ri, 24 soatdan eski,
yoki 5 daqiqadan ko'p kelajakdagi vaqt (telefon soati noto'g'ri).

**Faol reys bo'lmasa xato QAYTARILMAYDI.** Javobda `tracking: false`
keladi va marshrut tarixi yozilmaydi (maxfiylik qoidasi), lekin matching
keshi — haydovchining joriy nuqtasi — baribir yangilanadi. Bu bitta
qiymat, tarix emas.

Nega xato emas: haydovchi ilovasi reys holatini server bilan bir vaqtda
bilmaydi. U "Yetkazib berdim" tugmasini bosgan payt buferdagi nuqtalar
hali yo'lda bo'lishi mumkin — ular xato bilan qaytsa ilova ularni qayta
yuborishga urinadi va tsikl hosil bo'ladi.

### Soxta GPS

Ikki manba:

1. **Ilovaning o'zi** — Android mock-location bayrog'ini yuboradi.
2. **Server tekshiruvi** — oldingi nuqtadan hozirgisiga 250 km/h dan
   tez o'tish fizik jihatdan imkonsiz.

Bunday nuqtalar **rad etilmaydi**, `is_mock` bilan belgilanadi va admin
panelida ko'rinadi. Rad etish xavfli: oddiy GPS xatosi ham shunday
ko'rinishi mumkin va marshrutda teshik qoladi.

### ETA

```
etaMinutes = masofa(joriy → maqsad) / tezlik × 60
```

Maqsad nuqta holatga qarab o'zgaradi: yuk ortilgunicha — **olish**
manzili, `LOADED` dan keyin — **yetkazish** manzili.

Tezlik 5 km/h dan past bo'lsa (mashina turibdi) o'rtacha 55 km/h
ishlatiladi — "0 km/h da abadiy" degan javob foydasiz.

### Marshrut arxivi

Buyurtma tugaganda (`DELIVERED`, `COMPLETED` yoki bekor qilinganda)
marshrut `order_tracks` ga siqilgan holda yoziladi:

| Ustun | Qiymat |
|---|---|
| `polyline` | Google Encoded Polyline |
| `points_count`, `distance_km`, `duration_min` | statistika |
| `avg_speed_kmh`, `max_speed_kmh`, `stops_count` | 5 daqiqadan uzoq to'xtashlar |

**Nega alohida jadval:** `driver_locations` partitionlangan va eski
partitionlar vaqt o'tishi bilan o'chiriladi (saqlash xarajati).
Marshrut esa nizoda dalil bo'lishi mumkin. 5 soatlik reysda ~1800 nuqta
JSON sifatida ~60 KB, polyline sifatida ~9 KB — va u xaritada
to'g'ridan-to'g'ri chiziladi.

Bekor qilingan buyurtmada ham arxivlaymiz: "haydovchi umuman yo'lga
chiqmadi" degan da'voni aynan shu ma'lumot hal qiladi.

### Partitionlar

`0001` da faqat ikki oylik partition yaratilgan edi — 2026-11-01 dan
keyin GPS nuqtasi yozilmasdi:

```
ERROR: no partition of relation "driver_locations" found for row
```

`0003` migratsiyasi `ensure_driver_locations_partition(date)`
funksiyasini qo'shadi va 13 oylik partitionni oldindan yaratadi. Funksiya
kunlik cron'dan chaqiriladi. `pg_partman` ishlatilmadi: u qo'shimcha
kengaytma talab qiladi va boshqariladigan bulutli bazalarda har doim ham
mavjud emas.

### Endpointlar va WebSocket hodisalari

| Metod | Yo'l | Vazifa |
|---|---|---|
| `POST` | `/me/driver/location` | Nuqta(lar) yuborish (REST zaxira, to'plam) |
| `GET` | `/orders/:id/location` | Oxirgi joylashuv + ETA |
| `GET` | `/orders/:id/track` | Marshrut (polyline) |

| Hodisa | Yo'nalish | Vazifa |
|---|---|---|
| `location:update` | mijoz → server | Joylashuv (asosiy yo'l) |
| `order:subscribe` | mijoz → server | Buyurtma xonasiga kirish |
| `order:location` | server → mijoz | Xaritadagi markerni siljitish |

`order:subscribe` **huquqni tekshiradi**: xonaga faqat buyurtma
ishtirokchisi kira oladi. Busiz ID'ni bilgan har kim haydovchining
joylashuvini kuzatishi mumkin bo'lardi.

---

## 16.3. Tekshiruv

```bash
npm run smoke:matching   # 29 ta
npm run smoke:tracking   # 34 ta
npm run smoke:all        # barchasi (193 ta)
```

| Nima isbotlanadi | To'plam |
|---|---|
| Sig'maydigan, tasdiqlanmagan, band haydovchi tushmaydi | matching |
| Yo'nalishi mos nomzod yuqoriroq ball oladi | matching |
| Top haydovchilarga push ketadi, takrori ketmaydi | matching |
| `viewed_at` / `offered_at` yoziladi | matching |
| **Reysdan oldin marshrut tarixi yozilmaydi** | tracking |
| **Mijoz haydovchini real vaqtda ko'radi** | tracking |
| Maqsad `LOADED` da yetkazishga o'tadi | tracking |
| Oflayn bufer yo'qolmaydi | tracking |
| Imkonsiz sakrash `is_mock` bilan belgilanadi | tracking |
| Begona odam obuna bo'la olmaydi | tracking |
| Topshirilgach kuzatuv to'xtaydi, marshrut arxivlanadi | tracking |
