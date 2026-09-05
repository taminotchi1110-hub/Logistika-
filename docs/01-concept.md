# 01 — Loyiha nomi va konsepsiya

## 1.1. Nom variantlari (10 ta)

| # | Nom | Ma'no / assotsiatsiya | Kuchli tomoni | Zaif tomoni |
|---|---|---|---|---|
| 1 | **KARVON** ⭐ | Buyuk Ipak yo'li karvoni | 3 tilda bir xil o'qiladi (Karvon/Караван/Caravan), tarixiy-madaniy ildiz, brend sifatida kuchli, logotipi oson | .uz domeni band bo'lishi mumkin |
| 2 | **YukBor** | "Yuk bor" — e'lon tili | Juda tushunarli, haydovchi tilida | Faqat o'zbek tilida ishlaydi |
| 3 | **Yo'ldosh** | Yo'ldagi hamroh | Iliq, ishonch hissi | Apostrof domen/brendda muammo |
| 4 | **TezYuk** | Tezkor yuk | Tezlik va'dasi | Umumiy, taqlid qilish oson |
| 5 | **Manzil** | Yetkazish nuqtasi | Qisqa, chiroyli | Logistika bilan bog'lanmaydi |
| 6 | **YukLink** | Yuk + bog'lanish | Xalqaro ohang | O'zbekcha emas |
| 7 | **Ortar** | "Ortmoq" (yuklamoq) | Original, band emas | Ma'nosi darrov tushunilmaydi |
| 8 | **Yuk24** | 24/7 xizmat | SEO uchun yaxshi | Zaifroq brend |
| 9 | **Marshrut** | Yo'nalish | Rus tilida ham tushunarli | Neytral |
| 10 | **UzCargo** | O'zbekiston + yuk | Korporativ mijoz uchun jiddiy | Trafaret, ko'p kompaniya ishlatadi |

**Tavsiya:** **KARVON** — asosiy brend, `karvon.uz` + `karvon.app`.
Ilova ichida ikki "yuz": **Karvon Yuk** (klient) va **Karvon Haydovchi** (driver) — bitta
Flutter build, role bo'yicha ajraladi (ikki alohida store listing MVP'dan keyin).

---

## 2.1. Platformaning asosiy konsepsiyasi

### Bir jumlada
> Karvon — O'zbekistondagi yuk beruvchi va haydovchini **avtomatik moslashtiruvchi**,
> yukni **real vaqtda kuzatib boruvchi** va **to'lovni kafolatlovchi** raqamli yuk birjasi.

### Qanday muammoni yechadi

| Muammo (hozirgi holat) | Karvon yechimi |
|---|---|
| Yuk topish Telegram guruhlari va tanish-bilish orqali; ma'lumot tarqoq, ishonchsiz | Yagona, moderatsiya qilinadigan yuk birjasi + avtomatik matching |
| Haydovchi yukni yetkazgach **bo'sh qaytadi** (empty backhaul ~35-45%) | Qaytish yuklarini avtomatik taklif qilish (Return Load Engine) |
| Narx shaffof emas, har safar telefon orqali savdolashish | Yo'nalish + transport turi bo'yicha bozor narxi tavsiyasi |
| To'lov kafolati yo'q, "pul bermadi / yukni yetkazmadi" nizolari | Escrow (kafolatli to'lov) + hujjatli tasdiq + reyting |
| Yuk qayerda ekani noma'lum, klient qo'ng'iroq qiladi | Live GPS tracking + 5 bosqichli status + ETA |
| Firibgar akkauntlar, soxta haydovchilar | Hujjat verifikatsiyasi + anti-fraud + audit |

### Asosiy qiymat (value proposition)

- **Yuk beruvchi uchun:** 5 daqiqada tekshirilgan transport, shaffof narx, to'lov kafolati, yukni ko'rib turish.
- **Haydovchi uchun:** bo'sh yurishni kamaytirish, doimiy yuk oqimi, pulni kafolatli olish, qaytish yuki.
- **Platforma uchun:** har bir bitimdan komissiya + premium obunalar + korporativ tariflar.

### Marketplace turi
**Managed marketplace** — platforma faqat e'lon taxtasi emas; u:
1. tomonlarni tekshiradi (KYC),
2. narxni tavsiya qiladi,
3. pulni ushlab turadi (escrow),
4. nizoni hal qiladi,
5. sifatni reyting orqali boshqaradi.

Bu **network effect** va **take rate** (komissiya) ni oqlaydigan yagona model.

---

## 3.1. Bozor va foydalanuvchi segmentlari

### Yuk beruvchi (Shipper)
| Segment | Ulush (taxmin) | Ehtiyoj | Monetizatsiya |
|---|---|---|---|
| Jismoniy shaxs (ko'chish, mebel, qurilish mollari) | 25% | Arzon, tez, ishonchli | Bitimdan komissiya |
| Kichik biznes / do'kon / bozor savdogari | 45% | Muntazam, kunlik yuk | Komissiya + TOP e'lon |
| Ishlab chiqaruvchi / distribyutor | 20% | Muntazam yo'nalish, hujjat, NDS | Korporativ tarif |
| Logistika kompaniyasi / ekspeditor | 10% | Ko'p yuk, API, o'z parki | Subscription + API |

### Haydovchi (Carrier)
| Segment | Transport | Ehtiyoj |
|---|---|---|
| Yakka tartibdagi haydovchi | Damas, Labo, Gazel | Shahar ichi kunlik yuk |
| O'rta park (2-10 mashina) | Isuzu, KamAZ, Tent | Viloyatlararo, qaytish yuki |
| Yirik park / TIR | MAN, Volvo, Scania, Fura, Ref | Xalqaro (KZ/RU/CN), doimiy shartnoma |

### Geografik bosqichlar
1. **Toshkent shahri + Toshkent viloyati** (shahar ichi + 100 km) — MVP launch
2. **Toshkent ↔ Samarqand ↔ Buxoro ↔ Farg'ona vodiysi** — asosiy koridorlar
3. Butun respublika (14 hudud)
4. Xalqaro: Qozog'iston, Rossiya, Qirg'iziston, Xitoy (2-yil)

### "Chicken-and-egg" muammosini yechish rejasi
Marketplace'ning asosiy xavfi — bir tomon bo'sh bo'lishi. Strategiya:
1. **Avval haydovchi tomonini to'ldirish** (offer tomoni oson yig'iladi): Telegram guruhlari,
   avtoto'xtash joylari, YTX/servis nuqtalarida ro'yxatga olish agentlari.
2. **Birinchi 6 oy komissiya = 0%** — faqat baza yig'ish.
3. **Bitta koridorga fokus** (Toshkent–Samarqand) — "liquidity" ni bir joyda zich qilish.
4. **Concierge MVP:** birinchi 500 buyurtmani operator qo'lda yopadi (matching ishlamasa ham).
