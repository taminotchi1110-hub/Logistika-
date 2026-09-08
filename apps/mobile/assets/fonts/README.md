# Shriftlar

**Inter v4.1** — SIL Open Font License 1.1 (`Inter-LICENSE.txt`).
Manba: https://github.com/rsms/inter

## Nega shrift ilovaga qo'shilgan

Tizim shriftiga tayanib bo'lmaydi. O'zbek lotin alifbosida `ʻ`
(U+02BB MODIFIER LETTER TURNED COMMA) belgisi **oʻ** va **gʻ**
harflarida ishlatiladi va u har bir shriftda ham yo'q.

Bu tekshirilgan holat: Flutter web CanvasKit'ning ichki Roboto
to'plamida U+02BB yo'q va "bogʻlaymiz" so'zi **bogʻ** o'rniga
kvadrat bilan chiziladi. Android va iOS'da tizim shrifti odatda
bu belgini qo'llab-quvvatlaydi, lekin "odatda" — kafolat emas:
ishlab chiqaruvchi o'zgartirgan proshivkalarda farq bo'lishi mumkin.

Ilovaga qo'shilgan shrift bu noaniqlikni butunlay yo'q qiladi va
barcha qurilmalarda bir xil tipografika beradi.

## Inter tanlanishining sababi

| Talab | Holat |
|---|---|
| `ʻ` (U+02BB), `ʼ` (U+02BC) | ✅ bor |
| Kirill: `ў ғ қ ҳ` | ✅ bor |
| `★ № – −` | ✅ bor |
| Interfeys uchun moʻljallangan | ✅ ekran uchun yaratilgan |
| Tabular raqamlar | ✅ `FontFeature.tabularFigures()` |
| Litsenziya | ✅ OFL — tijorat ilovada bepul |

Jami 2821 ta belgi. Tekshiruv `flutter test` ichida avtomatik
bajariladi (`test/core/fonts_test.dart`).

## Nima uchun 4 ta og'irlik

`Regular (400)`, `Medium (500)`, `SemiBold (600)`, `Bold (700)` —
dizayn tizimida ishlatiladiganlari. Har bir qo'shimcha og'irlik
APK hajmini ~410 KB oshiradi, shuning uchun faqat keraklilari.

Kursiv (italic) yo'q: interfeysda ishlatilmaydi.
