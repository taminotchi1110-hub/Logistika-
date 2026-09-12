# 20. Mobil ilovani do'konga chiqarish

> Google Play va App Store. Hisob ochish, imzo kaliti, Firebase va
> do'kon materiallari — egasi bajaradigan qadamlar (✋ bilan belgilangan).

## 20.1 Hozirgi holat

| Nima | Qiymat |
|---|---|
| Identifikator | `uz.karvon.app` — Android `applicationId` va iOS bundle ID. **Bir marta tanlanadi, keyin o'zgartirib bo'lmaydi** (o'zgarsa bu boshqa ilova hisoblanadi) |
| Nomi | KARVON |
| Tillar | o'zbek, rus, ingliz (ilova ichida tanlanadi) |
| Ruxsatlar | internet; joylashuv — faqat ilova ochiq paytida; bildirishnomalar; kamera va galereya (hujjat surati) |
| Push | Firebase fayli bo'lsa yoqiladi; bo'lmasa ilova pushsiz to'liq ishlaydi |
| Yo'nalish | faqat portret |

Android loyihasi CI da har push'da **reliz APK** sifatida yig'iladi va
manifestda `INTERNET` ruxsati hamda identifikator borligi tekshiriladi
(Flutter namunasida `INTERNET` faqat debug manifestida — usiz reliz
ilova serverga umuman ulanmas edi).

## 20.2 Firebase — push ✋

1. [console.firebase.google.com](https://console.firebase.google.com) → yangi loyiha.
2. **Android** ilova qo'shing: paket nomi `uz.karvon.app` →
   `google-services.json` ni `apps/mobile/android/app/` ga qo'ying.
3. **iOS** ilova qo'shing: bundle ID `uz.karvon.app` →
   `GoogleService-Info.plist` ni Xcode'da `Runner` target'iga qo'shing
   (*Add Files to "Runner"*, "Copy items if needed").
4. **APNs:** Apple Developer → Certificates, IDs & Profiles → Keys →
   yangi kalit (*Apple Push Notifications service*) → `.p8` faylni
   Firebase → Project settings → Cloud Messaging → *APNs Authentication Key* ga.
5. **Xcode:** Runner → Signing & Capabilities → *+ Capability* →
   *Push Notifications*. (*Background Modes → Remote notifications*
   `Info.plist` da allaqachon yoqilgan.)
6. **Server:** Firebase → Project settings → Service accounts →
   *Generate new private key* → JSON dagi qiymatlar `.env.production` ga:
   `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`
   (qo'shtirnoqda, qator uzilishlari `\n` bilan).

Ikkala konfiguratsiya fayli gitga KIRMAYDI (`.gitignore`) — ular har
muhit uchun alohida va mahalliy saqlanadi.

## 20.3 Android imzo kaliti ✋

Kalit bir marta yaratiladi va **parol menejerida va ikkinchi joyda
zaxiralanadi**:

```bash
keytool -genkey -v -keystore ~/karvon-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

`apps/mobile/android/key.properties` (gitga kirmaydi):

```properties
storePassword=...
keyPassword=...
keyAlias=upload
storeFile=/home/<siz>/karvon-upload.jks
```

**Play App Signing** yoqiladi (Play Console taklif qiladi): ilovani
imzolash kaliti Google'da saqlanadi, bu fayl esa faqat *yuklash* kaliti.
Yo'qolsa Play Console orqali almashtirish mumkin — lekin bu bir necha kun
oladi, shuning uchun zaxira shart.

## 20.4 Yig'ish

```bash
API_BASE_URL=https://api.karvon.uz/v1 \
WS_URL=https://api.karvon.uz \
SUPPORT_PHONE=+998XXXXXXXXX \
MAP_TILE_URL='https://<plitka-serveri>/{z}/{x}/{y}.png' \
  bash scripts/build-mobile-release.sh android
```

Skript avval analiz va testlarni ishga tushiradi; manzil `https` emas,
qo'llab-quvvatlash raqami, imzo kaliti yoki Firebase fayli yo'q bo'lsa
yig'maydi. iOS — xuddi shu buyruq `ios` bilan, **faqat macOS'da** (Xcode).

**Xarita plitkalari:** standart manzil — OpenStreetMap'ning ochiq serveri.
Uning foydalanish shartlari tijorat ilovasining yuklamasiga ruxsat
bermaydi; prodda o'z plitka serveri yoki shartnomali provayder kerak ✋.

**Belgilar:** kod obfuskatsiya qilinadi; `apps/mobile/build/symbols/`
har reliz bilan birga arxivlanadi — usiz do'kondan kelgan xato izini
o'qib bo'lmaydi.

## 20.5 Versiya

`pubspec.yaml`: `version: 1.0.0+1` — `+` dan keyingi raqam **har
yuklashda oshadi** (do'konlar bir xil raqamni ikkinchi marta qabul
qilmaydi). Birinchi reliz oldidan `0.1.0+1` → `1.0.0+1`.

## 20.6 Do'kon materiallari ✋

- [ ] **Ikonka** 1024×1024 PNG (dizayner). Hozir Flutter'ning standart
      ikonkasi turibdi. Tayyor bo'lgach `flutter_launcher_icons` bilan
      barcha o'lchamlar yaratiladi.
- [ ] Skrinshotlar (telefon), Play uchun 1024×500 banner
- [ ] Qisqa va to'liq tavsif — o'zbek, rus, ingliz
- [ ] **Maxfiylik siyosati URL** — ikkala do'kon uchun majburiy
      (loyiha: `docs/legal/`, yurist tasdig'idan keyin saytga)
- [ ] Play **Data safety** va App Store **App Privacy** shakllari:
      telefon raqami, ism, joylashuv (ilova ochiq paytida), hujjat
      suratlari, to'lov tarixi; uchinchi tomonga sotilmaydi
- [ ] Ko'rib chiquvchilar uchun sinov hisobi: ilova SMS kod bilan
      kiradi — ko'rib chiquvchiga ishlaydigan raqam va kod berilishi kerak

## 20.7 Ma'lum cheklovlar (keyingi relizlar)

- **Fon rejimida kuzatuv yo'q:** haydovchi ilovani yig'ib qo'ysa GPS
  yuborish to'xtaydi. Keyingi qadam — Android *foreground service* va
  iOS *location updates* fon rejimi (do'konlar alohida asoslashni so'raydi).
- iOS ruxsat izohlari ikki tilda bitta qatorda (o'zbek / ingliz);
  to'liq mahalliylashtirish — `InfoPlist.strings` bilan.
- Ilova yopiq holatda push bosilib, foydalanuvchi hali kirmagan bo'lsa,
  kirishdan keyin o'sha ekranga o'tilmaydi.
