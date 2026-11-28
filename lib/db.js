import { neon } from '@neondatabase/serverless';

let cachedSql = null;

function getClient() {
  if (cachedSql) return cachedSql;

  let connStr = (process.env.DATABASE_URL || '').trim();
  if (connStr.startsWith('psql ')) {
    connStr = connStr.slice(5).trim();
  }
  if (
    (connStr.startsWith("'") && connStr.endsWith("'")) ||
    (connStr.startsWith('"') && connStr.endsWith('"'))
  ) {
    connStr = connStr.slice(1, -1).trim();
  }

  if (!connStr) {
    throw new Error('DATABASE_URL belum diatur di Environment Variables Vercel.');
  }

  cachedSql = neon(connStr);
  return cachedSql;
}

export default function sql(strings, ...values) {
  return getClient()(strings, ...values);
}

let tablesReady = false;

export async function ensureTables() {
  if (tablesReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS device_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      session_state INTEGER DEFAULT 0,
      status_msg TEXT DEFAULT 'SIAP BELAJAR',
      target_min INTEGER DEFAULT 30,
      elapsed_sec INTEGER DEFAULT 0,
      focus_sec INTEGER DEFAULT 0,
      distractions INTEGER DEFAULT 0,
      distance_cm REAL DEFAULT 25.0,
      in_range BOOLEAN DEFAULT TRUE,
      ldr_raw INTEGER DEFAULT 1000,
      is_dark BOOLEAN DEFAULT FALSE,
      vibrating BOOLEAN DEFAULT FALSE,
      muted BOOLEAN DEFAULT FALSE,
      expression TEXT DEFAULT 'Normal',
      wifi_ssid TEXT DEFAULT '',
      local_ip TEXT DEFAULT '0.0.0.0',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Migrasi kolom baru Tahap 3.3 secara aman pada database yang sudah ada
  await sql`ALTER TABLE device_state ADD COLUMN IF NOT EXISTS rssi INTEGER DEFAULT 0`;
  await sql`ALTER TABLE device_state ADD COLUMN IF NOT EXISTS free_heap INTEGER DEFAULT 0`;
  await sql`ALTER TABLE device_state ADD COLUMN IF NOT EXISTS is_sleeping BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE device_state ADD COLUMN IF NOT EXISTS last_event TEXT DEFAULT 'sync'`;
  await sql`ALTER TABLE device_state ADD COLUMN IF NOT EXISTS last_boot_at TIMESTAMPTZ`;

  await sql`
    INSERT INTO device_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS device_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      cfg_ver INTEGER DEFAULT 1,
      min_dist INTEGER DEFAULT 10,
      max_dist INTEGER DEFAULT 40,
      grace_sec INTEGER DEFAULT 5,
      spam_sec INTEGER DEFAULT 3,
      ldr_thr INTEGER DEFAULT 2500,
      ldr_high BOOLEAN DEFAULT TRUE,
      daily_goal_min INTEGER DEFAULT 120,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    INSERT INTO device_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id SERIAL PRIMARY KEY,
      target_min INTEGER NOT NULL,
      elapsed_sec INTEGER NOT NULL,
      focus_sec INTEGER NOT NULL,
      focus_pct INTEGER NOT NULL,
      distractions INTEGER NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS device_commands (
      id SERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      val TEXT DEFAULT '',
      executed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  tablesReady = true;
}