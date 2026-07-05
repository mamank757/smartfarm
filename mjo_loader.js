/**
 * mjo_loader_v2.js
 * ============================================================
 * Loader MJO frontend — menggantikan mjo_loader.js yang ada
 * Mengisi window.mjoData dari GAS proxy BOM RMM
 * ------------------------------------------------------------
 * CARA PAKAI:
 *   Ganti baris ini di index.html:
 *     <script src="mjo_loader.js"></script>
 *   Menjadi:
 *     <script src="mjo_loader_v2.js"></script>
 *
 *   Pastikan window._GAS_MJO_URL sudah berisi URL GAS
 *   MJO_BOM_Proxy_GAS.gs yang baru — set di HTML:
 *     <script>
 *       window._GAS_MJO_URL = 'https://script.google.com/.../exec';
 *     </script>
 *
 * APA YANG DIISI:
 *   window.mjoData = {
 *     fase:       4,
 *     amplitudo:  1.85,
 *     rmm1:       1.23,
 *     rmm2:      -1.42,
 *     tanggal:   "2026-07-01",
 *     aktif:      true,
 *     lokasi:    "Maritime Continent Barat",
 *     dampakIndonesia: "...",
 *     label:     "MJO Fase 5 — ...",
 *     ikonFase:  "⛈️",
 *     statusRingkas: "AKTIF",
 *     lagHari:   1,
 *     tren30Hari: [...],
 *     _sumber:   "BOM RMM (Wheeler & Hendon 2004)"
 *   }
 *
 *   window.mjoFase      → shortcut ke mjoData.fase
 *   window.mjoAmplitudo → shortcut ke mjoData.amplitudo
 *   (dua shortcut ini dipakai patch_skor_6faktor_v1.js)
 *
 * FALLBACK:
 *   Jika GAS gagal, coba langsung ke endpoint BOM via CORS
 *   proxy allorigins.win. Jika itu juga gagal, isi dengan
 *   nilai netral (fase 8, amplitudo 0.5) dan tandai sebagai
 *   fallback agar patch lain tahu nilainya tidak nyata.
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__mjoLoaderV2Aktif) {
        console.warn('[mjo_loader_v2] sudah aktif, skip.');
        return;
    }
    window.__mjoLoaderV2Aktif = true;

    var CACHE_KEY    = 'mjo_data_cache_v2';
    var CACHE_TS_KEY = 'mjo_data_ts_v2';
    var TTL_MS       = 6 * 3600 * 1000;  // 6 jam

    // ── Coba baca dari localStorage ──────────────────────────
    function bacaCache() {
        try {
            var ts  = localStorage.getItem(CACHE_TS_KEY);
            var raw = localStorage.getItem(CACHE_KEY);
            if (!ts || !raw) return null;
            if (Date.now() - parseInt(ts) > TTL_MS) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    function simpanCache(data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
        } catch (e) {}
    }

    // ── Terapkan data ke window globals ──────────────────────
    function terapkanMJO(data, sumberLabel) {
        window.mjoData      = data;
        window.mjoFase      = data.fase;
        window.mjoAmplitudo = data.amplitudo;

        console.log(
            '%c[mjo_loader_v2] MJO siap — Fase ' + data.fase +
            ' | Amplitudo ' + data.amplitudo +
            ' | Status ' + data.statusRingkas +
            ' | Sumber: ' + sumberLabel,
            'color:#d946ef;font-weight:bold;'
        );

        // Trigger event agar patch lain yang menunggu bisa bereaksi
        try {
            window.dispatchEvent(new CustomEvent('mjoDataReady', { detail: data }));
        } catch (e) {}
    }

    // ── Fallback netral ───────────────────────────────────────
    function pakaiNetral(alasan) {
        var fallback = {
            fase:            8,
            amplitudo:       0.4,
            rmm1:            0,
            rmm2:            0,
            tanggal:         new Date().toISOString().slice(0, 10),
            aktif:           false,
            lokasi:          'Tidak diketahui',
            dampakIndonesia: 'Data MJO tidak tersedia — gunakan sinyal ENSO/IOD saja.',
            label:           'MJO — Data Tidak Tersedia',
            ikonFase:        '❓',
            statusRingkas:   'TIDAK TERSEDIA',
            lagHari:         null,
            tren30Hari:      [],
            _sumber:         'Fallback netral — ' + alasan,
            _isFallback:     true
        };
        terapkanMJO(fallback, 'FALLBACK: ' + alasan);
    }

    // ── Parser BOM RMM text (jika bisa diakses langsung) ─────
    function parseBOMteks(teks) {
        var baris = teks.split('\n');
        var rekord = [];
        for (var i = 2; i < baris.length; i++) {
            var b = baris[i].trim();
            if (!b) continue;
            var k = b.split(/\s+/);
            if (k.length < 7) continue;
            var tahun = parseInt(k[0]), bulan = parseInt(k[1]), hari = parseInt(k[2]);
            var rmm1 = parseFloat(k[3]), rmm2 = parseFloat(k[4]);
            var fase = parseInt(k[5]), amp = parseFloat(k[6]);
            if (Math.abs(rmm1) > 900 || Math.abs(amp) > 900) continue;
            if (isNaN(tahun) || tahun < 1974 || tahun > 2100) continue;
            rekord.push({ tahun, bulan, hari, rmm1, rmm2, fase, amp });
        }
        if (rekord.length === 0) throw new Error('Tidak ada rekord valid');

        var FASE_INFO = {
            1: { label: 'Fase 1 — Afrika Timur',                         ikon: '🌍', dampak: 'MJO jauh dari Indonesia.' },
            2: { label: 'Fase 2 — Samudra Hindia Barat',                 ikon: '🌊', dampak: 'MJO bergerak ke Asia Selatan — kondisi netral Indonesia.' },
            3: { label: 'Fase 3 — Samudra Hindia Timur',                 ikon: '🌧️', dampak: 'Waspada peningkatan hujan 2–3 minggu ke depan.' },
            4: { label: 'Fase 4 — Maritime Continent Barat (Sumatera)',  ikon: '⛈️', dampak: 'Konveksi aktif Sumatera & Jawa — hujan meningkat signifikan.' },
            5: { label: 'Fase 5 — Maritime Continent Timur (Sulawesi)',  ikon: '⛈️', dampak: 'Konveksi pindah ke Sulawesi, Kalimantan, Papua.' },
            6: { label: 'Fase 6 — Pasifik Barat',                       ikon: '🌦️', dampak: 'MJO mulai meninggalkan Indonesia — cuaca membaik.' },
            7: { label: 'Fase 7 — Pasifik Tengah',                      ikon: '☀️', dampak: 'Fase kering / aktif lemah di Indonesia.' },
            8: { label: 'Fase 8 — Pasifik Timur',                       ikon: '☀️', dampak: 'Indonesia memasuki fase lebih kering.' }
        };

        var last  = rekord[rekord.length - 1];
        var info  = FASE_INFO[last.fase] || { label: 'Fase ' + last.fase, ikon: '❓', dampak: '-' };
        var aktif = last.amp >= 1.0;
        var tglData = new Date(last.tahun, last.bulan - 1, last.hari);
        var lagHari = Math.round((new Date() - tglData) / 86400000);

        return {
            fase:            last.fase,
            amplitudo:       parseFloat(last.amp.toFixed(3)),
            rmm1:            parseFloat(last.rmm1.toFixed(3)),
            rmm2:            parseFloat(last.rmm2.toFixed(3)),
            tanggal:         last.tahun + '-' + String(last.bulan).padStart(2,'0') + '-' + String(last.hari).padStart(2,'0'),
            aktif:           aktif,
            lokasi:          (info.label.split(' — ')[1] || '').trim(),
            dampakIndonesia: info.dampak,
            label:           info.label,
            ikonFase:        info.ikon,
            statusRingkas:   aktif ? 'AKTIF' : 'LEMAH',
            lagHari:         lagHari,
            tren30Hari:      rekord.slice(-30).map(function (r) {
                return {
                    tgl: r.tahun + '-' + String(r.bulan).padStart(2,'0') + '-' + String(r.hari).padStart(2,'0'),
                    fase: r.fase, amp: parseFloat(r.amp.toFixed(2))
                };
            }),
            _sumber:         'BOM RMM (Wheeler & Hendon 2004)',
            _tanggalUpdate:  new Date().toISOString().slice(0, 16) + ' UTC'
        };
    }

    // ── Proses utama ──────────────────────────────────────────
    async function loadMJO() {

        // 1. Cek cache localStorage dulu
        var cached = bacaCache();
        if (cached) {
            terapkanMJO(cached, 'Cache lokal (< 6 jam)');
            return;
        }

        // 2. Coba via GAS proxy (sumber utama, parse di server)
        var gasUrl = window._GAS_MJO_URL;
        if (gasUrl) {
            try {
                var r1 = await fetch(gasUrl, { cache: 'no-store' });
                if (r1.ok) {
                    var d1 = await r1.json();
                    if (!d1.error && d1.fase && d1.amplitudo != null) {
                        simpanCache(d1);
                        terapkanMJO(d1, 'GAS Proxy BOM RMM');
                        return;
                    }
                    throw new Error(d1.error || 'Respons GAS tidak valid');
                }
                throw new Error('HTTP ' + r1.status);
            } catch (eGAS) {
                console.warn('[mjo_loader_v2] GAS proxy gagal:', eGAS.message, '— coba allorigins...');
            }
        } else {
            console.warn('[mjo_loader_v2] window._GAS_MJO_URL belum diisi — skip GAS proxy.');
        }

        // 3. Fallback: allorigins CORS proxy langsung ke BOM
        try {
            var bomUrl  = 'https://api.allorigins.win/get?url=' +
                encodeURIComponent('http://www.bom.gov.au/climate/mjo/graphics/rmm.74toRealtime.txt');
            var r2 = await fetch(bomUrl, { cache: 'no-store' });
            if (!r2.ok) throw new Error('HTTP ' + r2.status);
            var j2   = await r2.json();
            var teks = j2.contents || '';
            if (teks.length < 100) throw new Error('Teks BOM terlalu pendek: ' + teks.length + ' karakter');
            var d2 = parseBOMteks(teks);
            simpanCache(d2);
            terapkanMJO(d2, 'allorigins → BOM RMM langsung');
            return;
        } catch (eAllOrigins) {
            console.warn('[mjo_loader_v2] allorigins fallback gagal:', eAllOrigins.message);
        }

        // 4. Semua sumber gagal → netral
        pakaiNetral('GAS & allorigins keduanya gagal');
    }

    // Mulai load saat DOM siap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            loadMJO().catch(function (e) { pakaiNetral('Exception: ' + e.message); });
        });
    } else {
        loadMJO().catch(function (e) { pakaiNetral('Exception: ' + e.message); });
    }

    // Ekspos fungsi refresh manual
    window.refreshMJO = function () {
        try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(CACHE_TS_KEY); } catch (e) {}
        return loadMJO().catch(function (e) { pakaiNetral('Refresh gagal: ' + e.message); });
    };

})();
