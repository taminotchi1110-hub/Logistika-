-- =====================================================================
--  0002 — matching og'irliklari kalitlarini camelCase ga o'tkazish
-- =====================================================================
--
--  NEGA: Kysely'ning `CamelCasePlugin` faqat ustun nomlarini emas,
--  JSONB QIYMATI ICHIDAGI kalitlarni ham camelCase ga o'giradi.
--  Ya'ni bazada `{"route_fit": 0.2}` yozilgan bo'lsa, ilova uni
--  `{"routeFit": 0.2}` sifatida oladi.
--
--  Bu jimgina xatoga olib keldi: kod `weights.route_fit` ni o'qib
--  `undefined` oldi, natijada barcha Match Score ballari 0 bo'lib qoldi
--  (NaN * son = NaN, keyin normalizatsiya 0 qaytardi).
--
--  Yechim: bazada ham camelCase saqlaymiz. Shunda admin paneli, xom SQL
--  hisobotlari va ilova bir xil kalitlarni ko'radi — yashirin o'zgarish
--  qolmaydi. `CamelCasePlugin` camelCase kalitni o'zgartirmaydi.
--
--  Batafsil: docs/05-database.md §5.6

UPDATE platform_settings
   SET value = jsonb_build_object(
         'proximity',   value->'proximity',
         'routeFit',    COALESCE(value->'routeFit',    value->'route_fit'),
         'capacityFit', COALESCE(value->'capacityFit', value->'capacity_fit'),
         'rating',      value->'rating',
         'priceFit',    COALESCE(value->'priceFit',    value->'price_fit'),
         'reliability', value->'reliability',
         'history',     value->'history'
       ),
       description = 'Match score ogʻirliklari (kalitlar camelCase — docs/05-database.md §5.6)',
       updated_at = now()
 WHERE key = 'matching.weights';
