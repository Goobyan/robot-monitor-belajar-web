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

    const eventName = String(body.event || 'sync');
    const isSleeping = Boolean(body.sleeping);
    const isBootEvent = eventName === 'boot' || eventName === 'reconnect';

    if (isBootEvent) {
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
          rssi          = ${Number(body.rssi ?? 0)},
          free_heap     = ${Number(body.freeHeap ?? 0)},
          is_sleeping   = ${isSleeping},
          last_event    = ${eventName},
          last_boot_at  = NOW(),
          updated_at    = NOW()
        WHERE id = 1
      `;
    } else {
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
          rssi          = ${Number(body.rssi ?? 0)},
          free_heap     = ${Number(body.freeHeap ?? 0)},
          is_sleeping   = ${isSleeping},
          last_event    = ${eventName},
          updated_at    = NOW()
        WHERE id = 1
      `;
    }

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

    const cfgRows = await sql`SELECT * FROM device_config WHERE id = 1`;
    const dbCfg = cfgRows[0];
    const espCfgVer = Number(body.cfgVer || 1);
    let remoteConfig = null;

    if (dbCfg) {
      if (espCfgVer > Number(dbCfg.cfg_ver) && body.cfg) {
        await sql`
          UPDATE device_config SET
            cfg_ver    = ${espCfgVer},
            min_dist   = ${Number(body.cfg.minDist ?? 10)},
            max_dist   = ${Number(body.cfg.maxDist ?? 40)},
            grace_sec  = ${Number(body.cfg.graceSec ?? 5)},
            spam_sec   = ${Number(body.cfg.spamSec ?? 3)},
            ldr_thr    = ${Number(body.cfg.ldrThr ?? 2500)},
            ldr_high   = ${Boolean(body.cfg.ldrHigh)},
            updated_at = NOW()
          WHERE id = 1
        `;
      } else if (Number(dbCfg.cfg_ver) > espCfgVer) {
        remoteConfig = {
          cfgVer: Number(dbCfg.cfg_ver),
          minDist: Number(dbCfg.min_dist),
          maxDist: Number(dbCfg.max_dist),
          graceSec: Number(dbCfg.grace_sec),
          spamSec: Number(dbCfg.spam_sec),
          ldrThr: Number(dbCfg.ldr_thr),
          ldrHigh: Boolean(dbCfg.ldr_high)
        };
      }
    }

    // Pembersihan berkala (5% siklus) agar tidak menambah latency SQL di setiap POST
    if (Math.random() < 0.05) {
      await sql`
        DELETE FROM device_commands
        WHERE executed = TRUE AND created_at < NOW() - INTERVAL '24 hours'
      `;
    }

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
      command,
      remoteConfig
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}