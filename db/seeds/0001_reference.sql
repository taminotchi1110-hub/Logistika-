-- =====================================================================
--  KARVON — spravochnik ma'lumotlari (seed)
--  Idempotent: ON CONFLICT DO UPDATE — istalgan marta qayta ishga tushiriladi
-- =====================================================================

-- ---------- HUDUDLAR (14 ta) ----------
INSERT INTO regions (code, name_uz, name_ru, name_en, center_geom, sort_order) VALUES
 ('TAS_C','Toshkent shahri','город Ташкент','Tashkent City',        ST_SetSRID(ST_MakePoint(69.2401,41.2995),4326)::geography,  1),
 ('TAS',  'Toshkent viloyati','Ташкентская область','Tashkent Region', ST_SetSRID(ST_MakePoint(69.3500,41.0167),4326)::geography, 2),
 ('SAM',  'Samarqand','Самарканд','Samarkand',                      ST_SetSRID(ST_MakePoint(66.9597,39.6542),4326)::geography,  3),
 ('BUX',  'Buxoro','Бухара','Bukhara',                              ST_SetSRID(ST_MakePoint(64.4286,39.7747),4326)::geography,  4),
 ('AND',  'Andijon','Андижан','Andijan',                            ST_SetSRID(ST_MakePoint(72.3442,40.7821),4326)::geography,  5),
 ('FAR',  'Farg''ona','Фергана','Fergana',                          ST_SetSRID(ST_MakePoint(71.7843,40.3894),4326)::geography,  6),
 ('NAM',  'Namangan','Наманган','Namangan',                         ST_SetSRID(ST_MakePoint(71.6726,40.9983),4326)::geography,  7),
 ('NAV',  'Navoiy','Навои','Navoi',                                 ST_SetSRID(ST_MakePoint(65.3792,40.0844),4326)::geography,  8),
 ('QAS',  'Qashqadaryo','Кашкадарья','Kashkadarya',                 ST_SetSRID(ST_MakePoint(65.7847,38.8606),4326)::geography,  9),
 ('SUR',  'Surxondaryo','Сурхандарья','Surkhandarya',               ST_SetSRID(ST_MakePoint(67.2783,37.2242),4326)::geography, 10),
 ('JIZ',  'Jizzax','Джизак','Jizzakh',                              ST_SetSRID(ST_MakePoint(67.8422,40.1158),4326)::geography, 11),
 ('SIR',  'Sirdaryo','Сырдарья','Syrdarya',                         ST_SetSRID(ST_MakePoint(68.7842,40.4897),4326)::geography, 12),
 ('XOR',  'Xorazm','Хорезм','Khorezm',                              ST_SetSRID(ST_MakePoint(60.6333,41.5500),4326)::geography, 13),
 ('QOR',  'Qoraqalpog''iston Respublikasi','Республика Каракалпакстан','Republic of Karakalpakstan',
                                                                    ST_SetSRID(ST_MakePoint(59.6103,42.4531),4326)::geography, 14)
ON CONFLICT (code) DO UPDATE SET
  name_uz = EXCLUDED.name_uz, name_ru = EXCLUDED.name_ru, name_en = EXCLUDED.name_en,
  center_geom = EXCLUDED.center_geom, sort_order = EXCLUDED.sort_order;

-- ---------- TUMANLAR (Toshkent shahri — MVP fokus hududi) ----------
INSERT INTO districts (region_id, name_uz, name_ru, name_en, center_geom)
SELECT r.id, d.uz, d.ru, d.en, d.geom
FROM regions r
CROSS JOIN (VALUES
  ('Bektemir','Бектемир','Bektemir',            ST_SetSRID(ST_MakePoint(69.3350,41.2200),4326)::geography),
  ('Chilonzor','Чиланзар','Chilanzar',          ST_SetSRID(ST_MakePoint(69.2044,41.2750),4326)::geography),
  ('Mirobod','Мирабад','Mirabad',               ST_SetSRID(ST_MakePoint(69.2900,41.2900),4326)::geography),
  ('Mirzo Ulug''bek','Мирзо-Улугбек','Mirzo Ulugbek', ST_SetSRID(ST_MakePoint(69.3400,41.3300),4326)::geography),
  ('Olmazor','Алмазар','Olmazor',               ST_SetSRID(ST_MakePoint(69.2200,41.3500),4326)::geography),
  ('Sergeli','Сергели','Sergeli',               ST_SetSRID(ST_MakePoint(69.2200,41.2100),4326)::geography),
  ('Shayxontohur','Шайхантахур','Shaykhantakhur', ST_SetSRID(ST_MakePoint(69.2300,41.3200),4326)::geography),
  ('Uchtepa','Учтепа','Uchtepa',                ST_SetSRID(ST_MakePoint(69.1800,41.2900),4326)::geography),
  ('Yakkasaroy','Яккасарай','Yakkasaray',       ST_SetSRID(ST_MakePoint(69.2600,41.2800),4326)::geography),
  ('Yashnobod','Яшнабад','Yashnabad',           ST_SetSRID(ST_MakePoint(69.3200,41.2800),4326)::geography),
  ('Yunusobod','Юнусабад','Yunusabad',          ST_SetSRID(ST_MakePoint(69.2900,41.3600),4326)::geography),
  ('Yangihayot','Янгихаёт','Yangihayot',        ST_SetSRID(ST_MakePoint(69.2000,41.2000),4326)::geography)
) AS d(uz, ru, en, geom)
WHERE r.code = 'TAS_C'
ON CONFLICT (region_id, name_uz) DO NOTHING;

