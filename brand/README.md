# KARVON — brend

Tanlangan logotip — **«Kafolat»**: yozuvdagi V harfi tasdiq belgisiga (✓)
aylangan. Ma'nosi — platformaning asosiy va'dasi: kafolatli to'lov (escrow)
va tekshirilgan haydovchilar. Ilova ikonkasi — shu yozuvdan olingan «K✓»
monogrammasi.

Yozuv shrifti — **Inter Bold** (ilovaning o'z shrifti, SIL OFL litsenziyasi),
harflar konturga aylantirilgan: fayllarni ochish uchun shrift o'rnatish shart emas.

## Fayllar — `brand/logo/`

| Fayl | Qachon ishlatiladi |
|---|---|
| `karvon-logo.svg` / `.png` | Asosiy logotip — oq va och fonlarda |
| `karvon-logo-inverse.svg` / `.png` | Ko'k va to'q fonlarda |
| `karvon-logo-black.svg` | Bir rangli bosma: muhr, blanka, faks |
| `karvon-logo-white.svg` | Bir rangli, rasm yoki to'q fon ustida |
| `karvon-monogram.svg` | «K✓» — joy tor bo'lganda (favicon, ikonka, avatar) |
| `karvon-app-icon.svg` | Yumaloq burchakli ilova ikonkasi — sayt va taqdimotlar uchun |
| `karvon-app-icon-1024.png` | App Store Connect (1024×1024, alfa-kanalsiz) |
| `karvon-play-store-512.png` | Google Play Console (512×512) |
| `karvon-avatar-800.png` | Telegram, Instagram va boshqa tarmoqlardagi avatar (doira ichiga sig'adi) |
| `karvon-og-1200x630.png` | Havola ulashilganda chiqadigan rasm (Open Graph) |

SVG — asl nusxa. PNG kerak bo'lsa, SVG'dan kerakli o'lchamda eksport qiling:
kichik PNG'ni kattalashtirish sifatni buzadi.

## Ranglar

| Nomi | HEX | Qayerda |
|---|---|---|
| Karvon ko'ki | `#0F62A8` | Ikonka foni, ochilish ekrani, asosiy tugmalar |
| To'q ko'k | `#0A4880` | Logotip harflari — oq fonda |
| Yo'l sarig'i | `#F5A623` | Tasdiq belgisi — har doim sariq |
| Oq | `#FFFFFF` | Logotip harflari — ko'k va to'q fonda |

Ilova kodidagi mos nomlar: `AppColors.primary`, `primaryDark`, `accent`
(`apps/mobile/lib/core/theme/app_colors.dart`).

## Qoidalar

- **Bo'sh joy.** Logotip atrofida kamida bosh harf balandligining yarmicha
  bo'sh joy qoldiring — matn va boshqa belgilar unga tegmasin.
- **Minimal o'lcham.** Yozuv: ekranda 80 px kenglik, bosmada 20 mm.
  Undan kichik joyda «K✓» monogrammasini ishlating (16 px gacha o'qiladi).
- **Belgi har doim sariq** — bir rangli versiyalardan tashqari.
- **Qilmang:** cho'zish yoki siqish, harflar rangini o'zgartirish, soya yoki
  gradient qo'shish, ✓ ni boshqa ikonka bilan almashtirish, logotipni past
  kontrastli fonga (masalan, sariq yoki och ko'k) qo'yish.

## Loyihada qayerda

| Joy | Fayl |
|---|---|
| Mobil ilova ichida (splash, kirish ekrani) | `apps/mobile/lib/shared/widgets/karvon_logo.dart` — rasm emas, Inter shrifti bilan chiziladi |
| Android ikonkasi | `android/app/src/main/res/`: `mipmap-anydpi-v26/ic_launcher.xml` (adaptiv + Android 13 mavzuli), `drawable/ic_launcher_foreground.xml`, eski qurilmalar uchun `mipmap-*/ic_launcher.png` |
| Android ochilish ekrani | `drawable*/launch_background.xml`, `drawable-*dpi/splash_logo.png`, Android 12+ uchun `values-v31/styles.xml` va `values-night-v31/styles.xml` |
| iOS ikonkasi va ochilish ekrani | `ios/Runner/Assets.xcassets/AppIcon.appiconset/`, `LaunchImage.imageset/`, `Base.lproj/LaunchScreen.storyboard` |
| Admin panel | `apps/admin/src/assets/karvon-logo.svg`, favicon: `apps/admin/public/favicon.svg` |

Logotip geometriyasi o'zgarsa, SVG fayllar va `karvon_logo.dart` dagi
o'lchovlar birga yangilanadi — widget testi (`test/shared/widgets/karvon_logo_test.dart`)
ularning nisbati bir xil ekanini tekshiradi.

`brand/karvon-logo-taqdimot.png` — logotip, ikonkalar va ilova ekranlaridagi
ko'rinishi bitta rasmda (jamoaga ko'rsatish uchun).
`brand/logo-concepts/` — tanlovdan oldingi 6 ta konsept (arxiv).
