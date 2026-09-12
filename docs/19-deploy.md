# 19. Ishlab chiqarishga chiqarish, zaxira nusxa va nosozliklar

> MVP uchun bitta server va Docker Compose. Kubernetes keyinroq — trafik
> bitta serverdan oshganda (docs/04-architecture.md).

## 19.1 Tuzilma

```
                 Internet
                    │ 80/443 (faqat shu ikki port ochiq)
               ┌────┴────┐
               │  Caddy  │  TLS (Let's Encrypt), HSTS, gzip/zstd
               └─┬──┬──┬─┘
   api.karvon.uz │  │  │ files.karvon.uz
        ┌────────┘  │  └──────────┐
        ▼           ▼             ▼
     ┌─────┐   ┌───────┐     ┌───────┐
     │ API │   │ Admin │     │ MinIO │  imzolangan havola orqali
     └──┬──┘   └───────┘     └───────┘  to'g'ridan-to'g'ri yuklash
        │ admin.karvon.uz (nginx, statik SPA)
        ├──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼
   ┌─────────┐ ┌───────┐ ┌────────┐ ┌────────┐
   │Postgres │ │ Redis │ │  OSRM  │ │ backup │ har kuni 02:00 (Toshkent)
   │+PostGIS │ │       │ │marshrut│ │pg_dump │
   └─────────┘ └───────┘ └────────┘ └────────┘
        ichki tarmoq — portlar hostga chiqarilmaydi
```

| Fayl | Vazifa |
|---|---|
| `docker-compose.prod.yml` | Barcha xizmatlar |
| `deploy/Caddyfile` | Domenlar, TLS, proksi |
| `.env.production.example` | Sozlamalar namunasi (`.env.production` — gitda yo'q) |
| `apps/api/Dockerfile`, `apps/admin/Dockerfile` | Tasvirlar (CI har push'da yig'ib sinaydi) |
| `scripts/deploy.sh` · `rollback.sh` | Chiqarish va qaytarish |
| `scripts/backup-db.sh` · `restore-db.sh` | Zaxira va tiklash |
| `scripts/osrm-prepare.sh` | Marshrut ma'lumotlari |
| `scripts/generate-secrets.sh` | Maxfiy qiymatlar |

## 19.2 Server

- **Joylashuv — O'zbekiston hududida** (ZRU-547: fuqarolarning shaxsiy
  ma'lumotlari mahalliy serverda). UZINFOCOM, Uzcloud yoki mahalliy DC.
  Yakuniy tasdiq — yurist.
- **Minimal (MVP):** 4 vCPU, 8 GB RAM, 100 GB SSD. OSRM tayyorlashda
  vaqtincha 4+ GB RAM kerak.
- **OT:** Ubuntu 24.04 LTS, Docker Engine 24+ va `docker compose` plagini.
- **Tarmoq:** 80 va 443 hammaga, 22 (SSH) — faqat ma'mur IP manzilidan.

### Server xavfsizligi (bir martalik)

```bash
# Faqat kalit bilan SSH, root orqali kirish yo'q
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

sudo ufw default deny incoming
sudo ufw allow from <MA'MUR_IP> to any port 22
sudo ufw allow 80,443/tcp
sudo ufw allow 443/udp
sudo ufw enable

sudo apt install -y unattended-upgrades fail2ban
```

> Docker o'z portlarini `ufw` ni chetlab ochadi. Shuning uchun
> `docker-compose.prod.yml` da faqat Caddy portlari e'lon qilingan —
> Postgres, Redis, MinIO va OSRM uchun `ports:` YO'Q, bu ataylab.

## 19.3 Birinchi o'rnatish

1. **Kod va sozlamalar**
   ```bash
   git clone https://github.com/<egasi>/<repo>.git /opt/karvon && cd /opt/karvon
   cp .env.production.example .env.production && chmod 600 .env.production
   bash scripts/generate-secrets.sh     # chiqqan qatorlarni .env.production ga
   ```
   Qolgan `CHANGE_ME` lar: `ACME_EMAIL`, `ESKIZ_EMAIL`/`ESKIZ_PASSWORD`.
   Ixtiyoriylar (bo'sh — o'chirilgan): Firebase (push), Yandex geokoder,
   Click/Payme.

2. **DNS** — uchala domenning A yozuvi server IP manziliga:
   `api.`, `admin.`, `files.`. Caddy sertifikatni birinchi so'rovda oladi.

3. **Marshrut ma'lumotlari** (10–30 daqiqa, bir marta):
   ```bash
   bash scripts/osrm-prepare.sh
   ```

4. **Chiqarish:**
   ```bash
   bash scripts/deploy.sh
   ```
   Skript tasvirlarni yig'adi, migratsiya va spravochnikni qo'llaydi,
   `/health/ready` yashil bo'lishini kutadi.

5. **Birinchi administrator** (TOTP kaliti chiqadi — Authenticator'ga
   darhol kiriting, qayta ko'rsatilmaydi):
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml \
     run --rm api node dist/scripts/create-admin.js \
     --email=... --password='...' --name='...'
   ```

6. **To'lov tizimlari** — merchant kabinetlarida webhook manzillari:
   | Tizim | Manzil |
   |---|---|
   | Click — Prepare | `https://api.karvon.uz/v1/payments/webhook/click/prepare` |
   | Click — Complete | `https://api.karvon.uz/v1/payments/webhook/click/complete` |
   | Payme | `https://api.karvon.uz/v1/payments/webhook/payme` |

7. **Mobil ilova** production manzillari bilan yig'iladi (README →
   "Mobil ilovani yig'ish").

8. **Tekshiruv ro'yxati:**
   - [ ] `curl https://api.karvon.uz/health/ready` → `"status":"ok"`
   - [ ] `https://api.karvon.uz/docs` → 404 (prodda Swagger yopiq)
   - [ ] Admin panelga kirish (parol + TOTP)
   - [ ] Haqiqiy raqamga SMS kod keladi
   - [ ] Mobil ilovada ro'yxatdan o'tish, yuk e'loni, hujjat yuklash
   - [ ] `backups/` da ertasi kuni zaxira fayli paydo bo'ldi

## 19.4 Yangilash

```bash
cd /opt/karvon && git pull && bash scripts/deploy.sh
```

Har chiqarishda: yangi tasvir **git SHA tegi** bilan yig'iladi (eskisi
serverda qoladi), migratsiyadan **oldin** zaxira olinadi, migratsiya bir
marta bajariladi.

