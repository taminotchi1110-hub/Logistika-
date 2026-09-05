# 09 — Monetizatsiya modeli

## 9.1. Daromad manbalari va tahlil

### 1. Bitimdan komissiya (take rate) — **asosiy**
Har bir yakunlangan buyurtmadan 3–7%.

| ✅ Afzallik | ❌ Kamchilik |
|---|---|
| Daromad platforma qiymati bilan bevosita bog'liq | Naqd to'lovda **chetlab o'tish** (disintermediation) oson |
| Foydalanuvchi uchun tushunarli, oldindan to'lov yo'q | Talab qiladigan hajm katta bo'lishi kerak |
| GMV o'sishi bilan avtomatik o'sadi | Raqobatchi 0% qo'ysa bosim tushadi |
| Kichik haydovchi uchun to'siq past | Yig'ish murakkab (escrow bo'lmasa) |

**Chetlab o'tishga qarshi:** komissiya faqat platforma orqali beriladigan
qiymatga bog'lansin — reyting, nizo himoyasi, tracking havolasi, hujjatlar,
qaytish yuki. Chetlab o'tgan foydalanuvchi bularning barchasini yo'qotadi.
Amaliy chora: kontaktni buyurtma tasdiqlangunga qadar yashirish, "buyurtmani
platformadan tashqarida bajarish" haqidagi shikoyat uchun jarima, doimiy
mijozlarga chegirma (loyallikni sotib olish).

**Tavsiya etilgan struktura:**
| Segment | Komissiya |
|---|---|
| Shahar ichi (< 50 km) | 7% |
| Viloyatlararo | 4% |
| Doimiy korporativ mijoz | 3% |
| Birinchi 6 oy (launch) | **0%** |

### 2. Haydovchi uchun Premium obuna
**49 000 so'm/oy.** Beradi: matchingda ustuvorlik, yangi yuk haqida 5 daqiqa
oldin xabar, cheksiz offer (bepulda kuniga 10 ta), "Premium" nishoni,
kengaytirilgan statistika, komissiya 1% kamayadi.

| ✅ | ❌ |
|---|---|
| Bashorat qilinadigan takroriy daromad (MRR) | Faqat faol haydovchilar to'laydi (~10–15%) |
| Naqd to'lovda ham ishlaydi (chetlab o'tishga bog'liq emas) | "Ustuvorlik" sotish bozor adolatini buzishi mumkin |
| Yig'ish oson (hamyondan) | Qiymat aniq bo'lmasa — obunani bekor qilish yuqori |

⚠️ **Ehtiyot:** ustuvorlikni haddan tashqari sotish — yangi haydovchilarni
yuqotadi. Shuning uchun matchingda 15% "exploration" ulushi Premium'dan
qat'i nazar saqlanadi.

### 3. Yuk beruvchi uchun Premium
**99 000 so'm/oy.** Beradi: e'lon 24 soat TOP'da, tekshirilgan haydovchilar
poolidan tanlov, tezkor qo'llab-quvvatlash, oylik hisobot, 5 ta bepul TOP e'lon.

| ✅ | ❌ |
|---|---|
| Yuqori marja | Kichik klientlar uchun qimmat |
| Korporativ tarifga ko'prik | Faqat muntazam yuk beruvchilarga mos |

### 4. Pullik TOP e'lon (boost)
**15 000 so'm / e'lon**, 6 soat lentaning tepasida + qo'shimcha push.

| ✅ | ❌ |
|---|---|
| Mikro-to'lov, to'siq past, impulsiv | Ko'p bo'lsa lenta "reklamaga" aylanadi |
| Shoshilinch yuk uchun real qiymat | Daromadi kichik |

**Qoida:** lentaning har 5 pozitsiyasida maksimum 1 ta TOP.

### 5. Korporativ tarif / Subscription
| Tarif | Narx/oy | Kimga |
|---|---|---|
| CORP_BASIC | 1 200 000 so'm | 20 gacha yuk/oy, 3 foydalanuvchi, hisobot |
| CORP_PRO | 3 500 000 so'm | Cheksiz yuk, API, 10 foydalanuvchi, shaxsiy menejer, SLA |
| CORP_ENTERPRISE | Shartnoma | White-label, integratsiya, moslashtirilgan komissiya |

| ✅ | ❌ |
|---|---|
| Eng katta LTV, past churn | Uzoq savdo sikli (2–4 oy), sotuv jamoasi kerak |
| API integratsiyasi "yopishtiradi" | Individual talablar mahsulotni murakkablashtiradi |

### 6. Reklama
Yoqilg'i shoxobchalari, ehtiyot qismlar, shinalar, sug'urta, avtoservis,
lizing kompaniyalari — aynan haydovchi auditoriyasiga mos.

| ✅ | ❌ |
|---|---|
| Marginal xarajat ~0 | Katta auditoriya (10k+ DAU) kerak |
| Auditoriya juda aniq (yuqori CPM) | UX ni buzish xavfi, ishonchni pasaytiradi |

**Qoida:** reklama faqat alohida bo'limda va profil ekranida, lentada emas.

### 7. Qo'shimcha moliyaviy xizmatlar (12–24 oy) — **eng katta potentsial**
- **Sug'urta:** yuk sug'urtasi (bitimdan 15–25% agent komissiyasi)
- **Faktoring:** haydovchiga pulni darhol to'lash, klientdan 30 kunda olish (2–4%)
- **Yoqilg'i karta:** hamkor shoxobchalarda chegirma, platformaga cashback ulushi
- **Lizing/kredit lidlari:** bank sherikligi

| ✅ | ❌ |
|---|---|
| Take rate 5% dan 15%+ ga chiqadi | Litsenziya va kapital talab qiladi |
| Raqobatchi takrorlashi qiyin | Kredit riski, tartibga solish |

---

## 9.2. Tavsiya etilgan monetizatsiya yo'l xaritasi

| Bosqich | Vaqt | Yoqiladi | Maqsad |
|---|---|---|---|
| **0. Liquidity** | 0–6 oy | Komissiya 0%, hammasi bepul | Haydovchi va yuk bazasini yig'ish, NPS |
| **1. Komissiya** | 6–12 oy | Komissiya 4–7% (hamyondan) | Birinchi daromad, unit-ekonomikani sinash |
| **2. Obuna** | 9–15 oy | Driver/Shipper Premium, TOP e'lon | MRR, bashoratlilik |
| **3. Korporativ** | 12–24 oy | CORP tariflari, API | Katta chek, past churn |
| **4. Moliyaviy** | 18–36 oy | Sug'urta, faktoring, yoqilg'i | Take rate'ni ikki barobar oshirish |

## 9.3. Unit ekonomika (konservativ modellashtirish)

**Farazlar:** o'rtacha buyurtma 1 800 000 so'm · komissiya 5% = **90 000 so'm/buyurtma** ·
faol haydovchi oyiga 12 buyurtma bajaradi.

| Ko'rsatkich | Qiymat |
|---|---|
| Bitta haydovchidan oylik daromad | 12 × 90 000 = **1 080 000 so'm** |
| + Premium (15% konversiya) | ≈ +7 350 so'm |
| **ARPU (haydovchi)** | ≈ **1 087 000 so'm/oy** |
| CAC (haydovchi: agent + bonus + reklama) | ≈ 250 000 so'm |
| Payback davri | **< 1 oy** ✅ |
| 12 oylik retention (taxmin) | 45% |
| LTV (18 oy o'rtacha) | ≈ 8–10 mln so'm |
| **LTV/CAC** | **> 30×** (juda sog'lom) |

> ⚠️ **Ogohlantirish:** bu raqamlar farazlar asosida. Eng katta noaniqlik —
> haydovchining oyiga necha buyurtma bajarishi va komissiyani chetlab o'tish
> foizi. Birinchi 100 buyurtmadan keyin model real ma'lumot bilan qayta
> hisoblanishi shart. Modelning "o'lim nuqtasi": chetlab o'tish 40% dan oshsa,
> komissiya modeli ishlamaydi va obuna modeliga o'tish kerak.

## 9.4. Kuzatiladigan KPI'lar

| Guruh | Metrika | Maqsad (12 oy) |
|---|---|---|
| Liquidity | Yuk → buyurtma konversiyasi | > 65% |
| Liquidity | E'londan birinchi offergacha vaqt | < 10 daqiqa |
| Liquidity | Bo'sh qaytish ulushi | 45% → 25% |
| O'sish | Oylik faol haydovchilar (MAU) | 3 000 |
| O'sish | Oylik buyurtmalar | 15 000 |
| Ushlab qolish | Haydovchi 3-oylik retention | > 50% |
| Ushlab qolish | Takroriy klient ulushi | > 40% |
| Moliya | GMV | 25 mlrd so'm/oy |
| Moliya | Take rate | 4.5% |
| Sifat | Vaqtida yetkazish | > 92% |
| Sifat | Bekor qilish foizi | < 8% |
| Sifat | O'rtacha reyting | > 4.6 |
| Sifat | NPS | > 45 |
