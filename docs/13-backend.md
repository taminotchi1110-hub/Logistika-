# 13 — Backend: ishga tushirish va kod tuzilishi (2-bosqich)

Bu bosqichda **Sprint 0 (fundament)** va **Sprint 1 (autentifikatsiya)** kodlandi.

## 13.1. Kerakli dasturlar

| Dastur | Versiya | Yuklab olish |
|---|---|---|
| Node.js | ≥ 20.11 (tavsiya: 22 LTS) | https://nodejs.org |
| Docker Desktop | oxirgi | https://docker.com/products/docker-desktop |
| Git | ≥ 2.40 | https://git-scm.com |

Tekshirish:
```bash
node -v && npm -v && docker --version
```

## 13.1a. Docker'siz muqobil yo'l (Windows)

Docker Desktop Windows'da WSL2/Hyper-V talab qiladi va ba'zi mashinalarda
uni ishga tushirish uzoq davom etadi. Bunday holatda **Docker umuman shart emas** —
bizga faqat PostgreSQL+PostGIS va Redis kerak, ikkalasi ham to'g'ridan-to'g'ri
o'rnatiladi. Bu yo'l real sinovdan o'tgan.

```powershell
# Administrator PowerShell'da
winget install PostgreSQL.PostgreSQL.16 --source winget
```

So'ng ikkita o'rnatuvchini yuklab, ishga tushiring:

| Komponent | Manba |
|---|---|
| PostGIS 3.6 bundle | `download.osgeo.org/postgis/windows/pg16/` |
| Memurai (Windows uchun Redis 7.2) | `dist.memurai.com` |

> ⚠️ Memurai'ni `winget` orqali o'rnatmang — u MSI'ni izolyatsiyada ishga
> tushiradi va `SFXCA: Failed to create temp directory (5)` xatosi chiqadi.
> MSI'ni to'g'ridan-to'g'ri oching.

Bazani tayyorlash (bir marta):

```sql
CREATE ROLE karvon LOGIN PASSWORD 'karvon_dev_password' SUPERUSER;
CREATE DATABASE karvon OWNER karvon ENCODING 'UTF8';
```

`.env` dagi `DATABASE_URL` va `REDIS_URL` o'zgarishsiz qoladi — portlar bir xil
(5432 va 6379). Shundan keyin `npm run db:migrate` va qolgani hujjatdagidek.

**Farqi:** MinIO ishlamaydi, ya'ni fayl yuklash (`/media`, `/documents`)
endpointlari ishlamaydi. Ular kerak bo'lganda MinIO'ni alohida `.exe` sifatida
ishga tushirish mumkin — u administrator huquqi talab qilmaydi.

## 13.2. Birinchi ishga tushirish

```bash
# 1. Bog'liqliklar
npm install

# 2. Muhit o'zgaruvchilari
cp .env.example .env

# 3. Infratuzilma (PostgreSQL+PostGIS, Redis, MinIO, Adminer)
npm run infra:up

# 4. Baza sxemasi va spravochniklar
npm run db:migrate
npm run db:seed

# 5. API
npm run dev
```

Ochiladi:
- API — http://localhost:3000/v1
- OpenAPI hujjati — http://localhost:3000/docs
- Health — http://localhost:3000/health
- Adminer (baza) — http://localhost:8080 (server: `postgres`, user/parol: `karvon`)
- MinIO konsoli — http://localhost:9001

## 13.3. Birinchi so'rov (haqiqiy oqim)

`.env` da `SMS_PROVIDER=console` va `OTP_EXPOSE_CODE_IN_DEV=true` bo'lgani uchun
kod SMS o'rniga terminal logida chiqadi va javobda ham qaytadi.

```bash
# 1. Kod so'rash
curl -X POST http://localhost:3000/v1/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone":"901234567"}'

# → {"data":{"expiresInSeconds":300,"resendAfterSeconds":60,"devCode":"482913"},"meta":{...}}

# 2. Tasdiqlash
curl -X POST http://localhost:3000/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"901234567","code":"482913","device":{"platform":"android","appVersion":"1.0.0"}}'

# → accessToken, refreshToken, user, isNewUser: true

# 3. Profilni to'ldirish
curl -X POST http://localhost:3000/v1/auth/profile \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Bobur","lastName":"Aliyev","role":"SHIPPER"}'

# 4. O'z profilim
curl http://localhost:3000/v1/me -H "Authorization: Bearer <accessToken>"
```

## 13.4. Kod xaritasi

```
apps/api/src/
├── main.ts                     # bootstrap: helmet, CORS, ValidationPipe, Swagger, shutdown hooks
├── app.module.ts               # modullar yig'ilishi, pino logger (telefon/token redaksiyasi)
│
├── config/
│   ├── env.schema.ts           # zod validatsiyasi — noto'g'ri konfiguratsiyada ilova ko'tarilmaydi
│   └── jwt-keys.ts             # RS256 kalitlari; dev'da avtomatik generatsiya
│
├── common/
│   ├── decorators/index.ts     # @Public, @Roles, @CurrentUser, @ClientIp, @UserAgent
│   ├── errors/                 # ErrorCode ro'yxati + AppError
│   ├── filters/                # yagona xato formati + requestId
│   ├── interceptors/           # { data, meta } qobig'i
│   ├── services/               # RateLimitService (Redis, fixed window)
│   └── utils/phone.util.ts     # E.164 normalizatsiya, maskalash
│
├── infra/
│   ├── database/
│   │   ├── database.service.ts # Kysely + pg pool (NUMERIC/BIGINT string bo'lib keladi)
│   │   ├── database.types.ts   # SQL sxemasining TS aksi
│   │   └── migrator.ts         # SQL migratsiyalarni qo'llovchi skript
│   └── redis/redis.service.ts  # ioredis + atomik sanagichlar
│
└── modules/
    ├── auth/                   # OTP, JWT, sessiyalar, guardlar
    ├── users/                  # profil
    ├── sms/                    # provayder adapteri (console | eskiz)
    ├── reference/              # spravochniklar + Redis kesh
    └── health/                 # liveness / readiness
```

