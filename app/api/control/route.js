import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import sql, { ensureTables } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const requiredPin = (process.env.DASHBOARD_PIN || '').trim();
    if (requiredPin) {
      const authCookie = cookies().get('rmb_auth')?.value || '';
      if (authCookie !== requiredPin) {
        return NextResponse.json({ ok: false, error: 'Terkunci PIN' }, { status: 401 });
      }
    }

    await ensureTables();
    const body = await request.json();
    const action = String(body.action || '');
    const val = String(body.val || '');

    if (action === 'clear_history') {
      await sql`TRUNCATE TABLE study_sessions RESTART IDENTITY`;
      return NextResponse.json({ ok: true, message: 'Riwayat database dihapus' });
    }

    if (action === 'set_subject') {
      const subject = val.trim().slice(0, 40) || 'Umum';
      await sql`UPDATE device_state SET current_subject = ${subject} WHERE id = 1`;
      return NextResponse.json({ ok: true, subject });
    }

    if (action === 'update_session') {
      const sessionId = Number(body.sessionId || 0);
      const subject = String(body.subject || 'Umum').trim().slice(0, 40) || 'Umum';
      const note = String(body.note || '').trim().slice(0, 200);
      if (sessionId > 0) {
        await sql`
          UPDATE study_sessions
          SET subject = ${subject}, note = ${note}
          WHERE id = ${sessionId}
        `;
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'save_config') {
      const cfg = body.config || {};
      await sql`
        UPDATE device_config SET
          cfg_ver        = cfg_ver + 1,
          min_dist       = ${Number(cfg.minDist ?? 10)},
          max_dist       = ${Number(cfg.maxDist ?? 40)},
          grace_sec      = ${Number(cfg.graceSec ?? 5)},
          spam_sec       = ${Number(cfg.spamSec ?? 3)},
          ldr_thr        = ${Number(cfg.ldrThr ?? 2500)},
          ldr_high       = ${Boolean(cfg.ldrHigh)},
          daily_goal_min = ${Number(cfg.dailyGoalMin ?? 120)},
          updated_at     = NOW()
        WHERE id = 1
      `;
      return NextResponse.json({ ok: true, message: 'Kalibrasi disimpan' });
    }

    const allowedActions = [
      'start_pause',
      'stop',
      'toggle_mute',
      'oled_info',
      'set_target',
      'ping'
    ];
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ ok: false, error: 'Perintah tidak dikenal' }, { status: 400 });
    }

    await sql`UPDATE device_commands SET executed = TRUE WHERE executed = FALSE`;

    await sql`
      INSERT INTO device_commands (action, val, executed)
      VALUES (${action}, ${val.slice(0, 200)}, FALSE)
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}