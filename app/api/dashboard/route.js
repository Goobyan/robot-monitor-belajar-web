import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import sql, { ensureTables } from '../../../lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function computeStreakDays(dayStrings) {
  if (!dayStrings || dayStrings.length === 0) return 0;

  const nowJakarta = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
  );
  const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayStr = toYMD(nowJakarta);
  const yesterday = new Date(nowJakarta);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toYMD(yesterday);

  const daySet = new Set(dayStrings);
  let cursor = null;

  if (daySet.has(todayStr)) {
    cursor = new Date(nowJakarta);
  } else if (daySet.has(yesterdayStr)) {
    cursor = new Date(yesterday);
  } else {
    return 0;
  }

  let streak = 0;
  while (daySet.has(toYMD(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function GET() {
  try {
    // Cek proteksi PIN jika variabel DASHBOARD_PIN diatur di Vercel
    const requiredPin = (process.env.DASHBOARD_PIN || '').trim();
    if (requiredPin) {
      const cookieStore = cookies();
      const authCookie = cookieStore.get('rmb_auth')?.value || '';
      if (authCookie !== requiredPin) {
        return NextResponse.json(
          { ok: true, locked: true },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    await ensureTables();

    const stateRows = await sql`
      SELECT *,
        EXTRACT(EPOCH FROM (NOW() - updated_at)) AS seconds_ago
      FROM device_state
      WHERE id = 1
    `;

    const device = stateRows[0] || null;
    const secAgo = device ? Number(device.seconds_ago) : 999999;

    // Penentuan Status 3-Kondisi: 'online' | 'standby' | 'offline'
    let connectionStatus = 'offline';
    if (device) {
      if (device.is_sleeping && secAgo < 86400) {
        connectionStatus = 'standby';
      } else if (secAgo <= 65) {
        connectionStatus = 'online';
      }
    }

    const cfgRows = await sql`SELECT * FROM device_config WHERE id = 1`;
    const config = cfgRows[0] || {
      cfg_ver: 1,
      min_dist: 10,
      max_dist: 40,
      grace_sec: 5,
      spam_sec: 3,
      ldr_thr: 2500,
      ldr_high: true,
      daily_goal_min: 120
    };

    const summaryRows = await sql`
      SELECT
        COUNT(*)::int AS total_sessions,
        COALESCE(SUM(focus_sec), 0)::int AS total_focus_sec,
        COALESCE(SUM(distractions), 0)::int AS total_distractions,
        COALESCE(ROUND(AVG(focus_pct)), 100)::int AS avg_focus_pct
      FROM study_sessions
    `;

    const todayRows = await sql`
      SELECT COALESCE(ROUND(SUM(focus_sec) / 60.0), 0)::int AS today_focus_min
      FROM study_sessions
      WHERE DATE(created_at AT TIME ZONE 'Asia/Jakarta') = DATE(NOW() AT TIME ZONE 'Asia/Jakarta')
    `;

    const streakRows = await sql`
      SELECT DISTINCT TO_CHAR(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS study_day
      FROM study_sessions
      WHERE focus_sec >= 60
      ORDER BY study_day DESC
      LIMIT 60
    `;
    const streakDays = computeStreakDays(streakRows.map((r) => r.study_day));

    const sessions = await sql`
      SELECT id, target_min, elapsed_sec, focus_sec, focus_pct, distractions, completed, created_at
      FROM study_sessions
      ORDER BY id DESC
      LIMIT 50
    `;

    const dailyChart = await sql`
      SELECT
        TO_CHAR(created_at AT TIME ZONE 'Asia/Jakarta', 'DD/MM') AS day_label,
        DATE(created_at AT TIME ZONE 'Asia/Jakarta') AS raw_date,
        COALESCE(ROUND(SUM(focus_sec) / 60.0), 0)::int AS focus_minutes,
        COALESCE(SUM(distractions), 0)::int AS distractions
      FROM study_sessions
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day_label, raw_date
      ORDER BY raw_date ASC
    `;

    return NextResponse.json(
      {
        ok: true,
        locked: false,
        connectionStatus,
        isOnline: connectionStatus === 'online' || connectionStatus === 'standby',
        secondsAgo: Math.round(secAgo),
        device,
        config,
        summary: summaryRows[0],
        todayFocusMin: todayRows[0]?.today_focus_min || 0,
        streakDays,
        sessions,
        dailyChart
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0'
        }
      }
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}