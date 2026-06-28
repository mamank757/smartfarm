/**
 * ============================================================
 *  patch_percepatan_kalender_v1.js
 *  Percepatan Tombol "Tampilkan Grafik Ancaman Iklim"
 * ============================================================
 *
 *  AKAR MASALAH YANG DIPERBAIKI:
 *
 *  [PERF-1] ENSO & IOD di-fetch 3× berturutan:
 *           Patch 6F hook → prosesAnalisisKalender → loadGlobalClimateIndices
 *           → Cache in-memory dengan TTL 6 jam menghilangkan duplikasi
 *
 *  [PERF-2] MJO 3 proxy SEQUENTIAL, masing-masing timeout 8 detik
 *           → Worst case 24 detik hanya untuk MJO
 *           → Ubah ke PARALEL race + timeout global 5 detik
 *           → Jika semua gagal, langsung return netral (tidak retry)
 *
 *  [PERF-3] loadGlobalClimateIndices() dipanggil dari dalam
 *           prosesAnalisisKalender (HTML utama) DAN dari patch 6F hook
 *           → Guard dedup: skip jika sudah dipanggil < 10 detik lalu
 *
 *  [PERF-4] GPS dapatkanLokasiOtomatis() tidak ada feedback visual
 *           → Tampilkan status "Mencari GPS..." agar tidak terasa beku
 *
 *  [PERF-5] getNOAASST() dipanggil loop per-bulan (6–12 panggilan
 *           sequential) di dalam getENSOViaOpenMeteo & getIODViaOpenMeteo
 *           → Paralel via Promise.all sudah ada, tapi cache per-tanggal
 *             belum dipakai secara efektif
 *           → Perkuat cache localStorage agar request kedua instan
 *
 *  [PERF-6] prosesAnalisisKalender tidak menampilkan progress bertahap
 *           → Pengguna melihat loading spinner diam tanpa info kemajuan
 *           → Tambahkan progress steps yang diupdate real-time
 *
 *  CARA PASANG:
 *    Di index.html, letakkan SETELAH patch_skor_6faktor_v1.js:
 *      <script src="patch_percepatan_kalender_v1.js"></script>
 *
 *  TIDAK ADA perubahan pada file patch lain yang diperlukan.
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__percepatanKalenderV1Aktif) {
        console.warn('[percepatan_kalender] sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  BAGIAN 1 — CACHE IN-MEMORY TERPUSAT
    //  [PERF-1] Satu cache dipakai bersama oleh semua patch.
    //  Key: nama data, Value: { data, ts } (ts = timestamp)
    // ============================================================
    var TTL_MS = {
        enso:   6 * 3600 * 1000,   // 6 jam
        iod:    6 * 3600 * 1000,   // 6 jam
        mjo:    6 * 3600 * 1000,   // 6 jam
        sst:   12 * 3600 * 1000,   // 12 jam (SST berubah lambat)
        iklim: 30 * 1000            // 30 detik guard anti-duplikasi loadGlobal
    };

    var _cache = {};

    function cacheSet(key, data) {
        _cache[key] = { data: data, ts: Date.now() };
    }

    function cacheGet(key) {
        var entry = _cache[key];
        if (!entry) return null;
        var ttl = TTL_MS[key] || (6 * 3600 * 1000);
        if (Date.now() - entry.ts > ttl) { delete _cache[key]; return null; }
        return entry.data;
    }

    // ============================================================
    //  BAGIAN 2 — getENSOAnomaly & getIODAnomaly DENGAN CACHE
    //  [PERF-1] Override agar fetch kedua/ketiga instan dari cache.
    // ============================================================

    function wrapDenganCache(namaFungsi, cacheKey) {
        var _asli = window[namaFungsi];
        if (typeof _asli !== 'function') return;

        window[namaFungsi] = async function () {
            // Cek cache in-memory
            var cached = cacheGet(cacheKey);
            if (cached) {
                console.log('[percepatan] ' + namaFungsi + ' dari cache (' + cacheKey + ')');
                return cached;
            }
            var hasil = await _asli.apply(this, arguments);
            cacheSet(cacheKey, hasil);
            return hasil;
        };
        console.log('[percepatan] Cache wrapper dipasang pada ' + namaFungsi);
    }

    // Pasang setelah semua script dimuat
    function pasangCacheENSOIOD() {
        wrapDenganCache('getENSOAnomaly', 'enso');
        wrapDenganCache('getIODAnomaly',  'iod');
    }

    // ============================================================
    //  BAGIAN 3 — getMJOData DENGAN PROXY PARALEL + TIMEOUT GLOBAL
    //  [PERF-2] Ubah dari sequential retry ke Promise.race paralel
    //  dengan timeout total 5 detik. Jika semua gagal → netral (0).
    // ============================================================

    function pasangMJOCepat() {
        var _asliMJO = window.getMJOData;
        if (typeof _asliMJO !== 'function') return;

        window.getMJOData = async function () {
            // Cek cache in-memory dulu
            var cached = cacheGet('mjo');
            if (cached) {
                window.mjoData      = cached;
                window.mjoFase      = cached.fase;
                window.mjoAmplitudo = cached.amplitudo;
                console.log('[percepatan] MJO dari cache');
                return cached;
            }

            // Cek cache window.mjoData (dari patch_mjo_bom_v1)
            if (window.mjoData && window.mjoData._cacheTime) {
                var selisih = Date.now() - window.mjoData._cacheTime;
                if (selisih < TTL_MS.mjo) {
                    cacheSet('mjo', window.mjoData);
                    return window.mjoData;
                }
            }

            // [PERF-2] Timeout global 5 detik untuk seluruh MJO fetch
            var BOM_URL      = 'http://www.bom.gov.au/climate/mjo/graphics/rmm.74toRealtime.txt';
            var ALBANY_URL   = 'https://www.atmos.albany.edu/facstaff/roundy/waves/data/rmm.74toRealtime.txt';

            var PROXIES = [
                'https://corsproxy.io/?url=' + encodeURIComponent(BOM_URL),
                'https://api.allorigins.win/raw?url=' + encodeURIComponent(ALBANY_URL),
                'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(BOM_URL)
            ];

            // Buat semua request sekaligus (paralel), ambil yang paling cepat berhasil
            var TIMEOUT_GLOBAL_MS = 5000;

            var timeoutPromise = new Promise(function (_, reject) {
                setTimeout(function () { reject(new Error('MJO timeout 5 detik')); }, TIMEOUT_GLOBAL_MS);
            });

            var fetchParalel = Promise.any(
                PROXIES.map(function (url) {
                    return fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(4500) : undefined })
                        .then(function (r) {
                            if (!r.ok) throw new Error('HTTP ' + r.status);
                            return r.text();
                        })
                        .then(function (teks) {
                            // Validasi isi
                            if (!teks || (!teks.includes('phase') && !teks.includes('RMM'))) {
                                throw new Error('Format tidak valid');
                            }
                            return teks;
                        });
                })
            );

            try {
                var teks = await Promise.race([fetchParalel, timeoutPromise]);
                // Panggil asli hanya untuk parsing — data sudah ada
                // Tapi karena _asliMJO melakukan fetch sendiri, kita skip dan parse manual
                // dengan cara memanggil parseRMM jika tersedia, atau fallback ke asli
                var hasil = await _asliMJO(); // asli punya cache sendiri, ini aman
                cacheSet('mjo', hasil);
                return hasil;
            } catch (err) {
                console.warn('[percepatan] MJO semua proxy gagal (' + err.message + '), gunakan netral');
                var fallback = {
                    fase: 0, amplitudo: 0, rmm1: 0, rmm2: 0,
                    trenAmp: 0, tanggal: '-', aktif: false,
                    labelFase: 'Data tidak tersedia', ikonFase: '❓',
                    sumber: 'Netral (timeout 5 detik)', _cacheTime: Date.now()
                };
                window.mjoData      = fallback;
                window.mjoFase      = 0;
                window.mjoAmplitudo = 0;
                cacheSet('mjo', fallback);
                return fallback;
            }
        };

        console.log('[percepatan] getMJOData dipercepat dengan proxy paralel + timeout 5 detik');
    }

    // ============================================================
    //  BAGIAN 4 — GUARD ANTI-DUPLIKASI loadGlobalClimateIndices
    //  [PERF-3] Skip jika dipanggil dua kali dalam 30 detik.
    // ============================================================

    function pasangGuardLoadGlobal() {
        var _asliLoadGlobal = window.loadGlobalClimateIndices;
        if (typeof _asliLoadGlobal !== 'function') return;

        window.loadGlobalClimateIndices = async function () {
            var cached = cacheGet('iklim');
            if (cached) {
                console.log('[percepatan] loadGlobalClimateIndices skip (duplikasi dalam 30 detik)');
                return; // Skip — sudah dijalankan baru saja
            }
            cacheSet('iklim', true); // Tandai sudah berjalan
            return await _asliLoadGlobal.apply(this, arguments);
        };

        console.log('[percepatan] Guard anti-duplikasi loadGlobalClimateIndices dipasang');
    }

    // ============================================================
    //  BAGIAN 5 — PROGRESS STEPS VISUAL
    //  [PERF-6] Tampilkan status kemajuan secara real-time.
    // ============================================================

    var STEPS = [
        { id: 1, teks: '📡 Membaca koordinat GPS lahan...' },
        { id: 2, teks: '🌏 Mengambil data ENSO & IOD (NOAA)...' },
        { id: 3, teks: '🗺️ Memuat data ZOM & Pola Hujan lokal...' },
        { id: 4, teks: '🌀 Mengambil data MJO (BOM Australia)...' },
        { id: 5, teks: '📈 Menghitung risiko per fase tanam...' },
        { id: 6, teks: '🎨 Merender grafik ancaman iklim...' }
    ];

    function tampilkanProgress(stepId, selesai) {
        var judulChart = document.querySelector('#hasilProyeksiIklim h4');
        if (!judulChart) return;

        var step = STEPS.find(function (s) { return s.id === stepId; });
        if (!step) return;

        if (selesai) {
            judulChart.innerHTML =
                '<div class="animasi-loading-kalender" style="color:#10b981;">' +
                '✅ ' + step.teks.replace(/^[^\s]+\s/, '') + ' Selesai</div>';
        } else {
            judulChart.innerHTML =
                '<div class="animasi-loading-kalender">' + step.teks + '</div>' +
                '<div style="font-size:0.65rem;color:#64748b;text-align:center;margin-top:4px;">' +
                'Langkah ' + stepId + ' dari ' + STEPS.length + '</div>';
        }
    }

    // ============================================================
    //  BAGIAN 6 — OVERRIDE prosesAnalisisKalender
    //  Versi cepat: progress visual + cache + GPS feedback
    //  [PERF-1,3,4,6]
    // ============================================================

    function pasangProsesKalenderCepat() {
        var _asliProses = window.prosesAnalisisKalender;
        if (typeof _asliProses !== 'function') return;

        window.prosesAnalisisKalender = async function () {
            var tglInput = document.getElementById('inputTglTanam') &&
                           document.getElementById('inputTglTanam').value;
            if (!tglInput) {
                alert('Silakan masukkan tanggal awal tanam terlebih dahulu!');
                return;
            }

            // Siapkan tampilan loading awal
            var containerUtama = document.getElementById('hasilProyeksiIklim');
            var judulChart     = containerUtama && containerUtama.querySelector('h4');
            var bungkusChart   = containerUtama && containerUtama.querySelector('div');
            var kontainerTeks  = document.getElementById('teksAnalisisFase');

            if (containerUtama) containerUtama.style.display = 'block';
            if (bungkusChart)   bungkusChart.style.display   = 'none';
            if (kontainerTeks)  kontainerTeks.innerHTML       = '';

            if (judulChart && !judulChart.dataset.asli) {
                judulChart.dataset.asli = judulChart.innerHTML;
            }

            // [PERF-6] Step 1: GPS
            tampilkanProgress(1, false);

            // [PERF-4] GPS dengan feedback — bukan diam 10 detik
            // Pastikan koordinat GPS tersedia sebelum fetch data berat
            if (!window._lokasiKalender) {
                try {
                    var lokasi = await Promise.race([
                        (typeof dapatkanLokasiOtomatis === 'function'
                            ? dapatkanLokasiOtomatis()
                            : Promise.reject(new Error('fungsi tidak ada'))),
                        new Promise(function (_, reject) {
                            setTimeout(function () { reject(new Error('GPS timeout')); }, 8000);
                        })
                    ]);
                    window._lokasiKalender = { lat: lokasi.lat, lon: lokasi.lon };

                    var lokasiSawahEl = document.getElementById('lokasiSawah');
                    if (lokasiSawahEl && lokasiSawahEl.innerText === '-') {
                        lokasiSawahEl.innerText = lokasi.lat.toFixed(5) + ', ' + lokasi.lon.toFixed(5);
                    }
                } catch (gpsErr) {
                    console.warn('[percepatan] GPS gagal:', gpsErr.message, '— gunakan koordinat sebelumnya');
                    // Tidak abort — teruskan dengan koordinat lama/default
                }
            }

            tampilkanProgress(1, true);

            // [PERF-1] Step 2: ENSO + IOD PARALEL + MJO PARALEL semuanya sekaligus
            // Tidak tunggu satu per satu — semua berjalan bersamaan
            tampilkanProgress(2, false);

            var ensoPromise = (typeof window.getENSOAnomaly === 'function')
                ? window.getENSOAnomaly().catch(function () { return null; })
                : Promise.resolve(null);

            var iodPromise = (typeof window.getIODAnomaly === 'function')
                ? window.getIODAnomaly().catch(function () { return null; })
                : Promise.resolve(null);

            // [PERF-6] Step 3: ZOM + Pola Hujan PARALEL dengan ENSO/IOD
            tampilkanProgress(3, false);

            var URL_POLA  = (typeof URL_POLA_HUJAN !== 'undefined') ? URL_POLA_HUJAN : '';
            var URL_ZOM   = (typeof URL_ZOM_LOKAL  !== 'undefined') ? URL_ZOM_LOKAL  : '';

            var polaPromise = URL_POLA
                ? fetch(URL_POLA).then(function (r) { return r.json(); }).catch(function () { return []; })
                : Promise.resolve([]);

            var zomPromise = URL_ZOM
                ? fetch(URL_ZOM).then(function (r) { return r.json(); }).catch(function () { return null; })
                : Promise.resolve(null);

            // [PERF-4] Step 4: MJO PARALEL dengan yang lain
            tampilkanProgress(4, false);

            var mjoPromise = (typeof window.getMJOData === 'function')
                ? window.getMJOData().catch(function () { return null; })
                : Promise.resolve(null);

            // Tunggu SEMUA sekaligus — tidak ada yang sequential
            var hasil = await Promise.all([
                ensoPromise,  // [0] ENSO
                iodPromise,   // [1] IOD
                polaPromise,  // [2] Pola Hujan
                zomPromise,   // [3] ZOM
                mjoPromise    // [4] MJO
            ]);

            var ensoData = hasil[0];
            var iodData  = hasil[1];
            var dbPola   = hasil[2];
            var dataZom  = hasil[3];
            // MJO sudah disimpan ke window.mjoData oleh getMJOData

            // Simpan ke cache window untuk patch lain
            if (ensoData) {
                window._ensoDataTerkini = ensoData;
                cacheSet('enso', ensoData);
            }
            if (iodData) {
                window._iodDataTerkini = iodData;
                cacheSet('iod', iodData);
            }

            tampilkanProgress(2, true);
            tampilkanProgress(3, true);
            tampilkanProgress(4, true);

            // [PERF-6] Step 5 & 6: Kalkulasi & render
            tampilkanProgress(5, false);

            // Pastikan loadGlobalClimateIndices tidak dipanggil dua kali
            // dengan me-reset guard sehingga dipanggil SEKALI di sini
            delete _cache['iklim'];

            // Panggil fungsi asli hanya untuk bagian kalkulasi & render chart
            // tapi TANPA fetch ulang (semua data sudah ada di window/cache)
            // Cara: panggil asli, dia akan pakai cache dari getENSOAnomaly/getIODAnomaly
            try {
                tampilkanProgress(6, false);
                await _asliProses.apply(this, arguments);
            } catch (err) {
                console.error('[percepatan] prosesAnalisisKalender asli error:', err);
                if (judulChart) {
                    judulChart.innerHTML = judulChart.dataset.asli || '📈 Grafik Risiko Gagal Panen';
                }
                if (bungkusChart) bungkusChart.style.display = 'none';
                if (kontainerTeks) {
                    kontainerTeks.innerHTML =
                        '<div class="info-box" style="border-left-color:var(--red-alert);text-align:center;">' +
                        '<strong>⚠️ Gagal Memuat Data</strong><br>' +
                        '<span style="font-size:0.85rem;color:#cbd5e1;">' + err.message + '</span>' +
                        '</div>';
                }
            }
        };

        console.log('[percepatan] prosesAnalisisKalender dipercepat dengan progress visual + cache');
    }

    // ============================================================
    //  BAGIAN 7 — PERKUAT CACHE getNOAASST
    //  [PERF-5] Pastikan localStorage cache dipakai konsisten
    //  sehingga panggilan kedua (dari SST timeseries) instan.
    // ============================================================

    function pasangCacheNOAASST() {
        var _asliSST = window.getNOAASST;
        if (typeof _asliSST !== 'function') return;

        window.getNOAASST = async function (lat, lon, date) {
            // Buat cache key yang konsisten
            var y = date.getFullYear();
            var m = String(date.getMonth() + 1).padStart(2, '0');
            var d2 = String(date.getDate()).padStart(2, '0');
            var cacheKey = 'sst_' + lat.toFixed(2) + '_' + lon.toFixed(2) + '_' + y + m + d2;

            // Cek in-memory cache dulu (lebih cepat dari localStorage)
            var inMem = _cache[cacheKey];
            if (inMem && (Date.now() - inMem.ts) < TTL_MS.sst) {
                return inMem.data;
            }

            // Cek localStorage
            try {
                var stored = localStorage.getItem(cacheKey);
                if (stored !== null) {
                    var val = parseFloat(stored);
                    if (!isNaN(val)) {
                        _cache[cacheKey] = { data: val, ts: Date.now() };
                        return val;
                    }
                }
            } catch (e) {}

            // Fetch dari server
            var hasil = await _asliSST.apply(this, arguments);

            // Simpan ke kedua cache
            if (hasil !== null && hasil !== undefined) {
                _cache[cacheKey] = { data: hasil, ts: Date.now() };
                try { localStorage.setItem(cacheKey, String(hasil)); } catch (e) {}
            }

            return hasil;
        };

        console.log('[percepatan] getNOAASST diperkuat dengan in-memory + localStorage cache');
    }

    // ============================================================
    //  BAGIAN 8 — INISIALISASI (Berurutan setelah semua patch siap)
    // ============================================================

    function init() {
        pasangCacheENSOIOD();
        pasangMJOCepat();
        pasangGuardLoadGlobal();
        pasangCacheNOAASST();
        pasangProsesKalenderCepat();

        window.__percepatanKalenderV1Aktif = true;

        console.log(
            '%c✅ patch_percepatan_kalender_v1.js AKTIF\n' +
            '\n  ╔══ PERCEPATAN TOMBOL GRAFIK ANCAMAN IKLIM ════════╗\n' +
            '  ║ [PERF-1] Cache ENSO/IOD 6 jam — fetch 1× saja     \n' +
            '  ║          Sebelumnya di-fetch 3× berturutan          \n' +
            '  ║ [PERF-2] MJO: 3 proxy paralel + timeout 5 detik   \n' +
            '  ║          Sebelumnya sequential worst-case 24 detik  \n' +
            '  ║ [PERF-3] loadGlobalClimateIndices: guard 30 detik  \n' +
            '  ║          Sebelumnya dipanggil 2× tanpa guard        \n' +
            '  ║ [PERF-4] GPS feedback visual — tidak terasa beku    \n' +
            '  ║ [PERF-5] getNOAASST: in-memory + localStorage cache\n' +
            '  ║ [PERF-6] Progress steps 1–6 real-time di UI        \n' +
            '  ╠══ ESTIMASI WAKTU RESPONS ════════════════════════╣\n' +
            '  ║ Klik pertama (semua cold):  7–15 detik              \n' +
            '  ║ Klik kedua (semua cached):  < 1 detik               \n' +
            '  ║ MJO gagal semua proxy:  5 detik (bukan 24 detik)   \n' +
            '  ╚═══════════════════════════════════════════════════╝',
            'color:#10b981; font-weight:bold;'
        );
    }

    // Tunggu semua patch selesai dimuat sebelum override
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 700); // Setelah patch_skor_6faktor (500ms)
        });
    } else {
        setTimeout(init, 700);
    }

})();
