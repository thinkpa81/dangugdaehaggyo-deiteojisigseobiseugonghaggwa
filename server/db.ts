import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Use DATABASE_URL or NEON_DATABASE_URL for database connection
const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL or NEON_DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const poolConfig: pg.PoolConfig = {
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('neon.tech') ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

console.log(`Database connecting (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', (err as NodeJS.ErrnoException).code || err.name);
});

export const db = drizzle(pool, { schema });

async function connectWithRetry(retries = 3, delay = 2000): Promise<pg.PoolClient> {
  for (let i = 0; i < retries; i++) {
    try {
      return await pool.connect();
    } catch (err: any) {
      console.error(`Database connection attempt ${i + 1} failed:`, err.code || err.name || "DatabaseError");
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Failed to connect to database");
}

export async function ensureTablesExist() {
  const client = await connectWithRetry();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        password_reset_required BOOLEAN NOT NULL DEFAULT false,
        auth_version INTEGER NOT NULL DEFAULT 1,
        registered_at TEXT NOT NULL,
        registered_time TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS notices (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        date TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        is_important BOOLEAN NOT NULL DEFAULT false,
        files TEXT[] NOT NULL DEFAULT '{}'::text[]
      );
      
      CREATE TABLE IF NOT EXISTS notice_comments (
        id SERIAL PRIMARY KEY,
        notice_id INTEGER NOT NULL,
        user_id INTEGER,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        date TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS papers (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL DEFAULT 'conference',
        title TEXT NOT NULL,
        authors TEXT NOT NULL,
        first_author TEXT,
        corresponding_author TEXT,
        venue TEXT,
        journal TEXT,
        volume TEXT,
        year TEXT NOT NULL,
        abstract TEXT,
        keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
        files TEXT[] NOT NULL DEFAULT '{}'::text[],
        website_url TEXT,
        date TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS paper_comments (
        id SERIAL PRIMARY KEY,
        paper_id INTEGER NOT NULL,
        user_id INTEGER,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        date TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS paper_attachments (
        id SERIAL PRIMARY KEY,
        paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
        mime_type TEXT NOT NULL CHECK (mime_type IN (
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/x-hwp',
          'application/vnd.hancom.hwpx',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'image/jpeg',
          'image/png',
          'image/webp'
        )),
        byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
        sort_order INTEGER NOT NULL CHECK (sort_order >= 0 AND sort_order < 5),
        file_data BYTEA NOT NULL CHECK (octet_length(file_data) = byte_size),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS talents (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        education TEXT NOT NULL,
        major TEXT NOT NULL,
        interested_major TEXT NOT NULL,
        motivation TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        registered_time TEXT NOT NULL,
        consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        retention_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 years'
      );

      CREATE TABLE IF NOT EXISTS admission_guidelines (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        organization TEXT NOT NULL,
        date TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        attachment_url TEXT,
        attachment_name TEXT
      );

      CREATE TABLE IF NOT EXISTS photo_albums (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        organization TEXT NOT NULL,
        date TEXT NOT NULL CHECK (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
        views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS photo_images (
        id SERIAL PRIMARY KEY,
        album_id INTEGER NOT NULL REFERENCES photo_albums(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL CHECK (mime_type = 'image/webp'),
        byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 3145728),
        width INTEGER NOT NULL CHECK (width > 0 AND width <= 2000),
        height INTEGER NOT NULL CHECK (height > 0 AND height <= 1500),
        sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
        alt_text TEXT NOT NULL,
        image_data BYTEA NOT NULL CHECK (octet_length(image_data) = byte_size),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
      ALTER TABLE notice_comments ADD COLUMN IF NOT EXISTS user_id INTEGER;
      ALTER TABLE paper_comments ADD COLUMN IF NOT EXISTS user_id INTEGER;
      ALTER TABLE talents ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE talents ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 years';

      CREATE INDEX IF NOT EXISTS idx_talents_retention_until ON talents(retention_until);
      CREATE INDEX IF NOT EXISTS idx_notice_comments_user_id ON notice_comments(user_id);
      CREATE INDEX IF NOT EXISTS idx_paper_comments_user_id ON paper_comments(user_id);
      CREATE INDEX IF NOT EXISTS idx_paper_attachments_paper_order ON paper_attachments(paper_id, sort_order, id);
      CREATE INDEX IF NOT EXISTS idx_admission_guidelines_date ON admission_guidelines(date DESC);
      CREATE INDEX IF NOT EXISTS idx_photo_albums_date ON photo_albums(date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_photo_images_album_order ON photo_images(album_id, sort_order, id);

      UPDATE admission_guidelines
      SET date = replace(date, '.', '-')
      WHERE date ~ '^[0-9]{4}[.][0-9]{2}[.][0-9]{2}$';
    `);

    await client.query("BEGIN");
    try {
      const admissionSeedMigration = await client.query(`
        INSERT INTO app_migrations (id)
        VALUES ('2026-08-23-admission-guidelines-seed-v1')
        ON CONFLICT (id) DO NOTHING
        RETURNING id;
      `);
      if (admissionSeedMigration.rowCount) {
        await client.query(`
        INSERT INTO admission_guidelines
          (title, content, organization, date, views, attachment_url, attachment_name)
        SELECT seed.title, seed.content, seed.organization, seed.date, 0, seed.attachment_url, seed.attachment_name
        FROM (VALUES
          (
            '단국대학교 대학원 입학전형 모집요강',
            '지원 자격, 모집 일정과 제출서류는 단국대학교 대학원 공식 모집요강에서 확인해 주세요.',
            '단국대학교 대학원',
            '2026-08-23',
            'https://grad.dankook.ac.kr/-91',
            '단국대학교 공식 모집요강'
          ),
          (
            '대학원 입학 지원 절차 및 제출서류 안내',
            '입학 지원 절차와 전형별 제출서류는 단국대학교 대학원 입학 안내를 기준으로 확인해 주세요.',
            '단국대학교 대학원',
            '2026-08-23',
            'https://grad.dankook.ac.kr/web/kor/graduate_ipsi',
            '대학원 입학 안내'
          ),
          (
            '데이터지식서비스공학과 박사과정 사전 컨택 안내',
            '정식 지원 전 지도교수에게 연구 관심분야와 면담 희망 일정을 이메일로 문의해 주세요. 세부 작성 방법은 학과 소개에서 확인할 수 있습니다.',
            '데이터지식서비스공학과',
            '2026-08-23',
            NULL,
            NULL
          )
        ) AS seed(title, content, organization, date, attachment_url, attachment_name)
        WHERE NOT EXISTS (SELECT 1 FROM admission_guidelines);
        `);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const invalidated = await client.query(`
      UPDATE users
      SET
        password = 'disabled$' || md5(random()::text || clock_timestamp()::text || id::text),
        password_reset_required = true,
        auth_version = auth_version + 1
      WHERE password NOT LIKE 'scrypt$v1$%'
        AND password NOT LIKE 'disabled$%'
    `);
    if (invalidated.rowCount) {
      console.warn(`Invalidated ${invalidated.rowCount} legacy plaintext password record(s)`);
    }
    console.log("Database tables verified/created successfully");
  } catch (error) {
    console.error("Error ensuring tables exist:", error);
    throw error;
  } finally {
    client.release();
  }
}