## 13.5. Amalga oshirilgan xavfsizlik choralari

| Chora | Qayerda |
|---|---|
| Himoya sukut bo'yicha yoqilgan (global guard), ochiqlik `@Public()` bilan | `auth.module.ts`, `jwt-auth.guard.ts` |
| JWT RS256 + `token_version` bilan bir zumda bekor qilish | `token.service.ts` |
| Refresh rotation + **reuse detection** | `token.service.ts` → `rotate()` |
| Sessiya har bir so'rovda tekshiriladi (logout darhol ishlaydi) | `jwt-auth.guard.ts` |
| OTP: SHA-256 + pepper, bir marta ishlatiladi, urinishlar cheklangan | `otp.service.ts` |
| Uch qatlamli rate limit (60 s / soat / kun) | `otp.service.ts`, `rate-limit.service.ts` |
| Mass-assignment himoyasi (`forbidNonWhitelisted`) | `main.ts` |
| Telefon, token, kod loglarda maskalanadi | `app.module.ts` (pino redact) |
| Begona resurs `404` qaytaradi (IDOR razvedkasiga qarshi) | `app.error.ts` → `notFound()` |
| Helmet, CORS oq ro'yxati, `trust proxy` | `main.ts` |
| Ichki xato tafsilotlari mijozga chiqmaydi | `all-exceptions.filter.ts` |

## 13.6. Testlar

```bash
npm test                # unit (207 ta) — infratuzilma kerak emas
npm run test:cov        # qamrov hisoboti
npm run test:e2e        # e2e — infra:up + db:migrate + db:seed kerak

# Uchdan-uchgacha: API ishlab turishi kerak
npm run smoke:all       # HAMMASI (329 ta tekshiruv) — quyidagi toʻqqiztasi
npm run smoke           # 1. auth, park, hujjatlar, geo, yuk, lenta   (44)
npm run smoke:orders    # 2. taklif, buyurtma, kontakt ko'rinishi     (41)
npm run smoke:ws        # 3. chat, WebSocket, banner                  (32)
npm run smoke:push      # 4. oflayn push navbati                      (13)
npm run smoke:matching  # 5. avtomatik matching (Match Score)         (29)
npm run smoke:tracking  # 6. jonli GPS kuzatuv                        (34)
npm run smoke:payments  # 7. hamyon, ledger, Click va Payme            (65)
npm run smoke:ratings   # 8. ikki tomonlama reyting                    (28)
npm run smoke:admin     # 9. admin paneli                              (43)
```

Batafsil: [15-realtime-and-notifications.md](15-realtime-and-notifications.md#158-tekshiruv)

### `npm run smoke` — uchdan-uchgacha tekshiruv

`scripts/smoke-test.sh` haqiqiy HTTP so'rovlar bilan **butun zanjirni**
sinaydi va 44 ta tekshiruv bajaradi:

```
>> Spravochnik              14 viloyat, 13 transport turi, versiya hash
>> Yuk beruvchi kirish      OTP, cooldown 429, noto'g'ri kod, replay himoyasi
>> Profil                   401/AUTH_TOKEN_INVALID, GET /me
>> Masofa va narx           328 km, viloyatlar aniqlandi, tarif tavsiyasi
>> Yuk e'loni               yaratildi, masofa hisoblandi, sana validatsiyasi
>> Haydovchi va transport   raqam normallashtirish, dublikat, quvvat chegarasi
>> Verifikatsiya            missingSteps, DRIVER_NOT_VERIFIED
>> Lenta                    yuk ko'rindi, TELEFON MASKALANGAN, filtrlar, rol
```

E2E testlar aynan quyidagilarni tekshiradi:
- notoʻgʻri telefon → `VALIDATION_FAILED`
- sxemada yoʻq maydon (`role: "ADMIN"`) → 400 (mass-assignment)
- cooldown ichidagi ikkinchi soʻrov → `OTP_COOLDOWN` + `retryAfterSeconds`
- notoʻgʻri kod → `OTP_INCORRECT` + qolgan urinishlar
- **bitta kod ikki marta ishlamaydi** (replay himoyasi)
- tokensiz/yaroqsiz token → 401 va toʻgʻri xato kodi
- spravochnik versiyasi mos kelsa — katta javob qaytarilmaydi

## 13.7. Foydali buyruqlar

```bash
npm run db:status       # qaysi migratsiya qo'llangan
npm run db:reset        # bazani to'liq qayta qurish (faqat dev)
npm run lint            # eslint
npm run format          # prettier
npm run infra:logs      # docker loglari
npm run infra:nuke      # konteyner + volume'larni o'chirish
```

## 13.8. Keyingi bosqich (3-bosqich)

Sprint 2–3 rejasi:
1. `vehicles` moduli — transport CRUD, hujjat yuklash (S3 presigned URL).
2. `documents` moduli — yuklash, admin verifikatsiya oqimi.
3. `loads` moduli — yuk yaratish, lenta, filter, cursor pagination.
4. `geo` moduli — OSRM proxy (masofa/ETA), geokoding.
5. `driver_profiles` — yo'nalishlar, bo'sh/band holati.
