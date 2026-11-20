'use client';

import { useEffect, useState, useCallback } from 'react';

function formatDuration(sec) {
  const s = Number(sec || 0);
  const mins = Math.floor(s / 60).toString().padStart(2, '0');
  const rem = (s % 60).toString().padStart(2, '0');
  return `${mins}:${rem}`;
}

function formatDateWIB(isoStr) {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sendingCmd, setSendingCmd] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      const json = await res.json();
      if (json.ok) {
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const timer = setInterval(fetchDashboard, 2500);
    return () => clearInterval(timer);
  }, [fetchDashboard]);

  const sendControl = async (action, val = '') => {
    setSendingCmd(true);
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, val })
      });
      const json = await res.json();
      if (json.ok) {
        showToast('Perintah dikirim ke ESP32!');
        setTimeout(fetchDashboard, 1200);
      }
    } catch {
      showToast('Gagal mengirim perintah');
    } finally {
      setSendingCmd(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Hapus seluruh riwayat sesi belajar di database Neon?')) return;
    await sendControl('clear_history');
    fetchDashboard();
  };

  if (loading && !data) {
    return (
      <div style={{ maxWidth: 960, margin: '60px auto', textAlign: 'center', color: '#94a3b8' }}>
        Memuat Dashboard Robot Monitor Belajar...
      </div>
    );
  }

  const dev = data?.device || {};
  const isOnline = Boolean(data?.isOnline);
  const summary = data?.summary || { total_sessions: 0, total_focus_sec: 0, total_distractions: 0, avg_focus_pct: 100 };
  const sessions = data?.sessions || [];
  const chart = data?.dailyChart || [];

  const targetTotalSec = (dev.target_min || 30) * 60;
  const progressPct = targetTotalSec > 0 ? Math.min(100, ((dev.elapsed_sec || 0) / targetTotalSec) * 100) : 0;
  const liveFocusPct = (dev.elapsed_sec || 0) > 0 ? Math.round(((dev.focus_sec || 0) / dev.elapsed_sec) * 100) : 100;
  const maxChartMin = Math.max(30, ...chart.map((c) => c.focus_minutes || 0));

  const isAlert = dev.vibrating || (!dev.in_range && dev.session_state === 1);

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '20px 16px 48px' }}>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, background: '#3b82f6', color: '#fff',
          padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: 14, zIndex: 50,
          boxShadow: '0 10px 25px rgba(0,0,0,0.4)'
        }}>
          {toast}
        </div>
      )}

      {/* HEADER */}
      <header style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid #24324d'
      }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 11, height: 11, borderRadius: '50%',
              background: isOnline ? '#10b981' : '#ef4444',
              boxShadow: isOnline ? '0 0 10px #10b981' : 'none'
            }} />
            Robot Monitor Belajar
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: 2 }}>
            {isOnline
              ? `Perangkat Online • Wi-Fi: ${dev.wifi_ssid || '-'} (${dev.local_ip || '-'})`
              : `Perangkat Offline • Sinkron terakhir: ${formatDateWIB(dev.updated_at)}`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            background: '#131c31', border: '1px solid #24324d', padding: '6px 12px',
            borderRadius: 10, fontSize: '0.82rem', color: '#cbd5e1'
          }}>
            Ekspresi OLED: <strong>{dev.expression || 'Normal'}</strong>
          </span>
        </div>
      </header>

      {/* PANEL UTAMA: TIMER & KONTROL DUA ARAH */}
      <section style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 16, marginBottom: 18
      }}>
        <div style={{
          background: '#131c31', border: '1px solid #24324d', borderRadius: 16, padding: 20, textAlign: 'center'
        }}>
          <span style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700,
            background: isAlert ? 'rgba(239,68,68,0.2)' : dev.session_state === 1 ? 'rgba(16,185,129,0.2)' : '#24324d',
            color: isAlert ? '#f87171' : dev.session_state === 1 ? '#34d399' : '#e2e8f0',
            border: `1px solid ${isAlert ? '#ef4444' : dev.session_state === 1 ? '#10b981' : '#334155'}`
          }}>
            {dev.status_msg || 'SIAP BELAJAR'}
          </span>

          <div style={{ fontSize: '3.2rem', fontWeight: 800, margin: '10px 0 4px', fontVariantNumeric: 'tabular-nums' }}>
            {formatDuration(dev.elapsed_sec)}
          </div>

          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Target: <strong style={{ color: '#fff' }}>{dev.target_min || 30} menit</strong> &bull; Fokus Murni:{' '}
            <strong style={{ color: '#10b981' }}>{liveFocusPct}%</strong>
          </div>

          <div style={{ width: '100%', height: 10, background: '#0b1120', borderRadius: 99, overflow: 'hidden', margin: '14px 0' }}>
            <div style={{
              width: `${progressPct.toFixed(1)}%`, height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #10b981)', transition: 'width 0.4s'
            }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <button
              disabled={sendingCmd}
              onClick={() => sendControl('start_pause')}
              style={{
                background: dev.session_state === 1 ? '#f59e0b' : '#10b981',
                color: dev.session_state === 1 ? '#0b1120' : '#fff',
                border: 'none', borderRadius: 10, padding: '11px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              {dev.session_state === 1 ? 'Jeda Sesi' : dev.session_state === 2 ? 'Lanjut Belajar' : 'Mulai Belajar'}
            </button>
            <button
              disabled={sendingCmd}
              onClick={() => sendControl('stop')}
              style={{
                background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10,
                padding: '11px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Stop &amp; Simpan
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            <button
              disabled={sendingCmd}
              onClick={() => sendControl('toggle_mute')}
              style={{
                background: '#1e293b', color: dev.muted ? '#f87171' : '#f8fafc',
                border: '1px solid #334155', borderRadius: 10, padding: '9px', fontWeight: 600, cursor: 'pointer'
              }}
            >
              {dev.muted ? 'Buzzer: MUTE' : 'Buzzer: AKTIF'}
            </button>
            <button
              disabled={sendingCmd}
              onClick={() => sendControl('oled_info')}
              style={{
                background: '#1e293b', color: '#f8fafc', border: '1px solid #334155',
                borderRadius: 10, padding: '9px', fontWeight: 600, cursor: 'pointer'
              }}
            >
              Cek Layar OLED
            </button>
          </div>

          <div style={{ marginTop: 14, textAlign: 'left' }}>
            <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: 6 }}>Atur Target Durasi Jarak Jauh:</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[15, 30, 45, 60, 90].map((m) => (
                <button
                  key={m}
                  disabled={sendingCmd}
                  onClick={() => sendControl('set_target', String(m))}
                  style={{
                    flex: 1, background: dev.target_min === m ? '#3b82f6' : '#1e293b',
                    color: '#fff', border: '1px solid #334155', borderRadius: 8,
                    padding: '7px 0', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* DATA SENSOR REAL-TIME */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: '#131c31', border: '1px solid #24324d', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Jarak Pengguna (HC-SR04)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, margin: '6px 0' }}>
              {Number(dev.distance_cm) > 250 ? '> 250 cm' : `${Number(dev.distance_cm || 0).toFixed(1)} cm`}
            </div>
            <div style={{ fontSize: '0.76rem', color: dev.in_range ? '#34d399' : '#fbbf24' }}>
              {dev.in_range ? 'Posisi Fokus Ideal' : 'Di Luar Rentang Fokus'}
            </div>
          </div>

          <div style={{ background: '#131c31', border: '1px solid #24324d', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Distraksi Sesi Ini</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, margin: '6px 0', color: '#f59e0b' }}>
              {dev.distractions || 0} kali
            </div>
            <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
              Waktu Fokus: {formatDuration(dev.focus_sec)}
            </div>
          </div>

          <div style={{ background: '#131c31', border: '1px solid #24324d', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Pencahayaan (LDR)</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, margin: '6px 0', color: dev.is_dark ? '#fbbf24' : '#34d399' }}>
              {dev.is_dark ? 'REDUP' : 'TERANG'}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
              Nilai ADC: {dev.ldr_raw || 0} / 4095
            </div>
          </div>

          <div style={{ background: '#131c31', border: '1px solid #24324d', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Getaran Meja (SW-420)</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, margin: '6px 0', color: dev.vibrating ? '#f87171' : '#34d399' }}>
              {dev.vibrating ? 'BERGETAR!' : 'AMAN'}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
              {dev.vibrating ? 'Gangguan terdeteksi' : 'Meja dalam kondisi tenang'}
            </div>
          </div>
        </div>
      </section>

      {/* RINGKASAN STATISTIK NEON POSTGRESQL */}
      <section style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 18
      }}>
        <div style={{ background: '#131c31', border: '1px solid #24324d', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Total Sesi Tercatat</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4 }}>{summary.total_sessions}</div>
        </div>
        <div style={{ background: '#131c31', border: '1px solid #24324d', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Akumulasi Waktu Fokus</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4, color: '#10b981' }}>
            {Math.round((summary.total_focus_sec || 0) / 60)} menit
          </div>
        </div>
        <div style={{ background: '#131c31', border: '1px solid #24324d', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Rata-Rata Tingkat Fokus</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4, color: '#3b82f6' }}>
            {summary.avg_focus_pct}%
          </div>
        </div>
        <div style={{ background: '#131c31', border: '1px solid #24324d', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Total Distraksi</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4, color: '#f59e0b' }}>
            {summary.total_distractions} kali
          </div>
        </div>
      </section>

      {/* GRAFIK FOKUS 7 HARI TERAKHIR */}
      <section style={{
        background: '#131c31', border: '1px solid #24324d', borderRadius: 16, padding: 18, marginBottom: 18
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14 }}>Grafik Menit Fokus (7 Hari Terakhir)</h2>
        {chart.length === 0 ? (
          <p style={{ fontSize: '0.84rem', color: '#94a3b8' }}>Belum ada data sesi dalam 7 hari terakhir.</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 140, paddingTop: 16 }}>
            {chart.map((item) => {
              const barHeight = Math.max(8, Math.round(((item.focus_minutes || 0) / maxChartMin) * 100));
              return (
                <div key={item.day_label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginBottom: 4 }}>{item.focus_minutes}m</div>
                  <div style={{
                    height: `${barHeight}px`, background: 'linear-gradient(180deg, #3b82f6, #10b981)',
                    borderRadius: '6px 6px 0 0', margin: '0 auto', maxWidth: 42
                  }} />
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: 6 }}>{item.day_label}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* TABEL RIWAYAT SESI DATABASE */}
      <section style={{ background: '#131c31', border: '1px solid #24324d', borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Riwayat Sesi Belajar (Neon PostgreSQL)</h2>
          <button
            onClick={handleClearHistory}
            style={{
              background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid #ef4444',
              borderRadius: 8, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Hapus Semua
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #24324d', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '10px 8px' }}>Waktu</th>
                <th style={{ padding: '10px 8px' }}>Durasi / Target</th>
                <th style={{ padding: '10px 8px' }}>Fokus Murni</th>
                <th style={{ padding: '10px 8px' }}>Distraksi</th>
                <th style={{ padding: '10px 8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                    Belum ada sesi yang tersimpan di database.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 8px', color: '#cbd5e1' }}>{formatDateWIB(s.created_at)}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                      {formatDuration(s.elapsed_sec)} / {s.target_min}m
                    </td>
                    <td style={{ padding: '10px 8px', color: '#34d399', fontWeight: 700 }}>
                      {s.focus_pct}% ({formatDuration(s.focus_sec)})
                    </td>
                    <td style={{ padding: '10px 8px', color: '#fbbf24' }}>{s.distractions} kali</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{
                        padding: '3px 9px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 700,
                        background: s.completed ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)',
                        color: s.completed ? '#34d399' : '#fbbf24'
                      }}>
                        {s.completed ? 'Tercapai' : 'Dihentikan'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}