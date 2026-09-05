# 08 — Admin panel

**Stack:** React 18 + TypeScript + Vite + TanStack Query + TanStack Table +
Tailwind + shadcn/ui + Recharts + MapLibre GL.
**Kirish:** email + Argon2id parol + **majburiy TOTP 2FA**, IP allowlist (ixtiyoriy),
sessiya 8 soat, 30 daqiqa harakatsizlikda avtomatik chiqish.

## 8.1. Rollar va huquqlar (RBAC)

| Rol | Huquqlar |
|---|---|
| `SUPER_ADMIN` | Hammasi + xodim boshqaruvi + sozlamalar + audit log |
| `MODERATOR` | Hujjat verifikatsiyasi, foydalanuvchi bloklash, sharh moderatsiyasi |
| `SUPPORT` | Buyurtma ko'rish, shikoyat hal qilish, chat tarixi, qo'lda tayinlash |
| `FINANCE` | To'lovlar, refund, payout, komissiya hisobotlari, hamyon tuzatish |
| `ANALYST` | Faqat o'qish: dashboard, hisobotlar, eksport |

Huquqlar `admin_roles.permissions` JSONB'da granular:
`["users.view","users.ban","docs.verify","payments.refund","settings.update"]`.
Backend'da `@RequirePermission('docs.verify')` guard, frontend'da tugmalar shunga qarab yashiriladi.
**Frontend yashirishi — himoya emas**, haqiqiy tekshiruv har doim serverda.

## 8.2. Dashboard

### Yuqori qator — KPI kartalar (kecha bilan taqqoslash bilan)
| Ko'rsatkich | Izoh |
|---|---|
| Jami foydalanuvchilar | Bugun +N · Klient / Haydovchi bo'linishi |
| Faol haydovchilar (online) | Real vaqtda, WebSocket'dan |
| Bugungi yangi yuklar | va ulardan nechtasi buyurtmaga aylandi (**konversiya %**) |
| Faol buyurtmalar | Statuslar bo'yicha bo'lingan |
| Yakunlangan (bugun/hafta/oy) | |
| Bekor qilingan + sabab TOP-3 | |
| **GMV** (jami bitim hajmi) | UZS |
| **Platforma daromadi** (komissiya) | UZS + take rate % |
| O'rtacha buyurtma qiymati (AOV) | |
| Matchingdan offergacha o'rtacha vaqt | Operatsion sifat ko'rsatkichi |

### Grafiklar
1. Buyurtmalar dinamikasi (kunlik/haftalik/oylik, statuslar bo'yicha stacked)
2. Daromad dinamikasi + kumulyativ
3. Foydalanuvchilar o'sishi (yangi vs faol, cohort retention)
4. Yo'nalishlar TOP-10 (gorizontal bar: yuk soni va o'rtacha narx)
5. Transport turlari bo'yicha talab/taklif nisbati
6. Voronka: `E'lon → Match → Offer → Buyurtma → Yetkazildi`

### Xarita bloki
Real vaqtda barcha faol transportlar (klasterlangan), rang bo'yicha status.
Hududlarda **talab/taklif issiqlik xaritasi** — qayerda haydovchi yetishmayapti.

### Ogohlantirishlar paneli
- Verifikatsiya kutayotgan hujjatlar: **N ta** (2 soatdan oshgani qizil)
- Ochiq shikoyatlar: **N ta** (SLA buzilganlari alohida)
- Muvaffaqiyatsiz to'lovlar: **N ta**
- Shubhali akkauntlar (anti-fraud flag): **N ta**
- 30 daqiqadan beri GPS yubormayotgan faol buyurtmalar

## 8.3. Modullar

### Foydalanuvchilar
Jadval: ID, ism, telefon, rol, status, reyting, buyurtmalar, ro'yxatdan o'tgan sana.
Filter: rol, status, verifikatsiya, viloyat, sana oralig'i, reyting.
Amallar: profil ko'rish · bloklash/ochish (sabab majburiy) · verifikatsiya ·
hamyon tuzatish (FINANCE) · **impersonate** (support uchun, audit'ga yoziladi,
maxsus banner bilan) · SMS/push yuborish.

