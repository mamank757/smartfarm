/**
 * ============================================================
 * patch_status_panel_v1.js
 * Panel Status Visual — Semua Sumber Data Iklim
 * ------------------------------------------------------------
 * Menambahkan tombol ⚙️ kecil di pojok kanan bawah layar.
 * Ketika diklik, muncul panel overlay yang menampilkan status
 * ke-8 sumber data sekaligus:
 *   ZOM · ENSO · IOD · SST · MJO · Kelvin · Rossby · Fase Bulan
 *
 * CARA PASANG: paling terakhir, setelah patch_gelombang_ekuator
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__statusPanelV1Aktif) return;
    window.__statusPanelV1Aktif = true;

    // ── Konstanta warna ──────────────────────────────────────
    var W = {
        ok:      '#10b981',
        warn:    '#f59e0b',
        err:     '#ef4444',
        muted:   '#64748b',
        panel:   'rgba(11,21,40,0.97)',
        border:  'rgba(59,130,246,0.3)'
    };

    var NAMA_BULAN_P = ['Jan','Feb','Mar','Apr','Mei','Jun',
                        'Jul','Agu','Sep','Okt','Nov','Des'];

    // ── Injeksi CSS ──────────────────────────────────────────
    function injeksiCSS() {
        if (document.getElementById('statusPanelCSS')) return;
        var s = document.createElement('style');
        s.id = 'statusPanelCSS';
        s.textContent = [
            '#spToggleBtn{',
            '  position:fixed;bottom:52px;right:0;z-index:8000;',
            '  width:38px;height:38px;border-radius:12px 0 0 12px;',
            '  background:rgba(59,130,246,0.18);',
            '  border:1px solid rgba(59,130,246,0.35);border-right:none;',
            '  color:#3b82f6;font-size:16px;cursor:pointer;',
            '  display:flex;align-items:center;justify-content:center;',
            '  box-shadow:-3px 0 12px rgba(59,130,246,0.2);',
            '  transition:background 0.2s;',
            '}',
            '#spToggleBtn:hover{background:rgba(59,130,246,0.35);}',
            '#statusPanelOverlay{',
            '  display:none;position:fixed;bottom:52px;right:0;',
            '  width:min(340px,95vw);max-height:80vh;overflow-y:auto;',
            '  z-index:8001;background:' + W.panel + ';',
            '  border:1px solid ' + W.border + ';border-right:none;',
            '  border-radius:16px 0 0 16px;',
            '  box-shadow:-4px 0 24px rgba(0,0,0,0.6);',
            '  padding:16px 14px;box-sizing:border-box;',
            '  backdrop-filter:blur(12px);',
            '}',
            '#statusPanelOverlay.sp-open{display:block;}',
            '.sp-header{font-size:11px;font-weight:800;letter-spacing:1px;',
            '  color:#3b82f6;margin-bottom:12px;display:flex;',
            '  justify-content:space-between;align-items:center;}',
            '.sp-row{display:grid;grid-template-columns:22px 1fr auto;',
            '  gap:6px;align-items:start;padding:8px 0;',
            '  border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px;}',
            '.sp-row:last-child{border-bottom:none;}',
            '.sp-dot{width:8px;height:8px;border-radius:50%;margin-top:3px;flex-shrink:0;}',
            '.sp-name{color:#e2e8f0;font-weight:600;line-height:1.4;}',
            '.sp-detail{color:' + W.muted + ';font-size:10px;margin-top:2px;line-height:1.4;}',
            '.sp-badge{font-size:9px;font-weight:700;padding:2px 7px;',
            '  border-radius:6px;white-space:nowrap;align-self:start;}',
            '.sp-divider{font-size:9px;font-weight:700;letter-spacing:1px;',
            '  color:' + W.muted + ';margin:10px 0 4px;text-transform:uppercase;}',
            '.sp-footer{font-size:9px;color:' + W.muted + ';margin-top:12px;',
            '  padding-top:8px;border-top:1px dashed rgba(255,255,255,0.08);',
            '  line-height:1.6;}',
            '.sp-refresh{background:none;border:1px solid rgba(59,130,246,0.4);',
            '  color:#3b82f6;border-radius:6px;padding:3px 9px;',
            '  font-size:10px;font-weight:700;cursor:pointer;letter-spacing:0.5px;}',
            '.sp-refresh:hover{background:rgba(59,130,246,0.15);}',
            /* Light mode */
            'body.light-mode #statusPanelOverlay{background:rgba(255,255,255,0.97);}',
            'body.light-mode .sp-name{color:#0f172a;}',
            'body.light-mode .sp-detail{color:#475569;}',
        ].join('');
        document.head.appendChild(s);
    }

    // ── Buat DOM ─────────────────────────────────────────────
    function buatDOM() {
        if (document.getElementById('spToggleBtn')) return;

        var btn = document.createElement('button');
        btn.id = 'spToggleBtn';
        btn.title = 'Status Sumber Data Iklim';
        btn.innerHTML = '⚙️';
        btn.onclick = togglePanel;
        document.body.appendChild(btn);

        var overlay = document.createElement('div');
        overlay.id = 'statusPanelOverlay';
        overlay.innerHTML = '<div class="sp-header">' +
            '<span>STATUS SUMBER DATA IKLIM</span>' +
            '<button class="sp-refresh" onclick="window.refreshStatusPanel()">↻ REFRESH</button>' +
            '</div>' +
            '<div id="spIsi">Memuat...</div>' +
            '<div class="sp-footer">' +
            'Klik ↻ untuk perbarui · Klik di luar untuk tutup' +
            '</div>';
        document.body.appendChild(overlay);

        // Tutup jika klik di luar
        document.addEventListener('click', function (e) {
            var panel = document.getElementById('statusPanelOverlay');
            var btn2  = document.getElementById('spToggleBtn');
            if (panel && !panel.contains(e.target) && e.target !== btn2) {
                panel.classList.remove('sp-open');
            }
        });
    }

    function togglePanel() {
        var panel = document.getElementById('statusPanelOverlay');
        if (!panel) return;
        var terbuka = panel.classList.toggle('sp-open');
        if (terbuka) renderPanel();
    }

    // ── Helper render baris ──────────────────────────────────
    function baris(warnaDot, nama, detail, badgeTeks, warnaBadge) {
        return '<div class="sp-row">' +
            '<div class="sp-dot" style="background:' + warnaDot + ';' +
            (warnaDot === W.ok ? 'box-shadow:0 0 5px ' + W.ok + ';' : '') + '"></div>' +
            '<div><div class="sp-name">' + nama + '</div>' +
            (detail ? '<div class="sp-detail">' + detail + '</div>' : '') +
            '</div>' +
            '<div class="sp-badge" style="background:' + (warnaBadge||warnaDot) + '22;' +
            'color:' + (warnaBadge||warnaDot) + ';border:1px solid ' +
            (warnaBadge||warnaDot) + '44;">' + (badgeTeks||'') + '</div>' +
            '</div>';
    }

    function divider(teks) {
        return '<div class="sp-divider">' + teks + '</div>';
    }

    // ── Render isi panel ─────────────────────────────────────
    function renderPanel() {
        var isi = document.getElementById('spIsi');
        if (!isi) return;

        var html = '';
        var lat  = (window._lokasiKalender && window._lokasiKalender.lat) || null;
        var lon  = (window._lokasiKalender && window._lokasiKalender.lon) || null;
        var now  = new Date();

        // ── 1. ZOM / Zona Iklim ──────────────────────────────
        html += divider('DATA IKLIM MAKRO');
        try {
            var zona4 = (typeof window.tentukanZonaIklim === 'function' && lat)
                ? window.tentukanZonaIklim(lat, lon) : null;
            var zona6 = (typeof window._deteksiZonaIklimV2 === 'function' && lat)
                ? window._deteksiZonaIklimV2(lat, lon) : null;
            var konsisten = zona4 && zona6 &&
                (zona4 === zona6 || (zona4 === 'lokal' && zona6 === 'lokal') ||
                 (zona4 === 'monsunal' && zona6 === 'kering_ekstrem'));
            if (!lat) {
                html += baris(W.warn, 'ZOM / Zona Iklim',
                    'Buka tab Cuaca + sinkron GPS dulu', 'BELUM', W.warn);
            } else {
                html += baris(konsisten ? W.ok : W.warn, 'ZOM / Zona Iklim',
                    zona6 + ' → ' + (zona4 || '?'),
                    konsisten ? 'KONSISTEN' : 'CEK', konsisten ? W.ok : W.warn);
            }
        } catch (e) {
            html += baris(W.err, 'ZOM / Zona Iklim', e.message, 'ERROR', W.err);
        }

        // ── 2. ENSO ──────────────────────────────────────────
        var enso = window._ensoDataTerkini;
        if (enso && enso.latestAnomaly != null) {
            var wE = Math.abs(enso.latestAnomaly) >= 0.5 ? W.warn : W.ok;
            if (Math.abs(enso.latestAnomaly) >= 1.0) wE = W.err;
            html += baris(wE, 'ENSO (ONI)',
                enso.status + ' · ONI ' + (enso.latestAnomaly > 0 ? '+' : '') +
                enso.latestAnomaly + '°C<br>Sumber: ' + (enso.sumber || '-'),
                enso.statusSingkat || 'CEK', wE);
        } else {
            html += baris(W.muted, 'ENSO (ONI)',
                'Belum dimuat — buka RISIKO IKLIM dulu', 'BELUM', W.muted);
        }

        // ── 3. IOD ───────────────────────────────────────────
        var iod = window._iodDataTerkini;
        if (iod && iod.latestAnomaly != null) {
            var wI = Math.abs(iod.latestAnomaly) >= 0.4 ? W.warn : W.ok;
            if (Math.abs(iod.latestAnomaly) >= 0.8) wI = W.err;
            html += baris(wI, 'IOD (DMI)',
                iod.status + ' · DMI ' + (iod.latestAnomaly > 0 ? '+' : '') +
                iod.latestAnomaly + '°C<br>Sumber: ' + (iod.sumber || '-'),
                iod.statusSingkat || 'CEK', wI);
        } else {
            html += baris(W.muted, 'IOD (DMI)',
                'Belum dimuat — buka RISIKO IKLIM dulu', 'BELUM', W.muted);
        }

        // ── 4. SST Lokal ─────────────────────────────────────
        var sst = window._sstLokalCache;
        if (sst && sst.sstBoneTerkini) {
            var lagSST = sst.tanggalData
                ? Math.round((now - new Date(sst.tanggalData)) / 86400000) + 'h lalu'
                : '-';
            html += baris(W.ok, 'SST Lokal',
                (sst.nama1 || 'Laut 1') + ' ' + parseFloat(sst.sstBoneTerkini).toFixed(1) + '°C · ' +
                (sst.nama2 || 'Laut 2') + ' ' + parseFloat(sst.sstMksTerkini || 0).toFixed(1) + '°C' +
                '<br>' + (sst.namaWilayah || '-'),
                'DATA ASLI ✅', W.ok);
        } else {
            html += baris(W.warn, 'SST Lokal',
                'Cache kosong — pakai proxy ENSO<br>' +
                'Buka tab RISIKO CUACA → GPS aktif dulu',
                'PROXY', W.warn);
        }

        // ── 5. Fase Bulan ────────────────────────────────────
        var EPOCH_BM = new Date('2026-01-29T12:36:00Z');
        var faseBulan = ((now - EPOCH_BM) / 86400000) % 29.53059;
        if (faseBulan < 0) faseBulan += 29.53059;
        var namaFB = faseBulan < 1.5 ? 'Bulan Mati' :
                     faseBulan < 7.4 ? 'Sabit Muda' :
                     faseBulan < 8.4 ? 'Kuartal I'  :
                     faseBulan < 14.8? 'Cembung'    :
                     faseBulan < 15.8? 'Purnama'    :
                     faseBulan < 22.1? 'Cembung'    :
                     faseBulan < 23.1? 'Kuartal III':
                     faseBulan < 29.0? 'Sabit Tua'  : 'Bulan Mati';
        html += baris(W.ok, 'Fase Bulan',
            namaFB + ' · Hari ke-' + faseBulan.toFixed(1) + ' dari 29.53<br>' +
            'Dihitung lokal (tidak perlu GAS)',
            'LOKAL ✅', W.ok);

        // ── 6. MJO ───────────────────────────────────────────
        html += divider('GELOMBANG INTRAMUSIMAN');
        var mjo = window.mjoData;
        if (mjo && mjo.fase) {
            var isFallback = mjo._isFallback;
            var wM = isFallback ? W.warn : (mjo.aktif ? W.err : W.ok);
            html += baris(wM, 'MJO — Fase ' + mjo.fase,
                (mjo.label || '-') + '<br>' +
                'Amp: ' + mjo.amplitudo + ' · ' + mjo.statusRingkas +
                (mjo.lagHari != null ? ' · lag ' + mjo.lagHari + 'h' : '') +
                '<br>Sumber: ' + (mjo._sumber || '-'),
                isFallback ? 'FALLBACK ⚠️' : (mjo.aktif ? 'AKTIF' : 'LEMAH'),
                wM);
        } else {
            html += baris(W.err, 'MJO',
                'window.mjoData kosong<br>' +
                'Cek window._GAS_MJO_URL & mjo_loader_v2.js',
                'TIDAK ADA ❌', W.err);
        }

        // ── 7. Kelvin Wave ────────────────────────────────────
        html += divider('GELOMBANG EKUATORIAL (1-2 MINGGU)');
        var kelvin = window.kelvinData;
        if (kelvin && !kelvin.error) {
            var wK = kelvin.aktif ? W.warn : W.ok;
            if (kelvin.aktif && kelvin.indeksKelvin >= 2) wK = W.err;
            html += baris(wK, 'Kelvin Wave',
                (kelvin.label || '-') + '<br>' +
                'Indeks: ' + kelvin.indeksKelvin +
                ' · Anomali u850: ' + kelvin.anomaliAngin + ' m/s<br>' +
                'Posisi: ' + (kelvin.posisi || '-') + '<br>' +
                'Sumber: ' + (kelvin._sumber || '-'),
                kelvin.aktif ? 'AKTIF〰️' : 'TENANG', wK);
        } else if (!window.GAS_ENDPOINTS || !window.GAS_ENDPOINTS.kelvin) {
            html += baris(W.muted, 'Kelvin Wave',
                'GAS_ENDPOINTS.kelvin belum diisi di HTML<br>' +
                'Deploy KelvinWave_Proxy_GAS_v2.gs lalu set URL',
                'URL BELUM', W.muted);
        } else {
            html += baris(W.err, 'Kelvin Wave',
                'Gagal fetch dari GAS<br>' +
                'Cek URL: ' + (window.GAS_ENDPOINTS.kelvin || '-').slice(0, 40) + '...',
                'GAGAL ❌', W.err);
        }

        // ── 8. Rossby Wave ────────────────────────────────────
        var rossby = window.rossbyData;
        if (rossby && !rossby.error) {
            var wR = rossby.aktif ? W.warn : W.ok;
            if (rossby.aktif && rossby.indeksRossby >= 2) wR = W.err;
            html += baris(wR, 'Rossby Wave',
                (rossby.label || '-') + '<br>' +
                'Indeks: ' + rossby.indeksRossby +
                ' · Vortisitas: ' + rossby.vortisitas + ' ×10⁻⁵ s⁻¹<br>' +
                'Sumber: ' + (rossby._sumber || '-'),
                rossby.aktif ? 'AKTIF🌊' : 'STABIL', wR);
        } else if (!window.GAS_ENDPOINTS || !window.GAS_ENDPOINTS.rossby) {
            html += baris(W.muted, 'Rossby Wave',
                'GAS_ENDPOINTS.rossby belum diisi di HTML<br>' +
                'Deploy RossbyWave_Proxy_GAS_v2.gs lalu set URL',
                'URL BELUM', W.muted);
        } else {
            html += baris(W.err, 'Rossby Wave',
                'Gagal fetch dari GAS<br>' +
                'Cek URL endpoint Rossby',
                'GAGAL ❌', W.err);
        }

        // ── Ringkasan integrasi ───────────────────────────────
        html += divider('STATUS INTEGRASI');
        var kalenderOk = typeof window.rekomendasiWindowTanam === 'function' &&
            window.rekomendasiWindowTanam.__sstMjoTersuntik;
        var risikoCuacaOk = typeof window.hitungRisikoDinamis === 'function' &&
            window.hitungRisikoDinamis.__kelvinTersuntik;
        var zonaOk = typeof window.tentukanZonaIklim === 'function' &&
            window.tentukanZonaIklim.__satuSumber;

        html += baris(kalenderOk ? W.ok : W.warn,
            'KALENDER TNM',
            kalenderOk
                ? 'SST & MJO tersuntik ke rawZOM ✅<br>Mempengaruhi pemilihan bulan tanam nyata'
                : 'patch_kalender_tnm_sst_mjo_v1.js belum aktif',
            kalenderOk ? 'AKTIF ✅' : 'BELUM', kalenderOk ? W.ok : W.warn);

        html += baris(risikoCuacaOk ? W.ok : W.warn,
            'RISIKO CUACA',
            risikoCuacaOk
                ? 'Kelvin & Rossby tersuntik ke hitungRisikoDinamis ✅'
                : 'patch_gelombang_ekuator_v1.js belum aktif',
            risikoCuacaOk ? 'AKTIF ✅' : 'BELUM', risikoCuacaOk ? W.ok : W.warn);

        html += baris(zonaOk ? W.ok : W.warn,
            'ZONA IKLIM',
            zonaOk
                ? 'Satu sumber kebenaran (patch_fix_integrasi) ✅'
                : 'patch_fix_integrasi_6faktor_v1.js belum aktif',
            zonaOk ? 'KONSISTEN ✅' : 'SPLIT', zonaOk ? W.ok : W.warn);

        // Waktu render
        html += '<div class="sp-footer">' +
            'Diperbarui: ' + now.toLocaleTimeString('id-ID') +
            ' · Koordinat: ' + (lat ? lat.toFixed(3) + ', ' + lon.toFixed(3) : 'belum diset') +
            '</div>';

        isi.innerHTML = html;
    }

    // Refresh panel
    window.refreshStatusPanel = function () {
        // Hapus cache SST agar bisa cek ulang
        renderPanel();
    };

    // Init
    function init() {
        injeksiCSS();
        buatDOM();
        console.log(
            '%c✅ patch_status_panel_v1.js aktif — klik ⚙️ pojok kanan bawah untuk status semua sumber data',
            'color:#3b82f6;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1000); });
    } else {
        setTimeout(init, 1000);
    }

})();
