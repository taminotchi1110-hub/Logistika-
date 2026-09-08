# KARVON — mobil ilova

Flutter 3.24+ / Dart 3.5+

## Birinchi ishga tushirish

### 1. Flutter SDK

```powershell
# Android Studio (Android SDK va emulyator uchun)
winget install -e --id Google.AndroidStudio
```

Flutter SDK: [docs.flutter.dev/get-started/install/windows](https://docs.flutter.dev/get-started/install/windows)
ZIP'ni `C:\src\flutter` ga chiqaring va `C:\src\flutter\bin` ni PATH'ga qo'shing.

```bash
flutter doctor
```

Barcha qatorlar ✓ bo'lishi shart emas — `Android toolchain` va
`Flutter` yetarli. `Visual Studio` (Windows desktop) va `Chrome` kerak emas.

### 2. Platforma papkalarini yaratish

`android/` va `ios/` papkalari repoda **yo'q** — ular Flutter tomonidan
generatsiya qilinadi va mashinaga xos yo'llarni o'z ichiga oladi.

> ⚠️ `flutter create .` ni to'g'ridan-to'g'ri ishlatmang — u `pubspec.yaml`
> va `lib/main.dart` ni qayta yozib yuborishi mumkin. Quyidagi yo'l xavfsiz:

```bash
cd apps/mobile

# Vaqtinchalik loyihada platforma papkalarini yaratamiz
flutter create --platforms=android,ios --org uz.karvon --project-name karvon ../_tmp_karvon

# Faqat platforma papkalarini ko'chiramiz
cp -r ../_tmp_karvon/android ./
cp -r ../_tmp_karvon/ios ./
rm -rf ../_tmp_karvon

flutter pub get
```

### 3. Backend bilan ulanish

API ishlab turishi kerak (`npm run dev` repo ildizida).

```bash
# Android emulyatorda 10.0.2.2 — bu xost mashinaning localhost'i
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/v1 \
            --dart-define=WS_URL=http://10.0.2.2:3000

# Haqiqiy qurilmada — kompyuteringizning lokal IP manzili
flutter run --dart-define=API_BASE_URL=http://192.168.1.50:3000/v1 \
            --dart-define=WS_URL=http://192.168.1.50:3000
```

> Haqiqiy qurilmada API `0.0.0.0` da tinglashi kerak. Backend allaqachon
> shunday sozlangan, lekin Windows Firewall 3000-portga ruxsat so'rashi mumkin.

## Tekshirish

```bash
flutter analyze          # statik tahlil
flutter test             # unit testlar
flutter build apk --debug
```

## Tuzilma

```
lib/
├── main.dart              # kirish nuqtasi
├── app.dart               # MaterialApp.router
├── core/
│   ├── api/               # Dio mijoz, token yangilash, xatolarni tarjima
│   ├── config/            # --dart-define orqali sozlamalar
│   ├── router/            # go_router + yo'naltirish qoidalari
│   ├── storage/           # secure storage (tokenlar)
│   ├── theme/             # ranglar, o'lchamlar, shrift shkalasi
│   ├── utils/             # pul, telefon formatlash
│   └── providers.dart     # Riverpod provayderlari
├── features/
│   ├── auth/              # telefon → OTP → profil
│   └── home/              # asosiy ekran, tablar
└── shared/widgets/        # umumiy komponentlar
```

## Dizayn qarorlari

**Nima uchun bunday qilingan** — batafsil izohlar kod ichida. Asosiylari:

| Qaror | Sabab |
|---|---|
| Minimal teginish maydoni 52dp (48 emas) | Haydovchi harakatlanayotgan mashinada, ba'zan qo'lqopda bosadi |
| Eng kichik shrift 13pt | Quyosh nurida undan pastini o'qib bo'lmaydi |
| Pul `BigInt` tiyinda | `double` da 0.1+0.2≠0.3; 90 mlrd so'mdan keyin `int` ham aniqlikni yo'qotadi |
| Xato matni **kod** bo'yicha tanlanadi | Server matni faqat o'zbekcha va texnik bo'lishi mumkin |
| Token yangilash bitta marta | Parallel 401'larda refresh rotatsiyasi buziladi (`AUTH_REFRESH_REUSED`) |
| Rol kartochkalari, ochiluvchi ro'yxat emas | Rol butun interfeysni o'zgartiradi — eng muhim tanlov |
| Tokenlar faqat secure storage'da | `SharedPreferences` oddiy XML, root qilingan qurilmada o'qiladi |
| Rang yolg'iz ma'no tashimaydi | Dalton foydalanuvchilar va quyoshda rang buzilishi |

## Hali qo'shilmagan

- `assets/` va Inter shrifti (`pubspec.yaml` dagi izohga qarang)
- l10n (`.arb` fayllari) — hozircha matnlar kodda o'zbekcha
- Firebase konfiguratsiyasi (`google-services.json`)
