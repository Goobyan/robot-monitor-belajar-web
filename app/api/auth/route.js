import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const requiredPin = (process.env.DASHBOARD_PIN || '').trim();
    if (!requiredPin) {
      return NextResponse.json({ ok: true });
    }

    const body = await request.json();
    const inputPin = String(body.pin || '').trim();

    if (inputPin !== requiredPin) {
      return NextResponse.json({ ok: false, error: 'PIN salah' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set('rmb_auth', requiredPin, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    });
    return response;
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}