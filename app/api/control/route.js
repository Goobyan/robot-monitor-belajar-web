import { NextResponse } from 'next/server';
import sql, { ensureTables } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    await ensureTables();
    const body = await request.json();
    const action = String(body.action || '');
    const val = String(body.val || '');

    if (action === 'clear_history') {
      await sql`TRUNCATE TABLE study_sessions RESTART IDENTITY`;
      return NextResponse.json({ ok: true, message: 'Riwayat database dihapus' });
    }

    const allowedActions = ['start_pause', 'stop', 'toggle_mute', 'oled_info', 'set_target'];
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ ok: false, error: 'Perintah tidak dikenal' }, { status: 400 });
    }

    // Batalkan perintah lama yang belum sempat dieksekusi agar tidak menumpuk
    await sql`UPDATE device_commands SET executed = TRUE WHERE executed = FALSE`;

    await sql`
      INSERT INTO device_commands (action, val, executed)
      VALUES (${action}, ${val}, FALSE)
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}