# KARVON — O'zbekiston uchun raqamli yuk almashinuv platformasi

> **Holat:** 2-BOSQICH — Sprint 0 (fundament) + Sprint 1 (autentifikatsiya) kodlandi
> **Versiya:** 0.1.0 · **Sana:** 2026-09-05

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
| 3 — Transport, hujjatlar, yuk e'loni, lenta, geo | ⏳ keyingi |

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
| — | [db/migrations/0001_init.sql](db/migrations/0001_init.sql) | To'liq PostgreSQL DDL |
| — | [db/seeds/0001_reference.sql](db/seeds/0001_reference.sql) | Spravochnik ma'lumotlari |

---

## Repo strukturasi

```
karvon/
├── apps/
│   └── api/              # ✅ NestJS core API (REST; WebSocket 4-bosqichda)
│       ├── src/
│       │   ├── config/           # env validatsiya (zod), JWT kalitlari
│       │   ├── common/           # xatolar, filter, interceptor, guard, util
│       │   ├── infra/            # PostgreSQL (Kysely), Redis, migrator
│       │   └── modules/          # auth · users · sms · reference · health
│       └── test/                 # e2e testlar
├── db/
│   ├── migrations/       # ✅ SQL — yagona haqiqat manbai
│   └── seeds/            # ✅ viloyat, tuman, transport turlari, tariflar
├── docs/                 # ✅ 13 ta hujjat
├── docker-compose.yml    # ✅ postgres+postgis, redis, minio, adminer
│
│   # keyingi bosqichlarda:
├── apps/worker/          # BullMQ consumerlar (matching, notification, payout)
├── apps/admin-web/       # React admin SPA
├── apps/mobile/          # Flutter (klient + haydovchi bitta ilovada)
├── packages/contracts/   # API ↔ admin umumiy TS tiplar
├── services/ai-matching/ # FastAPI (V2)
└── infra/                # k8s, terraform
```