Profil sahifasi tablari: Umumiy · Hujjatlar · Transport · Buyurtmalar ·
To'lovlar · Baholar · Shikoyatlar · Login tarixi · Audit.

### Verifikatsiya navbati
Eng ko'p ishlatiladigan ekran — tezlikka optimallashtirilgan:
chapda navbat ro'yxati, o'ngda hujjat ko'rinishi (zoom, aylantirish, yonma-yon
old/orqa), pastda forma: `[✓ Tasdiqlash]` / `[✗ Rad etish + sabab (tayyor variantlar)]`.
Klaviatura yorliqlari: `A` tasdiq, `R` rad, `→` keyingi.
**Maqsad: 1 ta hujjat ≤ 20 soniya.**

### Yuklar va buyurtmalar
Jadval + har bir buyurtma uchun batafsil sahifa: to'liq timeline, xarita
(bosib o'tilgan marshrut), chat tarixi, hujjatlar, moliya, status tarixi.
Admin amallari: qo'lda haydovchi tayinlash · statusni majburan o'zgartirish
(sabab bilan) · bekor qilish · nizoni hal qilish · komissiyani bu buyurtma
uchun o'zgartirish.

### Moliya
- To'lovlar registri (provider, status, summa, xato kodi) + qayta urinish
- Ledger ko'rinishi: hisob bo'yicha barcha yozuvlar, balans tekshiruvi
- Refund (ikki bosqichli tasdiq: FINANCE so'raydi, SUPER_ADMIN tasdiqlaydi)
- Payout navbati va bank fayl eksporti
- Hisobotlar: kunlik/oylik daromad, komissiya, provider bo'yicha, eksport (XLSX/CSV)
- **Reconciliation:** PSP hisoboti bilan ichki ledger solishtiruvi, farqlar ro'yxati

### Shikoyatlar / nizolar
Kanban: `Ochiq → Ko'rib chiqilmoqda → Hal qilindi / Rad etildi`.
Kartada: prioritet, kategoriya, SLA taymer, mas'ul. Ichida: ikkala tomon
tushuntirishi, buyurtma dalillari (GPS trek, POD foto, chat), qaror shabloni,
moliyaviy natija (kimga qancha).

### Sozlamalar
- Komissiya: global, viloyatlararo, transport turi bo'yicha, promo davri
- **Matching og'irliklari** — slayderlar + "sinab ko'rish" rejimi
  (real yukda yangi og'irliklar bilan natijani ko'rsatadi, o'zgartirmasdan)
- Radius bosqichlari, offer TTL, jarima foizi, hamyon manfiy limiti
- Bildirishnoma shablonlari (3 tilda, o'zgaruvchilar bilan)
- Spravochniklar CRUD (viloyat, transport turi, kategoriya)
- Feature flags (yangi funksiyani foydalanuvchilarning 10% ga yoqish)

### Audit log
Har bir admin harakati: kim, nima, qachon, IP, before/after JSON diff.
O'chirib bo'lmaydi (append-only). Filter: admin, harakat turi, obyekt, sana.
Eksport — tekshiruv uchun.

## 8.4. Admin panel xavfsizligi

1. Alohida subdomen: `admin.karvon.uz`, alohida CORS siyosati.
2. Majburiy 2FA (TOTP), qayta tiklash — faqat SUPER_ADMIN orqali.
3. 5 marta noto'g'ri parol → 15 daqiqaga qulflanish + email ogohlantirish.
4. Barcha mutatsiya `audit_logs` ga (middleware avtomatik).
5. Shaxsiy ma'lumotlar (pasport raqami, PINFL) **defolt yashirin**, ochish
   uchun alohida huquq va har bir ochish audit'ga yoziladi.
6. Eksport (CSV/XLSX) ham audit'ga yoziladi — ma'lumot chiqib ketishini kuzatish.
7. Prod DB'ga to'g'ridan-to'g'ri kirish faqat bastion orqali, 2 kishilik tasdiq.
