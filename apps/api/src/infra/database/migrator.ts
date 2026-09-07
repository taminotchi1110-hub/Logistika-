/* eslint-disable no-console */
/**
 * KARVON — SQL-first migratsiya vositasi.
 *
 * NEGA ORM MIGRATSIYASI EMAS:
 * Sxemamizda PostGIS tiplari, RANGE partitioning, DEFERRABLE constraint triggerlar
 * va partial unique indekslar bor. Hech bir ORM generatori bularni to'g'ri
 * chiqarmaydi — natijada "generatsiya qilingan, keyin qo'lda tuzatilgan" migratsiya
 * paydo bo'ladi va uni hech kim ishonch bilan o'qiy olmaydi.
 * Shuning uchun **SQL — yagona haqiqat manbai**, bu skript esa uni tartib bilan
 * qo'llaydi va bajarilganini `schema_migrations` jadvalida qayd qiladi.
 *
 * Buyruqlar:
 *   npm run db:migrate   — qo'llanmagan migratsiyalarni qo'llaydi
 *   npm run db:seed      — spravochnik ma'lumotlarini yuklaydi (idempotent)
 *   npm run db:status    — qaysi migratsiya qo'llangan / qo'llanmaganini ko'rsatadi
 *   npm run db:reset     — public sxemani TO'LIQ o'chiradi va qaytadan quradi (faqat dev)
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

// .env repo ildizida turadi (apps/api dan ikki daraja yuqorida)
loadEnv({ path: resolve(process.cwd(), '../../.env') });

type Command = 'up' | 'seed' | 'status' | 'reset';

const MIGRATIONS_DIR =
  process.env.DB_MIGRATIONS_DIR ?? resolve(process.cwd(), '../../db/migrations');
const SEEDS_DIR = process.env.DB_SEEDS_DIR ?? resolve(process.cwd(), '../../db/seeds');

interface SqlFile {
  name: string;
  path: string;
  sql: string;
  checksum: string;
}

function loadSqlFiles(dir: string): SqlFile[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(`Papka topilmadi: ${dir}`);
  }

  return entries
    .filter((f) => f.endsWith('.sql'))
    .sort() // 0001_, 0002_ … leksikografik tartib = qo'llash tartibi
    .map((name) => {
      const path = resolve(dir, name);
      const sql = readFileSync(path, 'utf8');
      return { name, path, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL o'rnatilmagan. `.env` faylini yarating (.env.example dan nusxa oling).",
    );
  }
  return url;
}

async function connect(): Promise<Client> {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  return client;
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(255) PRIMARY KEY,
      checksum    VARCHAR(64)  NOT NULL,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
      duration_ms INTEGER      NOT NULL
    );
  `);
}

async function appliedMigrations(client: Client): Promise<Map<string, string>> {
  const { rows } = await client.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  return new Map(rows.map((r) => [r.name, r.checksum]));
}

async function up(): Promise<void> {
  const client = await connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await appliedMigrations(client);
    const files = loadSqlFiles(MIGRATIONS_DIR);
    let count = 0;

    for (const file of files) {
      const previous = applied.get(file.name);

      if (previous) {
        // Qo'llangan migratsiya keyin o'zgartirilgan bo'lsa — bu jiddiy xato.
        // Migratsiya o'zgarmas: tuzatish kerak bo'lsa YANGI fayl yoziladi.
        if (previous !== file.checksum) {
          throw new Error(
            `Migratsiya o'zgartirilgan: ${file.name}\n` +
              `Qo'llangan migratsiyani tahrirlash mumkin emas — yangi migratsiya fayli yarating.`,
          );
        }
        continue;
      }

      const started = Date.now();
      process.stdout.write(`  → ${file.name} … `);
      try {
        await client.query('BEGIN');
        await client.query(file.sql);
        const duration = Date.now() - started;
        await client.query(
          'INSERT INTO schema_migrations (name, checksum, duration_ms) VALUES ($1, $2, $3)',
          [file.name, file.checksum, duration],
        );
        await client.query('COMMIT');
        console.log(`OK (${duration} ms)`);
        count++;
      } catch (error) {
        await client.query('ROLLBACK');
        console.log('XATO');
        throw error;
      }
    }

    console.log(
      count === 0
        ? "\nBarcha migratsiyalar allaqachon qo'llangan."
        : `\n${count} ta migratsiya qo'llandi.`,
    );
  } finally {
    await client.end();
  }
}

async function seed(): Promise<void> {
  const client = await connect();
  try {
    const files = loadSqlFiles(SEEDS_DIR);
    for (const file of files) {
      const started = Date.now();
      process.stdout.write(`  → ${file.name} … `);
      try {
        await client.query('BEGIN');
        await client.query(file.sql);
        await client.query('COMMIT');
        console.log(`OK (${Date.now() - started} ms)`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.log('XATO');
        throw error;
      }
    }
    console.log(`\n${files.length} ta seed fayli yuklandi.`);
  } finally {
    await client.end();
  }
}

async function status(): Promise<void> {
  const client = await connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await appliedMigrations(client);
    const files = loadSqlFiles(MIGRATIONS_DIR);

    console.log('\n  HOLAT   MIGRATSIYA');
    console.log('  ─────   ──────────────────────────────────────────');
    for (const file of files) {
      const previous = applied.get(file.name);
      const mark = !previous ? 'kutmoqda' : previous === file.checksum ? '   ✓    ' : ' XATO!  ';
      console.log(`  ${mark} ${file.name}`);
    }

    // Faylda yo'q, lekin bazada qayd etilgan migratsiyalar (branch almashtirishda uchraydi)
    const known = new Set(files.map((f) => f.name));
    for (const name of applied.keys()) {
      if (!known.has(name)) console.log(`  yo'qolgan ${name}  ← fayl topilmadi`);
    }
    console.log('');
  } finally {
    await client.end();
  }
}

async function reset(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:reset production muhitida ishlatilmaydi.');
  }
  const client = await connect();
  try {
    console.warn("  public sxemasi o'chirilmoqda …");
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  } finally {
    await client.end();
  }
  await up();
  await seed();
}

async function main(): Promise<void> {
  const command = (process.argv[2] ?? 'up') as Command;
  const handlers: Record<Command, () => Promise<void>> = { up, seed, status, reset };
  const handler = handlers[command];

  if (!handler) {
    console.error(`Noma'lum buyruq: ${command}. Mavjud: up | seed | status | reset`);
    process.exit(1);
  }

  console.log(`\nKARVON migrator — ${command}\n`);
  await handler();
}

main().catch((error: unknown) => {
  console.error('\n' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