**Migratsiya qoidasi — orqaga mos yozish.** Migratsiyalar faqat oldinga
yuradi (`down` yo'q). Shuning uchun:
- ustun avval **qo'shiladi** (nullable yoki standart qiymat bilan), kod uni
  ishlata boshlaydi; eski ustun keyingi relizda o'chiriladi;
- ustun nomini bir relizda o'zgartirmang — qo'shing, ko'chiring, keyin o'chiring;
- qo'llangan migratsiya faylini tahrirlamang — migrator nazorat summasini
  tekshiradi va ishga tushmaydi.

## 19.5 Qaytarish

```bash
bash scripts/rollback.sh            # oldingi versiyaga
bash scripts/rollback.sh a1b2c3d    # aniq versiyaga
```

Faqat tasvirlar qaytadi. Migratsiya orqaga mos yozilgan bo'lsa (19.4) bu
yetarli. Aks holda — bazani chiqarishdan oldingi zaxiradan tiklash (19.6).
Eski tasvirlarni o'chirmang: `docker image prune` faqat tegsizlarini
o'chiradi, `docker image prune -a` esa qaytish imkonini yo'q qiladi.

## 19.6 Zaxira nusxa va tiklash

**Avtomatik:** `backup` xizmati har kuni 02:00 (Toshkent) da
`backups/karvon-<sana>.dump` yaratadi, arxiv o'qilishini va nazorat
summasini tekshiradi, 14 kundan eskisini o'chiradi.

**Qo'lda:**
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec backup bash /scripts/backup-db.sh
```

**Serverdan tashqariga nusxa — MAJBURIY.** Server yoki disk yo'qolsa,
o'sha serverdagi zaxira ham yo'qoladi. Boshqa data-markazdagi omborga
kunlik nusxa (masalan `rclone`), shifrlangan holda:
```bash
# crontab: 03:30 da oxirgi zaxirani ikkinchi joyga
30 3 * * * rclone copy /opt/karvon/backups remote:karvon-backups --max-age 26h
```

**Fayllar (MinIO)** — hujjatlar va rasmlar bazada emas:
```bash
docker run --rm --network karvon_default -v /opt/karvon/backups/files:/out \
  minio/mc sh -c 'mc alias set k http://minio:9000 karvon "$S3_SECRET_KEY" && mc mirror --overwrite k/karvon /out'
```

**Tiklash:**
```bash
bash scripts/restore-db.sh backups/karvon-20260912-210000.dump
```

**Tiklash mashqi — oyiga bir marta.** Tekshirilmagan zaxira — umid, reja
emas. Vaqtinchalik konteynerga tiklab, jadvallar sonini solishtiring:
```bash
docker run -d --name restore-test -e POSTGRES_PASSWORD=t postgis/postgis:16-3.4
docker cp backups/<oxirgi>.dump restore-test:/tmp/b.dump
docker exec restore-test sh -c 'sleep 5; createdb -U postgres k && pg_restore -U postgres -d k --no-owner /tmp/b.dump'
docker exec restore-test psql -U postgres -d k -c 'select count(*) from users'
docker rm -f restore-test
```

## 19.7 Kuzatuv

| Nima | Qanday |
|---|---|
| API tirikmi | `GET /health` — jarayon javob beradi |
| API ishga tayyormi | `GET /health/ready` — baza va Redis bilan (503 = yo'q) |
| Tashqi kuzatuv | UptimeRobot / Better Stack: `/health/ready` har 1 daqiqada, SMS/Telegram ogohlantirish |
| Xizmatlar holati | `docker compose ... ps` |
| Loglar | `docker compose ... logs -f --tail=100 api` (JSON, pino) |
| Disk | 80% dan oshsa ogohlantirish: `df -h`, `docker system df` |
| Zaxira | eng oxirgi `backups/*.dump` 26 soatdan yosh bo'lishi kerak |

## 19.8 Nosozliklar — nima qilish kerak

**API javob bermayapti (502 / tashqi kuzatuv qizil)**
1. `docker compose ... ps` — qaysi xizmat `unhealthy` yoki qayta yuklanmoqda.
2. `docker compose ... logs --tail=200 api` — ishga tushishdagi xato
   (ko'pincha "Muhit o'zgaruvchilari noto'g'ri" — qaysi kalit ekani yozilgan).
3. Oxirgi chiqarishdan keyin boshlangan bo'lsa — `bash scripts/rollback.sh`.

**`/health/ready` = 503** — baza yoki Redis yo'q:
`docker compose ... logs postgres redis`. Disk to'lganmi: `df -h`.

**Disk to'ldi** — birinchi navbatda eski loglar va tasvirlar:
`docker system df`, `docker image prune` (tegsizlari), eski zaxiralar
serverdan tashqariga ko'chirilganiga ishonch hosil qilib `backups/`.

**SMS kelmayapti** — `logs api | grep SMS`. Eskiz balansi va jo'natuvchi
nomi (`KARVON`) tasdiqlanganini kabinetda tekshiring. Vaqtinchalik
chora yo'q: SMS'siz ro'yxatdan o'tib bo'lmaydi — foydalanuvchilarga
xabar bering.

**To'lov webhook'lari yiqilmoqda** — admin panel → Audit, va
`logs api | grep webhook`. Imzo xatosi — `.env.production` dagi kalit
merchant kabinetidagi bilan mosligini tekshiring. Pul yechilgan, lekin
hamyonga tushmagan to'lovlar admin panelda "Kutilmoqda" holatida qoladi —
ular PSP bilan solishtirilgach qo'lda yakunlanadi.

**Token o'g'irlanganiga shubha** (masalan, JWT kaliti fosh bo'ldi):
1. `bash scripts/generate-secrets.sh` — faqat `JWT_PRIVATE_KEY` va
   `JWT_PUBLIC_KEY` ni almashtiring.
2. `bash scripts/deploy.sh` — barcha sessiyalar bekor bo'ladi, hamma
   qaytadan kiradi. Admin tokenlari uchun — `ADMIN_JWT_SECRET`.
3. Bitta foydalanuvchi uchun: admin panel → foydalanuvchi → "Bloklash"
   (barcha tokenlari darhol kuchsizlanadi).

**`FIELD_ENCRYPTION_KEY` ni almashtirmang** — eski kalit bilan shifrlangan
maydonlar o'qilmay qoladi. Almashtirish faqat qayta shifrlash migratsiyasi
bilan.

**Sertifikat olinmayapti** — `logs caddy`: DNS A yozuvi serverga
qaraydimi va 80-port ochiqmi (Let's Encrypt HTTP tekshiruvi).

## 19.9 Faqat egasi bajaradigan ishlar

Bu qadamlar shaxsiy hisob, shartnoma yoki to'lovni talab qiladi:

- [ ] O'zbekistondagi server (DC shartnomasi) va domen (`karvon.uz`)
- [ ] Eskiz.uz shartnomasi va jo'natuvchi nomi tasdig'i
- [ ] Click va Payme merchant shartnomalari, webhook manzillari (19.3)
- [ ] Firebase loyihasi (push) va service account kaliti
- [ ] Yandex geokoder API kaliti
- [ ] Google Play va App Store dasturchi hisoblari, ilova imzolash kaliti
- [ ] Maxfiylik siyosati va foydalanish shartlarini yurist tasdig'i
- [ ] Serverdan tashqari zaxira ombori (`rclone` manzili)
- [ ] Tashqi kuzatuv xizmati va ogohlantirish qabul qiluvchilari
