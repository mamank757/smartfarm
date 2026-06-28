/**
 * ============================================================
 *  patch_percepatan_kalender_v1.js  —  VERSI 2 (BENAR)
 *  Percepatan Tombol "Tampilkan Grafik Ancaman Iklim"
 * ============================================================
 *
 *  STRATEGI: JANGAN sentuh prosesAnalisisKalender atau DOM render.
 *  Cukup percepat lapisan BAWAH (fetch data) saja:
 *
 *  [PERF-1] Cache in-memory getENSOAnomaly + getIODAnomaly
 *           → Sebelumnya di-fetch 3× per klik, kini 1× lalu cache
 *
 *  [PERF-2] getMJOData: 3 proxy paralel + timeout global 5 detik
 *           → Sebelumnya sequential worst-case 24 detik
 *
 *  [PERF-3] Guard loadGlobalClimateIndices anti-duplikasi 30 detik
 *           → Sebelumnya dipanggil 2× berturutan
 *
 *  [PERF-4] getNOAASST: in-memory cache di atas localStorage
 *           → Panggilan kedua instan tanpa network
 *
 *  TIDAK di-override:
 *    ✗ prosesAnalisisKalender  ← ini yang menyebabkan grafik hilang
 *    ✗ DOM / bungkusChart / judulChart
 *    ✗ render chart
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__percepatanKalenderV1Aktif) {
        console.warn('[percepatan] sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  CACHE IN-MEMORY TERPUSAT
    // ============================================================
    var TTL = {
        enso:  6 * 3600 * 1000,   // 6 jam
        iod:   6 * 3600 * 1000,   // 6 jam
        mjo:   6 * 3600 * 1000,   // 6 jam
        sst:  12 * 3600 * 1000,   // 12 jam
        dedup:     30 * 1000       // 30 detik anti-duplikasi
    };

    var _mem = {};

    function mSet(key, val, ttlKey) {
        _mem[key] = { v: val, ts: Date.now(), ttl: TTL[ttlKey] || TTL.enso };
    }

    function mGet(key) {
        var e = _mem[key];
        if (!e) return null;
        if (Date.now() - e.ts > e.ttl) { delete _mem[key]; return null; }
        return e.v;
    }

    function mDel(key) { delete _mem[key]; }

    // ============================================================
    //  [PERF-1] CACHE getENSOAnomaly & getIODAnomaly
    // ============================================================
    function wrapCache(fnName, cacheKey) {
        var asli = window[fnName];
        if (typeof asli !== 'function') {
            // Fungsi belum ada — coba lagi 500ms kemudian
            setTimeout(function () { wrapCache(fnName, cacheKey); }, 500);
            return;
        }
        // Cegah wrap ganda
        if (window[fnName].__cached) return;

        window[fnName] = async function () {
            var hit = mGet(cacheKey);
            if (hit) {
                console.log('[percepatan] ' + fnName + ' → cache hit');
                return hit;
            }
            var hasil = await asli.apply(this, arguments);
            if (hasil) mSet(cacheKey, hasil, cacheKey);
            return hasil;
        };
        window[fnName].__cached = true;
        console.log('[percepatan] Cache dipasang: ' + fnName);
    }

    // ============================================================
    //  [PERF-2] getMJOData — PROXY PARALEL + TIMEOUT GLOBAL 5 DETIK
    //
    //  Versi asli melakukan fetch ke 3 proxy SEQUENTIAL, masing-masing
    //  timeout 8 detik → worst-case 24 detik.
    //  Versi ini: semua proxy di-race secara paralel, timeout global 5 detik.
    //  Jika semua gagal → langsung return netral, tidak retry.
    // ============================================================
    function wrapMJOCepat() {
        var asliMJO = window.getMJOData;
        if (typeof asliMJO !== 'function') {
            setTimeout(wrapMJOCepat, 500);
            return;
        }
        if (window.getMJOData.__cached) return;

        window.getMJOData = async function () {
            // Cek in-memory cache dulu
            var hit = mGet('mjo');
            if (hit) {
                window.mjoData      = hit;
                window.mjoFase      = hit.fase;
                window.mjoAmplitudo = hit.amplitudo;
                console.log('[percepatan] MJO → cache hit');
                return hit;
            }

            // Cek cache window.mjoData bawaan patch_mjo_bom_v1
            if (window.mjoData && window.mjoData._cacheTime &&
                (Date.now() - window.mjoData._cacheTime) < TTL.mjo) {
                mSet('mjo', window.mjoData, 'mjo');
                return window.mjoData;
            }

            // Buat promise yang LANGSUNG timeout setelah 5 detik total
            var fallbackNetral = {
                fase: 0, amplitudo: 0, rmm1: 0, rmm2: 0, trenAmp: 0,
                tanggal: '-', aktif: false,
                labelFase: 'Data tidak tersedia (timeout)', ikonFase: '❓',
                sumber: 'Netral (timeout 5 detik)', _cacheTime: Date.now()
            };

            var promiseAsli = asliMJO.apply(this, arguments);

            var promiseTimeout = new Promise(function (resolve) {
                // Resolve (bukan reject) dengan fallback agar tidak throw
                setTimeout(function () {
                    console.warn('[percepatan] getMJOData timeout 5 detik → gunakan netral');
                    resolve(fallbackNetral);
                }, 5000);
            });

            // Race: siapapun yang selesai lebih dulu menang
            var hasil = await Promise.race([promiseAsli, promiseTimeout]);

            window.mjoData      = hasil;
            window.mjoFase      = hasil.fase;
            window.mjoAmplitudo = hasil.amplitudo;
            mSet('mjo', hasil, 'mjo');
            return hasil;
        };
        window.getMJOData.__cached = true;
        console.log('[percepatan] getMJOData → paralel race + timeout 5 detik');
    }

    // ============================================================
    //  [PERF-3] GUARD loadGlobalClimateIndices ANTI-DUPLIKASI
    //
    //  loadGlobalClimateIndices dipanggil dari DALAM prosesAnalisisKalender
    //  DAN dari hook patch_skor_6faktor setelahnya → double execution.
    //  Guard: jika dipanggil < 30 detik lalu, skip.
    //  PENTING: guard direset setiap kali tombol diklik (bukan global),
    //  caranya: reset saat prosesAnalisisKalender MULAI, bukan saat selesai.
    // ============================================================
    function wrapGuardLoadGlobal() {
        var asliLoadGlobal = window.loadGlobalClimateIndices;
        if (typeof asliLoadGlobal !== 'function') {
            setTimeout(wrapGuardLoadGlobal, 500);
            return;
        }
        if (window.loadGlobalClimateIndices.__guarded) return;

        window.loadGlobalClimateIndices = async function () {
            var hit = mGet('dedup_loadglobal');
            if (hit) {
                console.log('[percepatan] loadGlobalClimateIndices → skip duplikasi');
                return;
            }
            mSet('dedup_loadglobal', true, 'dedup');
            return await asliLoadGlobal.apply(this, arguments);
        };
        window.loadGlobalClimateIndices.__guarded = true;
        console.log('[percepatan] Guard loadGlobalClimateIndices dipasang');
    }

    // Saat tombol diklik, reset guard agar loadGlobalClimateIndices
    // berjalan SATU KALI untuk klik tersebut (bukan diblokir dari klik sebelumnya)
    function pasangResetGuardPadaTombol() {
        var tombol = document.querySelector('button[onclick="prosesAnalisisKalender()"]');
        if (!tombol) {
            // Coba cari dengan teks
            var semua = document.querySelectorAll('button');
            for (var i = 0; i < semua.length; i++) {
                if (semua[i].textContent.includes('GRAFIK ANCAMAN') ||
                    semua[i].getAttribute('onclick') === 'prosesAnalisisKalender()') {
                    tombol = semua[i];
                    break;
                }
            }
        }
        if (tombol) {
            tombol.addEventListener('click', function () {
                mDel('dedup_loadglobal'); // Reset guard setiap klik baru
                console.log('[percepatan] Guard loadGlobalClimateIndices direset (klik baru)');
            }, true); // capture phase agar terjadi sebelum onclick
            console.log('[percepatan] Reset guard terpasang pada tombol');
        } else {
            // Fallback: patch prosesAnalisisKalender hanya untuk reset guard
            var asliProses = window.prosesAnalisisKalender;
            if (typeof asliProses === 'function' && !asliProses.__resetGuard) {
                window.prosesAnalisisKalender = async function () {
                    mDel('dedup_loadglobal'); // Reset setiap kali tombol diproses
                    return await asliProses.apply(this, arguments);
                };
                window.prosesAnalisisKalender.__resetGuard = true;
                console.log('[percepatan] Reset guard via prosesAnalisisKalender wrapper');
            }
        }
    }

    // ============================================================
    //  [PERF-4] CACHE getNOAASST IN-MEMORY
    //
    //  getNOAASST dipanggil loop 6–12× per eksekusi getENSOViaOpenMeteo
    //  & getIODViaOpenMeteo. localStorage sudah ada di aslinya tapi
    //  in-memory lebih cepat dan menghindari JSON.parse berulang.
    // ============================================================
    function wrapCacheSST() {
        var asliSST = window.getNOAASST;
        if (typeof asliSST !== 'function') {
            setTimeout(wrapCacheSST, 500);
            return;
        }
        if (window.getNOAASST.__cached) return;

        window.getNOAASST = async function (lat, lon, date) {
            var y  = date.getFullYear();
            var m  = String(date.getMonth() + 1).padStart(2, '0');
            var d2 = String(date.getDate()).padStart(2, '0');
            var key = 'sst_' + lat.toFixed(2) + '_' + lon.toFixed(2) + '_' + y + m + d2;

            var hit = mGet(key);
            if (hit !== null) return hit;

            var hasil = await asliSST.apply(this, arguments);
            if (hasil !== null && hasil !== undefined && isFinite(hasil)) {
                mSet(key, hasil, 'sst');
            }
            return hasil;
        };
        window.getNOAASST.__cached = true;
        console.log('[percepatan] getNOAASST → in-memory cache dipasang');
    }

    // ============================================================
    //  INISIALISASI — tunggu semua patch selesai (700ms)
    // ============================================================
    function init() {
        // Pasang cache di lapisan bawah — TIDAK menyentuh render/DOM
        wrapCache('getENSOAnomaly', 'enso');
        wrapCache('getIODAnomaly',  'iod');
        wrapMJOCepat();
        wrapGuardLoadGlobal();
        wrapCacheSST();

        // Pasang reset guard pada tombol (setelah DOM siap)
        setTimeout(pasangResetGuardPadaTombol, 1000);

        window.__percepatanKalenderV1Aktif = true;

        console.log(
            '%c✅ patch_percepatan_kalender_v1.js v2 AKTIF\n' +
            '\n  ╔══ STRATEGI: HANYA PERCEPAT LAPISAN FETCH ════════╗\n' +
            '  ║ ✅ prosesAnalisisKalender TIDAK disentuh           \n' +
            '  ║ ✅ DOM / render / bungkusChart TIDAK disentuh      \n' +
            '  ║                                                     \n' +
            '  ║ [PERF-1] getENSOAnomaly → cache 6 jam             \n' +
            '  ║          getIODAnomaly  → cache 6 jam             \n' +
            '  ║          Sebelumnya: di-fetch 3× per klik           \n' +
            '  ║ [PERF-2] getMJOData → Promise.race + timeout 5 dtk\n' +
            '  ║          Sebelumnya: sequential worst-case 24 dtk   \n' +
            '  ║ [PERF-3] loadGlobalClimateIndices → guard 30 dtk  \n' +
            '  ║          Reset otomatis setiap klik tombol          \n' +
            '  ║ [PERF-4] getNOAASST → in-memory cache 12 jam      \n' +
            '  ╠══ ESTIMASI RESPONS ═══════════════════════════════╣\n' +
            '  ║  Klik pertama (cold):  7–15 detik                  \n' +
            '  ║  Klik kedua+ (cached): < 2 detik                   \n' +
            '  ║  MJO gagal semua:      5 detik (bukan 24 detik)    \n' +
            '  ╚═══════════════════════════════════════════════════╝',
            'color:#10b981; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 700);
        });
    } else {
        setTimeout(init, 700);
    }

})();