-- ---------- TRANSPORT TURLARI ----------
INSERT INTO vehicle_types
 (code, name_uz, name_ru, name_en, min_capacity_kg, max_capacity_kg, typical_volume_m3, icon_key, sort_order) VALUES
 ('DAMAS',        'Damas',        'Дамас',        'Damas',            300,   800,   3.0,  'van_small',   1),
 ('LABO',         'Labo',         'Лабо',         'Labo',             500,  1200,   5.0,  'pickup',      2),
 ('GAZEL',        'Gazel',        'Газель',       'Gazelle',         1000,  2000,   9.0,  'van',         3),
 ('ISUZU',        'Isuzu',        'Исузу',        'Isuzu',           2500,  5000,  25.0,  'truck_small', 4),
 ('KAMAZ',        'KamAZ',        'КамАЗ',        'KamAZ',           8000, 20000,  50.0,  'truck_big',   5),
 ('MAN',          'MAN',          'МАН',          'MAN',            12000, 20000,  70.0,  'truck_big',   6),
 ('VOLVO',        'Volvo',        'Вольво',       'Volvo',          18000, 25000,  90.0,  'truck_big',   7),
 ('SCANIA',       'Scania',       'Скания',       'Scania',         18000, 25000,  90.0,  'truck_big',   8),
 ('FURA',         'Fura',         'Фура',         'Semi-trailer',   20000, 25000, 100.0,  'trailer',     9),
 ('TIRKAMA',      'Tirkama',      'Прицеп',       'Trailer',        10000, 25000,  90.0,  'trailer',    10),
 ('SAMOSVAL',     'Samosval',     'Самосвал',     'Dump truck',     10000, 25000,  30.0,  'dump',       11),
 ('EVAKUATOR',    'Evakuator',    'Эвакуатор',    'Tow truck',       1500,  5000,   0.0,  'tow',        12),
 ('KONTEYNEROVOZ','Konteynervoz', 'Контейнеровоз','Container truck',20000, 30000,  76.0,  'container',  13)
ON CONFLICT (code) DO UPDATE SET
  name_uz = EXCLUDED.name_uz, name_ru = EXCLUDED.name_ru, name_en = EXCLUDED.name_en,
  min_capacity_kg = EXCLUDED.min_capacity_kg, max_capacity_kg = EXCLUDED.max_capacity_kg,
  typical_volume_m3 = EXCLUDED.typical_volume_m3, sort_order = EXCLUDED.sort_order;

-- ---------- KUZOV TURLARI ----------
INSERT INTO body_types (code, name_uz, name_ru, name_en, is_temperature_controlled) VALUES
 ('TENT',      'Tentli',        'Тент',           'Curtain-side',   FALSE),
 ('REF',       'Refrijerator',  'Рефрижератор',   'Refrigerated',   TRUE),
 ('IZOTERM',   'Izotermik',     'Изотерм',        'Isothermal',     TRUE),
 ('OPEN',      'Ochiq bort',    'Открытый борт',  'Flatbed',        FALSE),
 ('FURGON',    'Furgon',        'Фургон',         'Box',            FALSE),
 ('SAMOSVAL',  'Samosval',      'Самосвал',       'Tipper',         FALSE),
 ('PLATFORMA', 'Platforma',     'Платформа',      'Platform',       FALSE),
 ('SISTERNA',  'Sisterna',      'Цистерна',       'Tanker',         FALSE),
 ('CONTAINER', 'Konteyner',     'Контейнер',      'Container',      FALSE)
ON CONFLICT (code) DO UPDATE SET
  name_uz = EXCLUDED.name_uz, name_ru = EXCLUDED.name_ru, name_en = EXCLUDED.name_en,
  is_temperature_controlled = EXCLUDED.is_temperature_controlled;

