# 02 — To'liq funksiyalar ro'yxati

Belgilar: **M** = MVP (1-reliz), **V2** = 2-reliz (3–6 oy), **V3** = keyingi (6–12 oy)

## A. Autentifikatsiya va profil

| Kod | Funksiya | Bosqich |
|---|---|---|
| A-01 | Telefon (+998) orqali ro'yxatdan o'tish, 6 xonali SMS OTP | M |
| A-02 | OTP qayta yuborish taymeri (60s), urinishlar limiti (3/soat) | M |
| A-03 | Rol tanlash: Yuk beruvchi / Haydovchi (bitta akkauntda ikkalasi ham) | M |
| A-04 | JWT access (15 daq) + refresh (30 kun, rotating) | M |
| A-05 | Profil: ism, familiya, avatar, tug'ilgan sana, til | M |
| A-06 | Kompaniya profili: nomi, STIR (INN), manzil, bank rekvizit | M |
| A-07 | Pasport/ID va haydovchilik guvohnomasi yuklash + admin verifikatsiyasi | M |
| A-08 | Verifikatsiya badge: "Tasdiqlangan haydovchi" | M |
| A-09 | Sessiyalar ro'yxati + "Barcha qurilmalardan chiqish" | V2 |
| A-10 | Biometrik kirish (Face ID / barmoq izi) | V2 |
| A-11 | Telegram / Google orqali kirish | V3 |
| A-12 | E-IMZO (ERI) bilan korporativ kirish | V3 |

## B. Transport va park

| Kod | Funksiya | Bosqich |
|---|---|---|
| B-01 | Mashina qo'shish: marka, model, yil, davlat raqami | M |
| B-02 | Transport turi (Damas…Scania), kuzov turi (tent/ref/izoterm/ochiq/samosval) | M |
| B-03 | Yuk ko'tarish quvvati (t), hajm (m³), uzunlik/eni/balandligi (m) | M |
| B-04 | Tirkama mavjudligi va tirkama parametrlari | M |
| B-05 | Texpasport + sug'urta hujjatlarini yuklash | M |
| B-06 | Mashina fotosuratlari (kamida 3 ta) | M |
| B-07 | Bo'sh / Band / Offline holati (bitta tugma bilan almashtirish) | M |
| B-08 | Ishlaydigan yo'nalishlar (viloyatlar juftligi yoki radius) | M |
| B-09 | Bir nechta mashina + bir nechta haydovchi (park egasi rejimi) | V2 |
| B-10 | Texko'rik / sug'urta muddati tugashi haqida ogohlantirish | V2 |
| B-11 | ADR (xavfli yuk) ruxsatnomasi, TIR Carnet, CMR sug'urtasi | V3 |

## C. Yuk (Load) e'loni

| Kod | Funksiya | Bosqich |
|---|---|---|
| C-01 | Yuk nomi, kategoriya, tavsif | M |
| C-02 | Og'irlik (kg/t), hajm (m³), o'ram soni va turi (palet/qop/quti/bochka) | M |
| C-03 | Olish va yetkazish manzili (xaritadan pin + avtokomplit) | M |
| C-04 | Ko'p nuqtali marshrut (2+ olish yoki tushirish nuqtasi) | V2 |
| C-05 | Yuklash sanasi va vaqt oynasi (masalan 10:00–14:00) | M |
| C-06 | Kerakli transport turi + kuzov turi | M |
| C-07 | Maxsus talablar: gruzchik, gidrobort, temperatura rejimi, ramp | M |
| C-08 | Narx: belgilangan yoki kelishuv asosida ("torg bor") | M |
| C-09 | To'lov turi: naqd, karta, o'tkazma, escrow | M |
| C-10 | Yuk rasmi (5 tagacha) + hujjat (PDF) | M |
| C-11 | Masofa va ETA avtomatik hisoblanishi (OSRM) | M |
| C-12 | Narx tavsiyasi (yo'nalish + transport turi bo'yicha bozor medianasi) | V2 |
| C-13 | Yukni takrorlash va shablonlar | V2 |
| C-14 | Muntazam yuk (har hafta dushanba kabi) | V3 |
| C-15 | Excel / API orqali ommaviy yuk yuklash (korporativ) | V3 |

## D. Matching va qidiruv

