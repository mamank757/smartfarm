/**
 * ============================================================
 *  patch_mjo_bom_v1.js
 *  Data MJO Real-Time — Sumber Resmi BOM (Bureau of Meteorology)
 * ============================================================
 *
 *  SUMBER DATA:
 *    Bureau of Meteorology (BOM) Australia — Wheeler & Hendon (2004)
 *    URL: https://www.bom.gov.au/climate/mjo/graphics/rmm.74toRealtime.txt
 *    Format: year month day RMM1 RMM2 phase amplitude
 *    Update: harian, real-time
 *
 *  CARA PASANG:
 *    Letakkan di index.html SEBELUM patch_skor_6faktor_v1.js:
 *      <script src="patch_mjo_bom_v1.js"></script>
 *      <script src="patch_skor_6faktor_v1.js"></script>
 *
 *  APA YANG DILAKUKAN:
 *    1. Fetch file RMM dari BOM via proxy (sama seperti ENSO/IOD)
 *    2. Parse kolom: year, month, day, RMM1, RMM2, phase, amplitude
 *    3. Ambil 5 hari terakhir, hitung rata-rata fase & amplitudo
 *    4. Simpan ke window.mjoData = { fase, amplitudo, rmm1, rmm2, sumber }
 *    5. Expose window.getMJOData() agar bisa dipanggil dari mana saja
 *    6. Tampilkan status MJO di UI (elemen id="mjoStatus" jika ada)
 *
 *  FALLBACK:
 *    BOM → proxy GAS → proxy AllOrigins → nilai netral (fase 0, amp 0)
 *
 *  REFERENSI:
 *    Wheeler, M. C. & Hendon, H. H. (2004). Mon. Wea. Rev., 132, 1917–1932.
 *    Peatman et al. (2014). Q.J.R. Meteorol. Soc., 140, 538–549.
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__mjoBomV1Aktif) {
        console.warn('[patch_mjo_bom_v1] sudah aktif, skip.');
        return;
    }

    // ── URL & Proxy (pola sama dengan patch_enso_iod_noaa.js) ──
    var BOM_RMM_URL   = 'https://www.bom.gov.au/climate/mjo/graphics/rmm.74toRealtime.txt';
    var GAS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbz9oRwYDHZW7IXJ2Bdjc7uJsr17Ez-ed7j_LDI7S_YzXnFuXHuzIRwPD3CVd2ZAhTt9Mg/exec';
    var ALLORIGINS    = 'https://api.allorigins.win/get?url=';

    // ── Label Fase MJO (Wheeler-Hendon 8 fase) ──────────────────
    var LABEL_FASE = {
        1: { nama: 'Fase 1 — Samudra Hindia Barat',    ikon: '🌐' },
        2: { nama: 'Fase 2 — Samudra Hindia',          ikon: '🌐' },
        3: { nama: 'Fase 3 — Samudra Hindia Timur',    ikon: '🌧️' },
        4: { nama: 'Fase 4 — Laut Maritim & Jawa',     ikon: '🌧️' },
        5: { nama: 'Fase 5 — Sulawesi & Kalimantan',   ikon: '🌩️' },
        6: { nama: 'Fase 6 — Pasifik Barat',           ikon: '⛈️' },
        7: { nama: 'Fase 7 — Pasifik Tengah',          ikon: '☀️' },
        8: { nama: 'Fase 8 — Pasifik Timur–Hindia Barat', ikon: '🌤️' }
    };

    // ── Dampak MJO per fase per wilayah Indonesia ────────────────
    // Nilai: +1 = sangat basah, -1 = sangat kering
    // Sumber: Peatman et al. (2014); Wheeler & Hendon (2004)
    var DAMPAK_PER_FASE = {
        //             F1     F2     F3     F4     F5     F6     F7     F8
        sumatera:  [-0.1,  0.3,  0.7,  0.6,  0.1, -0.4, -0.7, -0.4],
        jawa:      [ 0.0,  0.2,  0.6,  0.8,  0.3, -0.3, -0.7, -0.4],
        sulawesi:  [-0.2, -0.1,  0.2,  0.5,  0.8,  0.6, -0.2, -0.5],
        kalimantan:[-0.1,  0.0,  0.3,  0.6,  0.9,  0.5, -0.3, -0.5],
        nusra:     [-0.3, -0.1,  0.2,  0.4,  0.5,  0.2, -0.4, -0.7],
        papua:     [-0.2,  0.0,  0.1,  0.3,  0.6,  0.8,  0.1, -0.4]
    };

    // ── Tentukan wilayah dari koordinat GPS ─────────────────────
    function tentukanWilayah(lat, lon) {
        if (lon >= 130)                                    return 'papua';
        if (lon >= 108 && lat >= -4)                      return 'kalimantan';
        if (lat < -7 && lon > 118)                        return 'nusra';
        if (lon >= 118 && lon < 130 && lat >= -6)         return 'sulawesi';
        if (lon >= 105 && lon < 118 && lat < -5.5)        return 'jawa';
        if (lon >= 95  && lon < 106)                      return 'sumatera';
        return 'sulawesi'; // default untuk Indonesia timur tengah
    }

    // ── Parser file RMM BOM ─────────────────────────────────────
    function parseRMM(teks) {
        var baris = teks.trim().split('\n');
        var hasil = [];
        for (var i = 0; i < baris.length; i++) {
            var b = baris[i].trim();
            if (!b || b.startsWith('RMM') || b.startsWith('year') || b.startsWith('DATE')) continue;
            var k = b.split(/\s+/);
            if (k.length < 7) continue;
            var year  = parseInt(k[0]);
            var month = parseInt(k[1]);
            var day   = parseInt(k[2]);
            var rmm1  = parseFloat(k[3]);
            var rmm2  = parseFloat(k[4]);
            var phase = parseInt(k[5]);
            var amp   = parseFloat(k[6]);
            // Skip missing values (999 atau >1e10)
            if (isNaN(year) || isNaN(rmm1) || Math.abs(rmm1) > 1e10 || rmm1 === 999) continue;
            if (isNaN(phase) || phase < 1 || phase > 8) continue;
            hasil.push({ year: year, month: month, day: day,
                          rmm1: rmm1, rmm2: rmm2, phase: phase, amp: amp });
        }
        return hasil;
    }

    // ── Hitung rata-rata 5 hari terakhir ─────────────────────────
    function ringkas5Hari(data) {
        if (!data || data.length === 0) return null;
        var n     = Math.min(5, data.length);
        var slice = data.slice(data.length - n);

        // Fase: ambil fase terakhir (bukan rata-rata — fase adalah kategori)
        var faseTerakhir = slice[slice.length - 1].phase;

        // Amplitudo: rata-rata 5 hari (lebih stabil daripada nilai harian)
        var sumAmp = 0;
        slice.forEach(function (d) { sumAmp += d.amp; });
        var ampRata = sumAmp / n;

        // RMM1/RMM2 terbaru
        var terbaru = slice[slice.length - 1];

        // Tren amplitudo: apakah MJO menguat atau melemah?
        var trenAmp = n >= 2 ? slice[n-1].amp - slice[0].amp : 0;

        return {
            fase:      faseTerakhir,
            amplitudo: parseFloat(ampRata.toFixed(3)),
            rmm1:      parseFloat(terbaru.rmm1.toFixed(4)),
            rmm2:      parseFloat(terbaru.rmm2.toFixed(4)),
            trenAmp:   parseFloat(trenAmp.toFixed(3)),
            tanggal:   terbaru.year + '-' + String(terbaru.month).padStart(2,'0') + '-' +
                       String(terbaru.day).padStart(2,'0')
        };
    }

    // ── Fetch via proxy GAS ─────────────────────────────────────
    async function fetchViaGAS(url, timeoutMs) {
        timeoutMs = timeoutMs || 10000;
        if (!GAS_PROXY_URL) throw new Error('GAS_PROXY_URL tidak diisi');
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
        try {
            var proxyUrl = GAS_PROXY_URL + '?url=' + encodeURIComponent(url);
            var res = await fetch(proxyUrl, { signal: controller.signal });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var json = await res.json();
            if (json.error) throw new Error(json.error);
            return json.contents || '';
        } finally {
            clearTimeout(timer);
        }
    }

    // ── Fetch via AllOrigins ──────────────────────────────────────
    async function fetchViaAllOrigins(url, timeoutMs) {
        timeoutMs = timeoutMs || 10000;
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
        try {
            var proxyUrl = ALLORIGINS + encodeURIComponent(url);
            var res = await fetch(proxyUrl, { signal: controller.signal });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var json = await res.json();
            return json.contents || '';
        } finally {
            clearTimeout(timer);
        }
    }

    // ── Fetch dengan urutan prioritas ────────────────────────────
    // ── Fetch dengan Proxy Alternatif dan Mirror Akademik ──
    async function fetchRMMData() {
        var BOM_URL = 'http://www.bom.gov.au/climate/mjo/graphics/rmm.74toRealtime.txt';
        var ALBANY_MIRROR = 'https://www.atmos.albany.edu/facstaff/roundy/waves/data/rmm.74toRealtime.txt';

        // Antrean Proxy (berhenti di proxy pertama yang berhasil ditarik)
        // Semuanya me-return teks RAW murni, tidak perlu parsing JSON.contents
        var jalurProxy = [
            'https://corsproxy.io/?url=' + encodeURIComponent(BOM_URL),
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(ALBANY_MIRROR),
            'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(BOM_URL)
        ];

        for (var i = 0; i < jalurProxy.length; i++) {
            try {
                var controller = new AbortController();
                // Timeout 8 detik per jalur
                var timer = setTimeout(function () { controller.abort(); }, 8000);
                
                var res = await fetch(jalurProxy[i], { signal: controller.signal });
                clearTimeout(timer);
                
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var teks = await res.text();
                
                // Validasi ringkas: Pastikan data yang ditarik benar-benar tabel RMM
                if (teks.includes('year') && teks.includes('phase') && teks.includes('amplitude')) {
                    console.log('✅ MJO RMM berhasil ditarik via jalur proxy ' + (i + 1));
                    return teks;
                } else {
                    throw new Error('Format data tidak sesuai ekspektasi');
                }
            } catch (err) {
                console.warn('⚠️ Proxy MJO jalur ' + (i + 1) + ' gagal:', err.message);
            }
        }
        
        throw new Error('Semua proxy & mirror MJO gagal menembus server.');
    }

    // ── Fungsi utama: ambil & proses data MJO ───────────────────
    async function getMJOData() {
        // Gunakan cache jika kurang dari 6 jam
        if (window.mjoData && window.mjoData._cacheTime) {
            var selisih = Date.now() - window.mjoData._cacheTime;
            if (selisih < 6 * 3600 * 1000) {
                console.log('✅ MJO dari cache (cache umur:', Math.round(selisih/60000), 'menit)');
                return window.mjoData;
            }
        }

        try {
            var teks  = await fetchRMMData();
            var data  = parseRMM(teks);

            if (!data || data.length < 5) {
                throw new Error('Data RMM kurang dari 5 baris valid');
            }

            var ringkasan = ringkas5Hari(data);
            if (!ringkasan) throw new Error('Ringkasan MJO gagal dihitung');

            var labelFase = LABEL_FASE[ringkasan.fase] || { nama: 'Fase ' + ringkasan.fase, ikon: '🌐' };
            var aktif     = ringkasan.amplitudo >= 1.0;

            var hasil = {
                fase:       ringkasan.fase,
                amplitudo:  ringkasan.amplitudo,
                rmm1:       ringkasan.rmm1,
                rmm2:       ringkasan.rmm2,
                trenAmp:    ringkasan.trenAmp,
                tanggal:    ringkasan.tanggal,
                aktif:      aktif,
                labelFase:  labelFase.nama,
                ikonFase:   labelFase.ikon,
                sumber:     'BOM Australia (resmi)',
                _cacheTime: Date.now()
            };

            window.mjoData       = hasil;
            window.mjoFase       = hasil.fase;
            window.mjoAmplitudo  = hasil.amplitudo;

            console.log(
                '%c✅ MJO RMM dari BOM | Fase: ' + hasil.fase +
                ' | Amplitudo: ' + hasil.amplitudo.toFixed(2) +
                ' | Aktif: ' + (aktif ? 'YA' : 'TIDAK') +
                ' | Data s/d: ' + hasil.tanggal,
                'color:#d946ef; font-weight:bold;'
            );

            return hasil;

        } catch (err) {
            console.warn('⚠️ Gagal ambil MJO dari BOM:', err.message, '— pakai nilai netral.');

            var fallback = {
                fase:       0,
                amplitudo:  0,
                rmm1:       0,
                rmm2:       0,
                trenAmp:    0,
                tanggal:    '-',
                aktif:      false,
                labelFase:  'Data tidak tersedia',
                ikonFase:   '❓',
                sumber:     'Statis (BOM gagal)',
                _cacheTime: Date.now()
            };

            window.mjoData      = fallback;
            window.mjoFase      = 0;
            window.mjoAmplitudo = 0;

            return fallback;
        }
    }

    // ── Hitung dampak MJO per wilayah (dipakai patch_skor_6faktor) ──
    function hitungDampakMJOLokal(lat, lon, fase, amplitudo) {
        if (!fase || fase < 1 || fase > 8 || amplitudo < 1.0) {
            return 0; // MJO tidak aktif atau fase tidak valid → netral
        }

        var wilayah = tentukanWilayah(lat, lon);
        var tabel   = DAMPAK_PER_FASE[wilayah];
        if (!tabel) return 0;

        var idx     = Math.max(0, Math.min(7, fase - 1));
        var dampak  = tabel[idx];

        // Skalakan dengan amplitudo: amp=1.0 → 70%, amp=2.0 → 100%, amp≥2.5 → klip
        var skala   = Math.min(1.0, (amplitudo - 1.0) / 1.5 * 1.0 + 0.7);

        return Math.max(-1, Math.min(1, dampak * skala));
    }

    // ── Tampilkan di UI jika elemen mjoStatus tersedia ──────────
    function tampilkanStatusMJO(data) {
        var el = document.getElementById('mjoStatus');
        if (!el) return;

        if (!data || !data.aktif) {
            el.innerHTML =
                '<span style="color:#64748b;">MJO: ' +
                (data ? data.labelFase : 'Tidak tersedia') +
                ' <span style="font-size:0.65rem;opacity:0.5;">(Amplitudo: ' +
                (data ? data.amplitudo.toFixed(2) : '-') + ' — tidak aktif)</span></span>';
            return;
        }

        var labelFase = LABEL_FASE[data.fase] || { nama: 'Fase ' + data.fase, ikon: '🌐' };
        var warna = (data.fase >= 3 && data.fase <= 6) ? '#38b6ff'
                  : (data.fase >= 7 || data.fase <= 2) ? '#f59e0b'
                  : '#10b981';

        var trenTeks = data.trenAmp > 0.2  ? ' ↑ menguat'
                     : data.trenAmp < -0.2 ? ' ↓ melemah'
                     : '';

        el.innerHTML =
            labelFase.ikon + ' MJO: <span style="color:' + warna + ';font-weight:700;">' +
            labelFase.nama + '</span>' +
            ' <span style="font-size:0.7rem;opacity:0.6;">' +
                '(Amp: ' + data.amplitudo.toFixed(2) + trenTeks + ')' +
            '</span>' +
            '<br><span style="font-size:0.6rem;opacity:0.35;">BOM RMM · data s/d ' + data.tanggal + '</span>';
    }

    // ── Expose ke window ──────────────────────────────────────────
    window.getMJOData          = getMJOData;
    window.hitungDampakMJOLokal = hitungDampakMJOLokal;
    window.tentukanWilayahMJO  = tentukanWilayah;
    window.DAMPAK_PER_FASE_MJO = DAMPAK_PER_FASE;

    // ── Auto-fetch saat dimuat ────────────────────────────────────
    (async function autoFetch() {
        try {
            var data = await getMJOData();
            tampilkanStatusMJO(data);
        } catch (e) {
            console.warn('[MJO] Auto-fetch gagal:', e.message);
        }
    })();

    window.__mjoBomV1Aktif = true;

    console.log(
        '%c✅ patch_mjo_bom_v1.js AKTIF\n' +
        '\n  ╔══ MJO REAL-TIME — BOM AUSTRALIA ═══════════════╗\n' +
        '  ║ Sumber: BOM rmm.74toRealtime.txt (harian)         \n' +
        '  ║ Metode: Wheeler & Hendon (2004) RMM Index          \n' +
        '  ║ Proxy : GAS Apps Script → AllOrigins (fallback)    \n' +
        '  ║ Output: window.mjoData = { fase, amplitudo, ... }  \n' +
        '  ║ Cache : 6 jam (tidak fetch berulang tiap klik)     \n' +
        '  ║                                                     \n' +
        '  ║ DAMPAK PER WILAYAH (Peatman et al. 2014):          \n' +
        '  ║   Fase 3-4 → basah Sumatera & Jawa                 \n' +
        '  ║   Fase 4-6 → basah Sulawesi & Kalimantan           \n' +
        '  ║   Fase 7-8 → kering sebagian besar Indonesia       \n' +
        '  ║   Fase 1-2 → transisi / lemah                      \n' +
        '  ╚═════════════════════════════════════════════════════╝',
        'color:#d946ef; font-weight:bold;'
    );

})();
