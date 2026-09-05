# 07 — UI/UX arxitekturasi

## 7.1. Dizayn tamoyillari

1. **Haydovchi — yo'lda, bir qo'lda, quyoshda.** Katta tugmalar (min 48×48 dp),
   yuqori kontrast, muhim harakat ekranning pastki uchdan birida (bosh barmoq zonasi).
2. **Kam qadam.** Yuk joylashtirish ≤ 4 qadam, 90 soniya. Har bir qo'shimcha
   maydon konversiyani ~7% pasaytiradi.
3. **Har doim "keyingi qadam" ko'rinadi.** Har bir ekranda bitta asosiy CTA.
4. **Pul va status — eng yirik element.** Haydovchi lentada avval narxni,
   keyin yo'nalishni ko'radi.
5. **Sekin internet uchun.** Skeleton loader, optimistik UI, offline cache,
   rasm lazy-load va siqish (WebP, max 1600 px).
6. **3 til bir xil sifatda.** Barcha matn `.arb` fayllarda, hardcode yo'q.
   Rus tili matnlari o'zbekchadan ~20% uzun — layout `Flexible`/`Wrap` bilan.

## 7.2. Dizayn tizimi (Design tokens)

| Token | Qiymat | Ishlatilishi |
|---|---|---|
| `primary` | `#1B5E9E` (chuqur ko'k) | CTA, aktiv holat, brend |
| `secondary` | `#F5A524` (kehribar) | Aksent, TOP e'lon, ogohlantirish |
| `success` | `#12A150` | Yetkazildi, tasdiq |
| `danger` | `#E5484D` | Bekor qilish, xato |
| `surface` / `bg` | `#FFFFFF` / `#F6F7F9` | Kartalar / fon |
| `text` / `muted` | `#101828` / `#667085` | Asosiy / ikkilamchi matn |
| Radius | 12 dp (karta), 10 dp (tugma) | — |
| Shrift | Inter / SF Pro / Roboto | 13–28 dp shkala |
| Spacing | 4-8-12-16-24-32 | 4 dp grid |

Dark mode — V2. Ranglar WCAG AA kontrast talabiga mos (matn ≥ 4.5:1).

---

## 7.3. Ekranlar

### 1. Splash
Logotip markazda, pastda versiya. Fonda: token tekshiruvi, spravochnik cache
yangilanishi, majburiy yangilanish tekshiruvi (force update). Maksimum 1.5 s,
keyin baribir keyingi ekranga o'tadi (API sekin bo'lsa ilova qotib qolmaydi).