| Kod | Funksiya | Bosqich |
|---|---|---|
| D-01 | Hard filter (quvvat, hajm, kuzov, hujjat, status) | M |
| D-02 | Match Score 0–100% (masofa, marshrut, reyting, narx, tarix) | M |
| D-03 | Top-20 mos haydovchini avtomatik topish va push yuborish | M |
| D-04 | Haydovchi lentasi: yuklar ro'yxati + filter/sort | M |
| D-05 | Filter: qayerdan/qayerga, sana, og'irlik, hajm, narx, transport turi, masofa | M |
| D-06 | Xaritali qidiruv (yuklarni xaritada ko'rish) | V2 |
| D-07 | Saqlangan qidiruv + yangi mos yuk kelganda push | V2 |
| D-08 | **Bo'sh qaytish (backhaul):** qaytish yo'nalishida yuk taklifi | V2 |
| D-09 | ML-matching (haydovchi qabul qilish ehtimolini bashorat qilish) | V3 |
| D-10 | Yuk birlashtirish (LTL consolidation) | V3 |

## E. Buyurtma va tracking

| Kod | Funksiya | Bosqich |
|---|---|---|
| E-01 | Haydovchi so'rov (offer) yuboradi, o'z narxini taklif qiladi | M |
| E-02 | Klient offerlarni taqqoslaydi va tanlaydi | M |
| E-03 | 13 bosqichli order lifecycle (state machine) | M |
| E-04 | Har bir status o'zgarishi `order_status_history` da saqlanadi | M |
| E-05 | Live GPS tracking (faqat faol buyurtma vaqtida) | M |
| E-06 | Xaritada: olish nuqtasi, tushirish nuqtasi, haydovchi, marshrut | M |
| E-07 | Qolgan masofa + ETA (har 60 s yangilanadi) | M |
| E-08 | Yuk ortilganini foto bilan tasdiqlash (Proof of Pickup) | M |
| E-09 | Yetkazilganini foto + imzo bilan tasdiqlash (Proof of Delivery) | M |
| E-10 | Bekor qilish + sabab + jarima siyosati | M |
| E-11 | Buyurtmani ulashish havolasi (login talab qilmaydigan tracking link) | V2 |
| E-12 | Geofence: nuqtaga 2 km qolganda avtomatik "yaqinlashdi" statusi | V2 |
| E-13 | Yo'ldan chetga chiqishni (route deviation) aniqlash va ogohlantirish | V3 |

## F. Chat va bildirishnoma

| Kod | Funksiya | Bosqich |
|---|---|---|
| F-01 | Buyurtma ichidagi 1:1 chat (WebSocket) | M |
| F-02 | Matn, rasm, hujjat | M |
| F-03 | Audio xabar | V2 |
| F-04 | O'qildi/yetkazildi belgisi, typing indicator | M |
| F-05 | Telefon raqami buyurtma tasdiqlangunga qadar yashirin | M |
| F-06 | Ichki qo'ng'iroq (raqamni ko'rsatmasdan) — number masking | V3 |
| F-07 | Push (FCM) + in-app bildirishnoma markazi | M |
| F-08 | SMS fallback (push yetib bormasa, kritik hodisalarda) | V2 |
| F-09 | Bildirishnoma sozlamalari (kanal bo'yicha yoqish/o'chirish) | V2 |

## G. To'lov

| Kod | Funksiya | Bosqich |
|---|---|---|
| G-01 | Naqd to'lov rejimi (komissiya haydovchi hamyonidan yechiladi) | M |
| G-02 | Haydovchi hamyoni (wallet) + Click/Payme orqali to'ldirish | M |
| G-03 | Double-entry ledger (har bir tranzaksiya ikki yozuv) | M |
| G-04 | Komissiya foizi admin panelidan boshqariladi (global + segment) | M |
| G-05 | Tranzaksiya tarixi + PDF chek | M |
| G-06 | **Escrow:** klient to'laydi → platforma ushlab turadi → yetkazilgach haydovchiga | V2 |
| G-07 | Uzcard/Humo karta biriktirish (tokenizatsiya, PAN saqlanmaydi) | V2 |
| G-08 | Haydovchiga avtomatik payout (kartaga o'tkazma) | V2 |
| G-09 | Korporativ: bank o'tkazmasi, hisob-faktura, akt | V2 |
| G-10 | Soliq (didox / faktura.uz) EHF integratsiyasi | V3 |
| G-11 | Yoqilg'i karta / avans (fuel advance) | V3 |

## H. Reyting va ishonch

| Kod | Funksiya | Bosqich |
|---|---|---|
| H-01 | 1–5 yulduz, ikki tomonlama (klient ↔ haydovchi) | M |
| H-02 | Mezonlar: vaqtida yetkazish, muomala, yuk holati, ishonchlilik | M |
| H-03 | Matnli izoh + moderatsiya | M |
| H-04 | Double-blind reyting (ikkalasi baholaguncha ko'rinmaydi, 7 kun) | M |
| H-05 | Shikoyat (complaint) + admin tekshiruvi | M |
| H-06 | Reyting < 3.5 → avtomatik cheklov, < 3.0 → bloklash uchun flag | V2 |
| H-07 | Profil ko'rsatkichlari: bajarilgan buyurtma soni, javob tezligi, bekor qilish foizi | V2 |

## I. Hujjatlar

| Kod | Funksiya | Bosqich |
|---|---|---|
| I-01 | Hujjat saqlash (S3, private bucket, presigned URL) | M |
| I-02 | Turlari: pasport, guvohnoma, texpasport, sug'urta, yuk hujjati, TTN/CMR, POD | M |
| I-03 | Admin verifikatsiya oqimi (kutilmoqda → tasdiqlandi / rad etildi + sabab) | M |
| I-04 | Avtomatik shartnoma generatsiyasi (PDF, buyurtma ma'lumotlaridan) | V2 |
| I-05 | Elektron imzo (barmoq bilan chizish → rasm + SHA-256 hash) | V2 |
| I-06 | E-IMZO / ERI bilan huquqiy imzo | V3 |
| I-07 | OCR: pasport / texpasportdan ma'lumotni avtomatik o'qish | V3 |

## J. Admin

| Kod | Funksiya | Bosqich |
|---|---|---|
| J-01 | Dashboard: foydalanuvchilar, buyurtmalar, daromad, statistika | M |
| J-02 | Foydalanuvchi/haydovchi boshqaruvi (qidiruv, bloklash, verifikatsiya) | M |
| J-03 | Yuk va buyurtma monitoringi, qo'lda tayinlash (manual assign) | M |
| J-04 | Hujjat verifikatsiya navbati | M |
| J-05 | Shikoyat va nizolarni hal qilish | M |
| J-06 | To'lov/tranzaksiya monitoringi, refund | M |
| J-07 | Platforma sozlamalari: komissiya, radius, limitlar, tariflar | M |
| J-08 | Audit log (kim, nima, qachon, IP) | M |
| J-09 | RBAC: super-admin, moderator, support, finance, analitik | M |
| J-10 | Live map — barcha faol transportlar bitta xaritada | V2 |
| J-11 | Analitika: yo'nalish talabi, narx dinamikasi, cohort/retention | V2 |
| J-12 | Push kampaniya yuborish (segment bo'yicha) | V2 |

## K. Boshqa

| Kod | Funksiya | Bosqich |
|---|---|---|
| K-01 | 3 til: O'zbek (lotin), Rus, Ingliz | M |
| K-02 | Sevimlilar (favorite haydovchi/klient) va qora ro'yxat | M |
| K-03 | Saqlangan manzillar (uy, ombor, do'kon) | M |
| K-04 | Offline rejim: internet yo'qda GPS nuqtalari buferga, keyin sinxronizatsiya | V2 |
| K-05 | Referral dasturi (do'stni taklif qil → bonus) | V2 |
| K-06 | O'zbek kirill alifbosi | V2 |
| K-07 | Ochiq API + webhook (korporativ mijozlar uchun) | V3 |
| K-08 | Telegram bot (yuk e'lonlarini olish) | V2 |

---

## MVP chegarasi (Scope lock)

MVP'ga **kirmaydi** — bu ongli qaror, chunki ular liquidity muammosini yechmaydi,
lekin ishlab chiqish vaqtini 2 barobar oshiradi:

- Escrow va avtomatik payout (naqd + hamyon komissiyasi yetarli)
- Ko'p nuqtali marshrut
- Audio xabar va ichki qo'ng'iroq
- ML modellari (formula bilan boshlanadi)
- Park egasi rejimi (bir egaga ko'p haydovchi)
- Xalqaro yo'nalishlar va bojxona hujjatlari