-- ---------- YUK KATEGORIYALARI ----------
INSERT INTO cargo_categories (code, name_uz, name_ru, name_en, requires_special_permit, icon_key) VALUES
 ('FOOD',        'Oziq-ovqat',              'Продукты питания',      'Food',              FALSE, 'food'),
 ('CONSTRUCTION','Qurilish materiallari',   'Стройматериалы',        'Construction',      FALSE, 'construction'),
 ('FURNITURE',   'Mebel',                   'Мебель',                'Furniture',         FALSE, 'furniture'),
 ('APPLIANCES',  'Maishiy texnika',         'Бытовая техника',       'Appliances',        FALSE, 'appliance'),
 ('CLOTHING',    'Kiyim-kechak',            'Одежда',                'Clothing',          FALSE, 'clothing'),
 ('AGRO',        'Qishloq xo''jaligi mahsulotlari','Сельхозпродукция','Agriculture',      FALSE, 'agro'),
 ('METAL',       'Metall',                  'Металл',                'Metal',             FALSE, 'metal'),
 ('EQUIPMENT',   'Sanoat uskunalari',       'Промышленное оборудование','Equipment',      FALSE, 'equipment'),
 ('MOVING',      'Ko''chish (uy yuki)',     'Переезд',               'Moving',            FALSE, 'moving'),
 ('AUTO',        'Avtomobil',               'Автомобиль',            'Vehicle',           FALSE, 'car'),
 ('DANGEROUS',   'Xavfli yuk (ADR)',        'Опасный груз (ADR)',    'Dangerous goods',   TRUE,  'hazard'),
 ('OTHER',       'Boshqa',                  'Другое',                'Other',             FALSE, 'box')
ON CONFLICT (code) DO UPDATE SET
  name_uz = EXCLUDED.name_uz, name_ru = EXCLUDED.name_ru, name_en = EXCLUDED.name_en,
  requires_special_permit = EXCLUDED.requires_special_permit;

-- ---------- MAXSUS TALABLAR ----------
INSERT INTO special_requirements (code, name_uz, name_ru, name_en, extra_cost_hint_tiyin) VALUES
 ('LOADER',      'Yuk ko''taruvchi (gruzchik)','Грузчик',            'Loader helper',     5000000),
 ('HYDRO_BOARD', 'Gidrobort',                  'Гидроборт',          'Hydraulic tail-lift', 3000000),
 ('RAMP',        'Ramp',                       'Рампа',              'Ramp',              2000000),
 ('TEMP_MODE',   'Temperatura rejimi',         'Температурный режим','Temperature control', 10000000),
 ('SEAL',        'Plomba',                     'Пломба',             'Seal',              500000),
 ('GPS_CONTROL', 'GPS-nazorat',                'GPS-контроль',       'GPS monitoring',    0),
 ('BELTS',       'Kamar/mahkamlash',           'Ремни крепления',    'Cargo straps',      500000)
ON CONFLICT (code) DO UPDATE SET
  name_uz = EXCLUDED.name_uz, name_ru = EXCLUDED.name_ru, name_en = EXCLUDED.name_en;

-- ---------- TARIF REJALARI ----------
INSERT INTO tariff_plans (code, name_uz, name_ru, name_en, target_role, price_tiyin, period_days, commission_rate, features) VALUES
 ('FREE',            'Bepul',              'Бесплатный',        'Free',            'BOTH',    0,        30, NULL,
    '{"daily_offer_limit":10,"top_loads":0,"priority_match":false}'),
 ('DRIVER_PREMIUM',  'Haydovchi Premium',  'Премиум водитель',  'Driver Premium',  'DRIVER',  4900000,  30, 0.0400,
    '{"daily_offer_limit":null,"priority_match":true,"early_access_minutes":5,"badge":true}'),
 ('SHIPPER_PREMIUM', 'Klient Premium',     'Премиум клиент',    'Shipper Premium', 'SHIPPER', 9900000,  30, NULL,
    '{"top_loads":5,"verified_pool":true,"priority_support":true}'),
 ('CORP_BASIC',      'Korporativ Basic',   'Корпоративный Basic','Corporate Basic','SHIPPER', 120000000, 30, 0.0300,
    '{"monthly_loads":20,"seats":3,"reports":true}'),
 ('CORP_PRO',        'Korporativ Pro',     'Корпоративный Pro',  'Corporate Pro',  'SHIPPER', 350000000, 30, 0.0250,
    '{"monthly_loads":null,"seats":10,"api":true,"account_manager":true,"sla":true}')
ON CONFLICT (code) DO UPDATE SET
  name_uz = EXCLUDED.name_uz, price_tiyin = EXCLUDED.price_tiyin,
  commission_rate = EXCLUDED.commission_rate, features = EXCLUDED.features;

-- ---------- ADMIN ROLLARI ----------
INSERT INTO admin_roles (code, name, permissions) VALUES
 ('SUPER_ADMIN','Bosh administrator',
  '["*"]'),
 ('MODERATOR','Moderator',
  '["users.view","users.ban","docs.view","docs.verify","reviews.moderate","loads.view","orders.view"]'),
 ('SUPPORT','Qo''llab-quvvatlash',
  '["users.view","orders.view","orders.assign","orders.force_status","complaints.view","complaints.resolve","chat.view"]'),
 ('FINANCE','Moliya',
  '["payments.view","payments.refund","payouts.view","payouts.process","wallet.adjust","reports.finance"]'),
 ('ANALYST','Analitik',
  '["dashboard.view","reports.view","reports.export"]')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, permissions = EXCLUDED.permissions;
