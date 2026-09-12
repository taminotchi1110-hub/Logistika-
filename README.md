# KARVON — O'zbekiston uchun raqamli yuk almashinuv platformasi

[![CI](https://github.com/taminotchi1110-hub/Logistika-/actions/workflows/ci.yml/badge.svg)](https://github.com/taminotchi1110-hub/Logistika-/actions/workflows/ci.yml)

> **Holat:** 9-BOSQICH — uch tilli interfeys (uz/ru/en), lenta filtri, ishga tushirishga tayyorgarlik
> **Versiya:** 0.9.0 · **Sana:** 2026-09-12

Yuk beruvchi (shipper) va haydovchi (carrier) ni real vaqtda bog'laydigan, GPS tracking,
avtomatik matching, escrow to'lov va reyting tizimiga ega marketplace platforma.

---

## Tez boshlash

```bash
npm install
cp .env.example .env
npm run infra:up        # PostgreSQL+PostGIS, Redis, MinIO, Adminer
npm run db:migrate      # sxema
npm run db:seed         # 14 viloyat, transport turlari, tariflar
npm run dev             # http://localhost:3000/v1 · hujjat: /docs
```

Batafsil: [docs/13-backend.md](docs/13-backend.md)

| Bosqich | Holat |
|---|---|
| 1 — Arxitektura, DB, user flow, UI/UX, roadmap | ✅ tayyor |
| 2 — Sprint 0 + Auth (OTP, JWT, sessiyalar, spravochnik) | ✅ tayyor |
| 3 — Transport, hujjatlar, geo servis, yuk e'loni va lenta | ✅ tayyor |
| 4 — Takliflar, buyurtma, chat, realtime, push, **matching**, **GPS kuzatuv** | ✅ tayyor |
| 5 — **To'lovlar** (Click/Payme), **reyting**, **admin API** | ✅ tayyor |
| 6 — Flutter mobil ilova (12 ekran, chat, kuzatuv, hamyon) | ✅ tayyor |
| 7 — Admin panel interfeysi (React + Vite, 9 ekran) | ✅ tayyor |
| 8 — Buyurtma monitoringi va support amallari, **CI** | ✅ tayyor |
| 9 — **i18n** (uz/ru/en: ilova + push/SMS), lenta filtri | ✅ tayyor |
| 9 — Yuklama va xavfsizlik testlari, Docker, deploy va zaxira nusxa | ⏳ jarayonda |

### Testlar

| Qatlam | Soni | Buyruq |
|---|---|---|
| Backend unit | 224 | `npm test --workspace=@karvon/api` |
| Backend uchidan-uchiga | 425 | `bash scripts/test-all.sh` |
| Admin panel | 188 | `npm run admin:test` |
| Mobil unit/widget | 328 | `npm run mobile:test` |
| Mobil integratsiya | 81 | `npm run mobile:test:api` |

Hammasi har push va PR da avtomatik ishlaydi ([ci.yml](.github/workflows/ci.yml)).

### Mobil ilovani yig'ish

```bash
flutter run \
  --dart-define=API_BASE_URL=https://api.karvon.uz/v1 \
  --dart-define=WS_URL=https://api.karvon.uz \
  --dart-define=SUPPORT_PHONE=+998XXXXXXXXX
```

`SUPPORT_PHONE` berilmasa bloklangan akkaunt ekranida qo'ng'iroq tugmasi
ko'rsatilmaydi — ilovada to'qima raqam yo'q.

---

## Tanlangan texnologiyalar (qisqacha)

| Qatlam | Tanlov | Sabab |
|---|---|---|
| Backend | **NestJS (Node.js 22 + TypeScript)** | Modular DI arxitektura, REST+WebSocket+Queue bitta framework ichida, TS tufayli mobil/admin bilan umumiy tiplar |
| AI/ML servis | **Python 3.12 + FastAPI** (2-yil) | Matching/ETA/fraud modellari uchun alohida servis |
| DB | **PostgreSQL 16 + PostGIS 3.4** | Geo-so'rovlar (radius, polygon, marshrut) native, ACID, partitioning |
| DB qatlami | **Kysely** (query builder) + SQL-first migratsiya | ORM PostGIS, partitioning va DEFERRABLE triggerlarni to'g'ri chiqara olmaydi. Kysely — to'liq tip xavfsizligi + SQL ustidan to'liq nazorat, kodgeneratsiyasiz ([sabab](docs/05-database.md#55-migratsiya-strategiyasi-va-db-qatlami)) |
| Cache/Queue | **Redis 7** | GEO index, BullMQ, OTP, rate-limit, pub/sub, WS adapter |
| Realtime | **Socket.IO (NestJS Gateway) + Redis adapter** | Horizontal scale, mobil tarmoqda reconnect/fallback |
| Routing/ETA | **OSRM yoki Valhalla (self-hosted, OSM Uzbekistan)** | Distance-matrix cheksiz va bepul; API xarajati 0 |
| Xarita UI | **Yandex MapKit** (asosiy) + Google Maps (fallback) | O'zbekiston manzil/geokoding bazasi eng to'liq |
| Mobil | **Flutter 3.x (Dart)** | Bitta kod → Android+iOS, past darajali Android'da ham 60fps |
| Admin panel | **React 18 + TypeScript + Vite + TanStack Query** | Tez, ekotizim keng |
| Push | **Firebase Cloud Messaging** (+APNs) | Android/iOS uchun yagona kanal |
| Storage | **S3-compatible (MinIO → keyin bulut)** | Presigned upload, arzon |
| Observability | OpenTelemetry + Prometheus + Grafana + Loki + Sentry | Prod'da diagnostika |
| Infra | Docker → Docker Compose (MVP) → Kubernetes (scale) | Bosqichma-bosqich |

> **Muhim huquqiy cheklov:** O'zbekiston fuqarolarining shaxsiy ma'lumotlari O'zbekiston
> hududidagi serverlarda saqlanishi talab qilinadi (ZRU-547, 2021-yilgi o'zgartirish —
> "data localization"). Shu sababli **production DB va fayl storage O'zbekistondagi
> data-markazda** (UZINFOCOM / Uzcloud / mahalliy DC) joylashtiriladi. Yakuniy tasdiq
> uchun yurist bilan kelishing.

---

## Hujjatlar

| # | Fayl | Mazmun |
|---|---|---|
| 01 | [docs/01-concept.md](docs/01-concept.md) | Nomlar, konsepsiya, bozor, biznes-model asosi |
| 02 | [docs/02-features.md](docs/02-features.md) | To'liq funksiyalar ro'yxati (MVP / V2 / V3) |
| 03 | [docs/03-user-flows.md](docs/03-user-flows.md) | User flow va order lifecycle state machine |
| 04 | [docs/04-architecture.md](docs/04-architecture.md) | System / matching / tracking / notification arxitektura |
| 05 | [docs/05-database.md](docs/05-database.md) | ER diagram, jadvallar, indekslar, relationships |
| 06 | [docs/06-api.md](docs/06-api.md) | REST + WebSocket API endpointlar |
| 07 | [docs/07-ui-ux.md](docs/07-ui-ux.md) | 22 ta ekran, element-by-element |
| 08 | [docs/08-admin.md](docs/08-admin.md) | Admin panel arxitekturasi va modullari |
| 09 | [docs/09-monetization.md](docs/09-monetization.md) | Daromad modellari + SWOT tahlil |
| 10 | [docs/10-security.md](docs/10-security.md) | Xavfsizlik, anti-fraud, compliance |
| 11 | [docs/11-roadmap.md](docs/11-roadmap.md) | Sprintlar, jamoa, byudjet, KPI |
| 12 | [docs/12-uz-integrations.md](docs/12-uz-integrations.md) | Click/Payme/SMS/soliq/xarita integratsiyalari |
| 13 | [docs/13-backend.md](docs/13-backend.md) | **Backend: ishga tushirish, kod xaritasi, testlar** |
| 14 | [docs/14-loads-and-fleet.md](docs/14-loads-and-fleet.md) | **Transport, hujjatlar, geo servis, yuk e'loni** |
| 15 | [docs/15-realtime-and-notifications.md](docs/15-realtime-and-notifications.md) | **Chat, WebSocket, bildirishnoma va push** |
| 16 | [docs/16-matching-and-tracking.md](docs/16-matching-and-tracking.md) | **Avtomatik matching va jonli GPS kuzatuv** |
| 17 | [docs/17-payments-ratings-admin.md](docs/17-payments-ratings-admin.md) | **Toʻlovlar, reyting va admin paneli** |
| 18 | [docs/18-i18n.md](docs/18-i18n.md) | **Koʻp tillilik: ilova, bildirishnoma shablonlari, yangi til qoʻshish** |
| — | [db/migrations/0001_init.sql](db/migrations/0001_init.sql) | To'liq PostgreSQL DDL |
| — | [db/seeds/0001_reference.sql](db/seeds/0001_reference.sql) | Spravochnik ma'lumotlari |

---

## Repo strukturasi

```
karvon/
├── apps/
│   ├── api/                  # NestJS core API (REST + WebSocket + push navbati)
│   │   ├── src/
│   │   │   ├── config/           # env validatsiya (zod), JWT kalitlari
│   │   │   ├── common/           # xatolar, filter, interceptor, guard, util
│   │   │   ├── infra/            # PostgreSQL (Kysely), Redis, S3, migrator
│   │   │   └── modules/          # auth · users · sms · reference · geo · media · documents
│   │   │                         # vehicles · drivers · loads · matching · orders · chat
│   │   │                         # tracking · notifications · payments · ratings · admin
│   │   └── test/                 # e2e testlar
│   ├── admin/                # React + Vite admin panel (9 ekran)
│   └── mobile/               # Flutter — mijoz va haydovchi bitta ilovada
│       ├── lib/features/         # auth · loads · offers · orders · chat · tracking
│       │                         # wallet · profile · documents · ratings · geo
│       ├── lib/l10n/             # uz/ru/en tarjimalar (ARB)
│       ├── test/                 # unit va widget testlar
│       └── test_integration/     # haqiqiy API bilan oqimlar
├── db/
│   ├── migrations/           # SQL — yagona haqiqat manbai
│   └── seeds/                # viloyat, tuman, transport turlari, tariflar
├── docs/                     # 18 ta hujjat
├── scripts/                  # uchidan-uchiga testlar, fixture, Windows sozlash
├── .github/workflows/ci.yml  # API, admin, mobil va integratsiya testlari
└── docker-compose.yml        # postgres+postgis, redis, minio, adminer

# keyingi bosqichlarda:
#   services/ai-matching/     # FastAPI (V2) — ML matching va ETA
#   infra/                    # k8s, terraform
```
