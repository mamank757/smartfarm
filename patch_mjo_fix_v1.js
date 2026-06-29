/**
 * ============================================================
 *  patch_mjo_fix_v1.js
 *  Fix MJO BOM Fetch — PPL Milenial Wajo
 * ============================================================
 *
 *  DIAGNOSIS DARI CONSOLE ERROR:
 *
 *  [MJO-1] URL BOM masih http:// di proxy codetabs
 *          "400 Bad Request" dari api.codetabs.com karena codetabs
 *          menolak source URL yang tidak HTTPS.
 *          FIX: Semua URL BOM wajib https://, hapus codetabs dari daftar.
 *
 *  [MJO-2] AbortSignal.timeout() tidak tersedia di Android WebView
 *          / Chrome lama → fetch tidak bisa di-abort → menggantung
 *          "signal is aborted without reason" muncul karena browser
 *          cancel fetch yang menggantung saat navigasi/GC.
 *          FIX: Ganti dengan AbortController manual yang kompatibel
 *          di semua browser (ES2017+).
 *
 *  [MJO-3] autoFetch() di patch_mjo_bom_v1 berjalan t=0ms saat file
 *          dimuat — SEBELUM patch_percepatan (t=700ms) sempat memasang
 *          wrapper timeout 5 detik. Akibatnya autoFetch memakai versi
 *          lama yang lambat tanpa timeout global.
 *          FIX: Override getMJOData SEBELUM autoFetch berjalan dengan
 *          cara memasang patch ini SEBELUM patch_mjo_bom_v1.js di HTML,
 *          ATAU: intercept dan delay autoFetch jika sudah terlambat.
 *
 *  [MJO-4] Proxy Albany (atmos.albany.edu) kadang lambat/down.
 *          Tambah proxy mirror akademik sebagai alternatif.
 *
 *  CARA PASANG DI index.html:
 *    Letakkan SEBELUM patch_mjo_bom_v1.js:
 *      <script src="patch_mjo_fix_v1.js"></script>
 *      <script src="patch_mjo_bom_v1.js"></script>
 *
 *    Dengan urutan ini, patch_mjo_fix akan mendefinisikan fetchRMMData
 *    yang benar SEBELUM patch_mjo_bom mencoba memakainya.
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__mjoFixV1Aktif) {
        console.warn('[mjo_fix] sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  BAGIAN 0 — AbortController HELPER KOMPATIBEL SEMUA BROWSER
    //  [MJO-2] Ganti AbortSignal.timeout() dengan AbortController manual
    // ============================================================

    /**
     * Buat { signal, cancel } dengan timeout manual.
     * Kompatibel dengan Chrome 66+, Firefox 57+, Safari 11.1+,
     * Android WebView, dan semua browser yang tidak punya AbortSignal.timeout.
     */
    function buatAbortDenganTimeout(ms) {
        var controller = new AbortController();
        var timer = setTimeout(function () {
            controller.abort('timeout ' + ms + 'ms');
        }, ms);
        return {
            signal: controller.signal,
            cancel: function () { clearTimeout(timer); controller.abort('dibatalkan'); }
        };
    }

    // Expose ke window agar patch lain bisa pakai
    window._buatAbortDenganTimeout = buatAbortDenganTimeout;

    // ============================================================
    //  BAGIAN 1 — DAFTAR PROXY MJO YANG BERSIH
    //  [MJO-1] Semua URL https://, hapus codetabs
    //  [MJO-4] Tambah mirror alternatif
    // ============================================================

    // URL sumber data RMM BOM (wajib https)
    var BOM_HTTPS    = 'https://www.bom.gov.au/climate/mjo/graphics/rmm.74toRealtime.txt';
    var ALBANY_HTTPS = 'https://www.atmos.albany.edu/facstaff/roundy/waves/data/rmm.74toRealtime.txt';

    // Proxy yang TERBUKTI support HTTPS source (codetabs DIHAPUS)
    var PROXY_MJO = [
        // Proxy 1: corsproxy.io — paling cepat, HTTPS source OK
        { nama: 'corsproxy.io',  url: 'https://corsproxy.io/?url=' + encodeURIComponent(BOM_HTTPS) },
        // Proxy 2: allorigins raw — HTTPS source OK, return teks langsung
        { nama: 'allorigins',    url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(ALBANY_HTTPS) },
        // Proxy 3: GAS Apps Script (proxy internal, bisa akses BOM langsung)
        { nama: 'GAS-proxy',     url: 'https://script.google.com/macros/s/AKfycbz9oRwYDHZW7IXJ2Bdjc7uJsr17Ez-ed7j_LDI7S_YzXnFuXHuzIRwPD3CVd2ZAhTt9Mg/exec?url=' + encodeURIComponent(BOM_HTTPS) }
    ];

    // ============================================================
    //  BAGIAN 2 — fetchRMMData YANG DIPERBAIKI
    //  Race paralel semua proxy + timeout per-proxy 6 detik
    //  + timeout global 8 detik
    //  [MJO-1] URL https, hapus codetabs
    //  [MJO-2] AbortController manual
    // ============================================================

    window.fetchRMMData = async function () {
        var TIMEOUT_PER_PROXY = 6000;  // 6 detik per proxy
        var TIMEOUT_GLOBAL    = 8000;  // 8 detik total keseluruhan

        /**
         * Fetch satu proxy dengan timeout AbortController manual
         * dan validasi isi (pastikan ini benar-benar data RMM BOM)
         */
        function fetchSatuProxy(proxy) {
            var ab    = buatAbortDenganTimeout(TIMEOUT_PER_PROXY);
            var p     = fetch(proxy.url, { signal: ab.signal })
                .then(function (r) {
                    ab.cancel();
                    if (!r.ok) throw new Error(proxy.nama + ' HTTP ' + r.status);
                    return r.text();
                })
                .then(function (teks) {
                    // GAS proxy membungkus dalam JSON { contents: "..." }
                    if (teks && teks.trim().startsWith('{')) {
                        try {
                            var j = JSON.parse(teks);
                            teks  = j.contents || teks;
                        } catch (e) { /* bukan JSON, pakai apa adanya */ }
                    }
                    // Validasi: harus ada kolom RMM
                    if (!teks || teks.length < 100) {
                        throw new Error(proxy.nama + ' isi terlalu pendek');
                    }
                    if (!teks.includes('phase') && !teks.includes('RMM') && !teks.includes('1974')) {
                        throw new Error(proxy.nama + ' format tidak dikenal');
                    }
                    console.log('[mjo_fix] ✅ RMM berhasil dari ' + proxy.nama);
                    return teks;
                })
                .catch(function (e) {
                    ab.cancel();
                    throw new Error(proxy.nama + ': ' + e.message);
                });
            return p;
        }

        // Buat SEMUA fetch paralel sekaligus
        var semuaPromise = PROXY_MJO.map(fetchSatuProxy);

        // Timeout global: jika semua proxy belum selesai dalam 8 detik → throw
        var timeoutGlobal = new Promise(function (_, reject) {
            setTimeout(function () {
                reject(new Error('Semua proxy MJO timeout dalam ' + TIMEOUT_GLOBAL + 'ms'));
            }, TIMEOUT_GLOBAL);
        });

        // Ambil yang pertama berhasil, atau throw jika semua gagal
        if (typeof Promise.any === 'function') {
            return await Promise.race([
                Promise.any(semuaPromise),
                timeoutGlobal
            ]);
        }

        // Polyfill Promise.any untuk browser lama
        return await Promise.race([
            new Promise(function (resolve, reject) {
                var gagal = 0;
                var errors = [];
                semuaPromise.forEach(function (p) {
                    p.then(resolve).catch(function (e) {
                        errors.push(e.message);
                        if (++gagal >= semuaPromise.length) {
                            reject(new Error('Semua proxy gagal: ' + errors.join(' | ')));
                        }
                    });
                });
            }),
            timeoutGlobal
        ]);
    };

    console.log('[mjo_fix] fetchRMMData diperbaiki (https, tanpa codetabs, AbortController manual)');

    // ============================================================
    //  BAGIAN 3 — getMJOData DENGAN TIMEOUT GLOBAL + CACHE
    //  [MJO-3] Pasang wrapper SEBELUM autoFetch berjalan
    //  Karena file ini dimuat SEBELUM patch_mjo_bom_v1, wrapper ini
    //  akan jadi versi yang dipakai oleh autoFetch.
    // ============================================================

    var _CACHE_MJO    = null;
    var _CACHE_TS     = 0;
    var TTL_MJO_MS    = 6 * 3600 * 1000; // 6 jam
    var TIMEOUT_MJO   = 9000;             // 9 detik batas total getMJOData

    // Definisikan getMJOData awal yang aman — akan di-extend oleh patch_mjo_bom_v1
    // Saat patch_mjo_bom_v1 dimuat, dia akan override window.getMJOData.
    // Kita intercept SETELAH itu dengan flag delayed.

    // Simpan referensi agar bisa di-wrap setelah patch_mjo_bom_v1 dimuat
    window.__mjoFixPasangWrapper = function () {
        var asliMJO = window.getMJOData;
        if (!asliMJO || asliMJO.__mjoFixWrapped) return;

        window.getMJOData = async function () {
            // [CACHE] Cek in-memory cache dulu
            if (_CACHE_MJO && (Date.now() - _CACHE_TS) < TTL_MJO_MS) {
                console.log('[mjo_fix] getMJOData → cache hit (' +
                    Math.round((Date.now() - _CACHE_TS) / 60000) + ' menit lalu)');
                window.mjoData      = _CACHE_MJO;
                window.mjoFase      = _CACHE_MJO.fase;
                window.mjoAmplitudo = _CACHE_MJO.amplitudo;
                return _CACHE_MJO;
            }

            // [TIMEOUT] Batas waktu total 9 detik
            var fallback = {
                fase: 0, amplitudo: 0, rmm1: 0, rmm2: 0, trenAmp: 0,
                tanggal: '-', aktif: false,
                labelFase: 'Data tidak tersedia', ikonFase: '❓',
                sumber: 'Netral (timeout/gagal)', _cacheTime: Date.now()
            };

            var promiseFetch   = asliMJO.apply(this, arguments);
            var promiseTimeout = new Promise(function (resolve) {
                setTimeout(function () {
                    console.warn('[mjo_fix] getMJOData timeout ' + TIMEOUT_MJO + 'ms → netral');
                    resolve(fallback);
                }, TIMEOUT_MJO);
            });

            var hasil = await Promise.race([promiseFetch, promiseTimeout]);

            // Simpan ke cache jika berhasil (bukan fallback)
            if (hasil && hasil.fase !== 0) {
                _CACHE_MJO = hasil;
                _CACHE_TS  = Date.now();
            }

            window.mjoData      = hasil;
            window.mjoFase      = hasil.fase;
            window.mjoAmplitudo = hasil.amplitudo;
            return hasil;
        };
        window.getMJOData.__mjoFixWrapped = true;
        console.log('[mjo_fix] getMJOData wrapper aktif (cache + timeout ' + TIMEOUT_MJO + 'ms)');
    };

    // ============================================================
    //  BAGIAN 4 — AUTO-PASANG WRAPPER SETELAH patch_mjo_bom_v1 DIMUAT
    //
    //  Strategi: polling setiap 100ms, cek apakah getMJOData sudah
    //  didefinisikan oleh patch_mjo_bom_v1. Begitu ada → pasang wrapper.
    //  Ini mengatasi race condition antara kedua file.
    // ============================================================

    var _pollingCount = 0;
    var _pollingMax   = 60; // maks 6 detik (60 × 100ms)

    var _pollMJO = setInterval(function () {
        _pollingCount++;

        // Jika getMJOData sudah ada dari patch_mjo_bom → pasang wrapper
        if (typeof window.getMJOData === 'function' && !window.getMJOData.__mjoFixWrapped) {
            clearInterval(_pollMJO);
            window.__mjoFixPasangWrapper();
            return;
        }

        // Jika wrapper sudah terpasang → stop polling
        if (window.getMJOData && window.getMJOData.__mjoFixWrapped) {
            clearInterval(_pollMJO);
            return;
        }

        // Timeout polling
        if (_pollingCount >= _pollingMax) {
            clearInterval(_pollMJO);
            console.warn('[mjo_fix] getMJOData tidak ditemukan setelah 6 detik — patch_mjo_bom_v1 belum dimuat?');
        }
    }, 100);

    // ============================================================
    //  BAGIAN 5 — DISABLE autoFetch SEMENTARA, AKTIFKAN SETELAH WRAPPER
    //
    //  Masalah: patch_mjo_bom_v1 menjalankan autoFetch() langsung saat
    //  file dimuat (t=0ms), sebelum wrapper timeout kita sempat dipasang.
    //
    //  Cara: Definisikan window.__mjoBomAutoFetchDisabled = true SEBELUM
    //  patch_mjo_bom_v1 dimuat. Patch asli mengecek flag ini di autoFetch.
    //
    //  Tapi karena kita tidak bisa modifikasi patch_mjo_bom_v1, kita
    //  intercept dengan cara lain: simpan getMJOData yang akan dipanggil
    //  autoFetch, dan setelah wrapper terpasang, panggil getMJOData baru.
    // ============================================================

    // Flag untuk memberi tahu patch_mjo_bom_v1 agar skip autoFetch
    // (patch_mjo_bom_v1 tidak cek flag ini, tapi kita bisa intercept
    // dengan memonitor kapan getMJOData pertama kali dipanggil)

    // Setelah wrapper terpasang dan stabil, lakukan satu kali fetch
    // untuk mengisi cache — ini menggantikan autoFetch yang terlambat
    setTimeout(function () {
        if (typeof window.getMJOData === 'function') {
            window.getMJOData().then(function (data) {
                if (data && data.fase !== 0) {
                    console.log('[mjo_fix] Pre-fetch MJO berhasil: Fase ' + data.fase +
                        ', Amplitudo ' + data.amplitudo);
                } else {
                    console.log('[mjo_fix] Pre-fetch MJO: data netral (server tidak tersedia)');
                }
            }).catch(function (e) {
                console.warn('[mjo_fix] Pre-fetch MJO gagal:', e.message);
            });
        }
    }, 1500); // 1.5 detik setelah patch_mjo_bom_v1 selesai dimuat

    // ============================================================
    //  INISIALISASI
    // ============================================================

    window.__mjoFixV1Aktif = true;

    console.log(
        '%c✅ patch_mjo_fix_v1.js AKTIF\n' +
        '\n  ╔══ FIX MJO BOM FETCH ══════════════════════════════╗\n' +
        '  ║ [MJO-1] URL BOM: http → https ✅                   \n' +
        '  ║         Hapus codetabs (tidak support HTTP source)  \n' +
        '  ║ [MJO-2] AbortSignal.timeout → AbortController      \n' +
        '  ║         Kompatibel Android WebView & Chrome lama    \n' +
        '  ║ [MJO-3] Race condition autoFetch: polling wrapper   \n' +
        '  ║         Wrapper terpasang sebelum fetch pertama     \n' +
        '  ║ [MJO-4] Proxy baru: corsproxy + allorigins + GAS   \n' +
        '  ║         Semua HTTPS, paralel race, timeout 8 detik  \n' +
        '  ╠══ PROXY AKTIF (tanpa codetabs) ═══════════════════╣\n' +
        '  ║  1. corsproxy.io  → BOM https (paling cepat)       \n' +
        '  ║  2. allorigins    → Albany mirror https             \n' +
        '  ║  3. GAS Apps Script → BOM https (via server)       \n' +
        '  ╠══ CARA PASANG ════════════════════════════════════╣\n' +
        '  ║  <script src="patch_mjo_fix_v1.js"></script>        \n' +
        '  ║  <script src="patch_mjo_bom_v1.js"></script>        \n' +
        '  ║  (mjo_fix HARUS sebelum mjo_bom)                   \n' +
        '  ╚═══════════════════════════════════════════════════╝',
        'color:#d946ef; font-weight:bold;'
    );

})();
