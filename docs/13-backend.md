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
npm test                # unit — infratuzilma kerak emas
npm run test:cov        # qamrov hisoboti
npm run test:e2e        # e2e — infra:up + db:migrate + db:seed kerak
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
