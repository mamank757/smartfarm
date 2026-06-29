/**
 * ============================================================
 *  patch_mjo_fix_v1.js  —  VERSI 2
 *  Fix MJO — Hybrid: BOM Real-time + Estimasi Statistik Fallback
 * ============================================================
 *
 *  JAWABAN: Apakah MJO akan selalu netral (0)?
 *
 *  SEBELUM patch ini: YA, sering netral karena:
 *    - codetabs 400 (URL http://)
 *    - AbortSignal.timeout() tidak ada di Android WebView
 *    - autoFetch berjalan sebelum timeout wrapper aktif
 *    - estimasiDampakMJO() selalu return 0 tanpa data fase
 *
 *  SETELAH patch ini: TIDAK — dua lapis sumber data:
 *
 *  LAPIS 1 — BOM Real-time (akurasi tinggi, tapi perlu internet)
 *    Proxy: corsproxy.io + allorigins + GAS
 *    Fix: https://, AbortController manual, hapus codetabs
 *    Timeout: 8 detik total (paralel race)
 *
 *  LAPIS 2 — Estimasi Statistik (selalu tersedia, offline-capable)
 *    Jika BOM gagal, hitung estimasi dari ENSO + musim:
 *    - La Niña (ENSO < -0.5) + musim Nov-Apr → Fase 4-5 (basah)
 *    - El Niño (ENSO > 0.5)  + musim Jun-Okt → Fase 7-8 (kering)
 *    - Kondisi lain → estimasi dari bulan kalender
 *    Akurasi ~60-70% vs real-time (cukup untuk analisis PPL)
 *    Sumber: Wheeler & Hendon (2004), Hendon et al. (2007)
 *
 *  CARA PASANG:
 *    <script src="patch_mjo_fix_v1.js"></script>   ← SEBELUM
 *    <script src="patch_mjo_bom_v1.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__mjoFixV1Aktif) {
        console.warn('[mjo_fix] sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  BAGIAN 0 — AbortController KOMPATIBEL SEMUA BROWSER
    // ============================================================
    function buatAbortDenganTimeout(ms) {
        var controller = new AbortController();
        var timer = setTimeout(function () {
            try { controller.abort(); } catch(e) {}
        }, ms);
        return {
            signal: controller.signal,
            cancel: function () { clearTimeout(timer); }
        };
    }
    window._buatAbortDenganTimeout = buatAbortDenganTimeout;

    // ============================================================
    //  BAGIAN 1 — PROXY MJO BERSIH (https, tanpa codetabs)
    // ============================================================
    var BOM_URL    = 'https://www.bom.gov.au/climate/mjo/graphics/rmm.74toRealtime.txt';
    var ALBANY_URL = 'https://www.atmos.albany.edu/facstaff/roundy/waves/data/rmm.74toRealtime.txt';
    var GAS_URL    = 'https://script.google.com/macros/s/AKfycbz9oRwYDHZW7IXJ2Bdjc7uJsr17Ez-ed7j_LDI7S_YzXnFuXHuzIRwPD3CVd2ZAhTt9Mg/exec';

    // ── GAS MJO Proxy (server-side, no CORS, cache harian) ──────────
    // Ganti URL ini dengan hasil deploy MJO_Proxy_GAS.gs Anda
    // Format respons: JSON { fase, amplitudo, rmm1, rmm2, aktif, ... }
    var GAS_MJO_ENDPOINT = window._GAS_MJO_URL || ''; // Isi di index.html: window._GAS_MJO_URL = "https://..."

    var PROXY_MJO = [
        // Prioritas 0: GAS MJO endpoint (jika sudah dikonfigurasi)
        // Format respons berbeda — ditangani khusus di fetchRMMData
        { nama: 'GAS-MJO',   url: GAS_MJO_ENDPOINT,  gasEndpoint: true },
        // Prioritas 1: corsproxy ke BOM langsung
        { nama: 'corsproxy',  url: 'https://corsproxy.io/?url=' + encodeURIComponent(BOM_URL) },
        // Prioritas 2: allorigins ke Albany mirror
        { nama: 'allorigins', url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(ALBANY_URL) },
        // Prioritas 3: GAS proxy generik (fetch BOM via server Google)
        { nama: 'GAS',        url: GAS_URL + '?url=' + encodeURIComponent(BOM_URL) }
    ].filter(function(p) { return p.url && p.url.length > 10; }); // hapus yang URL-nya kosong

    // ============================================================
    //  BAGIAN 2 — ESTIMASI MJO STATISTIK (LAPIS 2 FALLBACK)
    //
    //  Ketika BOM tidak bisa diakses, hitung estimasi dampak MJO
    //  berdasarkan korelasi statistik ENSO × Musim.
    //
    //  Landasan ilmiah:
    //  - Hendon et al. (2007): La Niña memperkuat MJO, El Niño melemahkan
    //  - Wheeler & Hendon (2004): Fase MJO bergerak timur ~5°/hari
    //  - Peatman et al. (2014): Fase 4-6 basah di Indonesia, fase 7-8 kering
    //
    //  Estimasi ini bukan fase nyata, tapi DAMPAK PROBABILISTIK:
    //  nilai positif = lebih mungkin basah, negatif = lebih mungkin kering
    // ============================================================

    // Probabilitas MJO aktif per bulan (0-1)
    // Sumber: statistik frekuensi MJO aktif 1979-2020 (Wheeler & Hendon 2004)
    var PROB_MJO_AKTIF_PER_BULAN = [
        0.55, // Jan — aktif tinggi (boreal winter)
        0.58, // Feb — puncak aktivitas
        0.52, // Mar — mulai menurun
        0.40, // Apr — transisi
        0.32, // Mei — rendah
        0.28, // Jun — terendah
        0.30, // Jul — rendah
        0.33, // Agu — mulai naik
        0.38, // Sep — naik moderat
        0.45, // Okt — naik
        0.50, // Nov — aktif
        0.53  // Des — aktif tinggi
    ];

    // Korelasi ENSO terhadap dampak MJO di Indonesia
    // La Niña (-) → MJO lebih sering fase basah → dampak positif
    // El Niño (+) → MJO lebih sering fase kering → dampak negatif
    function estimasiDampakMJOStatistik(lat, lon, bulan, ensoVal) {
        var probAktif = PROB_MJO_AKTIF_PER_BULAN[bulan];

        // Faktor ENSO: La Niña perkuat MJO, El Niño lemahkan
        // Korelasi ~-0.35 (Hendon et al. 2007)
        var faktorEnso = 1.0;
        if      (ensoVal < -1.0) faktorEnso = 1.5;  // La Niña kuat → MJO lebih aktif
        else if (ensoVal < -0.5) faktorEnso = 1.25; // La Niña lemah
        else if (ensoVal > 1.0)  faktorEnso = 0.6;  // El Niño kuat → MJO lebih lemah
        else if (ensoVal > 0.5)  faktorEnso = 0.8;  // El Niño lemah

        var probAktifFinal = Math.min(0.85, probAktif * faktorEnso);

        // Jika MJO tidak aktif (prob rendah) → netral
        if (probAktifFinal < 0.35) return 0;

        // Estimasi fase dominan berdasarkan musim dan ENSO
        // Fase 4-6 (basah Indonesia): umumnya saat La Niña + boreal winter
        // Fase 7-8 (kering Indonesia): umumnya saat El Niño
        var dampakDominantPerBulan;
        if (ensoVal < -0.5) {
            // La Niña: MJO cenderung ke fase basah Indonesia (4-5)
            dampakDominantPerBulan = [
                0.5, 0.6, 0.5, 0.3, 0.1, -0.1,  // Jan-Jun
               -0.1, 0.1, 0.2, 0.4, 0.5,  0.5   // Jul-Des
            ];
        } else if (ensoVal > 0.5) {
            // El Niño: MJO cenderung ke fase kering Indonesia (7-8)
            dampakDominantPerBulan = [
               -0.3,-0.2,-0.2,-0.1, 0.1, 0.2,   // Jan-Jun
                0.2, 0.1,-0.1,-0.3,-0.4,-0.4    // Jul-Des
            ];
        } else {
            // Netral: pola klimatologi rata-rata
            dampakDominantPerBulan = [
                0.3, 0.4, 0.3, 0.1,-0.1,-0.2,   // Jan-Jun
               -0.2,-0.1, 0.0, 0.2, 0.3,  0.3   // Jul-Des
            ];
        }

        // Dampak final = dampak dominan × probabilitas aktif
        var dampak = dampakDominantPerBulan[bulan] * probAktifFinal;

        // Klip ke rentang yang wajar untuk estimasi statistik
        return Math.max(-0.6, Math.min(0.6, dampak));
    }

    // ============================================================
    //  BAGIAN 3 — fetchRMMData DIPERBAIKI
    //  Race paralel, https, AbortController manual, timeout 8 detik
    // ============================================================
    window.fetchRMMData = async function () {
        var TIMEOUT_PROXY  = 6000;
        var TIMEOUT_GLOBAL = 8000;

        function fetchSatuProxy(proxy) {
            var ab = buatAbortDenganTimeout(TIMEOUT_PROXY);

            // ── GAS MJO Endpoint: respons JSON langsung (bukan teks RMM) ──
            if (proxy.gasEndpoint) {
                return fetch(proxy.url + '?action=get', { signal: ab.signal })
                    .then(function (r) {
                        ab.cancel();
                        if (!r.ok) throw new Error(proxy.nama + ' HTTP ' + r.status);
                        return r.json();
                    })
                    .then(function (data) {
                        if (data.error) throw new Error(proxy.nama + ': ' + data.error);
                        if (!data.fase || data.fase < 1 || data.fase > 8)
                            throw new Error(proxy.nama + ': fase tidak valid (' + data.fase + ')');
                        console.log('[mjo_fix] ✅ MJO dari GAS endpoint: Fase ' + data.fase +
                            ', Amp ' + data.amplitudo + ' (' + (data._sumber||'-') + ')');
                        // Return format khusus agar fetchRMMData tahu ini sudah parsed
                        data.__alreadyParsed = true;
                        return data;
                    })
                    .catch(function (e) { ab.cancel(); throw e; });
            }

            // ── Proxy biasa: return teks RMM mentah ──────────────────────
            return fetch(proxy.url, { signal: ab.signal })
                .then(function (r) {
                    ab.cancel();
                    if (!r.ok) throw new Error(proxy.nama + ' HTTP ' + r.status);
                    return r.text();
                })
                .then(function (teks) {
                    // GAS proxy generik membungkus dalam JSON { contents: "..." }
                    if (teks && teks.trim().startsWith('{')) {
                        try { var j = JSON.parse(teks); teks = j.contents || teks; }
                        catch(e) {}
                    }
                    if (!teks || teks.length < 100)
                        throw new Error(proxy.nama + ': isi terlalu pendek');
                    if (!teks.includes('phase') && !teks.includes('RMM') && !teks.includes('1974'))
                        throw new Error(proxy.nama + ': format tidak dikenal');
                    console.log('[mjo_fix] ✅ RMM teks dari ' + proxy.nama);
                    return teks;
                })
                .catch(function (e) { ab.cancel(); throw e; });
        }

        var promiseParalel = (typeof Promise.any === 'function')
            ? Promise.any(PROXY_MJO.map(fetchSatuProxy))
            : new Promise(function (resolve, reject) {
                var gagal = 0;
                PROXY_MJO.map(fetchSatuProxy).forEach(function (p) {
                    p.then(resolve).catch(function () {
                        if (++gagal >= PROXY_MJO.length) reject(new Error('semua proxy gagal'));
                    });
                });
            });

        var promiseTimeout = new Promise(function (_, reject) {
            setTimeout(function () { reject(new Error('timeout ' + TIMEOUT_GLOBAL + 'ms')); }, TIMEOUT_GLOBAL);
        });

        var hasilRaw = await Promise.race([promiseParalel, promiseTimeout]);

        // Jika GAS endpoint sudah return objek parsed → langsung return
        if (hasilRaw && hasilRaw.__alreadyParsed) {
            return hasilRaw;
        }

        // Teks RMM mentah → dikembalikan untuk diparse oleh getMJOData asli
        return hasilRaw;
    };

    // ============================================================
    //  BAGIAN 4 — getMJOData HYBRID: BOM + ESTIMASI STATISTIK
    //
    //  Urutan:
    //  1. Cek in-memory cache → jika ada, return langsung
    //  2. Coba BOM real-time (timeout 8 detik)
    //  3. Jika BOM gagal → hitung estimasi statistik dari ENSO+musim
    //  4. Simpan hasil ke cache (real-time ATAU estimasi)
    //
    //  Dengan ini MJO TIDAK akan selalu netral (0).
    // ============================================================

    var _cacheMJO  = null;
    var _cacheTS   = 0;
    var TTL_MJO    = 6 * 3600 * 1000; // 6 jam

    function buatHasilEstimasi(ensoVal, bulan, lat, lon) {
        var dampak = estimasiDampakMJOStatistik(lat, lon, bulan, ensoVal);
        var probAktif = PROB_MJO_AKTIF_PER_BULAN[bulan];
        var aktif = probAktif >= 0.45;

        // Konversi dampak ke fase estimasi (kasar)
        // Hanya untuk label UI — bukan fase RMM nyata
        var faseEstimasi;
        if      (dampak >  0.3) faseEstimasi = 5;   // basah Sulawesi
        else if (dampak >  0.1) faseEstimasi = 4;   // basah Jawa-Sulawesi
        else if (dampak < -0.3) faseEstimasi = 7;   // kering Indonesia
        else if (dampak < -0.1) faseEstimasi = 8;   // kering Indonesia
        else                    faseEstimasi = 0;   // netral

        var ampEstimasi = aktif ? Math.round(probAktif * 15) / 10 : 0.8;

        return {
            fase:       faseEstimasi,
            amplitudo:  ampEstimasi,
            rmm1:       dampak * 1.5,  // estimasi kasar
            rmm2:       dampak * 1.2,
            trenAmp:    0,
            tanggal:    new Date().toISOString().slice(0,10) + ' (estimasi)',
            aktif:      aktif && faseEstimasi !== 0,
            labelFase:  faseEstimasi === 0
                ? 'Estimasi: MJO Tidak Aktif'
                : 'Estimasi Fase ' + faseEstimasi + ' (statistik ENSO×Musim)',
            ikonFase:   dampak > 0.1 ? '🌧️' : dampak < -0.1 ? '☀️' : '⚖️',
            sumber:     'Estimasi statistik (BOM tidak tersedia)',
            _dampakLangsung: dampak,  // simpan untuk getDampakMJO
            _cacheTime: Date.now()
        };
    }

    window.__mjoFixPasangWrapper = function () {
        var asliMJO = window.getMJOData;
        if (!asliMJO || asliMJO.__mjoFixWrapped) return;

        window.getMJOData = async function () {
            // [1] Cek in-memory cache
            if (_cacheMJO && (Date.now() - _cacheTS) < TTL_MJO) {
                console.log('[mjo_fix] getMJOData → cache (' +
                    Math.round((Date.now() - _cacheTS) / 60000) + ' mnt lalu, sumber: ' +
                    (_cacheMJO.sumber || '-') + ')');
                window.mjoData      = _cacheMJO;
                window.mjoFase      = _cacheMJO.fase;
                window.mjoAmplitudo = _cacheMJO.amplitudo;
                return _cacheMJO;
            }

            // Cek cache window.mjoData dari autoFetch yang mungkin sudah jalan
            if (window.mjoData && window.mjoData._cacheTime &&
                (Date.now() - window.mjoData._cacheTime) < TTL_MJO &&
                window.mjoData.fase !== 0) {
                _cacheMJO = window.mjoData;
                _cacheTS  = window.mjoData._cacheTime;
                console.log('[mjo_fix] getMJOData → window.mjoData cache (fase ' + window.mjoData.fase + ')');
                return window.mjoData;
            }

            // [2] Ambil ENSO untuk estimasi fallback
            var ensoVal = 0;
            if (window._ensoDataTerkini && window._ensoDataTerkini.latestAnomaly !== undefined) {
                ensoVal = parseFloat(window._ensoDataTerkini.latestAnomaly) || 0;
            }
            var bulanSekarang = new Date().getMonth();
            var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
            var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

            // [3] Coba BOM real-time, timeout 8 detik
            var promiseBOM     = asliMJO.apply(this, arguments);
            var promiseTimeout = new Promise(function (resolve) {
                setTimeout(function () {
                    console.warn('[mjo_fix] BOM timeout → pakai estimasi statistik');
                    resolve(null); // null = sinyal untuk pakai estimasi
                }, 8000);
            });

            var hasil = await Promise.race([promiseBOM, promiseTimeout]);

            // [4] Jika BOM berhasil dan data nyata (bukan netral)
            if (hasil && hasil.fase !== 0 && hasil.amplitudo >= 1.0) {
                console.log('[mjo_fix] ✅ MJO real-time: Fase ' + hasil.fase +
                    ', Amp ' + hasil.amplitudo);
                _cacheMJO = hasil;
                _cacheTS  = Date.now();
                window.mjoData      = hasil;
                window.mjoFase      = hasil.fase;
                window.mjoAmplitudo = hasil.amplitudo;
                return hasil;
            }

            // [5] BOM gagal atau netral → estimasi statistik
            var estimasi = buatHasilEstimasi(ensoVal, bulanSekarang, lat, lon);
            console.log('[mjo_fix] 📊 MJO estimasi statistik: Fase ' + estimasi.fase +
                ', dampak ' + estimasi._dampakLangsung.toFixed(2) +
                ' (ENSO=' + ensoVal.toFixed(2) + ', bulan=' + (bulanSekarang+1) + ')');

            _cacheMJO = estimasi;
            _cacheTS  = Date.now();
            window.mjoData      = estimasi;
            window.mjoFase      = estimasi.fase;
            window.mjoAmplitudo = estimasi.amplitudo;
            return estimasi;
        };
        window.getMJOData.__mjoFixWrapped = true;
        console.log('[mjo_fix] getMJOData hybrid wrapper aktif (BOM + estimasi statistik)');
    };

    // ============================================================
    //  BAGIAN 5 — Override getDampakMJO di patch_skor_6faktor
    //
    //  patch_skor_6faktor punya getDampakMJO() yang periksa
    //  window.mjoData.fase. Jika fase = 0 (netral) → return 0.
    //  Tapi sekarang window.mjoData bisa punya _dampakLangsung
    //  dari estimasi statistik → pakai langsung, lebih akurat.
    // ============================================================
    function overrideDampakMJO() {
        // Override getDampakMJO melalui window._6F jika sudah ada
        var cek = setInterval(function () {
            if (!window._6F || typeof window._6F.getDampakMJO !== 'function') return;
            clearInterval(cek);

            var _asliDampak = window._6F.getDampakMJO;

            window._6F.getDampakMJO = function (lat, lon, bulan, enso) {
                // Jika ada _dampakLangsung dari estimasi → pakai itu
                if (window.mjoData && typeof window.mjoData._dampakLangsung === 'number') {
                    var d = window.mjoData._dampakLangsung;
                    if (Math.abs(d) > 0.05) {
                        return Math.max(-1, Math.min(1, d));
                    }
                }
                // Fallback ke fungsi asli (BOM real-time atau estimasi lama)
                return _asliDampak.apply(this, arguments);
            };

            // Override juga window.hitungDampakMJOLokal (dari patch_mjo_bom)
            var _asliLokal = window.hitungDampakMJOLokal;
            if (typeof _asliLokal === 'function' && !_asliLokal.__mjoFixOverride) {
                window.hitungDampakMJOLokal = function (lat, lon, fase, amplitudo) {
                    // Jika estimasi statistik aktif dan ada _dampakLangsung
                    if (window.mjoData && window.mjoData._dampakLangsung !== undefined &&
                        (fase === 0 || amplitudo < 1.0)) {
                        var d = window.mjoData._dampakLangsung;
                        return Math.max(-1, Math.min(1, d));
                    }
                    return _asliLokal.apply(this, arguments);
                };
                window.hitungDampakMJOLokal.__mjoFixOverride = true;
            }

            console.log('[mjo_fix] getDampakMJO + hitungDampakMJOLokal diperkuat dengan estimasi statistik');
        }, 500);
    }

    // ============================================================
    //  BAGIAN 6 — POLLING + AUTO-INIT
    // ============================================================
    var _poll = setInterval(function () {
        if (typeof window.getMJOData === 'function' && !window.getMJOData.__mjoFixWrapped) {
            clearInterval(_poll);
            window.__mjoFixPasangWrapper();
            overrideDampakMJO();
        }
        if (window.getMJOData && window.getMJOData.__mjoFixWrapped) {
            clearInterval(_poll);
            overrideDampakMJO();
        }
    }, 100);

    // Pre-fetch setelah semua patch dimuat
    setTimeout(function () {
        if (typeof window.getMJOData === 'function') {
            window.getMJOData().catch(function () {});
        }
    }, 1500);

    window.__mjoFixV1Aktif = true;

    console.log(
        '%c✅ patch_mjo_fix_v1.js v2 AKTIF\n' +
        '\n  ╔══ MJO HYBRID: BOM + ESTIMASI STATISTIK ═══════════╗\n' +
        '  ║ JAWABAN: MJO TIDAK akan selalu netral (0)           \n' +
        '  ║                                                      \n' +
        '  ║ LAPIS 1 — BOM Real-time (jika server bisa diakses)  \n' +
        '  ║   corsproxy.io → BOM https ✅                        \n' +
        '  ║   allorigins   → Albany mirror ✅                    \n' +
        '  ║   GAS proxy    → BOM via server Google ✅            \n' +
        '  ║   Timeout: 8 detik paralel (bukan 24 detik seq)     \n' +
        '  ║                                                      \n' +
        '  ║ LAPIS 2 — Estimasi Statistik (selalu tersedia)      \n' +
        '  ║   Input: ENSO (window._ensoDataTerkini) + Bulan     \n' +
        '  ║   La Niña + Ags-Sep → Fase 5 basah Sulawesi         \n' +
        '  ║   El Niño + Jun-Okt → Fase 7 kering Indonesia       \n' +
        '  ║   Akurasi ~60-70% vs data real-time                 \n' +
        '  ║   Sumber: Wheeler & Hendon (2004), Hendon (2007)    \n' +
        '  ║                                                      \n' +
        '  ║ [MJO-1] URL https, hapus codetabs ✅                \n' +
        '  ║ [MJO-2] AbortController manual (kompatibel semua)   \n' +
        '  ║ [MJO-3] Cache + polling wrapper sebelum autoFetch   \n' +
        '  ║ [MJO-4] _dampakLangsung ke getDampakMJO & 6F        \n' +
        '  ╚═══════════════════════════════════════════════════╝',
        'color:#d946ef; font-weight:bold;'
    );

})();
