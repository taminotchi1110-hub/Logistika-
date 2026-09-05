-- =====================================================================
--  KARVON — Logistika platformasi
--  PostgreSQL 16 + PostGIS 3.4 — to'liq sxema (1-bosqich)
--  Pul birligi: TIYIN (bigint). 1 so'm = 100 tiyin. FLOAT ISHLATILMAYDI.
--  Vaqt: timestamptz (UTC saqlanadi, mijozda Asia/Tashkent ga o'giriladi)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- matnli qidiruv (ILIKE %...%)
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- =====================================================================
--  0. ENUM TIPLAR
-- =====================================================================

CREATE TYPE user_role            AS ENUM ('SHIPPER','DRIVER','BOTH');
CREATE TYPE user_status          AS ENUM ('PENDING_PROFILE','ACTIVE','SUSPENDED','BANNED','DELETED');
CREATE TYPE verification_status  AS ENUM ('NOT_SUBMITTED','PENDING','VERIFIED','REJECTED');
CREATE TYPE driver_availability  AS ENUM ('AVAILABLE','BUSY','OFFLINE');
CREATE TYPE lang_code            AS ENUM ('uz','ru','en');

CREATE TYPE load_status          AS ENUM ('DRAFT','PUBLISHED','MATCHING','OFFERS_RECEIVED',
                                          'ASSIGNED','EXPIRED','CANCELLED');
CREATE TYPE order_status         AS ENUM ('ASSIGNED','CONFIRMED','EN_ROUTE_TO_PICKUP',
                                          'ARRIVED_AT_PICKUP','LOADED','IN_TRANSIT',
                                          'ARRIVED_AT_DELIVERY','DELIVERED','COMPLETED',
                                          'CLOSED','DISPUTED','CANCELLED_BY_SHIPPER',
                                          'CANCELLED_BY_DRIVER','CANCELLED_BY_ADMIN');
CREATE TYPE offer_status         AS ENUM ('PENDING','ACCEPTED','REJECTED','WITHDRAWN','EXPIRED');
CREATE TYPE payment_method       AS ENUM ('CASH','CARD','BANK_TRANSFER','ESCROW');
CREATE TYPE payment_status       AS ENUM ('CREATED','PENDING','HELD','PAID','FAILED','REFUNDED','CANCELLED');
CREATE TYPE psp_provider         AS ENUM ('PAYME','CLICK','UZUM','BANK','MANUAL');
CREATE TYPE ledger_account_type  AS ENUM ('USER_WALLET','ESCROW','PLATFORM_REVENUE',
                                          'PSP_CLEARING','PAYOUT_PAYABLE','BONUS');
CREATE TYPE document_type        AS ENUM ('PASSPORT','ID_CARD','DRIVER_LICENSE','VEHICLE_REG',
                                          'INSURANCE','CARGO_DOC','WAYBILL','CONTRACT',
                                          'POD','POP','SIGNATURE','OTHER');
CREATE TYPE owner_type           AS ENUM ('USER','DRIVER','VEHICLE','LOAD','ORDER','COMPANY');
CREATE TYPE message_type         AS ENUM ('TEXT','IMAGE','FILE','AUDIO','SYSTEM','LOCATION');
CREATE TYPE notification_channel AS ENUM ('IN_APP','PUSH','SMS','EMAIL');
CREATE TYPE complaint_status     AS ENUM ('OPEN','IN_REVIEW','RESOLVED','REJECTED');
CREATE TYPE rating_direction     AS ENUM ('SHIPPER_TO_DRIVER','DRIVER_TO_SHIPPER');

-- =====================================================================
--  1. SPRAVOCHNIKLAR (reference / seed data)
-- =====================================================================

-- 14 hudud: 12 viloyat + Toshkent sh. + Qoraqalpog'iston R.
CREATE TABLE regions (
    id           SMALLSERIAL PRIMARY KEY,
    code         VARCHAR(8)  NOT NULL UNIQUE,          -- 'TAS','SAM','BUX',...
    name_uz      VARCHAR(64) NOT NULL,
    name_ru      VARCHAR(64) NOT NULL,
    name_en      VARCHAR(64) NOT NULL,
    center_geom  geography(Point,4326) NOT NULL,
    boundary     geography(MultiPolygon,4326),         -- viloyat chegarasi
    sort_order   SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_regions_boundary ON regions USING GIST (boundary);

CREATE TABLE districts (
    id         SERIAL PRIMARY KEY,
    region_id  SMALLINT NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
    name_uz    VARCHAR(80) NOT NULL,
    name_ru    VARCHAR(80) NOT NULL,
    name_en    VARCHAR(80) NOT NULL,
    center_geom geography(Point,4326),
    UNIQUE (region_id, name_uz)
);
CREATE INDEX idx_districts_region ON districts(region_id);

-- Damas, Labo, Gazel, Isuzu, KamAZ, MAN, Volvo, Scania, Fura, Tirkama...
CREATE TABLE vehicle_types (
    id           SMALLSERIAL PRIMARY KEY,
    code         VARCHAR(32) NOT NULL UNIQUE,
    name_uz      VARCHAR(64) NOT NULL,
    name_ru      VARCHAR(64) NOT NULL,
    name_en      VARCHAR(64) NOT NULL,
    min_capacity_kg  INTEGER NOT NULL,
    max_capacity_kg  INTEGER NOT NULL,
    typical_volume_m3 NUMERIC(6,2),
    icon_key     VARCHAR(48),
    sort_order   SMALLINT NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- Tent, Ref (refrijerator), Izoterm, Ochiq bort, Furgon, Samosval, Platforma, Sisterna
CREATE TABLE body_types (
    id        SMALLSERIAL PRIMARY KEY,
    code      VARCHAR(32) NOT NULL UNIQUE,
    name_uz   VARCHAR(64) NOT NULL,
    name_ru   VARCHAR(64) NOT NULL,
    name_en   VARCHAR(64) NOT NULL,
    is_temperature_controlled BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE cargo_categories (
    id        SMALLSERIAL PRIMARY KEY,
    code      VARCHAR(32) NOT NULL UNIQUE,
    name_uz   VARCHAR(64) NOT NULL,
    name_ru   VARCHAR(64) NOT NULL,
    name_en   VARCHAR(64) NOT NULL,
    requires_special_permit BOOLEAN NOT NULL DEFAULT FALSE,  -- ADR, xavfli yuk
    parent_id SMALLINT REFERENCES cargo_categories(id),
    icon_key  VARCHAR(48),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Gruzchik, gidrobort, ramp, temperatura rejimi, plomba, GPS-nazorat
CREATE TABLE special_requirements (
    id       SMALLSERIAL PRIMARY KEY,
    code     VARCHAR(32) NOT NULL UNIQUE,
    name_uz  VARCHAR(64) NOT NULL,
    name_ru  VARCHAR(64) NOT NULL,
    name_en  VARCHAR(64) NOT NULL,
    extra_cost_hint_tiyin BIGINT
);

-- =====================================================================
--  2. FOYDALANUVCHILAR VA AUTENTIFIKATSIYA
-- =====================================================================

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone               VARCHAR(16) NOT NULL UNIQUE,        -- E.164: +998901234567
    phone_verified_at   TIMESTAMPTZ,
    role                user_role   NOT NULL DEFAULT 'SHIPPER',
    status              user_status NOT NULL DEFAULT 'PENDING_PROFILE',
    first_name          VARCHAR(64),
    last_name           VARCHAR(64),
    middle_name         VARCHAR(64),
    birth_date          DATE,
    avatar_key          VARCHAR(255),                        -- S3 kalit
    lang                lang_code NOT NULL DEFAULT 'uz',
    email               VARCHAR(128),
    -- shifrlangan maydonlar (ilova darajasida AES-256-GCM)
    passport_number_enc BYTEA,
    pinfl_enc           BYTEA,                               -- JShShIR
    -- xulq-atvor ko'rsatkichlari (denormalizatsiya — tez o'qish uchun)
    rating_avg          NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count        INTEGER      NOT NULL DEFAULT 0,
    completed_orders    INTEGER      NOT NULL DEFAULT 0,
    cancelled_orders    INTEGER      NOT NULL DEFAULT 0,
    token_version       INTEGER      NOT NULL DEFAULT 1,     -- barcha JWT'ni bekor qilish
    referral_code       VARCHAR(12) UNIQUE,
    referred_by         UUID REFERENCES users(id),
    last_seen_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT chk_phone_uz CHECK (phone ~ '^\+998[0-9]{9}$'),
    CONSTRAINT chk_rating   CHECK (rating_avg >= 0 AND rating_avg <= 5)
);
CREATE INDEX idx_users_status      ON users(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role        ON users(role)   WHERE deleted_at IS NULL;
CREATE INDEX idx_users_name_trgm   ON users USING GIN ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX idx_users_created     ON users(created_at DESC);

CREATE TABLE otp_requests (
    id           BIGSERIAL PRIMARY KEY,
    phone        VARCHAR(16) NOT NULL,
    code_hash    VARCHAR(64) NOT NULL,            -- SHA-256(code + pepper)
    purpose      VARCHAR(24) NOT NULL DEFAULT 'LOGIN',  -- LOGIN | PHONE_CHANGE
    attempts     SMALLINT NOT NULL DEFAULT 0,
    consumed_at  TIMESTAMPTZ,
    ip           INET,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone_created ON otp_requests(phone, created_at DESC);
CREATE INDEX idx_otp_expires       ON otp_requests(expires_at);

CREATE TABLE user_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(64) NOT NULL UNIQUE,
    device_id          VARCHAR(128),
    platform           VARCHAR(16),                -- android | ios | web
    app_version        VARCHAR(24),
    ip                 INET,
    user_agent         TEXT,
    revoked_at         TIMESTAMPTZ,
    replaced_by        UUID REFERENCES user_sessions(id),   -- rotation zanjiri
    expires_at         TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at       TIMESTAMPTZ
);
CREATE INDEX idx_sessions_user ON user_sessions(user_id) WHERE revoked_at IS NULL;

CREATE TABLE devices (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token   TEXT NOT NULL,
    device_id   VARCHAR(128) NOT NULL,
    platform    VARCHAR(16)  NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, device_id)
);
CREATE INDEX idx_devices_user_active ON devices(user_id) WHERE is_active;

CREATE TABLE login_history (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    phone       VARCHAR(16),
    success     BOOLEAN NOT NULL,
    fail_reason VARCHAR(64),
    ip          INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_history_user ON login_history(user_id, created_at DESC);

-- =====================================================================
--  3. PROFILLAR
-- =====================================================================

CREATE TABLE companies (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name          VARCHAR(160) NOT NULL,
    inn           VARCHAR(9)  UNIQUE,               -- STIR
    mfo           VARCHAR(5),
    bank_account  VARCHAR(24),
    bank_name     VARCHAR(160),
    legal_address TEXT,
    region_id     SMALLINT REFERENCES regions(id),
    is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    vat_payer     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_companies_owner ON companies(owner_user_id);

CREATE TABLE shipper_profiles (
    user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_id        UUID REFERENCES companies(id) ON DELETE SET NULL,
    default_region_id SMALLINT REFERENCES regions(id),
    total_loads       INTEGER NOT NULL DEFAULT 0,
    total_spent_tiyin BIGINT  NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE driver_profiles (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_id           UUID REFERENCES companies(id) ON DELETE SET NULL,
    license_number_enc   BYTEA,
    license_categories   VARCHAR(16),                       -- 'B,C,CE'
    license_expires_at   DATE,
    experience_years     SMALLINT,
    verification_status  verification_status NOT NULL DEFAULT 'NOT_SUBMITTED',
    verified_at          TIMESTAMPTZ,
    verified_by          UUID,                              -- admin_users.id
    rejection_reason     TEXT,
    availability         driver_availability NOT NULL DEFAULT 'OFFLINE',
    home_region_id       SMALLINT REFERENCES regions(id),   -- backhaul uchun "baza"
    current_geom         geography(Point,4326),             -- oxirgi joylashuv (cache)
    current_geom_at      TIMESTAMPTZ,
    accepts_intercity    BOOLEAN NOT NULL DEFAULT TRUE,
    accepts_international BOOLEAN NOT NULL DEFAULT FALSE,
    response_rate        NUMERIC(4,3) NOT NULL DEFAULT 0,   -- 0..1
    avg_response_sec     INTEGER,
    cancel_rate_90d      NUMERIC(4,3) NOT NULL DEFAULT 0,
    on_time_rate         NUMERIC(4,3) NOT NULL DEFAULT 0,
    total_distance_km    BIGINT NOT NULL DEFAULT 0,
    total_earned_tiyin   BIGINT NOT NULL DEFAULT 0,
    is_premium           BOOLEAN NOT NULL DEFAULT FALSE,
    premium_until        TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_driver_avail   ON driver_profiles(availability)
    WHERE verification_status = 'VERIFIED';
CREATE INDEX idx_driver_geom    ON driver_profiles USING GIST (current_geom);
CREATE INDEX idx_driver_verif   ON driver_profiles(verification_status);
CREATE INDEX idx_driver_home    ON driver_profiles(home_region_id);

-- =====================================================================
--  4. TRANSPORT
-- =====================================================================

CREATE TABLE vehicles (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id       UUID REFERENCES companies(id) ON DELETE SET NULL,
    vehicle_type_id  SMALLINT NOT NULL REFERENCES vehicle_types(id),
    body_type_id     SMALLINT NOT NULL REFERENCES body_types(id),
    brand            VARCHAR(48) NOT NULL,
    model            VARCHAR(48) NOT NULL,
    year             SMALLINT,
    plate_number     VARCHAR(16) NOT NULL,             -- 01A123BC
    color            VARCHAR(32),
    capacity_kg      INTEGER NOT NULL,
    volume_m3        NUMERIC(7,2) NOT NULL,
    length_m         NUMERIC(5,2),
    width_m          NUMERIC(5,2),
    height_m         NUMERIC(5,2),
    has_trailer      BOOLEAN NOT NULL DEFAULT FALSE,
    trailer_capacity_kg INTEGER,
    trailer_volume_m3   NUMERIC(7,2),
    has_hydro_board  BOOLEAN NOT NULL DEFAULT FALSE,
    has_ramp         BOOLEAN NOT NULL DEFAULT FALSE,
    temp_min_c       SMALLINT,                          -- ref/izoterm uchun
    temp_max_c       SMALLINT,
    adr_certified    BOOLEAN NOT NULL DEFAULT FALSE,
    insurance_expires_at DATE,
    inspection_expires_at DATE,
    verification_status verification_status NOT NULL DEFAULT 'NOT_SUBMITTED',
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    is_primary       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,
    CONSTRAINT chk_capacity CHECK (capacity_kg > 0 AND capacity_kg <= 60000),
    CONSTRAINT chk_volume   CHECK (volume_m3 > 0)
);
CREATE UNIQUE INDEX uq_vehicles_plate ON vehicles(plate_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_vehicles_driver ON vehicles(driver_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_vehicles_match  ON vehicles(vehicle_type_id, body_type_id, capacity_kg, volume_m3)
    WHERE is_active AND deleted_at IS NULL;

-- Haydovchi ishlaydigan yo'nalishlar (matching route_fit uchun)
CREATE TABLE driver_routes (
    id             BIGSERIAL PRIMARY KEY,
    driver_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_region_id SMALLINT NOT NULL REFERENCES regions(id),
    to_region_id   SMALLINT REFERENCES regions(id),      -- NULL = "istalgan joyga"
    is_regular     BOOLEAN NOT NULL DEFAULT FALSE,
    priority       SMALLINT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (driver_id, from_region_id, to_region_id)
);
CREATE INDEX idx_driver_routes_lookup ON driver_routes(from_region_id, to_region_id);

-- =====================================================================
--  5. MANZILLAR
-- =====================================================================

CREATE TABLE saved_addresses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label        VARCHAR(64) NOT NULL,               -- 'Ombor', 'Do'kon'
    address_text TEXT NOT NULL,
    region_id    SMALLINT REFERENCES regions(id),
    district_id  INTEGER  REFERENCES districts(id),
    geom         geography(Point,4326) NOT NULL,
    contact_name  VARCHAR(96),
    contact_phone VARCHAR(16),
    notes        TEXT,
    use_count    INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_saved_addr_user ON saved_addresses(user_id);
CREATE INDEX idx_saved_addr_geom ON saved_addresses USING GIST (geom);

-- =====================================================================
--  6. YUK (LOAD)
-- =====================================================================

CREATE TABLE loads (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_no         BIGINT GENERATED ALWAYS AS IDENTITY,   -- foydalanuvchiga ko'rinadigan № 100234
    shipper_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    company_id        UUID REFERENCES companies(id) ON DELETE SET NULL,
    status            load_status NOT NULL DEFAULT 'DRAFT',

    -- yuk
    title             VARCHAR(160) NOT NULL,
    description       TEXT,
    category_id       SMALLINT NOT NULL REFERENCES cargo_categories(id),
    weight_kg         INTEGER NOT NULL,
    volume_m3         NUMERIC(7,2),
    packages_count    INTEGER,
    package_type      VARCHAR(32),                    -- palet | qop | quti | bochka | ...
    is_fragile        BOOLEAN NOT NULL DEFAULT FALSE,
    temp_min_c        SMALLINT,
    temp_max_c        SMALLINT,

    -- olish nuqtasi
    pickup_address    TEXT NOT NULL,
    pickup_region_id  SMALLINT NOT NULL REFERENCES regions(id),
    pickup_district_id INTEGER REFERENCES districts(id),
    pickup_geom       geography(Point,4326) NOT NULL,
    pickup_contact_name  VARCHAR(96),
    pickup_contact_phone VARCHAR(16),
    pickup_from       TIMESTAMPTZ NOT NULL,
    pickup_to         TIMESTAMPTZ NOT NULL,

    -- yetkazish nuqtasi
    delivery_address  TEXT NOT NULL,
    delivery_region_id SMALLINT NOT NULL REFERENCES regions(id),
    delivery_district_id INTEGER REFERENCES districts(id),
    delivery_geom     geography(Point,4326) NOT NULL,
    delivery_contact_name  VARCHAR(96),
    delivery_contact_phone VARCHAR(16),
    delivery_by       TIMESTAMPTZ,

    -- hisoblangan
    distance_km       NUMERIC(8,2),
    duration_min      INTEGER,
    route_polyline    TEXT,                            -- encoded polyline (OSRM)

    -- talablar
    required_vehicle_type_ids SMALLINT[] NOT NULL DEFAULT '{}',
    required_body_type_ids    SMALLINT[] NOT NULL DEFAULT '{}',
    special_requirement_ids   SMALLINT[] NOT NULL DEFAULT '{}',

    -- narx
    price_tiyin       BIGINT,
    is_negotiable     BOOLEAN NOT NULL DEFAULT FALSE,
    payment_method    payment_method NOT NULL DEFAULT 'CASH',
    suggested_price_tiyin BIGINT,                      -- tizim tavsiyasi

    -- xizmat maydonlari
    is_top            BOOLEAN NOT NULL DEFAULT FALSE,  -- pullik TOP e'lon
    top_until         TIMESTAMPTZ,
    view_count        INTEGER NOT NULL DEFAULT 0,
    offer_count       INTEGER NOT NULL DEFAULT 0,
    published_at      TIMESTAMPTZ,
    expires_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_weight        CHECK (weight_kg > 0 AND weight_kg <= 60000),
    CONSTRAINT chk_pickup_window CHECK (pickup_to >= pickup_from),
    CONSTRAINT chk_price         CHECK (price_tiyin IS NULL OR price_tiyin > 0)
);
CREATE INDEX idx_loads_status_pub   ON loads(status, published_at DESC)
    WHERE status IN ('PUBLISHED','MATCHING','OFFERS_RECEIVED');
CREATE INDEX idx_loads_shipper      ON loads(shipper_id, created_at DESC);
CREATE INDEX idx_loads_route        ON loads(pickup_region_id, delivery_region_id, pickup_from);
CREATE INDEX idx_loads_pickup_geom  ON loads USING GIST (pickup_geom);
CREATE INDEX idx_loads_deliv_geom   ON loads USING GIST (delivery_geom);
CREATE INDEX idx_loads_vtypes       ON loads USING GIN (required_vehicle_type_ids);
CREATE INDEX idx_loads_btypes       ON loads USING GIN (required_body_type_ids);
CREATE INDEX idx_loads_expires      ON loads(expires_at) WHERE status IN ('PUBLISHED','MATCHING');
CREATE INDEX idx_loads_title_trgm   ON loads USING GIN (title gin_trgm_ops);

-- =====================================================================
--  7. MATCHING NATIJALARI
-- =====================================================================

CREATE TABLE load_matches (
    id             BIGSERIAL PRIMARY KEY,
    load_id        UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
    driver_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id     UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    match_score    NUMERIC(5,2) NOT NULL,            -- 0.00 .. 100.00
    score_breakdown JSONB NOT NULL,                  -- {proximity:0.9, route_fit:1, ...}
    distance_to_pickup_km NUMERIC(8,2),
    weights_version VARCHAR(16) NOT NULL DEFAULT 'v1',
    rank           SMALLINT NOT NULL,
    notified_at    TIMESTAMPTZ,
    viewed_at      TIMESTAMPTZ,
    offered_at     TIMESTAMPTZ,                       -- ML training uchun label
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (load_id, driver_id)
);
CREATE INDEX idx_matches_driver ON load_matches(driver_id, created_at DESC);
CREATE INDEX idx_matches_load   ON load_matches(load_id, match_score DESC);

-- =====================================================================
--  8. TAKLIFLAR (OFFERS)
-- =====================================================================

CREATE TABLE order_offers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    load_id        UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
    driver_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id     UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    initiator      VARCHAR(8) NOT NULL DEFAULT 'DRIVER',   -- DRIVER | SHIPPER
    offered_price_tiyin BIGINT NOT NULL,
    message        TEXT,
    status         offer_status NOT NULL DEFAULT 'PENDING',
    eta_to_pickup_min INTEGER,
    match_score    NUMERIC(5,2),
    expires_at     TIMESTAMPTZ NOT NULL,
    responded_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_offer_price CHECK (offered_price_tiyin > 0)
);
-- bitta haydovchi bitta yukka faqat 1 ta faol offer
CREATE UNIQUE INDEX uq_offer_active ON order_offers(load_id, driver_id)
    WHERE status = 'PENDING';
CREATE INDEX idx_offers_load   ON order_offers(load_id, status, created_at DESC);
CREATE INDEX idx_offers_driver ON order_offers(driver_id, status, created_at DESC);
CREATE INDEX idx_offers_expiry ON order_offers(expires_at) WHERE status = 'PENDING';

-- =====================================================================
--  9. BUYURTMALAR
-- =====================================================================

CREATE TABLE orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_no         BIGINT GENERATED ALWAYS AS IDENTITY,
    load_id           UUID NOT NULL UNIQUE REFERENCES loads(id) ON DELETE RESTRICT,
    offer_id          UUID REFERENCES order_offers(id) ON DELETE SET NULL,
    shipper_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    driver_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    vehicle_id        UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    status            order_status NOT NULL DEFAULT 'ASSIGNED',

    -- moliya (buyurtma yaratilganda "muzlatiladi")
    price_tiyin          BIGINT NOT NULL,
    commission_rate      NUMERIC(5,4) NOT NULL,        -- 0.0500 = 5%
    commission_tiyin     BIGINT NOT NULL,
    driver_payout_tiyin  BIGINT NOT NULL,
    payment_method       payment_method NOT NULL,
    payment_status       payment_status NOT NULL DEFAULT 'CREATED',

    -- reja va fakt
    planned_distance_km  NUMERIC(8,2),
    actual_distance_km   NUMERIC(8,2),
    planned_duration_min INTEGER,
    eta_at               TIMESTAMPTZ,

    confirmed_at         TIMESTAMPTZ,
    started_at           TIMESTAMPTZ,
    picked_up_at         TIMESTAMPTZ,
    delivered_at         TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    closed_at            TIMESTAMPTZ,
    cancelled_at         TIMESTAMPTZ,
    cancel_reason        TEXT,
    cancelled_by         UUID REFERENCES users(id),
    penalty_tiyin        BIGINT NOT NULL DEFAULT 0,

    tracking_token       VARCHAR(32) UNIQUE,           -- ochiq tracking havolasi
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_money CHECK (
        price_tiyin > 0 AND commission_tiyin >= 0 AND
        driver_payout_tiyin = price_tiyin - commission_tiyin
    )
);
CREATE INDEX idx_orders_driver_status  ON orders(driver_id, status, created_at DESC);
CREATE INDEX idx_orders_shipper_status ON orders(shipper_id, status, created_at DESC);
CREATE INDEX idx_orders_status         ON orders(status);
CREATE INDEX idx_orders_created        ON orders(created_at DESC);
-- bitta haydovchida bir vaqtda faqat bitta faol buyurtma
CREATE UNIQUE INDEX uq_driver_active_order ON orders(driver_id)
    WHERE status IN ('CONFIRMED','EN_ROUTE_TO_PICKUP','ARRIVED_AT_PICKUP',
                     'LOADED','IN_TRANSIT','ARRIVED_AT_DELIVERY');

CREATE TABLE order_status_history (
    id          BIGSERIAL PRIMARY KEY,
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status order_status,
    to_status   order_status NOT NULL,
    actor_id    UUID REFERENCES users(id),
    actor_role  VARCHAR(16),                    -- SHIPPER | DRIVER | ADMIN | SYSTEM
    geom        geography(Point,4326),          -- statusni qayerda o'zgartirgan
    note        TEXT,
    meta        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_osh_order ON order_status_history(order_id, created_at);

-- =====================================================================
--  10. GPS TRACKING (partitioned)
-- =====================================================================

CREATE TABLE driver_locations (
    id           BIGSERIAL,
    driver_id    UUID NOT NULL,
    order_id     UUID,
    geom         geography(Point,4326) NOT NULL,
    speed_kmh    NUMERIC(5,1),
    heading_deg  SMALLINT,
    accuracy_m   NUMERIC(6,1),
    altitude_m   NUMERIC(7,1),
    battery_pct  SMALLINT,
    is_mock      BOOLEAN NOT NULL DEFAULT FALSE,   -- fake GPS aniqlash
    recorded_at  TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Partitionlar cron bilan avtomatik yaratiladi (pg_partman yoki o'z job'imiz)
CREATE TABLE driver_locations_2026_09 PARTITION OF driver_locations
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE driver_locations_2026_10 PARTITION OF driver_locations
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE INDEX idx_dl_driver_time ON driver_locations(driver_id, recorded_at DESC);
CREATE INDEX idx_dl_order_time  ON driver_locations(order_id, recorded_at)
    WHERE order_id IS NOT NULL;
CREATE INDEX idx_dl_geom        ON driver_locations USING GIST (geom);

-- Buyurtma yakunlanganda marshrut siqilgan holda saqlanadi (arxiv)
CREATE TABLE order_tracks (
    order_id        UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    polyline        TEXT NOT NULL,               -- encoded, soddalashtirilgan
    points_count    INTEGER NOT NULL,
    distance_km     NUMERIC(8,2) NOT NULL,
    duration_min    INTEGER NOT NULL,
    avg_speed_kmh   NUMERIC(5,1),
    max_speed_kmh   NUMERIC(5,1),
    stops_count     SMALLINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
--  11. CHAT
-- =====================================================================

CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    load_id     UUID REFERENCES loads(id) ON DELETE CASCADE,   -- offer bosqichidagi chat
    shipper_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    driver_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
    last_message_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_shipper ON conversations(shipper_id, last_message_at DESC);
CREATE INDEX idx_conv_driver  ON conversations(driver_id,  last_message_at DESC);

CREATE TABLE messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = SYSTEM
    type            message_type NOT NULL DEFAULT 'TEXT',
    body            TEXT,
    attachment_key  VARCHAR(255),
    attachment_name VARCHAR(160),
    attachment_size INTEGER,
    duration_sec    SMALLINT,                    -- audio uchun
    geom            geography(Point,4326),       -- LOCATION turi uchun
    delivered_at    TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_unread ON messages(conversation_id) WHERE read_at IS NULL;

-- =====================================================================
--  12. BILDIRISHNOMALAR
-- =====================================================================

CREATE TABLE notifications (
    id           BIGSERIAL PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_key VARCHAR(64) NOT NULL,           -- 'order.confirmed'
    title        VARCHAR(160) NOT NULL,
    body         TEXT NOT NULL,
    channel      notification_channel NOT NULL DEFAULT 'IN_APP',
    entity_type  VARCHAR(24),                    -- ORDER | LOAD | PAYMENT
    entity_id    UUID,
    deep_link    VARCHAR(255),
    data         JSONB,
    is_read      BOOLEAN NOT NULL DEFAULT FALSE,
    read_at      TIMESTAMPTZ,
    sent_at      TIMESTAMPTZ,
    delivery_status VARCHAR(16),                 -- SENT | FAILED | SKIPPED
    dedupe_key   VARCHAR(96),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notif_unread ON notifications(user_id) WHERE NOT is_read;
CREATE UNIQUE INDEX uq_notif_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE notification_settings (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    push_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    new_load_push BOOLEAN NOT NULL DEFAULT TRUE,
    quiet_from    TIME,
    quiet_to      TIME,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
--  13. MOLIYA — DOUBLE-ENTRY LEDGER
-- =====================================================================

CREATE TABLE ledger_accounts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type         ledger_account_type NOT NULL,
    user_id      UUID REFERENCES users(id) ON DELETE RESTRICT,   -- USER_WALLET uchun
    currency     CHAR(3) NOT NULL DEFAULT 'UZS',
    balance_tiyin BIGINT NOT NULL DEFAULT 0,      -- denormalizatsiya (entrylar yig'indisi)
    credit_limit_tiyin BIGINT NOT NULL DEFAULT 0, -- manfiy balansga ruxsat (masalan −20 000 000)
    is_locked    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ledger_user_wallet ON ledger_accounts(user_id, type)
    WHERE type = 'USER_WALLET';
CREATE INDEX idx_ledger_type ON ledger_accounts(type);

-- Append-only. UPDATE/DELETE trigger bilan taqiqlanadi.
CREATE TABLE ledger_entries (
    id             BIGSERIAL PRIMARY KEY,
    transaction_id UUID NOT NULL,                  -- bitta operatsiyaning barcha yozuvlari
    account_id     UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    amount_tiyin   BIGINT NOT NULL,                -- + kirim, − chiqim
    balance_after_tiyin BIGINT NOT NULL,
    entry_type     VARCHAR(32) NOT NULL,           -- TOPUP|COMMISSION|PAYOUT|REFUND|PENALTY|BONUS
    order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
    payment_id     UUID,
    description    TEXT,
    meta           JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_amount_nonzero CHECK (amount_tiyin <> 0)
);
CREATE INDEX idx_entries_account ON ledger_entries(account_id, created_at DESC);
CREATE INDEX idx_entries_txn     ON ledger_entries(transaction_id);
CREATE INDEX idx_entries_order   ON ledger_entries(order_id) WHERE order_id IS NOT NULL;

-- INVARIANT: har bir transaction_id bo'yicha SUM(amount_tiyin) = 0
CREATE OR REPLACE FUNCTION assert_ledger_balanced() RETURNS TRIGGER AS $$
DECLARE s BIGINT;
BEGIN
    SELECT COALESCE(SUM(amount_tiyin),0) INTO s
      FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
    IF s <> 0 THEN
        RAISE EXCEPTION 'Ledger balanslanmagan: transaction_id=% sum=%', NEW.transaction_id, s;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_ledger_balanced
    AFTER INSERT ON ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION assert_ledger_balanced();

CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'ledger_entries append-only: UPDATE/DELETE taqiqlangan'; END $$
LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_immutable
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

-- PSP (Payme/Click) bilan tashqi to'lovlar
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    provider        psp_provider NOT NULL,
    provider_txn_id VARCHAR(96),
    idempotency_key VARCHAR(96) NOT NULL UNIQUE,
    purpose         VARCHAR(24) NOT NULL,          -- WALLET_TOPUP | ORDER_ESCROW | SUBSCRIPTION
    amount_tiyin    BIGINT NOT NULL,
    fee_tiyin       BIGINT NOT NULL DEFAULT 0,
    status          payment_status NOT NULL DEFAULT 'CREATED',
    raw_request     JSONB,
    raw_callback    JSONB,
    error_code      VARCHAR(48),
    error_message   TEXT,
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_payment_amount CHECK (amount_tiyin > 0)
);
CREATE INDEX idx_payments_user     ON payments(user_id, created_at DESC);
CREATE INDEX idx_payments_order    ON payments(order_id);
CREATE UNIQUE INDEX uq_payments_provider_txn ON payments(provider, provider_txn_id)
    WHERE provider_txn_id IS NOT NULL;

CREATE TABLE payouts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
    amount_tiyin   BIGINT NOT NULL,
    method         VARCHAR(24) NOT NULL,           -- CARD | BANK
    card_token     VARCHAR(96),                    -- PAN SAQLANMAYDI, faqat token
    card_mask      VARCHAR(20),                    -- 8600 **** **** 1234
    status         payment_status NOT NULL DEFAULT 'CREATED',
    provider       psp_provider,
    provider_txn_id VARCHAR(96),
    requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at   TIMESTAMPTZ,
    failure_reason TEXT
);
CREATE INDEX idx_payouts_driver ON payouts(driver_id, requested_at DESC);
CREATE INDEX idx_payouts_status ON payouts(status);

-- =====================================================================
--  14. TARIFLAR VA OBUNALAR
-- =====================================================================

CREATE TABLE tariff_plans (
    id              SMALLSERIAL PRIMARY KEY,
    code            VARCHAR(32) NOT NULL UNIQUE,   -- FREE | DRIVER_PREMIUM | CORP_BASIC
    name_uz         VARCHAR(96) NOT NULL,
    name_ru         VARCHAR(96) NOT NULL,
    name_en         VARCHAR(96) NOT NULL,
    target_role     user_role NOT NULL,
    price_tiyin     BIGINT NOT NULL DEFAULT 0,
    period_days     SMALLINT NOT NULL DEFAULT 30,
    commission_rate NUMERIC(5,4),                  -- shu tarifda komissiya
    features        JSONB NOT NULL DEFAULT '{}',   -- {top_loads:5, priority_match:true}
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id     SMALLINT NOT NULL REFERENCES tariff_plans(id),
    payment_id  UUID REFERENCES payments(id),
    starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at     TIMESTAMPTZ NOT NULL,
    auto_renew  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_user_active ON subscriptions(user_id) WHERE is_active;

-- =====================================================================
--  15. REYTING VA SHIKOYATLAR
-- =====================================================================

CREATE TABLE ratings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rater_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rated_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction     rating_direction NOT NULL,
    score         SMALLINT NOT NULL,
    punctuality   SMALLINT,       -- vaqtida yetkazish
    communication SMALLINT,       -- muomala
    cargo_condition SMALLINT,     -- yuk holati
    reliability   SMALLINT,       -- ishonchlilik
    comment       TEXT,
    is_visible    BOOLEAN NOT NULL DEFAULT FALSE,   -- double-blind: ikkalasi bergach TRUE
    is_moderated  BOOLEAN NOT NULL DEFAULT FALSE,
    moderated_by  UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, rater_id),
    CONSTRAINT chk_score CHECK (score BETWEEN 1 AND 5),
    CONSTRAINT chk_sub_scores CHECK (
        (punctuality     IS NULL OR punctuality     BETWEEN 1 AND 5) AND
        (communication   IS NULL OR communication   BETWEEN 1 AND 5) AND
        (cargo_condition IS NULL OR cargo_condition BETWEEN 1 AND 5) AND
        (reliability     IS NULL OR reliability     BETWEEN 1 AND 5)
    )
);
CREATE INDEX idx_ratings_rated ON ratings(rated_id, created_at DESC) WHERE is_visible;
CREATE INDEX idx_ratings_order ON ratings(order_id);

CREATE TABLE complaints (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
    category      VARCHAR(48) NOT NULL,   -- KECHIKISH | YUK_SHIKAST | TOLOV | MUOMALA | FIRIBGARLIK
    subject       VARCHAR(160) NOT NULL,
    description   TEXT NOT NULL,
    attachments   JSONB,                  -- S3 kalitlar ro'yxati
    status        complaint_status NOT NULL DEFAULT 'OPEN',
    priority      SMALLINT NOT NULL DEFAULT 3,   -- 1=kritik
    assigned_to   UUID,                   -- admin_users.id
    resolution    TEXT,
    resolved_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_complaints_status ON complaints(status, priority, created_at);
CREATE INDEX idx_complaints_order  ON complaints(order_id);

-- =====================================================================
--  16. HUJJATLAR
-- =====================================================================

CREATE TABLE documents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type    owner_type NOT NULL,
    owner_id      UUID NOT NULL,
    type          document_type NOT NULL,
    file_key      VARCHAR(255) NOT NULL,        -- S3 kalit (private bucket)
    file_name     VARCHAR(160),
    mime_type     VARCHAR(64),
    size_bytes    INTEGER,
    checksum_sha256 VARCHAR(64),
    page_side     VARCHAR(8),                   -- FRONT | BACK
    verification_status verification_status NOT NULL DEFAULT 'PENDING',
    verified_by   UUID,
    verified_at   TIMESTAMPTZ,
    rejection_reason TEXT,
    expires_at    DATE,
    uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_docs_owner  ON documents(owner_type, owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_docs_verify ON documents(verification_status, created_at)
    WHERE verification_status = 'PENDING';
CREATE INDEX idx_docs_expiry ON documents(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================================
--  17. SEVIMLILAR VA QORA RO'YXAT
-- =====================================================================

CREATE TABLE favorites (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note        VARCHAR(160),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, target_id)
);

CREATE TABLE blacklists (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, target_id)
);
CREATE INDEX idx_blacklist_user ON blacklists(user_id);

-- =====================================================================
--  18. ADMIN
-- =====================================================================

CREATE TABLE admin_roles (
    id          SMALLSERIAL PRIMARY KEY,
    code        VARCHAR(32) NOT NULL UNIQUE,  -- SUPER_ADMIN|MODERATOR|SUPPORT|FINANCE|ANALYST
    name        VARCHAR(64) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'   -- ["users.ban","docs.verify","payments.refund"]
);

CREATE TABLE admin_users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          VARCHAR(128) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,      -- Argon2id
    full_name      VARCHAR(128) NOT NULL,
    role_id        SMALLINT NOT NULL REFERENCES admin_roles(id),
    phone          VARCHAR(16),
    totp_secret_enc BYTEA,                     -- majburiy 2FA
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at  TIMESTAMPTZ,
    last_login_ip  INET,
    failed_attempts SMALLINT NOT NULL DEFAULT 0,
    locked_until   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    admin_id    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(64) NOT NULL,          -- user.ban, doc.verify, settings.update
    entity_type VARCHAR(32),
    entity_id   UUID,
    before      JSONB,
    after       JSONB,
    ip          INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_admin  ON audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);

CREATE TABLE platform_settings (
    key          VARCHAR(64) PRIMARY KEY,
    value        JSONB NOT NULL,
    description  TEXT,
    updated_by   UUID REFERENCES admin_users(id),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Boshlang'ich sozlamalar
INSERT INTO platform_settings(key, value, description) VALUES
 ('commission.default_rate',      '0.05',  'Standart komissiya foizi'),
 ('commission.intercity_rate',    '0.04',  'Viloyatlararo komissiya'),
 ('matching.radius_steps_km',     '[30,80,200]', 'Qidiruv radiusi bosqichlari'),
 ('matching.min_score_for_push',  '45',    'Push yuborish uchun minimal ball'),
 ('matching.weights',             '{"proximity":0.28,"route_fit":0.20,"capacity_fit":0.14,"rating":0.14,"price_fit":0.10,"reliability":0.08,"history":0.06}', 'Match score og''irliklari'),
 ('offer.ttl_minutes',            '30',    'Taklif amal qilish muddati'),
 ('wallet.negative_limit_tiyin',  '-20000000', 'Hamyon manfiy limiti (−200 000 so''m)'),
 ('cancel.penalty_rate',          '0.10',  'Bekor qilish jarimasi'),
 ('tracking.interval_sec',        '10',    'Faol buyurtmada GPS intervali');

-- =====================================================================
--  19. ANALITIKA (matching va narx tavsiyasi uchun)
-- =====================================================================

CREATE TABLE route_price_stats (
    id                BIGSERIAL PRIMARY KEY,
    from_region_id    SMALLINT NOT NULL REFERENCES regions(id),
    to_region_id      SMALLINT NOT NULL REFERENCES regions(id),
    vehicle_type_id   SMALLINT NOT NULL REFERENCES vehicle_types(id),
    period_start      DATE NOT NULL,
    orders_count      INTEGER NOT NULL,
    median_price_tiyin BIGINT NOT NULL,
    p25_price_tiyin   BIGINT,
    p75_price_tiyin   BIGINT,
    avg_price_per_km_tiyin BIGINT,
    avg_distance_km   NUMERIC(8,2),
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_region_id, to_region_id, vehicle_type_id, period_start)
);
CREATE INDEX idx_rps_lookup ON route_price_stats(from_region_id, to_region_id, vehicle_type_id, period_start DESC);

-- Bo'sh qaytish niyati (backhaul)
CREATE TABLE return_load_intents (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
    from_geom      geography(Point,4326) NOT NULL,
    to_region_id   SMALLINT NOT NULL REFERENCES regions(id),
    available_from TIMESTAMPTZ NOT NULL,
    available_to   TIMESTAMPTZ NOT NULL,
    max_detour_km  INTEGER NOT NULL DEFAULT 50,
    min_price_tiyin BIGINT,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rli_active ON return_load_intents(to_region_id, available_from)
    WHERE is_active;
CREATE INDEX idx_rli_geom   ON return_load_intents USING GIST (from_geom);

-- =====================================================================
--  20. UMUMIY TRIGGERLAR
-- =====================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','companies','shipper_profiles','driver_profiles',
                           'vehicles','loads','orders','payments','ledger_accounts',
                           'devices','admin_users']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t);
  END LOOP;
END $$;
