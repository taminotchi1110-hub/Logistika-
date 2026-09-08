-- =====================================================================
--  0003 — driver_locations partitionlarini avtomatik yaratish
-- =====================================================================
--
--  MUAMMO: 0001 da faqat 2026-09 va 2026-10 partitionlari yaratilgan.
--  2026-11-01 dan keyin GPS nuqtasi yozilmaydi:
--    ERROR: no partition of relation "driver_locations" found for row
--  Bu jimgina emas — INSERT xato beradi va kuzatuv butunlay to'xtaydi.
--
--  YECHIM: kerakli partitionni talab bo'yicha yaratadigan funksiya.
--  U ikki joyda chaqiriladi:
--    1. Ilova ishga tushganda (joriy va keyingi oy uchun)
--    2. Kunlik cron job'da
--
--  NEGA pg_partman EMAS: qo'shimcha kengaytma o'rnatish kerak, u esa
--  boshqariladigan bazalarda (masalan bulutli PostgreSQL) har doim ham
--  mavjud emas. 20 qatorlik funksiya bir xil ishni bajaradi.

CREATE OR REPLACE FUNCTION ensure_driver_locations_partition(target DATE)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    period_start DATE := date_trunc('month', target)::date;
    period_end   DATE := (date_trunc('month', target) + INTERVAL '1 month')::date;
    part_name    TEXT := format('driver_locations_%s', to_char(period_start, 'YYYY_MM'));
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
        RETURN part_name || ' (allaqachon bor)';
    END IF;

    EXECUTE format(
        'CREATE TABLE %I PARTITION OF driver_locations FOR VALUES FROM (%L) TO (%L)',
        part_name, period_start, period_end
    );

    RETURN part_name || ' (yaratildi)';
END;
$$;

COMMENT ON FUNCTION ensure_driver_locations_partition(DATE) IS
    'driver_locations uchun oylik partition yaratadi. Ilova ishga tushganda va cron orqali chaqiriladi.';

-- Keyingi 12 oyni oldindan yaratamiz: cron ishlamay qolsa ham bir yil
-- xotirjam ishlaydi. Bo'sh partition deyarli joy egallamaydi.
DO $$
DECLARE
    i INT;
BEGIN
    FOR i IN 0..12 LOOP
        PERFORM ensure_driver_locations_partition((CURRENT_DATE + (i || ' month')::INTERVAL)::date);
    END LOOP;
END;
$$;