### 2. Til tanlash / Onboarding
3 ta bayroqli tugma (O'zbek / Русский / English). Keyin 3 slayd:
"Yukingizni joylashtiring" → "Mos transport avtomatik topiladi" → "Yo'lda kuzatib boring".
Pastda `[Boshlash]` va `O'tkazib yuborish`.

### 3. Login (telefon)
- Sarlavha: "Telefon raqamingiz"
- Maska: `+998 (__) ___-__-__`, avtomatik `+998` prefiks, faqat raqam klaviaturasi
- Checkbox: "Foydalanish shartlariga roziman" (havolalar bilan) — MVP'da majburiy
- `[Davom etish]` — raqam to'liq bo'lmaguncha o'chiq
- Pastda: "Muammo bormi? Qo'llab-quvvatlash"

### 4. OTP tasdiqlash
- 6 ta alohida katak, avtomatik fokus siljishi, SMS'dan avto-o'qish
  (Android SMS Retriever API)
- "Kod 00:47 dan keyin qayta yuboriladi" taymer
- Xato: katak qizil + titrash (haptic), "Kod noto'g'ri. 2 urinish qoldi"
- Raqamni o'zgartirish havolasi

### 5. Rol tanlash
Ikki katta karta, ikonka va tavsif bilan:
- 🧾 **Yuk beruvchiman** — "Yukim bor, transport kerak"
- 🚛 **Haydovchiman** — "Transportim bor, yuk kerak"
Pastda kichik matn: "Keyinchalik rolni sozlamalardan o'zgartirishingiz mumkin".

### 6. Profil to'ldirish (Klient)
Ism, Familiya (majburiy) · Avatar (ixtiyoriy) · "Kompaniya nomidan ishlayman"
toggle → STIR, kompaniya nomi. `[Saqlash va davom etish]`.

### 7. Haydovchi ro'yxatdan o'tishi (6 qadamli wizard)
Yuqorida progress bar `1/6 … 6/6`, har qadamda `[Orqaga] [Keyingi]`,
qoralama avtomatik saqlanadi (ilovadan chiqib ketsa yo'qolmaydi).
1. Shaxsiy · 2. Hujjatlar (kamera bilan suratga olish, ramka ko'rsatkichi) ·
3. Transport · 4. Texnik parametrlar · 5. Foto · 6. Yo'nalishlar.
Yakunda: **"Tekshiruvda"** ekrani — soat ikonkasi, "Odatda 2 soat ichida
tasdiqlanadi", `[Yuklarni ko'rish]` tugmasi (read-only rejim).

### 8. HOME — Yuk beruvchi
```
┌────────────────────────────────────────┐
│ Salom, Bobur       🔔³        [Avatar] │
├────────────────────────────────────────┤
│  ╔══════════════════════════════════╗  │
│  ║   ➕  YUK JOYLASHTIRISH          ║  │  ← eng katta CTA
│  ╚══════════════════════════════════╝  │
├────────────────────────────────────────┤
│ Faol buyurtmalar (2)         Barchasi ›│
│ ┌────────────────────────────────────┐ │
│ │ №100234 · Toshkent → Samarqand     │ │
│ │ 🚛 Alisher K. ⭐4.8 · Isuzu 5t     │ │
│ │ ● Yo'lda · ETA 14:20 · 87 km qoldi │ │  ← jonli status
│ │ [Xaritada]        [Chat ²]         │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ Tez amallar                            │
│ [🔁 Oxirgi yukni takrorlash]           │
│ [📍 Saqlangan manzillar]               │
└────────────────────────────────────────┘
   🏠 Asosiy  📦 Buyurtmalar  💬 Chat  👤 Profil
```

### 9. HOME — Haydovchi (yuk lentasi)
```
┌────────────────────────────────────────┐
│ ◉ Bo'shman ▼        🔔    [Filter ⚙³] │  ← status bir tegishda o'zgaradi
├────────────────────────────────────────┤
│ [Barchasi] [Mos ✨] [Yaqin] [Qaytish🔁]│  ← chip filtrlar
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ ✨ 93% mos            TOP ⭐        │ │
│ │ 2 400 000 so'm                     │ │  ← narx eng yirik
│ │ Toshkent, Yunusobod                │ │
│ │      ↓ 308 km · 4s 20d             │ │
│ │ Samarqand, Registon                │ │
│ │ ─────────────────────────────────  │ │
│ │ 📦 Mebel · 4.5 t · 18 m³           │ │
│ │ 🚛 Isuzu/Tent · 👷 Gruzchik kerak  │ │
│ │ 📅 Bugun 14:00–18:00               │ │
│ │ 📍 Sizdan 4.2 km                   │ │
│ │        [Batafsil]  [So'rov yuborish]│ │
│ └────────────────────────────────────┘ │
```
Pull-to-refresh, cheksiz skroll, yangi yuk kelganda tepada "3 ta yangi yuk ↑" pill.

### 10. Yuk yaratish (4 qadam)
Har qadamda progress, `[Orqaga]`/`[Keyingi]`, qoralama saqlanadi.
Yakuniy ko'rib chiqish ekranida barcha ma'lumot + tahrirlash tugmalari +
komissiya shaffof ko'rsatiladi:
> Yuk narxi 2 400 000 · Platforma komissiyasi 5% (120 000) · **Sizga 2 400 000**
> *(Komissiyani haydovchi to'laydi)*

### 11. Yuk tafsilotlari
Yuqorida rasm karuseli → sarlavha, narx (yirik) → marshrut (vertikal timeline:
🔵 olish · ⋮ masofa · 🔴 yetkazish) → kichik xarita (bosilsa to'liq ochiladi) →
yuk parametrlari (grid: og'irlik/hajm/o'ram/kategoriya) → talablar (chip) →
klient kartasi (ism, ⭐reyting, "12 ta buyurtma", telefon **maskalangan**) →
pastda sticky panel: `[💬 Savol berish] [So'rov yuborish →]`.

### 12. Qidiruv va filter (bottom sheet)
Qayerdan/Qayerga (viloyat + tuman multi-select) · Sana oralig'i ·
Og'irlik va hajm sliderlari · Transport va kuzov turi (chip grid) ·
Narx oralig'i · "Mendan masofa" slider · Faqat tasdiqlangan klientlar toggle ·
Pastda: `[Tozalash]` va `[Ko'rsatish (47 ta)]` — natija soni jonli yangilanadi.

### 13. Haydovchilar ro'yxati (klient uchun)
Match score bo'yicha tartiblangan kartalar: avatar, ism, ⭐4.8 (124 baho),
✅ Tasdiqlangan, transport (Isuzu · Tent · 5 t), "Sizdan 4.2 km",
"Odatda 8 daqiqada javob beradi", `[Taklif yuborish]`.
Tepada tab: `Tavsiya etilgan` | `Sevimlilar` | `Avval ishlaganlar`.

### 14. Haydovchi profili
Avatar + ism + ✅ + ⭐ · Statistika chiplar (312 buyurtma · 98% vaqtida ·
2% bekor) · Transport kartochkasi (foto karuseli + parametrlar) ·
Hujjatlar holati (faqat "tasdiqlangan" belgisi, raqamlar ko'rinmaydi) ·
Sharhlar ro'yxati (filter: 5⭐…1⭐) · `[Sevimlilarga ⭐] [Taklif yuborish]`.

### 15. Buyurtma tafsilotlari
Eng muhim ekran. Tepada **status stepper** (gorizontal, 5 nuqta):
`Tasdiqlandi → Yo'lga chiqdi → Yuk ortildi → Yo'lda → Yetkazildi`
Ostida live xarita preview (bosilsa to'liq tracking).
Keyin: hamkor kartasi (telefon **CONFIRMED** dan keyin ochiq, `[📞 Qo'ng'iroq]`),
marshrut timeline, yuk ma'lumoti, moliya bloki (narx, komissiya, to'lov holati),
hujjatlar (POP/POD foto, shartnoma PDF), status tarixi (kengaytiriladigan).
Pastda rolga qarab CTA: haydovchida `[Yukni oldim ✓]`, klientda `[Qabul qildim ✓]`.

### 16. Live tracking (to'liq ekran xarita)
Xarita 70%, pastda tortiladigan panel (bottom sheet):
- Xaritada: 🔵 olish pin, 🔴 yetkazish pin, 🚛 haydovchi markeri (yo'nalish bo'yicha
  buriladi, silliq animatsiya bilan siljiydi), marshrut chizig'i (o'tilgan — kulrang,
  qolgan — ko'k)
- Panelda: haydovchi + transport, **ETA 14:20**, **87 km qoldi**, joriy tezlik,
  status stepper, `[💬 Chat] [📞 Qo'ng'iroq] [🔗 Ulashish]`
- GPS 30 soniyadan ortiq kelmasa: "Signal yo'q — oxirgi ma'lumot 14:02 da" banner

### 17. Chat
Standart messenger: xabar pufakchalari, vaqt, ✓/✓✓, sana ajratgichlari,
tizim xabarlari markazda kulrang ("Buyurtma tasdiqlandi · 12:04").
Yuqorida: hamkor nomi, "onlayn/oxirgi faollik", buyurtma raqamiga havola.
Pastda: 📎 (rasm/fayl), matn maydoni, 🎤 (V2), ➤.
Tepada tez javob chiplari: "Qachon yetib kelasiz?" · "Yo'ldaman" · "Yetib keldim".

### 18. Bildirishnomalar
Guruhlangan: Bugun / Kecha / Oldingi. Har biri: ikonka (tur bo'yicha rangli),
sarlavha, matn, vaqt, o'qilmagan uchun ko'k nuqta. Swipe → o'chirish.
Bosilganda deep link bo'yicha o'tadi.

### 19. To'lovlar / Hamyon
Tepada balans kartasi (gradient): **248 000 so'm**, `[+ To'ldirish]`.
Manfiy balansda qizil banner: "Balans −45 000. To'ldirmaguningizcha
so'rov yubora olmaysiz."
Ostida tranzaksiyalar ro'yxati (sana, tur, summa +yashil/−qizil, buyurtma №).
Filter: Barchasi / Kirim / Chiqim / Komissiya. `[PDF hisobot]`.

### 20. Buyurtmalar tarixi
Tab: `Faol` | `Yakunlangan` | `Bekor qilingan`. Kartada: №, sana, marshrut,
narx, status badge, hamkor. Qidiruv (№ yoki manzil bo'yicha), sana filtri.
Yakunlangan kartada `[Baholash]` yoki `[Takrorlash]`.

### 21. Baholash (modal)
"Alisher bilan ishlash qanday o'tdi?" → 5 ta katta yulduz →
4 ta mezon (Vaqtida yetkazish / Muomala / Yuk holati / Ishonchlilik) —
har biri kichik yulduzchalar → izoh maydoni (ixtiyoriy) →
tez teglar (chip): "Vaqtida keldi" · "Muloyim" · "Yuk shikastlangan" · "Kechikdi" →
`[Yuborish]` / `[Keyinroq]`.

### 22. Profil va sozlamalar
Avatar + ism + ⭐ + ✅ · "Mening transportim" (haydovchi) · Hujjatlarim ·
Yo'nalishlarim · Saqlangan manzillar · Sevimlilar · Qora ro'yxat ·
Til · Bildirishnomalar · Xavfsizlik (sessiyalar) · Yordam · Shartlar ·
Versiya · `[Chiqish]` · `[Akkauntni o'chirish]` (qizil, tasdiq bilan).

---

## 7.4. Navigatsiya strukturasi

```
Klient bottom nav:   Asosiy · Buyurtmalar · Chat · Profil
Haydovchi bottom nav: Yuklar · Buyurtmalarim · Chat · Hamyon · Profil
```
Faol buyurtma bo'lsa — barcha ekranlarda pastda doimiy **mini-tracker bar**
("№100234 · Yo'lda · ETA 14:20" — bosilsa tracking ochiladi), taksi ilovalaridagi kabi.

## 7.5. Kritik holatlar (bularsiz ilova "demo" bo'lib qoladi)

| Holat | UI yechimi |
|---|---|
| Internet yo'q | Yuqorida doimiy banner, cache'dagi ma'lumot ko'rsatiladi, harakatlar navbatga |
| Bo'sh ro'yxat | Illyustratsiya + "Hozircha mos yuk yo'q" + `[Filterni kengaytirish]` |
| Yuklanmoqda | Skeleton (spinner emas) — kutish qisqaroq tuyuladi |
| Server xatosi | "Nimadir noto'g'ri ketdi" + `[Qayta urinish]` + xato kodi (support uchun) |
| GPS o'chiq | Modal: "Kuzatuv uchun joylashuv kerak" + `[Sozlamalarni ochish]` |
| Sessiya tugadi | Jim refresh; bo'lmasa login ekraniga, joriy ish holati saqlanadi |
| Majburiy yangilanish | Bloklovchi ekran + `[Play Marketga o'tish]` |
| Verifikatsiya kutilmoqda | Barcha "so'rov yuborish" tugmalari o'chiq + tushuntirish |

## 7.6. Ishlab chiqish oldidan tayyorlanadigan artefaktlar

1. **Figma:** 22 ekran × 3 holat (bo'sh / yuklanmoqda / to'liq), komponent kutubxonasi.
2. **Prototip:** 3 ta asosiy oqim clickable (yuk yaratish, offer→buyurtma, tracking).
3. **Foydalanuvchi testi:** 5 haydovchi + 5 yuk beruvchi bilan (real
   avtoto'xtash joyida). Ular **telefonni birinchi marta ko'rgandek** sinaydi.
4. **Design tokens** `packages/design-tokens` da JSON — Flutter va React
   bir manbadan oladi.
