/**
 * ============================================================
 * patch_integrasi_final.js
 * Menyelesaikan konflik ENSO/IOD, Agronomi Air, & Kontras UI
 * ============================================================
 */

(function () {
    'use strict';

    // ============================================================
    // 1. INJEKSI CSS DINAMIS (Solusi Kontras Warna Otomatis)
    // ============================================================
    function terapkanPerbaikanWarna() {
        if (document.getElementById('patch-css-kontras')) return; // Cegah duplikasi
        
        var style = document.createElement('style');
        style.id = 'patch-css-kontras';
        style.innerHTML = `
            /* Variabel Warna Mode Siang & Malam */
            :root {
                --bg-main: #f8f9fa; --text-main: #111827;
                --text-muted: #4b5563; --bg-card: #ffffff; --border-color: #e5e7eb;
            }
            @media (prefers-color-scheme: dark) {
                :root { --bg-main: #121212; --text-main: #f9fafb; --text-muted: #9ca3af; --bg-card: #1f2937; --border-color: #374151; }
            }
            body.dark-mode {
                --bg-main: #121212; --text-main: #f9fafb; --text-muted: #9ca3af; --bg-card: #1f2937; --border-color: #374151;
            }

            /* Sinkronisasi Panel Jadwal */
            .jadwal-container, .kartu-kegiatan, .timeline-item {
                background-color: var(--bg-card) !important;
                color: var(--text-main) !important;
                border-color: var(--border-color) !important;
            }
            
            /* Class Baru untuk Badge UI */
            .status-layak { background-color: #10b981 !important; color: #ffffff !important; border: 1px solid #059669 !important; }
            .status-kurang { background-color: #f59e0b !important; color: #000000 !important; border: 1px solid #d97706 !important; }
            .status-kritis { background-color: #ef4444 !important; color: #ffffff !important; border: 1px solid #dc2626 !important; }

            /* SAPU JAGAT: Menimpa otomatis style inline lama yang bertabrakan di jadwal tanam */
            div[style*="background: yellow"], div[style*="background-color: yellow"],
            div[style*="background:yellow"], div[style*="background-color:yellow"],
            div[style*="background:#f59e0b"] {
                background-color: #f59e0b !important; 
                color: #000000 !important; /* Paksa teks jadi hitam pekat di latar kuning */
            }
        `;
        document.head.appendChild(style);
    }
    terapkanPerbaikanWarna(); // Jalankan injeksi CSS

    // ============================================================
    // 2. FUNGSI ESTIMASI HUJAN AKTUAL (ENSO & IOD IMPACT)
    // ============================================================
    window.estimasiHujanAktual = function(mm, bulanIdx, ensoVal, iodVal) {
        var wFallback = [
            [0.15,0.10],[0.15,0.10],[0.12,0.08],[0.10,0.08],
            [0.18,0.12],[0.35,0.20],[0.45,0.28],[0.50,0.38],
            [0.45,0.40],[0.35,0.30],[0.20,0.15],[0.15,0.10]
        ];
        var wE = wFallback[bulanIdx][0];
        var wI = wFallback[bulanIdx][1];
        var impact = (ensoVal * wE) + (iodVal * wI); 
        var faktor = Math.max(0.2, Math.min(1 - impact, 2.0));
        return mm * faktor;
    };

    // ============================================================
    // 3. OVERRIDE SKOR KELEMBAPAN (SINKRONISASI TOTAL)
    // ============================================================
    window.skorKelembapan = function(bulanIdx, rawZOM, ensoVal, iodVal, lat, lon) {
        var mmMentah = rawZOM[bulanIdx];
        var mmAktual = window.estimasiHujanAktual(mmMentah, bulanIdx, ensoVal, iodVal);
        
        var kalenderLokal = (typeof window.tentukanKalenderMusimLokal === 'function') 
            ? window.tentukanKalenderMusimLokal(lat, lon, rawZOM) : null;
        var polaPuncak = kalenderLokal ? (kalenderLokal.polaPuncak || kalenderLokal.polaDideteksi) : 'barat';

        if (typeof window._skorZOMRegionalInternal === 'function') {
            return window._skorZOMRegionalInternal(mmAktual, polaPuncak);
        }
        return Math.max(0, Math.min(100, Math.round(mmAktual))); 
    };

    // ============================================================
    // 4. OVERRIDE REKOMENDASI WINDOW TANAM (GERBANG AIR)
    // ============================================================
    if (typeof window.rekomendasiWindowTanam === 'function') {
        var _rekomendasiAsli = window.rekomendasiWindowTanam;
        
        window.rekomendasiWindowTanam = function(skorBulan, rawZOM, zona, ensoVal, iodVal) {
            ensoVal = ensoVal || 0;
            iodVal = iodVal || 0;

            var actualZOM = rawZOM.map(function(mm, idx) {
                return window.estimasiHujanAktual(mm, idx, ensoVal, iodVal);
            });

            var _mathMaxAsli = Math.max;
            Math.max = function(a, b) {
                if (arguments.length === 2 && a === actualZOM[(actualZOM.indexOf(b) - 1 + 12) % 12]) {
                    // Bobot Agronomi Transisi (40% bulan sebelumnya, 60% bulan ini)
                    return (a * 0.4) + (b * 0.6); 
                }
                return _mathMaxAsli.apply(this, arguments);
            };

            var hasil = _rekomendasiAsli(skorBulan, actualZOM, zona, ensoVal, iodVal);
            Math.max = _mathMaxAsli; // Kembalikan Math.max asli
            return hasil;
        };
    }

    // Ekstrak skorZOMRegional ke global
    document.addEventListener('DOMContentLoaded', function() {
        if (window._thresholdAirMusim) {
            window._skorZOMRegionalInternal = function(mmBulanIni, polaPuncak) {
                var th = window._thresholdAirMusim[polaPuncak] || window._thresholdAirMusim.fallback;
                var b  = th.thresholdBajak;
                var o  = th.thresholdOnset;
                var l  = th.thresholdLayak;

                if (mmBulanIni <= 0)       return 0;
                if (mmBulanIni < b / 2)    return Math.round(mmBulanIni / (b / 2) * 20);
                if (mmBulanIni < b)        return Math.round(20 + (mmBulanIni - b / 2) / (b / 2) * 20);
                if (mmBulanIni < o)        return Math.round(40 + (mmBulanIni - b)     / (o - b) * 20);
                if (mmBulanIni < l)        return Math.round(60 + (mmBulanIni - o)     / (l - o) * 15);
                if (mmBulanIni < l * 1.5)  return Math.round(75 + (mmBulanIni - l)     / (l * 0.5) * 10);
                if (mmBulanIni < l * 2)    return Math.round(85 + (mmBulanIni - l * 1.5) / (l * 0.5) * 10);
                return 95;
            };
        }
    });

    console.log('%c✅ patch_integrasi_final.js aktif — Resolusi ENSO/IOD + Kontras UI', 'color:#10b981;font-weight:bold;');
})();
