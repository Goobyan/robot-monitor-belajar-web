import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

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

  await sql`
    INSERT INTO device_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING
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

export default sql;