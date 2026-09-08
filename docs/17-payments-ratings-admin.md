# 17. To'lovlar, reyting va admin paneli

> 5-bosqich. Oldingi hujjatlar: [15](15-realtime-and-notifications.md) (realtime),
> [16](16-matching-and-tracking.md) (matching va kuzatuv).

---

## 17.1. Pul: asosiy qarorlar

### Pul har doim `bigint` tiyinda

```ts
0.1 + 0.2 === 0.30000000000000004   // suzuvchi nuqta
2 ** 53 + 1 === 2 ** 53             // 90 mlrd so'mdan keyin aniqlik yo'q
```

90 mlrd so'm — bu platformaning bir yillik aylanmasi darajasi, ya'ni
`number` bilan ishlash nazariy emas, **amaliy** xavf. Shuning uchun:

- bazada `BIGINT` (tiyinda)
- `pg` drayveri INT8 ni **string** qilib qaytaradi (aniqlik yo'qolmasin)
- kodda `bigint` bilan hisoblanadi (`money.util.ts`)

### Ikki yozuvli hisob (double-entry)

Har bir operatsiyada yozuvlar yig'indisi **nol**: pul bir hisobdan
ikkinchisiga o'tadi, yo'qdan paydo bo'lmaydi.

```
Hamyonni to'ldirish:   PSP_CLEARING −100 000   →   USER_WALLET +100 000
Escrow bloklash:       USER_WALLET  −200 000   →   ESCROW      +200 000
Buyurtma yakunlandi:   ESCROW       −200 000   →   DRIVER_WALLET +192 000
                                                 →   PLATFORM_REVENUE +8 000
```

Buni **baza tekshiradi**, kod emas:

```sql
CREATE CONSTRAINT TRIGGER trg_ledger_balanced
    AFTER INSERT ON ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION assert_ledger_balanced();
```

`DEFERRABLE` — tekshiruv COMMIT paytida bajariladi, ya'ni tranzaksiya
ichida yozuvlar birma-bir qo'shilishi mumkin. Balanslanmagan tranzaksiya
COMMIT bo'la olmaydi.

**Yozuvlar o'zgarmaydi:** `UPDATE` va `DELETE` trigger bilan taqiqlangan.
Xato tuzatilsa ham yangi teskari yozuv qo'shiladi — eski yozuv joyida
qoladi. Testda isbotlangan:

```
★ YOZUVNI OʻZGARTIRIB BOʻLMAYDI    true
★ YOZUVNI OʻCHIRIB BOʻLMAYDI       true
```

`ledger_accounts.balance_tiyin` — denormalizatsiya (tezlik uchun).
Haqiqat manbai — yozuvlar yig'indisi. `verifyIntegrity()` ikkalasini
solishtiradi va farq bo'lsa **ERROR** darajasida logga yozadi. Bu
tekshiruv admin panelida (`GET /admin/ledger/integrity`) va kunlik
cron'da bor.

### Naqd va escrow — ikki xil pul yo'li

O'zbekiston bozorining katta qismi naqd bilan ishlaydi, shuning uchun
ikkala sxema ham to'liq qo'llab-quvvatlanadi:

| | ESCROW | NAQD |
|---|---|---|
| Buyurtma tuzilganda | Mijoz hamyonidan bloklanadi | hech narsa |
| Yakunlanganda | ESCROW → haydovchi + platforma | Haydovchi hamyonidan **faqat komissiya** |
| Bekor qilinganda | ESCROW → mijoz (to'liq) | — |
| Mablag' yetmasa | **Buyurtma tuzilmaydi** | — |

**Naqd sxemada haydovchi hamyoni manfiy bo'ladi** — bu normal: pul
haydovchida naqd, komissiya esa platformaga qarz. Kredit limiti
(sukut bo'yicha 200 000 so'm) doirasida ruxsat beriladi. Limitga
yetgan haydovchi yangi taklif yubora olmaydi — aks holda bu cheksiz
kredit bo'lib qolardi.

> **Bir marta xato qilingan joy:** hamyon kredit limiti 0 edi va naqd
> komissiya "mablag' yetarli emas" bilan yiqilardi — buyurtma esa
> allaqachon `COMPLETED` bo'lgan. Ya'ni platforma daromadini **jimgina**
> yo'qotardi. Migratsiya `0004` va `ensureWallet()` sozlamadan o'qishi
> buni tuzatdi.

### Escrow yetmasa — buyurtma tuzilmaydi

Mijoz hamyonida pul bo'lmasa, buyurtma **yaratilmaydi** va taklif
`PENDING` ga qaytadi. Haydovchi behuda yo'lga chiqmasligi kerak.

### Jarima aybdordan jabrlanganga

Jarima platformaga **emas**, jabrlangan tomonga o'tadi. Aks holda
platforma bekor qilishdan manfaatdor bo'lib qolardi — bu noto'g'ri
rag'bat.

> **Yana bir tuzatilgan xato:** dastlab jarima escrow'dan (ya'ni
> mijozning **o'z** pulidan) chegirilardi. Natijada haydovchi bekor
> qilsa hech narsa to'lamasdi. Endi ikki mustaqil harakat bitta
> tranzaksiyada: escrow to'liq qaytadi, jarima aybdor hamyonidan
> yechiladi.

---

## 17.2. Click va Payme

### Click — ikki bosqichli

Click **bizning** serverimizga so'rov yuboradi (biz Click'ga emas):

```
1. Prepare  (action=0) → "shu to'lovni qabul qila olasizmi?"
2. Complete (action=1) → "pul yechildi, tasdiqlang"
```

Birinchi bosqichda biz to'lovni tekshiramiz va Click foydalanuvchidan
pul yechishdan **oldin** xato qaytara olamiz.

**Imzo:** `MD5(click_trans_id + service_id + SECRET + merchant_trans_id
[+ merchant_prepare_id] + amount + action + sign_time)`

`amount` **aynan Click yuborgan ko'rinishda** qo'shiladi — `"1000.00"`
va `"1000"` turli imzo beradi. Shuning uchun uni son sifatida qayta
formatlamaymiz.

### Payme — JSON-RPC 2.0

Bitta endpoint, `method` bilan ajratiladi. Autentifikatsiya —
HTTP Basic `Paycom:{MERCHANT_KEY}`, **doimiy vaqtli solishtirish** bilan
(`timingSafeEqual`): kalit maxfiy, oddiy `===` bilan uni javob
vaqtidagi farq orqali belgima-belgi topish mumkin.

| Metod | Vazifa |
|---|---|
| `CheckPerformTransaction` | Bu to'lovni qabul qila olamizmi |
| `CreateTransaction` | Tranzaksiya yaratish |
| `PerformTransaction` | Pulni yechish |
| `CancelTransaction` | Bekor qilish |
| `CheckTransaction` | Holatni so'rash |
| `GetStatement` | Davr bo'yicha solishtirish |

Tranzaksiya holatlari: `1` yaratildi, `2` bajarildi, `−1` bajarilishidan
oldin bekor, `−2` bajarilgandan keyin bekor. Bajarish muddati — **12 soat**.

### Ikkalasi ham HTTP 200 kutadi

Xato **javob ichida** qaytariladi. 500 qaytarsak, ular buni "aloqa
uzildi" deb hisoblab so'rovni qayta-qayta yuboraveradi va navbat to'lib
ketadi.

> **Tuzatilgan xato:** global `ResponseInterceptor` barcha javoblarni
> `{data, meta}` ga o'rardi. Click va Payme bunday javobni tushunmaydi
> va to'lovni "muvaffaqiyatsiz" deb belgilaydi — **pul yechilgan bo'lsa
> ham**. Yechim: `@RawResponse()` dekoratori.

### Idempotentlik — ikki qatlamda

1. `payments.idempotency_key` — UNIQUE indeks (to'lov yozuvini himoya qiladi)
2. `LedgerService.transfer({ idempotencyKey })` — **pulni** himoya qiladi

Ikkilanish ataylab: PSP bir xil callback'ni bir necha marta yuborishi
odatiy hol. Testda isbotlangan:

```
takroriy callback ALREADY_PAID           −4
★ PUL IKKI MARTA QOʻSHILMADI             10000000
★ PAYME PULI IKKI MARTA QOʻSHILMADI      15000000
```

### Karta ma'lumoti

PAN (16 xonali raqam) **hech qachon saqlanmaydi**. Bazada faqat
maskalangan ko'rinish (`8600 **** **** 1234`) va PSP bergan token.
Birinchi 4 raqam — bank identifikatori (8600 = Uzcard, 9860 = Humo),
mijoz qaysi kartani tanlaganini shundan biladi.

---

## 17.3. Ikki tomonlama reyting

### Ko'r-ko'rona (double-blind)

Baholar **ikkala tomon ham baho bergunicha yashirin** turadi.

**Nega:** agar haydovchi mijoz qo'ygan 2 ballni ko'rsa, u ham o'ch olish
uchun 2 qo'yadi. Natijada reytinglar haqiqiy sifatni emas, o'zaro
munosabatni aks ettiradi. Bu muammo Uber va Airbnb'da o'lchab
isbotlangan — ikkalasi ham shu sxemaga o'tgan.

**14 kundan keyin** bir tomonlama baho ham ochiladi: aks holda baho
bermaslik orqali salbiy fikrni bloklash mumkin bo'lardi.

### Tarkibiy baholar

| Maydon | Kimdan kimga |
|---|---|
| `score` | ikki tomonlama (majburiy) |
| `punctuality` | ikki tomonlama |
| `communication` | ikki tomonlama |
| `cargoCondition` | **faqat mijozdan haydovchiga** |
| `reliability` | ikki tomonlama |

Haydovchi o'z yukining holatini baholashi mantiqsiz, shuning uchun
server bu maydonni haydovchi tomonidan yuborilsa ham `null` qiladi.

### Reyting matchingga ulanadi

Baho ochilganda:
- `users.rating_avg` va `rating_count` **to'liq qayta hisoblanadi**
  (bosqichma-bosqich o'rtachada bitta xato abadiy qolib ketadi)
- `driver_profiles.on_time_rate` — `punctuality ≥ 4` ulushi

`on_time_rate` Match Score'ning `reliability` komponentida ishlatiladi,
ya'ni **yaxshi ishlagan haydovchi ko'proq yuk oladi**. Bu tizimning
asosiy rag'batlantirish mexanizmi.

---

## 17.4. Admin paneli

### Autentifikatsiya foydalanuvchidan butunlay ajratilgan

| | Foydalanuvchi | Admin |
|---|---|---|
| Jadval | `users` | `admin_users` |
| Kirish | telefon + OTP | email + parol + **majburiy TOTP** |
| Parol | yo'q | Argon2id (OWASP 2024 parametrlari) |
| Token kaliti | `JWT_PRIVATE_KEY` | **`ADMIN_JWT_SECRET`** |
| Token muddati | 15 daqiqa + refresh | 2 soat, refresh yo'q |
| Guard | `JwtAuthGuard` (global) | `AdminGuard` (mustaqil) |

**Nega ajratilgan:** admin tokeni bilan foydalanuvchi endpointlariga
kirish va aksincha — mumkin bo'lmasligi kerak. Bitta guardda ikki xil
token turini qo'llab-quvvatlash xato qilish oson bo'lgan joy. Testda
ikkala yo'nalish ham tekshiriladi:

```
★ FOYDALANUVCHI TOKENI ADMINDA ISHLAMAYDI    true
★ ADMIN TOKENI FOYDALANUVCHIDA ISHLAMAYDI    true
```

### TOTP majburiy

Kalit yo'q bo'lsa kirishga ruxsat berilmaydi. "Hozircha 2FA siz
ishlatamiz" — eng ko'p uchraydigan va eng qimmat xavfsizlik yon berishi.

Birinchi admin **skript orqali** yaratiladi:

```bash
npm run admin:create -- --email=admin@karvon.uz --password='...' --role=SUPER_ADMIN
```

**Nega endpoint emas:** "birinchi adminni yaratish" endpointi ochiq
bo'lishi kerak edi va u eng katta xavf nuqtasiga aylanardi — kim
birinchi bo'lsa, o'sha super admin.

### Huquqlar

`admin_roles.permissions` — JSON massiv. `"*"` hamma narsa,
`"users.*"` guruh, aniq moslik ham ishlaydi.

| Rol | Nima qila oladi |
|---|---|
| `SUPER_ADMIN` | hammasi |
| `MODERATOR` | verifikatsiya, foydalanuvchilar, sharhlar |
| `SUPPORT` | buyurtmalar, shikoyatlar, chat |
| `FINANCE` | to'lovlar, payout, hisobotlar |
| `ANALYST` | faqat ko'rish |

Testda: moderator moliyaviy endpointga ham, sozlamalarga ham kira
olmaydi (`ADMIN_PERMISSION_DENIED`).

### Bloklash darhol ishlaydi

Foydalanuvchi bloklanganda `token_version` oshiriladi va barcha
sessiyalar bekor qilinadi. Aks holda bloklangan foydalanuvchi tokeni
muddati tugagunicha (15 daqiqa) ishlab turardi.

### Har bir amal auditda

```json
{
  "action": "user.banned",
  "adminEmail": "admin@karvon.uz",
  "before": { "status": "ACTIVE" },
  "after":  { "status": "BANNED", "reason": "Firibgarlik shubhasi" },
  "ip": "127.0.0.1",
  "createdAt": "2026-09-08T06:22:25Z"
}
```

Bu shunchaki "yaxshi amaliyot" emas — moliyaviy platformada admin
o'zboshimchaligi eng katta **ichki** xavf. "Komissiya kim tomonidan
5% dan 12% ga ko'tarildi" savoliga javob bo'lishi kerak.

### Sozlamalar kodni qayta yig'masdan o'zgaradi

`PUT /admin/settings/:key` — komissiya foizi, matching og'irliklari,
jarima, taklif muddati, GPS intervali. Kesh darhol tozalanadi.

> **Diqqat:** `SettingValueDto.value` da `@Allow()` dekoratori bor.
> `ValidationPipe` `whitelist: true` bilan ishlaydi va dekoratorsiz
> maydonni **olib tashlaydi** — bu bir marta sozlama saqlanmasligiga
> olib kelgan.

---

## 17.5. Tekshiruv

```bash
npm run smoke:payments   # 65 ta
npm run smoke:ratings    # 28 ta
npm run smoke:admin      # 43 ta
npm run smoke:all        # barchasi (329 ta)
```

| Nima isbotlanadi | To'plam |
|---|---|
| Click imzosi, summa, ikki bosqich, takroriy callback | payments |
| Payme JSON-RPC, auth, to'liq tsikl, idempotentlik | payments |
| Har bir ledger tranzaksiyasi balanslangan | payments |
| Yozuvni o'zgartirib/o'chirib bo'lmaydi | payments |
| Escrow: bloklash → taqsimlash → qaytarish | payments |
| Naqd: manfiy balans, limitga yetganda bloklash | payments |
| Jarima aybdordan yechiladi | payments |
| Karta PAN saqlanmaydi | payments |
| Baho hamkor bermaguncha yashirin | ratings |
| Ikkinchi bahodan keyin ikkalasi ochiladi | ratings |
| Reyting va `on_time_rate` qayta hisoblanadi | ratings |
| TOTP majburiy, 5 urinishdan keyin bloklash | admin |
| Tokenlar ajratilgan (ikki yo'nalishda) | admin |
| Huquqlar: moderator moliyaga kira olmaydi | admin |
| Bloklashda sessiya darhol bekor bo'ladi | admin |
| Har bir amal auditda, oldin/keyin bilan | admin |
