# 10 — Xavfsizlik arxitekturasi

**Maqsad:** OWASP ASVS Level 2. Har bir talab test bilan tekshiriladi.

## 10.1. Autentifikatsiya

| Chora | Amalga oshirish |
|---|---|
| SMS OTP | 6 raqam, `crypto.randomInt`, DB'da faqat SHA-256(kod+pepper), TTL 5 daq |
| OTP brute-force | 5 xato urinish → kod bekor, raqam 15 daqiqaga qulflanadi |
| OTP flood | 1/60 s · 3/soat/raqam · 10/kun/IP · 50/kun/subnet |
| SIM-swap xavfi | Yangi qurilmadan kirishda eski qurilmaga push ogohlantirish; telefon raqamini o'zgartirishda 24 soat "sovish" davri (bu davrda pul yechib bo'lmaydi) |
| Access token | JWT **RS256** (asimmetrik — verifikatsiya kaliti servislarga tarqatiladi, imzo kaliti faqat auth'da), 15 daqiqa |
| Refresh token | 256-bit opaque, DB'da hash, **rotation** + reuse detection |
| Bir zumda bekor qilish | `users.token_version` — bloklashda barcha token kuchsizlanadi |
| Admin | Argon2id (m=64MB, t=3, p=4) + majburiy TOTP 2FA |

## 10.2. Avtorizatsiya

Uch qatlamli:
1. **Rol:** `@Roles('DRIVER')` — endpoint darajasi.
2. **Huquq:** `@RequirePermission('docs.verify')` — admin uchun granular.
3. **Resurs egaligi:** har bir `:id` bo'yicha so'rovda foydalanuvchi shu
   resursga aloqadorligi tekshiriladi (IDOR himoyasi).

```ts
// IDOR — eng ko'p uchraydigan va eng jiddiy zaiflik
async getOrder(orderId: string, userId: string) {
  const order = await this.repo.findOne({ where: { id: orderId } });
  if (!order) throw new NotFoundException('ORDER_NOT_FOUND');
  if (order.shipperId !== userId && order.driverId !== userId) {
    // 403 emas, 404 — resurs mavjudligini ham oshkor qilmaymiz
    throw new NotFoundException('ORDER_NOT_FOUND');
  }
  return order;
}
```

Bu tekshiruv **avtomatik testda** har bir endpoint uchun majburiy:
"boshqa foydalanuvchi tokeni bilan 404/403 qaytishi kerak".

## 10.3. Ma'lumotlar himoyasi

| Ma'lumot | Himoya |
|---|---|
| Pasport, PINFL, guvohnoma raqami | **AES-256-GCM**, kalit env/KMS'da, DB'da emas |
| Parollar (admin) | Argon2id |
| Refresh token, OTP | SHA-256 hash |
| Karta ma'lumotlari | **Hech qachon saqlanmaydi** — faqat PSP tokeni va mask |
| Hujjat fayllari | S3 **private** bucket, presigned URL 5 daqiqa, bucket public access butunlay o'chirilgan |
| Transport (tarmoq) | TLS 1.3, HSTS, mobil ilovada **certificate pinning** |
| DB | Disk shifrlash (at-rest), ulanish TLS bilan |
| Backup | Shifrlangan, alohida hududda nusxa |
| Loglar | Telefon, token, pasport avtomatik **maskalanadi** (log redaction) |

## 10.4. Kirish nazorati va tarmoq

- API `/v1/*` — faqat WAF/reverse proxy orqali; app port'lar tashqaridan yopiq.
- DB va Redis — **private subnet**, ommaviy IP yo'q, faqat app SG'dan ulanish.
- Admin panel — alohida subdomen, ixtiyoriy IP allowlist.
- SSH — faqat kalit, parol o'chirilgan, bastion host orqali.
- Secretlar — Vault / Doppler / SOPS; `.env` **hech qachon** git'ga tushmaydi
  (`gitleaks` pre-commit hook + CI'da secret scanning).

## 10.5. Rate limiting va DoS

| Qatlam | Chora |
|---|---|
| Nginx | Umumiy: 100 req/min/IP, burst 20 |
| App (Redis) | Endpoint bo'yicha: `/auth/otp/request` 3/soat, `/loads` POST 20/soat, qidiruv 60/min |
| WebSocket | Ulanish 5/min/IP, `location:update` 1/5s, `chat:message` 10/10s |
| Fayl | Max 20 MB, MIME va **magic bytes** tekshiruvi, faqat `image/*` va `application/pdf` |
| DB | `statement_timeout = 10s`, connection pool limiti |
| Og'ir so'rovlar | Hisobotlar faqat read-replica'dan, navbat orqali |

## 10.6. Kirish validatsiyasi

- **Har bir DTO — Zod / class-validator sxemasi.** Sxemasiz endpoint mavjud emas
  (CI'da lint qoidasi bilan tekshiriladi).
- Whitelist rejim: sxemada yo'q maydonlar **tashlab yuboriladi** (mass assignment himoyasi).
- SQL injection: faqat parametrlangan so'rovlar / ORM. Raw SQL — code review'da alohida tasdiq.
- XSS: admin panelda `dangerouslySetInnerHTML` taqiqlangan (ESLint qoidasi);
  foydalanuvchi matni har doim escape qilinadi.
- Fayl nomi: hech qachon foydalanuvchidan olinmaydi — UUID generatsiya qilinadi
  (path traversal himoyasi).
- Telefon, davlat raqami, STIR — regex + biznes tekshiruv.

## 10.7. Anti-fraud

| Xavf | Aniqlash | Chora |
|---|---|---|
| **Soxta GPS** (mock location) | Android `isFromMockProvider`, tezlik > 200 km/h, "sakrash" (2 nuqta orasi fizik imkonsiz) | Flag + admin tekshiruvi, takrorlansa bloklash |
| **Ko'p akkaunt** (multi-accounting) | Bitta `device_id`/IP'da ko'p raqam, o'xshash hujjat hash'i | Ro'yxatdan o'tish bloklanadi, qurilma qora ro'yxatga |
| **Soxta hujjat** | Qo'lda verifikatsiya + `checksum` bo'yicha dublikat qidirish | Rad etish + qora ro'yxat |
| **Reyting manipulyatsiyasi** | Bir xil juftlik orasida ko'p "buyurtma", g'ayritabiiy baho naqshi | Reyting hisobga olinmaydi, tekshiruv |
| **To'lovni chetlab o'tish** | Buyurtma `CONFIRMED` dan keyin darhol bekor + shu juftlik takror | Xulq-atvor skori, jarima |
| **Yuk o'g'irligi** | Buyurtma qiymati yuqori + yangi haydovchi + hujjat zaif | Yuqori qiymatli yuklarga faqat ⭐4.5+ va 20+ buyurtmali haydovchi |
| **Chargeback/qaytarish suiiste'moli** | Bir foydalanuvchida ko'p refund | Qo'lda ko'rib chiqish |

**Xulq-atvor skori (`trust_score`)** har bir foydalanuvchi uchun kunlik
hisoblanadi: hujjat holati, buyurtma tarixi, bekor qilish, shikoyatlar,
to'lov intizomi. Past skor → limitlar (yuqori qiymatli yuk yo'q, kuniga
kamroq offer).

## 10.8. Monitoring va incident response

- **Sentry** — xatolar, release tracking, mobil crash'lar (crash-free ≥ 99.5%).
- **Prometheus alertlari:** xato foizi > 1%, p95 latency > 1 s, DB connection
  pool to'lgan, queue backlog > 1000, muvaffaqiyatsiz to'lovlar > 5%.
- **Xavfsizlik alertlari:** g'ayrioddiy login (yangi davlat/IP), 100+ 401 bir IP'dan,
  admin `impersonate` ishlatilishi, ommaviy eksport.
- **Incident runbook:** aniqlash → izolyatsiya (token bekor, IP blok) → tahlil →
  tiklash → **post-mortem (aybsiz)** → chora.
- Ma'lumot sizib chiqishi holatida: foydalanuvchilarni xabardor qilish tartibi
  va tartibga soluvchiga murojaat oldindan yozilgan bo'lishi kerak.

## 10.9. Maxfiylik va qonunchilik (O'zbekiston)

1. **Data localization:** O'zbekiston fuqarolarining shaxsiy ma'lumotlari
   O'zbekiston hududidagi serverlarda saqlanadi ("Shaxsga doir ma'lumotlar
   to'g'risida"gi qonun, ZRU-547 va 2021-yilgi o'zgartirishlar). Production DB,
   fayl storage va backup — **mahalliy DC**.
2. **Ma'lumotlar bazasi operatori sifatida ro'yxatdan o'tish** talab qilinishi
   mumkin — yurist bilan aniqlashtiriladi.
3. **Rozilik:** ro'yxatdan o'tishda maxfiylik siyosati va foydalanish
   shartlariga aniq rozilik (checkbox, oldindan belgilangan emas).
4. **Joylashuv ma'lumoti:** alohida tushuntirish — "faol buyurtma vaqtida
   joylashuvingiz yuk beruvchiga ko'rinadi". Buyurtmadan tashqarida yuqori
   chastotali kuzatuv yo'q.
5. **Saqlash muddatlari:** GPS treklari 90 kun (keyin arxiv), chat 1 yil,
   moliyaviy hujjatlar qonun talabi bo'yicha (odatda 5 yil).
6. **Akkauntni o'chirish huquqi:** ilova ichida tugma; shaxsiy ma'lumot
   anonimlashtiriladi, moliyaviy yozuvlar qonuniy muddatgacha saqlanadi.
7. **App Store / Google Play talablari:** Privacy Policy URL, Data Safety
   formasi, background location uchun alohida asoslash va demo video —
   bu **relizni kechiktiradigan eng keng tarqalgan sabab**, oldindan tayyorlanadi.

## 10.10. Xavfsiz ishlab chiqish jarayoni (SDLC)

| Bosqich | Chora |
|---|---|
| Kod | Majburiy code review (min 1 approve), `main` branch himoyalangan |
| CI | ESLint + `npm audit` + Snyk/Dependabot + `gitleaks` + SAST (Semgrep) |
| Test | Xavfsizlik testlari: IDOR, rate limit, JWT manipulyatsiyasi |
| Deploy | Immutable image, rollback 1 buyruq bilan |
| Prod | Har chorakda **penetration test** (tashqi jamoa), yiliga bir marta to'liq audit |
| Bog'liqliklar | Oyiga bir marta yangilash, kritik CVE — 48 soat ichida |

## 10.11. Backup va tiklanish

| Element | Chastota | Saqlash | RPO / RTO |
|---|---|---|---|
| PostgreSQL full | Kunlik | 7 kun / 4 hafta / 12 oy | RPO 5 daq (WAL), RTO 1 soat |
| WAL archiving | Uzluksiz | 7 kun | PITR (istalgan nuqtaga tiklash) |
| S3 fayllar | Versioning + cross-region | 90 kun | RTO 15 daq |
| Redis | RDB snapshot 1 soat | 24 soat | Yo'qolishi mumkin (cache) |
| Konfiguratsiya | Git (IaC) | Cheksiz | RTO 30 daq |

**Har chorakda tiklanish mashqi:** backup'dan to'liq muhit ko'tariladi va
ishlashi tekshiriladi. Tiklanmagan backup — backup emas.
