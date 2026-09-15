-- =====================================================================
--  0005 — hisobni o'chirish (App Store 5.1.1(v), Google Play talabi)
-- =====================================================================
--
--  Hisob ochish mumkin bo'lgan ilovada uni ilovaning o'zidan o'chirish
--  ham mumkin bo'lishi shart. Qator o'chirilmaydi, ANONIMLANADI:
--  to'lov va ledger yozuvlari foydalanuvchiga RESTRICT bilan bog'langan
--  va qonun bo'yicha saqlanadi (AccountDeletionService).
--
--  O'chirilgan foydalanuvchining telefoni "hech qachon mavjud bo'lmagan"
--  raqamga almashtiriladi: +99800XXXXXXX. `00` — O'zbekistonda operator
--  kodi emas (apps/api/src/common/utils/phone.util.ts), shuning uchun:
--    * haqiqiy raqam bilan to'qnashmaydi — egasi qaytadan ro'yxatdan o'ta oladi;
--    * bu raqam bilan kirib bo'lmaydi (so'rov validatsiyadan o'tmaydi);
--    * chk_phone_uz va UNIQUE cheklovlari buzilmaydi.
--  10 mln o'chirishgacha yetadi; tugasa nextval xato beradi — raqam
--  jimgina takrorlanmaydi (NO CYCLE).

CREATE SEQUENCE deleted_user_phone_seq MINVALUE 1 MAXVALUE 9999999 NO CYCLE;
