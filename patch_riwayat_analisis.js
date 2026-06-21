/**
 * ============================================================
 *  patch_riwayat_analisis.js
 *  Versi: 2.0 — Fix: renderSemuaRisikoGPS tidak di-export ke window
 * ------------------------------------------------------------
 *  PERUBAHAN v2.0 vs v1.0:
 *
 *  [FIX-KRITIS] pasangRiwayatRisikoIklim() sebelumnya memanggil
 *   tunggu('renderSemuaRisikoGPS', ...) yang selalu timeout karena
 *   fungsi itu private di dalam IIFE patch_cuaca_langsung.js —
 *   tidak pernah di-assign ke window.
 *
 *   Solusi: ganti dengan MutationObserver pada #weatherData.
 *   Observer mendeteksi kemunculan elemen .info-box-risiko
 *   (yang dirender oleh renderSemuaRisikoGPS) tanpa perlu
 *   mengakses fungsi tersebut secara langsung.
 *   Ini lebih robust: bekerja di semua versi patch cuaca.
 *
 *  [FIX-MINOR] pasangRiwayatCuaca() sebelumnya wrap window.switchMode
 *   yang sudah di-wrap oleh patch_cuaca_langsung — bisa bentrok.
 *   Sekarang menggunakan MutationObserver pada #suhuNow saja.
 *
 *  CARA PASANG (tidak berubah dari v1.0):
 *    <script src="patch_smartfarming.js"></script>
 *    <script src="patch_riwayat_tambahan.js"></script>
 *    <script src="patch_cuaca_langsung.js"></script>
 *    <script src="patch_jadwal_tanam_otomatis.js"></script>
 *    <script src="patch_deteksi_musim_v1.js"></script>
 *    <script src="patch_jadwal_manual_trigger.js"></script>
 *    <script src="patch_riwayat_analisis.js"></script>   ← file ini
 *    <script src="patch_iklim_terpadu_v1.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    /* ─────────────────────────────────────────────────────────
       HELPER: Tunggu hingga fungsi window tersedia
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
                console.warn(
                    '[patch_riwayat_analisis] Fungsi ' + namaFn +
                    ' tidak ditemukan setelah ' + maxRetry + ' percobaan.'
                );
            }
        }, jedaMs);
    }

    /* ─────────────────────────────────────────────────────────
       HELPER: Tunggu elemen DOM muncul (polling)
    ───────────────────────────────────────────────────────── */
    function tungguEl(id, cb, maxMs) {
        maxMs = maxMs || 15000;
        var mulai = Date.now();
        var t = setInterval(function () {
            var el = document.getElementById(id);
            if (el) {
                clearInterval(t);
                cb(el);
            } else if (Date.now() - mulai > maxMs) {
                clearInterval(t);
            }
        }, 300);
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

    /* ═══════════════════════════════════════════════════════════
       [A] RIWAYAT JADWAL TANAM
           Observer pada #jtoTeks — tidak berubah dari v1.0
    ═══════════════════════════════════════════════════════════ */
    function pasangRiwayatJadwalTanam() {
        var _sudahCatat = false;

        document.addEventListener('click', function (e) {
            if (e.target && e.target.id === 'btnJadwalOtomatis') {
                _sudahCatat = false;
            }
        }, true);

        function mulaiObserveJTO(elTarget) {
            var observer = new MutationObserver(function () {
                if (_sudahCatat) return;
                var html = elTarget.innerHTML || '';
                if (html.trim() === '') return;
                if (html.indexOf('Gagal') !== -1) return;

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
            var jtoEl = document.getElementById('jtoTeks');
            if (!jtoEl) return;

            var ringkasanMusim = [];
            try {
                var jtoData = window._jtoData;
                if (Array.isArray(jtoData) && jtoData.length > 0) {
                    jtoData.forEach(function (jadwal) {
                        var rek = jadwal.rekomendasi;
                        var tgl = rek.tglTanam
                            ? rek.tglTanam.toLocaleDateString('id-ID', {
                                day: 'numeric', month: 'short', year: 'numeric'
                              })
                            : '-';
                        ringkasanMusim.push(
                            rek.musimNama + ': ' + tgl +
                            ' | Varietas: ' + (rek.labelVar || '-')
                        );
                    });
                }
            } catch (e) {}

            if (ringkasanMusim.length === 0) {
                (jtoEl.innerText || '').split('\n').forEach(function (baris) {
                    baris = baris.trim();
                    if ((baris.indexOf('MUSIM') !== -1 ||
                         baris.indexOf('Rendeng') !== -1 ||
                         baris.indexOf('Gadu') !== -1) && baris.length < 80) {
                        ringkasanMusim.push(baris);
                    }
                });
            }

            var label    = '📅 Jadwal Tanam Otomatis';
            var ringkasan = (ringkasanMusim.length > 0
                ? ringkasanMusim.join(' | ')
                : 'Jadwal dibuat berdasarkan data ENSO/IOD & ZOM BMKG lokal.'
            ).substring(0, 200);

            if (typeof window.tambahRiwayat === 'function') {
                window.tambahRiwayat('jadwaltanam', label, ringkasan);
                console.log('%c📅 [patch_riwayat_analisis] Riwayat Jadwal Tanam dicatat.', 'color:#06b6d4;font-weight:bold;');
            }
        }

        tungguEl('jtoTeks', mulaiObserveJTO);
    }

    /* ═══════════════════════════════════════════════════════════
       [B] RIWAYAT CUACA
           Observer pada #suhuNow saja — tidak wrap switchMode
           agar tidak bentrok dengan patch_cuaca_langsung
    ═══════════════════════════════════════════════════════════ */
    function pasangRiwayatCuaca() {
        var _sudahCatat = false;
        var _debounce   = null;
        var _modeTerakhir = '';

        /* Deteksi pergantian mode lewat tab-btn klik */
        document.addEventListener('click', function (e) {
            if (e.target && e.target.classList.contains('tab-btn')) {
                /* Reset flag saat user berpindah ke tab cuaca */
                if (e.target.id === 'tabCuaca') {
                    _sudahCatat = false;
                }
            }
        }, true);

        function mulaiObserveCuaca(suhuEl) {
            var observer = new MutationObserver(function () {
                var suhu = (suhuEl.innerText || suhuEl.textContent || '').trim();
                if (!suhu || suhu === '-' || suhu.indexOf('--') !== -1) return;
                if (_sudahCatat) return;

                if (_debounce) clearTimeout(_debounce);
                _debounce = setTimeout(function () {
                    if (_sudahCatat) return;
                    /* Pastikan mode cuaca aktif dari DOM (bukan variabel JS) */
                    var tabAktif = document.querySelector('.tab-btn.active');
                    var modeAktif = tabAktif ? tabAktif.id.replace('tab','').toLowerCase() : '';
                    if (modeAktif !== 'cuaca') return;

                    catatRiwayatCuaca();
                    _sudahCatat = true;
                }, 1200);
            });
            observer.observe(suhuEl, { childList: true, characterData: true, subtree: true });
            console.log('[patch_riwayat_analisis] Observer Cuaca aktif.');
        }

        function catatRiwayatCuaca() {
            var suhu    = teksEl('suhuNow',     20);
            var humid   = teksEl('humidityNow', 20);
            var angin   = teksEl('windNow',     20);
            var hujan   = teksEl('rainNow',     20);
            var namaLok = teksEl('namaLokasiCuacaUI', 40);

            if (!suhu || suhu === '-') return;

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

        tungguEl('suhuNow', mulaiObserveCuaca);
    }

    /* ═══════════════════════════════════════════════════════════
       [C] RIWAYAT RISIKO IKLIM — VERSI BARU v2.0
           MASALAH LAMA: tunggu('renderSemuaRisikoGPS') selalu
           timeout karena fungsi itu private di IIFE
           patch_cuaca_langsung.js — tidak pernah ke window.

           SOLUSI BARU: MutationObserver pada #weatherData.
           Deteksi kemunculan .info-box-risiko (elemen yang
           dibuat oleh renderSemuaRisikoGPS) tanpa perlu
           akses ke fungsi tersebut secara langsung.
    ═══════════════════════════════════════════════════════════ */
    function pasangRiwayatRisikoIklim() {
        var _sudahCatat = false;
        var _debounce   = null;

        /* Reset saat tombol GPS ditekan ulang */
        document.addEventListener('click', function (e) {
            var id = e.target && e.target.id;
            if (id === 'btnGPSSinkron' || id === 'btnAktifkanGPS') {
                _sudahCatat = false;
            }
        }, true);

        function mulaiObserveRisiko(weatherDataEl) {
            var observer = new MutationObserver(function (mutList) {
                if (_sudahCatat) return;

                /* Cek apakah ada .info-box-risiko yang baru ditambahkan */
                var adaRisikoBar = false;
                mutList.forEach(function (mut) {
                    if (mut.type !== 'childList') return;
                    mut.addedNodes.forEach(function (node) {
                        if (node.nodeType !== 1) return;
                        if (node.classList && (
                            node.classList.contains('info-box-risiko') ||
                            node.classList.contains('info-box-dynamic')
                        )) {
                            adaRisikoBar = true;
                        }
                    });
                });

                if (!adaRisikoBar) return;

                /* Debounce: tunggu sampai semua box risiko selesai dirender */
                if (_debounce) clearTimeout(_debounce);
                _debounce = setTimeout(function () {
                    if (_sudahCatat) return;

                    /* Pastikan minimal 2 box risiko sudah ada (bukan hanya 1) */
                    var boxRisiko = weatherDataEl.querySelectorAll(
                        '.info-box-risiko, .info-box-dynamic'
                    );
                    if (boxRisiko.length < 2) return;

                    catatRiwayatRisiko(weatherDataEl);
                    _sudahCatat = true;
                }, 1500);
            });

            observer.observe(weatherDataEl, { childList: true, subtree: false });
            console.log('[patch_riwayat_analisis] Observer Risiko Iklim aktif (via MutationObserver).');
        }

        function catatRiwayatRisiko(weatherDataEl) {
            /* Baca data cuaca dari DOM — lebih andal dari meneruskan cur/dp */
            var suhu    = teksEl('suhuNow',     20);
            var humid   = teksEl('humidityNow', 20);
            var hujan   = teksEl('rainNow',     20);
            var namaLok = teksEl('namaLokasiCuacaUI', 40);

            /* Kumpulkan judul box risiko */
            var judulRisiko = [];
            weatherDataEl.querySelectorAll('.info-box-risiko, .info-box-dynamic').forEach(function (el) {
                var kuat = el.querySelector('strong');
                if (kuat) {
                    var t = (kuat.innerText || '').trim();
                    if (t && t.length < 60) judulRisiko.push(t);
                }
            });

            /* Cek Blast */
            var boxBlast = document.getElementById('boxBlastRisk');
            if (boxBlast && boxBlast.style.display !== 'none') {
                judulRisiko.unshift('⚠️ Blast Padi');
            }

            var label = '🌡️ Risiko Iklim — ' + (namaLok !== '-' ? namaLok : 'GPS Aktif');
            var ringkasan =
                'Suhu: ' + suhu +
                ' | Humid: ' + humid +
                ' | Hujan: ' + hujan +
                (judulRisiko.length > 0
                    ? ' | Risiko: ' + judulRisiko.slice(0, 3).join(', ')
                    : ' | Semua risiko teranalisis');

            ringkasan = ringkasan.substring(0, 220);

            if (typeof window.tambahRiwayat === 'function') {
                window.tambahRiwayat('risiko', label, ringkasan);
                console.log(
                    '%c🌡️ [patch_riwayat_analisis] Riwayat Risiko Iklim dicatat.',
                    'color:#f59e0b;font-weight:bold;'
                );
            }
        }

        tungguEl('weatherData', mulaiObserveRisiko);
    }

    /* ═══════════════════════════════════════════════════════════
       EKSTENSI renderDaftarRiwayat:
       Ikon & warna border untuk mode baru
    ═══════════════════════════════════════════════════════════ */
    function patchRenderDaftarRiwayat() {
        tunggu('renderDaftarRiwayat', function () {
            var style = document.createElement('style');
            style.textContent =
                '.riwayat-item.mode-jadwaltanam { border-left-color: #06b6d4 !important; }' +
                '.riwayat-item.mode-risiko       { border-left-color: #f59e0b !important; }' +
                '.riwayat-item.mode-cuaca        { border-left-color: #60a5fa !important; }';
            document.head.appendChild(style);

            var _renderAsli = window.renderDaftarRiwayat;
            window.renderDaftarRiwayat = function () {
                _renderAsli.apply(this, arguments);

                var container = document.getElementById('daftarRiwayat');
                if (!container) return;

                var ikonTambahan = { jadwaltanam: '📅', risiko: '🌡️', cuaca: '🌤️' };
                container.querySelectorAll('.riwayat-item').forEach(function (el) {
                    Object.keys(ikonTambahan).forEach(function (mode) {
                        if (!el.classList.contains('mode-' + mode)) return;
                        var labelEl = el.querySelector('.riwayat-label');
                        if (!labelEl) return;
                        if (labelEl.textContent.indexOf('📊') !== -1) {
                            labelEl.innerHTML = labelEl.innerHTML.replace('📊', ikonTambahan[mode]);
                        }
                    });
                });
            };

            var panelRiwayat = document.getElementById('panelRiwayat');
            if (panelRiwayat && panelRiwayat.style.display !== 'none') {
                window.renderDaftarRiwayat();
            }

            console.log('[patch_riwayat_analisis] renderDaftarRiwayat diperluas.');
        });
    }

    /* ═══════════════════════════════════════════════════════════
       INISIALISASI
    ═══════════════════════════════════════════════════════════ */
    function init() {
        tunggu('tambahRiwayat', function () {
            pasangRiwayatJadwalTanam();
            pasangRiwayatCuaca();
            pasangRiwayatRisikoIklim();
            patchRenderDaftarRiwayat();

            console.log(
                '%c✅ patch_riwayat_analisis.js v2.0 aktif\n' +
                '   [FIX] Risiko Iklim: MutationObserver (bukan tunggu renderSemuaRisikoGPS)\n' +
                '   [FIX] Cuaca: tidak wrap switchMode — deteksi via tab-btn DOM\n' +
                '   Jadwal Tanam, Cuaca, Risiko Iklim kini dicatat ke riwayat',
                'color:#06b6d4; font-weight:bold;'
            );
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 200); });
    } else {
        setTimeout(init, 200);
    }

})();
