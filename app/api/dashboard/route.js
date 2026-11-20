import { NextResponse } from 'next/server';
import sql, { ensureTables } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureTables();

    const stateRows = await sql`
      SELECT *,
        EXTRACT(EPOCH FROM (NOW() - updated_at)) AS seconds_ago
      FROM device_state
      WHERE id = 1
    `;

    const device = stateRows[0] || null;
    const isOnline = device ? Number(device.seconds_ago) < 15 : false;

    const summaryRows = await sql`
      SELECT
        COUNT(*)::int AS total_sessions,
        COALESCE(SUM(focus_sec), 0)::int AS total_focus_sec,
        COALESCE(SUM(distractions), 0)::int AS total_distractions,
        COALESCE(ROUND(AVG(focus_pct)), 100)::int AS avg_focus_pct
      FROM study_sessions
    `;

    const sessions = await sql`
      SELECT id, target_min, elapsed_sec, focus_sec, focus_pct, distractions, completed, created_at
      FROM study_sessions
      ORDER BY id DESC
      LIMIT 25
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

    return NextResponse.json({
      ok: true,
      isOnline,
      device,
      summary: summaryRows[0],
      sessions,
      dailyChart
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}