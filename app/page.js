'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

const PRESET_SUBJECTS = [
  'Umum',
  'Matematika',
  'Sejarah',
  'B. Inggris',
  'B. Indonesia',
  'PPKn',
  'Elektronika / IoT',
  'Web / Coding'
];

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

function formatTimeOnlyWIB(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function RobotEyeAvatar({ expression }) {
  const expr = String(expression || 'Normal');
  const isAngry = expr.includes('Marah');
  const isHappy = expr.includes('Bahagia');
  const isStudy = expr.includes('Fokus');
  const isSuspicious = expr.includes('Curiga') || expr.includes('Ngantuk');

  const eyeColor = isAngry
    ? '#f87171'
    : isHappy
    ? '#34d399'
    : isStudy
    ? '#60a5fa'
    : '#e2e8f0';

  return (
    <div style={{
      background: '#070b14',
      border: `1.5px solid ${isAngry ? '#ef4444' : isHappy ? '#10b981' : '#263554'}`,
      borderRadius: 14,
      padding: '8px 14px',
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: isAngry
        ? '0 0 18px rgba(239,68,68,0.28)'
        : isStudy
        ? '0 0 18px rgba(59,130,246,0.22)'
        : 'none'
    }}>
      <svg width="112" height="44" viewBox="0 0 112 44" className={isAngry ? 'robot-eye-angry' : 'robot-eye-blink'}>
        <g>
          <rect x="6" y="6" width="42" height="32" rx="13" fill={eyeColor} />
          {isHappy ? (
            <circle cx="27" cy="39" r="22" fill="#070b14" />
          ) : (
            <g className={isStudy ? 'robot-pupil-scan' : ''}>
              <circle cx="27" cy="22" r="8.5" fill="#070b14" />
              <circle cx="24" cy="19" r="2.2" fill="#ffffff" />
            </g>
          )}
          {isAngry && <polygon points="4,4 50,4 50,21" fill="#070b14" />}
          {isSuspicious && <rect x="4" y="4" width="46" height="11" fill="#070b14" />}
        </g>

        <g>
          <rect x="64" y="6" width="42" height="32" rx="13" fill={eyeColor} />
          {isHappy ? (
            <circle cx="85" cy="39" r="22" fill="#070b14" />
          ) : (
            <g className={isStudy ? 'robot-pupil-scan' : ''}>
              <circle cx="85" cy="22" r="8.5" fill="#070b14" />
              <circle cx="82" cy="19" r="2.2" fill="#ffffff" />
            </g>
          )}
          {isAngry && <polygon points="62,4 108,4 62,21" fill="#070b14" />}
          {isSuspicious && <rect x="62" y="4" width="46" height="11" fill="#070b14" />}
        </g>
      </svg>
      <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>
        OLED: <strong style={{ color: eyeColor }}>{expr}</strong>
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sendingCmd, setSendingCmd] = useState(false);
  const [syncingHardware, setSyncingHardware] = useState(false);
  const [fastPolling, setFastPolling] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [showCalib, setShowCalib] = useState(false);
  const [toast, setToast] = useState('');

  // State Edit Catatan & Mapel Riwayat
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editSubjectText, setEditSubjectText] = useState('Umum');
  const [customSubjectInput, setCustomSubjectInput] = useState('');

  // State PIN Lock
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [cfgForm, setCfgForm] = useState({
    minDist: 10,
    maxDist: 40,
    graceSec: 5,
    spamSec: 3,
    ldrThr: 2500,
    ldrHigh: true,
    dailyGoalMin: 120
  });
  const cfgInitializedRef = useRef(false);
  const optimisticLockRef = useRef({ until: 0, patch: null });
  const pingWatchRef = useRef({ active: false, baselineUpdatedAt: null, deadline: 0 });
  const fastPollTimeoutRef = useRef(null);

  const triggerFastPollWindow = useCallback((durationMs = 12000) => {
    setFastPolling(true);
    if (fastPollTimeoutRef.current) clearTimeout(fastPollTimeoutRef.current);
    fastPollTimeoutRef.current = setTimeout(() => {
      setFastPolling(false);
    }, durationMs);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard?t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.ok) {
        if (json.locked) {
          setData({ locked: true });
          setLoading(false);
          return;
        }

        const pw = pingWatchRef.current;
        if (pw.active && json.device) {
          if (json.device.updated_at && json.device.updated_at !== pw.baselineUpdatedAt) {
            pw.active = false;
            setPinging(false);
            showToast('Tersinkron! ESP32 merespons dengan data terbaru.');
          } else if (Date.now() > pw.deadline) {
            pw.active = false;
            setPinging(false);
            showToast('ESP32 tidak merespons (kemungkinan Offline).');
          }
        }

        if (!cfgInitializedRef.current && json.config) {
          cfgInitializedRef.current = true;
          setCfgForm({
            minDist: json.config.min_dist ?? 10,
            maxDist: json.config.max_dist ?? 40,
            graceSec: json.config.grace_sec ?? 5,
            spamSec: json.config.spam_sec ?? 3,
            ldrThr: json.config.ldr_thr ?? 2500,
            ldrHigh: Boolean(json.config.ldr_high),
            dailyGoalMin: json.config.daily_goal_min ?? 120
          });
        }

        const lock = optimisticLockRef.current;
        if (lock.patch && Date.now() < lock.until && json.device) {
          const matchesServer = Object.entries(lock.patch).every(
            ([k, v]) => json.device[k] === v
          );
          if (matchesServer) {
            optimisticLockRef.current = { until: 0, patch: null };
            setSyncingHardware(false);
            setData(json);
          } else {
            setData({
              ...json,
              device: { ...json.device, ...lock.patch }
            });
          }
        } else {
          if (lock.until > 0) {
            optimisticLockRef.current = { until: 0, patch: null };
            setSyncingHardware(false);
          }
          setData(json);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const intervalMs = (pinging || fastPolling) ? 900 : 2000;
    const timer = setInterval(fetchDashboard, intervalMs);
    return () => clearInterval(timer);
  }, [fetchDashboard, pinging, fastPolling]);

  const handleUnlockPin = async (e) => {
    e.preventDefault();
    setPinError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput })
      });
      const json = await res.json();
      if (json.ok) {
        setPinInput('');
        setLoading(true);
        fetchDashboard();
      } else {
        setPinError(json.error || 'PIN tidak valid');
      }
    } catch {
      setPinError('Gagal memeriksa PIN');
    }
  };

  const handleSelectSubject = async (subjectName) => {
    const clean = subjectName.trim() || 'Umum';
    setData((prev) =>
      prev ? { ...prev, device: { ...prev.device, current_subject: clean } } : prev
    );
    try {
      await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_subject', val: clean })
      });
      showToast(`Mata pelajaran sesi: ${clean}`);
    } catch {
      showToast('Gagal menyimpan mata pelajaran');
    }
  };

  const handleSaveSessionEdit = async (sessionId) => {
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_session',
          sessionId,
          subject: editSubjectText,
          note: editNoteText
        })
      });
      const json = await res.json();
      if (json.ok) {
        setEditingSessionId(null);
        showToast('Catatan sesi diperbarui!');
        fetchDashboard();
      }
    } catch {
      showToast('Gagal menyimpan catatan');
    }
  };

  const applyOptimisticChange = (action, val) => {
    if (!data?.device) return;
    const cur = data.device;
    let patch = {};

    if (action === 'start_pause') {
      if (cur.session_state === 1) {
        patch = { session_state: 2, status_msg: 'SESI DIJEDA' };
      } else {
        patch = {
          session_state: 1,
          status_msg: 'FOKUS BELAJAR',
          ...(cur.session_state === 3 ? { elapsed_sec: 0, focus_sec: 0, distractions: 0 } : {})
        };
      }
    } else if (action === 'stop') {
      patch = {
        session_state: 0,
        status_msg: 'SIAP BELAJAR',
        elapsed_sec: 0,
        focus_sec: 0,
        distractions: 0
      };
    } else if (action === 'toggle_mute') {
      patch = { muted: !cur.muted };
    } else if (action === 'set_target') {
      patch = { target_min: Number(val) };
    }

    if (Object.keys(patch).length > 0) {
      optimisticLockRef.current = { until: Date.now() + 8000, patch };
      setSyncingHardware(true);
      setData((prev) =>
        prev ? { ...prev, device: { ...prev.device, ...patch } } : prev
      );
    }
  };

  const sendControl = async (action, val = '') => {
    setSendingCmd(true);
    applyOptimisticChange(action, val);
    triggerFastPollWindow(12000);

    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, val })
      });
      const json = await res.json();
      if (json.ok) {
        if (action !== 'ping') {
          showToast('Perintah dikirim ke ESP32!');
        }
        setTimeout(fetchDashboard, 650);
      }
    } catch {
      optimisticLockRef.current = { until: 0, patch: null };
      setSyncingHardware(false);
      showToast('Gagal mengirim perintah');
    } finally {
      setSendingCmd(false);
    }
  };

  const handleManualPing = async () => {
    setPinging(true);
    pingWatchRef.current = {
      active: true,
      baselineUpdatedAt: data?.device?.updated_at || null,
      deadline: Date.now() + 12000
    };
    await sendControl('ping');
  };

  const handleSaveRemoteConfig = async (e) => {
    e.preventDefault();
    setSendingCmd(true);
    triggerFastPollWindow(12000);
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_config', config: cfgForm })
      });
      const json = await res.json();
      if (json.ok) {
        showToast('Kalibrasi disimpan! ESP32 akan menerapkan otomatis.');
        setShowCalib(false);
        fetchDashboard();
      }
    } catch {
      showToast('Gagal menyimpan kalibrasi');
    } finally {
      setSendingCmd(false);
    }
  };

  const handleExportCsv = () => {
    const list = data?.sessions || [];
    if (list.length === 0) {
      showToast('Belum ada data riwayat untuk diekspor');
      return;
    }
    const header = 'ID,Waktu_WIB,Mata_Pelajaran,Target_Menit,Durasi_Detik,Fokus_Detik,Persentase_Fokus,Total_Distraksi,Distraksi_Jarak,Distraksi_Getar,Status,Catatan\n';
    const rows = list.map((s) =>
      [
        s.id,
        `"${formatDateWIB(s.created_at)}"`,
        `"${(s.subject || 'Umum').replace(/"/g, '""')}"`,
        s.target_min,
        s.elapsed_sec,
        s.focus_sec,
        `${s.focus_pct}%`,
        s.distractions,
        s.away_distractions ?? s.distractions,
        s.vib_distractions ?? 0,
        s.completed ? 'Tercapai' : 'Dihentikan',
        `"${(s.note || '').replace(/"/g, '""')}"`
      ].join(',')
    );
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-robot-belajar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Hapus seluruh riwayat sesi belajar di database Neon?')) return;
    await sendControl('clear_history');
    fetchDashboard();
  };

  if (loading && !data) {
    return (
      <div style={{ maxWidth: 960, margin: '80px auto', textAlign: 'center', color: '#94a3b8' }}>
        Memuat Dashboard Robot Monitor Belajar...
      </div>
    );
  }

  if (data?.locked) {
    return (
      <main style={{ maxWidth: 380, margin: '90px auto', padding: 20 }}>
        <div style={{
          background: '#11192c', border: '1px solid #23314d', borderRadius: 18, padding: 26, textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 6 }}>Robot Monitor Belajar</h1>
          <p style={{ fontSize: '0.84rem', color: '#94a3b8', marginBottom: 18 }}>
            Masukkan PIN Dashboard untuk mengakses kontrol perangkat dan statistik.
          </p>
          <form onSubmit={handleUnlockPin}>
            <input
              type="password"
              inputMode="numeric"
              placeholder="Masukkan PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #334155',
                background: '#080d1a', color: '#fff', fontSize: '1.1rem', textAlign: 'center',
                letterSpacing: '4px', marginBottom: 12
              }}
            />
            {pinError && (
              <div style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: 10 }}>{pinError}</div>
            )}
            <button
              type="submit"
              style={{
                width: '100%', background: '#3b82f6', color: '#fff', border: 'none',
                borderRadius: 10, padding: '12px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Buka Dashboard
            </button>
          </form>
        </div>
      </main>
    );
  }

  const dev = data?.device || {};
  const isStudying = dev.session_state === 1;
  const activeSubject = dev.current_subject || 'Umum';
  const connStatus = data?.connectionStatus || 'offline';
  const summary = data?.summary || {
    total_sessions: 0,
    total_focus_sec: 0,
    total_distractions: 0,
    total_away_distractions: 0,
    total_vib_distractions: 0,
    avg_focus_pct: 100
  };
  const subjectStats = data?.subjectStats || [];
  const sessions = data?.sessions || [];
  const chart = data?.dailyChart || [];
  const todayFocusMin = Number(data?.todayFocusMin || 0);
  const streakDays = Number(data?.streakDays || 0);
  const dailyGoalMin = Number(cfgForm.dailyGoalMin || 120);
  const dailyPct = dailyGoalMin > 0 ? Math.min(100, Math.round((todayFocusMin / dailyGoalMin) * 100)) : 0;

  const targetTotalSec = (dev.target_min || 30) * 60;
  const progressPct = targetTotalSec > 0 ? Math.min(100, ((dev.elapsed_sec || 0) / targetTotalSec) * 100) : 0;
  const liveFocusPct = (dev.elapsed_sec || 0) > 0 ? Math.round(((dev.focus_sec || 0) / dev.elapsed_sec) * 100) : 100;
  const maxChartMin = Math.max(30, ...chart.map((c) => c.focus_minutes || 0));
  const maxSubjectMin = Math.max(15, ...subjectStats.map((s) => s.focus_minutes || 0));

  const isAlert = dev.vibrating || (!dev.in_range && isStudying);

  const statusMeta = {
    online: { color: '#10b981', label: 'Online (Aktif)' },
    standby: { color: '#38bdf8', label: 'Standby (Jam Meja)' },
    offline: { color: '#ef4444', label: 'Offline' }
  }[connStatus];

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 16px 52px' }}>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, background: '#2563eb', color: '#fff',
          padding: '11px 16px', borderRadius: 11, fontWeight: 600, fontSize: 13.5, zIndex: 50,
          boxShadow: '0 10px 25px rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)'
        }}>
          {toast}
        </div>
      )}

      {/* HEADER */}
      <header style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
        gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #23314d'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              className={connStatus === 'online' ? 'status-pulse' : ''}
              style={{
                width: 11, height: 11, borderRadius: '50%',
                background: statusMeta.color,
                boxShadow: `0 0 10px ${statusMeta.color}`
              }}
            />
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800 }}>Robot Monitor Belajar</h1>
            <span style={{
              fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 99,
              background: 'rgba(255,255,255,0.06)', color: statusMeta.color, border: `1px solid ${statusMeta.color}`
            }}>
              {statusMeta.label}
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 5 }}>
            {connStatus !== 'offline'
              ? `Wi-Fi: ${dev.wifi_ssid || '-'} (${dev.local_ip || '-'}) • Sinyal: ${dev.rssi || 0} dBm`
              : `Terakhir aktif: ${formatDateWIB(dev.updated_at)}`}
            {dev.last_boot_at ? ` • Menyala sejak ${formatTimeOnlyWIB(dev.last_boot_at)} WIB` : ''}
          </p>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              disabled={pinging}
              onClick={handleManualPing}
              style={{
                background: pinging ? '#1e3a8a' : '#1d4ed8', color: '#fff', border: '1px solid #3b82f6',
                borderRadius: 9, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              {pinging ? 'Menghubungi ESP32...' : 'Sinkronkan / Ping ESP32'}
            </button>
            <button
              onClick={() => setShowCalib(!showCalib)}
              style={{
                background: '#17223b', color: '#cbd5e1', border: '1px solid #2b3c5e',
                borderRadius: 9, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer'
              }}
            >
              {showCalib ? 'Tutup Kalibrasi' : 'Kalibrasi Sensor'}
            </button>
            {syncingHardware && (
              <span style={{
                fontSize: '0.76rem', color: '#93c5fd', alignSelf: 'center', fontWeight: 600
              }}>
                Menyelaraskan status...
              </span>
            )}
          </div>
        </div>

        <RobotEyeAvatar expression={dev.expression} />
      </header>

      {/* PANEL KALIBRASI SENSOR */}
      {showCalib && (
        <section style={{
          background: '#11192c', border: '1px solid #3b82f6', borderRadius: 16, padding: 18, marginBottom: 18
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: '0.98rem', fontWeight: 700 }}>Kalibrasi Sensor &amp; Target Harian (Sinkron ke ESP32)</h2>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Versi Config: v{data?.config?.cfg_ver || 1}</span>
          </div>
          <form onSubmit={handleSaveRemoteConfig}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Jarak Fokus Min (cm)</label>
                <input type="number" value={cfgForm.minDist} onChange={(e) => setCfgForm({ ...cfgForm, minDist: Number(e.target.value) })}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #2b3c5e', background: '#080d1a', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Jarak Fokus Max (cm)</label>
                <input type="number" value={cfgForm.maxDist} onChange={(e) => setCfgForm({ ...cfgForm, maxDist: Number(e.target.value) })}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #2b3c5e', background: '#080d1a', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Toleransi Pergi (detik)</label>
                <input type="number" value={cfgForm.graceSec} onChange={(e) => setCfgForm({ ...cfgForm, graceSec: Number(e.target.value) })}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #2b3c5e', background: '#080d1a', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Jeda Spam Buzzer (detik)</label>
                <input type="number" value={cfgForm.spamSec} onChange={(e) => setCfgForm({ ...cfgForm, spamSec: Number(e.target.value) })}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #2b3c5e', background: '#080d1a', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Ambang LDR (0-4095)</label>
                <input type="number" value={cfgForm.ldrThr} onChange={(e) => setCfgForm({ ...cfgForm, ldrThr: Number(e.target.value) })}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #2b3c5e', background: '#080d1a', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Target Fokus Harian (menit)</label>
                <input type="number" value={cfgForm.dailyGoalMin} onChange={(e) => setCfgForm({ ...cfgForm, dailyGoalMin: Number(e.target.value) })}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #2b3c5e', background: '#080d1a', color: '#fff' }} />
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="submit" disabled={sendingCmd} style={{
                background: '#10b981', color: '#fff', border: 'none', borderRadius: 9,
                padding: '9px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer'
              }}>
                Simpan &amp; Terapkan ke ESP32
              </button>
            </div>
          </form>
        </section>
      )}

      {/* PANEL UTAMA: TIMER, TAG MATA PELAJARAN & TELEMETRI SENSOR */}
      <section style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
        gap: 16, marginBottom: 18
      }}>
        <div style={{
          background: '#11192c',
          border: `1.5px solid ${isAlert ? '#ef4444' : isStudying ? '#10b981' : '#23314d'}`,
          boxShadow: isAlert
            ? '0 0 28px rgba(239,68,68,0.18)'
            : isStudying
            ? '0 0 28px rgba(16,185,129,0.14)'
            : 'none',
          borderRadius: 16, padding: 20, textAlign: 'center', transition: 'all 0.35s'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700,
              background: isAlert ? 'rgba(239,68,68,0.2)' : isStudying ? 'rgba(16,185,129,0.2)' : dev.session_state === 2 ? 'rgba(245,158,11,0.2)' : '#23314d',
              color: isAlert ? '#f87171' : isStudying ? '#34d399' : dev.session_state === 2 ? '#fbbf24' : '#e2e8f0',
              border: `1px solid ${isAlert ? '#ef4444' : isStudying ? '#10b981' : dev.session_state === 2 ? '#f59e0b' : '#334155'}`
            }}>
              {dev.status_msg || 'SIAP BELAJAR'}
            </span>
            <span style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: 99, fontSize: '0.76rem', fontWeight: 700,
              background: 'rgba(59,130,246,0.18)', color: '#93c5fd', border: '1px solid #3b82f6'
            }}>
              Mapel: {activeSubject}
            </span>
          </div>

          <div style={{ fontSize: '3.2rem', fontWeight: 800, margin: '10px 0 4px', fontVariantNumeric: 'tabular-nums' }}>
            {formatDuration(dev.elapsed_sec)}
          </div>

          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Target: <strong style={{ color: '#fff' }}>{dev.target_min || 30} menit</strong> &bull; Fokus Murni:{' '}
            <strong style={{ color: '#10b981' }}>{liveFocusPct}%</strong>
          </div>

          <div style={{ width: '100%', height: 10, background: '#080d1a', borderRadius: 99, overflow: 'hidden', margin: '14px 0' }}>
            <div style={{
              width: `${progressPct.toFixed(1)}%`, height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #10b981)', transition: 'width 0.4s'
            }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <button
              disabled={sendingCmd}
              onClick={() => sendControl('start_pause')}
              style={{
                background: isStudying ? '#f59e0b' : '#10b981',
                color: isStudying ? '#080d1a' : '#fff',
                border: 'none', borderRadius: 10, padding: '11px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              {isStudying ? 'Jeda Sesi' : dev.session_state === 2 ? 'Lanjut Belajar' : 'Mulai Belajar'}
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
                background: '#17223b', color: dev.muted ? '#f87171' : '#f8fafc',
                border: '1px solid #2b3c5e', borderRadius: 10, padding: '9px', fontWeight: 600, cursor: 'pointer'
              }}
            >
              {dev.muted ? 'Buzzer: MUTE' : 'Buzzer: AKTIF'}
            </button>
            <button
              disabled={sendingCmd}
              onClick={() => sendControl('oled_info')}
              style={{
                background: '#17223b', color: '#f8fafc', border: '1px solid #2b3c5e',
                borderRadius: 10, padding: '9px', fontWeight: 600, cursor: 'pointer'
              }}
            >
              Cek Layar OLED
            </button>
          </div>

          {/* PILIH MATA PELAJARAN SESI */}
          <div style={{ marginTop: 14, textAlign: 'left', paddingTop: 12, borderTop: '1px solid #1e293b' }}>
            <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: 6 }}>Tag Mata Pelajaran Sesi Ini:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {PRESET_SUBJECTS.map((subj) => (
                <button
                  key={subj}
                  onClick={() => handleSelectSubject(subj)}
                  style={{
                    background: activeSubject === subj ? '#2563eb' : '#17223b',
                    color: activeSubject === subj ? '#fff' : '#cbd5e1',
                    border: `1px solid ${activeSubject === subj ? '#60a5fa' : '#2b3c5e'}`,
                    borderRadius: 7, padding: '4px 9px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  {subj}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input
                type="text"
                placeholder="Atau ketik mapel lain..."
                value={customSubjectInput}
                onChange={(e) => setCustomSubjectInput(e.target.value)}
                style={{
                  flex: 1, padding: '6px 9px', borderRadius: 7, border: '1px solid #2b3c5e',
                  background: '#080d1a', color: '#fff', fontSize: '0.76rem'
                }}
              />
              <button
                onClick={() => {
                  if (customSubjectInput.trim()) {
                    handleSelectSubject(customSubjectInput);
                    setCustomSubjectInput('');
                  }
                }}
                style={{
                  background: '#334155', color: '#fff', border: 'none', borderRadius: 7,
                  padding: '0 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Pilih
              </button>
            </div>
          </div>

          {/* PILIH TARGET DURASI */}
          <div style={{ marginTop: 12, textAlign: 'left' }}>
            <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: 6 }}>Atur Target Durasi Jarak Jauh:</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[15, 30, 45, 60, 90].map((m) => (
                <button
                  key={m}
                  disabled={sendingCmd}
                  onClick={() => sendControl('set_target', String(m))}
                  style={{
                    flex: 1, background: dev.target_min === m ? '#3b82f6' : '#17223b',
                    color: '#fff', border: '1px solid #2b3c5e', borderRadius: 8,
                    padding: '7px 0', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KOLOM KANAN: TARGET HARIAN & 4 SENSOR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: '#11192c', border: '1px solid #23314d', borderRadius: 14, padding: 15,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Progres Fokus Hari Ini</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: 2 }}>
                {todayFocusMin} <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 500 }}>/ {dailyGoalMin} menit ({dailyPct}%)</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#34d399', marginTop: 3, fontWeight: 600 }}>
                Streak Aktif: {streakDays} hari berturut-turut
              </div>
            </div>
            <div style={{
              width: 54, height: 54, borderRadius: '50%',
              background: `conic-gradient(#10b981 ${dailyPct * 3.6}deg, #1e293b 0deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%', background: '#11192c',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.76rem', fontWeight: 800
              }}>
                {dailyPct}%
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1 }}>
            <div style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Jarak Pengguna (HC-SR04)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, margin: '5px 0' }}>
                {Number(dev.distance_cm) > 250 ? '> 250 cm' : `${Number(dev.distance_cm || 0).toFixed(1)} cm`}
              </div>
              <div style={{ fontSize: '0.75rem', color: dev.in_range ? '#34d399' : '#fbbf24' }}>
                {dev.in_range ? 'Posisi Fokus Ideal' : 'Di Luar Rentang Fokus'}
              </div>
            </div>

            <div style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Distraksi Sesi Ini</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, margin: '5px 0', color: '#f59e0b' }}>
                {dev.distractions || 0} kali
              </div>
              <div style={{ fontSize: '0.73rem', color: '#94a3b8' }}>
                Pergi: <strong style={{ color: '#cbd5e1' }}>{dev.away_distractions ?? (dev.distractions || 0)}x</strong> &bull; Getar: <strong style={{ color: '#cbd5e1' }}>{dev.vib_distractions ?? 0}x</strong>
              </div>
            </div>

            <div style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Pencahayaan (LDR)</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, margin: '5px 0', color: dev.is_dark ? '#fbbf24' : '#34d399' }}>
                {dev.is_dark ? 'REDUP' : 'TERANG'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                ADC: {dev.ldr_raw || 0} / 4095
              </div>
            </div>

            <div style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Getaran Meja (SW-420)</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, margin: '5px 0', color: dev.vibrating ? '#f87171' : '#34d399' }}>
                {dev.vibrating ? 'BERGETAR!' : 'AMAN'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {dev.vibrating ? 'Gangguan terdeteksi' : 'Meja dalam kondisi tenang'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RINGKASAN STATISTIK + RINCIAN SUMBER DISTRAKSI */}
      <section style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 12, marginBottom: 18
      }}>
        <div style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Total Sesi Tercatat</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4 }}>{summary.total_sessions}</div>
        </div>
        <div style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Akumulasi Waktu Fokus</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4, color: '#10b981' }}>
            {Math.round((summary.total_focus_sec || 0) / 60)} menit
          </div>
        </div>
        <div style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Rata-Rata Tingkat Fokus</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4, color: '#3b82f6' }}>
            {summary.avg_focus_pct}%
          </div>
        </div>
        <div style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Rincian Sumber Distraksi</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 4, color: '#f59e0b' }}>
            {summary.total_distractions} kali
          </div>
          <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: 2 }}>
            Jarak/Pergi: <strong style={{ color: '#cbd5e1' }}>{summary.total_away_distractions}x</strong> &bull; Getar Meja: <strong style={{ color: '#cbd5e1' }}>{summary.total_vib_distractions}x</strong>
          </div>
        </div>
      </section>

      {/* GRAFIK 7 HARI & DISTRIBUSI MATA PELAJARAN */}
      <section style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 16, marginBottom: 18
      }}>
        <div style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 16, padding: 18 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14 }}>Grafik Menit Fokus (7 Hari Terakhir)</h2>
          {chart.length === 0 ? (
            <p style={{ fontSize: '0.84rem', color: '#94a3b8' }}>Belum ada data sesi dalam 7 hari terakhir.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 145, paddingTop: 16 }}>
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
        </div>

        <div style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 16, padding: 18 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14 }}>Distribusi Fokus per Mata Pelajaran</h2>
          {subjectStats.length === 0 ? (
            <p style={{ fontSize: '0.84rem', color: '#94a3b8' }}>Belum ada distribusi mata pelajaran tercatat.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {subjectStats.map((st) => {
                const wPct = Math.max(6, Math.round(((st.focus_minutes || 0) / maxSubjectMin) * 100));
                return (
                  <div key={st.subject}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                      <strong style={{ color: '#e2e8f0' }}>{st.subject}</strong>
                      <span style={{ color: '#94a3b8' }}>{st.focus_minutes} menit ({st.session_count} sesi)</span>
                    </div>
                    <div style={{ width: '100%', height: 7, background: '#080d1a', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        width: `${wPct}%`, height: '100%',
                        background: 'linear-gradient(90deg, #3b82f6, #10b981)'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* TABEL RIWAYAT SESI DATABASE + CATATAN + EKSPOR CSV */}
      <section style={{ background: '#11192c', border: '1px solid #23314d', borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Jurnal &amp; Riwayat Sesi Belajar (Neon PostgreSQL)</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleExportCsv}
              style={{
                background: 'rgba(16,185,129,0.16)', color: '#34d399', border: '1px solid #10b981',
                borderRadius: 8, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Unduh CSV
            </button>
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
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #23314d', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '10px 8px' }}>Waktu &amp; Mapel</th>
                <th style={{ padding: '10px 8px' }}>Durasi / Fokus</th>
                <th style={{ padding: '10px 8px' }}>Distraksi</th>
                <th style={{ padding: '10px 8px' }}>Catatan Materi</th>
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
                sessions.map((s) => {
                  const isEditing = editingSessionId === s.id;
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #17223b', verticalAlign: 'top' }}>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>{formatDateWIB(s.created_at)}</div>
                        <span style={{
                          display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 6,
                          fontSize: '0.72rem', fontWeight: 700, background: 'rgba(59,130,246,0.18)', color: '#93c5fd'
                        }}>
                          {s.subject || 'Umum'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ fontWeight: 600 }}>{formatDuration(s.elapsed_sec)} / {s.target_min}m</div>
                        <div style={{ color: '#34d399', fontWeight: 700, fontSize: '0.78rem' }}>
                          Fokus {s.focus_pct}% ({formatDuration(s.focus_sec)})
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ color: '#fbbf24', fontWeight: 700 }}>{s.distractions} kali</div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          J:{s.away_distractions ?? s.distractions} &bull; G:{s.vib_distractions ?? 0}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px', minWidth: 190 }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <input
                              type="text"
                              value={editSubjectText}
                              onChange={(e) => setEditSubjectText(e.target.value)}
                              placeholder="Mata pelajaran"
                              style={{
                                padding: '5px 8px', borderRadius: 6, border: '1px solid #334155',
                                background: '#080d1a', color: '#fff', fontSize: '0.76rem'
                              }}
                            />
                            <input
                              type="text"
                              value={editNoteText}
                              onChange={(e) => setEditNoteText(e.target.value)}
                              placeholder="Tulis materi yang dipelajari..."
                              style={{
                                padding: '5px 8px', borderRadius: 6, border: '1px solid #334155',
                                background: '#080d1a', color: '#fff', fontSize: '0.76rem'
                              }}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => handleSaveSessionEdit(s.id)}
                                style={{
                                  background: '#10b981', color: '#fff', border: 'none', borderRadius: 6,
                                  padding: '4px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
                                }}
                              >
                                Simpan
                              </button>
                              <button
                                onClick={() => setEditingSessionId(null)}
                                style={{
                                  background: '#334155', color: '#fff', border: 'none', borderRadius: 6,
                                  padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer'
                                }}
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ color: s.note ? '#e2e8f0' : '#64748b', fontSize: '0.78rem', fontStyle: s.note ? 'normal' : 'italic' }}>
                              {s.note || 'Belum ada catatan'}
                            </div>
                            <button
                              onClick={() => {
                                setEditingSessionId(s.id);
                                setEditSubjectText(s.subject || 'Umum');
                                setEditNoteText(s.note || '');
                              }}
                              style={{
                                marginTop: 4, background: 'transparent', color: '#60a5fa', border: 'none',
                                fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: 0
                              }}
                            >
                              {s.note ? 'Edit Catatan / Mapel' : '+ Tambah Catatan'}
                            </button>
                          </div>
                        )}
                      </td>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}