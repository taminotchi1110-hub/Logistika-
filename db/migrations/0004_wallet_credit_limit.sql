-- =====================================================================
--  0004 — foydalanuvchi hamyonlariga kredit limiti
-- =====================================================================
--
--  MUAMMO: `ledger_accounts.credit_limit_tiyin` sukut bo'yicha 0 edi,
--  ya'ni hamyon manfiyga umuman tusha olmasdi. Naqd buyurtmada esa
--  komissiya aynan haydovchi hamyonidan yechiladi va u vaqtincha
--  manfiy bo'lishi KERAK — haydovchi pulni mijozdan naqd olgan, uni
--  hali platformaga o'tkazmagan.
--
--  Natijada naqd buyurtma yakunlanganda komissiya yechilmay qolar edi:
--  "Mablag' yetarli emas" xatosi ledger darajasida chiqib, buyurtma
--  esa allaqachon COMPLETED bo'lgan. Ya'ni platforma daromadini
--  jimgina yo'qotardi.
--
--  YECHIM: har bir foydalanuvchi hamyoniga sozlamadagi manfiy limit
--  qo'yiladi (`wallet.negative_limit_tiyin`, sukut bo'yicha 200 000 so'm).
--  Limitga yetgan haydovchi yangi taklif yubora olmaydi — bu tekshiruv
--  `OffersService.create()` da.

UPDATE ledger_accounts
   SET credit_limit_tiyin = 20000000,   -- 200 000 so'm
       updated_at = now()
 WHERE type = 'USER_WALLET'
   AND credit_limit_tiyin = 0;

-- Yangi hamyonlar uchun ham sukut qiymat: ilova kodi sozlamadan o'qiydi,
-- lekin baza darajasidagi sukut qiymat ham to'g'ri bo'lishi kerak —
-- ledger'ga to'g'ridan-to'g'ri yozadigan migratsiyalar uchun himoya.
ALTER TABLE ledger_accounts
  ALTER COLUMN credit_limit_tiyin SET DEFAULT 0;

COMMENT ON COLUMN ledger_accounts.credit_limit_tiyin IS
  'Hisob shu qiymatgacha manfiy bo''lishi mumkin. USER_WALLET uchun platform_settings.wallet.negative_limit_tiyin dan olinadi; tizim hisoblari uchun cheklovsiz.';
