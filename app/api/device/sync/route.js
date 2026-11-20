import { NextResponse } from 'next/server';
import sql, { ensureTables } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const apiKey = request.headers.get('x-api-key') || '';
    const expectedKey = process.env.DEVICE_API_KEY || '';

    if (expectedKey && apiKey !== expectedKey) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    await ensureTables();
    const body = await request.json();

    // 1. Perbarui status real-time perangkat di Neon PostgreSQL
    await sql`
      UPDATE device_state SET
        session_state = ${Number(body.state ?? 0)},
        status_msg    = ${String(body.statusMsg ?? 'SIAP BELAJAR')},
        target_min    = ${Number(body.targetMin ?? 30)},
        elapsed_sec   = ${Number(body.elapsedSec ?? 0)},
        focus_sec     = ${Number(body.focusSec ?? 0)},
        distractions  = ${Number(body.distractions ?? 0)},
        distance_cm   = ${Number(body.distCm ?? 0)},
        in_range      = ${Boolean(body.inRange)},
        ldr_raw       = ${Number(body.ldrRaw ?? 0)},
        is_dark       = ${Boolean(body.isDark)},
        vibrating     = ${Boolean(body.vibrating)},
        muted         = ${Boolean(body.muted)},
        expression    = ${String(body.expr ?? 'Normal')},
        wifi_ssid     = ${String(body.ssid ?? '')},
        local_ip      = ${String(body.staIp ?? '0.0.0.0')},
        updated_at    = NOW()
      WHERE id = 1
    `;

    // 2. Simpan riwayat sesi baru jika ESP32 mengirim laporan sesi selesai/berhenti
    let sessionSaved = false;
    if (body.newSession && Number(body.newSession.elapsedSec) >= 10) {
      const s = body.newSession;
      const elapsed = Number(s.elapsedSec);
      const focus = Number(s.focusSec);
      const focusPct = elapsed > 0 ? Math.min(100, Math.round((focus / elapsed) * 100)) : 100;

      await sql`
        INSERT INTO study_sessions (target_min, elapsed_sec, focus_sec, focus_pct, distractions, completed)
        VALUES (
          ${Number(s.targetMin)},
          ${elapsed},
          ${focus},
          ${focusPct},
          ${Number(s.distractions)},
          ${Boolean(s.completed)}
        )
      `;
      sessionSaved = true;
    }

    // 3. Ambil 1 perintah tertunda dari Website untuk dieksekusi ESP32
    const pending = await sql`
      SELECT id, action, val FROM device_commands
      WHERE executed = FALSE
      ORDER BY id ASC
      LIMIT 1
    `;

    let command = null;
    if (pending.length > 0) {
      command = {
        id: pending[0].id,
        action: pending[0].action,
        val: pending[0].val
      };
      await sql`
        UPDATE device_commands SET executed = TRUE WHERE id = ${pending[0].id}
      `;
    }

    return NextResponse.json({
      ok: true,
      sessionSaved,
      command
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}