/**
 * ============================================================
 *  patch_riwayat_analisis.js
 *  Versi: 1.0 — Pencatatan Riwayat Otomatis Semua Hasil Analisis
 * ------------------------------------------------------------
 *  FUNGSI UTAMA:
 *  Patch ini melengkapi sistem riwayat yang sudah ada di
 *  patch_smartfarming.js & patch_riwayat_tambahan.js dengan
 *  menambahkan pencatatan otomatis untuk 3 mode yang BELUM
 *  dicatat sama sekali:
 *
 *  [A] Mode JADWAL TANAM (prosesJadwalOtomatis)
 *      – Mencatat musim utama & gadu, tanggal tanam, varietas,
 *        zona iklim, dan kondisi ENSO/IOD.
 *      – Dipicu setelah teksEl.innerHTML berisi output renderOutput.
 *
 *  [B] Mode CUACA (fetchDataCuaca / renderSemuaRisikoGPS)
 *      – Mencatat kondisi cuaca terkini: suhu, kelembapan, hujan,
 *        angin, dan nama lokasi.
 *      – Dipicu saat data cuaca berhasil dirender.
 *      – (mode 'cuaca' sengaja dikecualikan di patch_smartfarming;
 *        patch ini mengisinya secara eksplisit.)
 *
 *  [C] Mode RISIKO IKLIM (renderSemuaRisikoGPS)
 *      – Mencatat ringkasan risiko penyakit & hama per sesi
 *        setelah GPS disinkronkan.
 *      – Satu sesi GPS = satu entri riwayat.
 *
 *  CATATAN ARSITEKTUR:
 *  – Patch ini TIDAK mengubah fungsi asli dengan cara merusak.
 *    Semua pencatatan menggunakan teknik intercept/wrap aman.
 *  – Bergantung pada window.tambahRiwayat dari patch_smartfarming.js.
 *    Jika belum tersedia, patch menunggu via polling.
 *  – Menggunakan debounce & flag one-shot agar riwayat tidak
 *    tercatat ganda dalam satu sesi analisis.
 *
 *  CARA PASANG (urutan wajib):
 *    <script src="patch_smartfarming.js"></script>
 *    <script src="patch_riwayat_tambahan.js"></script>
 *    <script src="patch_cuaca_langsung.js"></script>
 *    <script src="patch_jadwal_tanam_otomatis.js"></script>
 *    <script src="patch_deteksi_musim_v1.js"></script>
 *    <script src="patch_jadwal_manual_trigger.js"></script>
 *    <script src="patch_riwayat_analisis.js"></script>   ← file ini
 *    <script src="patch_perbaikan_kontras.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    /* ─────────────────────────────────────────────────────────
       HELPER: Tunggu hingga fungsi/window tersedia
    ───────────────────────────────────────────────────────── */
    function tunggu(namaFn, cb, maxRetry, jedaMs) {
        maxRetry = maxRetry || 60;
        jedaMs   = jedaMs   || 200;
        var n = 0;
        var t = setInterval(function () {
            n++;
            if (typeof window[namaFn] === 'function') {
                clearInterval(t);
                cb();
            } else if (n >= maxRetry) {
                clearInterval(t);
                console.warn('[patch_riwayat_analisis] Fungsi ' + namaFn + ' tidak ditemukan setelah ' + maxRetry + ' percobaan.');
            }
        }, jedaMs);
    }

    /* ─────────────────────────────────────────────────────────
       HELPER: Baca teks elemen DOM dengan aman
    ───────────────────────────────────────────────────────── */
    function teksEl(id, maxLen) {
        var el = document.getElementById(id);
        if (!el) return '-';
        var t = (el.innerText || el.textContent || '').trim();
        return maxLen ? t.substring(0, maxLen) : t;
    }

    /* ─────────────────────────────────────────────────────────
       HELPER: Ambil nama lahan aktif
    ───────────────────────────────────────────────────────── */
    function namaLahanAktif() {
        try {
            if (typeof window.getLahanAktif === 'function') {
                var l = window.getLahanAktif();
                return l ? l.nama : 'Tidak ada lahan aktif';
            }
        } catch (e) {}
        return 'Tidak ada lahan aktif';
    }

    /* ═══════════════════════════════════════════════════════════
       [A] RIWAYAT JADWAL TANAM
           Intercept prosesJadwalOtomatis melalui observasi DOM
           pada #jtoTeks yang diisi oleh renderOutput().
    ═══════════════════════════════════════════════════════════ */
    function pasangRiwayatJadwalTanam() {
        /* Strategi: wrap window.prosesJadwalOtomatis tidak bisa
           langsung karena fungsi itu bersifat lokal (closure)
           di dalam IIFE patch_jadwal_tanam_otomatis.js.
           Solusi: observe #jtoTeks dengan MutationObserver,
           lalu ekstrak data dari DOM yang sudah dirender. */

        var _sudahCatat = false;  // flag one-shot per sesi analisis

        /* Reset flag saat tombol ditekan (sesi baru) */
        document.addEventListener('click', function (e) {
            if (e.target && e.target.id === 'btnJadwalOtomatis') {
                _sudahCatat = false;
            }
        }, true);

        /* Observer pada #jtoTeks */
        var jtoTeks = document.getElementById('jtoTeks');
        if (!jtoTeks) {
            /* jtoTeks belum ada (box belum diinjeksi) — tunggu */
            var pollingJTO = setInterval(function () {
                jtoTeks = document.getElementById('jtoTeks');
                if (jtoTeks) {
                    clearInterval(pollingJTO);
                    mulaiObserveJTO(jtoTeks);
                }
            }, 500);
        } else {
            mulaiObserveJTO(jtoTeks);
        }

        function mulaiObserveJTO(elTarget) {
            var observer = new MutationObserver(function (mutList) {
                /* Abaikan jika teks kosong atau sudah dicatat */
                if (_sudahCatat) return;
                var html = elTarget.innerHTML || '';
                if (html.trim() === '') return;
                /* Abaikan pesan error */
                if (html.indexOf('Gagal membuat jadwal') !== -1) return;

                /* Beri jeda agar render selesai penuh */
                setTimeout(function () {
                    if (_sudahCatat) return;
                    catatRiwayatJadwalTanam();
                    _sudahCatat = true;
                }, 600);
            });
            observer.observe(elTarget, { childList: true, subtree: false });
            console.log('[patch_riwayat_analisis] Observer JTO aktif.');
        }

        function catatRiwayatJadwalTanam() {
            /* Ambil data dari elemen yang dirender renderOutput() */
            var jtoEl = document.getElementById('jtoTeks');
            if (!jtoEl) return;

            /* Ekstrak info zona & ENSO/IOD dari boks pertama */
            var semuaTeks = jtoEl.innerText || '';

            /* Coba ambil data terstruktur dari window._jtoData
               (di-set oleh renderOutput: window._jtoData = multiJadwal) */
            var ringkasanMusim = [];
            try {
                var jtoData = window._jtoData;
                if (Array.isArray(jtoData) && jtoData.length > 0) {
                    jtoData.forEach(function (jadwal) {
                        var rek = jadwal.rekomendasi;
                        var tgl = rek.tglTanam
                            ? rek.tglTanam.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '-';
                        ringkasanMusim.push(
                            rek.musimNama + ': ' + tgl +
                            ' | Varietas: ' + (rek.labelVar || '-')
                        );
                    });
                }
            } catch (e) {}

            /* Fallback: ambil dari teks DOM jika _jtoData kosong */
            if (ringkasanMusim.length === 0) {
                /* Ambil baris yang mengandung nama musim */
                semuaTeks.split('\n').forEach(function (baris) {
                    baris = baris.trim();
                    if (baris.indexOf('MUSIM') !== -1 || baris.indexOf('Rendeng') !== -1 || baris.indexOf('Gadu') !== -1) {
                        if (baris.length < 80) ringkasanMusim.push(baris);
                    }
                });
            }

            var label    = '📅 Jadwal Tanam Otomatis';
            var ringkasan = ringkasanMusim.length > 0
                ? ringkasanMusim.join(' | ')
                : 'Jadwal dibuat berdasarkan data ENSO/IOD & ZOM BMKG lokal.';

            /* Potong agar tidak melebihi 200 karakter */
            ringkasan = ringkasan.substring(0, 200);

            if (typeof window.tambahRiwayat === 'function') {
                window.tambahRiwayat('jadwaltanam', label, ringkasan);
                console.log('%c📅 [patch_riwayat_analisis] Riwayat Jadwal Tanam dicatat.', 'color:#06b6d4;font-weight:bold;');
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════
       [B] RIWAYAT CUACA
           Intercept melalui MutationObserver pada #suhuNow
           (elemen yang paling cepat diisi setelah fetch selesai).
    ═══════════════════════════════════════════════════════════ */
    function pasangRiwayatCuaca() {
        var _sudahCatat  = false;
        var _debounce    = null;

        /* Reset flag saat switchMode('cuaca') */
        var _switchModeAsli = window.switchMode;
        if (typeof _switchModeAsli === 'function') {
            window.switchMode = function (mode) {
                if (mode === 'cuaca') _sudahCatat = false;
                _switchModeAsli.apply(this, arguments);
            };
        }

        /* Tunggu elemen #suhuNow tersedia */
        var pollingCuaca = setInterval(function () {
            var suhuEl = document.getElementById('suhuNow');
            if (suhuEl) {
                clearInterval(pollingCuaca);
                mulaiObserveCuaca(suhuEl);
            }
        }, 500);

        function mulaiObserveCuaca(suhuEl) {
            var observer = new MutationObserver(function () {
                var suhu = (suhuEl.innerText || suhuEl.textContent || '').trim();
                if (!suhu || suhu === '-' || suhu === '--') return;
                if (_sudahCatat) return;

                if (_debounce) clearTimeout(_debounce);
                _debounce = setTimeout(function () {
                    if (_sudahCatat) return;
                    /* Hanya catat jika mode cuaca aktif */
                    if (typeof window.currentMode !== 'undefined' && window.currentMode !== 'cuaca') return;
                    catatRiwayatCuaca();
                    _sudahCatat = true;
                }, 1200);  /* 1.2s: tunggu semua widget cuaca selesai */
            });
            observer.observe(suhuEl, { childList: true, characterData: true, subtree: true });
            console.log('[patch_riwayat_analisis] Observer Cuaca aktif.');
        }

        function catatRiwayatCuaca() {
            var suhu     = teksEl('suhuNow',     20);
            var humid    = teksEl('humidityNow', 20);
            var angin    = teksEl('windNow',     20);
            var hujan    = teksEl('rainNow',     20);
            var namaLok  = teksEl('namaLokasiCuacaUI', 40);

            /* Abaikan jika data belum terisi */
            if (suhu === '-' || suhu === '' || suhu === '--') return;

            var label    = '🌤️ Cuaca — ' + (namaLok !== '-' ? namaLok : 'Lokasi Aktif');
            var ringkasan =
                'Suhu: ' + suhu +
                ' | Kelembapan: ' + humid +
                ' | Angin: ' + angin +
                ' | Hujan: ' + hujan +
                ' | Lokasi: ' + namaLok;

            if (typeof window.tambahRiwayat === 'function') {
                window.tambahRiwayat('cuaca', label, ringkasan);
                console.log('%c🌤️ [patch_riwayat_analisis] Riwayat Cuaca dicatat.', 'color:#3b82f6;font-weight:bold;');
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════
       [C] RIWAYAT RISIKO IKLIM (Penyakit & Hama setelah GPS)
           Intercept window.renderSemuaRisikoGPS.
    ═══════════════════════════════════════════════════════════ */
    function pasangRiwayatRisikoIklim() {
        tunggu('renderSemuaRisikoGPS', function () {

            var _renderAsli = window.renderSemuaRisikoGPS;

            window.renderSemuaRisikoGPS = function (cur, dp) {
                /* Jalankan fungsi asli dulu */
                _renderAsli.apply(this, arguments);

                /* Beri jeda agar DOM penyakit/hama selesai dirender */
                setTimeout(function () {
                    catatRiwayatRisiko(cur);
                }, 1000);
            };

            console.log('[patch_riwayat_analisis] Intercept renderSemuaRisikoGPS aktif.');
        });
    }

    function catatRiwayatRisiko(cur) {
        /* Kumpulkan semua box risiko yang dirender */
        var weatherData = document.getElementById('weatherData');
        if (!weatherData) return;

        /* Ambil data cuaca dasar */
        var suhu    = cur && cur.temperature_2m    ? cur.temperature_2m + '°C' : '-';
        var humid   = cur && cur.relative_humidity_2m ? cur.relative_humidity_2m + '%' : '-';
        var hujan   = cur && cur.rain !== undefined ? cur.rain + ' mm' : '-';
        var namaLok = teksEl('namaLokasiCuacaUI', 40);

        /* Kumpulkan judul risiko dari info-box yang terrender */
        var judulRisiko = [];
        weatherData.querySelectorAll('.info-box-risiko').forEach(function (el) {
            /* Ambil teks pertama (judul/heading box risiko) */
            var judulEl = el.querySelector('b, strong, [style*="font-weight:700"]');
            if (judulEl) {
                var t = (judulEl.innerText || '').trim();
                if (t && t.length < 60) judulRisiko.push(t);
            }
        });

        /* Juga cek boxBlastRisk */
        var boxBlast = document.getElementById('boxBlastRisk');
        if (boxBlast && boxBlast.style.display !== 'none') {
            judulRisiko.unshift('Blast Padi (teranalisis)');
        }

        var label    = '🌡️ Risiko Iklim & Penyakit — ' + (namaLok !== '-' ? namaLok : 'GPS Aktif');
        var ringkasan =
            'Suhu: ' + suhu + ' | Humid: ' + humid + ' | Hujan: ' + hujan +
            (judulRisiko.length > 0
                ? ' | Risiko: ' + judulRisiko.slice(0, 3).join(', ')
                : ' | Semua risiko teranalisis');

        if (typeof window.tambahRiwayat === 'function') {
            window.tambahRiwayat('risiko', label, ringkasan);
            console.log('%c🌡️ [patch_riwayat_analisis] Riwayat Risiko Iklim dicatat.', 'color:#f59e0b;font-weight:bold;');
        }
    }

    /* ═══════════════════════════════════════════════════════════
       EKSTENSI renderDaftarRiwayat:
       Tambahkan ikon & warna border untuk mode baru
       (jadwaltanam & risiko) yang belum ada di patch_smartfarming
    ═══════════════════════════════════════════════════════════ */
    function patchRenderDaftarRiwayat() {
        tunggu('renderDaftarRiwayat', function () {

            /* CSS border warna untuk mode baru */
            var style = document.createElement('style');
            style.textContent =
                '.riwayat-item.mode-jadwaltanam { border-left-color: #06b6d4 !important; }' +
                '.riwayat-item.mode-risiko       { border-left-color: #f59e0b !important; }' +
                '.riwayat-item.mode-cuaca        { border-left-color: #60a5fa !important; }';
            document.head.appendChild(style);

            var _renderAsli = window.renderDaftarRiwayat;

            window.renderDaftarRiwayat = function () {
                /* Jalankan render asli */
                _renderAsli.apply(this, arguments);

                /* Patch ikon untuk mode baru di DOM yang baru dirender */
                var container = document.getElementById('daftarRiwayat');
                if (!container) return;

                var ikonTambahan = {
                    jadwaltanam: '📅',
                    risiko:      '🌡️',
                    cuaca:       '🌤️'  /* override ikon default 📊 */
                };

                container.querySelectorAll('.riwayat-item').forEach(function (el) {
                    Object.keys(ikonTambahan).forEach(function (mode) {
                        if (!el.classList.contains('mode-' + mode)) return;
                        var labelEl = el.querySelector('.riwayat-label');
                        if (!labelEl) return;
                        /* Ganti ikon 📊 default (yang dipakai untuk mode tidak dikenal) */
                        if (labelEl.textContent.indexOf('📊') !== -1) {
                            labelEl.innerHTML = labelEl.innerHTML.replace('📊', ikonTambahan[mode]);
                        }
                    });
                });
            };

            /* Trigger ulang render agar ikon terbaru langsung tampil
               jika panel riwayat sedang terbuka */
            var panelRiwayat = document.getElementById('panelRiwayat');
            if (panelRiwayat && panelRiwayat.style.display !== 'none') {
                window.renderDaftarRiwayat();
            }

            console.log('[patch_riwayat_analisis] renderDaftarRiwayat diperluas (jadwaltanam, risiko, cuaca).');
        });
    }

    /* ═══════════════════════════════════════════════════════════
       INISIALISASI SEMUA MODUL
    ═══════════════════════════════════════════════════════════ */
    function init() {
        /* Tunggu tambahRiwayat tersedia sebelum pasang semua intercept */
        tunggu('tambahRiwayat', function () {
            pasangRiwayatJadwalTanam();
            pasangRiwayatCuaca();
            pasangRiwayatRisikoIklim();
            patchRenderDaftarRiwayat();

            console.log(
                '%c✅ patch_riwayat_analisis.js v1.0 aktif — ' +
                'Jadwal Tanam, Cuaca, Risiko Iklim kini dicatat ke riwayat',
                'color:#06b6d4; font-weight:bold;'
            );
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 200);
        });
    } else {
        setTimeout(init, 200);
    }

})();
