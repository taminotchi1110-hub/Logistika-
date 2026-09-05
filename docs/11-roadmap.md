# 11 — Development Roadmap

## 11.1. Jamoa tarkibi

| Rol | Soni | Bosqich | Mas'uliyat |
|---|---|---|---|
| Tech Lead / Arxitektor | 1 | 0-oydan | Arxitektura, code review, kritik modullar |
| Backend (NestJS) | 2 | 0-oydan | API, matching, to'lov, tracking |
| Flutter dasturchi | 2 | 1-oydan | Mobil ilova (klient + haydovchi) |
| Frontend (React) | 1 | 2-oydan | Admin panel |
| UI/UX dizayner | 1 | 0–4 oy (keyin part-time) | Figma, design system, test |
| QA muhandis | 1 | 2-oydan | Test rejasi, avtomatlashtirish, reliz |
| DevOps | 0.5 | 0-oydan | Infra, CI/CD, monitoring, backup |
| Product Manager | 1 | 0-oydan | Talablar, prioritet, metrikalar |
| **Jami** | **~9.5** | | |

Operatsion jamoa (launch'ga 1 oy qolganda): 2 support operatori,
2 verifikatsiya moderatori, 2–3 dala agenti (haydovchi jalb qilish).

## 11.2. Sprintlar (2 haftalik)

### Sprint 0 — Fundament (2 hafta)
- Monorepo (Turborepo/Nx), lint/prettier/husky, commit konvensiyasi
- Docker Compose: postgres+postgis, redis, minio, osrm, mailhog
- CI/CD skeleti, dev muhit
- DB migratsiyalari + seed (viloyat, tuman, transport turlari)
- NestJS skeleti: config, logger (pino), error filter, OpenAPI, health-check
- Flutter skeleti: routing (go_router), state (riverpod), i18n, design tokens
- **Natija:** "hello world" prod pipeline'dan o'tadi

### Sprint 1–2 — Auth va profil (4 hafta)
- OTP oqimi (Eskiz integratsiyasi), JWT + refresh rotation, sessiyalar
- Rol tanlash, klient va haydovchi profillari
- Transport CRUD, hujjat yuklash (S3 presigned)
- Mobil: splash, onboarding, login, OTP, rol, profil wizard
- **Demo:** ro'yxatdan o'tib, transport qo'shib, hujjat yuklash mumkin

### Sprint 3–4 — Yuk va lenta (4 hafta)
- Spravochnik API + cache, geo servis (geocoding, OSRM proxy)
- Yuk CRUD, e'lon qilish, muddat tugashi (cron)
- Lenta: filter, sort, cursor pagination
- Mobil: yuk yaratish wizard (4 qadam), lenta, yuk tafsilotlari, filter sheet
- **Demo:** klient yuk joylashtiradi, haydovchi lentada ko'radi

### Sprint 5–6 — Matching va offerlar (4 hafta)
- Matching worker: hard filter + score, Redis GEO, `load_matches`
- Offer oqimi (yuborish, qabul, rad, TTL)
- Buyurtma yaratish (atomik: offer accept → order + boshqa offerlar reject)
- Push (FCM) va in-app bildirishnomalar
- Mobil: "haydovchilar topilmoqda", offerlar ro'yxati, taqqoslash, tanlash
- **Demo:** to'liq zanjir e'londan buyurtmagacha

### Sprint 7–8 — Tracking va chat (4 hafta)
- WebSocket gateway, Redis adapter, room modeli
- GPS ingest + batch flush, ETA hisoblash, geofence
- Order state machine, status tarixi, POP/POD
- Chat: xabar, fayl, o'qildi, offline push
- Mobil: live tracking xarita, status tugmalari, chat, background location
- **Demo:** buyurtma boshidan oxirigacha, xaritada kuzatiladi

### Sprint 9 — To'lov va reyting (2 hafta)
- Ledger, hamyon, komissiya yechish, Payme/Click topup
- Reyting (double-blind), sharhlar, shikoyat
- Mobil: hamyon, tranzaksiyalar, baholash modali
- **Demo:** yakunlangan buyurtmadan komissiya avtomatik yechiladi

### Sprint 10 — Admin panel (2 hafta)
- Auth + RBAC + audit, dashboard, foydalanuvchilar, verifikatsiya navbati
- Buyurtma monitoringi, shikoyatlar, sozlamalar, moliya
- **Demo:** operator ish boshlashi mumkin

### Sprint 11 — Barqarorlashtirish (2 hafta)
- Bug fixing, yuklama testi (k6), sekin so'rovlarni optimallashtirish
- Xavfsizlik testi (IDOR, rate limit, JWT), pentest tavsiyalarini bajarish
- Monitoring, alertlar, backup mashqi
- 3 tilga to'liq tarjima va tekshiruv

### Sprint 12 — Reliz (2 hafta)
- Store hisoblari, Privacy Policy, Data Safety, screenshotlar, ASO
- Closed beta (50 haydovchi + 30 klient), fikr-mulohaza
- Prod infra, monitoring, on-call jadval
- **Yopiq launch: Toshkent**

**MVP jami: ~28 hafta (7 oy)** Sprint 0 bilan birga.
Agressiv (parallel ishlash, tayyor komponentlar): **5 oy**.
Konservativ (integratsiya kechikishlari bilan): **9 oy**.

## 11.3. MVP'dan keyin

| Chorak | Fokus |
|---|---|
| Q+1 | Escrow, avtomatik payout, karta biriktirish, **backhaul (qaytish yuki)** |
| Q+2 | Korporativ tarif, API, ko'p nuqtali marshrut, park egasi rejimi, live map |
| Q+3 | AI matching (ML ranker), narx bashorati, ETA modeli, fraud detection |
| Q+4 | Xalqaro yo'nalishlar (KZ/RU), sug'urta hamkorligi, faktoring |

## 11.4. Risklar va ularni kamaytirish

| Risk | Ehtimol | Ta'sir | Chora |
|---|---|---|---|
| **Liquidity yig'ilmaydi** (haydovchi yoki yuk yetishmaydi) | Yuqori | Kritik | Bir koridorga fokus, 0% komissiya, dala agentlari, concierge MVP |
| To'lov integratsiyasi kechikadi | O'rta | Yuqori | MVP naqd bilan ishlaydi — to'lov kritik yo'lda emas |
| Escrow uchun huquqiy to'siq | Yuqori | O'rta | V2 ga qoldirilgan, bank hamkorligi oldindan boshlanadi |
| App Store background location rad etadi | O'rta | Yuqori | Oldindan asoslash matni + demo video, GPS faqat faol buyurtmada |
| Komissiyani chetlab o'tish | Yuqori | Yuqori | Kontakt yashirish, platforma qiymatini oshirish, obuna modeliga zaxira reja |
| Raqobatchi (yirik o'yinchi) kirishi | O'rta | Yuqori | Tezlik, haydovchi bilan munosabat, backhaul funksiyasi |
| Ma'lumot lokalizatsiyasi talabi | O'rta | O'rta | Boshidan mahalliy DC tanlash |
| Kadr yetishmasligi (Flutter/NestJS) | O'rta | O'rta | Erta yollash, outsource zaxira |
| GPS/tarmoq sifatlari (viloyatlarda) | Yuqori | O'rta | Offline bufer, past chastota rejimi, SMS fallback |

## 11.5. Launch mezonlari (Definition of Ready for Launch)

- [ ] 100% MVP funksiyalari qabul testidan o'tgan
- [ ] Test qamrovi: domen logikasi ≥ 85%, E2E kritik oqimlar 100%
- [ ] Yuklama testi: 500 RPS, 2000 parallel WS, p95 < 300 ms
- [ ] Xavfsizlik: IDOR/rate-limit/JWT testlari o'tgan, kritik CVE yo'q
- [ ] Backup tiklash mashqi muvaffaqiyatli
- [ ] Monitoring, alert, on-call jadvali tayyor
- [ ] 3 til to'liq (native speaker tekshirgan)
- [ ] Privacy Policy, Foydalanish shartlari, Ommaviy oferta yurist tasdiqlagan
- [ ] Store listinglar tayyor (screenshot, video, ASO)
- [ ] Support jamoasi o'qitilgan, FAQ va skriptlar tayyor
- [ ] Beta'da 50+ real buyurtma muvaffaqiyatli yakunlangan
- [ ] Rollback rejasi va incident runbook yozilgan

## 11.6. Byudjet (taxminiy, oylik)

| Modda | Oylik (USD) | Izoh |
|---|---|---|
| Jamoa (9.5 kishi) | 18 000 – 30 000 | Mintaqaviy stavkalarga qarab |
| Infra (dev+staging+prod) | 400 – 900 | VPS, DB, S3, CDN |
| SMS (Eskiz) | 300 – 1 500 | Hajmga bog'liq, ~50–80 so'm/SMS |
| Xarita (Yandex MapKit) | 0 – 500 | Limitgacha bepul; OSRM o'zimizda |
| Firebase, Sentry, monitoring | 100 – 300 | |
| Store (Apple $99/yil, Google $25) | ~10 | |
| Yuridik, buxgalteriya | 500 – 1 500 | Shartnomalar, litsenziya |
| Marketing (launch) | 3 000 – 10 000 | Dala agentlari, bonuslar, reklama |
| **Jami (MVP davri)** | **~22 000 – 45 000/oy** | 7 oy ≈ **150 000 – 300 000 USD** |

> Bu diapazon jamoa joylashuvi va ish shakliga (shtat/autsors) juda bog'liq.
> Aniq raqam Sprint 0 dan keyin, jamoa yakunlangach qayta hisoblanadi.
